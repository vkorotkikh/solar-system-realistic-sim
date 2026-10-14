"""The propellant reserve is a floor on the stage, not a fraction re-applied per burn (SCN-052)."""
from __future__ import annotations

import pytest

from mission.vehicle_service import StageDefinition, VehicleDefinition, VehicleService

SERVICE = VehicleService()
SINGLE = VehicleDefinition("single", [StageDefinition("stage", 100.0, 1000.0, 300.0)])
MULTI = VehicleDefinition(
    "multi",
    [
        StageDefinition("booster", 200.0, 1000.0, 300.0),
        StageDefinition("orbiter", 50.0, 400.0, 320.0),
    ],
)

# With the 100 kg payload and 300 kg cargo, the multi-stage vehicle starts at
# 2050 kg. Burning the booster's usable 950 kg leaves 1100 kg, so its exact
# reserve boundary is 300 * G0 * ln(2050 / 1100) / 1000 km/s.
BOOSTER_RESERVE_BOUNDARY_KM_S = 1.8314790098158413


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


def test_over_capacity_request_uses_initial_propellant_reserve_floor_on_every_stage() -> None:
    budget = _budget(
        MULTI,
        [0.8, 1.5, 100.0],
        cargo_added_kg=[300.0, 0.0, 0.0],
    )

    assert budget["feasible"] is False
    # The unequal dry masses must not affect the 5% reserve: each stage may
    # consume exactly 95% of its initial propellant across all prior burns.
    assert [stage["propellant_used_kg"] for stage in budget["stageTelemetry"]] == pytest.approx(
        [950.0, 380.0], abs=1e-9
    )


def test_partitioning_across_exact_and_near_jettison_boundaries_is_invariant() -> None:
    epsilon_km_s = 1e-6
    crossing = _budget(
        MULTI,
        [BOOSTER_RESERVE_BOUNDARY_KM_S + epsilon_km_s, 0.75],
        cargo_added_kg=[300.0, 120.0],
    )
    exact = _budget(
        MULTI,
        [BOOSTER_RESERVE_BOUNDARY_KM_S, epsilon_km_s, 0.75],
        cargo_added_kg=[300.0, 0.0, 120.0],
    )
    near = _budget(
        MULTI,
        [BOOSTER_RESERVE_BOUNDARY_KM_S - epsilon_km_s, 2.0 * epsilon_km_s, 0.75],
        cargo_added_kg=[300.0, 0.0, 120.0],
    )

    # All schedules deliver the same delta-v before the second cargo load; only
    # their burn boundaries differ relative to booster jettison.
    for budget in (crossing, exact, near):
        assert budget["feasible"] is True
        assert budget["totalUnmetDeltaV_km_s"] == pytest.approx(0.0, abs=1e-12)
        assert [stage["jettisoned"] for stage in budget["stageTelemetry"]] == [True, False]
        assert budget["stageTelemetry"][0]["propellant_used_kg"] == pytest.approx(950.0, abs=1e-9)

    crossing_stage_use = [stage["propellant_used_kg"] for stage in crossing["stageTelemetry"]]
    crossing_stage_delta_v = [stage["delta_v_delivered_km_s"] for stage in crossing["stageTelemetry"]]
    for partitioned in (exact, near):
        assert partitioned["totalPropellantUsedKg"] == pytest.approx(
            crossing["totalPropellantUsedKg"], abs=1e-9
        )
        assert partitioned["finalMassKg"] == pytest.approx(crossing["finalMassKg"], abs=1e-9)
        assert [stage["propellant_used_kg"] for stage in partitioned["stageTelemetry"]] == pytest.approx(
            crossing_stage_use, abs=1e-9
        )
        assert [stage["delta_v_delivered_km_s"] for stage in partitioned["stageTelemetry"]] == pytest.approx(
            crossing_stage_delta_v, abs=1e-12
        )
