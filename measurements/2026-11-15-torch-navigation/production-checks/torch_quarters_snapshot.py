"""Constant-acceleration ("torch") trips around the Sun: accelerate, flip, decelerate.

The ship leaves one body with that body's position and velocity and must match
the other body's position and velocity on arrival. In between it feels the Sun's
gravity and a thrust of constant size. The thrust points one fixed way before the
flip and another fixed way after it, so a departure time and a thrust leave six
unknowns (two directions, two burn times) for six arrival conditions.

A course that would pass inside the keep-out distance from the Sun is solved
again with a seventh unknown, a tilt of the thrust toward `tilt_toward`: one way
over the first and last quarters of the flight and the other way over the middle
half, which bows the course around the Sun. The seventh condition puts the
closest approach just outside the keep-out distance.

Each stretch of constant thrust is integrated by Chebyshev-Picard collocation.
The unknowns come from a damped Newton iteration whose forward-difference
Jacobian rides along as extra rows of the same integration. numpy only: scipy is
installed for the tests, not for the server.

Not modelled: the planets' gravity (the orbits at each end are not costed),
relativity, and any steering finer than the two fixed directions.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from numpy.polynomial import chebyshev

from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
from planner.places import AU_KM, MU_SUN_KM3_S2

DAY_S = 86_400.0
MU_SUN = MU_SUN_KM3_S2 * DAY_S**2 / AU_KM**3  # AU^3/day^2
G_AU_DAY2 = 9.80665e-3 * DAY_S**2 / AU_KM  # 1 g in AU/day^2
KM_S = AU_KM / DAY_S  # 1 AU/day in km/s
MIN_G, MAX_G = 0.1, 12.0  # below 0.1 g the Sun bends the course too much for a two-direction burn
KEEP_OUT_AU = 0.1
PATH_ROWS = 181

NODES = 12  # collocation nodes per segment: arrival within 15 km of an independent integrator
DETOUR_NODES = 16  # at 12 the closest-approach condition is noisy at 3e-7 AU and Newton stalls
TURN = 1.0  # most a segment's path may turn or stretch, in radians and e-folds of distance
PICARD_TOL = 1e-11
NEWTON_TOL = 1e-9  # of the trip's length and of its delta-v
NEWTON_STEPS = 25
FD_STEP = 1e-7
TILT_START = 0.2  # rad
CLEARANCE = 1.0001  # a detour aims this much outside the keep-out distance

State = Callable[[float], tuple[np.ndarray, np.ndarray]]  # Julian date -> position AU, velocity AU/day
_BODIES = {body["id"]: body for body in ALL_BODIES}


class NoTrip(Exception):
    """No two-burn course was found for this departure time."""


@dataclass(frozen=True, eq=False)
class Trip:
    acceleration_g: float
    depart_jd: float
    burn_days: tuple[float, float]
    directions: tuple[np.ndarray, np.ndarray]  # unit thrust direction of each burn, before any tilt
    tilt_rad: float  # 0.0 unless the course was bent around the Sun
    tilt_toward: np.ndarray | None
    delta_v_km_s: tuple[float, float]
    flip_position_au: np.ndarray
    peak_speed_km_s: float  # relative to the Sun, at the flip
    closest_sun_au: float
    closest_sun_jd: float
    path: np.ndarray | None  # PATH_ROWS rows of [jd, x, y, z], evenly spaced in time

    @property
    def days(self) -> float:
        return self.burn_days[0] + self.burn_days[1]

    @property
    def flip_jd(self) -> float:
        return self.depart_jd + self.burn_days[0]

    @property
    def arrive_jd(self) -> float:
        return self.depart_jd + self.days


def body_state(body_id: str) -> State:
    body = _BODIES[body_id]

    def at(jd: float) -> tuple[np.ndarray, np.ndarray]:
        sample = sample_body_state_from_elements(body, jd)
        return np.array(sample["position"]), np.array(sample["velocity"])
    return at


def _unit(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector, axis=-1, keepdims=True)


def _across(direction: np.ndarray, toward: np.ndarray) -> np.ndarray:
    """Unit vectors at right angles to each direction, leaning toward `toward`."""
    return _unit(toward - (direction @ toward)[:, None] * direction)


def _tangents(direction: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    first = _unit(np.cross(direction, np.eye(3)[np.argmin(np.abs(direction))]))
    return first, np.cross(direction, first)


@lru_cache(maxsize=None)
def _ops(nodes: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Chebyshev nodes on [0, 1], the matrix that integrates node values from 0, and node values -> coefficients."""
    x = -np.cos(np.pi * np.arange(nodes + 1) / nodes)
    to_coefficients = np.linalg.inv(chebyshev.chebvander(x, nodes))
    antiderivative = np.column_stack([chebyshev.chebint(column, lbnd=-1) for column in np.eye(nodes + 1)])
    return 0.5 * (x + 1.0), 0.5 * chebyshev.chebvander(x, nodes + 1) @ antiderivative @ to_coefficients, to_coefficients


def _picard(r0, v0, thrust, days, mu, nodes):
    """One segment for every row: positions and velocities at the nodes, and whether the iteration settled."""
    tau, integrate, _ = _ops(nodes)
    s = tau[None, :, None] * days[:, None, None]
    push = thrust[:, None, :]
    R = r0[:, None, :] + v0[:, None, :] * s + 0.5 * push * s * s
    V = v0[:, None, :] + push * s
    if mu == 0.0:
        return R, V, True
    span = days[:, None, None]
    change = math.inf
    for _ in range(60):
        pull = push - mu * R * (R * R).sum(-1, keepdims=True) ** -1.5
        V_next = v0[:, None, :] + span * (integrate @ pull)
        R_next = r0[:, None, :] + span * (integrate @ V_next)
        change = max(np.abs(R_next - R).max() / max(np.abs(R_next).max(), 1e-3),
                     np.abs(V_next - V).max() / max(np.abs(V_next).max(), 1e-6))
        R, V = R_next, V_next
        if change < PICARD_TOL:
            return R, V, True
    return R, V, change < 1e-9


def _turning(points: np.ndarray) -> np.ndarray:
    """How much a path turns about the Sun and stretches in distance from it, between consecutive points."""
    distance = np.maximum(np.linalg.norm(points, axis=-1), 2e-3)
    cosine = np.clip((points[:-1] * points[1:]).sum(-1) / (distance[:-1] * distance[1:]), -1.0, 1.0)
    return np.arccos(cosine) + np.abs(np.diff(np.log(distance)))


def _splits(r0, v0, thrust, days, mu) -> np.ndarray:
    """Fractions of an arc at which to cut it so each segment turns about equally, judged on the gravity-free path."""
    tau = np.linspace(0.0, 1.0, 129)
    s = (tau * days)[:, None]
    points = r0 + v0 * s + 0.5 * thrust * s * s
    turning = _turning(points) + np.diff(tau) * days * math.sqrt(mu / max(np.linalg.norm(points, axis=-1).min(), 2e-3) ** 3)
    total = np.concatenate([[0.0], np.cumsum(turning)])
    segments = math.ceil(total[-1] / TURN)
    return np.interp(np.linspace(0.0, total[-1], segments + 1), total, tau) if segments > 1 else np.array([0.0, 1.0])


def _arc(r, v, thrust, days, mu, nodes, started, record):
    """Fly one stretch of constant thrust for every row. `record` gains (start day, days, node positions) per segment."""
    splits = _splits(r[0], v[0], thrust[0], days[0], mu) if mu else np.array([0.0, 1.0])
    for _ in range(5):
        r_now, v_now, clock, segments, turned = r, v, started, [], []
        for k in range(len(splits) - 1):
            span = days * (splits[k + 1] - splits[k])
            R, V, settled = _picard(r_now, v_now, thrust, span, mu, nodes)
            if not settled:
                break
            r_now, v_now = R[:, -1], V[:, -1]
            segments.append((clock, span[0], R))
            turned.append(_turning(R[0]).sum() if mu else 0.0)
            clock += span[0]
        else:
            if max(turned) <= 2 * TURN:
                record.extend(segments)
                return r_now, v_now
            # Gravity bent the path more than the gravity-free guess: cut the segments that turned too far.
            cut = [splits[:1]]
            for k, turn in enumerate(turned):
                parts = math.ceil(turn / TURN) if turn > 2 * TURN else 1
                cut.append(splits[k] + (splits[k + 1] - splits[k]) * np.arange(1, parts + 1) / parts)
            splits = np.concatenate(cut)
            continue
        splits = np.interp(np.arange(2 * len(splits) - 1) / 2, np.arange(len(splits)), splits)
    raise FloatingPointError("the integration did not settle")


def _closest(record, nodes):
    """Closest distance to the Sun for every row, then for row 0 the day and the position of that approach."""
    to_coefficients = _ops(nodes)[2]
    scan = np.linspace(-1.0, 1.0, 81)
    sample = chebyshev.chebvander(scan, nodes) @ to_coefficients
    rows = np.arange(record[0][2].shape[0])
    best = np.full(rows.size, np.inf)
    segment = np.zeros(rows.size, int)
    index = np.zeros(rows.size, int)
    for k, (_, _, R) in enumerate(record):
        distance = np.linalg.norm(sample @ R, axis=-1)
        nearest = distance.argmin(1)
        nearer = distance[rows, nearest] < best
        best[nearer], segment[nearer], index[nearer] = distance[rows, nearest][nearer], k, nearest[nearer]
    coefficients = np.stack([to_coefficients @ record[segment[row]][2][row] for row in rows])
    low, high = scan[np.maximum(index - 1, 0)], scan[np.minimum(index + 1, scan.size - 1)]

    def position(x):
        return np.einsum("nm,nmc->nc", chebyshev.chebvander(x, nodes), coefficients)
    for _ in range(30):  # each row narrows in on its own closest point
        left, right = low + (high - low) / 3, high - (high - low) / 3
        nearer_left = np.linalg.norm(position(left), axis=-1) < np.linalg.norm(position(right), axis=-1)
        high, low = np.where(nearer_left, right, high), np.where(nearer_left, low, left)
    at = position(0.5 * (low + high))
    started, span, _ = record[segment[0]]
    return np.linalg.norm(at, axis=-1), started + span * (0.5 * (low[0] + high[0]) + 1.0) / 2.0, at[0]


def _free_space(origin: State, target: State, depart_jd: float, acc: float):
    """The two-burn trip between the moving bodies with the Sun's gravity left out: directions and burn times.

    With the gap D(T) = rB(T) - rA - vA T and the speed difference W(T) = vB(T) - vA, burns g1 and g2
    (thrust times burn time, as vectors) must satisfy g1 + g2 = W and g1 T/2 + W t2/2 = D, with
    |g1| = a t1, |g2| = a t2 and t1 + t2 = T. Bodies at rest give T = 2 sqrt(|D|/a).
    """
    r0, v0 = origin(depart_jd)

    def gap(days):
        r, v = target(depart_jd + days)
        return r - r0 - v0 * days, v - v0

    def burns(days, share):
        distance, speed = gap(days)
        first = (2.0 * distance - speed * (1.0 - share) * days) / days
        return first, speed - first

    def miss(days, share):
        first, second = burns(days, share)
        return np.array([np.linalg.norm(first) / (acc * days) - share, np.linalg.norm(second) / (acc * days) - (1.0 - share)])

    days = 2.0 * math.sqrt(np.linalg.norm(gap(1.0)[0]) / acc)
    for _ in range(6):
        days = 2.0 * math.sqrt(np.linalg.norm(gap(days)[0]) / acc)
    equal_burns, share = days, 0.5
    for _ in range(60):
        error = miss(days, share)
        if np.abs(error).max() < 1e-12:
            break
        slope = np.column_stack([(miss(days * (1.0 + 1e-6), share) - error) / (1e-6 * days),
                                 (miss(days, share + 1e-6) - error) / 1e-6])
        try:
            step = np.linalg.solve(slope, -error)
        except np.linalg.LinAlgError:
            break
        for damping in 0.5 ** np.arange(8):
            trial = days + damping * step[0], share + damping * step[1]
            if trial[0] > 0.0 and 1e-3 < trial[1] < 1.0 - 1e-3 and np.abs(miss(*trial)).max() < np.abs(error).max():
                break
        else:
            break
        days, share = trial
    if np.abs(miss(days, share)).max() >= 1e-9:  # did not settle: equal burns straight along the gap
        along = _unit(gap(equal_burns)[0])
        return along, -along, equal_burns / 2.0, equal_burns / 2.0
    first, second = burns(days, share)
    return _unit(first), _unit(second), share * days, (1.0 - share) * days


def _straight_at_target(origin: State, target: State, depart_jd: float, acc: float):
    """A cruder start: equal burns along the line to where the target will be."""
    r0 = origin(depart_jd)[0]
    half = 0.0
    for _ in range(8):
        half = math.sqrt(np.linalg.norm(target(depart_jd + 2.0 * half)[0] - r0) / acc)
    aim = _unit(target(depart_jd + 2.0 * half)[0] - r0)
    return aim, -aim, half, half


def _newton(origin, target, depart_jd, acc, mu, start, nodes, toward=None, keep_au=0.0):
    """Solve for the directions, burn times and (with `toward`) tilt. None when the iteration does not converge."""
    e1, e2, t1, t2 = start
    tilt = 0.0 if toward is None else TILT_START
    unknowns = 6 if toward is None else 7
    r0, v0 = origin(depart_jd)
    days = t1 + t2
    length = max(np.linalg.norm(target(depart_jd + days)[0] - r0), 1e-3)
    scale = np.array([length] * 3 + [max(acc * days, 1e-6)] * 3 + [length])[:unknowns]
    reach = np.array([1.0] * 4 + [days] * 2 + [1.0])[:unknowns]

    def fly(e1, e2, t1, t2, tilt):
        """Row 0 is the course itself; row k + 1 has unknown k nudged. Returns the miss, its Jacobian and the course."""
        nudge = np.zeros((unknowns + 1, 7))
        nudge[1 + np.arange(unknowns), np.arange(unknowns)] = FD_STEP * reach
        (a1, b1), (a2, b2) = _tangents(e1), _tangents(e2)
        first = _unit(e1 + nudge[:, 0:1] * a1 + nudge[:, 1:2] * b1)
        second = _unit(e2 + nudge[:, 2:3] * a2 + nudge[:, 3:4] * b2)
        flip, tilts = t1 + nudge[:, 4], tilt + nudge[:, 6]
        total = flip + t2 + nudge[:, 5]
        cuts = [0.0 * total, flip, total]
        if toward is not None:
            cuts = sorted([*cuts, 0.25 * total, 0.75 * total], key=lambda cut: cut[0])
        r, v = np.tile(r0, (unknowns + 1, 1)), np.tile(v0, (unknowns + 1, 1))
        record, at_flip = [], None
        for begin, end in zip(cuts[:-1], cuts[1:]):
            middle = 0.5 * (begin[0] + end[0])
            thrust = first if middle < flip[0] else second
            if toward is not None:
                side = 1.0 if middle < 0.25 * total[0] or middle > 0.75 * total[0] else -1.0
                thrust = np.cos(tilts)[:, None] * thrust + side * np.sin(tilts)[:, None] * _across(thrust, toward)
            r, v = _arc(r, v, acc * thrust, end - begin, mu, nodes, begin[0], record)
            if end is flip:
                at_flip = r[0], v[0]
        arrival = [target(depart_jd + day) for day in total]
        miss = np.column_stack([r - [state[0] for state in arrival], v - [state[1] for state in arrival]])
        if toward is not None:
            miss = np.column_stack([miss, _closest(record, nodes)[0] - keep_au])
        return miss[0], ((miss[1:] - miss[0]) / (FD_STEP * reach)[:, None]).T, (record, at_flip)

    try:
        miss, jacobian, course = fly(e1, e2, t1, t2, tilt)
    except FloatingPointError:
        return None
    size = np.abs(miss / scale).max()
    for _ in range(NEWTON_STEPS):
        if size < NEWTON_TOL:
            break
        try:
            step = np.linalg.solve(jacobian / scale[:, None] * reach, -miss / scale)
        except np.linalg.LinAlgError:
            return None
        # Never turn a direction by more than 0.8 rad, shrink a burn to nothing, or tilt by more than 0.3 rad in one step.
        damping = min(1.0, 0.8 / max(np.abs(step[:4]).max(), 1e-300),
                      1.0 / max((np.abs(step[4:6]) * days / np.array([t1, t2])).max(), 1e-300))
        if toward is not None:
            damping = min(damping, 0.3 / max(abs(step[6]), 1e-300))
        (a1, b1), (a2, b2) = _tangents(e1), _tangents(e2)
        for _ in range(12):
            move = damping * step * reach
            trial = (_unit(e1 + move[0] * a1 + move[1] * b1), _unit(e2 + move[2] * a2 + move[3] * b2),
                     t1 + move[4], t2 + move[5], tilt + (move[6] if toward is not None else 0.0))
            if trial[2] > 0.0 and trial[3] > 0.0:
                try:
                    flown = fly(*trial)
                except FloatingPointError:
                    flown = None
                if flown is not None and np.abs(flown[0] / scale).max() < size * (1.0 - 1e-4 * damping):
                    break
            damping *= 0.5
        else:
            return None
        (e1, e2, t1, t2, tilt), (miss, jacobian, course) = trial, flown
        size = np.abs(miss / scale).max()
    return (e1, e2, t1, t2, tilt, *course) if size < NEWTON_TOL else None


def _path(record, nodes, depart_jd, days, first, last) -> np.ndarray:
    to_coefficients = _ops(nodes)[2]
    times = np.linspace(0.0, days, PATH_ROWS)
    segment = np.clip(np.searchsorted([started for started, _, _ in record], times, side="right") - 1, 0, len(record) - 1)
    rows = np.empty((PATH_ROWS, 4))
    rows[:, 0] = depart_jd + times
    for k, (started, span, R) in enumerate(record):
        here = segment == k
        x = np.clip(2.0 * (times[here] - started) / max(span, 1e-300) - 1.0, -1.0, 1.0)
        rows[here, 1:] = chebyshev.chebvander(x, nodes) @ (to_coefficients @ R[0])
    rows[0, 1:], rows[-1, 1:] = first, last  # the bodies' own centres, so a drawn course meets the drawn bodies
    return rows


def solve_between(origin: State, target: State, depart_jd: float, acceleration_g: float, *, mu: float = MU_SUN,
                  keep_out_au: float = KEEP_OUT_AU, want_path: bool = False) -> Trip:
    """The torch trip leaving `origin` at `depart_jd`. Raises NoTrip when none is found."""
    if not MIN_G <= acceleration_g <= MAX_G:
        raise ValueError(f"acceleration must be between {MIN_G} and {MAX_G} g")
    acc = acceleration_g * G_AU_DAY2
    nodes, toward, solved = NODES, None, None
    for start in (_free_space, _straight_at_target):
        solved = _newton(origin, target, depart_jd, acc, mu, start(origin, target, depart_jd, acc), nodes)
        if solved is not None:
            break
    else:
        raise NoTrip("the two-burn solve did not converge")
    closest, closest_day, closest_position = _closest(solved[5], nodes)
    if closest[0] < keep_out_au:
        nodes = DETOUR_NODES
        toward = _unit(closest_position) if closest[0] >= 1e-3 else np.array([0.0, 0.0, 1.0])
        solved = _newton(origin, target, depart_jd, acc, mu, solved[:4], nodes, toward, keep_out_au * CLEARANCE)
        if solved is None:
            raise NoTrip("no course that clears the Sun was found")
        closest, closest_day, _ = _closest(solved[5], nodes)
    e1, e2, t1, t2, tilt, record, (flip_position, flip_velocity) = solved
    days = t1 + t2
    return Trip(
        acceleration_g=acceleration_g,
        depart_jd=depart_jd,
        burn_days=(float(t1), float(t2)),
        directions=(e1, e2),
        tilt_rad=float(tilt),
        tilt_toward=toward,
        delta_v_km_s=(float(acc * t1 * KM_S), float(acc * t2 * KM_S)),
        flip_position_au=flip_position,
        peak_speed_km_s=float(np.linalg.norm(flip_velocity) * KM_S),
        closest_sun_au=float(closest[0]),
        closest_sun_jd=float(depart_jd + closest_day),
        path=_path(record, nodes, depart_jd, days, origin(depart_jd)[0], target(depart_jd + days)[0]) if want_path else None,
    )


def solve(origin_id: str, target_id: str, depart_jd: float, acceleration_g: float, **options) -> Trip:
    """The torch trip between two catalog bodies that orbit the Sun."""
    return solve_between(body_state(origin_id), body_state(target_id), depart_jd, acceleration_g, **options)


def free_space_days(origin_id: str, target_id: str, depart_jd: float, acceleration_g: float) -> float:
    """Flight time with the Sun's gravity left out: a third of a millisecond, for ranking departure days."""
    start = _free_space(body_state(origin_id), body_state(target_id), depart_jd, acceleration_g * G_AU_DAY2)
    return float(start[2] + start[3])
