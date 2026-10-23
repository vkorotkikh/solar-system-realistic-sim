"""Independent runtime review: failure containment and live-worker ownership."""
from __future__ import annotations

import asyncio
import json
import threading
from types import SimpleNamespace

import anyio
import pytest
from starlette.websockets import WebSocket
from starlette.websockets import WebSocketDisconnect

import server
from sim.rebound_nbody import REBOUNDEngine


class Engine:
    engine_name = "review-fixture"
    fidelity_level = "low"

    def __init__(self):
        self.jd = 2451545.0
        self.steps = []
        self.seeks = []

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

    def get_orbital_elements(self, _body_id):
        return {"a": 1.0}

    def step(self, dt):
        self.steps.append(dt)
        self.jd += dt

    def set_julian_date(self, jd):
        self.seeks.append(jd)
        self.jd = jd


class _BoundedPlaybackEngine(Engine):
    supported_jd_range = (100.0, 200.0)

    def __init__(self, jd: float, *, frames: int = 1, after_first_frame=None):
        super().__init__()
        self.jd = jd
        self.frames = frames
        self.after_first_frame = after_first_frame
        self.published_frames = 0
        self.runner = None

    def step(self, dt):
        target = self.jd + dt
        if not self.supported_jd_range[0] <= target <= self.supported_jd_range[1]:
            raise ValueError("bounded fixture rejects an out-of-range playback step")
        super().step(dt)

    def get_state(self):
        state = super().get_state()
        if self.runner is not None:
            self.published_frames += 1
            if self.published_frames == 1 and self.after_first_frame is not None:
                self.after_first_frame(self.runner)
            if self.published_frames >= self.frames:
                self.runner.running = False
        return state


class _KuiperStepRecorder:
    def __init__(self, *, fail: bool = False):
        self.active = True
        self.steps = []
        self.fail = fail

    def step(self, dt):
        self.steps.append(dt)
        if self.fail:
            raise RuntimeError("in-range Kuiper fixture failure")

    def should_send(self):
        return False


@pytest.mark.parametrize(
    ("start_jd", "time_scale", "expected_delta"),
    [(199.95, 1.0, 0.05), (100.05, -1.0, -0.05)],
    ids=["upper", "lower"],
)
def test_playback_clamps_partial_boundary_step_for_main_and_kuiper(
    start_jd, time_scale, expected_delta,
):
    engine = _BoundedPlaybackEngine(start_jd)
    runner = server.SimulationRunner(engine, target_fps=10)
    kuiper = _KuiperStepRecorder()
    runner.kuiper = kuiper
    runner.time_scale = time_scale
    engine.runner = runner

    runner._loop()

    assert engine.steps == pytest.approx([expected_delta])
    assert kuiper.steps == pytest.approx([expected_delta])
    assert engine.jd == pytest.approx(200.0 if time_scale > 0 else 100.0)
    assert runner.paused
    assert runner._runtime_error is None
    assert runner.get_response() == {
        "type": "error",
        "message": "Playback reached the engine's validated epoch boundary.",
        "code": "epoch_out_of_range",
    }
    assert runner.get_response() is None


def test_playback_at_bound_does_not_step_and_can_resume_inward_once():
    def resume_inward(runner):
        runner.send_command({"type": "set_time_scale", "days_per_sec": -1.0})
        runner.send_command({"type": "resume"})

    engine = _BoundedPlaybackEngine(200.0, frames=2, after_first_frame=resume_inward)
    runner = server.SimulationRunner(engine, target_fps=10)
    kuiper = _KuiperStepRecorder()
    runner.kuiper = kuiper
    runner.time_scale = 1.0
    engine.runner = runner

    runner._loop()

    assert engine.steps == pytest.approx([-0.1])
    assert kuiper.steps == pytest.approx([-0.1])
    assert engine.jd == pytest.approx(199.9)
    assert runner.paused is False
    assert runner._runtime_error is None
    assert runner.get_response()["code"] == "epoch_out_of_range"
    assert runner.get_response() is None


@pytest.mark.parametrize("failure", ["main", "kuiper"])
def test_in_range_playback_failures_remain_fatal(failure):
    class FailingEngine(_BoundedPlaybackEngine):
        def step(self, dt):
            if failure == "main":
                raise RuntimeError("in-range main fixture failure")
            super().step(dt)

    engine = FailingEngine(150.0)
    runner = server.SimulationRunner(engine, target_fps=240)
    runner.kuiper = _KuiperStepRecorder(fail=failure == "kuiper")
    engine.runner = runner

    runner._loop()

    assert runner.paused
    assert runner._runtime_error == "Simulation step failed."
    assert runner.get_response()["code"] == "runtime_error"


def configure_session(monkeypatch, engine):
    monkeypatch.setattr(server, "_rebound_readiness", lambda: {"available": True})
    monkeypatch.setattr(server, "_tudatpy_available", lambda: False)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda **_kw: engine)
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", SimpleNamespace(profile="local"))
    monkeypatch.setattr(server, "_websocket_query_has_safe_shape", lambda _ws: True)
    monkeypatch.setattr(server, "_websocket_origin_allowed", lambda _ws: True)
    monkeypatch.setattr(server, "_ws_sim_connection_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "_ws_sim_active_connections", 0)
    monkeypatch.setattr(server, "_ws_sim_active_connections_by_subject", {})
    monkeypatch.setattr(server, "_ws_sim_active_leases", set())


async def wait_until(predicate):
    async def poll():
        while not predicate():
            await asyncio.sleep(0.001)

    await asyncio.wait_for(poll(), 1)


def test_failed_mutating_seek_latches_before_another_step_or_resume():
    class PartialSeekEngine(Engine):
        def set_julian_date(self, jd):
            super().set_julian_date(jd)
            raise RuntimeError("integration failed after checkpoint restore")

        def get_state(self):
            if self.seeks:
                runner.running = False  # Finish exactly the first frame.
            return super().get_state()

    engine = PartialSeekEngine()
    runner = server.SimulationRunner(engine, target_fps=240)
    runner.send_command({"type": "set_julian_date", "jd": engine.jd + 1, "jd_time_scale": "TDB"})
    runner.send_command({"type": "resume"})
    runner._loop()
    assert engine.seeks == [2451546.0]
    assert engine.steps == [], "a partially mutated engine must not keep integrating"
    assert runner.paused
    assert runner._runtime_error == "Epoch seek failed."
    assert runner.get_response()["code"] == "runtime_error"
    assert runner.get_response()["code"] == "engine_unavailable"


@pytest.mark.parametrize("action", ["resume", "set_julian_date", "activate_kuiper", "get_orbital_elements"])
def test_fatal_latch_blocks_commands_that_reuse_the_failed_engine(action):
    engine = Engine()
    runner = server.SimulationRunner(engine)
    runner.paused = True
    runner._runtime_error = "engine state invalid"
    runner._handle_command({"type": action, "jd": engine.jd + 1, "jd_time_scale": "TDB", "body_id": "earth"})
    assert runner.get_response()["code"] == "engine_unavailable"
    assert engine.seeks == []
    assert runner.paused


@pytest.mark.parametrize("failure", ["jd", "energy", "malformed_state", "state_and_jd"])
def test_snapshot_failure_cannot_leave_a_dead_worker_advertising_a_healthy_state(failure):
    class FailingEngine(Engine):
        def get_state(self):
            if len(self.steps) >= 2:
                if failure == "malformed_state":
                    return None
                if failure == "state_and_jd":
                    raise RuntimeError("state unavailable")
            return super().get_state()

        def get_julian_date(self):
            if len(self.steps) >= 2 and failure in {"jd", "state_and_jd"}:
                raise RuntimeError("epoch unavailable")
            return super().get_julian_date()

        def get_energy_error(self):
            if len(self.steps) >= 2 and failure == "energy":
                raise RuntimeError("energy unavailable")
            return 0.0

    runner = server.SimulationRunner(FailingEngine(), target_fps=240)
    runner._loop()
    assert not runner.running
    assert runner.paused
    assert runner._runtime_error
    assert runner.get_latest_state() is None
    assert runner.get_response()["code"] == "runtime_error"


def test_kuiper_snapshot_failure_is_fatal_in_the_same_published_frame():
    runner = server.SimulationRunner(Engine(), target_fps=240)

    def fail_snapshot():
        runner.running = False
        raise RuntimeError("particle snapshot unavailable")

    runner.kuiper = SimpleNamespace(active=True, step=lambda _dt: None, should_send=lambda: True, get_state=fail_snapshot)
    runner._loop()
    state = runner.get_latest_state()
    assert state["paused"] is True
    assert state["backend"]["runtime_error"] == "Kuiper state failed."


def test_stop_still_joins_when_engine_cancellation_hook_raises():
    entered = threading.Event()
    released = threading.Event()

    class FailingCancelEngine(Engine):
        def step(self, dt):
            entered.set()
            assert released.wait(2)
            super().step(dt)

        def cancel_pending_operation(self):
            released.set()
            raise RuntimeError("native cancellation hook failed")

    runner = server.SimulationRunner(FailingCancelEngine(), target_fps=240)
    runner.start()
    try:
        assert entered.wait(1)
        assert runner.stop()
        assert not runner._thread.is_alive()
    finally:
        released.set()
        runner.running = False
        runner._thread.join(timeout=2)


@pytest.mark.parametrize("phase", ["stop", "join"])
@pytest.mark.parametrize("completion", ["disconnect", "cancel"])
def test_repeated_cancellation_retains_admission_until_the_actual_worker_exits(monkeypatch, phase, completion):
    cleanup_entered = threading.Event()
    release_worker = threading.Event()
    instances = []

    class Runner:
        def __init__(self, *_args, **_kwargs):
            self.worker = threading.Thread(target=release_worker.wait)
            instances.append(self)

        def start(self):
            self.worker.start()

        def stop(self):
            if phase == "stop":
                cleanup_entered.set()
                self.worker.join()
                return True
            return False

        def wait_until_stopped(self):
            cleanup_entered.set()
            self.worker.join()

        def get_response(self):
            return None

        def get_latest_state(self):
            return None

    class Socket:
        scope = {}
        query_params = {}

        def __init__(self):
            self.receiving = asyncio.Event()

        async def accept(self):
            pass

        async def send_text(self, _text):
            pass

        async def receive(self):
            self.receiving.set()
            if completion == "disconnect":
                return {"type": "websocket.disconnect", "code": 1000}
            await asyncio.Event().wait()

    configure_session(monkeypatch, Engine())
    monkeypatch.setattr(server, "SimulationRunner", Runner)

    async def run():
        socket = Socket()
        task = asyncio.create_task(server.simulation_websocket(socket))
        try:
            await asyncio.wait_for(socket.receiving.wait(), 1)
            if completion == "cancel":
                task.cancel()
            await wait_until(cleanup_entered.is_set)
            for _ in range(2):
                task.cancel()
                await asyncio.sleep(0.01)
            assert instances[0].worker.is_alive()
            assert server._ws_sim_active_connections == 1, "released the lease while its worker was alive"
            assert server._try_acquire_ws_sim_slot() is None
        finally:
            release_worker.set()
            await asyncio.wait_for(asyncio.gather(task, return_exceptions=True), 2)
            for runner in instances:
                runner.worker.join(timeout=1)
        assert task.cancelled(), "cleanup must not swallow owner cancellation"
        assert server._ws_sim_active_connections == 0
        assert server._ws_sim_active_leases == set()
        lease = server._try_acquire_ws_sim_slot()
        assert lease is not None
        server._release_ws_sim_slot(lease)

    asyncio.run(run())


@pytest.mark.parametrize("operation", ["send", "close"])
def test_transport_deadlines_cancel_the_underlying_asgi_operation(monkeypatch, operation):
    cancelled = []

    class Socket:
        async def send_text(self, *_args, **_kwargs):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.append(True)

        close = send_text

    monkeypatch.setattr(server, "WS_SIM_SEND_TIMEOUT_SECONDS", 0.01)

    async def run():
        operation_call = server._ws_send_text(Socket(), "payload") if operation == "send" else server._ws_close(Socket(), code=1011)
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(operation_call, 0.2)
        assert cancelled == [True]

    asyncio.run(run())


def test_resending_a_stale_snapshot_does_not_reset_worker_idle_deadline(monkeypatch):
    state = {"jd": 2451545.0, "bodies": {}}
    runner = SimpleNamespace(get_response=lambda: None, get_latest_state=lambda: state)
    closed = []

    class Socket:
        async def send_text(self, _text):
            pass

        async def close(self, **kwargs):
            closed.append(kwargs["code"])

    monkeypatch.setattr(server, "WS_SIM_IDLE_TIMEOUT_SECONDS", 0.4)

    async def run():
        with pytest.raises(WebSocketDisconnect):
            await asyncio.wait_for(server._ws_send_loop(Socket(), runner, 100), 0.85)

    asyncio.run(run())
    assert closed == [1013]


def test_fresh_paused_snapshots_are_progress_even_without_jd_changes(monkeypatch):
    runner = SimpleNamespace(get_response=lambda: None, get_latest_state=lambda: {"jd": 2451545.0, "paused": True})
    closed = []

    class Socket:
        async def send_text(self, _text):
            pass

        async def close(self, **kwargs):
            closed.append(kwargs["code"])

    monkeypatch.setattr(server, "WS_SIM_IDLE_TIMEOUT_SECONDS", 0.02)

    async def run():
        task = asyncio.create_task(server._ws_send_loop(Socket(), runner, 200))
        try:
            await asyncio.sleep(0.08)
            assert not task.done()
            assert not closed
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())


def test_connected_snapshot_is_captured_before_the_engine_worker_starts(monkeypatch):
    engine = Engine()
    started = False
    messages = []

    def read_epoch():
        assert not started, "event loop read the engine concurrently with its worker"
        return engine.jd

    class Runner:
        def __init__(self, *_args, **_kwargs):
            pass

        def start(self):
            nonlocal started
            started = True

        def stop(self):
            return True

    class Socket:
        query_params = {}

        async def send_text(self, text):
            messages.append(json.loads(text))
            raise WebSocketDisconnect(code=1000)

    engine.get_julian_date = read_epoch
    configure_session(monkeypatch, engine)
    monkeypatch.setattr(server, "SimulationRunner", Runner)
    asyncio.run(server._serve_simulation_websocket(Socket()))
    assert len(messages) == 1
    assert messages[0]["type"] == "connected"
    assert messages[0]["jd"] == engine.jd


@pytest.mark.parametrize("failure", ["initialize", "get_state", "list_body_ids", "get_julian_date"])
def test_initial_snapshot_failure_is_a_structured_init_error(monkeypatch, failure):
    engine = Engine()
    messages = []
    closed = []

    def fail(*_args):
        raise RuntimeError(f"{failure} unavailable")

    setattr(engine, failure, fail)

    class Socket:
        scope = {}
        query_params = {}

        async def accept(self):
            pass

        async def send_text(self, text):
            messages.append(json.loads(text))

        async def close(self, **kwargs):
            closed.append(kwargs["code"])

    configure_session(monkeypatch, engine)
    asyncio.run(server.simulation_websocket(Socket()))
    assert messages[0]["code"] == "engine_init_failed"
    assert messages[0]["message"] == "Simulation engine initialization failed."
    assert closed == [1011]
    assert server._ws_sim_active_connections == 0


@pytest.mark.parametrize("failure", ["read_only", "mutating_seek"])
def test_real_rebound_websocket_recovers_only_read_only_command_failures(monkeypatch, failure):
    """Run a real native engine/thread through the ASGI websocket boundary."""
    engine = REBOUNDEngine()
    configure_session(monkeypatch, engine)
    original_seek = engine.set_julian_date
    original_step = engine.step
    mutation_failed = False
    failure_jd = None
    invalid_steps = []
    messages = []
    instances = []

    def fail_read(_body):
        nonlocal failure_jd
        failure_jd = engine.get_julian_date()
        raise ValueError("review read-only failure")

    def fail_seek(jd):
        nonlocal mutation_failed
        original_seek(jd)
        mutation_failed = True
        raise RuntimeError("review failure after native seek")

    def step(dt):
        if mutation_failed:
            invalid_steps.append(dt)
        original_step(dt)

    engine.get_orbital_elements = fail_read
    engine.set_julian_date = fail_seek
    engine.step = step
    runner_class = server.SimulationRunner

    class RecordingRunner(runner_class):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            instances.append(self)

    monkeypatch.setattr(server, "SimulationRunner", RecordingRunner)

    async def run():
        incoming = asyncio.Queue()
        await incoming.put({"type": "websocket.connect"})
        disconnected = False
        scope = {
            "type": "websocket", "asgi": {"spec_version": "2.4", "version": "3.0"},
            "http_version": "1.1", "scheme": "ws", "path": "/ws/sim",
            "raw_path": b"/ws/sim", "query_string": b"fps=120&stream_hz=120",
            "headers": [], "client": ("127.0.0.1", 43000),
            "server": ("localhost", 8042), "subprotocols": [], "state": {},
        }

        async def send(message):
            nonlocal disconnected
            if message["type"] != "websocket.send":
                return
            payload = json.loads(message["text"])
            messages.append(payload)
            if payload["type"] == "connected":
                command = (
                    {"type": "get_orbital_elements", "body_id": "earth"}
                    if failure == "read_only" else
                    {"type": "set_julian_date", "jd": payload["jd"] + 1, "jd_time_scale": "TDB"}
                )
                for item in [{"type": "pause"}, command, {"type": "resume"}]:
                    await incoming.put({"type": "websocket.receive", "text": json.dumps(item)})
            errors = [item for item in messages if item["type"] == "error"]
            if payload["type"] == "state_update" and errors and not disconnected:
                if failure == "read_only" and payload["jd"] <= failure_jd:
                    return
                if failure == "mutating_seek" and not payload["paused"]:
                    return
                disconnected = True
                await incoming.put({"type": "websocket.disconnect", "code": 1000})

        socket = WebSocket(scope, incoming.get, send)
        await asyncio.wait_for(server.simulation_websocket(socket), 3)
        assert server._ws_sim_active_connections == 0
        assert not instances[0]._thread.is_alive()

    asyncio.run(run())
    errors = [message["code"] for message in messages if message["type"] == "error"]
    state = [message for message in messages if message["type"] == "state_update"][-1]
    assert "earth" in state["bodies"]
    if failure == "read_only":
        assert errors == ["command_failed"]
        assert state["paused"] is False
        assert state["backend"]["runtime_error"] is None
        assert state["jd"] > failure_jd >= messages[0]["jd"]
    else:
        assert errors == ["runtime_error", "engine_unavailable"]
        assert state["paused"] is True
        assert state["backend"]["runtime_error"] == "Epoch seek failed."
        assert invalid_steps == []


def test_dead_worker_sends_its_error_then_closes_without_resending_stale_state():
    response = {"type": "error", "code": "runtime_error", "message": "failed"}
    responses = iter([response, None])
    runner = SimpleNamespace(
        running=False, get_response=lambda: next(responses),
        get_latest_state=lambda: {"jd": 2451545.0, "paused": False},
    )
    sent = []
    closed = []

    class Socket:
        async def send_text(self, text):
            sent.append(json.loads(text))

        async def close(self, **kwargs):
            closed.append(kwargs["code"])

    async def run():
        with pytest.raises(WebSocketDisconnect) as exc:
            await asyncio.wait_for(server._ws_send_loop(Socket(), runner, 100), 0.2)
        assert exc.value.code == 1011

    asyncio.run(run())
    assert sent == [response]
    assert closed == [1011]


def test_repeated_owner_cancellation_cannot_abandon_transport_cleanup(monkeypatch):
    configure_session(monkeypatch, Engine())
    worker_stopped = threading.Event()

    class Runner:
        def __init__(self, *_args, **_kwargs):
            pass

        def start(self):
            pass

        def stop(self):
            worker_stopped.set()
            return True

        def get_response(self):
            return None

        def get_latest_state(self):
            return None

    monkeypatch.setattr(server, "SimulationRunner", Runner)

    async def run():
        receiving = asyncio.Event()
        cancelling = asyncio.Event()
        release_transport = asyncio.Event()

        class Socket:
            scope = {}
            query_params = {}

            async def accept(self):
                pass

            async def send_text(self, _text):
                pass

            async def receive(self):
                receiving.set()
                try:
                    await asyncio.Event().wait()
                finally:
                    cancelling.set()
                    await release_transport.wait()

        task = asyncio.create_task(server.simulation_websocket(Socket()))
        try:
            await asyncio.wait_for(receiving.wait(), 1)
            task.cancel()
            await asyncio.wait_for(cancelling.wait(), 1)
            await wait_until(worker_stopped.is_set)
            for _ in range(2):
                task.cancel()
                await asyncio.sleep(0.01)
            assert not task.done()
            assert server._ws_sim_active_connections == 1
        finally:
            release_transport.set()
            await asyncio.wait_for(asyncio.gather(task, return_exceptions=True), 1)
        assert task.cancelled()
        assert server._ws_sim_active_connections == 0

    asyncio.run(run())


def test_response_flood_cannot_starve_worker_state_and_liveness_checks():
    response = {"type": "error", "code": "queue_overflow"}
    state = {"type": "state_update", "jd": 2451545.0, "bodies": {}}
    runner = SimpleNamespace(get_response=lambda: response, get_latest_state=lambda: state)
    sent = []

    class Socket:
        async def send_text(self, text):
            payload = json.loads(text)
            sent.append(payload)
            assert len(sent) <= server.MAX_COMMANDS_PER_FRAME + 1, "unbounded response draining starved state"
            if payload["type"] == "state_update":
                raise WebSocketDisconnect(code=1000)

    async def run():
        with pytest.raises(WebSocketDisconnect):
            await server._ws_send_loop(Socket(), runner, 100)

    asyncio.run(run())
    assert sent[-1] == state


def test_cleanup_preserves_anyio_cancellation_scope_provenance():
    """Starlette/AnyIO cancellation must remain recognizable to its owner."""
    entered = threading.Event()
    released = threading.Event()

    class Runner:
        def stop(self):
            entered.set()
            assert released.wait(1)
            return True

    async def run():
        loop = asyncio.get_running_loop()
        with anyio.CancelScope() as scope:
            async def cancel_owner():
                await wait_until(entered.is_set)
                scope.cancel()
                loop.call_later(0.02, released.set)

            task = asyncio.create_task(cancel_owner())
            try:
                await server._ws_cleanup_runner(Runner(), [])
            finally:
                released.set()
                await task
        assert scope.cancelled_caught

    asyncio.run(run())


def test_real_rebound_testclient_disconnect_joins_its_runner(monkeypatch):
    from fastapi.testclient import TestClient

    engine = REBOUNDEngine()
    configure_session(monkeypatch, engine)
    instances = []
    runner_class = server.SimulationRunner

    class RecordingRunner(runner_class):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            instances.append(self)

    monkeypatch.setattr(server, "SimulationRunner", RecordingRunner)
    with TestClient(server.app).websocket_connect("/ws/sim?fps=120&stream_hz=120") as socket:
        assert socket.receive_json()["type"] == "connected"
        assert socket.receive_json()["type"] == "state_update"
    assert not instances[0]._thread.is_alive()
    assert server._ws_sim_active_connections == 0


@pytest.mark.parametrize("completed_loop", ["send", "receive"])
@pytest.mark.parametrize("completion", ["return", "disconnect"])
def test_either_socket_task_completion_cancels_its_peer_and_stops_the_worker(monkeypatch, completed_loop, completion):
    configure_session(monkeypatch, Engine())
    stopped = threading.Event()

    class Runner:
        def __init__(self, *_args, **_kwargs):
            pass

        def start(self):
            pass

        def stop(self):
            stopped.set()
            return True

    class Socket:
        scope = {}
        query_params = {}

        async def accept(self):
            pass

        async def send_text(self, _text):
            pass

    monkeypatch.setattr(server, "SimulationRunner", Runner)

    async def run():
        entered = set()
        both_started = asyncio.Event()
        peer_cancelled = asyncio.Event()

        def make_loop(name):
            async def loop(*_args, **_kwargs):
                entered.add(name)
                if len(entered) == 2:
                    both_started.set()
                await both_started.wait()
                if name == completed_loop:
                    if completion == "disconnect":
                        raise WebSocketDisconnect(code=1000)
                    return
                try:
                    await asyncio.Event().wait()
                finally:
                    peer_cancelled.set()
            return loop

        monkeypatch.setattr(server, "_ws_send_loop", make_loop("send"))
        monkeypatch.setattr(server, "_ws_receive_loop", make_loop("receive"))
        await asyncio.wait_for(server.simulation_websocket(Socket()), 1)
        assert peer_cancelled.is_set()
        assert stopped.is_set()
        assert server._ws_sim_active_connections == 0

    asyncio.run(run())
