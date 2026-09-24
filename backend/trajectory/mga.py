"""Multi-gravity-assist (MGA) trajectory search with hard flyby constraints."""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional, Sequence

from mission.ephemeris_service import EphemerisService
from mission.orbital import (
    AU_KM,
    MU_SUN_AU3_DAY2,
    au_per_day_to_km_per_sec,
    mu_au3_day2_from_mass_kg,
    safe_angle_between,
    vector_length,
    vector_sub,
)

from .lambert import compute_lambert_leg

PRUNE_PER_DEPTH = 18
MAX_COMPLETED = 48
MIN_FLYBY_ALTITUDE_KM = 300.0
# An ideal unpowered patched-conic flyby rotates v-infinity without changing
# its magnitude in the encounter body's frame.  These tolerances absorb only
# floating-point/root-solver noise; they are not a hidden propulsion budget.
UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS = 1.0e-3
UNPOWERED_FLYBY_VINF_REL_TOLERANCE = 1.0e-4
UNPOWERED_FLYBY_TURN_TOLERANCE_RAD = 1.0e-9


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

    # Deterministic ordering: shorter routes first, then lexicographic.
    routes.sort(key=lambda route: (len(route), route))
    return routes


def _unique_sorted(values: Sequence[float]) -> List[float]:
    deduped = sorted({round(float(v), 8) for v in values if math.isfinite(float(v)) and float(v) > 0.0})
    return [float(v) for v in deduped]


def _leg_tof_candidates(
    ephemeris: EphemerisService,
    from_id: str,
    to_id: str,
    departure_jd: float,
) -> List[float]:
    from_state = ephemeris.sample_state(from_id, departure_jd)
    to_state = ephemeris.sample_state(to_id, departure_jd)

    r1 = vector_length(from_state.position_au)
    r2 = vector_length(to_state.position_au)
    transfer_a = max(0.01, 0.5 * (r1 + r2))
    hohmann_tof = math.pi * math.sqrt((transfer_a ** 3) / MU_SUN_AU3_DAY2)

    scaled = [
        hohmann_tof * 0.55,
        hohmann_tof * 0.75,
        hohmann_tof,
        hohmann_tof * 1.25,
        hohmann_tof * 1.6,
    ]
    coarse = [70.0, 100.0, 140.0, 190.0, 260.0, 360.0, 520.0, 700.0, 980.0, 1280.0]

    candidates = []
    for value in [*scaled, *coarse]:
        clipped = max(45.0, min(2_000.0, value))
        candidates.append(round(clipped / 5.0) * 5.0)

    return _unique_sorted(candidates)


def _evaluate_flyby(
    body: Dict[str, Any],
    incoming_leg: Dict[str, Any],
    outgoing_leg: Dict[str, Any],
) -> Dict[str, Any]:
    v_inf_in = vector_sub(incoming_leg["arrivalVelocityApprox"], incoming_leg["toPlanetVelocity"])
    v_inf_out = vector_sub(outgoing_leg["departureVelocityApprox"], outgoing_leg["fromPlanetVelocity"])

    required_turn = safe_angle_between(v_inf_in, v_inf_out)
    v_inf_in_mag_au_day = vector_length(v_inf_in)
    v_inf_out_mag_au_day = vector_length(v_inf_out)
    v_inf_in_kms = au_per_day_to_km_per_sec(v_inf_in_mag_au_day)
    v_inf_out_kms = au_per_day_to_km_per_sec(v_inf_out_mag_au_day)
    v_inf_mismatch_kms = abs(v_inf_out_kms - v_inf_in_kms)
    v_inf_tolerance_kms = max(
        UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS,
        UNPOWERED_FLYBY_VINF_REL_TOLERANCE * max(v_inf_in_kms, v_inf_out_kms),
    )
    magnitude_conserved = v_inf_mismatch_kms <= v_inf_tolerance_kms

    try:
        mass_kg = float(body.get("mass_kg"))
        radius_km = float(body.get("radius_km"))
    except (TypeError, ValueError):
        mass_kg = 0.0
        radius_km = 0.0
    body_parameters_valid = (
        math.isfinite(mass_kg)
        and mass_kg > 0.0
        and math.isfinite(radius_km)
        and radius_km > 0.0
    )

    mu_body = mu_au3_day2_from_mass_kg(mass_kg) if body_parameters_valid else 0.0
    rp_au = (radius_km + MIN_FLYBY_ALTITUDE_KM) / AU_KM if body_parameters_valid else 0.0

    max_turn = 0.0
    if mu_body > 0.0 and v_inf_in_mag_au_day > 1e-12:
        # For an unpowered encounter the incoming and outgoing asymptotic
        # speeds are the same.  The incoming hyperbola therefore defines the
        # physical turning bound; averaging an inconsistent outbound speed can
        # manufacture feasibility.
        denominator = 1.0 + (rp_au * (v_inf_in_mag_au_day ** 2)) / mu_body
        if denominator > 1.0:
            max_turn = 2.0 * math.asin(min(1.0, 1.0 / denominator))

    turn_deficit = max(0.0, required_turn - max_turn)
    turn_feasible = required_turn <= max_turn + UNPOWERED_FLYBY_TURN_TOLERANCE_RAD
    nondegenerate = v_inf_in_mag_au_day > 1e-12
    feasible = body_parameters_valid and nondegenerate and magnitude_conserved and turn_feasible

    if not body_parameters_valid:
        reason = "missing_body_mass_or_radius"
    elif not nondegenerate:
        reason = "degenerate_vinf"
    elif not magnitude_conserved:
        reason = "vinf_magnitude_mismatch"
    elif not turn_feasible:
        reason = "turn_limit"
    else:
        reason = "ok"

    assist_gain = (
        2.0 * v_inf_in_kms * math.sin(required_turn / 2.0)
        if feasible
        else 0.0
    )

    return {
        "assistGainKmS": assist_gain,
        "requiredTurnDeg": math.degrees(required_turn),
        "maxTurnDeg": math.degrees(max_turn),
        "turnDeficitDeg": math.degrees(turn_deficit),
        "vInfInKmS": v_inf_in_kms,
        "vInfOutKmS": v_inf_out_kms,
        "vInfMismatchKmS": v_inf_mismatch_kms,
        "vInfToleranceKmS": v_inf_tolerance_kms,
        "vInfRelativeTolerance": UNPOWERED_FLYBY_VINF_REL_TOLERANCE,
        "vInfMagnitudeConserved": magnitude_conserved,
        "feasible": feasible,
        "reason": reason,
    }


def _score_route(route: Dict[str, Any], objective: str) -> float:
    if objective == "max_assist":
        return (
            route["totalAssistGainKmS"] * 5.0
            - route["totalDeltaVKmS"] * 1.1
            - route["totalTimeDays"] * 0.002
            - route["totalPathLengthAu"] * 0.06
        )

    if objective == "min_time":
        return (
            -route["totalTimeDays"] * 1.8
            - route["totalDeltaVKmS"] * 0.7
            + route["totalAssistGainKmS"] * 0.2
        )

    # Default: minimize route burden while preferring physically meaningful assists.
    return (
        -route["totalDeltaVKmS"] * 1.0
        - route["totalTimeDays"] * 0.0025
        - route["totalPathLengthAu"] * 0.08
        + route["totalAssistGainKmS"] * 0.25
    )


def _seed_partial(route: List[str], departure_jd: float) -> Dict[str, Any]:
    return {
        "bodyRoute": route,
        "currentDepartureJd": departure_jd,
        "legs": [],
        "assists": [],
        "totalAssistGainKmS": 0.0,
        "totalDeltaVKmS": 0.0,
        "totalPathLengthAu": 0.0,
    }


def optimize_mga_route(
    bodies: Sequence[Dict[str, Any]],
    *,
    ephemeris: EphemerisService,
    from_id: str,
    to_id: str,
    departure_jd: float,
    objective: str,
    max_assists: int,
    assist_pool: Sequence[str],
    prograde: bool = True,
) -> Dict[str, Any]:
    body_by_id = {body["id"]: dict(body) for body in bodies}

    route_candidates = _generate_assist_routes(
        from_id,
        to_id,
        assist_pool,
        max_assists=max(0, int(max_assists)),
    )

    completed_routes: List[Dict[str, Any]] = []

    for body_route in route_candidates:
        partials: List[Dict[str, Any]] = [_seed_partial(body_route, departure_jd)]

        for leg_index in range(len(body_route) - 1):
            next_partials: List[Dict[str, Any]] = []
            from_body = body_route[leg_index]
            to_body = body_route[leg_index + 1]

            for partial in partials:
                dep_jd = float(partial["currentDepartureJd"])
                tof_candidates = _leg_tof_candidates(ephemeris, from_body, to_body, dep_jd)

                for tof_days in tof_candidates:
                    leg = compute_lambert_leg(
                        ephemeris,
                        from_body,
                        to_body,
                        dep_jd,
                        tof_days,
                        prograde=prograde,
                    )
                    if leg is None:
                        continue

                    candidate = {
                        "bodyRoute": partial["bodyRoute"],
                        "legs": [*partial["legs"], leg],
                        "assists": list(partial["assists"]),
                        "totalAssistGainKmS": float(partial["totalAssistGainKmS"]),
                        "totalDeltaVKmS": float(partial["totalDeltaVKmS"]),
                        "totalPathLengthAu": float(partial["totalPathLengthAu"]) + float(leg["pathLengthAu"]),
                        "currentDepartureJd": float(leg["arrivalJd"]),
                    }

                    if leg_index == 0:
                        candidate["totalDeltaVKmS"] += float(leg["deltaVDepartureKmS"])
                    if leg_index == len(body_route) - 2:
                        candidate["totalDeltaVKmS"] += float(leg["deltaVArrivalKmS"])

                    if leg_index > 0:
                        assist_body_id = body_route[leg_index]
                        assist_body = body_by_id.get(assist_body_id)
                        if assist_body is None:
                            continue
                        flyby = _evaluate_flyby(assist_body, candidate["legs"][-2], candidate["legs"][-1])
                        if not flyby["feasible"]:
                            continue
                        candidate["assists"].append({"bodyId": assist_body_id, **flyby})
                        candidate["totalAssistGainKmS"] += float(flyby["assistGainKmS"])

                    next_partials.append(candidate)

            if not next_partials:
                partials = []
                break

            next_partials.sort(
                key=lambda item: (
                    float(item["totalDeltaVKmS"]),
                    float(item["currentDepartureJd"]),
                    -float(item["totalAssistGainKmS"]),
                )
            )
            partials = next_partials[:PRUNE_PER_DEPTH]

        for partial in partials:
            if not partial["legs"]:
                continue
            total_time_days = float(partial["legs"][-1]["arrivalJd"]) - float(partial["legs"][0]["departureJd"])
            route = {
                "bodyRoute": list(partial["bodyRoute"]),
                "legs": partial["legs"],
                "assists": partial["assists"],
                "objective": objective,
                "totalAssistGainKmS": float(partial["totalAssistGainKmS"]),
                "totalDeltaVKmS": float(partial["totalDeltaVKmS"]),
                "totalPathLengthAu": float(partial["totalPathLengthAu"]),
                "totalTimeDays": total_time_days,
                "turnDeficitPenalty": 0.0,
                "hardConstraintMode": "unpowered_flyby_vinf_continuity_and_turn_limit",
            }
            route["score"] = _score_route(route, objective)
            completed_routes.append(route)

            if len(completed_routes) >= MAX_COMPLETED:
                break
        if len(completed_routes) >= MAX_COMPLETED:
            break

    completed_routes.sort(
        key=lambda item: (
            -float(item["score"]),
            float(item["totalDeltaVKmS"]),
            float(item["totalTimeDays"]),
            len(item["bodyRoute"]),
        )
    )

    return {
        "best": completed_routes[0] if completed_routes else None,
        "alternatives": completed_routes[1:6],
    }


__all__ = ["optimize_mga_route"]
