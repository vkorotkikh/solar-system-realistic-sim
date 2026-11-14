from __future__ import annotations

import threading

import pytest
from fastapi.testclient import TestClient

import server
from data.bodies import ALL_BODIES
from trajectory.budget import PlanningCancelled
from trajectory.planner import run_porkchop_scan


client = TestClient(server.app)


def test_porkchop_scan_honors_preexisting_cancellation() -> None:
    cancel_event = threading.Event()
    cancel_event.set()

    with pytest.raises(PlanningCancelled):
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
