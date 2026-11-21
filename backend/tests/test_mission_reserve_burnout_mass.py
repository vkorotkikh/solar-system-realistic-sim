"""The unburned reserve stays aboard, so it belongs in the rocket equation's burnout mass.

Audit finding mission-01 (2026-11-17 record): deleting `+ stage_reserve_mass` from `m1_min` in
`VehicleService.evaluate_burn_budget` passed the full backend suite. The other reserve tests assert
invariants (monotonicity, burn splitting, reserve floor) that a self-consistent wrong formula still
satisfies, and absolute values only with reserve_fraction=0. These tests derive the expected numbers
by hand from Tsiolkovsky, dV = Isp g0 ln(m0 / m1), with reserve_fraction > 0.
"""

from __future__ import annotations

import math

import pytest

from mission.vehicle_service import StageDefinition, VehicleDefinition, VehicleService

G0 = 9.80665  # standard gravity; independent of the production constant on purpose
SERVICE = VehicleService()


def _one_stage(burns_km_s, *, reserve):
    vehicle = VehicleDefinition("hand", [StageDefinition("s", 1_000.0, 8_000.0, 300.0)])
    return SERVICE.evaluate_burn_budget(
        vehicle, payload_mass_kg=500.0, burns_km_s=burns_km_s, reserve_fraction=reserve
    )


@pytest.mark.parametrize("reserve", [0.05, 0.2])
def test_one_stage_propellant_and_capacity_follow_the_rocket_equation_with_reserve(reserve: float) -> None:
    dry, prop, payload, isp = 1_000.0, 8_000.0, 500.0, 300.0
    ve = isp * G0
    reserve_kg = prop * reserve
    m0 = payload + dry + prop
    burnout = payload + dry + reserve_kg  # the reserve is still aboard at burnout

    # Propellant for a 2 km/s burn: m0 (1 - exp(-dV/ve)).
    expected_used = m0 * (1.0 - math.exp(-2_000.0 / ve))
    assert _one_stage([2.0], reserve=reserve)["totalPropellantUsedKg"] == pytest.approx(expected_used, rel=1e-9)

    # Maximum dV is ve ln(m0 / burnout); a hair below closes, a hair above does not.
    cap_km_s = ve * math.log(m0 / burnout) / 1_000.0
    assert _one_stage([cap_km_s - 1e-6], reserve=reserve)["feasible"] is True
    assert _one_stage([cap_km_s + 1e-3], reserve=reserve)["feasible"] is False


def test_two_stage_staging_burn_and_final_mass_follow_the_rocket_equation_with_reserve() -> None:
    d1, p1, isp1 = 2_000.0, 10_000.0, 280.0
    d2, p2, isp2 = 800.0, 3_000.0, 340.0
    payload, reserve = 400.0, 0.1
    ve1, ve2 = isp1 * G0, isp2 * G0

    # Stage 1 burns until only its reserve is left (the reserve is jettisoned with the stage).
    m0_1 = payload + d1 + p1 + d2 + p2
    burnout_1 = payload + d1 + reserve * p1 + d2 + p2
    dv1 = ve1 * math.log(m0_1 / burnout_1)
    # Stage 2 then delivers the rest of a single 5 km/s burn.
    extra = 5_000.0 - dv1
    m0_2 = payload + d2 + p2
    assert 0.0 < extra < ve2 * math.log(m0_2 / (payload + d2 + reserve * p2))
    used_2 = m0_2 * (1.0 - math.exp(-extra / ve2))

    vehicle = VehicleDefinition(
        "hand2", [StageDefinition("a", d1, p1, isp1), StageDefinition("b", d2, p2, isp2)]
    )
    result = SERVICE.evaluate_burn_budget(
        vehicle, payload_mass_kg=payload, burns_km_s=[5.0], reserve_fraction=reserve
    )

    assert result["feasible"] is True
    assert result["totalPropellantUsedKg"] == pytest.approx(p1 * (1.0 - reserve) + used_2, rel=1e-9)
    # Stage 1 (dry + reserve) is gone; payload, stage 2 dry mass and its leftover propellant remain.
    assert result["finalMassKg"] == pytest.approx(m0_2 - used_2, rel=1e-9)
