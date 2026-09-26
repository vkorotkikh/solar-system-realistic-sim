from __future__ import annotations

import threading
import time
from dataclasses import replace

import pytest

from data.bodies import ALL_BODIES
from trajectory.budget import (
    HARD_MAX_EPHEMERIS_QUERIES,
    HARD_MAX_EXTERNAL_REQUESTS,
    HARD_MAX_LEG_EVALUATIONS,
    HARD_MAX_LEG_REQUESTS,
    HARD_MAX_PLANNING_TIMEOUT_SECONDS,
    HARD_MAX_REMOTE_EPHEMERIS_STATES,
    HARD_MAX_ROUTE_PREFIXES,
    HARD_MAX_UNIQUE_EPHEMERIS_STATES,
    PlanningBudgetExceeded,
    PlanningCancelled,
    PlanningContext,
    PlanningDeadlineExceeded,
    PlanningLimits,
    PlanningStats,
)
from trajectory.contracts import (
    MAX_BODY_ID_LENGTH,
    TrajectoryRequestRejected,
    estimate_route_count,
    validate_plan_request,
)
from trajectory.planner import DEFAULT_ASSIST_POOL


def _validate(**overrides):
    kwargs = {
        "from_id": "earth",
        "to_id": "jupiter",
        "departure_jd": 2_460_500.5,
        "objective": "min_distance",
        "max_assists": 3,
        "assist_pool": None,
        "default_assist_pool": DEFAULT_ASSIST_POOL,
    }
    kwargs.update(overrides)
    return validate_plan_request(ALL_BODIES, **kwargs)


def test_route_count_matches_ordered_no_repeat_topologies() -> None:
    assert estimate_route_count(0, 3) == 1
    assert estimate_route_count(4, 3) == 41
    assert estimate_route_count(8, 3) == 401
    assert estimate_route_count(39, 3) == 56_356


def test_plan_contract_preserves_explicit_empty_pool() -> None:
    validated = _validate(assist_pool=[])

    assert validated.requested_assist_pool == ()
    assert validated.effective_assist_pool == ()
    assert validated.estimated_route_count == 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"assist_pool": "venus"},
        {"assist_pool": None, "default_assist_pool": "venus"},
    ],
)
def test_plan_contract_rejects_bare_string_pool(overrides) -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(**overrides)

    assert caught.value.code == "trajectory_invalid_assist_pool"


def test_plan_contract_rejects_unknown_or_identical_endpoints_for_non_http_callers() -> None:
    with pytest.raises(TrajectoryRequestRejected) as unknown:
        _validate(from_id="unknown-world")
    assert unknown.value.code == "trajectory_unknown_body"

    with pytest.raises(TrajectoryRequestRejected) as identical:
        _validate(to_id="earth")
    assert identical.value.code == "trajectory_same_body"


def test_plan_contract_removes_endpoints_before_counting() -> None:
    validated = _validate(assist_pool=["earth", "venus", "mars", "jupiter"])

    assert validated.requested_assist_pool == ("earth", "venus", "mars", "jupiter")
    assert validated.effective_assist_pool == ("mars", "venus")
    assert validated.estimated_route_count == 5


def test_plan_contract_sorts_effective_pool_for_deterministic_search() -> None:
    first = _validate(assist_pool=["saturn", "venus", "mars"])
    second = _validate(assist_pool=["mars", "saturn", "venus"])

    assert first.effective_assist_pool == ("mars", "saturn", "venus")
    assert second.effective_assist_pool == first.effective_assist_pool


@pytest.mark.parametrize("value", [True, "3", 3.0, -1, 4])
def test_plan_contract_hard_rejects_invalid_assist_depth(value) -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(max_assists=value)

    assert caught.value.code == "trajectory_invalid_assist_depth"


@pytest.mark.parametrize("value", [float("nan"), float("inf"), "2460500.5", True])
def test_plan_contract_hard_rejects_invalid_departure_epoch(value) -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(departure_jd=value)

    assert caught.value.code == "trajectory_invalid_departure_jd"


@pytest.mark.parametrize("value", ["fastest", "", 1, True])
def test_plan_contract_hard_rejects_invalid_objective(value) -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(objective=value)

    assert caught.value.code == "trajectory_invalid_objective"


def test_plan_contract_returns_normalized_epoch_and_objective() -> None:
    validated = _validate(objective=" MIN_TIME ", departure_jd=2_460_500)

    assert validated.departure_jd == 2_460_500.0
    assert validated.objective == "min_time"


def test_plan_contract_caps_body_identifier_length() -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(from_id="x" * (MAX_BODY_ID_LENGTH + 1))

    assert caught.value.code == "trajectory_invalid_body_id"


def test_plan_contract_rejects_orbitless_endpoint_but_not_massless_orbiting_endpoint() -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(from_id="sun")
    assert caught.value.code == "trajectory_invalid_endpoint_body"

    massless_probe = {
        "id": "massless-probe",
        "name": "Massless probe",
        "type": "spacecraft",
        "orbit": dict(next(body for body in ALL_BODIES if body["id"] == "earth")["orbit"]),
        "mass_kg": 0.0,
        "radius_km": 0.0,
    }
    validated = validate_plan_request(
        [*ALL_BODIES, massless_probe],
        from_id="massless-probe",
        to_id="earth",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=0,
        assist_pool=[],
        default_assist_pool=DEFAULT_ASSIST_POOL,
    )
    assert validated.from_id == "massless-probe"


@pytest.mark.parametrize(
    "orbit",
    [
        {},
        {"a_au": 1.0, "period_days": 365.0},
        {
            "a_au": 0.0,
            "e": 0.1,
            "i_deg": 0.0,
            "ascending_node_deg": 0.0,
            "arg_periapsis_deg": 0.0,
            "mean_anomaly_deg": 0.0,
            "period_days": 365.0,
        },
        {
            "a_au": 1.0,
            "e": float("nan"),
            "i_deg": 0.0,
            "ascending_node_deg": 0.0,
            "arg_periapsis_deg": 0.0,
            "mean_anomaly_deg": 0.0,
            "period_days": 365.0,
        },
    ],
)
def test_plan_contract_rejects_missing_or_malformed_orbital_elements(orbit) -> None:
    malformed = {
        "id": "malformed",
        "name": "Malformed",
        "type": "asteroid",
        "orbit": orbit,
        "mass_kg": 1.0,
        "radius_km": 1.0,
    }
    with pytest.raises(TrajectoryRequestRejected) as endpoint:
        validate_plan_request(
            [*ALL_BODIES, malformed],
            from_id="malformed",
            to_id="earth",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=0,
            assist_pool=[],
            default_assist_pool=[],
        )
    assert endpoint.value.code == "trajectory_invalid_endpoint_body"

    with pytest.raises(TrajectoryRequestRejected) as assist:
        validate_plan_request(
            [*ALL_BODIES, malformed],
            from_id="earth",
            to_id="jupiter",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=1,
            assist_pool=["malformed"],
            default_assist_pool=[],
        )
    assert assist.value.code == "trajectory_invalid_assist_body"


def test_plan_contract_rejects_duplicates_instead_of_silently_deduplicating() -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(assist_pool=["venus", "VENUS"])

    assert caught.value.code == "trajectory_duplicate_assist"
    assert caught.value.context == {"duplicates": ["venus"]}


def test_plan_contract_rejects_ninth_assist_before_route_generation() -> None:
    pool = [
        "mercury",
        "venus",
        "mars",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
        "ceres",
        "vesta",
    ]

    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(assist_pool=pool)

    assert caught.value.code == "trajectory_complexity_limit"
    assert caught.value.context["assistPoolSize"] == 9
    assert caught.value.context["maximumAssistPoolSize"] == 8


def test_plan_contract_consumes_only_the_declared_bounded_sequence_length() -> None:
    accessed: list[int] = []

    class LyingPool(list[str]):
        def __len__(self) -> int:
            return 1

        def __iter__(self):
            raise AssertionError("validation trusted an unbounded iterator")

        def __getitem__(self, index):
            accessed.append(index)
            if index > 0:
                raise AssertionError("validation read beyond the declared cardinality")
            return super().__getitem__(index)

    pool = LyingPool(["venus", *(["mars"] * 100)])
    validated = _validate(assist_pool=pool)

    assert accessed == [0]
    assert validated.requested_assist_pool == ("venus",)
    assert validated.effective_assist_pool == ("venus",)


@pytest.mark.parametrize("body_id", ["sun", "unknown-world"])
def test_plan_contract_rejects_ineligible_or_unknown_assists(body_id: str) -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        _validate(assist_pool=[body_id])

    assert caught.value.code == "trajectory_invalid_assist_body"
    assert caught.value.context == {"bodyIds": [body_id]}


def test_plan_contract_hard_clamps_caller_supplied_limits() -> None:
    pool = [
        "mercury",
        "venus",
        "mars",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
        "ceres",
        "vesta",
    ]
    with pytest.raises(TrajectoryRequestRejected):
        _validate(
            assist_pool=pool,
            max_assist_pool_size=10_000,
            max_route_topologies=10_000_000,
        )


def test_planning_context_group_reservation_is_atomic() -> None:
    context = PlanningContext.with_timeout(
        10.0,
        limits=PlanningLimits(
            ephemeris_queries=2,
            unique_ephemeris_states=1,
            remote_ephemeris_states=0,
            external_requests=0,
            leg_requests=1,
            leg_evaluations=1,
            route_prefixes=1,
        ),
    )
    context.reserve(ephemeris_queries=1, unique_ephemeris_states=1)

    with pytest.raises(PlanningBudgetExceeded) as caught:
        context.reserve(ephemeris_queries=1, unique_ephemeris_states=1)

    snapshot = context.snapshot()
    assert caught.value.counter == "unique_ephemeris_states"
    assert snapshot["counters"]["ephemeris_queries"] == 1
    assert snapshot["counters"]["unique_ephemeris_states"] == 1


def test_planning_context_cancellation_is_cooperative() -> None:
    cancel_event = threading.Event()
    context = PlanningContext.with_timeout(10.0, cancel_event=cancel_event)
    context.cancel("test_owner_cancelled")

    with pytest.raises(PlanningCancelled) as caught:
        context.checkpoint()

    assert caught.value.context["terminationReason"] == "test_owner_cancelled"


def test_planning_context_uses_monotonic_deadline() -> None:
    context = PlanningContext(
        deadline_monotonic=time.monotonic() - 0.001,
        limits=PlanningLimits(),
    )

    with pytest.raises(PlanningDeadlineExceeded):
        context.checkpoint()


@pytest.mark.parametrize(
    "counter,hard_limit",
    [
        ("ephemeris_queries", HARD_MAX_EPHEMERIS_QUERIES),
        ("unique_ephemeris_states", HARD_MAX_UNIQUE_EPHEMERIS_STATES),
        ("remote_ephemeris_states", HARD_MAX_REMOTE_EPHEMERIS_STATES),
        ("external_requests", HARD_MAX_EXTERNAL_REQUESTS),
        ("leg_requests", HARD_MAX_LEG_REQUESTS),
        ("leg_evaluations", HARD_MAX_LEG_EVALUATIONS),
        ("route_prefixes", HARD_MAX_ROUTE_PREFIXES),
    ],
)
def test_planning_limits_reject_values_above_compile_time_ceiling(
    counter: str,
    hard_limit: int,
) -> None:
    baseline = PlanningLimits()
    with pytest.raises(ValueError, match="hard ceiling"):
        replace(baseline, **{counter: hard_limit + 1})


def test_planning_context_rejects_deadline_beyond_hard_span() -> None:
    with pytest.raises(ValueError, match="cannot exceed"):
        PlanningContext.with_timeout(HARD_MAX_PLANNING_TIMEOUT_SECONDS + 0.001)

    with pytest.raises(ValueError, match="cannot exceed"):
        PlanningContext(
            deadline_monotonic=time.monotonic() + HARD_MAX_PLANNING_TIMEOUT_SECONDS + 0.1,
        )


def test_planning_context_start_anchor_cannot_be_spoofed() -> None:
    with pytest.raises(TypeError, match="started_monotonic"):
        PlanningContext(  # type: ignore[call-arg]
            deadline_monotonic=time.monotonic() + 1_000_000_001.0,
            started_monotonic=time.monotonic() + 1_000_000_000.0,
        )


def test_planning_context_owner_fields_and_counter_snapshots_are_read_only() -> None:
    context = PlanningContext.with_timeout(10.0)
    initial_stats = context.stats

    for name, value in (
        ("deadline_monotonic", time.monotonic() + 1_000_000.0),
        ("limits", PlanningLimits()),
        ("cancel_event", threading.Event()),
        ("stats", PlanningStats()),
    ):
        with pytest.raises(AttributeError):
            setattr(context, name, value)
    with pytest.raises(AttributeError):
        context.stats.ephemeris_queries = -1  # type: ignore[misc]

    context.reserve("ephemeris_queries")
    assert initial_stats.ephemeris_queries == 0
    assert context.stats.ephemeris_queries == 1


def test_planning_context_rejects_wrong_owner_types_and_nonzero_initial_stats() -> None:
    deadline = time.monotonic() + 1.0
    with pytest.raises(TypeError, match="exact PlanningLimits"):
        PlanningContext(deadline, limits=object())  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="exact threading.Event"):
        PlanningContext(deadline, cancel_event=object())  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="exact PlanningStats"):
        PlanningContext(deadline, stats=object())  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="start at zero"):
        PlanningContext(deadline, stats=PlanningStats(ephemeris_queries=1))
    with pytest.raises(ValueError, match="non-negative"):
        PlanningStats(ephemeris_queries=-1)


def test_planning_context_cancellation_cannot_be_cleared_after_cancel() -> None:
    context = PlanningContext.with_timeout(10.0)
    context.cancel("test_cancel")
    context.cancel_event.clear()

    with pytest.raises(PlanningCancelled) as caught:
        context.checkpoint()
    assert caught.value.context["terminationReason"] == "test_cancel"
