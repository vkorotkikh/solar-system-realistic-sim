"""Deterministic, resource-bounded multi-gravity-assist trajectory search."""

from __future__ import annotations

from dataclasses import dataclass, field
import math
import time
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

from .budget import (
    PlanningBudgetExceeded,
    PlanningCancelled,
    PlanningContext,
    PlanningDeadlineExceeded,
)
from .contracts import (
    HARD_MAX_ASSIST_POOL_SIZE,
    HARD_MAX_ROUTE_TOPOLOGIES,
    MAX_BODY_ID_LENGTH,
    PLANNING_JD_MAX,
    TrajectoryRequestRejected,
    estimate_route_count,
    validate_plan_request,
)
from .lambert import _compute_lambert_leg_reserved as compute_lambert_leg


GLOBAL_BEAM_WIDTH = 12
MAX_PREFIX_EXPANSIONS = 256
MAX_LEG_EVALUATIONS = 2_000
MAX_COMPLETED = 48
MAX_RETURNED_ALTERNATIVES = 5
MAX_ASSIST_POOL_SIZE = HARD_MAX_ASSIST_POOL_SIZE
MAX_ASSISTS = 3
MAX_PARTIALS_PER_ROUTE_PREFIX = 2
ASSIST_TOF_SEEDS = 8
MAX_REFINED_ROOTS_PER_EDGE = 2
MAX_ROOT_ITERATIONS = 20
VINFINITY_NEAR_ROOT_THRESHOLD_KMS = 0.25
# Roots closer than 0.05 day (72 minutes) are indistinguishable at the search
# model's coarse assist-epoch resolution and are retained only once.
VINF_ROOT_DUPLICATE_TOF_TOLERANCE_DAYS = 0.05
MIN_FLYBY_ALTITUDE_KM = 300.0
# `radius_km` in data/bodies.py is the volumetric MEAN radius, which for the giants lies inside the
# 1-bar equator (Saturn by 2,036 km), so periapsis floors start from IAU 2015 equatorial radii.
# Jupiter uses the ESA ACT GTOP Cassini1 floor, 671,492 km (~9.4 R_J): R + 300 km sits inside the
# Io plasma torus and overstated the achievable turn by ~60 deg at 10 km/s.
# ponytail: ring and radiation limits beyond Jupiter are not modelled; add them per body here.
EQUATORIAL_RADIUS_KM = {
    "mercury": 2_440.53,
    "venus": 6_051.8,
    "earth": 6_378.137,
    "mars": 3_396.19,
    "jupiter": 71_492.0,
    "saturn": 60_268.0,
    "uranus": 25_559.0,
    "neptune": 24_764.0,
}
MIN_FLYBY_PERIAPSIS_KM = {
    **{body_id: radius + MIN_FLYBY_ALTITUDE_KM for body_id, radius in EQUATORIAL_RADIUS_KM.items()},
    "jupiter": 671_492.0,
}


def min_flyby_periapsis_km(body: Dict[str, Any], radius_km: float) -> float:
    return MIN_FLYBY_PERIAPSIS_KM.get(str(body.get("id", "")), radius_km + MIN_FLYBY_ALTITUDE_KM)
LEG_EVALUATION_CUMULATIVE_TARGETS = {
    0: 128,
    1: 768,
    2: 1_408,
    3: MAX_LEG_EVALUATIONS,
}

# Compatibility name retained for older imports; pruning is now global.
PRUNE_PER_DEPTH = GLOBAL_BEAM_WIDTH

# An ideal unpowered patched-conic flyby rotates v-infinity without changing
# its magnitude in the encounter body's frame. These tolerances absorb solver
# noise only; they are not a hidden propulsion allowance.
UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS = 1.0e-3
UNPOWERED_FLYBY_VINF_REL_TOLERANCE = 1.0e-4
UNPOWERED_FLYBY_TURN_TOLERANCE_RAD = 1.0e-9


class _SearchStopped(RuntimeError):
    """Internal control flow for a locally enforced search ceiling."""


class _DepthBudgetExhausted(RuntimeError):
    """Advance to the next assist depth while preserving future work."""


@dataclass
class _SearchStats:
    started_monotonic: float = field(default_factory=time.monotonic)
    termination_reason: str = "configured_frontier_completed"
    route_prefixes_expanded: int = 0
    partials_generated: int = 0
    partials_retained: int = 0
    partials_pruned_by_beam: int = 0
    partials_pruned_by_duplicate: int = 0
    max_frontier_size: int = 0
    leg_requests: int = 0
    leg_evaluations: int = 0
    leg_cache_hits: int = 0
    lambert_failures: int = 0
    flyby_checks: int = 0
    flyby_rejections: Dict[str, int] = field(default_factory=dict)
    vinf_root_brackets: int = 0
    vinf_root_attempts: int = 0
    vinf_tangential_searches: int = 0
    vinf_roots_certified: int = 0
    root_refinement_evaluations: int = 0
    direct_routes: int = 0
    assisted_routes: int = 0
    leg_evaluations_by_stage: Dict[str, int] = field(default_factory=dict)
    stage_evaluation_limits: Dict[str, int] = field(default_factory=dict)
    stages_truncated: List[str] = field(default_factory=list)

    def reject_flyby(self, reason: str) -> None:
        self.flyby_rejections[reason] = self.flyby_rejections.get(reason, 0) + 1

    def telemetry(self, completed_count: int, context: PlanningContext | None) -> Dict[str, Any]:
        truncated = self.termination_reason != "configured_frontier_completed"
        prefix_limit = MAX_PREFIX_EXPANSIONS
        leg_evaluation_limit = MAX_LEG_EVALUATIONS
        if context is not None:
            prefix_limit = min(prefix_limit, context.limits.route_prefixes)
            leg_evaluation_limit = min(
                leg_evaluation_limit,
                context.limits.leg_evaluations,
            )
        payload: Dict[str, Any] = {
            "strategy": "bounded_global_beam_v1",
            "configuredFrontierCompleted": not truncated,
            "searchSpaceExhaustive": False,
            "optimalityGuaranteed": False,
            "truncated": truncated,
            "budgetExhausted": self.termination_reason.endswith("budget_exhausted"),
            "terminationReason": self.termination_reason,
            "elapsedMs": (time.monotonic() - self.started_monotonic) * 1_000.0,
            "routePrefixesExpanded": self.route_prefixes_expanded,
            "partialsGenerated": self.partials_generated,
            "partialsRetained": self.partials_retained,
            "partialsPrunedByBeam": self.partials_pruned_by_beam,
            "partialsPrunedByDuplicate": self.partials_pruned_by_duplicate,
            "maxFrontierSize": self.max_frontier_size,
            "legRequests": self.leg_requests,
            "legEvaluations": self.leg_evaluations,
            "legCacheHits": self.leg_cache_hits,
            "lambertFailures": self.lambert_failures,
            "flybyChecks": self.flyby_checks,
            "flybyRejectionsByReason": dict(sorted(self.flyby_rejections.items())),
            "vinfRootBrackets": self.vinf_root_brackets,
            "vinfRootAttempts": self.vinf_root_attempts,
            "vinfTangentialSearches": self.vinf_tangential_searches,
            "vinfRootsCertified": self.vinf_roots_certified,
            "rootRefinementEvaluations": self.root_refinement_evaluations,
            "completedRoutes": self.direct_routes + self.assisted_routes,
            "completedRoutesRetained": completed_count,
            "directRoutes": self.direct_routes,
            "assistedRoutes": self.assisted_routes,
            "assistSolutionsFound": self.assisted_routes,
            "directSolutionsFound": self.direct_routes,
            "legEvaluationsByStage": dict(self.leg_evaluations_by_stage),
            "stageEvaluationLimits": dict(self.stage_evaluation_limits),
            "stagesTruncated": list(self.stages_truncated),
            "budget": {
                "beamWidth": GLOBAL_BEAM_WIDTH,
                "prefixExpansionsUsed": self.route_prefixes_expanded,
                "prefixExpansionsLimit": prefix_limit,
                "legEvaluationsUsed": self.leg_evaluations,
                "legEvaluationsLimit": leg_evaluation_limit,
            },
        }
        if context is not None:
            payload["planningContext"] = context.snapshot()
        return payload


@dataclass(frozen=True)
class _Partial:
    body_route: tuple[str, ...]
    current_jd: float
    legs: tuple[Dict[str, Any], ...]
    assists: tuple[Dict[str, Any], ...]
    total_assist_gain_kms: float
    departure_delta_v_kms: float
    total_path_length_au: float
    tof_sequence: tuple[float, ...]


@dataclass
class _SearchRuntime:
    ephemeris: EphemerisService
    planning_context: PlanningContext | None
    prograde: bool
    stats: _SearchStats = field(default_factory=_SearchStats)
    leg_cache: Dict[tuple[str, str, float, float, bool], Optional[Dict[str, Any]]] = field(
        default_factory=dict
    )
    current_stage: int = 0
    current_stage_limit: int = MAX_LEG_EVALUATIONS

    def begin_stage(self, stage: int, max_assists: int) -> None:
        """Reserve later-depth capacity with deterministic cumulative ceilings.

        Unused work rolls forward because each ceiling is cumulative. When the
        current stage is the final requested stage, all remaining work becomes
        available rather than reserving capacity for depths the caller disabled.
        """

        normalized_stage = max(0, min(MAX_ASSISTS, int(stage)))
        self.current_stage = normalized_stage
        if normalized_stage >= max(0, int(max_assists)):
            limit = MAX_LEG_EVALUATIONS
        else:
            limit = LEG_EVALUATION_CUMULATIVE_TARGETS[normalized_stage]
        context_limit = (
            self.planning_context.limits.leg_evaluations
            if self.planning_context is not None
            else MAX_LEG_EVALUATIONS
        )
        self.current_stage_limit = min(
            MAX_LEG_EVALUATIONS,
            int(limit),
            context_limit,
        )
        label = "setup" if normalized_stage == 0 else f"assist_depth_{normalized_stage}"
        self.stats.stage_evaluation_limits[label] = self.current_stage_limit
        self.stats.leg_evaluations_by_stage.setdefault(label, 0)

    def checkpoint(self) -> None:
        if self.planning_context is not None:
            self.planning_context.checkpoint()

    def claim_prefix(self) -> None:
        self.checkpoint()
        if self.stats.route_prefixes_expanded >= MAX_PREFIX_EXPANSIONS:
            self.stats.termination_reason = "route_prefixes_budget_exhausted"
            raise _SearchStopped(self.stats.termination_reason)
        if self.planning_context is not None:
            try:
                self.planning_context.reserve("route_prefixes")
            except PlanningBudgetExceeded:
                self.stats.termination_reason = "route_prefixes_budget_exhausted"
                raise
        self.stats.route_prefixes_expanded += 1

    def sample_state(self, body_id: str, jd: float) -> Any:
        """Charge every logical lookup through the request-owned ephemeris session."""

        self.checkpoint()
        return self.ephemeris.sample_state(body_id, jd)

    def leg(
        self,
        from_id: str,
        to_id: str,
        departure_jd: float,
        tof_days: float,
        *,
        refinement: bool = False,
    ) -> Optional[Dict[str, Any]]:
        self.checkpoint()
        # Public departures are validated before the search starts and every
        # generated time of flight is positive, so only the upper epoch bound
        # can be crossed here. Such a derived leg is an infeasible candidate,
        # not a malformed request, and must consume no planning work.
        if float(departure_jd) + float(tof_days) > PLANNING_JD_MAX:
            return None
        if self.planning_context is not None:
            try:
                self.planning_context.reserve("leg_requests")
            except PlanningBudgetExceeded as exc:
                self.stats.termination_reason = f"{exc.counter}_budget_exhausted"
                raise
        # Count admitted logical requests, matching the authoritative context.
        # Rejected over-limit attempts are represented by terminationReason.
        self.stats.leg_requests += 1
        key = (
            from_id,
            to_id,
            round(float(departure_jd), 9),
            round(float(tof_days), 8),
            bool(self.prograde),
        )
        if key in self.leg_cache:
            self.stats.leg_cache_hits += 1
            return self.leg_cache[key]

        if self.stats.leg_evaluations >= self.current_stage_limit:
            label = "setup" if self.current_stage == 0 else f"assist_depth_{self.current_stage}"
            if label not in self.stats.stages_truncated:
                self.stats.stages_truncated.append(label)
            self.stats.termination_reason = f"{label}_budget_exhausted"
            raise _DepthBudgetExhausted(self.stats.termination_reason)
        if self.stats.leg_evaluations >= MAX_LEG_EVALUATIONS:
            self.stats.termination_reason = "leg_evaluations_budget_exhausted"
            raise _SearchStopped(self.stats.termination_reason)
        if self.planning_context is not None:
            try:
                self.planning_context.reserve("leg_evaluations")
            except PlanningBudgetExceeded as exc:
                self.stats.termination_reason = f"{exc.counter}_budget_exhausted"
                raise

        # Charge before doing work so provider or solver exceptions cannot make
        # the telemetry under-report consumed work.
        self.stats.leg_evaluations += 1
        label = "setup" if self.current_stage == 0 else f"assist_depth_{self.current_stage}"
        self.stats.leg_evaluations_by_stage[label] = (
            self.stats.leg_evaluations_by_stage.get(label, 0) + 1
        )
        if refinement:
            self.stats.root_refinement_evaluations += 1
        leg = compute_lambert_leg(
            self.ephemeris,
            from_id,
            to_id,
            float(departure_jd),
            float(tof_days),
            prograde=self.prograde,
        )
        if leg is None:
            self.stats.lambert_failures += 1
        self.leg_cache[key] = leg  # Cache failures as well as successes.
        return leg


def _generate_assist_routes(
    start_id: str,
    end_id: str,
    assist_pool: Sequence[str],
    max_assists: int,
) -> Iterable[List[str]]:
    """Return a bounded lazy skeleton iterator for exhaustive-oracle tests.

    Production MGA search does not consume this generator.
    """

    if not isinstance(start_id, str) or not start_id.strip():
        raise TrajectoryRequestRejected(
            "trajectory_invalid_body_id",
            "Trajectory departure body must be a non-empty string",
        )
    if not isinstance(end_id, str) or not end_id.strip():
        raise TrajectoryRequestRejected(
            "trajectory_invalid_body_id",
            "Trajectory destination body must be a non-empty string",
        )
    normalized_start = start_id.strip().lower()
    normalized_end = end_id.strip().lower()
    if (
        len(normalized_start) > MAX_BODY_ID_LENGTH
        or len(normalized_end) > MAX_BODY_ID_LENGTH
    ):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_body_id",
            f"Body identifiers are limited to {MAX_BODY_ID_LENGTH} characters",
        )
    if normalized_start == normalized_end:
        raise TrajectoryRequestRejected(
            "trajectory_same_body",
            "Trajectory departure and destination bodies must differ",
            context={"bodyId": normalized_start},
        )
    if isinstance(assist_pool, (str, bytes, bytearray)) or not isinstance(
        assist_pool, Sequence
    ):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_pool",
            "`assist_pool` must be a sequence of body identifiers",
        )
    submitted_pool_size = len(assist_pool)
    if submitted_pool_size > MAX_ASSIST_POOL_SIZE:
        raise TrajectoryRequestRejected(
            "trajectory_complexity_limit",
            f"`assist_pool` is limited to {MAX_ASSIST_POOL_SIZE} entries",
            context={
                "assistPoolSize": submitted_pool_size,
                "maximumAssistPoolSize": MAX_ASSIST_POOL_SIZE,
            },
        )
    if isinstance(max_assists, bool) or not isinstance(max_assists, int):
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_depth",
            f"`max_assists` must be an integer between 0 and {MAX_ASSISTS}",
        )
    if max_assists < 0 or max_assists > MAX_ASSISTS:
        raise TrajectoryRequestRejected(
            "trajectory_invalid_assist_depth",
            f"`max_assists` must be between 0 and {MAX_ASSISTS}",
            context={"minimum": 0, "maximum": MAX_ASSISTS, "received": max_assists},
        )

    # Index exactly the already-bounded submitted cardinality. This avoids
    # trusting a custom Sequence's iterator to stop where its length claims.
    normalized_pool: List[str] = []
    for index in range(submitted_pool_size):
        item = assist_pool[index]
        if not isinstance(item, str) or not item.strip():
            raise TrajectoryRequestRejected(
                "trajectory_invalid_assist_pool",
                "Assist body identifiers must be non-empty strings",
            )
        normalized = item.strip().lower()
        if len(normalized) > MAX_BODY_ID_LENGTH:
            raise TrajectoryRequestRejected(
                "trajectory_invalid_body_id",
                f"Body identifiers are limited to {MAX_BODY_ID_LENGTH} characters",
            )
        normalized_pool.append(normalized)
    duplicates = sorted(
        {item for item in normalized_pool if normalized_pool.count(item) > 1}
    )
    if duplicates:
        raise TrajectoryRequestRejected(
            "trajectory_duplicate_assist",
            "`assist_pool` must not contain duplicate bodies",
            context={"duplicates": duplicates},
        )

    pool = tuple(
        sorted(
            item
            for item in normalized_pool
            if item not in (normalized_start, normalized_end)
        )
    )
    topology_count = estimate_route_count(len(pool), max_assists)
    if topology_count > HARD_MAX_ROUTE_TOPOLOGIES:
        raise TrajectoryRequestRejected(
            "trajectory_complexity_limit",
            "Trajectory request exceeds the route-topology limit",
            context={
                "assistPoolSize": len(pool),
                "estimatedRouteCount": topology_count,
                "maximumRouteCount": HARD_MAX_ROUTE_TOPOLOGIES,
            },
        )

    def backtrack(path: List[str], remaining_depth: int) -> Iterable[List[str]]:
        if remaining_depth == 0:
            yield [*path, normalized_end]
            return
        for candidate in pool:
            if candidate in path:
                continue
            yield from backtrack([*path, candidate], remaining_depth - 1)

    def generate() -> Iterable[List[str]]:
        yield [normalized_start, normalized_end]
        for assist_count in range(1, max_assists + 1):
            yield from backtrack([normalized_start], assist_count)

    return generate()


def _unique_sorted(values: Sequence[float]) -> List[float]:
    return sorted(
        {
            round(float(value), 8)
            for value in values
            if math.isfinite(float(value)) and float(value) > 0.0
        }
    )


def _leg_tof_candidates(
    ephemeris: Any,
    from_id: str,
    to_id: str,
    departure_jd: float,
) -> List[float]:
    from_state = ephemeris.sample_state(from_id, departure_jd)
    to_state = ephemeris.sample_state(to_id, departure_jd)
    r1 = vector_length(from_state.position_au)
    r2 = vector_length(to_state.position_au)
    transfer_a = max(0.01, 0.5 * (r1 + r2))
    hohmann_tof = math.pi * math.sqrt((transfer_a**3) / MU_SUN_AU3_DAY2)
    scaled = [
        hohmann_tof * 0.55,
        hohmann_tof * 0.75,
        hohmann_tof,
        hohmann_tof * 1.25,
        hohmann_tof * 1.6,
    ]
    coarse = [70.0, 100.0, 140.0, 190.0, 260.0, 360.0, 520.0, 700.0, 980.0, 1280.0]
    return _unique_sorted(
        [
            round(max(45.0, min(2_000.0, value)) / 5.0) * 5.0
            for value in [*scaled, *coarse]
        ]
    )


def _bounded_tof_seeds(values: Sequence[float], limit: int = ASSIST_TOF_SEEDS) -> List[float]:
    ordered = _unique_sorted(values)
    if len(ordered) <= limit:
        return ordered
    if limit <= 1:
        return ordered[:1]
    indices = [round(index * (len(ordered) - 1) / (limit - 1)) for index in range(limit)]
    return [ordered[index] for index in dict.fromkeys(indices)]


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
    rp_au = min_flyby_periapsis_km(body, radius_km) / AU_KM if body_parameters_valid else 0.0

    max_turn = 0.0
    if mu_body > 0.0 and v_inf_in_mag_au_day > 1e-12:
        denominator = 1.0 + (rp_au * (v_inf_in_mag_au_day**2)) / mu_body
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
    assist_gain = 2.0 * v_inf_in_kms * math.sin(required_turn / 2.0) if feasible else 0.0
    return {
        "assistGainKmS": assist_gain,
        "requiredTurnDeg": math.degrees(required_turn),
        "maxTurnDeg": math.degrees(max_turn),
        "minPeriapsisKm": rp_au * AU_KM,
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
    return (
        -route["totalDeltaVKmS"]
        - route["totalTimeDays"] * 0.0025
        - route["totalPathLengthAu"] * 0.08
        + route["totalAssistGainKmS"] * 0.25
    )


def _partial_sort_key(partial: _Partial, objective: str) -> tuple[Any, ...]:
    elapsed = float(partial.current_jd - partial.legs[0]["departureJd"])
    if objective == "min_time":
        priority = (elapsed, partial.departure_delta_v_kms, partial.total_path_length_au)
    elif objective == "max_assist":
        priority = (-partial.total_assist_gain_kms, partial.departure_delta_v_kms, elapsed)
    else:
        priority = (partial.total_path_length_au, partial.departure_delta_v_kms, elapsed)
    return (
        *(round(float(value), 12) for value in priority),
        len(partial.body_route),
        partial.body_route,
        round(partial.current_jd, 9),
        tuple(round(value, 8) for value in partial.tof_sequence),
    )


def _select_frontier(
    candidates: Sequence[_Partial], objective: str, stats: _SearchStats
) -> List[_Partial]:
    ordered = sorted(candidates, key=lambda item: _partial_sort_key(item, objective))
    unique: List[_Partial] = []
    seen: set[tuple[Any, ...]] = set()
    for candidate in ordered:
        key = (
            candidate.body_route,
            round(candidate.current_jd, 9),
            tuple(round(value, 8) for value in candidate.tof_sequence),
        )
        if key in seen:
            stats.partials_pruned_by_duplicate += 1
            continue
        seen.add(key)
        unique.append(candidate)

    selected: List[_Partial] = []
    selected_ids: set[int] = set()
    for body_id in sorted({candidate.body_route[-1] for candidate in unique}):
        candidate = next(item for item in unique if item.body_route[-1] == body_id)
        selected.append(candidate)
        selected_ids.add(id(candidate))
        if len(selected) >= GLOBAL_BEAM_WIDTH:
            break

    prefix_counts: Dict[tuple[str, ...], int] = {}
    for candidate in selected:
        prefix_counts[candidate.body_route] = prefix_counts.get(candidate.body_route, 0) + 1
    for candidate in unique:
        if len(selected) >= GLOBAL_BEAM_WIDTH:
            break
        if id(candidate) in selected_ids:
            continue
        count = prefix_counts.get(candidate.body_route, 0)
        if count >= MAX_PARTIALS_PER_ROUTE_PREFIX:
            continue
        selected.append(candidate)
        prefix_counts[candidate.body_route] = count + 1

    selected.sort(key=lambda item: _partial_sort_key(item, objective))
    if len(selected) > GLOBAL_BEAM_WIDTH:
        raise AssertionError("global MGA frontier exceeded its hard beam width")
    stats.max_frontier_size = max(stats.max_frontier_size, len(selected))
    stats.partials_retained += len(selected)
    stats.partials_pruned_by_beam += max(0, len(unique) - len(selected))
    return selected


def _vinf_residual_kms(
    incoming_leg: Dict[str, Any], outgoing_leg: Dict[str, Any]
) -> tuple[float, float]:
    v_inf_in = vector_sub(incoming_leg["arrivalVelocityApprox"], incoming_leg["toPlanetVelocity"])
    v_inf_out = vector_sub(outgoing_leg["departureVelocityApprox"], outgoing_leg["fromPlanetVelocity"])
    incoming = au_per_day_to_km_per_sec(vector_length(v_inf_in))
    outgoing = au_per_day_to_km_per_sec(vector_length(v_inf_out))
    tolerance = max(
        UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS,
        UNPOWERED_FLYBY_VINF_REL_TOLERANCE * max(incoming, outgoing),
    )
    return outgoing - incoming, tolerance


def _refine_vinf_root(
    runtime: _SearchRuntime,
    partial: _Partial,
    to_id: str,
    left: tuple[float, Dict[str, Any], float],
    right: tuple[float, Dict[str, Any], float],
) -> Optional[tuple[float, Dict[str, Any]]]:
    left_tof, left_leg, left_residual = left
    right_tof, right_leg, right_residual = right
    if left_residual * right_residual > 0.0:
        return None
    runtime.stats.vinf_root_brackets += 1
    best = left if abs(left_residual) <= abs(right_residual) else right
    probes_remaining = MAX_ROOT_ITERATIONS
    while probes_remaining > 0:
        runtime.checkpoint()
        midpoint = 0.5 * (left_tof + right_tof)
        denominator = right_residual - left_residual
        trial_tof = (
            right_tof - right_residual * (right_tof - left_tof) / denominator
            if abs(denominator) > 1e-14
            else midpoint
        )
        if not math.isfinite(trial_tof) or trial_tof <= left_tof or trial_tof >= right_tof:
            trial_tof = midpoint
        trial_leg = runtime.leg(
            partial.body_route[-1],
            to_id,
            partial.current_jd,
            trial_tof,
            refinement=True,
        )
        probes_remaining -= 1
        if trial_leg is None:
            if trial_tof != midpoint and probes_remaining > 0:
                trial_tof = midpoint
                trial_leg = runtime.leg(
                    partial.body_route[-1],
                    to_id,
                    partial.current_jd,
                    trial_tof,
                    refinement=True,
                )
                probes_remaining -= 1
            if trial_leg is None:
                return None
        trial_residual, tolerance = _vinf_residual_kms(partial.legs[-1], trial_leg)
        trial = (trial_tof, trial_leg, trial_residual)
        if abs(trial_residual) < abs(best[2]):
            best = trial
        if abs(trial_residual) <= tolerance:
            return trial_tof, trial_leg
        if left_residual * trial_residual <= 0.0:
            right_tof, right_leg, right_residual = trial
        else:
            left_tof, left_leg, left_residual = trial

    best_residual, best_tolerance = _vinf_residual_kms(partial.legs[-1], best[1])
    return (best[0], best[1]) if abs(best_residual) <= best_tolerance else None


def _refine_vinf_minimum(
    runtime: _SearchRuntime,
    partial: _Partial,
    to_id: str,
    left_tof: float,
    right_tof: float,
) -> Optional[tuple[float, Dict[str, Any]]]:
    """Inspect a bounded same-sign interval for a tangential residual root."""

    runtime.stats.vinf_tangential_searches += 1
    inverse_phi = (math.sqrt(5.0) - 1.0) / 2.0
    a = float(left_tof)
    b = float(right_tof)

    def evaluate(tof: float) -> Optional[tuple[float, Dict[str, Any], float, float]]:
        leg = runtime.leg(
            partial.body_route[-1],
            to_id,
            partial.current_jd,
            tof,
            refinement=True,
        )
        if leg is None:
            return None
        residual, tolerance = _vinf_residual_kms(partial.legs[-1], leg)
        return tof, leg, residual, tolerance

    x1 = b - inverse_phi * (b - a)
    x2 = a + inverse_phi * (b - a)
    state1 = evaluate(x1)
    state2 = evaluate(x2)
    if state1 is None or state2 is None:
        return None
    best = state1 if abs(state1[2]) <= abs(state2[2]) else state2

    # The two initial probes count toward the same twenty-evaluation ceiling.
    for _ in range(max(0, MAX_ROOT_ITERATIONS - 2)):
        runtime.checkpoint()
        if abs(state1[2]) <= abs(state2[2]):
            b = state2[0]
            state2 = state1
            x1 = b - inverse_phi * (b - a)
            state1 = evaluate(x1)
            if state1 is None:
                return None
            if abs(state1[2]) < abs(best[2]):
                best = state1
        else:
            a = state1[0]
            state1 = state2
            x2 = a + inverse_phi * (b - a)
            state2 = evaluate(x2)
            if state2 is None:
                return None
            if abs(state2[2]) < abs(best[2]):
                best = state2

    return (best[0], best[1]) if abs(best[2]) <= best[3] else None


def _matched_outgoing_legs(
    runtime: _SearchRuntime,
    partial: _Partial,
    to_id: str,
    assist_body: Dict[str, Any],
) -> Iterable[tuple[float, Dict[str, Any], Dict[str, Any]]]:
    seeds = _bounded_tof_seeds(
        _leg_tof_candidates(runtime, partial.body_route[-1], to_id, partial.current_jd)
    )
    sampled: List[tuple[float, Dict[str, Any], float, float]] = []
    accepted: Dict[float, tuple[float, Dict[str, Any], Dict[str, Any]]] = {}
    roots_inspected: set[float] = set()
    root_attempts = 0

    def reserve_root_attempt(tof: float) -> bool:
        nonlocal root_attempts
        key = round(float(tof), 8)
        if key in roots_inspected or root_attempts >= MAX_REFINED_ROOTS_PER_EDGE:
            return False
        roots_inspected.add(key)
        root_attempts += 1
        runtime.stats.vinf_root_attempts += 1
        return True

    def consider(
        tof: float, leg: Dict[str, Any], *, reserved: bool = False
    ) -> Optional[tuple[float, Dict[str, Any], Dict[str, Any]]]:
        key = round(float(tof), 8)
        if not reserved and not reserve_root_attempt(tof):
            return None
        runtime.stats.flyby_checks += 1
        flyby = _evaluate_flyby(assist_body, partial.legs[-1], leg)
        if flyby["feasible"]:
            runtime.stats.vinf_roots_certified += 1
            accepted[key] = (float(tof), leg, flyby)
            return accepted[key]
        else:
            runtime.stats.reject_flyby(str(flyby["reason"]))
        return None

    for tof in seeds:
        leg = runtime.leg(partial.body_route[-1], to_id, partial.current_jd, tof)
        if leg is None:
            continue
        residual, tolerance = _vinf_residual_kms(partial.legs[-1], leg)
        sampled.append((tof, leg, residual, tolerance))
        if abs(residual) <= tolerance and root_attempts < MAX_REFINED_ROOTS_PER_EDGE:
            match = consider(tof, leg)
            if match is not None:
                yield match

    for index in range(len(sampled) - 1):
        if root_attempts >= MAX_REFINED_ROOTS_PER_EDGE:
            break
        left = sampled[index]
        right = sampled[index + 1]
        if (
            abs(left[2]) <= left[3]
            or abs(right[2]) <= right[3]
            or left[2] * right[2] >= 0.0
        ):
            continue
        # A bracket refinement consumes one of the two per-edge root slots
        # even if the numerical refinement or subsequent turn check fails.
        # This makes the computational bound independent of flyby feasibility.
        root_attempts += 1
        runtime.stats.vinf_root_attempts += 1
        refined = _refine_vinf_root(
            runtime,
            partial,
            to_id,
            (left[0], left[1], left[2]),
            (right[0], right[1], right[2]),
        )
        if refined is not None:
            roots_inspected.add(round(float(refined[0]), 8))
            match = consider(*refined, reserved=True)
            if match is not None:
                yield match

    # A tangential root need not change sign. Inspect only a strict sampled
    # local minimum already near the physical tolerance, and keep the same
    # two-root/evaluation ceilings as bracketed refinement.
    for index in range(1, len(sampled) - 1):
        if root_attempts >= MAX_REFINED_ROOTS_PER_EDGE:
            break
        previous = sampled[index - 1]
        current = sampled[index]
        following = sampled[index + 1]
        if not (
            abs(current[2]) > current[3]
            and abs(current[2]) < abs(previous[2])
            and abs(current[2]) < abs(following[2])
            and abs(current[2]) <= VINFINITY_NEAR_ROOT_THRESHOLD_KMS
        ):
            continue
        root_attempts += 1
        runtime.stats.vinf_root_attempts += 1
        refined = _refine_vinf_minimum(
            runtime,
            partial,
            to_id,
            previous[0],
            following[0],
        )
        if refined is not None:
            if any(
                abs(float(refined[0]) - accepted_tof)
                <= VINF_ROOT_DUPLICATE_TOF_TOLERANCE_DAYS
                for accepted_tof in accepted
            ):
                # Refine first: an accepted bracket root elsewhere in the
                # three-seed interval does not prove this minimum is the same
                # physical root. Only suppress a numerically adjacent result.
                continue
            roots_inspected.add(round(float(refined[0]), 8))
            match = consider(*refined, reserved=True)
            if match is not None:
                yield match


def _make_partial_from_first_leg(from_id: str, to_id: str, leg: Dict[str, Any]) -> _Partial:
    return _Partial(
        body_route=(from_id, to_id),
        current_jd=float(leg["arrivalJd"]),
        legs=(leg,),
        assists=(),
        total_assist_gain_kms=0.0,
        departure_delta_v_kms=float(leg["deltaVDepartureKmS"]),
        total_path_length_au=float(leg["pathLengthAu"]),
        tof_sequence=(float(leg["tofDays"]),),
    )


def _extend_partial(
    partial: _Partial, to_id: str, leg: Dict[str, Any], flyby: Dict[str, Any]
) -> _Partial:
    assist_body_id = partial.body_route[-1]
    return _Partial(
        body_route=(*partial.body_route, to_id),
        current_jd=float(leg["arrivalJd"]),
        legs=(*partial.legs, leg),
        assists=(*partial.assists, {"bodyId": assist_body_id, **flyby}),
        total_assist_gain_kms=partial.total_assist_gain_kms + float(flyby["assistGainKmS"]),
        departure_delta_v_kms=partial.departure_delta_v_kms,
        total_path_length_au=partial.total_path_length_au + float(leg["pathLengthAu"]),
        tof_sequence=(*partial.tof_sequence, float(leg["tofDays"])),
    )


def _complete_route(partial: _Partial, objective: str) -> Dict[str, Any]:
    assisted = bool(partial.assists)
    route = {
        "bodyRoute": list(partial.body_route),
        "legs": list(partial.legs),
        "assists": list(partial.assists),
        "objective": objective,
        "routeClass": "gravity_assist" if assisted else "direct",
        "solver": "lambert_mga_bounded" if assisted else "lambert_direct",
        "feasibilityCertified": True,
        "totalAssistGainKmS": partial.total_assist_gain_kms,
        "totalDeltaVKmS": partial.departure_delta_v_kms
        + float(partial.legs[-1]["deltaVArrivalKmS"]),
        "totalPathLengthAu": partial.total_path_length_au,
        "pathMetric": "endpoint_chord_sum",
        "deltaVModel": "endpoint_v_infinity_sum_not_propulsive_burns",
        "assistGainMetric": "patched_conic_velocity_deflection",
        "totalTimeDays": float(partial.current_jd - partial.legs[0]["departureJd"]),
        "turnDeficitPenalty": 0.0,
        "flybyConstraintMode": (
            "unpowered_vinf_continuity_and_turn_limit" if assisted else "not_applicable"
        ),
        "hardConstraintMode": (
            "unpowered_flyby_vinf_continuity_and_turn_limit" if assisted else "direct_lambert"
        ),
    }
    route["score"] = _score_route(route, objective)
    return route


def _completed_sort_key(route: Dict[str, Any]) -> tuple[Any, ...]:
    return (
        -round(float(route["score"]), 12),
        round(float(route["totalDeltaVKmS"]), 12),
        round(float(route["totalTimeDays"]), 9),
        len(route["bodyRoute"]),
        tuple(route["bodyRoute"]),
        tuple(round(float(leg["tofDays"]), 8) for leg in route["legs"]),
    )


def _retain_completed(routes: List[Dict[str, Any]]) -> None:
    deduped: Dict[tuple[Any, ...], Dict[str, Any]] = {}
    for route in routes:
        key = (
            tuple(route["bodyRoute"]),
            tuple(round(float(leg["tofDays"]), 8) for leg in route["legs"]),
        )
        existing = deduped.get(key)
        if existing is None or _completed_sort_key(route) < _completed_sort_key(existing):
            deduped[key] = route
    routes[:] = sorted(deduped.values(), key=_completed_sort_key)[:MAX_COMPLETED]


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
    planning_context: PlanningContext | None = None,
) -> Dict[str, Any]:
    """Search direct and assisted transfers within deterministic hard budgets."""

    validated = validate_plan_request(
        bodies,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        objective=objective,
        max_assists=max_assists,
        assist_pool=assist_pool,
        default_assist_pool=(),
        max_assist_pool_size=MAX_ASSIST_POOL_SIZE,
        max_route_topologies=HARD_MAX_ROUTE_TOPOLOGIES,
    )
    if validated.estimated_route_count > HARD_MAX_ROUTE_TOPOLOGIES:
        raise TrajectoryRequestRejected(
            "trajectory_complexity_limit",
            "Trajectory request exceeds the route-topology limit",
            context={
                "estimatedRouteCount": validated.estimated_route_count,
                "maximumRouteCount": HARD_MAX_ROUTE_TOPOLOGIES,
            },
        )

    if type(ephemeris) is not EphemerisService:
        raise ValueError("MGA requires an exact budget-enforcing EphemerisService")

    requested_provider = str(getattr(ephemeris, "provider", "")).strip().lower()
    resolved_provider = str(getattr(ephemeris, "resolved_provider", "")).strip().lower()
    if "horizons" in (requested_provider, resolved_provider):
        raise ValueError(
            "Horizons is not supported for combinatorial trajectory search; "
            "use `kepler`/`auto` for planning or direct Lambert for Horizons"
        )
    owned_context = getattr(ephemeris, "planning_context", None)
    if owned_context is None:
        owned_context = getattr(ephemeris, "_context", None)
    if type(owned_context) is not PlanningContext:
        raise ValueError("MGA ephemeris session must be owned by an exact PlanningContext")
    if planning_context is None:
        planning_context = owned_context
    elif type(planning_context) is not PlanningContext:
        raise ValueError("MGA planning context must be an exact PlanningContext")
    elif owned_context is not planning_context:
        raise ValueError("MGA ephemeris session does not belong to the supplied planning context")
    planning_context.checkpoint()

    from_id = validated.from_id
    to_id = validated.to_id
    departure_jd = validated.departure_jd
    objective = validated.objective
    bounded_assists = validated.max_assists
    normalized_pool = list(validated.effective_assist_pool)
    required_assists = normalized_pool if bounded_assists > 0 else []
    ephemeris.preflight([from_id, to_id, *required_assists])
    body_by_id = {
        str(body["id"]).strip().lower(): dict(body)
        for body in bodies
        if body.get("id") is not None
    }
    runtime = _SearchRuntime(ephemeris, planning_context, prograde)
    completed: List[Dict[str, Any]] = []

    try:
        # Direct routes are guaranteed work inside the same search and budget.
        runtime.begin_stage(0, bounded_assists)
        runtime.claim_prefix()
        for tof in _leg_tof_candidates(runtime, from_id, to_id, float(departure_jd)):
            leg = runtime.leg(from_id, to_id, departure_jd, tof)
            if leg is None:
                continue
            completed.append(_complete_route(_make_partial_from_first_leg(from_id, to_id, leg), objective))
            runtime.stats.direct_routes += 1
        _retain_completed(completed)

        if bounded_assists > 0:
            initial: List[_Partial] = []
            for assist_id in normalized_pool:
                runtime.claim_prefix()
                seeds = _bounded_tof_seeds(
                    _leg_tof_candidates(runtime, from_id, assist_id, float(departure_jd))
                )
                for tof in seeds:
                    leg = runtime.leg(from_id, assist_id, departure_jd, tof)
                    if leg is None:
                        continue
                    initial.append(_make_partial_from_first_leg(from_id, assist_id, leg))
                    runtime.stats.partials_generated += 1

            frontier = _select_frontier(initial, objective, runtime.stats)
            for assist_depth in range(1, bounded_assists + 1):
                runtime.begin_stage(assist_depth, bounded_assists)
                next_candidates: List[_Partial] = []
                ordered_frontier = sorted(
                    frontier, key=lambda item: _partial_sort_key(item, objective)
                )
                options_by_partial: List[tuple[_Partial, List[str]]] = []
                for partial in ordered_frontier:
                    options = [to_id]
                    if assist_depth < bounded_assists:
                        options.extend(
                            body_id
                            for body_id in normalized_pool
                            if body_id not in partial.body_route
                        )
                    options_by_partial.append((partial, options))

                # Round-robin by option index: every retained prefix attempts
                # its destination before any prefix spends work on another
                # assist, then each receives one assist edge per round.
                option_rounds = max(
                    (len(options) for _partial, options in options_by_partial),
                    default=0,
                )
                try:
                    for option_index in range(option_rounds):
                        for partial, options in options_by_partial:
                            if option_index >= len(options):
                                continue
                            runtime.checkpoint()
                            next_body_id = options[option_index]
                            current_body_id = partial.body_route[-1]
                            assist_body = body_by_id[current_body_id]
                            runtime.claim_prefix()
                            matches = _matched_outgoing_legs(
                                runtime,
                                partial,
                                next_body_id,
                                assist_body,
                            )
                            if next_body_id == to_id:
                                for _tof, leg, flyby in matches:
                                    completed.append(
                                        _complete_route(
                                            _extend_partial(partial, to_id, leg, flyby),
                                            objective,
                                        )
                                    )
                                    runtime.stats.assisted_routes += 1
                                _retain_completed(completed)
                            else:
                                for _tof, leg, flyby in matches:
                                    next_candidates.append(
                                        _extend_partial(partial, next_body_id, leg, flyby)
                                    )
                                    runtime.stats.partials_generated += 1
                except _DepthBudgetExhausted:
                    # The cumulative stage ceiling deliberately preserves the
                    # reserved budget for deeper routes. Certified matches
                    # yielded before the ceiling remain in their owner lists.
                    pass

                if assist_depth >= bounded_assists:
                    break
                frontier = _select_frontier(next_candidates, objective, runtime.stats)
                if not frontier:
                    break
    except (_SearchStopped, _DepthBudgetExhausted):
        pass
    except PlanningBudgetExceeded as exc:
        if not completed:
            raise
        runtime.stats.termination_reason = f"{exc.counter}_budget_exhausted"
    except PlanningDeadlineExceeded:
        if not completed:
            raise
        runtime.stats.termination_reason = "deadline_exceeded"
    except PlanningCancelled:
        if not completed:
            raise
        reason = (
            planning_context.termination_reason
            if planning_context is not None and planning_context.termination_reason
            else "cancelled"
        )
        runtime.stats.termination_reason = str(reason)

    _retain_completed(completed)
    return {
        "best": completed[0] if completed else None,
        "alternatives": completed[1 : 1 + MAX_RETURNED_ALTERNATIVES],
        "search": runtime.stats.telemetry(len(completed), planning_context),
    }


__all__ = [
    "ASSIST_TOF_SEEDS",
    "GLOBAL_BEAM_WIDTH",
    "MAX_ASSISTS",
    "MAX_ASSIST_POOL_SIZE",
    "MAX_COMPLETED",
    "MAX_LEG_EVALUATIONS",
    "MAX_PREFIX_EXPANSIONS",
    "MIN_FLYBY_ALTITUDE_KM",
    "MIN_FLYBY_PERIAPSIS_KM",
    "min_flyby_periapsis_km",
    "PRUNE_PER_DEPTH",
    "UNPOWERED_FLYBY_TURN_TOLERANCE_RAD",
    "UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS",
    "UNPOWERED_FLYBY_VINF_REL_TOLERANCE",
    "VINFINITY_NEAR_ROOT_THRESHOLD_KMS",
    "_evaluate_flyby",
    "_generate_assist_routes",
    "optimize_mga_route",
]
