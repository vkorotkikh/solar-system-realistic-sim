from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

import server
from data.bodies import ALL_BODIES
from trajectory.lambert import PorkchopScanCancelled
from trajectory.budget import PlanningCancelled
from trajectory.planner import run_porkchop_scan


client = TestClient(server.app)


def test_timeout_keeps_capacity_owned_until_worker_exit() -> None:
    guard = threading.BoundedSemaphore(1)
    executor = ThreadPoolExecutor(max_workers=1)
    work_started = threading.Event()
    allow_exit = threading.Event()
    owner_cancelled = threading.Event()

    def slow_work() -> str:
        work_started.set()
        allow_exit.wait(timeout=2.0)
        return "done"

    async def exercise() -> None:
        assert guard.acquire(blocking=False)
        with pytest.raises(asyncio.TimeoutError):
            await server._run_owned_thread(
                slow_work,
                guard=guard,
                executor=executor,
                timeout_seconds=0.02,
                owner_cancel_event=owner_cancelled,
            )

    try:
        asyncio.run(exercise())
        assert work_started.is_set()
        assert owner_cancelled.is_set()
        # This was the original defect: the old `finally` released here even
        # though the timed-out thread was still running.
        assert guard.acquire(blocking=False) is False

        allow_exit.set()
        deadline = time.monotonic() + 1.0
        reacquired = False
        while time.monotonic() < deadline:
            if guard.acquire(blocking=False):
                reacquired = True
                break
            time.sleep(0.005)
        assert reacquired, "worker completion did not restore its capacity permit"
        guard.release()
    finally:
        allow_exit.set()
        executor.shutdown(wait=True)


def test_porkchop_scan_honors_preexisting_cancellation() -> None:
    cancel_event = threading.Event()
    cancel_event.set()

    with pytest.raises((PorkchopScanCancelled, PlanningCancelled)):
        run_porkchop_scan(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_start_jd=2_460_450.5,
            departure_end_jd=2_460_480.5,
            departure_step_days=10.0,
            tof_min_days=80.0,
            tof_max_days=140.0,
            tof_step_days=20.0,
            ephemeris_provider="kepler",
            cancel_event=cancel_event,
        )


@pytest.mark.parametrize("tof_min_days,tof_max_days", [(-10.0, -1.0), (0.0, 10.0)])
def test_porkchop_api_rejects_nonpositive_time_of_flight(
    tof_min_days: float,
    tof_max_days: float,
) -> None:
    response = client.post(
        "/trajectory/porkchop",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_start_jd": 2_460_450.5,
            "departure_end_jd": 2_460_480.5,
            "departure_step_days": 10.0,
            "tof_min_days": tof_min_days,
            "tof_max_days": tof_max_days,
            "tof_step_days": 20.0,
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 422
    assert "tof_" in response.text
