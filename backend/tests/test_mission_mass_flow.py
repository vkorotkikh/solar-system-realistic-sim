from __future__ import annotations

import math

import pytest

from mission.mining_service import MiningService
from mission.risk_service import RiskService
from mission.vehicle_service import VehicleService, default_vehicle

VEHICLE = default_vehicle()
SERVICE = VehicleService()


def _budget(burns, cargo=None):
    return SERVICE.evaluate_burn_budget(
        VEHICLE, payload_mass_kg=6_500.0, burns_km_s=burns, reserve_fraction=0.05, cargo_added_kg=cargo
    )


def test_return_burn_carries_the_mined_cargo() -> None:
    # The default vehicle has ~3.8 km/s in total with 6.5 t aboard.
    empty = _budget([1.5, 1.0])
    laden = _budget([1.5, 1.0], cargo=[0.0, 5_000.0])
    assert empty["feasible"] and laden["feasible"]
    assert laden["burns"][0]["propellantUsedKg"] == pytest.approx(empty["burns"][0]["propellantUsedKg"])
    # Same delta-v with 5 t more on board costs ~19% more propellant (ignition mass 31.9 t vs
    # 26.9 t); before cargo entered the rocket equation it cost exactly the same.
    assert laden["burns"][1]["propellantUsedKg"] > empty["burns"][1]["propellantUsedKg"] * 1.15


def test_max_closable_cargo_is_the_largest_cargo_that_closes() -> None:
    kwargs = dict(payload_mass_kg=6_500.0, burns_km_s=[1.5, 1.5], cargo_burn_index=1, reserve_fraction=0.05)
    assert SERVICE.max_closable_cargo_kg(VEHICLE, available_cargo_kg=100.0, **kwargs) == 100.0
    cap = SERVICE.max_closable_cargo_kg(VEHICLE, available_cargo_kg=1e7, **kwargs)
    assert cap is not None and 0.0 < cap < 1e7
    assert _budget([1.5, 1.5], cargo=[0.0, cap])["feasible"]
    assert not _budget([1.5, 1.5], cargo=[0.0, cap + 2.0])["feasible"]
    # A plan that cannot close even empty has no cargo capacity at all.
    assert SERVICE.max_closable_cargo_kg(
        VEHICLE, available_cargo_kg=1e4, payload_mass_kg=6_500.0, burns_km_s=[30.0, 30.0], cargo_burn_index=1
    ) is None


def test_nominal_cargo_capacity_has_no_delta_v_dispersion_margin() -> None:
    burns = [2.0, 1.5]
    cargo_kg = SERVICE.max_closable_cargo_kg(
        VEHICLE,
        payload_mass_kg=6_500.0,
        burns_km_s=burns,
        cargo_burn_index=1,
        available_cargo_kg=10_000.0,
        reserve_fraction=0.05,
    )

    assert cargo_kg is not None
    assert _budget(burns, cargo=[0.0, cargo_kg])["feasible"]
    assert not _budget([burn * 1.0001 for burn in burns], cargo=[0.0, cargo_kg])["feasible"]

    risk = RiskService().run_monte_carlo(
        base_total_delta_v_km_s=sum(burns),
        base_total_time_days=900.0,
        base_returned_payload_kg=cargo_kg,
        base_arrival_jd=2_461_000.5,
        reclose=lambda factor, cargo: _budget([burn * factor for burn in burns], cargo=[0.0, cargo]),
        samples=5_000,
        seed=17,
    )

    assert risk["failureProbability"] == pytest.approx(0.47, abs=0.02)
    assert RiskService.cargo_sizing_delta_v_factor(0.05) == pytest.approx(1.0822426813475736)


@pytest.mark.parametrize(
    ("threshold", "expected"),
    [
        (0.05, 1.0822426813475736),
        (0.45, 1.0062830673427536),
        (0.5, 1.0),
        (1.0, 1.0),
    ],
)
def test_cargo_sizing_factor_tracks_risk_threshold(threshold: float, expected: float) -> None:
    assert RiskService.cargo_sizing_delta_v_factor(threshold) == pytest.approx(expected, abs=1e-9)


def test_zero_risk_threshold_uses_a_finite_fail_closed_cargo_factor() -> None:
    factor = RiskService.cargo_sizing_delta_v_factor(0.0)

    assert math.isfinite(factor)
    assert factor > 1.0


def _search_with_evaluation_limit(
    *, available_cargo_kg: float, largest_closable_kg: float, limit: int
):
    service = VehicleService()
    evaluations = 0

    def evaluate_burn_budget(_vehicle, *, cargo_added_kg, **_kwargs):
        nonlocal evaluations
        evaluations += 1
        assert evaluations <= limit, "cargo bisection did not make progress"
        return {"feasible": cargo_added_kg[0] <= largest_closable_kg}

    service.evaluate_burn_budget = evaluate_burn_budget
    cargo = service.max_closable_cargo_kg(
        VEHICLE,
        payload_mass_kg=6_500.0,
        burns_km_s=[1.0],
        cargo_burn_index=0,
        available_cargo_kg=available_cargo_kg,
    )
    return cargo, evaluations


def test_max_closable_cargo_terminates_for_infinite_available_cargo() -> None:
    cargo, evaluations = _search_with_evaluation_limit(
        available_cargo_kg=math.inf,
        largest_closable_kg=100.0,
        limit=1_100,
    )

    assert cargo == pytest.approx(100.0, abs=1.0)
    assert evaluations <= 1_100


def test_max_closable_cargo_terminates_when_midpoint_cannot_progress() -> None:
    largest_closable_kg = float(2**60)
    cargo, evaluations = _search_with_evaluation_limit(
        available_cargo_kg=float(2**62),
        largest_closable_kg=largest_closable_kg,
        limit=100,
    )

    assert cargo == largest_closable_kg
    assert evaluations <= 100


def test_return_propellant_is_not_subtracted_from_the_cargo_again() -> None:
    mining = {"storablePayloadKg": 10_000.0}
    closure = MiningService().payload_return_closure(
        mining, outbound_propellant_kg=9_000.0, return_propellant_kg=7_000.0, return_capacity_kg=8_000.0,
        handling_loss_fraction=0.1,
    )
    assert closure["deliveredBeforePropellantKg"] == pytest.approx(9_000.0)
    assert closure["returnedPayloadKg"] == pytest.approx(8_000.0)  # capacity-limited, not 9000 - 7000


def test_risk_fails_every_sample_of_a_plan_short_of_delta_v() -> None:
    # The audit's case: a plan 6.3 km/s short scored failureProbability 0.0.
    burns = [6.0, 9.0]
    assert not _budget(burns)["feasible"]

    def reclose(dv_factor: float, cargo_kg: float):
        return _budget([b * dv_factor for b in burns], cargo=[0.0, cargo_kg])

    risk = RiskService().run_monte_carlo(
        base_total_delta_v_km_s=sum(burns), base_total_time_days=900.0, base_returned_payload_kg=1_000.0,
        base_arrival_jd=2_461_000.5, reclose=reclose, samples=200, seed=3,
    )
    assert risk["failureProbability"] == pytest.approx(1.0)


def test_risk_is_low_for_a_plan_with_real_margin() -> None:
    burns = [2.0, 1.0]

    def reclose(dv_factor: float, cargo_kg: float):
        return _budget([b * dv_factor for b in burns], cargo=[0.0, cargo_kg])

    risk = RiskService().run_monte_carlo(
        base_total_delta_v_km_s=sum(burns), base_total_time_days=900.0, base_returned_payload_kg=1_000.0,
        base_arrival_jd=2_461_000.5, reclose=reclose, samples=200, seed=3,
    )
    assert risk["failureProbability"] < 0.05
    assert risk["envelopes"]["propellantMarginKg"]["p50"] > 0.0
