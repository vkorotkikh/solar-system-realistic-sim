"""Fixed-step fourth-order Runge-Kutta with exact event stops (design: Dynamics, C1).

Expected values are closed forms: one RK4 step of y' = y from 1 is the Taylor sum
1 + h + h^2/2 + h^3/6 + h^4/24 = 1.1051708333... at h = 0.1; y' = y reaches 2 at
t = ln 2 = 0.6931471805599453.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from flight.integrators import Event, integrate, rk4_step


def growth(t, y):
    return y


def drift(t, y):
    return np.ones_like(y)


def test_one_step_matches_the_fourth_order_taylor_sum() -> None:
    assert rk4_step(growth, 0.0, np.array([1.0]), 0.1)[0] == pytest.approx(1.1051708333333333, abs=1e-15)


def test_a_time_dependent_derivative_is_sampled_at_the_half_and_full_step() -> None:
    """y' = t from 0: RK4 is exact for a quadratic, y(0.5) = 0.125."""
    assert rk4_step(lambda t, y: np.array([t]), 0.0, np.array([0.0]), 0.5)[0] == pytest.approx(0.125, abs=1e-15)


def test_a_run_stops_exactly_where_its_event_crosses_zero() -> None:
    run = integrate(growth, 0.0, np.array([1.0]), 0.01, max_steps=1_000,
                    events=[Event("doubled", lambda t, y: y[0] - 2.0)])
    assert run.stop == "doubled"
    assert run.t[-1] == pytest.approx(math.log(2.0), abs=1e-9)
    assert run.y[-1][0] == pytest.approx(2.0, abs=1e-9)


def test_an_event_already_met_at_the_start_stops_before_any_step() -> None:
    run = integrate(drift, 0.0, np.array([5.0]), 0.1, max_steps=10, events=[Event("over", lambda t, y: y[0] - 1.0)])
    assert run.stop == "over"
    assert run.steps == 0
    assert run.t[-1] == 0.0


def test_when_two_events_cross_in_one_step_the_earlier_wins() -> None:
    run = integrate(drift, 0.0, np.array([0.0]), 1.0, max_steps=100,
                    events=[Event("late", lambda t, y: y[0] - 0.75), Event("early", lambda t, y: y[0] - 0.35)])
    assert run.stop == "early"
    assert run.t[-1] == pytest.approx(0.35, abs=1e-12)


def test_a_run_lands_exactly_on_its_end_time() -> None:
    run = integrate(drift, 0.0, np.array([0.0]), 0.1, t_end=1.05, max_steps=100)
    assert run.stop == "t_end"
    assert run.t[-1] == pytest.approx(1.05, abs=1e-15)
    assert run.y[-1][0] == pytest.approx(1.05, abs=1e-12)
    assert run.steps == 11


def test_a_run_that_reaches_its_step_limit_says_so() -> None:
    run = integrate(drift, 0.0, np.array([0.0]), 0.1, max_steps=7)
    assert run.stop == "step_limit"
    assert run.steps == 7
    assert run.t[-1] == pytest.approx(0.7, abs=1e-12)


def test_the_deadline_check_runs_every_256_steps() -> None:
    calls = []
    integrate(drift, 0.0, np.array([0.0]), 0.1, max_steps=1_000, checkpoint=lambda: calls.append(1))
    assert len(calls) == 3


def test_an_expired_deadline_stops_the_run() -> None:
    def expired():
        raise TimeoutError("deadline passed")

    with pytest.raises(TimeoutError):
        integrate(drift, 0.0, np.array([0.0]), 0.1, max_steps=1_000, checkpoint=expired)


@pytest.mark.parametrize("h", [0.0, -0.1, float("nan")])
def test_a_step_that_is_not_positive_is_refused(h: float) -> None:
    with pytest.raises(ValueError):
        integrate(drift, 0.0, np.array([0.0]), h, max_steps=3)


def test_the_history_holds_the_start_and_every_step() -> None:
    run = integrate(drift, 2.0, np.array([0.0]), 0.25, max_steps=4)
    assert list(run.t) == pytest.approx([2.0, 2.25, 2.5, 2.75, 3.0])
    assert run.y.shape == (5, 1)
