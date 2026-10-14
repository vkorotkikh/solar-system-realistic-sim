"""Stepping must honour the same validated epoch interval as seeking (SCN-053)."""
from __future__ import annotations

import pytest

pytest.importorskip("rebound")

from data.bodies import ALL_BODIES
from sim.rebound_nbody import REBOUNDEngine, SUPPORTED_JD_MAX_TDB, SUPPORTED_JD_MIN_TDB


def _engine(start_jd: float) -> REBOUNDEngine:
    engine = REBOUNDEngine()
    engine.initialize(ALL_BODIES[:10], start_jd=start_jd)
    return engine


@pytest.mark.parametrize(
    ("start_jd", "dt_days"),
    [(SUPPORTED_JD_MAX_TDB, 1.0), (SUPPORTED_JD_MIN_TDB, -1.0)],
    ids=["past_upper_bound", "past_lower_bound"],
)
def test_step_refuses_to_leave_the_validated_interval(start_jd: float, dt_days: float) -> None:
    engine = _engine(start_jd)
    before = engine.get_julian_date()
    # Before the fix: step(1) at the upper bound returned 2469808.5 with fidelity "high",
    # while set_julian_date to the same epoch raised.
    with pytest.raises(ValueError, match="validated REBOUND interval"):
        engine.step(dt_days)
    assert engine.get_julian_date() == pytest.approx(before)
    with pytest.raises(ValueError, match="validated REBOUND interval"):
        engine.set_julian_date(start_jd + dt_days)


def test_step_inside_the_interval_still_advances() -> None:
    engine = _engine(SUPPORTED_JD_MAX_TDB - 10.0)
    engine.step(1.0)
    assert engine.get_julian_date() == pytest.approx(SUPPORTED_JD_MAX_TDB - 9.0, abs=1e-6)
    engine.step(-0.5)
    assert engine.get_julian_date() == pytest.approx(SUPPORTED_JD_MAX_TDB - 9.5, abs=1e-6)
