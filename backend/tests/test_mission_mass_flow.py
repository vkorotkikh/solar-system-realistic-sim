from __future__ import annotations

import math
from statistics import quantiles

import pytest

from mission.mining_service import MiningService
from mission.risk_service import RiskService
from mission.vehicle_service import StageDefinition, VehicleDefinition, VehicleService, default_vehicle

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


@pytest.mark.parametrize(
    ("burns", "cargo", "expected_mass_kg"),
    [
        ([100.0], None, 173.0198189431324),
        ([50.0, 50.0], None, 173.0198189431324),
        ([50.0, 50.0], [0.0, 3.0], 173.01981906791934),
    ],
)
def test_large_finite_stage_preserves_dry_mass_and_remaining_propellant(
    burns, cargo, expected_mass_kg
) -> None:
    # Regression: MIS-033; found by /qa on 2026-10-24.
    # Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
    # Independent 80-digit Decimal oracle: m1=(10**17+2)*exp(-100000/(300*9.80665)).
    # Cargo case adds 3 kg between the two exponential mass-ratio operations.
    vehicle = VehicleDefinition("large", [StageDefinition("stage", 1.0, 1e17, 300.0)])
    result = SERVICE.evaluate_burn_budget(
        vehicle, payload_mass_kg=1.0, burns_km_s=burns,
        reserve_fraction=0.0, cargo_added_kg=cargo,
    )

    assert result["feasible"] is True
    assert result["totalUnmetDeltaV_km_s"] == 0.0
    assert result["finalMassKg"] == pytest.approx(expected_mass_kg, rel=1e-12)
    inert_mass_kg = 2.0 + sum(cargo or [])
    assert result["propellantOnboardKg"] == pytest.approx(expected_mass_kg - inert_mass_kg, rel=1e-12)
    assert result["stageTelemetry"][0]["jettisoned"] is False


def test_large_finite_exhausted_stage_has_analytic_capacity_and_nonnegative_mass() -> None:
    # Same regression, exhaustion branch: ve*ln((10**17+2)/2) from an 80-digit oracle.
    capacity_km_s = 113.12205958179984
    vehicle = VehicleDefinition("large", [StageDefinition("stage", 1.0, 1e17, 300.0)])
    result = SERVICE.evaluate_burn_budget(
        vehicle, payload_mass_kg=1.0, burns_km_s=[120.0], reserve_fraction=0.0,
    )

    assert result["feasible"] is False
    assert result["totalUnmetDeltaV_km_s"] == pytest.approx(120.0 - capacity_km_s, abs=1e-12)
    assert result["stageTelemetry"][0]["delta_v_delivered_km_s"] == pytest.approx(capacity_km_s, abs=1e-12)
    assert result["finalMassKg"] == 1.0  # Only the payload remains after jettison.
    assert result["propellantOnboardKg"] == 0.0
    assert result["propellantDiscardedKg"] == 0.0


def test_large_stage_jettison_preserves_later_stage_mass() -> None:
    # First-stage floor includes both the payload and the entire later stage.
    vehicle = VehicleDefinition("large-staged", [
        StageDefinition("booster", 1.0, 1e17, 300.0),
        StageDefinition("orbiter", 1.0, 1_000.0, 300.0),
    ])
    result = SERVICE.evaluate_burn_budget(
        vehicle, payload_mass_kg=1.0, burns_km_s=[100.0], reserve_fraction=0.0,
    )

    assert result["feasible"] is True
    assert result["finalMassKg"] > 2.0
    assert result["stageTelemetry"][0]["jettisoned"] is True
    assert result["stageTelemetry"][1]["jettisoned"] is False
    assert result["finalMassKg"] == pytest.approx(2.0 + result["propellantOnboardKg"], abs=1e-12)


@pytest.mark.parametrize(
    ("dry_kg", "payload_kg", "fuel_kg", "burn_km_s", "expected_mass_kg"),
    [
        (1e-300, 1e-300, 1e300, 3.0, 3.606972868589679e299),
        (1e308, 1.0, 1e308, 1.0, 1.423675312681448e308),
    ],
)
def test_finite_postburn_mass_does_not_overflow_intermediate_rocket_equation(
    dry_kg, payload_kg, fuel_kg, burn_km_s, expected_mass_kg
) -> None:
    # MIS-033 boundary checks: finite results from 80-digit Decimal mass-ratio
    # oracles even when the raw fuel/floor ratio or initial wet sum overflows.
    vehicle = VehicleDefinition("large-ratio", [StageDefinition("stage", dry_kg, fuel_kg, 300.0)])
    result = SERVICE.evaluate_burn_budget(
        vehicle, payload_mass_kg=payload_kg, burns_km_s=[burn_km_s], reserve_fraction=0.0,
    )

    assert result["feasible"] is True
    assert result["finalMassKg"] == pytest.approx(expected_mass_kg, rel=1e-12)
    assert 0.0 < result["propellantOnboardKg"] < fuel_kg
    assert math.isfinite(result["totalPropellantUsedKg"])


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


@pytest.mark.parametrize("available_kg, largest_kg, limit, tolerance_kg", [
    (math.inf, 100.0, 1_100, 1.0),
    (float(2**62), float(2**60), 100, 0.0),
], ids=["infinite-available", "midpoint-cannot-progress"])
def test_max_closable_cargo_terminates(available_kg, largest_kg, limit, tolerance_kg) -> None:
    cargo, evaluations = _search_with_evaluation_limit(
        available_cargo_kg=available_kg, largest_closable_kg=largest_kg, limit=limit,
    )

    assert cargo == pytest.approx(largest_kg, abs=tolerance_kg)
    assert evaluations <= limit


@pytest.mark.parametrize("storable_kg, expected_kg", [(1000.0, 960.0), (800.0, 768.0)])
def test_mis031_deliverable_cargo_omitted_default_uses_four_percent(
    storable_kg: float, expected_kg: float
) -> None:
    # MIS-031: literal yields detect either helper's inconsistent 3% default.
    # Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
    assert MiningService.deliverable_cargo_kg({"storablePayloadKg": storable_kg}) == expected_kg


@pytest.mark.parametrize("mining, capacity_kg, delivered_kg, returned_kg", [
    ({}, 1000.0, 0.0, 0.0),
    ({"storablePayloadKg": 1000.0}, 800.0, 960.0, 800.0),
    ({"storablePayloadKg": 1000.0}, 1000.0, 960.0, 960.0),
    ({"storablePayloadKg": 800.0}, 1000.0, 768.0, 768.0),
])
def test_mis031_return_closure_omitted_default_uses_four_percent(
    mining: dict, capacity_kg: float, delivered_kg: float, returned_kg: float
) -> None:
    assert MiningService.deliverable_cargo_kg(mining) == delivered_kg
    assert MiningService().payload_return_closure(
        mining, outbound_propellant_kg=9000.0, return_propellant_kg=7000.0,
        return_capacity_kg=capacity_kg,
    ) == {
        "storablePayloadKg": mining.get("storablePayloadKg", 0.0),
        "handlingLossFraction": 0.04,
        "deliveredBeforePropellantKg": delivered_kg,
        "outboundPropellantKg": 9000.0,
        "returnPropellantKg": 7000.0,
        "returnCapacityKg": capacity_kg,
        "returnedPayloadKg": returned_kg,
    }


@pytest.mark.parametrize(
    "fraction, storable_kg, capacity_kg, delivered_kg, returned_kg",
    [
        (0.00, 1000.0, 1000.0, 1000.0, 1000.0),
        (0.03, 1000.0, 1000.0, 970.0, 970.0),
        (0.04, 1000.0, 1000.0, 960.0, 960.0),
        (0.10, 1000.0, 1000.0, 900.0, 900.0),
        (0.00, 1000.0, 800.0, 1000.0, 800.0),
        (0.03, 1000.0, 800.0, 970.0, 800.0),
        (0.04, 1000.0, 800.0, 960.0, 800.0),
        (0.10, 1000.0, 800.0, 900.0, 800.0),
        (0.00, 800.0, 1000.0, 800.0, 800.0),
        (0.03, 800.0, 1000.0, 776.0, 776.0),
        (0.04, 800.0, 1000.0, 768.0, 768.0),
        (0.10, 800.0, 1000.0, 720.0, 720.0),
        (0.60, 1000.0, 1000.0, 400.0, 400.0),
    ],
)
def test_mis031_explicit_service_loss_storage_and_capacity_controls(
    fraction: float, storable_kg: float, capacity_kg: float,
    delivered_kg: float, returned_kg: float,
) -> None:
    mining = {"storablePayloadKg": storable_kg}
    assert MiningService.deliverable_cargo_kg(mining, fraction) == delivered_kg
    assert MiningService().payload_return_closure(
        mining,
        outbound_propellant_kg=9000.0,
        return_propellant_kg=7000.0,
        return_capacity_kg=capacity_kg,
        handling_loss_fraction=fraction,
    ) == {
        "storablePayloadKg": storable_kg,
        "handlingLossFraction": fraction,
        "deliveredBeforePropellantKg": delivered_kg,
        "outboundPropellantKg": 9000.0,
        "returnPropellantKg": 7000.0,
        "returnCapacityKg": capacity_kg,
        "returnedPayloadKg": returned_kg,
    }


@pytest.mark.parametrize("uncertainty", [
    {},
    {"ephemeris_sigma_fraction": 0.0, "thrust_sigma_fraction": 0.0,
     "extraction_sigma_fraction": 0.0},
], ids=["default-dispersion", "zero-dispersion"])
def test_risk_fails_every_sample_of_a_plan_short_of_delta_v(uncertainty) -> None:
    # The audit's case: a plan 6.3 km/s short scored failureProbability 0.0.
    burns = [6.0, 9.0]
    assert not _budget(burns)["feasible"]

    def reclose(dv_factor: float, cargo_kg: float):
        return _budget([b * dv_factor for b in burns], cargo=[0.0, cargo_kg])

    risk = RiskService().run_monte_carlo(
        base_total_delta_v_km_s=sum(burns), base_total_time_days=900.0, base_returned_payload_kg=1_000.0,
        base_arrival_jd=2_461_000.5, reclose=reclose, samples=200, seed=3,
        **uncertainty,
    )
    assert risk["failureProbability"] == pytest.approx(1.0)
    assert risk["envelopes"]["returnedPayloadKg"] == {"p05": 0.0, "p50": 0.0, "p95": 0.0}


# MIS-020 returned-yield facet: failed deliveries cannot report cargo returned.
# Register: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
@pytest.mark.parametrize("payload, feasibility, failure_probability, expected", [
    (1_000.0, "success", 0.0, {"p05": 1_000.0, "p50": 1_000.0, "p95": 1_000.0}),
    (1_000.0, "half", 0.5, {"p05": 0.0, "p50": 500.0, "p95": 1_000.0}),
    (0.0, "success", 1.0, {"p05": 0.0, "p50": 0.0, "p95": 0.0}),
    (1_000.0, "missing", 1.0, {"p05": 0.0, "p50": 0.0, "p95": 0.0}),
], ids=["all-success", "mixed-delivery", "zero-cargo", "missing-feasibility"])
def test_risk_returned_yield_includes_failed_delivery_zeros(
    payload, feasibility, failure_probability, expected,
) -> None:
    calls = []

    def reclose(factor, cargo):
        calls.append((factor, cargo))
        if feasibility == "missing":
            return {}
        return {"feasible": feasibility == "success" or len(calls) <= 15}

    risk = RiskService().run_monte_carlo(
        base_total_delta_v_km_s=3.0, base_total_time_days=900.0,
        base_returned_payload_kg=payload, base_arrival_jd=2_461_000.5,
        reclose=reclose, samples=30, seed=3,
        ephemeris_sigma_fraction=0.0, thrust_sigma_fraction=0.0,
        extraction_sigma_fraction=0.0,
    )

    assert calls == [(1.0, payload)] * 30
    assert risk["failureProbability"] == failure_probability
    # Fifteen failures and fifteen deliveries have an interpolated median of 500,
    # not the 1,000 kg conditional-on-success median.
    assert risk["envelopes"]["returnedPayloadKg"] == expected


def test_risk_returned_yield_fix_preserves_other_envelopes_and_callback_draws() -> None:
    calls = []

    def reclose(factor, cargo):
        calls.append((factor, cargo))
        return {"feasible": factor <= 1.0,
                "propellantMarginKg": 27.0 + cargo / 100.0 - factor}

    kwargs = dict(
        base_total_delta_v_km_s=3.0, base_total_time_days=900.0,
        base_returned_payload_kg=1_000.0, base_arrival_jd=2_461_000.5,
        reclose=reclose, samples=30, seed=3,
    )
    risk = RiskService().run_monte_carlo(**kwargs)
    first_calls = calls.copy()
    calls.clear()
    assert RiskService().run_monte_carlo(**kwargs) == risk
    assert calls == first_calls
    assert len(calls) == risk["samples"] == 30
    assert risk["seed"] == 3
    # Frozen pre-repair controls: no changes to random draw order or non-yield
    # envelopes, including failed scenarios' required delta-v/time and margin.
    assert calls[0] == pytest.approx((1.0047354019143653, 875.1952987254252))
    assert calls[-1] == pytest.approx((0.9925941548982359, 1_000.0))
    assert risk["failureProbability"] == 1 / 3
    expected = {
        "deltaV_km_s": {"p05": 2.7072111216047583, "p50": 2.9751117709918677, "p95": 3.226173324270411},
        "timeDays": {"p05": 812.5445510018158, "p50": 889.198770256508, "p95": 955.498400518496},
        "arrivalJd": {"p05": 2460913.044551002, "p50": 2460989.6987702567, "p95": 2461055.9984005187},
        "propellantMarginKg": {"p05": 33.638308984928436, "p50": 35.84889538618559, "p95": 36.01918909679812},
    }
    for name, values in expected.items():
        assert risk["envelopes"][name] == pytest.approx(values, rel=1e-12, abs=1e-9)
    realized_cargo = [cargo if factor <= 1.0 else 0.0 for factor, cargo in calls]
    oracle = quantiles(realized_cargo, n=20, method="inclusive")
    assert risk["envelopes"]["returnedPayloadKg"] == pytest.approx({
        "p05": oracle[0], "p50": oracle[9], "p95": oracle[18],
    })


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


def test_max_closable_cargo_never_decreases_as_more_cargo_is_available() -> None:
    # Reviewer's case: the largest closable cargo (0.4 kg) is below the old fixed 1 kg bisection
    # tolerance, so 5 kg available returned 0.0 while 0.39 kg available returned 0.39.
    vehicle = VehicleDefinition("thin-margin", [StageDefinition("stage", 1_000.0, 2_000.0, 300.0)])

    def closes(burn_km_s: float, cargo_kg: float) -> bool:
        return SERVICE.evaluate_burn_budget(
            vehicle, payload_mass_kg=100.0, burns_km_s=[0.0, 0.0, burn_km_s, 0.0],
            reserve_fraction=0.02, cargo_added_kg=[0.0, 0.0, cargo_kg, 0.0],
        )["feasible"]

    lo, hi = 1.0, 6.0  # bisect the return burn to the one that only just closes with 0.4 kg aboard
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if closes(mid, 0.4) else (lo, mid)
    available = [0.1, 0.39, 0.5, 1.0, 2.0, 5.0, 10.0, 100.0, 1e4]
    closable = [
        SERVICE.max_closable_cargo_kg(
            vehicle, payload_mass_kg=100.0, burns_km_s=[0.0, 0.0, lo, 0.0], cargo_burn_index=2,
            available_cargo_kg=kg, reserve_fraction=0.02,
        )
        for kg in available
    ]
    assert closable == sorted(closable)
    assert closable[:2] == [0.1, 0.39]
    assert closable[2:] == pytest.approx([0.4] * 7, abs=1e-9)
