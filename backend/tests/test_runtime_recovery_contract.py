"""Canonical SCN-037/070/071: clock semantics, recovery, and transport ownership."""
from __future__ import annotations

import asyncio
import json
import threading
import time
from types import SimpleNamespace

import pytest
from starlette.websockets import WebSocketDisconnect

import server


class Engine:
    engine_name = "fixture"
    fidelity_level = "low"

    def __init__(self):
        self.jd = 2451545.0
        self.steps = []
        self.advanced = threading.Event()

    def initialize(self, _bodies):
        pass

    def get_state(self):
        return {"jd": self.jd, "bodies": {}, "jd_time_scale": "TDB"}

    def get_julian_date(self):
        return self.jd

    def get_energy_error(self):
        return 0.0

    def list_body_ids(self):
        return ["earth"]

    def get_orbital_elements(self, _body):
        raise ValueError("unsupported element request")

    def step(self, dt):
        self.steps.append(dt)
        self.jd += dt
        if len(self.steps) >= 2:
            self.advanced.set()


def test_recoverable_command_error_does_not_freeze_a_live_runner():
    engine = Engine()
    runner = server.SimulationRunner(engine, target_fps=120)
    runner.send_command({"type": "get_orbital_elements", "body_id": "earth"})
    runner.send_command({"type": "resume"})
    runner.start()
    try:
        assert engine.advanced.wait(1), "the runner stayed frozen after a command error"
        assert engine.jd > 2451545.0
        assert runner._runtime_error is None
        assert runner.get_response()["code"] == "command_failed"
    finally:
        assert runner.stop()


def test_fatal_engine_error_cannot_report_successful_resume():
    runner = server.SimulationRunner(Engine())
    runner.paused = True
    runner._runtime_error = "integrator state is invalid"
    runner._handle_command({"type": "resume"})
    assert runner.paused
    assert runner.get_response()["code"] == "engine_unavailable"


def test_fixed_step_clock_is_explicit_and_does_not_catch_up_overruns():
    engine = Engine()
    runner = server.SimulationRunner(engine, target_fps=240)
    original = engine.step

    def slow_step(dt):
        time.sleep(0.012)
        original(dt)

    engine.step = slow_step
    runner.start()
    try:
        assert engine.advanced.wait(1)
    finally:
        assert runner.stop()
    assert engine.steps == pytest.approx([4.0 / 240] * len(engine.steps))
    assert runner.get_latest_state()["backend"]["clock_policy"] == "fixed_step"


def test_stop_before_thread_start_is_safe():
    assert server.SimulationRunner(Engine()).stop()


@pytest.mark.parametrize("failure", ["start", "initial_send"])
def test_session_startup_failure_stops_the_owned_runner(monkeypatch, failure):
    instances = []

    class Runner:
        def __init__(self, *_args, **_kwargs):
            self.stopped = False
            instances.append(self)

        def start(self):
            if failure == "start":
                raise RuntimeError("cannot start worker")

        def stop(self):
            self.stopped = True
            return True

    class Socket:
        query_params = {}

        async def send_text(self, _text):
            raise WebSocketDisconnect(code=1006)

    monkeypatch.setattr(server, "SimulationRunner", Runner)
    monkeypatch.setattr(server, "_rebound_readiness", lambda: {"available": True})
    monkeypatch.setattr(server, "_tudatpy_available", lambda: False)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda **_kw: Engine())
    asyncio.run(server._serve_simulation_websocket(Socket()))
    assert len(instances) == 1
    assert instances[0].stopped


def test_stalled_send_is_cancelled_at_the_transport_deadline(monkeypatch):
    cancelled = []

    class Socket:
        async def send_text(self, _text):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.append(True)

    monkeypatch.setattr(server, "WS_SIM_SEND_TIMEOUT_SECONDS", 0.01, raising=False)

    async def run():
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(server._ws_send_text(Socket(), "payload"), 0.2)

    asyncio.run(run())
    assert cancelled == [True]


def test_no_output_session_has_a_bounded_idle_lifetime(monkeypatch):
    class Socket:
        async def close(self, **_kwargs):
            pass

    class Runner:
        def get_response(self):
            return None

        def get_latest_state(self):
            return None

    monkeypatch.setattr(server, "WS_SIM_IDLE_TIMEOUT_SECONDS", 0.01, raising=False)

    async def run():
        with pytest.raises(WebSocketDisconnect):
            await asyncio.wait_for(server._ws_send_loop(Socket(), Runner(), 1000), 0.2)

    asyncio.run(run())


def _capture_sender_states(states, *, stream_hz=300):
    class Runner:
        def __init__(self):
            self.running = True
            self.index = 0

        def get_response(self):
            return None

        def get_latest_state(self):
            # The production runner publishes a fresh outer snapshot every tick
            # while retaining the same Kuiper payload object between cadence frames.
            return dict(states[min(self.index, len(states) - 1)])

    runner = Runner()
    sent = []
    closed = []

    class Socket:
        async def send_text(self, text):
            sent.append(json.loads(text))
            runner.index += 1
            if runner.index >= len(states):
                runner.running = False

        async def close(self, **kwargs):
            closed.append(kwargs["code"])

    async def run():
        with pytest.raises(WebSocketDisconnect):
            await asyncio.wait_for(
                server._ws_send_loop(Socket(), runner, stream_hz),
                1.5,
            )

    asyncio.run(run())
    assert closed == [1011]
    return sent


def test_paused_sender_omits_an_unchanged_kuiper_payload_after_first_delivery():
    payload = {"positions": [[43.0, 0.0, 0.0]], "velocity_units": "AU/yr"}
    states = [
        {
            "type": "state_update",
            "jd": 2451545.0,
            "paused": True,
            "kuiper": payload,
            "kuiper_subscription_id": "belt-a",
        },
        {
            "type": "state_update",
            "jd": 2451545.0,
            "paused": True,
            "kuiper": payload,
            "kuiper_subscription_id": "belt-a",
        },
    ]

    sent = _capture_sender_states(states)

    assert sent[0]["kuiper"] == payload
    assert sent[0]["kuiper_subscription_id"] == "belt-a"
    assert "kuiper" not in sent[1]
    assert "kuiper_subscription_id" not in sent[1]
    assert all(state["kuiper"] is payload for state in states)


def test_sender_retains_omission_until_cadence_returns_a_new_payload():
    first_payload = {"positions": [[43.0, 0.0, 0.0]]}
    cadence_payload = {"positions": [[43.1, 0.0, 0.0]]}
    states = [
        {
            "type": "state_update", "jd": 1.0,
            "kuiper": first_payload, "kuiper_subscription_id": "belt-a",
        },
        {
            "type": "state_update", "jd": 2.0,
            "kuiper": first_payload, "kuiper_subscription_id": "belt-a",
        },
        {
            "type": "state_update", "jd": 3.0,
            "kuiper": cadence_payload, "kuiper_subscription_id": "belt-a",
        },
    ]

    sent = _capture_sender_states(states, stream_hz=1_000)

    assert sent[0]["kuiper"] == first_payload
    assert "kuiper" not in sent[1]
    assert "kuiper_subscription_id" not in sent[1]
    assert sent[2]["kuiper"] == cadence_payload
    assert sent[2]["kuiper_subscription_id"] == "belt-a"
    assert states[1]["kuiper"] is first_payload
    assert states[1]["kuiper_subscription_id"] == "belt-a"


def test_sender_delivers_same_payload_object_for_a_new_subscription():
    payload = {"positions": [[43.0, 0.0, 0.0]]}
    states = [
        {
            "type": "state_update", "jd": 1.0,
            "kuiper": payload, "kuiper_subscription_id": "belt-a",
        },
        {
            "type": "state_update", "jd": 2.0,
            "kuiper": payload, "kuiper_subscription_id": "belt-b",
        },
    ]

    sent = _capture_sender_states(states, stream_hz=1_000)

    assert sent[0]["kuiper"] == payload
    assert sent[1]["kuiper"] == payload
    assert sent[1]["kuiper_subscription_id"] == "belt-b"


def test_failed_state_send_does_not_mark_kuiper_payload_as_delivered():
    payload = {"positions": [[43.0, 0.0, 0.0]]}
    state = {
        "type": "state_update",
        "jd": 1.0,
        "kuiper": payload,
        "kuiper_subscription_id": "belt-a",
    }
    tracker = server._KuiperPayloadDeliveryTracker()
    attempts = []

    class Socket:
        fail = True

        async def send_text(self, text):
            attempts.append(json.loads(text))
            if self.fail:
                raise RuntimeError("transport failed")

    socket = Socket()

    async def run():
        prepared = tracker.prepare(state)
        with pytest.raises(RuntimeError):
            await tracker.send(socket, state, prepared)

        retry = tracker.prepare(state)
        assert retry["kuiper"] is payload
        assert retry["kuiper_subscription_id"] == "belt-a"

        socket.fail = False
        await tracker.send(socket, state, retry)
        repeated = tracker.prepare(state)
        assert repeated is not state
        assert "kuiper" not in repeated
        assert "kuiper_subscription_id" not in repeated

    asyncio.run(run())
    assert len(attempts) == 2


@pytest.mark.parametrize("failure", ["accept", "initial_send"])
def test_stalled_handshake_releases_admission_and_runner(monkeypatch, failure):
    instances = []

    class Runner:
        def __init__(self, *_args, **_kwargs):
            self.stopped = False
            instances.append(self)

        def start(self):
            pass

        def stop(self):
            self.stopped = True
            return True

    class Socket:
        scope = {}
        query_params = {}

        async def accept(self):
            if failure == "accept":
                await asyncio.Event().wait()

        async def send_text(self, _text):
            await asyncio.Event().wait()

    monkeypatch.setattr(server, "WS_SIM_SEND_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(server, "SimulationRunner", Runner)
    monkeypatch.setattr(server, "_rebound_readiness", lambda: {"available": True})
    monkeypatch.setattr(server, "_tudatpy_available", lambda: False)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda **_kw: Engine())
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", SimpleNamespace(profile="local"))
    monkeypatch.setattr(server, "_websocket_query_has_safe_shape", lambda _ws: True)
    monkeypatch.setattr(server, "_websocket_origin_allowed", lambda _ws: True)
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())

    async def run():
        if failure == "accept":
            with pytest.raises(asyncio.TimeoutError):
                await server.simulation_websocket(Socket())
        else:
            await server.simulation_websocket(Socket())

    asyncio.run(run())
    assert server._ws_sim_active_connections == 0
    lease = server._try_acquire_ws_sim_slot()
    assert lease is not None
    server._release_ws_sim_slot(lease)
    assert all(runner.stopped for runner in instances)
