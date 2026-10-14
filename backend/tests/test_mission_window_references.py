"""SCN-012: the legacy dates have independent fixed-state coverage, not invented tool runs."""
import numpy as np
import pytest
from scipy.integrate import solve_ivp

from benchmark import accuracy
from data.bodies import ALL_BODIES


def test_all_three_legacy_dates_have_independent_nonzero_coverage():
    summary = accuracy.benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")
    assert summary["comparableScenarioCount"] == 3
    assert summary["validationCoverage"] == 1.0
    assert summary["passCount"] == 3
    for row in summary["rows"]:
        assert row["reference"]["calibrationTier"] == "independent_fixed_state"
        assert row["reference"]["legacyCalibration"]["comparisonContract"]["comparableToSolver"] is False
        ref = row["reference"]["fixedState"]
        start = np.asarray(ref["start_state_au_day"])
        end = np.asarray(ref["end_state_au_day"])
        velocity = row["departureVelocityAuDay"]
        def dynamics(t, y):
            return np.r_[y[3:], -ref["mu_au3_day2"] * y[:3] / np.linalg.norm(y[:3])**3]
        state = solve_ivp(dynamics, (0, ref["arrival_jd"]-ref["departure_jd"]),
                          np.r_[start[:3], velocity], method="DOP853", rtol=2e-13, atol=1e-14)
        assert state.success
        assert np.linalg.norm(state.y[:3,-1]-end[:3])*149597870.7 < 50.0
        assert np.linalg.norm(state.y[3:,-1]-row["arrivalVelocityAuDay"])*149597870.7/86400 < 1e-4


def test_window_references_reject_mutated_velocities(monkeypatch):
    original = accuracy.compute_lambert_leg_from_state_vectors
    def wrong(*args, **kwargs):
        leg = original(*args, **kwargs)
        leg["departureVelocityApprox"][0] += 0.01 * 86400 / 149597870.7
        return leg
    monkeypatch.setattr(accuracy, "compute_lambert_leg_from_state_vectors", wrong)
    summary = accuracy.benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")
    assert summary["passCount"] == 0
    assert summary["failedCount"] == 3
