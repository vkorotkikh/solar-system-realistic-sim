"""
Course/trajectory planning utilities.

Implements a lightweight patched-conic style route scorer with optional
gravity assists. This is intentionally fast and deterministic so it can
run in API requests without standing up a heavy optimizer.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional, Tuple

AU_KM = 149_597_870.7
AU_M = 149_597_870_700.0
DAY_SECONDS = 86_400.0
G_SI = 6.67430e-11
J2000_JD = 2_451_545.0
MU_SUN_AU3_DAY2 = 0.0002959122082855911
TWO_PI = 2.0 * math.pi


def _au_per_day_to_km_per_sec(value: float) -> float:
    return (value * AU_KM) / DAY_SECONDS


def _mu_au3_day2_from_mass_kg(mass_kg: float) -> float:
    mu_si = G_SI * mass_kg
    return (mu_si * DAY_SECONDS * DAY_SECONDS) / (AU_M * AU_M * AU_M)


def _normalize_radians(angle: float) -> float:
    reduced = angle % TWO_PI
    return reduced if reduced >= 0 else reduced + TWO_PI


def _solve_kepler(mean_anomaly_rad: float, eccentricity: float) -> float:
    e = max(0.0, min(0.9999999, eccentricity))
    eccentric_anomaly = mean_anomaly_rad if e < 0.8 else math.pi

    for _ in range(20):
        f = eccentric_anomaly - e * math.sin(eccentric_anomaly) - mean_anomaly_rad
        f_prime = 1.0 - e * math.cos(eccentric_anomaly)
        if abs(f_prime) < 1e-15:
            break
        delta = f / f_prime
        eccentric_anomaly -= delta
        if abs(delta) < 1e-9:
            break

    return eccentric_anomaly


def _propagate_kepler_orbit(orbit: Dict[str, Any], elapsed_days: float) -> Tuple[List[float], List[float]]:
    a = float(orbit["a_au"])
    e = max(0.0, min(0.9999999, float(orbit.get("e", 0.0))))
    i = math.radians(float(orbit.get("i_deg", 0.0)))
    ascending_node = math.radians(float(orbit.get("ascending_node_deg", 0.0)))
    arg_periapsis = math.radians(float(orbit.get("arg_periapsis_deg", 0.0)))
    mean_anomaly_0 = math.radians(float(orbit.get("mean_anomaly_deg", 0.0)))
    period = float(orbit["period_days"])

    mean_motion = TWO_PI / period
    mean_anomaly = _normalize_radians(mean_anomaly_0 + mean_motion * elapsed_days)
    eccentric_anomaly = _solve_kepler(mean_anomaly, e)

    cos_e = math.cos(eccentric_anomaly)
    sin_e = math.sin(eccentric_anomaly)
    sqrt_one_minus_e2 = math.sqrt(1.0 - e * e)
    radius = a * (1.0 - e * cos_e)

    cos_nu = (cos_e - e) / (1.0 - e * cos_e)
    sin_nu = (sqrt_one_minus_e2 * sin_e) / (1.0 - e * cos_e)
    true_anomaly = math.atan2(sin_nu, cos_nu)

    arg_latitude = arg_periapsis + true_anomaly
    cos_u = math.cos(arg_latitude)
    sin_u = math.sin(arg_latitude)
    cos_node = math.cos(ascending_node)
    sin_node = math.sin(ascending_node)
    cos_i = math.cos(i)
    sin_i = math.sin(i)

    x = radius * (cos_node * cos_u - sin_node * sin_u * cos_i)
    y = radius * (sin_node * cos_u + cos_node * sin_u * cos_i)
    z = radius * (sin_u * sin_i)

    factor = (mean_motion * a) / (1.0 - e * cos_e)
    vx_perifocal = -factor * sin_e
    vy_perifocal = factor * sqrt_one_minus_e2 * cos_e

    cos_arg = math.cos(arg_periapsis)
    sin_arg = math.sin(arg_periapsis)
    vx_1 = vx_perifocal * cos_arg - vy_perifocal * sin_arg
    vy_1 = vx_perifocal * sin_arg + vy_perifocal * cos_arg

    vx_2 = vx_1
    vy_2 = vy_1 * cos_i
    vz_2 = vy_1 * sin_i

    vx = vx_2 * cos_node - vy_2 * sin_node
    vy = vx_2 * sin_node + vy_2 * cos_node
    vz = vz_2

    return [x, y, z], [vx, vy, vz]


def _vector_sub(a: List[float], b: List[float]) -> List[float]:
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _vector_dot(a: List[float], b: List[float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _vector_cross(a: List[float], b: List[float]) -> List[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def _vector_length(v: List[float]) -> float:
    return math.sqrt(_vector_dot(v, v))


def _safe_angle_between(a: List[float], b: List[float]) -> float:
    denom = max(1e-9, _vector_length(a) * _vector_length(b))
    cos_theta = max(-1.0, min(1.0, _vector_dot(a, b) / denom))
    return math.acos(cos_theta)


def _sample_body_state(body: Dict[str, Any], jd: float) -> Dict[str, List[float]]:
    orbit = body.get("orbit")
    if not orbit:
        return {"position": [0.0, 0.0, 0.0], "velocity": [0.0, 0.0, 0.0]}

    epoch_jd = float(orbit.get("epoch_jd", J2000_JD))
    elapsed_days = jd - epoch_jd
    position, velocity = _propagate_kepler_orbit(orbit, elapsed_days)
    return {"position": position, "velocity": velocity}


def _compute_hohmann_leg(
    body_by_id: Dict[str, Dict[str, Any]],
    from_id: str,
    to_id: str,
    departure_jd: float,
) -> Dict[str, Any]:
    from_at_departure = _sample_body_state(body_by_id[from_id], departure_jd)
    to_at_departure = _sample_body_state(body_by_id[to_id], departure_jd)

    r1 = _vector_length(from_at_departure["position"])
    r2 = _vector_length(to_at_departure["position"])

    # Light phasing refinement: one fixed-point iteration on destination radius.
    for _ in range(2):
        transfer_a = 0.5 * (r1 + r2)
        tof_days = math.pi * math.sqrt((transfer_a ** 3) / MU_SUN_AU3_DAY2)
        to_at_arrival = _sample_body_state(body_by_id[to_id], departure_jd + tof_days)
        r2 = _vector_length(to_at_arrival["position"])

    transfer_a = 0.5 * (r1 + r2)
    tof_days = math.pi * math.sqrt((transfer_a ** 3) / MU_SUN_AU3_DAY2)
    arrival_jd = departure_jd + tof_days

    from_state = _sample_body_state(body_by_id[from_id], departure_jd)
    to_state = _sample_body_state(body_by_id[to_id], arrival_jd)

    v_circular_1 = math.sqrt(MU_SUN_AU3_DAY2 / r1)
    v_circular_2 = math.sqrt(MU_SUN_AU3_DAY2 / r2)
    v_transfer_1 = math.sqrt(MU_SUN_AU3_DAY2 * (2.0 / r1 - 1.0 / transfer_a))
    v_transfer_2 = math.sqrt(MU_SUN_AU3_DAY2 * (2.0 / r2 - 1.0 / transfer_a))

    delta_v_departure_kms = _au_per_day_to_km_per_sec(abs(v_transfer_1 - v_circular_1))
    delta_v_arrival_kms = _au_per_day_to_km_per_sec(abs(v_circular_2 - v_transfer_2))

    average_velocity = [
        (to_state["position"][idx] - from_state["position"][idx]) / max(tof_days, 1e-9)
        for idx in range(3)
    ]

    return {
        "fromId": from_id,
        "toId": to_id,
        "departureJd": departure_jd,
        "arrivalJd": arrival_jd,
        "tofDays": tof_days,
        "pathLengthAu": math.pi * transfer_a,
        "transferSemiMajorAu": transfer_a,
        "deltaVDepartureKmS": delta_v_departure_kms,
        "deltaVArrivalKmS": delta_v_arrival_kms,
        "startPosition": list(from_state["position"]),
        "endPosition": list(to_state["position"]),
        "departureVelocityApprox": list(average_velocity),
        "arrivalVelocityApprox": list(average_velocity),
    }


def _evaluate_assist(
    body_by_id: Dict[str, Dict[str, Any]],
    assist_body_id: str,
    incoming_leg: Dict[str, Any],
    outgoing_leg: Dict[str, Any],
) -> Dict[str, Any]:
    body = body_by_id[assist_body_id]
    mass_kg = body.get("mass_kg")
    radius_km = body.get("radius_km")
    if not mass_kg or not radius_km:
        return {
            "assistGainKmS": 0.0,
            "requiredTurnDeg": 0.0,
            "maxTurnDeg": 0.0,
            "feasible": True,
        }

    encounter_jd = float(incoming_leg["arrivalJd"])
    body_state = _sample_body_state(body, encounter_jd)
    body_velocity = body_state["velocity"]

    v_inf_in = _vector_sub(incoming_leg["arrivalVelocityApprox"], body_velocity)
    v_inf_out = _vector_sub(outgoing_leg["departureVelocityApprox"], body_velocity)

    v_inf_mag_au_day = 0.5 * (_vector_length(v_inf_in) + _vector_length(v_inf_out))
    v_inf_mag_kms = _au_per_day_to_km_per_sec(v_inf_mag_au_day)
    required_turn = _safe_angle_between(v_inf_in, v_inf_out)

    mu_body = _mu_au3_day2_from_mass_kg(float(mass_kg))
    rp_au = (float(radius_km) + 300.0) / AU_KM

    max_turn = 0.0
    if mu_body > 0 and v_inf_mag_au_day > 1e-8:
        denominator = 1.0 + (rp_au * v_inf_mag_au_day * v_inf_mag_au_day) / mu_body
        max_turn = 2.0 * math.asin(min(1.0, 1.0 / denominator))

    applied_turn = min(required_turn, max_turn)
    assist_gain_kms = 2.0 * v_inf_mag_kms * math.sin(applied_turn / 2.0)

    return {
        "assistGainKmS": assist_gain_kms,
        "requiredTurnDeg": math.degrees(required_turn),
        "maxTurnDeg": math.degrees(max_turn),
        "feasible": required_turn <= max_turn + 1e-6,
    }


def _score_route(route: Dict[str, Any], objective: str) -> float:
    if objective == "max_assist":
        return (
            route["totalAssistGainKmS"] * 4.0
            - route["totalDeltaVKmS"] * 0.9
            - route["totalPathLengthAu"] * 0.05
            - route["totalTimeDays"] * 0.001
            - route["turnDeficitPenalty"] * 2.0
        )

    return (
        -route["totalPathLengthAu"] * 1.6
        - route["totalDeltaVKmS"] * 0.4
        - route["totalTimeDays"] * 0.002
        + route["totalAssistGainKmS"] * 0.05
        - route["turnDeficitPenalty"] * 1.5
    )


def _generate_assist_routes(
    start_id: str,
    end_id: str,
    assist_pool: Iterable[str],
    max_assists: int,
) -> List[List[str]]:
    routes: List[List[str]] = [[start_id, end_id]]
    pool = [item for item in assist_pool if item not in (start_id, end_id)]

    def backtrack(path: List[str], remaining_depth: int) -> None:
        if remaining_depth == 0:
            routes.append([*path, end_id])
            return
        for candidate in pool:
            if candidate in path:
                continue
            backtrack([*path, candidate], remaining_depth - 1)

    for assist_count in range(1, max_assists + 1):
        backtrack([start_id], assist_count)
    return routes


def plan_interplanetary_route(
    bodies: List[Dict[str, Any]],
    *,
    from_id: str,
    to_id: str,
    departure_jd: float,
    objective: str = "min_distance",
    max_assists: int = 1,
    assist_pool: Optional[List[str]] = None,
) -> Dict[str, Any]:
    body_by_id = {body["id"]: body for body in bodies}
    if from_id not in body_by_id or to_id not in body_by_id:
        return {"best": None, "alternatives": []}
    if from_id == to_id:
        return {"best": None, "alternatives": []}

    assist_candidates = assist_pool or ["mercury", "venus", "earth", "mars", "jupiter", "saturn"]
    assist_candidates = [candidate for candidate in assist_candidates if candidate in body_by_id]
    max_assists = max(0, min(3, int(max_assists)))

    route_bodies = _generate_assist_routes(from_id, to_id, assist_candidates, max_assists)
    evaluated_routes: List[Dict[str, Any]] = []

    for body_route in route_bodies:
        legs: List[Dict[str, Any]] = []
        current_departure = departure_jd

        for index in range(len(body_route) - 1):
            leg = _compute_hohmann_leg(
                body_by_id,
                body_route[index],
                body_route[index + 1],
                current_departure,
            )
            legs.append(leg)
            current_departure = float(leg["arrivalJd"])

        total_assist_gain_kms = 0.0
        turn_deficit_penalty = 0.0
        assists: List[Dict[str, Any]] = []

        for index in range(1, len(body_route) - 1):
            assist_body_id = body_route[index]
            assist = _evaluate_assist(
                body_by_id,
                assist_body_id,
                legs[index - 1],
                legs[index],
            )
            assists.append({"bodyId": assist_body_id, **assist})
            total_assist_gain_kms += float(assist["assistGainKmS"])
            if not assist["feasible"]:
                deficit = max(0.0, float(assist["requiredTurnDeg"]) - float(assist["maxTurnDeg"]))
                turn_deficit_penalty += deficit / 20.0

        total_path_length_au = sum(float(leg["pathLengthAu"]) for leg in legs)
        total_time_days = float(legs[-1]["arrivalJd"]) - float(legs[0]["departureJd"])

        total_delta_v_kms = 0.0
        for leg_index, leg in enumerate(legs):
            total_delta_v_kms += float(leg["deltaVDepartureKmS"])
            if leg_index == len(legs) - 1:
                total_delta_v_kms += float(leg["deltaVArrivalKmS"])

        route = {
            "bodyRoute": body_route,
            "legs": legs,
            "assists": assists,
            "objective": objective,
            "totalAssistGainKmS": total_assist_gain_kms,
            "totalDeltaVKmS": total_delta_v_kms,
            "totalPathLengthAu": total_path_length_au,
            "totalTimeDays": total_time_days,
            "turnDeficitPenalty": turn_deficit_penalty,
        }
        route["score"] = _score_route(route, objective)
        evaluated_routes.append(route)

    evaluated_routes.sort(key=lambda route: float(route["score"]), reverse=True)
    return {
        "best": evaluated_routes[0] if evaluated_routes else None,
        "alternatives": evaluated_routes[1:6],
    }

