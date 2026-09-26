"""Trajectory planning services built on ephemeris sampling + Lambert/MGA search."""

from __future__ import annotations

from threading import Event
from typing import Any, Dict, List, Optional, Sequence

from mission.ephemeris_service import EphemerisService

from .budget import PlanningContext, PlanningLimits, default_planning_context
from .contracts import TrajectoryRequestRejected, validate_plan_request
from .lambert import (
    TrajectoryInputError,
    _compute_lambert_leg_reserved,
    scan_porkchop_window,
    validate_direct_lambert_request,
    validate_porkchop_request,
)
from .mga import MAX_ASSIST_POOL_SIZE, optimize_mga_route

TRAJECTORY_OBJECTIVES = ("min_distance", "max_assist", "min_time")
DEFAULT_ASSIST_POOL = ["mercury", "venus", "earth", "mars", "jupiter", "saturn"]


def _reject_invalid_entry(exc: TrajectoryInputError) -> TrajectoryRequestRejected:
    return TrajectoryRequestRejected(exc.code, str(exc), context=exc.context)


def _validate_catalog_endpoints(
    bodies: Sequence[Dict[str, Any]],
    *,
    from_id: str,
    to_id: str,
    departure_jd: float,
) -> tuple[str, str]:
    validated = validate_plan_request(
        bodies,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        objective="min_time",
        max_assists=0,
        assist_pool=[],
        default_assist_pool=[],
    )
    return validated.from_id, validated.to_id


def _ephemeris_session(
    bodies: Sequence[Dict[str, Any]],
    *,
    ephemeris_provider: str,
    planning_context: PlanningContext | None,
    ephemeris: EphemerisService | None,
) -> EphemerisService:
    if ephemeris is not None:
        if type(ephemeris) is not EphemerisService:
            raise ValueError(
                "Injected ephemeris session must be an exact EphemerisService"
            )
        requested = str(ephemeris_provider).strip().lower()
        expected = "kepler" if requested == "auto" else requested
        resolved = str(ephemeris.resolved_provider).strip().lower()
        if resolved != expected:
            raise ValueError(
                "Injected ephemeris session provider does not match the requested provider "
                f"(`{resolved}` != `{expected}`)"
            )
        owned_context = getattr(
            ephemeris,
            "planning_context",
            getattr(ephemeris, "_context", None),
        )
        if planning_context is None or owned_context is not planning_context:
            raise ValueError(
                "Injected ephemeris session must be owned by the supplied planning context"
            )
        return ephemeris
    return EphemerisService(
        bodies,
        provider=ephemeris_provider,
        context=planning_context,
    )


def _reject_remote_search_provider(
    ephemeris_provider: str,
    ephemeris: EphemerisService | None,
) -> None:
    if ephemeris is not None and type(ephemeris) is not EphemerisService:
        raise ValueError("Injected ephemeris session must be an exact EphemerisService")
    requested = str(ephemeris_provider).strip().lower()
    resolved = str(getattr(ephemeris, "resolved_provider", "")).strip().lower()
    if requested == "horizons" or resolved == "horizons":
        raise ValueError(
            "Horizons is not supported for search operations; use `kepler`/`auto` "
            "for planning or direct Lambert for an explicit Horizons transfer"
        )


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
    planning_context: PlanningContext | None = None,
    ephemeris: EphemerisService | None = None,
) -> Dict[str, Any]:
    context = planning_context or default_planning_context()
    validated = validate_plan_request(
        bodies,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        objective=objective,
        max_assists=max_assists,
        assist_pool=assist_pool,
        default_assist_pool=DEFAULT_ASSIST_POOL,
        max_assist_pool_size=MAX_ASSIST_POOL_SIZE,
    )
    _reject_remote_search_provider(ephemeris_provider, ephemeris)
    session = _ephemeris_session(
        bodies,
        ephemeris_provider=ephemeris_provider,
        planning_context=context,
        ephemeris=ephemeris,
    )
    required_assists = (
        validated.effective_assist_pool if validated.max_assists > 0 else ()
    )
    session.preflight([validated.from_id, validated.to_id, *required_assists])
    ephemeris_chain = session.provider_chain()

    optimized = optimize_mga_route(
        bodies,
        ephemeris=session,
        from_id=validated.from_id,
        to_id=validated.to_id,
        departure_jd=validated.departure_jd,
        objective=validated.objective,
        max_assists=validated.max_assists,
        assist_pool=validated.effective_assist_pool,
        prograde=prograde,
        planning_context=context,
    )

    best = optimized.get("best")
    alternatives = optimized.get("alternatives", [])

    return {
        "best": best,
        "alternatives": alternatives,
        "search": optimized.get("search", {}),
        "solver": best.get("solver", "lambert_mga_bounded") if isinstance(best, dict) else "lambert_mga_bounded",
        "ephemerisProvider": (
            _summarize_leg_sources(best.get("legs", []))
            if isinstance(best, dict)
            else session.resolved_provider
        ),
        "ephemerisProviderRequested": ephemeris_provider,
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
    planning_context: PlanningContext | None = None,
    ephemeris: EphemerisService | None = None,
) -> Dict[str, Any]:
    try:
        from_id, to_id, departure_jd, arrival_jd = validate_direct_lambert_request(
            from_id=from_id,
            to_id=to_id,
            departure_jd=departure_jd,
            arrival_jd=arrival_jd,
        )
    except TrajectoryInputError as exc:
        raise _reject_invalid_entry(exc) from exc
    from_id, to_id = _validate_catalog_endpoints(
        bodies,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
    )

    context = planning_context or PlanningContext.with_timeout(
        4.0,
        limits=PlanningLimits(
            ephemeris_queries=2,
            unique_ephemeris_states=2,
            remote_ephemeris_states=2,
            external_requests=2,
            leg_requests=1,
            leg_evaluations=1,
            route_prefixes=0,
        ),
    )
    session = _ephemeris_session(
        bodies,
        ephemeris_provider=ephemeris_provider,
        planning_context=context,
        ephemeris=ephemeris,
    )
    session.preflight([from_id, to_id])
    context.reserve(leg_requests=1, leg_evaluations=1)
    leg = _compute_lambert_leg_reserved(
        session,
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
        "ephemerisProviderRequested": ephemeris_provider,
        "ephemerisProviderChain": session.provider_chain(),
        "solver": "lambert_universal",
        "planningContext": context.snapshot(),
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
    cancel_event: Event | None = None,
    planning_context: PlanningContext | None = None,
    ephemeris: EphemerisService | None = None,
) -> Dict[str, Any]:
    try:
        validated = validate_porkchop_request(
            from_id=from_id,
            to_id=to_id,
            departure_start_jd=departure_start_jd,
            departure_end_jd=departure_end_jd,
            departure_step_days=departure_step_days,
            tof_min_days=tof_min_days,
            tof_max_days=tof_max_days,
            tof_step_days=tof_step_days,
        )
    except TrajectoryInputError as exc:
        raise _reject_invalid_entry(exc) from exc
    from_id = validated["from_id"]
    to_id = validated["to_id"]
    departure_start_jd = validated["departure_start_jd"]
    departure_end_jd = validated["departure_end_jd"]
    departure_step_days = validated["departure_step_days"]
    tof_min_days = validated["tof_min_days"]
    tof_max_days = validated["tof_max_days"]
    tof_step_days = validated["tof_step_days"]
    from_id, to_id = _validate_catalog_endpoints(
        bodies,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_start_jd,
    )

    if planning_context is not None and cancel_event is not None:
        if planning_context.cancel_event is not cancel_event:
            raise ValueError("Porkchop cancellation event must belong to the planning context")
    context = planning_context or default_planning_context(cancel_event=cancel_event)
    _reject_remote_search_provider(ephemeris_provider, ephemeris)
    session = _ephemeris_session(
        bodies,
        ephemeris_provider=ephemeris_provider,
        planning_context=context,
        ephemeris=ephemeris,
    )
    session.preflight([from_id, to_id])
    try:
        result = scan_porkchop_window(
            session,
            from_id=from_id,
            to_id=to_id,
            departure_start_jd=departure_start_jd,
            departure_end_jd=departure_end_jd,
            departure_step_days=departure_step_days,
            tof_min_days=tof_min_days,
            tof_max_days=tof_max_days,
            tof_step_days=tof_step_days,
            prograde=prograde,
            cancel_event=cancel_event,
            planning_context=context,
        )
    except TrajectoryInputError as exc:
        raise _reject_invalid_entry(exc) from exc
    result["solver"] = "lambert_porkchop"
    result["ephemerisProviderRequested"] = ephemeris_provider
    result["ephemerisProviderChain"] = session.provider_chain()
    result["ephemerisProvider"] = session.resolved_provider
    result["planningContext"] = context.snapshot()
    return result


__all__ = [
    "DEFAULT_ASSIST_POOL",
    "TRAJECTORY_OBJECTIVES",
    "plan_interplanetary_route",
    "run_porkchop_scan",
    "solve_direct_lambert",
]
