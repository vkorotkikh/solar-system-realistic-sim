"""Lambert transfer solver and porkchop window utilities."""

from __future__ import annotations

import math
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

    sampled: List[Tuple[float, float]] = []
    z = z_min
    while z <= z_max + 1e-12:
        tof_state = _tof_from_z(z, r1_mag, r2_mag, A, mu)
        if tof_state is not None:
            sampled.append((z, tof_state[0] - tof_target))
        z += step

    if not sampled:
        return None

    root_low: Optional[float] = None
    root_high: Optional[float] = None
    best_z = sampled[0][0]
    best_abs = abs(sampled[0][1])

    for idx in range(len(sampled) - 1):
        z0, f0 = sampled[idx]
        z1, f1 = sampled[idx + 1]
        if abs(f0) < best_abs:
            best_z = z0
            best_abs = abs(f0)
        if abs(f1) < best_abs:
            best_z = z1
            best_abs = abs(f1)
        if f0 == 0.0:
            root_low = z0
            root_high = z0
            break
        if f0 * f1 < 0.0:
            root_low = z0
            root_high = z1
            break

    if root_low is None or root_high is None:
        z_star = best_z
        tof_state = _tof_from_z(z_star, r1_mag, r2_mag, A, mu)
        if tof_state is None:
            return None
    else:
        z_left = root_low
        z_right = root_high
        z_star = 0.5 * (z_left + z_right)
        tof_state = None

        for _ in range(max_iter):
            z_star = 0.5 * (z_left + z_right)
            tof_state = _tof_from_z(z_star, r1_mag, r2_mag, A, mu)
            if tof_state is None:
                z_left = z_star + 1e-4
                continue

            f_mid = tof_state[0] - tof_target
            if abs(f_mid) <= tol_days:
                break

            tof_left = _tof_from_z(z_left, r1_mag, r2_mag, A, mu)
            if tof_left is None:
                z_left += 1e-4
                continue

            f_left = tof_left[0] - tof_target
            if f_left * f_mid <= 0.0:
                z_right = z_star
            else:
                z_left = z_star

        if tof_state is None:
            tof_state = _tof_from_z(z_star, r1_mag, r2_mag, A, mu)
            if tof_state is None:
                return None

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

    lambert = solve_lambert_universal(
        from_state.position_au,
        to_state.position_au,
        tof_days,
        prograde=prograde,
    )
    if lambert is None:
        return None

    v_depart = lambert["v1"]
    v_arrive = lambert["v2"]
    delta_v_depart = au_per_day_to_km_per_sec(vector_length(vector_sub(v_depart, from_state.velocity_au_day)))
    delta_v_arrive = au_per_day_to_km_per_sec(vector_length(vector_sub(to_state.velocity_au_day, v_arrive)))

    chord = vector_length(vector_sub(to_state.position_au, from_state.position_au))

    return {
        "fromId": from_id,
        "toId": to_id,
        "departureJd": float(departure_jd),
        "arrivalJd": arrival_jd,
        "tofDays": float(tof_days),
        "pathLengthAu": chord,
        "transferAngleDeg": float(lambert["transferAngleDeg"]),
        "deltaVDepartureKmS": delta_v_depart,
        "deltaVArrivalKmS": delta_v_arrive,
        "startPosition": list(from_state.position_au),
        "endPosition": list(to_state.position_au),
        "departureVelocityApprox": list(v_depart),
        "arrivalVelocityApprox": list(v_arrive),
        "fromPlanetVelocity": list(from_state.velocity_au_day),
        "toPlanetVelocity": list(to_state.velocity_au_day),
        "stateSource": {"from": from_state.source, "to": to_state.source},
        "solver": "lambert_universal",
    }


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
) -> Dict[str, Any]:
    dep_step = max(0.5, float(departure_step_days))
    tof_step = max(5.0, float(tof_step_days))

    points: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    dep = float(departure_start_jd)
    while dep <= departure_end_jd + 1e-12:
        tof = float(tof_min_days)
        while tof <= tof_max_days + 1e-12:
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
