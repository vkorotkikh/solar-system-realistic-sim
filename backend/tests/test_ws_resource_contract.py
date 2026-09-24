from __future__ import annotations

import math
import threading

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

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

    assert server._try_acquire_ws_sim_slot() is True
    assert server._ws_sim_active_connections == 1
    assert server._try_acquire_ws_sim_slot() is False

    server._release_ws_sim_slot()
    assert server._ws_sim_active_connections == 0
    assert server._try_acquire_ws_sim_slot() is True
    server._release_ws_sim_slot()


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

    assert server._websocket_origin_allowed(_Socket()) is expected


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
    assert server._try_acquire_ws_sim_slot() is True

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
        server._release_ws_sim_slot()
