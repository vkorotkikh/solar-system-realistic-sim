from __future__ import annotations

import asyncio
import json
import math
import threading

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from starlette.websockets import WebSocket

import server
from sim.rebound_nbody import (
    DAYS_PER_YEAR,
    J2000_JD,
    SEEK_EPSILON_YEARS,
    SUPPORTED_JD_MAX_TDB,
    SUPPORTED_JD_MIN_TDB,
    REBOUNDEngine,
    SeekCancelledError,
)

client = TestClient(server.app)


def _network_security_config(raw_key: str = "websocket-network-secret"):
    return server._load_solar_security_config(
        {
            "SOLAR_SECURITY_PROFILE": "network",
            "SOLAR_PHYSICS_API_KEYS": raw_key,
            "SOLAR_CORS_ALLOWED_ORIGINS": "http://localhost:5173",
        }
    )


class _CopyableSimulation:
    def __init__(self, engine: REBOUNDEngine | None = None) -> None:
        self.t = 0.0
        self.integrate_history: list[float] = []
        self._engine = engine

    def integrate(self, target: float) -> None:
        self.integrate_history.append(float(target))
        self.t = float(target)
        if self._engine is not None:
            self._engine.cancel_pending_operation()

    def copy(self) -> "_CopyableSimulation":
        copied = _CopyableSimulation()
        copied.t = self.t
        copied.integrate_history = list(self.integrate_history)
        return copied


def test_rebound_epoch_contract_matches_committed_accuracy_envelope() -> None:
    engine = REBOUNDEngine()

    assert engine.supported_jd_range == (
        SUPPORTED_JD_MIN_TDB,
        SUPPORTED_JD_MAX_TDB,
    )
    assert engine._validate_supported_jd(SUPPORTED_JD_MIN_TDB) == SUPPORTED_JD_MIN_TDB
    assert engine._validate_supported_jd(SUPPORTED_JD_MAX_TDB) == SUPPORTED_JD_MAX_TDB

    for invalid in (
        SUPPORTED_JD_MIN_TDB - 1e-6,
        SUPPORTED_JD_MAX_TDB + 1e-6,
        math.inf,
        math.nan,
    ):
        with pytest.raises(ValueError):
            engine.set_julian_date(invalid)


def test_rebound_checkpoint_storage_is_bounded() -> None:
    engine = REBOUNDEngine(checkpoint_limit=3)
    simulation = _CopyableSimulation()
    engine.sim = simulation

    for checkpoint_index in range(6):
        simulation.t = checkpoint_index * engine._checkpoint_interval_years
        engine._store_checkpoint()

    assert list(engine._checkpoints) == [3, 4, 5]
    assert len(engine._checkpoints) == 3


def test_rebound_seek_observes_cancellation_between_segments() -> None:
    engine = REBOUNDEngine()
    simulation = _CopyableSimulation(engine)
    engine.sim = simulation
    engine._stored_bodies = [{"id": "sun"}]

    target_jd = J2000_JD + (30.0 * DAYS_PER_YEAR)
    with pytest.raises(SeekCancelledError):
        engine.set_julian_date(target_jd)

    assert simulation.integrate_history == [10.0]
    assert simulation.t == 10.0
    assert abs(simulation.t - 30.0) > SEEK_EPSILON_YEARS


def test_runner_rejects_out_of_range_epoch_without_latching_runtime_error() -> None:
    class _BoundedEngine:
        supported_jd_range = (100.0, 200.0)

        def __init__(self) -> None:
            self.jd = 150.0
            self.seek_calls: list[float] = []

        def get_state(self):
            return {"jd": self.jd, "jd_time_scale": "TDB", "bodies": {}}

        def get_julian_date(self):
            return self.jd

        def set_julian_date(self, jd):
            self.seek_calls.append(float(jd))

    engine = _BoundedEngine()
    runner = server.SimulationRunner(engine)  # Worker intentionally not started.
    runner._handle_command(
        {"type": "set_julian_date", "jd": 201.0, "jd_time_scale": "TDB"}
    )

    response = runner.get_response()
    assert response is not None
    assert response["code"] == "epoch_out_of_range"
    assert engine.seek_calls == []
    assert runner._runtime_error is None
    assert runner.paused is False


def test_websocket_admission_is_bounded_and_reusable(monkeypatch) -> None:
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())

    first_lease = server._try_acquire_ws_sim_slot()
    assert first_lease is not None
    assert server._ws_sim_active_connections == 1
    assert server._try_acquire_ws_sim_slot() is None

    server._release_ws_sim_slot(first_lease)
    assert server._ws_sim_active_connections == 0
    second_lease = server._try_acquire_ws_sim_slot()
    assert second_lease is not None
    server._release_ws_sim_slot(second_lease)


def test_websocket_engine_setup_runs_off_event_loop_before_worker_handoff(
    monkeypatch,
) -> None:
    setup_calls: dict[str, tuple[bool, int]] = {}

    def record_first_call(name: str) -> None:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            on_event_loop = False
        else:
            on_event_loop = True
        setup_calls.setdefault(name, (on_event_loop, threading.get_ident()))

    class _ProbeEngine(REBOUNDEngine):
        def __init__(self, *args, **kwargs):
            record_first_call("construct")
            super().__init__(*args, **kwargs)

        def initialize(self, bodies, **kwargs):
            record_first_call("initialize")
            return super().initialize(bodies, **kwargs)

        def get_state(self):
            record_first_call("get_state")
            return super().get_state()

        def list_body_ids(self):
            record_first_call("list_body_ids")
            return super().list_body_ids()

        def get_julian_date(self):
            record_first_call("get_julian_date")
            return super().get_julian_date()

    monkeypatch.setattr(server, "REBOUNDEngine", _ProbeEngine)
    with client.websocket_connect("/ws/sim?engine=rebound") as websocket:
        assert websocket.receive_json()["type"] == "connected"

    assert set(setup_calls) == {
        "construct", "initialize", "get_state", "list_body_ids", "get_julian_date",
    }
    assert all(not on_event_loop for on_event_loop, _ in setup_calls.values())
    assert len({thread_id for _, thread_id in setup_calls.values()}) == 1


def test_websocket_cancelled_initialization_retains_admission_until_worker_exits(
    monkeypatch,
) -> None:
    entered = threading.Event()
    release = threading.Event()
    exited = threading.Event()
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())

    class _BlockedEngine(REBOUNDEngine):
        def initialize(self, bodies, **kwargs):
            entered.set()
            try:
                assert release.wait(timeout=5), "initialization was never released"
                raise RuntimeError("initialization failed after cancellation")
            finally:
                exited.set()

    monkeypatch.setattr(server, "REBOUNDEngine", _BlockedEngine)
    websocket, sent = _scope_websocket([])

    async def exercise() -> None:
        session = asyncio.create_task(server.simulation_websocket(websocket))
        try:
            assert await asyncio.to_thread(entered.wait, 2)
            for _ in range(2):
                session.cancel()
                await asyncio.sleep(0)
                await asyncio.sleep(0)
                assert not session.done()
                assert server._ws_sim_active_connections == 1
                assert server._try_acquire_ws_sim_slot() is None
        finally:
            release.set()
            with pytest.raises(asyncio.CancelledError):
                await session
        assert exited.is_set()
        assert server._ws_sim_active_connections == 0
        assert server._ws_sim_active_leases == set()
        replacement = server._try_acquire_ws_sim_slot()
        assert replacement is not None
        server._release_ws_sim_slot(replacement)

    asyncio.run(exercise())
    assert sent == [{"type": "websocket.accept", "subprotocol": None, "headers": []}]


def test_websocket_admission_preserves_global_cap_with_per_subject_fairness(
    monkeypatch,
) -> None:
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(4))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())
    monkeypatch.setattr(server, "WS_SIM_PER_SUBJECT_CONNECTION_LIMIT", 2)
    subject_a = f"credential:sha256:{'a' * 64}"
    subject_b = f"credential:sha256:{'b' * 64}"

    a_leases = [
        server._try_acquire_ws_sim_slot(subject_a),
        server._try_acquire_ws_sim_slot(subject_a),
    ]
    assert all(lease is not None for lease in a_leases)
    assert server._try_acquire_ws_sim_slot(subject_a) is None

    b_leases = [
        server._try_acquire_ws_sim_slot(subject_b),
        server._try_acquire_ws_sim_slot(subject_b),
    ]
    assert all(lease is not None for lease in b_leases)
    assert server._try_acquire_ws_sim_slot(f"credential:sha256:{'c' * 64}") is None
    assert server._ws_sim_active_connections == 4
    assert server._ws_sim_active_connections_by_subject == {
        subject_a: 2,
        subject_b: 2,
    }
    assert len(server._ws_sim_active_leases) == 4

    server._release_ws_sim_slot(a_leases[0])
    replacement = server._try_acquire_ws_sim_slot(subject_a)
    assert replacement is not None

    for lease in [a_leases[1], replacement, *b_leases]:
        server._release_ws_sim_slot(lease)
    assert server._ws_sim_active_connections == 0
    assert server._ws_sim_active_connections_by_subject == {}
    assert server._ws_sim_active_leases == set()


def test_websocket_admission_lease_cannot_release_another_connection(
    monkeypatch,
) -> None:
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(2))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())
    monkeypatch.setattr(server, "WS_SIM_PER_SUBJECT_CONNECTION_LIMIT", 2)
    subject = f"credential:sha256:{'a' * 64}"
    first = server._try_acquire_ws_sim_slot(subject)
    second = server._try_acquire_ws_sim_slot(subject)
    assert first is not None
    assert second is not None

    server._release_ws_sim_slot(first)
    with pytest.raises(RuntimeError, match="lease"):
        server._release_ws_sim_slot(first)

    assert server._ws_sim_active_connections == 1
    assert server._ws_sim_active_connections_by_subject == {subject: 1}
    assert server._ws_sim_active_leases == {second}
    server._release_ws_sim_slot(second)


@pytest.mark.parametrize(
    ("origin", "expected"),
    [
        (None, True),
        ("http://localhost:5173", True),
        ("https://attacker.invalid", False),
    ],
)
def test_websocket_origin_policy(origin: str | None, expected: bool) -> None:
    class _Socket:
        headers = {} if origin is None else {"origin": origin}
        scope = {
            "headers": []
            if origin is None
            else [(b"origin", origin.encode("ascii"))]
        }

    assert server._websocket_origin_allowed(_Socket()) is expected


def _scope_websocket(headers: list[tuple[bytes, bytes]]) -> tuple[WebSocket, list[dict]]:
    sent: list[dict] = []

    async def receive():
        return {"type": "websocket.connect"}

    async def send(message) -> None:
        sent.append(message)

    scope = {
        "type": "websocket",
        "asgi": {"spec_version": "2.4", "version": "3.0"},
        "http_version": "1.1",
        "scheme": "ws",
        "path": "/ws/sim",
        "raw_path": b"/ws/sim",
        "query_string": b"",
        "headers": headers,
        "client": ("198.51.100.10", 43100),
        "server": ("backend.internal", 8042),
        "subprotocols": [],
        "state": {},
    }
    return WebSocket(scope, receive, send), sent


def test_network_websocket_rejects_duplicate_origin_before_admission(
    monkeypatch,
) -> None:
    raw_key = "duplicate-origin-secret"
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        _network_security_config(raw_key),
    )

    def unexpected_admission(*_args):
        raise AssertionError("duplicate Origin reached WebSocket admission")

    monkeypatch.setattr(server, "_try_acquire_ws_sim_slot", unexpected_admission)
    websocket, sent = _scope_websocket(
        [
            (b"x-api-key", raw_key.encode("ascii")),
            (b"origin", b"http://localhost:5173"),
            (b"origin", b"https://attacker.invalid"),
        ]
    )

    asyncio.run(server.simulation_websocket(websocket))

    assert sent == [
        {
            "type": "websocket.close",
            "code": 1008,
            "reason": "WebSocket origin is not allowed",
        }
    ]


def test_network_websocket_rejects_oversized_origin_before_admission(
    monkeypatch,
) -> None:
    raw_key = "oversized-origin-secret"
    oversized_origin = "https://" + (
        "a" * (server.SOLAR_CORS_ORIGIN_MAX_BYTES - len("https://") + 1)
    )
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        _network_security_config(raw_key),
    )
    monkeypatch.setattr(
        server,
        "WS_SIM_ALLOWED_ORIGINS",
        frozenset({oversized_origin}),
    )

    def unexpected_admission(*_args):
        raise AssertionError("oversized Origin reached WebSocket admission")

    monkeypatch.setattr(server, "_try_acquire_ws_sim_slot", unexpected_admission)
    websocket, sent = _scope_websocket(
        [
            (b"x-api-key", raw_key.encode("ascii")),
            (b"origin", oversized_origin.encode("ascii")),
        ]
    )

    asyncio.run(server.simulation_websocket(websocket))

    assert sent == [
        {
            "type": "websocket.close",
            "code": 1008,
            "reason": "WebSocket origin is not allowed",
        }
    ]


def test_websocket_endpoint_rejects_hostile_origin_before_engine_setup(monkeypatch) -> None:
    readiness_called = False

    def unexpected_readiness():
        nonlocal readiness_called
        readiness_called = True
        raise AssertionError("engine readiness ran before origin rejection")

    monkeypatch.setattr(server, "_rebound_readiness", unexpected_readiness)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/ws/sim",
            headers={"origin": "https://attacker.invalid"},
        ):
            pass

    assert exc_info.value.code == 1008
    assert readiness_called is False


def test_websocket_endpoint_rejects_capacity_before_engine_setup(monkeypatch) -> None:
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())
    held_lease = server._try_acquire_ws_sim_slot()
    assert held_lease is not None

    readiness_called = False

    def unexpected_readiness():
        nonlocal readiness_called
        readiness_called = True
        raise AssertionError("engine readiness ran before capacity rejection")

    monkeypatch.setattr(server, "_rebound_readiness", unexpected_readiness)
    try:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/ws/sim"):
                pass
        assert exc_info.value.code == 1013
        assert readiness_called is False
    finally:
        server._release_ws_sim_slot(held_lease)


def test_network_websocket_rejects_missing_header_auth_before_admission(
    monkeypatch,
) -> None:
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", _network_security_config())
    admission_called = False
    readiness_called = False

    def unexpected_admission(*_args):
        nonlocal admission_called
        admission_called = True
        raise AssertionError("WebSocket admission ran before authentication")

    def unexpected_readiness():
        nonlocal readiness_called
        readiness_called = True
        raise AssertionError("engine readiness ran before authentication")

    monkeypatch.setattr(server, "_try_acquire_ws_sim_slot", unexpected_admission)
    monkeypatch.setattr(server, "_rebound_readiness", unexpected_readiness)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/ws/sim",
            headers={"origin": "http://localhost:5173"},
        ):
            pass

    assert exc_info.value.code == 1008
    assert admission_called is False
    assert readiness_called is False


def test_network_websocket_accepts_gateway_header_before_capacity_check(
    monkeypatch,
) -> None:
    raw_key = "gateway-injected-websocket-secret"
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        _network_security_config(raw_key),
    )
    admission_subjects: list[str | None] = []

    def saturated_admission(subject: str | None = None):
        admission_subjects.append(subject)
        return None

    monkeypatch.setattr(server, "_try_acquire_ws_sim_slot", saturated_admission)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/ws/sim",
            headers={
                "origin": "http://localhost:5173",
                "x-api-key": raw_key,
            },
        ):
            pass

    assert exc_info.value.code == 1013
    assert len(admission_subjects) == 1
    assert admission_subjects[0] is not None
    assert admission_subjects[0].startswith("credential:sha256:")
    assert raw_key not in admission_subjects[0]


def test_network_websocket_releases_the_exact_subject_lease_on_failure(
    monkeypatch,
) -> None:
    raw_key = "exact-release-websocket-secret"
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        _network_security_config(raw_key),
    )
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(2))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())
    monkeypatch.setattr(server, "WS_SIM_PER_SUBJECT_CONNECTION_LIMIT", 1)

    async def failed_connection(_websocket: WebSocket) -> None:
        raise RuntimeError("synthetic connection failure")

    monkeypatch.setattr(server, "_serve_simulation_websocket", failed_connection)
    websocket, sent = _scope_websocket(
        [
            (b"x-api-key", raw_key.encode("ascii")),
            (b"origin", b"http://localhost:5173"),
        ]
    )

    with pytest.raises(RuntimeError, match="synthetic connection failure"):
        asyncio.run(server.simulation_websocket(websocket))

    assert sent == [{"type": "websocket.accept", "subprotocol": None, "headers": []}]
    assert server._ws_sim_active_connections == 0
    assert server._ws_sim_active_connections_by_subject == {}
    assert server._ws_sim_active_leases == set()


@pytest.mark.parametrize(
    "credential_query",
    [
        "api_key=secret",
        "access_token=secret",
        "token=secret",
        "authorization=Bearer%20secret",
        "x-api-key=secret",
        "%61pi_key=secret",
    ],
)
def test_websocket_rejects_query_credentials_before_admission(
    monkeypatch,
    credential_query: str,
) -> None:
    raw_key = "header-secret"
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        _network_security_config(raw_key),
    )
    admission_called = False

    def unexpected_admission(*_args):
        nonlocal admission_called
        admission_called = True
        raise AssertionError("query credentials reached WebSocket admission")

    monkeypatch.setattr(server, "_try_acquire_ws_sim_slot", unexpected_admission)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            f"/ws/sim?{credential_query}",
            headers={
                "origin": "http://localhost:5173",
                "x-api-key": raw_key,
            },
        ):
            pass

    assert exc_info.value.code == 1008
    assert admission_called is False


def test_local_websocket_remains_header_optional(monkeypatch) -> None:
    local_config = server._load_solar_security_config(
        {
            "SOLAR_SECURITY_PROFILE": "local",
            "SOLAR_CORS_ALLOWED_ORIGINS": "http://localhost:5173",
        }
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", local_config)
    admission_subjects: list[str | None] = []

    def saturated_admission(subject: str | None = None):
        admission_subjects.append(subject)
        return None

    monkeypatch.setattr(server, "_try_acquire_ws_sim_slot", saturated_admission)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/ws/sim",
            headers={"origin": "http://localhost:5173"},
        ):
            pass

    assert exc_info.value.code == 1013
    assert admission_subjects == [None]


class _ReceiveLoopWebSocket:
    def __init__(self, messages: list[dict]) -> None:
        self._messages = iter(messages)
        self.sent: list[str] = []
        self.closed: list[dict[str, object]] = []

    async def receive(self) -> dict:
        return next(
            self._messages,
            {"type": "websocket.disconnect", "code": 1000, "reason": "test complete"},
        )

    async def send_text(self, payload: str) -> None:
        self.sent.append(payload)

    async def close(self, *, code: int = 1000, reason: str = "") -> None:
        self.closed.append({"code": code, "reason": reason})


class _RecordingCommandRunner:
    def __init__(self) -> None:
        self.commands: list[dict] = []

    def send_command(self, command: dict) -> bool:
        self.commands.append(command)
        return True


def test_websocket_oversize_text_closes_1009_before_json_parsing(monkeypatch) -> None:
    raw = "\N{SNOWMAN}" * ((server.WS_SIM_COMMAND_MAX_BYTES // 3) + 1)
    assert len(raw) < server.WS_SIM_COMMAND_MAX_BYTES
    assert len(raw.encode("utf-8")) > server.WS_SIM_COMMAND_MAX_BYTES
    websocket = _ReceiveLoopWebSocket(
        [{"type": "websocket.receive", "text": raw}]
    )
    runner = _RecordingCommandRunner()

    def unexpected_json_parse(_payload: str):
        raise AssertionError("oversized frame reached application JSON parsing")

    monkeypatch.setattr(server.json, "loads", unexpected_json_parse)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        asyncio.run(server._ws_receive_loop(websocket, runner))

    assert exc_info.value.code == 1009
    assert websocket.closed[0]["code"] == 1009
    assert websocket.sent == []
    assert runner.commands == []


@pytest.mark.parametrize(
    ("raw", "expected_code"),
    [
        ("{", "invalid_json"),
        ("[]", "invalid_command"),
        (
            json.dumps(
                {
                    "type": "pause",
                    "extra": {"nested": {"too": {"deep": True}}},
                }
            ),
            "invalid_command",
        ),
        (
            json.dumps(
                {
                    "type": "pause",
                    **{f"extra_{index}": index for index in range(8)},
                }
            ),
            "invalid_command",
        ),
    ],
    ids=("malformed-json", "non-object", "too-deep", "too-many-fields"),
)
def test_websocket_rejects_malformed_or_unsafe_command_shapes(
    raw: str,
    expected_code: str,
) -> None:
    websocket = _ReceiveLoopWebSocket(
        [{"type": "websocket.receive", "text": raw}]
    )
    runner = _RecordingCommandRunner()

    with pytest.raises(WebSocketDisconnect) as exc_info:
        asyncio.run(server._ws_receive_loop(websocket, runner))

    assert exc_info.value.code == 1000
    assert runner.commands == []
    assert websocket.closed == []
    assert len(websocket.sent) == 1
    error = json.loads(websocket.sent[0])
    assert error["type"] == "error"
    assert error["code"] == expected_code


@pytest.mark.parametrize(
    ("command", "expected"),
    [
        ({"type": " pause ", "ignored": {"nested": True}}, {"type": "pause"}),
        (
            {"type": "set_time_scale", "days_per_sec": 12, "ignored": "drop"},
            {"type": "set_time_scale", "days_per_sec": 12},
        ),
        (
            {
                "type": "set_julian_date",
                "jd": 2_460_000.5,
                "jd_time_scale": "TDB",
                "ignored": [1, 2, 3],
            },
            {
                "type": "set_julian_date",
                "jd": 2_460_000.5,
                "jd_time_scale": "TDB",
            },
        ),
        (
            {
                "type": "activate_kuiper",
                "center": [42, 0, 0],
                "spread": 5,
                "ignored": False,
            },
            {"type": "activate_kuiper", "center": [42, 0, 0], "spread": 5},
        ),
        (
            {"type": "get_orbital_elements", "body_id": "earth", "ignored": 1},
            {"type": "get_orbital_elements", "body_id": "earth"},
        ),
        (
            {"type": "future_command", "attacker_controlled": "drop"},
            {"type": "future_command"},
        ),
    ],
    ids=(
        "no-argument-action",
        "time-scale",
        "julian-date",
        "kuiper",
        "orbital-elements",
        "unsupported-action",
    ),
)
def test_websocket_normalizes_commands_before_enqueueing(
    command: dict,
    expected: dict,
) -> None:
    websocket = _ReceiveLoopWebSocket(
        [{"type": "websocket.receive", "text": json.dumps(command)}]
    )
    runner = _RecordingCommandRunner()

    with pytest.raises(WebSocketDisconnect):
        asyncio.run(server._ws_receive_loop(websocket, runner))

    assert runner.commands == [expected]
    assert websocket.sent == []
    assert websocket.closed == []
