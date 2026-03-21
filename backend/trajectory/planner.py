"""Trajectory planning services built on ephemeris sampling + Lambert/MGA search."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from mission.ephemeris_service import EphemerisService

from .lambert import compute_lambert_leg, scan_porkchop_window
from .mga import optimize_mga_route

TRAJECTORY_OBJECTIVES = ("min_distance", "max_assist", "min_time")
DEFAULT_ASSIST_POOL = ["mercury", "venus", "earth", "mars", "jupiter", "saturn"]


def _summarize_state_sources(*source_groups: Any) -> str:
    labels: list[str] = []
    for group in source_groups:
        if isinstance(group, dict):
            for key in ("from", "to"):
                value = group.get(key)
                if isinstance(value, str) and value.strip():
                    labels.append(value.strip())
        elif isinstance(group, (list, tuple)):
            for item in group:
                if isinstance(item, dict):
                    labels.extend(
                        value.strip()
                        for value in (
                            item.get("from"),
                            item.get("to"),
                        )
                        if isinstance(value, str) and value.strip()
                    )

    unique_labels = list(dict.fromkeys(labels))
    if not unique_labels:
        return "unknown"
    if len(unique_labels) == 1:
        return unique_labels[0]
    return "mixed"


def _summarize_leg_sources(legs: Any) -> str:
    if not isinstance(legs, (list, tuple)):
        return "unknown"
    return _summarize_state_sources(*(leg.get("stateSource") for leg in legs if isinstance(leg, dict)))


def plan_interplanetary_route(
    bodies: Sequence[Dict[str, Any]],
    *,
    from_id: str,
    to_id: str,
    departure_jd: float,
    objective: str = "min_distance",
    max_assists: int = 1,
    assist_pool: Optional[List[str]] = None,
    ephemeris_provider: str = "auto",
    prograde: bool = True,
) -> Dict[str, Any]:
    body_by_id = {body["id"]: body for body in bodies}
    if from_id not in body_by_id or to_id not in body_by_id:
        return {"best": None, "alternatives": []}
    if from_id == to_id:
        return {"best": None, "alternatives": []}

    objective_key = objective if objective in TRAJECTORY_OBJECTIVES else "min_distance"
    max_assists = max(0, min(3, int(max_assists)))

    assist_candidates = assist_pool or list(DEFAULT_ASSIST_POOL)
    assist_candidates = [candidate for candidate in assist_candidates if candidate in body_by_id]

    ephemeris = EphemerisService(bodies, provider=ephemeris_provider)
    ephemeris_chain = ephemeris.provider_chain()

    optimized = optimize_mga_route(
        bodies,
        ephemeris=ephemeris,
        from_id=from_id,
        to_id=to_id,
        departure_jd=float(departure_jd),
        objective=objective_key,
        max_assists=max_assists,
        assist_pool=assist_candidates,
        prograde=prograde,
    )

    best = optimized.get("best")
    alternatives = optimized.get("alternatives", [])

    if best is None:
        # Fallback to a direct Lambert leg if MGA scan cannot find a route.
        for tof in (80.0, 120.0, 180.0, 260.0, 360.0, 520.0, 700.0, 980.0):
            direct_leg = compute_lambert_leg(
                ephemeris,
                from_id,
                to_id,
                float(departure_jd),
                tof,
                prograde=prograde,
            )
            if direct_leg is None:
                continue
            total_delta_v = float(direct_leg["deltaVDepartureKmS"]) + float(direct_leg["deltaVArrivalKmS"])
            best = {
                "bodyRoute": [from_id, to_id],
                "legs": [direct_leg],
                "assists": [],
                "objective": objective_key,
                "totalAssistGainKmS": 0.0,
                "totalDeltaVKmS": total_delta_v,
                "totalPathLengthAu": float(direct_leg["pathLengthAu"]),
                "totalTimeDays": float(direct_leg["tofDays"]),
                "turnDeficitPenalty": 0.0,
                "score": -total_delta_v,
                "hardConstraintMode": "flyby_turn_limit",
            }
            break

    return {
        "best": best,
        "alternatives": alternatives,
        "solver": "lambert_mga",
        "ephemerisProvider": _summarize_leg_sources(best.get("legs", [])) if isinstance(best, dict) else ephemeris.provider,
        "ephemerisProviderRequested": ephemeris.provider,
        "ephemerisProviderChain": ephemeris_chain,
    }


def solve_direct_lambert(
    bodies: Sequence[Dict[str, Any]],
    *,
    from_id: str,
    to_id: str,
    departure_jd: float,
    arrival_jd: float,
    ephemeris_provider: str = "auto",
    prograde: bool = True,
) -> Dict[str, Any]:
    if arrival_jd <= departure_jd:
        return {"solution": None, "error": "`arrival_jd` must be greater than `departure_jd`"}

    ephemeris = EphemerisService(bodies, provider=ephemeris_provider)
    leg = compute_lambert_leg(
        ephemeris,
        from_id,
        to_id,
        departure_jd,
        arrival_jd - departure_jd,
        prograde=prograde,
    )
    if leg is None:
        return {"solution": None, "error": "No Lambert solution for requested geometry/time"}

    resolved_provider = _summarize_state_sources(leg.get("stateSource"))

    return {
        "solution": leg,
        "ephemerisProvider": resolved_provider,
        "ephemerisProviderRequested": ephemeris.provider,
        "ephemerisProviderChain": ephemeris.provider_chain(),
        "solver": "lambert_universal",
    }


def run_porkchop_scan(
    bodies: Sequence[Dict[str, Any]],
    *,
    from_id: str,
    to_id: str,
    departure_start_jd: float,
    departure_end_jd: float,
    departure_step_days: float,
    tof_min_days: float,
    tof_max_days: float,
    tof_step_days: float,
    ephemeris_provider: str = "auto",
    prograde: bool = True,
) -> Dict[str, Any]:
    ephemeris = EphemerisService(bodies, provider=ephemeris_provider)
    result = scan_porkchop_window(
        ephemeris,
        from_id=from_id,
        to_id=to_id,
        departure_start_jd=departure_start_jd,
        departure_end_jd=departure_end_jd,
        departure_step_days=departure_step_days,
        tof_min_days=tof_min_days,
        tof_max_days=tof_max_days,
        tof_step_days=tof_step_days,
        prograde=prograde,
    )
    result["solver"] = "lambert_porkchop"
    result["ephemerisProviderRequested"] = ephemeris.provider
    result["ephemerisProviderChain"] = ephemeris.provider_chain()
    result["ephemerisProvider"] = ephemeris.provider
    return result


__all__ = [
    "DEFAULT_ASSIST_POOL",
    "TRAJECTORY_OBJECTIVES",
    "plan_interplanetary_route",
    "run_porkchop_scan",
    "solve_direct_lambert",
]
