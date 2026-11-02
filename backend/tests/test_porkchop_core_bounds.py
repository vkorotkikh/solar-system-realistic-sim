from __future__ import annotations

import math

import pytest

from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService
from trajectory import run_porkchop_scan
from trajectory import lambert as lambert_module
from trajectory import planner as planner_module
from trajectory.budget import PlanningContext, PlanningLimits
from trajectory.contracts import TrajectoryRequestRejected
from trajectory.lambert import (
    LAMBERT_ROOT_TOLERANCE_DAYS,
    TrajectoryInputError,
    scan_porkchop_window,
    validate_porkchop_request,
)


def _scan_kwargs() -> dict:
    return {
        "from_id": "earth",
        "to_id": "mars",
        "departure_start_jd": 2_460_450.5,
        "departure_end_jd": 2_460_470.5,
        "departure_step_days": 10.0,
        "tof_min_days": 80.0,
        "tof_max_days": 120.0,
        "tof_step_days": 20.0,
    }


def test_porkchop_points_retain_lambert_certificates_and_honest_counts() -> None:
    result = run_porkchop_scan(
        ALL_BODIES,
        **_scan_kwargs(),
        ephemeris_provider="kepler",
    )

    assert result["evaluatedCount"] == result["estimatedGridPointCount"]
    assert result["successCount"] + result["failureCount"] == result["evaluatedCount"]
    assert result["count"] == result["successCount"]
    for point in result["points"]:
        assert point["rootBracketed"] is True
        assert point["rootResidualDays"] <= LAMBERT_ROOT_TOLERANCE_DAYS
        assert abs(point["computedTofDays"] - point["tofDays"]) <= LAMBERT_ROOT_TOLERANCE_DAYS


def test_low_level_porkchop_rejects_contextless_session() -> None:
    with pytest.raises(ValueError, match="exact PlanningContext"):
        EphemerisService(ALL_BODIES, provider="kepler")


def test_low_level_porkchop_rejects_oversized_grid_before_sampling(monkeypatch) -> None:
    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    sampled = False

    def forbidden_sample(*_args, **_kwargs):
        nonlocal sampled
        sampled = True
        raise AssertionError("oversized scan reached ephemeris sampling")

    monkeypatch.setattr(session, "sample_state", forbidden_sample)
    kwargs = _scan_kwargs()
    kwargs.update(
        departure_start_jd=2_460_000.5,
        departure_end_jd=2_461_000.5,
        departure_step_days=0.5,
        tof_min_days=100.0,
        tof_max_days=100.0,
    )

    with pytest.raises(ValueError, match="at most 2000 points"):
        scan_porkchop_window(session, planning_context=context, **kwargs)
    assert sampled is False


def test_unique_state_estimator_matches_runtime_float_association() -> None:
    start = 2_450_104.0932780663
    departure_step = 4.125730985086473
    tof_min = 489.08731202849344
    tof_step = 8.251461970172945

    with pytest.raises(TrajectoryInputError, match="unique-state computation budget") as caught:
        validate_porkchop_request(
            from_id="earth",
            to_id="mars",
            departure_start_jd=start,
            departure_end_jd=start + 867 * departure_step,
            departure_step_days=departure_step,
            tof_min_days=tof_min,
            tof_max_days=tof_min + tof_step,
            tof_step_days=tof_step,
        )
    assert caught.value.context == {
        "estimatedGridPointCount": 1_736,
        "estimatedUniqueEphemerisStates": 2_126,
        "maximumUniqueEphemerisStates": 2_000,
    }


@pytest.mark.parametrize("span, step, count", [
    (0.0, 5.0, 1),
    (10.0, 5.0, 3),
    (math.nextafter(95.0, -math.inf) - 80.0, 5.0, 4),
    (15.0, math.nextafter(5.0, math.inf), 4),
    (15.0, 5.0 + 1e-9, 3),
    (math.nextafter(2_460_515.5, -math.inf) - 2_460_500.5, 5.0, 3),
])
def test_shared_porkchop_sample_count_preserves_core_epsilon(span, step, count) -> None:
    assert lambert_module.porkchop_grid_sample_count(span, step) == count


def test_shared_porkchop_state_estimator_counts_exact_body_epoch_keys() -> None:
    assert lambert_module.estimate_porkchop_unique_states(
        departure_start_jd=2_460_500.5, departure_step_days=5.0,
        departure_count=100, tof_min_days=80.0, tof_step_days=5.0, tof_count=20,
    ) == 219
    # Overlapping epochs still belong to different departure/destination bodies.
    assert lambert_module.estimate_porkchop_unique_states(
        departure_start_jd=2_460_500.5, departure_step_days=5.0,
        departure_count=3, tof_min_days=5.0, tof_step_days=5.0, tof_count=1,
    ) == 6
    # Regrouping arrival arithmetic would incorrectly report 1,754 states.
    assert lambert_module.estimate_porkchop_unique_states(
        departure_start_jd=2_450_104.0932780663,
        departure_step_days=4.125730985086473, departure_count=868,
        tof_min_days=489.08731202849344,
        tof_step_days=8.251461970172945, tof_count=2,
    ) == 2_126


@pytest.mark.parametrize("axis", ["departure_count", "tof_count"])
@pytest.mark.parametrize("count", [0, -1, True, 1.5, math.nan, math.inf, 2_001, 10**100])
def test_shared_porkchop_estimator_rejects_invalid_counts_before_enumeration(
    monkeypatch, axis, count,
) -> None:
    def forbidden_range(*_args):
        raise AssertionError("unbounded estimator attempted enumeration")

    monkeypatch.setattr(lambert_module, "range", forbidden_range, raising=False)
    kwargs = {
        "departure_start_jd": 2_460_500.5, "departure_step_days": 5.0,
        "departure_count": 1, "tof_min_days": 80.0, "tof_step_days": 5.0, "tof_count": 1,
    }
    kwargs[axis] = count
    with pytest.raises(ValueError):
        lambert_module.estimate_porkchop_unique_states(**kwargs)


def test_shared_porkchop_estimator_bounds_product_before_enumeration(monkeypatch) -> None:
    def forbidden_range(*_args):
        raise AssertionError("oversized estimator attempted enumeration")

    monkeypatch.setattr(lambert_module, "range", forbidden_range, raising=False)
    with pytest.raises(ValueError):
        lambert_module.estimate_porkchop_unique_states(
            departure_start_jd=2_460_500.5, departure_step_days=5.0,
            departure_count=1_001, tof_min_days=80.0, tof_step_days=5.0, tof_count=2,
        )


@pytest.mark.parametrize("overrides", [
    {"departure_end_jd": 2_460_450.5},
    {"tof_max_days": 80.0},
])
def test_core_porkchop_keeps_single_sample_axis_supported(overrides) -> None:
    validated = validate_porkchop_request(**{**_scan_kwargs(), **overrides})
    assert validated["estimated_grid_points"] == 3


@pytest.mark.parametrize("overrides, points, states", [
    ({
        "departure_start_jd": 2_460_000.5, "departure_end_jd": 2_461_000.0,
        "departure_step_days": 0.5, "tof_min_days": 100.0,
        "tof_max_days": 101.0, "tof_step_days": 5.0,
    }, 2_000, 4_000),
    ({
        "departure_start_jd": 2_460_500.5, "departure_end_jd": 2_460_995.5,
        "departure_step_days": 5.0, "tof_min_days": 80.0,
        "tof_max_days": 176.9, "tof_step_days": 5.1,
    }, 2_000, 2_100),
    ({
        "departure_start_jd": 2_450_104.0932780663,
        "departure_end_jd": 2_450_104.0932780663 + 867 * 4.125730985086473,
        "departure_step_days": 4.125730985086473,
        "tof_min_days": 489.08731202849344,
        "tof_max_days": 489.08731202849344 + 8.251461970172945,
        "tof_step_days": 8.251461970172945,
    }, 1_736, 2_126),
], ids=["single-tof", "distinct-arrivals", "float-association"])
def test_core_exact_state_overbudget_precedes_all_provider_access(
    monkeypatch, overrides, points, states,
) -> None:
    def forbidden_session(*_args, **_kwargs):
        raise AssertionError("overbudget request constructed an ephemeris session")

    class UntouchedSession:
        @property
        def provider(self):
            raise AssertionError("overbudget request inspected the provider")

    monkeypatch.setattr(planner_module, "EphemerisService", forbidden_session)
    kwargs = {**_scan_kwargs(), **overrides}
    for invoke, error_type in (
        (lambda: run_porkchop_scan(ALL_BODIES, **kwargs, ephemeris_provider="kepler"),
         TrajectoryRequestRejected),
        (lambda: scan_porkchop_window(UntouchedSession(), **kwargs), TrajectoryInputError),
    ):
        with pytest.raises(error_type) as caught:
            invoke()
        assert caught.value.code == "trajectory_complexity_limit"
        assert caught.value.context == {
            "estimatedGridPointCount": points,
            "estimatedUniqueEphemerisStates": states,
            "maximumUniqueEphemerisStates": 2_000,
        }


def test_low_level_porkchop_rejects_horizons_before_sampling(monkeypatch) -> None:
    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="horizons", context=context)
    calls = 0

    def forbidden_horizons(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise AssertionError("porkchop scan attempted Horizons")

    monkeypatch.setattr(session, "_sample_horizons", forbidden_horizons)

    with pytest.raises(ValueError, match="Horizons is not supported"):
        scan_porkchop_window(session, planning_context=context, **_scan_kwargs())
    assert calls == 0


def test_porkchop_retains_certified_best_so_far_after_later_budget_stop(
    monkeypatch,
) -> None:
    context = PlanningContext.with_timeout(
        2.0,
        limits=PlanningLimits(
            ephemeris_queries=4,
            unique_ephemeris_states=3,
            remote_ephemeris_states=0,
            external_requests=0,
            leg_requests=1,
            leg_evaluations=1,
            route_prefixes=0,
        ),
    )
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)

    def certified_leg(_session, from_id, to_id, departure_jd, tof_days, **_kwargs):
        return {
            "fromId": from_id,
            "toId": to_id,
            "departureJd": departure_jd,
            "arrivalJd": departure_jd + tof_days,
            "tofDays": tof_days,
            "deltaVDepartureKmS": 2.0,
            "deltaVArrivalKmS": 1.0,
            "transferAngleDeg": 90.0,
            "computedTofDays": tof_days,
            "rootResidualDays": 0.0,
            "rootBracketed": True,
        }

    monkeypatch.setattr("trajectory.lambert._compute_lambert_leg_reserved", certified_leg)
    result = scan_porkchop_window(
        session,
        from_id="earth",
        to_id="mars",
        departure_start_jd=2_460_450.5,
        departure_end_jd=2_460_450.5,
        departure_step_days=10.0,
        tof_min_days=100.0,
        tof_max_days=105.0,
        tof_step_days=5.0,
        planning_context=context,
    )

    assert result["best"] is not None
    assert result["evaluatedCount"] == 1
    assert result["configuredGridCompleted"] is False
    assert result["truncated"] is True
    assert result["budgetExhausted"] is True
    assert result["terminationReason"] == "leg_requests_budget_exhausted"
