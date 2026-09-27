from __future__ import annotations

import pytest

from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService
from trajectory import run_porkchop_scan
from trajectory.budget import PlanningContext, PlanningLimits
from trajectory.lambert import (
    LAMBERT_ROOT_TOLERANCE_DAYS,
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

    with pytest.raises(ValueError, match="unique-state computation budget"):
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
