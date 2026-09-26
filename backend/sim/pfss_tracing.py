"""Shared scalar/batch PFSS tracing; all geometry is in solar radii.

Only a physical shell-boundary crossing determines topology. Weak fields
(magnitude <= 1e-12 in the evaluator's Gauss units), invalid stages, stalled
steps, and exhausted budgets leave topology indeterminate. Display rounding
belongs to consumers, never to this integrator.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

TraceState = Literal['open', 'closed', 'indeterminate']
WEAK_FIELD_THRESHOLD = 1e-12


@dataclass(frozen=True)
class TraceTermination:
    state: TraceState
    reason: str
    steps: int
    endpoint_radius_residual: float | None


@dataclass(frozen=True)
class BoundaryIntersection:
    state: TraceState
    fraction: float
    endpoint: np.ndarray


@dataclass
class TraceResult:
    termination: TraceTermination
    endpoint: np.ndarray
    endpoint_field: np.ndarray | None
    polarity: int
    arc: np.ndarray


@dataclass
class BatchTraceResult:
    states: np.ndarray
    reasons: np.ndarray
    steps: np.ndarray
    endpoints: np.ndarray
    endpoint_fields: np.ndarray
    endpoint_radius_residuals: np.ndarray
    polarities: np.ndarray
    initial_fields: np.ndarray
    arcs: list[list[np.ndarray]] | None


def safe_norm(vectors: np.ndarray) -> np.ndarray:
    """Avoid the premature overflow/underflow of sum-of-squares norms."""
    with np.errstate(over='ignore', invalid='ignore'):
        return np.hypot.reduce(np.asarray(vectors, dtype=float), axis=-1)


def _directions(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Scaled normalization remains usable even when the true norm overflows."""
    values = np.asarray(values, dtype=float)
    finite = np.isfinite(values).all(axis=1)
    scale = np.max(np.abs(values), axis=1)
    scaled = np.zeros_like(values)
    np.divide(values, scale[:, None], out=scaled, where=(finite & (scale > 0))[:, None])
    length = safe_norm(scaled)
    weak = scale <= WEAK_FIELD_THRESHOLD / np.where(length > 0, length, 1)
    reasons = np.full(len(values), '', dtype=object)
    reasons[weak] = 'weak_field'
    reasons[~finite] = 'nonfinite_field'
    direction = np.zeros_like(values)
    np.divide(scaled, length[:, None], out=direction, where=(reasons == '')[:, None])
    return direction, reasons


def _boundary_intersections(starts, ends, r_ss):
    """Vectorized stable quadratic roots, ordered across both shell boundaries."""
    starts = np.asarray(starts, dtype=float)
    ends = np.asarray(ends, dtype=float)
    delta = ends - starts
    # Solve for distance along a unit segment direction. Scaling both ends by
    # an enormous overshoot would underflow the sphere's quadratic coefficient.
    scale = np.maximum(np.max(np.abs(starts), axis=1), r_ss)
    delta_scale = np.max(np.abs(delta), axis=1)
    d = np.zeros_like(delta)
    np.divide(delta, delta_scale[:, None], out=d, where=(delta_scale > 0)[:, None])
    d_norm = safe_norm(d)
    np.divide(d, d_norm[:, None], out=d, where=(d_norm > 0)[:, None])
    length = (delta_scale / scale) * d_norm
    p = starts / scale[:, None]
    a = np.sum(d * d, axis=1)
    b = 2 * np.sum(p * d, axis=1)
    best = np.full(len(starts), np.inf)
    states = np.full(len(starts), '', dtype=object)
    # A nonzero tangent at the outer boundary leaves the shell immediately,
    # despite its zero radial derivative. Inward self-hits still do not count.
    outer_departure = (a > 0) & (safe_norm(starts) == r_ss) & (b >= 0)
    best[outer_departure] = 0.0
    states[outer_departure] = 'open'
    for radius, state, orientation in [(1.0, 'closed', -1), (r_ss, 'open', 1)]:
        c = np.sum(p * p, axis=1) - (radius / scale)**2
        disc = b*b - 4*a*c
        valid = (a > 0) & (disc >= 0) & np.isfinite(disc)
        root = np.sqrt(np.maximum(disc, 0))
        q = -0.5 * (b + np.copysign(root, b))
        t1 = np.full(len(starts), np.inf)
        t2 = t1.copy()
        np.divide(q, a, out=t1, where=valid)
        np.divide(c, q, out=t2, where=valid & (q != 0))
        for t in (t1, t2):
            # The derivative selects entry into the inner sphere or exit from
            # the outer sphere. Inward-shell t=0 self-hits are thus rejected;
            # interior tangencies do not establish either topology. Immediate
            # outer-boundary departures were handled above.
            with np.errstate(invalid='ignore'):
                crossing = orientation * (b + 2*a*t) > 0
            accept = valid & (t >= -1e-14) & (t <= length + 1e-14) & crossing & (t < best)
            best[accept] = np.clip(t[accept], 0, length[accept])
            states[accept] = state
    points = ends.copy()
    hit = np.isfinite(best)
    points[hit] = starts[hit] + (best[hit] * scale[hit])[:, None] * d[hit]
    fractions = np.full(len(starts), np.inf)
    np.divide(best, length, out=fractions, where=hit)
    return states, fractions, points


def first_boundary_intersection(start, end, r_ss: float) -> BoundaryIntersection | None:
    """Return the earliest physical segment crossing, including through-sphere steps."""
    pair = np.asarray([start, end], dtype=float)
    if not np.isfinite(pair).all():
        return None
    states, fractions, points = _boundary_intersections(pair[:1], pair[1:], r_ss)
    if not states[0]:
        return None
    return BoundaryIntersection(states[0], float(fractions[0]), points[0])


def trace_field_batch(field, starts, *, max_steps=300, step_size=0.02, record_arcs=False) -> BatchTraceResult:
    """Trace independently masked RK4 lanes using evaluate_cartesian_batch."""
    positions = np.asarray(starts, dtype=float).reshape(-1, 3).copy()
    count = len(positions)
    states = np.full(count, 'indeterminate', dtype=object)
    reasons = np.full(count, 'max_steps', dtype=object)
    steps = np.zeros(count, dtype=int)
    residuals = np.full(count, np.nan)
    endpoint_fields = np.full_like(positions, np.nan)
    initial_fields = np.full_like(positions, np.nan)
    polarities = np.ones(count, dtype=int)
    active = np.ones(count, dtype=bool)
    arcs = [[p.copy()] for p in positions] if record_arcs else None

    def evaluate(indices, points):
        directions = np.zeros_like(points)
        values = np.full_like(points, np.nan)
        failures = np.full(len(indices), '', dtype=object)
        finite = np.isfinite(points).all(axis=1)
        failures[~finite] = 'nonfinite_position'
        if finite.any():
            values[finite] = np.asarray(field.evaluate_cartesian_batch(*points[finite].T)).T
            directions[finite], failures[finite] = _directions(values[finite])
        bad = failures != ''
        reasons[indices[bad]] = failures[bad]
        active[indices[bad]] = False
        return directions, values

    indices = np.arange(count)
    directions, initial_fields = evaluate(indices, positions)
    polarities[:] = np.where(np.sum(directions * positions, axis=1) > 0, 1, -1)
    # No stage is evaluated for an exhausted zero-step budget.
    for _ in range(max(0, int(max_steps))):
        indices = np.flatnonzero(active)
        if not len(indices):
            break
        base = positions[indices].copy()
        stages = []
        for stage in range(4):
            if stage == 0:
                points = base
            else:
                with np.errstate(over='ignore', invalid='ignore'):
                    points = base + stages[-1] * step_size * (0.5 if stage < 3 else 1.0)
            live = active[indices]
            direction = np.zeros_like(base)
            if live.any():
                direction[live], _ = evaluate(indices[live], points[live])
            stages.append(direction * polarities[indices, None])
        live = active[indices]
        indices, base = indices[live], base[live]
        if not len(indices):
            continue
        k1, k2, k3, k4 = [stage[live] for stage in stages]
        with np.errstate(over='ignore', invalid='ignore'):
            proposed = base + step_size * (k1 + 2*k2 + 2*k3 + k4) / 6
        finite = np.isfinite(proposed).all(axis=1)
        stalled = safe_norm(proposed - base) <= 1e-14
        reasons[indices[~finite]] = 'nonfinite_result'
        reasons[indices[finite & stalled]] = 'stalled'
        good = finite & ~stalled
        active[indices[~good]] = False
        indices, base, proposed = indices[good], base[good], proposed[good]
        if not len(indices):
            continue
        hit_states, _, endpoints = _boundary_intersections(base, proposed, field.r_ss)
        positions[indices] = endpoints
        steps[indices] += 1
        if arcs is not None:
            for index, point in zip(indices, endpoints):
                arcs[index].append(point.copy())
        hit = hit_states != ''
        hit_indices = indices[hit]
        if len(hit_indices):
            _, values = evaluate(hit_indices, endpoints[hit])
            endpoint_fields[hit_indices] = values
            valid = active[hit_indices]
            confirmed = hit_indices[valid]
            states[confirmed] = hit_states[hit][valid]
            reasons[confirmed] = np.where(states[confirmed] == 'open', 'source_surface', 'photosphere')
            radii = np.where(states[confirmed] == 'open', field.r_ss, 1.0)
            residuals[confirmed] = np.abs(safe_norm(positions[confirmed]) - radii)
            active[hit_indices] = False
    return BatchTraceResult(states, reasons, steps, positions, endpoint_fields, residuals, polarities, initial_fields, arcs)


def trace_field(field, start, *, max_steps=300, step_size=0.02) -> TraceResult:
    """Scalar evaluator adapter with exactly the batch engine's stage semantics."""
    class ScalarAdapter:
        r_ss = field.r_ss

        def evaluate_cartesian_batch(self, x, y, z):
            return np.asarray([field.evaluate_cartesian(*p) for p in zip(x, y, z)]).T

    result = trace_field_batch(ScalarAdapter(), [start], max_steps=max_steps, step_size=step_size, record_arcs=True)
    residual = result.endpoint_radius_residuals[0]
    values = result.endpoint_fields[0]
    return TraceResult(
        TraceTermination(result.states[0], result.reasons[0], int(result.steps[0]), float(residual) if np.isfinite(residual) else None),
        result.endpoints[0], values if np.isfinite(values).all() else None,
        int(result.polarities[0]), np.asarray(result.arcs[0]),
    )
