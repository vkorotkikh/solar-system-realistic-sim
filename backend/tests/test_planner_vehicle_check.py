"""Vehicle check (epic issue C5): can a staged chemical vehicle fly a list of burns.

The expected figures are the rocket equation worked by hand for one stage of
1,000 kg dry mass and 9,000 kg of propellant at Isp 300 s carrying 1,000 kg:
300 * 9.80665 * ln(11,000 / 2,000) = 5,015.360 m/s with no reserve, and
300 * 9.80665 * ln(11,000 / 2,900) = 3,922.222 m/s when 10% of the propellant
is held back (900 kg stays aboard).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import server

client = TestClient(server.app, raise_server_exceptions=False)
STAGE = {"name": "kick", "dry_mass_kg": 1_000.0, "propellant_mass_kg": 9_000.0, "isp_s": 300.0}


@pytest.fixture(autouse=True)
def _fresh_middleware_stack(monkeypatch) -> None:
    # Keep these requests out of the suite-wide trajectory rate-limit window.
    monkeypatch.setattr(server.app, "middleware_stack", None)


def _check(burns: list[float], *, reserve: float = 0.0, stages: list[dict] | None = None):
    return client.post("/planner/vehicle-check", json={
        "burns_km_s": burns,
        "payload_mass_kg": 1_000.0,
        "reserve_fraction": reserve,
        "stages": stages or [STAGE],
    })


def test_burns_within_the_stage_capacity_close() -> None:
    response = _check([3.0, 2.0])
    assert response.status_code == 200
    result = response.json()
    assert result["feasible"] is True
    assert result["totalUnmetDeltaV_km_s"] == pytest.approx(0.0, abs=1e-9)
    # 3.0 km/s from 11,000 kg leaves 11,000 * exp(-3,000 / 2,941.995) = 3,967.670 kg.
    assert result["burns"][0]["propellantUsedKg"] == pytest.approx(7_032.330, abs=0.01)


def test_a_burn_beyond_the_capacity_reports_the_shortfall() -> None:
    result = _check([5.1]).json()
    assert result["feasible"] is False
    assert result["burns"][0]["unmetDeltaV_km_s"] == pytest.approx(0.084640, abs=1e-6)


def test_the_reserve_fraction_is_held_back() -> None:
    result = _check([4.0], reserve=0.1).json()
    assert result["feasible"] is False
    assert result["burns"][0]["unmetDeltaV_km_s"] == pytest.approx(4.0 - 3.922222, abs=1e-6)


def test_a_spent_stage_hands_over_to_the_next() -> None:
    upper = {"name": "upper", "dry_mass_kg": 500.0, "propellant_mass_kg": 2_000.0, "isp_s": 450.0}
    result = _check([6.0], stages=[STAGE, upper]).json()
    assert result["burns"][0]["stagesUsed"] == ["kick", "upper"]


@pytest.mark.parametrize(
    "body",
    [
        {"burns_km_s": [3.0], "payload_mass_kg": 1_000.0, "stages": []},
        {"burns_km_s": [], "payload_mass_kg": 1_000.0, "stages": [STAGE]},
        {"burns_km_s": [-1.0], "payload_mass_kg": 1_000.0, "stages": [STAGE]},
        {"burns_km_s": [3.0], "payload_mass_kg": 0.0, "stages": [STAGE]},
        {"burns_km_s": [3.0], "payload_mass_kg": 1_000.0, "reserve_fraction": 0.5, "stages": [STAGE]},
        {"burns_km_s": [3.0], "payload_mass_kg": 1_000.0, "stages": [{**STAGE, "isp_s": 0.0}]},
        {"burns_km_s": [3.0], "payload_mass_kg": 1_000.0, "stages": [STAGE] * 13},
        {"burns_km_s": [3.0], "payload_mass_kg": 1_000.0, "stages": [STAGE], "cargo_added_kg": [5.0]},
    ],
)
def test_impossible_vehicles_are_rejected_before_any_work(body: dict) -> None:
    response = client.post("/planner/vehicle-check", json=body)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "trajectory_request_validation_error"
