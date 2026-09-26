from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
import pytest

import server
from sim.process_supervisor import (
    ProcessCrashed,
    ProcessResultRejected,
    ProcessSaturated,
    ProcessSubmissionFailed,
    ProcessTimedOut,
    ProcessWorkerFailed,
)


client = TestClient(server.app)


def _state() -> dict[str, Any]:
    return {
        "schema": {"name": "solar_physics_state", "version": 2},
        "source": "backend",
        "epoch_jd_tdb": 2_460_000.5,
    }


class _FakeRunner:
    def __init__(self, outcome: Any) -> None:
        self.outcome = outcome
        self.calls: list[tuple[dict[str, Any], float]] = []
        self.shutdown_calls = 0

    async def run(self, payload: dict[str, Any], *, timeout_seconds: float) -> Any:
        self.calls.append((payload, timeout_seconds))
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome

    def shutdown(self) -> None:
        self.shutdown_calls += 1


def test_solar_endpoint_uses_dedicated_process_runner_not_heavy_thread_pool(
    monkeypatch,
) -> None:
    runner = _FakeRunner(_state())
    monkeypatch.setattr(server, "_solar_physics_runner", runner, raising=False)
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})

    def forbidden_thread_path(*_args, **_kwargs):
        raise AssertionError("solar work entered the shared heavy thread pool")

    monkeypatch.setattr(server, "_run_owned_thread", forbidden_thread_path)

    response = client.get(
        "/solar/physics",
        params={
            "jd_tdb": 2_460_000.5,
            "fidelity": "preview",
            "max_features": 8,
            "forcing": "synthetic",
            "live_data": "false",
        },
    )

    assert response.status_code == 200
    assert response.json() == _state()
    assert runner.calls == [
        (
            {
                "epoch_jd_tdb": 2_460_000.5,
                "fidelity": "preview",
                "max_features": 8,
                "forcing": "synthetic",
                "live_data": False,
            },
            server.SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS,
        )
    ]


@pytest.mark.parametrize(
    ("failure", "expected_code", "retryable"),
    [
        (ProcessSaturated("full"), "solar_compute_saturated", True),
        (ProcessTimedOut("late"), "solar_compute_timeout", True),
        (ProcessCrashed(19), "solar_compute_worker_crashed", True),
        (ProcessSubmissionFailed("submit"), "solar_compute_unavailable", True),
        (ProcessWorkerFailed("target"), "solar_compute_worker_failed", True),
        (ProcessResultRejected("bad"), "solar_compute_invalid_result", False),
    ],
)
def test_solar_endpoint_maps_supervisor_failures_to_stable_503_contract(
    monkeypatch,
    failure: BaseException,
    expected_code: str,
    retryable: bool,
) -> None:
    monkeypatch.setattr(server, "_solar_physics_runner", _FakeRunner(failure), raising=False)
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})

    response = client.get(
        "/solar/physics",
        params={"jd_tdb": 2_460_000.5, "fidelity": "preview", "max_features": 8},
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == expected_code
    assert detail["retryable"] is retryable
    assert "process" not in detail["message"].lower()
    if expected_code == "solar_compute_saturated":
        assert response.headers["retry-after"] == "2"


def test_health_path_remains_available_when_solar_process_capacity_is_full(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        server,
        "_solar_physics_runner",
        _FakeRunner(ProcessSaturated("full")),
        raising=False,
    )
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})
    monkeypatch.setattr(
        server,
        "_rebound_readiness",
        lambda: {"available": True, "fidelity": "high"},
    )

    saturated = client.get(
        "/solar/physics",
        params={"jd_tdb": 2_460_000.5, "fidelity": "preview", "max_features": 8},
    )
    health = client.get("/health")

    assert saturated.status_code == 503
    assert health.status_code == 200
    assert health.json()["status"] == "ok"


def test_application_lifespan_shuts_down_its_solar_process_runner(monkeypatch) -> None:
    runner = _FakeRunner(_state())
    monkeypatch.setattr(server, "_solar_physics_runner", runner)

    with TestClient(server.app):
        assert runner.shutdown_calls == 0

    assert runner.shutdown_calls == 1


def test_server_process_limits_do_not_exceed_supervisor_hard_caps() -> None:
    from sim.process_supervisor import (
        HARD_MAX_PROCESS_QUEUE,
        HARD_MAX_PROCESS_WORKERS,
        HARD_MAX_RESULT_BYTES,
        HARD_MAX_TIMEOUT_SECONDS,
    )

    assert 1 <= server.SOLAR_PHYSICS_PROCESS_WORKERS <= HARD_MAX_PROCESS_WORKERS
    assert 0 <= server.SOLAR_PHYSICS_PROCESS_QUEUE <= HARD_MAX_PROCESS_QUEUE
    assert server.SOLAR_PHYSICS_PROCESS_MAX_RESULT_BYTES <= HARD_MAX_RESULT_BYTES
    assert server.SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS <= HARD_MAX_TIMEOUT_SECONDS
