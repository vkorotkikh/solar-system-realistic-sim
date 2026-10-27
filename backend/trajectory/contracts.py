"""Pure validation and complexity contracts for trajectory planning."""

from __future__ import annotations

import math
from dataclasses import dataclass
from numbers import Real
from typing import Any, Mapping, Sequence


HARD_MAX_ASSIST_POOL_SIZE = 8
HARD_MAX_ROUTE_TOPOLOGIES = 401
MAX_BODY_ID_LENGTH = 64
ALLOWED_TRAJECTORY_OBJECTIVES = ("min_distance", "max_assist", "min_time")
# Common operating interval, matching the simulation's supported 1990-2050
# interval. An operating bound does not certify ephemeris accuracy.
PLANNING_JD_MIN = 2_447_892.5
PLANNING_JD_MAX = 2_469_807.5


class TrajectoryRequestRejected(ValueError):
    """A semantically invalid request rejected before any scientific work."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        context: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = str(code)
        self.context = dict(context or {})


def validate_planning_epoch(value: float, field: str) -> float:
    if not math.isfinite(value) or not PLANNING_JD_MIN <= value <= PLANNING_JD_MAX:
        raise TrajectoryRequestRejected(
            "trajectory_epoch_out_of_range",
            f"`{field}` must lie in [{PLANNING_JD_MIN}, {PLANNING_JD_MAX}] JDTDB",
            context={"field": field, "minimumJdTdb": PLANNING_JD_MIN,
                     "maximumJdTdb": PLANNING_JD_MAX, "timeScale": "TDB"},
        )
    return value


@dataclass(frozen=True)
class ValidatedTrajectoryPlan:
    from_id: str
    to_id: str
    departure_jd: float
    objective: str
    max_assists: int
    requested_assist_pool: tuple[str, ...] | None
    effective_assist_pool: tuple[str, ...]
    estimated_route_count: int


def estimate_route_count(pool_size: int, max_assists: int) -> int:
    """Return ``sum(P(pool_size, k), k=0..max_assists)`` without factorials."""

    if isinstance(pool_size, bool) or not isinstance(pool_size, int) or pool_size < 0:
        raise ValueError("`pool_size` must be a non-negative integer")
    if isinstance(max_assists, bool) or not isinstance(max_assists, int) or max_assists < 0:
        raise ValueError("`max_assists` must be a non-negative integer")

    total = 1
    permutations = 1
    for depth in range(1, min(pool_size, max_assists) + 1):
        permutations *= pool_size - depth + 1
        total += permutations
    return total


def _normalized_body_id(value: str) -> str:
    if not isinstance(value, str):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_pool",
            "Assist body identifiers must be strings",
        )
    cleaned = value.strip().lower()
    if not cleaned:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_pool",
            "Assist body identifiers must be non-empty",
        )
    if len(cleaned) > MAX_BODY_ID_LENGTH:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_body_id",
            f"Body identifiers are limited to {MAX_BODY_ID_LENGTH} characters",
            context={"maximumLength": MAX_BODY_ID_LENGTH},
        )
    return cleaned


def _has_valid_orbit(body: Mapping[str, Any]) -> bool:
    orbit = body.get("orbit")
    if not isinstance(orbit, Mapping):
        return False
    required_elements = (
        "a_au",
        "e",
        "i_deg",
        "ascending_node_deg",
        "arg_periapsis_deg",
        "mean_anomaly_deg",
        "period_days",
        "epoch_jd",
    )
    parsed: dict[str, float] = {}
    for name in required_elements:
        value = orbit.get(name)
        if isinstance(value, bool) or not isinstance(value, Real):
            return False
        parsed[name] = float(value)
        if not math.isfinite(parsed[name]):
            return False
    return (
        parsed["a_au"] > 0.0
        and parsed["period_days"] > 0.0
        and 0.0 <= parsed["e"] < 1.0
    )


def _is_valid_endpoint_body(body: Mapping[str, Any]) -> bool:
    return _has_valid_orbit(body) and str(body.get("type", "")).lower() != "moon"


def _is_valid_assist_body(body: Mapping[str, Any]) -> bool:
    if not _has_valid_orbit(body) or str(body.get("type", "")).lower() == "moon":
        return False
    try:
        mass_kg = float(body.get("mass_kg"))
        radius_km = float(body.get("radius_km"))
    except (TypeError, ValueError):
        return False
    return (
        math.isfinite(mass_kg)
        and mass_kg > 0.0
        and math.isfinite(radius_km)
        and radius_km > 0.0
    )


def eligible_endpoint_body_ids(
    bodies: Sequence[Mapping[str, Any]],
) -> tuple[str, ...]:
    """Return deterministic body IDs accepted as trajectory endpoints."""

    return tuple(
        sorted(
            body_id
            for body in bodies
            if (body_id := str(body.get("id", "")).strip().lower())
            and len(body_id) <= MAX_BODY_ID_LENGTH
            and _is_valid_endpoint_body(body)
        )
    )


def eligible_assist_body_ids(
    bodies: Sequence[Mapping[str, Any]],
) -> tuple[str, ...]:
    """Return deterministic body IDs accepted for gravity assists."""

    return tuple(
        sorted(
            body_id
            for body in bodies
            if (body_id := str(body.get("id", "")).strip().lower())
            and len(body_id) <= MAX_BODY_ID_LENGTH
            and _is_valid_assist_body(body)
        )
    )


def validate_plan_request(
    bodies: Sequence[Mapping[str, Any]],
    *,
    from_id: str,
    to_id: str,
    departure_jd: float,
    objective: str,
    max_assists: int,
    assist_pool: Sequence[str] | None,
    default_assist_pool: Sequence[str],
    max_assist_pool_size: int = HARD_MAX_ASSIST_POOL_SIZE,
    max_route_topologies: int = HARD_MAX_ROUTE_TOPOLOGIES,
) -> ValidatedTrajectoryPlan:
    """Normalize and reject an unsafe plan before providers or routes exist."""

    safe_pool_limit = max(0, min(HARD_MAX_ASSIST_POOL_SIZE, int(max_assist_pool_size)))
    safe_route_limit = max(1, min(HARD_MAX_ROUTE_TOPOLOGIES, int(max_route_topologies)))
    if isinstance(departure_jd, bool) or not isinstance(departure_jd, Real):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_departure_jd",
            "`departure_jd` must be a finite number",
        )
    normalized_departure_jd = float(departure_jd)
    if not math.isfinite(normalized_departure_jd):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_departure_jd",
            "`departure_jd` must be a finite number",
        )
    validate_planning_epoch(normalized_departure_jd, "departure_jd")
    if not isinstance(objective, str):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_objective",
            "`objective` must be one of the supported trajectory objectives",
            context={"allowedObjectives": list(ALLOWED_TRAJECTORY_OBJECTIVES)},
        )
    normalized_objective = objective.strip().lower()
    if normalized_objective not in ALLOWED_TRAJECTORY_OBJECTIVES:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_objective",
            "`objective` must be one of the supported trajectory objectives",
            context={
                "allowedObjectives": list(ALLOWED_TRAJECTORY_OBJECTIVES),
                "received": normalized_objective,
            },
        )
    if isinstance(max_assists, bool) or not isinstance(max_assists, int):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_depth",
            "`max_assists` must be an integer between 0 and 3",
            context={"minimum": 0, "maximum": 3},
        )
    if max_assists < 0 or max_assists > 3:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_depth",
            "`max_assists` must be between 0 and 3",
            context={"minimum": 0, "maximum": 3, "received": max_assists},
        )
    safe_max_assists = max_assists
    normalized_from = _normalized_body_id(from_id)
    normalized_to = _normalized_body_id(to_id)

    body_by_id = {str(body.get("id", "")).strip().lower(): body for body in bodies}
    unknown_endpoints = [
        body_id
        for body_id in (normalized_from, normalized_to)
        if body_id not in body_by_id
    ]
    if unknown_endpoints:
        raise TrajectoryRequestRejected(
            "trajectory_unknown_body",
            "Trajectory departure or destination body is unknown",
            context={"bodyIds": unknown_endpoints},
        )
    invalid_endpoints = [
        body_id
        for body_id in (normalized_from, normalized_to)
        if not _is_valid_endpoint_body(body_by_id[body_id])
    ]
    if invalid_endpoints:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_endpoint_body",
            "Trajectory endpoints must be orbit-bearing non-moon planner bodies",
            context={"bodyIds": invalid_endpoints},
        )
    if normalized_from == normalized_to:
        raise TrajectoryRequestRejected(
            "trajectory_same_body",
            "Trajectory departure and destination bodies must differ",
            context={"bodyId": normalized_from},
        )

    requested_source = default_assist_pool if assist_pool is None else assist_pool
    if isinstance(requested_source, (str, bytes, bytearray)) or not isinstance(
        requested_source,
        Sequence,
    ):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_pool",
            "`assist_pool` must be a sequence of body identifiers",
        )
    submitted_pool_size = len(requested_source)
    if submitted_pool_size > safe_pool_limit:
        raise TrajectoryRequestRejected(
            "trajectory_complexity_limit",
            f"`assist_pool` is limited to {safe_pool_limit} entries",
            context={
                "assistPoolSize": submitted_pool_size,
                "maximumAssistPoolSize": safe_pool_limit,
            },
        )
    # Consume exactly the already-bounded declared cardinality. Iterating a
    # caller-supplied Sequence trusts its iterator to agree with ``len`` and
    # lets a dishonest/infinite implementation bypass the ingress bound.
    try:
        normalized_pool = tuple(
            _normalized_body_id(requested_source[index])
            for index in range(submitted_pool_size)
        )
    except (IndexError, KeyError) as exc:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_pool",
            "`assist_pool` changed size while it was being validated",
        ) from exc

    duplicates = sorted({item for item in normalized_pool if normalized_pool.count(item) > 1})
    if duplicates:
        raise TrajectoryRequestRejected(
            "trajectory_duplicate_assist",
            "`assist_pool` must not contain duplicate bodies",
            context={"duplicates": duplicates},
        )

    invalid: list[str] = []
    for body_id in normalized_pool:
        body = body_by_id.get(body_id)
        if body is None or not _is_valid_assist_body(body):
            invalid.append(body_id)
    if invalid:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_body",
            "`assist_pool` contains unknown or ineligible bodies",
            context={"bodyIds": invalid},
        )

    effective_pool = tuple(
        sorted(body_id for body_id in normalized_pool if body_id not in (normalized_from, normalized_to))
    )
    route_count = estimate_route_count(len(effective_pool), safe_max_assists)
    if route_count > safe_route_limit:
        raise TrajectoryRequestRejected(
            "trajectory_complexity_limit",
            "Trajectory request exceeds the route-topology limit",
            context={
                "assistPoolSize": len(effective_pool),
                "estimatedRouteCount": route_count,
                "maximumRouteCount": safe_route_limit,
            },
        )

    return ValidatedTrajectoryPlan(
        from_id=normalized_from,
        to_id=normalized_to,
        departure_jd=normalized_departure_jd,
        objective=normalized_objective,
        max_assists=safe_max_assists,
        requested_assist_pool=None if assist_pool is None else normalized_pool,
        effective_assist_pool=effective_pool,
        estimated_route_count=route_count,
    )


__all__ = [
    "ALLOWED_TRAJECTORY_OBJECTIVES",
    "HARD_MAX_ASSIST_POOL_SIZE",
    "HARD_MAX_ROUTE_TOPOLOGIES",
    "MAX_BODY_ID_LENGTH",
    "TrajectoryRequestRejected",
    "ValidatedTrajectoryPlan",
    "eligible_assist_body_ids",
    "eligible_endpoint_body_ids",
    "estimate_route_count",
    "validate_plan_request",
]
