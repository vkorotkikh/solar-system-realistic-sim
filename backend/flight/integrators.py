"""Fixed-step fourth-order Runge-Kutta with exact event stops.

A run ends on the first of: an event function crossing from negative to zero or
above (located inside the step by bisection on a shortened RK4 step, so the last
step lands on the event), reaching t_end (the last step is shortened to land on
it), or the step limit. A deadline or cancellation check runs every 256 steps
(design completion C1); whatever it raises ends the run.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np

Derivative = Callable[[float, np.ndarray], np.ndarray]
CHECKPOINT_EVERY = 256
_BISECTIONS = 80


@dataclass(frozen=True)
class Event:
    name: str
    function: Callable[[float, np.ndarray], float]  # the run stops when this reaches zero from below


@dataclass(frozen=True)
class Run:
    t: np.ndarray  # sample times: the start and the end of every step
    y: np.ndarray  # states at those times, one row each
    stop: str  # an event name, "t_end" or "step_limit"
    steps: int


def rk4_step(f: Derivative, t: float, y: np.ndarray, h: float) -> np.ndarray:
    k1 = f(t, y)
    k2 = f(t + h / 2.0, y + h / 2.0 * k1)
    k3 = f(t + h / 2.0, y + h / 2.0 * k2)
    k4 = f(t + h, y + h * k3)
    return y + h / 6.0 * (k1 + 2.0 * k2 + 2.0 * k3 + k4)


def _crossing(f: Derivative, t: float, y: np.ndarray, h: float, event: Event) -> float:
    """The step length in (0, h] at which the event function first reaches zero."""
    lo, hi = 0.0, h
    for _ in range(_BISECTIONS):
        mid = 0.5 * (lo + hi)
        if mid in (lo, hi):
            break
        if event.function(t + mid, rk4_step(f, t, y, mid)) >= 0.0:
            hi = mid
        else:
            lo = mid
    return hi


def integrate(
    f: Derivative,
    t0: float,
    y0: np.ndarray,
    h: float,
    *,
    max_steps: int,
    t_end: float | None = None,
    events: Sequence[Event] = (),
    checkpoint: Callable[[], None] | None = None,
) -> Run:
    if not h > 0.0:
        raise ValueError("the step must be positive")
    t, y = float(t0), np.asarray(y0, dtype=float)
    times, states = [t], [y]
    for event in events:
        if event.function(t, y) >= 0.0:
            return Run(np.array(times), np.array(states), event.name, 0)

    for step in range(max_steps):
        if checkpoint is not None and step > 0 and step % CHECKPOINT_EVERY == 0:
            checkpoint()
        last = t_end is not None and t0 + (step + 1) * h >= t_end
        h_step = (t_end - t) if last else (t0 + (step + 1) * h - t)
        y_next = rk4_step(f, t, y, h_step)
        t_next = t_end if last else t0 + (step + 1) * h

        crossed = [event for event in events if event.function(t_next, y_next) >= 0.0]
        if crossed:
            lengths = [(_crossing(f, t, y, h_step, event), event.name) for event in crossed]
            length, name = min(lengths)
            times.append(t + length)
            states.append(rk4_step(f, t, y, length))
            return Run(np.array(times), np.array(states), name, step + 1)

        t, y = t_next, y_next
        times.append(t)
        states.append(y)
        if last:
            return Run(np.array(times), np.array(states), "t_end", step + 1)
    return Run(np.array(times), np.array(states), "step_limit", max_steps)
