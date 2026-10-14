"""The propellant reserve is a floor on the stage, not a fraction re-applied per burn (SCN-052)."""
from __future__ import annotations

import pytest

from mission.vehicle_service import StageDefinition, VehicleDefinition, VehicleService

SERVICE = VehicleService()
SINGLE = VehicleDefinition("single", [StageDefinition("stage", 100.0, 1000.0, 300.0)])


def _budget(vehicle, burns, **kwargs):
    return SERVICE.evaluate_burn_budget(vehicle, payload_mass_kg=100.0, burns_km_s=burns, reserve_fraction=0.05, **kwargs)


def _onboard_propellant(budget):
    return sum(
        stage["propellant_mass_kg"] - stage["propellant_used_kg"]
        for stage in budget["stageTelemetry"]
        if not stage["jettisoned"]
    )


def test_splitting_a_burn_does_not_change_feasibility_or_spend_the_reserve() -> None:
    whole = _budget(SINGLE, [4.8])
    halves = _budget(SINGLE, [2.4, 2.4])
    quarters = _budget(SINGLE, [1.2] * 4)
    # Before the fix: [4.8] infeasible, [2.4, 2.4] feasible with 34.75 kg left of a 50 kg reserve.
    assert whole["feasible"] == halves["feasible"] == quarters["feasible"]
    assert halves["totalPropellantUsedKg"] == pytest.approx(whole["totalPropellantUsedKg"], abs=1e-6)
    assert quarters["totalPropellantUsedKg"] == pytest.approx(whole["totalPropellantUsedKg"], abs=1e-6)
    for budget in (whole, halves, quarters):
        assert _onboard_propellant(budget) >= 50.0 - 1e-9 or all(s["jettisoned"] for s in budget["stageTelemetry"])


def test_reserve_is_a_floor_on_each_stage() -> None:
    # 1000 kg propellant, 5% reserve: at most 950 kg may ever be burned, however the burns are split.
    heavy = _budget(SINGLE, [0.5] * 12)
    used = sum(stage["propellant_used_kg"] for stage in heavy["stageTelemetry"])
    assert used <= 950.0 + 1e-9
    assert heavy["feasible"] is False  # 12 x 0.5 km/s = 6 km/s is beyond this stage
