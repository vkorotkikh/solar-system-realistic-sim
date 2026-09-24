"""Lambert transfer solver and porkchop window utilities."""

from __future__ import annotations

import math
from threading import Event
from typing import Any, Dict, List, Optional, Sequence, Tuple

from mission.ephemeris_service import EphemerisService
from mission.orbital import (
    MU_SUN_AU3_DAY2,
    au_per_day_to_km_per_sec,
    safe_angle_between,
    vector_cross,
    vector_length,
    vector_sub,
)


class PorkchopScanCancelled(RuntimeError):
    """Raised when a request owner cancels an in-progress grid scan."""


def _stumpff_c2(z: float) -> float:
    if z > 1e-8:
        sqrt_z = math.sqrt(z)
        return (1.0 - math.cos(sqrt_z)) / z
    if z < -1e-8:
        sqrt_neg_z = math.sqrt(-z)
        return (1.0 - math.cosh(sqrt_neg_z)) / z
    return 0.5


def _stumpff_c3(z: float) -> float:
    if z > 1e-8:
        sqrt_z = math.sqrt(z)
        return (sqrt_z - math.sin(sqrt_z)) / (sqrt_z ** 3)
    if z < -1e-8:
        sqrt_neg_z = math.sqrt(-z)
        return (math.sinh(sqrt_neg_z) - sqrt_neg_z) / (sqrt_neg_z ** 3)
    return 1.0 / 6.0


def _tof_from_z(z: float, r1_mag: float, r2_mag: float, A: float, mu: float) -> Optional[Tuple[float, float, float, float]]:
    c2 = _stumpff_c2(z)
    c3 = _stumpff_c3(z)
    if c2 <= 0.0:
        return None

    y = r1_mag + r2_mag + A * ((z * c3 - 1.0) / math.sqrt(c2))
    if y <= 0.0:
        return None

    x = math.sqrt(y / c2)
    tof = (x * x * x * c3 + A * math.sqrt(y)) / math.sqrt(mu)
    if not math.isfinite(tof):
        return None

    return tof, y, c2, c3


def _transfer_angle(r1: Sequence[float], r2: Sequence[float], *, prograde: bool) -> float:
    r1_mag = vector_length(r1)
    r2_mag = vector_length(r2)
    if r1_mag < 1e-12 or r2_mag < 1e-12:
        return 0.0

    cos_theta = max(-1.0, min(1.0, sum(r1[idx] * r2[idx] for idx in range(3)) / (r1_mag * r2_mag)))
    theta = math.acos(cos_theta)

    cross = vector_cross(r1, r2)
    z_cross = cross[2]
    if prograde:
        if z_cross < 0.0:
            theta = 2.0 * math.pi - theta
    else:
        if z_cross >= 0.0:
            theta = 2.0 * math.pi - theta
    return theta


def _solve_bracketed_z(
    z_left: float,
    z_right: float,
    tof_target: float,
    r1_mag: float,
    r2_mag: float,
    A: float,
    mu: float,
    *,
    max_iter: int,
    tol_days: float,
    left_state: Optional[Tuple[float, float, float, float]] = None,
    right_state: Optional[Tuple[float, float, float, float]] = None,
) -> Optional[Tuple[float, Tuple[float, float, float, float]]]:
    if left_state is None:
        left_state = _tof_from_z(z_left, r1_mag, r2_mag, A, mu)
    if right_state is None:
        right_state = _tof_from_z(z_right, r1_mag, r2_mag, A, mu)
    if left_state is None or right_state is None:
        return None

    f_left = left_state[0] - tof_target
    f_right = right_state[0] - tof_target
    if abs(f_left) <= tol_days:
        return z_left, left_state
    if abs(f_right) <= tol_days:
        return z_right, right_state
    if f_left * f_right > 0.0:
        return None

    best_z = z_left if abs(f_left) <= abs(f_right) else z_right
    best_state = left_state if best_z == z_left else right_state
    best_abs = min(abs(f_left), abs(f_right))
    weighted_left = f_left
    weighted_right = f_right
    last_updated = None

    for _ in range(max_iter):
        midpoint = 0.5 * (z_left + z_right)
        if abs(weighted_right - weighted_left) > 1e-14:
            z_trial = z_right - weighted_right * (z_right - z_left) / (weighted_right - weighted_left)
        else:
            z_trial = midpoint

        lower = min(z_left, z_right)
        upper = max(z_left, z_right)
        if not math.isfinite(z_trial) or z_trial <= lower or z_trial >= upper:
            z_trial = midpoint

        trial_state = _tof_from_z(z_trial, r1_mag, r2_mag, A, mu)
        if trial_state is None:
            if z_trial != midpoint:
                z_trial = midpoint
                trial_state = _tof_from_z(z_trial, r1_mag, r2_mag, A, mu)
            if trial_state is None:
                break

        f_trial = trial_state[0] - tof_target
        if abs(f_trial) < best_abs:
            best_z = z_trial
            best_state = trial_state
            best_abs = abs(f_trial)
        if abs(f_trial) <= tol_days:
            return z_trial, trial_state

        if f_left * f_trial <= 0.0:
            z_right = z_trial
            right_state = trial_state
            f_right = f_trial
            weighted_right = f_right
            weighted_left = weighted_left * 0.5 if last_updated == "right" else f_left
            last_updated = "right"
        else:
            z_left = z_trial
            left_state = trial_state
            f_left = f_trial
            weighted_left = f_left
            weighted_right = weighted_right * 0.5 if last_updated == "left" else f_right
            last_updated = "left"

        if abs(z_right - z_left) <= 1e-8:
            break

    return (best_z, best_state) if best_abs <= tol_days else None


def solve_lambert_universal(
    r1: Sequence[float],
    r2: Sequence[float],
    tof_days: float,
    *,
    mu: float = MU_SUN_AU3_DAY2,
    prograde: bool = True,
    max_iter: int = 80,
    tol_days: float = 1e-4,
) -> Optional[Dict[str, Any]]:
    """Solve Lambert's problem with universal variables in AU/day units."""

    tof_target = float(tof_days)
    if not math.isfinite(tof_target) or tof_target <= 0.0:
        return None

    r1_mag = vector_length(r1)
    r2_mag = vector_length(r2)
    if r1_mag < 1e-12 or r2_mag < 1e-12:
        return None

    theta = _transfer_angle(r1, r2, prograde=prograde)
    denominator = max(1e-15, 1.0 - math.cos(theta))
    A = math.sin(theta) * math.sqrt((r1_mag * r2_mag) / denominator)
    if abs(A) < 1e-12:
        return None

    z_min = -40.0
    z_max = 40.0
    step = 0.25

    sampled: List[Tuple[float, float, Tuple[float, float, float, float]]] = []
    z = z_min
    while z <= z_max + 1e-12:
        tof_state = _tof_from_z(z, r1_mag, r2_mag, A, mu)
        if tof_state is not None:
            sampled.append((z, tof_state[0] - tof_target, tof_state))
        z += step

    if not sampled:
        return None

    root_low: Optional[float] = None
    root_high: Optional[float] = None
    root_low_state: Optional[Tuple[float, float, float, float]] = None
    root_high_state: Optional[Tuple[float, float, float, float]] = None
    best_z = sampled[0][0]
    best_abs = abs(sampled[0][1])
    best_state = sampled[0][2]

    for idx in range(len(sampled) - 1):
        z0, f0, state0 = sampled[idx]
        z1, f1, state1 = sampled[idx + 1]
        if abs(f0) < best_abs:
            best_z = z0
            best_abs = abs(f0)
            best_state = state0
        if abs(f1) < best_abs:
            best_z = z1
            best_abs = abs(f1)
            best_state = state1
        if f0 == 0.0:
            root_low = z0
            root_high = z0
            root_low_state = state0
            root_high_state = state0
            break
        if f0 * f1 < 0.0:
            root_low = z0
            root_high = z1
            root_low_state = state0
            root_high_state = state1
            break

    root_bracketed = root_low is not None and root_high is not None

    if not root_bracketed:
        z_star = best_z
        tof_state = best_state
        if abs(tof_state[0] - tof_target) > tol_days:
            return None
    else:
        root_solution = _solve_bracketed_z(
            root_low,
            root_high,
            tof_target,
            r1_mag,
            r2_mag,
            A,
            mu,
            max_iter=max_iter,
            tol_days=tol_days,
            left_state=root_low_state,
            right_state=root_high_state,
        )
        if root_solution is None:
            return None
        z_star, tof_state = root_solution

    tof_value, y, _, _ = tof_state
    f = 1.0 - y / r1_mag
    g = A * math.sqrt(y / mu)
    if abs(g) < 1e-12:
        return None
    g_dot = 1.0 - y / r2_mag

    v1 = [(r2[idx] - f * r1[idx]) / g for idx in range(3)]
    v2 = [(g_dot * r2[idx] - r1[idx]) / g for idx in range(3)]

    return {
        "v1": v1,
        "v2": v2,
        "transferAngleDeg": math.degrees(theta),
        "computedTofDays": tof_value,
        "z": z_star,
        "rootResidualDays": abs(tof_value - tof_target),
        "rootBracketed": root_bracketed,
        "revolutions": 0,
        "pathSense": "prograde" if prograde else "retrograde",
    }


def compute_lambert_leg_from_state_vectors(
    start_position_au: Sequence[float],
    start_velocity_au_day: Sequence[float],
    end_position_au: Sequence[float],
    end_velocity_au_day: Sequence[float],
    tof_days: float,
    *,
    prograde: bool = True,
) -> Optional[Dict[str, Any]]:
    lambert = solve_lambert_universal(
        start_position_au,
        end_position_au,
        tof_days,
        prograde=prograde,
    )
    if lambert is None:
        return None

    v_depart = lambert["v1"]
    v_arrive = lambert["v2"]
    delta_v_depart = au_per_day_to_km_per_sec(vector_length(vector_sub(v_depart, start_velocity_au_day)))
    delta_v_arrive = au_per_day_to_km_per_sec(vector_length(vector_sub(end_velocity_au_day, v_arrive)))
    chord = vector_length(vector_sub(end_position_au, start_position_au))

    return {
        "tofDays": float(tof_days),
        "computedTofDays": float(lambert["computedTofDays"]),
        "solverZ": float(lambert["z"]),
        "rootResidualDays": float(lambert["rootResidualDays"]),
        "rootBracketed": bool(lambert["rootBracketed"]),
        "revolutions": int(lambert["revolutions"]),
        "pathSense": str(lambert["pathSense"]),
        "pathLengthAu": chord,
        "transferAngleDeg": float(lambert["transferAngleDeg"]),
        "deltaVDepartureKmS": delta_v_depart,
        "deltaVArrivalKmS": delta_v_arrive,
        "startPosition": list(start_position_au),
        "endPosition": list(end_position_au),
        "departureVelocityApprox": list(v_depart),
        "arrivalVelocityApprox": list(v_arrive),
        "fromPlanetVelocity": list(start_velocity_au_day),
        "toPlanetVelocity": list(end_velocity_au_day),
        "solver": "lambert_universal",
    }


def compute_lambert_leg(
    ephemeris: EphemerisService,
    from_id: str,
    to_id: str,
    departure_jd: float,
    tof_days: float,
    *,
    prograde: bool = True,
) -> Optional[Dict[str, Any]]:
    arrival_jd = float(departure_jd) + float(tof_days)
    from_state = ephemeris.sample_state(from_id, departure_jd)
    to_state = ephemeris.sample_state(to_id, arrival_jd)

    leg = compute_lambert_leg_from_state_vectors(
        from_state.position_au,
        from_state.velocity_au_day,
        to_state.position_au,
        to_state.velocity_au_day,
        tof_days,
        prograde=prograde,
    )
    if leg is None:
        return None

    leg.update(
        {
        "fromId": from_id,
        "toId": to_id,
        "departureJd": float(departure_jd),
        "arrivalJd": arrival_jd,
        "stateSource": {"from": from_state.source, "to": to_state.source},
        }
    )
    return leg


def _pareto_by_tof(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sorted_points = sorted(points, key=lambda item: (float(item["tofDays"]), float(item["totalDeltaVKmS"])))
    front: List[Dict[str, Any]] = []
    best_dv = float("inf")
    for point in sorted_points:
        dv = float(point["totalDeltaVKmS"])
        if dv + 1e-9 < best_dv:
            front.append(point)
            best_dv = dv
    return front


def scan_porkchop_window(
    ephemeris: EphemerisService,
    *,
    from_id: str,
    to_id: str,
    departure_start_jd: float,
    departure_end_jd: float,
    departure_step_days: float,
    tof_min_days: float,
    tof_max_days: float,
    tof_step_days: float,
    prograde: bool = True,
    cancel_event: Event | None = None,
) -> Dict[str, Any]:
    dep_step = max(0.5, float(departure_step_days))
    tof_step = max(5.0, float(tof_step_days))

    points: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    dep = float(departure_start_jd)
    while dep <= departure_end_jd + 1e-12:
        tof = float(tof_min_days)
        while tof <= tof_max_days + 1e-12:
            if cancel_event is not None and cancel_event.is_set():
                raise PorkchopScanCancelled("porkchop scan cancelled by request owner")
            leg = compute_lambert_leg(
                ephemeris,
                from_id,
                to_id,
                dep,
                tof,
                prograde=prograde,
            )
            if leg is None:
                failures.append(
                    {
                        "departureJd": dep,
                        "tofDays": tof,
                        "reason": "lambert_no_solution",
                    }
                )
            else:
                total_delta_v = float(leg["deltaVDepartureKmS"]) + float(leg["deltaVArrivalKmS"])
                points.append(
                    {
                        "departureJd": dep,
                        "arrivalJd": dep + tof,
                        "tofDays": tof,
                        "deltaVDepartureKmS": float(leg["deltaVDepartureKmS"]),
                        "deltaVArrivalKmS": float(leg["deltaVArrivalKmS"]),
                        "totalDeltaVKmS": total_delta_v,
                        "transferAngleDeg": float(leg["transferAngleDeg"]),
                    }
                )
            tof += tof_step
        dep += dep_step

    points.sort(key=lambda item: (float(item["totalDeltaVKmS"]), float(item["tofDays"])))
    pareto = _pareto_by_tof(points)

    return {
        "fromId": from_id,
        "toId": to_id,
        "grid": {
            "departureStartJd": float(departure_start_jd),
            "departureEndJd": float(departure_end_jd),
            "departureStepDays": dep_step,
            "tofMinDays": float(tof_min_days),
            "tofMaxDays": float(tof_max_days),
            "tofStepDays": tof_step,
            "prograde": bool(prograde),
        },
        "count": len(points),
        "best": points[0] if points else None,
        "pareto": pareto[:40],
        "points": points[:500],
        "failures": failures[:100],
    }


def estimate_turn_angle_deg(incoming_v_inf: Sequence[float], outgoing_v_inf: Sequence[float]) -> float:
    return math.degrees(safe_angle_between(incoming_v_inf, outgoing_v_inf))


__all__ = [
    "compute_lambert_leg",
    "estimate_turn_angle_deg",
    "scan_porkchop_window",
    "solve_lambert_universal",
]
