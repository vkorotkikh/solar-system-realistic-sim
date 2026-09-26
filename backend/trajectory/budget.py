"""Shared, request-owned work budgets for trajectory calculations.

The HTTP layer, route search, Lambert solver, and ephemeris providers all use
the same context.  This makes limits cumulative across the complete request
instead of allowing each layer (or each fallback provider) to start a fresh
budget.
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import asdict, dataclass, replace
from numbers import Real
from typing import Any


HARD_MAX_EPHEMERIS_QUERIES = 4_000
HARD_MAX_UNIQUE_EPHEMERIS_STATES = 2_000
HARD_MAX_REMOTE_EPHEMERIS_STATES = 128
HARD_MAX_EXTERNAL_REQUESTS = 16
HARD_MAX_LEG_REQUESTS = 2_400
HARD_MAX_LEG_EVALUATIONS = 2_000
HARD_MAX_ROUTE_PREFIXES = 256
HARD_MAX_PLANNING_TIMEOUT_SECONDS = 12.0

_HARD_LIMITS = {
    "ephemeris_queries": HARD_MAX_EPHEMERIS_QUERIES,
    "unique_ephemeris_states": HARD_MAX_UNIQUE_EPHEMERIS_STATES,
    "remote_ephemeris_states": HARD_MAX_REMOTE_EPHEMERIS_STATES,
    "external_requests": HARD_MAX_EXTERNAL_REQUESTS,
    "leg_requests": HARD_MAX_LEG_REQUESTS,
    "leg_evaluations": HARD_MAX_LEG_EVALUATIONS,
    "route_prefixes": HARD_MAX_ROUTE_PREFIXES,
}


class PlanningError(RuntimeError):
    """Base class for expected planning-control failures."""

    code = "trajectory_planning_error"

    def __init__(self, message: str, *, context: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.context = dict(context or {})


class PlanningCancelled(PlanningError):
    """Raised at a checkpoint after the request owner cancels the work."""

    code = "trajectory_cancelled"


class PlanningDeadlineExceeded(PlanningError):
    """Raised when the request-owned monotonic deadline has elapsed."""

    code = "trajectory_deadline_exceeded"


class PlanningBudgetExceeded(PlanningError):
    """Raised before an operation would exceed its configured counter limit."""

    code = "trajectory_compute_budget_exhausted"

    def __init__(self, counter: str, *, used: int, requested: int, limit: int) -> None:
        super().__init__(
            f"Trajectory planning exhausted the `{counter}` budget",
            context={
                "counter": counter,
                "used": int(used),
                "requested": int(requested),
                "limit": int(limit),
            },
        )
        self.counter = counter
        self.used = int(used)
        self.requested = int(requested)
        self.limit = int(limit)


@dataclass(frozen=True, slots=True)
class PlanningLimits:
    """Hard operation ceilings shared by all work performed for one request."""

    ephemeris_queries: int = 4_000
    unique_ephemeris_states: int = 2_000
    remote_ephemeris_states: int = 128
    external_requests: int = 16
    leg_requests: int = 2_400
    leg_evaluations: int = 2_000
    route_prefixes: int = 256

    def __post_init__(self) -> None:
        for name, value in asdict(self).items():
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"Planning limit `{name}` must be a non-negative integer")
            hard_limit = _HARD_LIMITS[name]
            if value > hard_limit:
                raise ValueError(
                    f"Planning limit `{name}` cannot exceed the hard ceiling {hard_limit}"
                )


@dataclass(frozen=True, slots=True)
class PlanningStats:
    """Immutable audit snapshot; only ``PlanningContext`` advances counters."""

    ephemeris_queries: int = 0
    unique_ephemeris_states: int = 0
    remote_ephemeris_states: int = 0
    external_requests: int = 0
    leg_requests: int = 0
    leg_evaluations: int = 0
    route_prefixes: int = 0
    # `cache_hits` is retained as the aggregate compatibility counter; the
    # split counters make request-local versus process-shared reuse auditable.
    cache_hits: int = 0
    request_cache_hits: int = 0
    shared_cache_hits: int = 0
    negative_cache_hits: int = 0
    provider_failures: int = 0
    circuit_open_rejections: int = 0
    cancellation_checks: int = 0

    def __post_init__(self) -> None:
        for name, value in asdict(self).items():
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"Planning statistic `{name}` must be a non-negative integer")


_LIMITED_COUNTERS = frozenset(PlanningLimits.__dataclass_fields__)
_STAT_COUNTERS = frozenset(PlanningStats.__dataclass_fields__)


class PlanningContext:
    """Request-scoped deadline, cancellation signal, limits, and telemetry."""

    __slots__ = (
        "_deadline_monotonic",
        "_limits",
        "_cancel_event",
        "_stats",
        "_started_monotonic",
        "_termination_reason",
        "_cancelled",
        "_lock",
    )

    def __init__(
        self,
        deadline_monotonic: float,
        limits: PlanningLimits | None = None,
        cancel_event: threading.Event | None = None,
        stats: PlanningStats | None = None,
    ) -> None:
        if isinstance(deadline_monotonic, bool) or not isinstance(deadline_monotonic, Real):
            raise TypeError("Planning deadline must be a real number")
        deadline = float(deadline_monotonic)
        if not math.isfinite(deadline):
            raise ValueError("Planning deadline must be finite")
        started = time.monotonic()
        maximum_deadline = started + HARD_MAX_PLANNING_TIMEOUT_SECONDS
        if deadline > maximum_deadline:
            raise ValueError(
                "Planning deadline cannot exceed "
                f"{HARD_MAX_PLANNING_TIMEOUT_SECONDS:.1f} seconds from context start"
            )

        resolved_limits = PlanningLimits() if limits is None else limits
        if type(resolved_limits) is not PlanningLimits:
            raise TypeError("Planning limits must be an exact PlanningLimits instance")
        resolved_event = threading.Event() if cancel_event is None else cancel_event
        if type(resolved_event) is not threading.Event:
            raise TypeError("Planning cancellation signal must be an exact threading.Event")
        resolved_stats = PlanningStats() if stats is None else stats
        if type(resolved_stats) is not PlanningStats:
            raise TypeError("Planning statistics must be an exact PlanningStats instance")
        if any(value != 0 for value in asdict(resolved_stats).values()):
            raise ValueError("Planning statistics must start at zero")

        self._deadline_monotonic = deadline
        self._limits = resolved_limits
        self._cancel_event = resolved_event
        self._stats = resolved_stats
        self._started_monotonic = started
        self._termination_reason: str | None = None
        self._cancelled = resolved_event.is_set()
        self._lock = threading.Lock()

    @property
    def deadline_monotonic(self) -> float:
        return self._deadline_monotonic

    @property
    def limits(self) -> PlanningLimits:
        return self._limits

    @property
    def cancel_event(self) -> threading.Event:
        return self._cancel_event

    @property
    def stats(self) -> PlanningStats:
        # A detached immutable snapshot prevents a caller retaining an alias to
        # the counters that enforce the budget.
        with self._lock:
            return replace(self._stats)

    @property
    def started_monotonic(self) -> float:
        return self._started_monotonic

    @property
    def termination_reason(self) -> str | None:
        with self._lock:
            return self._termination_reason

    @classmethod
    def with_timeout(
        cls,
        timeout_seconds: float,
        *,
        limits: PlanningLimits | None = None,
        cancel_event: threading.Event | None = None,
    ) -> "PlanningContext":
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, Real):
            raise TypeError("Planning timeout must be a real number")
        timeout = float(timeout_seconds)
        if not math.isfinite(timeout) or timeout <= 0.0:
            raise ValueError("Planning timeout must be finite and positive")
        if timeout > HARD_MAX_PLANNING_TIMEOUT_SECONDS:
            raise ValueError(
                f"Planning timeout cannot exceed {HARD_MAX_PLANNING_TIMEOUT_SECONDS:.1f} seconds"
            )
        return cls(
            deadline_monotonic=time.monotonic() + timeout,
            limits=PlanningLimits() if limits is None else limits,
            cancel_event=threading.Event() if cancel_event is None else cancel_event,
        )

    def cancel(self, reason: str = "cancelled") -> None:
        with self._lock:
            if self._termination_reason is None:
                self._termination_reason = str(reason)
            self._cancelled = True
        self._cancel_event.set()

    def checkpoint(self) -> None:
        with self._lock:
            self._stats = replace(
                self._stats,
                cancellation_checks=self._stats.cancellation_checks + 1,
            )
            cancelled = self._cancelled or self._cancel_event.is_set()
            if cancelled:
                self._cancelled = True
                reason = self._termination_reason or "cancelled"
                self._termination_reason = reason
        if cancelled:
            raise PlanningCancelled(
                "Trajectory planning was cancelled by its request owner",
                context={"terminationReason": reason},
            )
        if time.monotonic() >= self._deadline_monotonic:
            with self._lock:
                self._termination_reason = "deadline_exceeded"
            raise PlanningDeadlineExceeded(
                "Trajectory planning exceeded its internal deadline",
                context={"deadlineMonotonic": self._deadline_monotonic},
            )

    def remaining_seconds(self) -> float:
        return max(0.0, self._deadline_monotonic - time.monotonic())

    def reserve(self, name: str | None = None, amount: int = 1, **counters: int) -> None:
        """Atomically reserve one named operation or a group of operations.

        Both ``reserve("leg_evaluations")`` and
        ``reserve(leg_evaluations=1, ephemeris_queries=2)`` are supported.
        No counter is changed if any requested reservation would exceed its
        limit.
        """

        requested: dict[str, int] = dict(counters)
        if name is not None:
            if name in requested:
                raise ValueError(f"Counter `{name}` was supplied more than once")
            requested[name] = amount
        elif amount != 1:
            raise ValueError("`amount` requires a named counter")
        if not requested:
            raise ValueError("At least one counter reservation is required")

        self.checkpoint()
        normalized: dict[str, int] = {}
        for counter, increment in requested.items():
            if counter not in _LIMITED_COUNTERS:
                raise KeyError(f"Unknown limited planning counter `{counter}`")
            if isinstance(increment, bool) or not isinstance(increment, int) or increment < 0:
                raise ValueError(f"Reservation for `{counter}` must be a non-negative integer")
            normalized[counter] = increment

        with self._lock:
            for counter, increment in normalized.items():
                used = int(getattr(self._stats, counter))
                limit = int(getattr(self._limits, counter))
                if used + increment > limit:
                    self._termination_reason = f"{counter}_budget_exhausted"
                    raise PlanningBudgetExceeded(
                        counter,
                        used=used,
                        requested=increment,
                        limit=limit,
                    )
            updates = {
                counter: int(getattr(self._stats, counter)) + increment
                for counter, increment in normalized.items()
            }
            self._stats = replace(self._stats, **updates)

    def increment(self, name: str, amount: int = 1) -> None:
        """Increment a telemetry-only counter that has no hard ceiling."""

        if name not in _STAT_COUNTERS or name in _LIMITED_COUNTERS:
            raise KeyError(f"Unknown telemetry-only planning counter `{name}`")
        if isinstance(amount, bool) or not isinstance(amount, int) or amount < 0:
            raise ValueError(f"Increment for `{name}` must be a non-negative integer")
        with self._lock:
            self._stats = replace(
                self._stats,
                **{name: int(getattr(self._stats, name)) + amount},
            )

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            counters = asdict(self._stats)
            termination_reason = self._termination_reason
            cancelled = self._cancelled or self._cancel_event.is_set()
        return {
            "elapsedMs": max(0.0, (time.monotonic() - self._started_monotonic) * 1_000.0),
            "remainingMs": self.remaining_seconds() * 1_000.0,
            "terminationReason": termination_reason,
            "cancelled": cancelled,
            "limits": asdict(self._limits),
            "counters": counters,
        }


def default_planning_context(
    timeout_seconds: float = 7.0,
    *,
    cancel_event: threading.Event | None = None,
) -> PlanningContext:
    """Create the default bounded context used by non-HTTP planner callers."""

    return PlanningContext.with_timeout(timeout_seconds, cancel_event=cancel_event)


__all__ = [
    "HARD_MAX_EPHEMERIS_QUERIES",
    "HARD_MAX_EXTERNAL_REQUESTS",
    "HARD_MAX_LEG_EVALUATIONS",
    "HARD_MAX_LEG_REQUESTS",
    "HARD_MAX_PLANNING_TIMEOUT_SECONDS",
    "HARD_MAX_REMOTE_EPHEMERIS_STATES",
    "HARD_MAX_ROUTE_PREFIXES",
    "HARD_MAX_UNIQUE_EPHEMERIS_STATES",
    "PlanningBudgetExceeded",
    "PlanningCancelled",
    "PlanningContext",
    "PlanningDeadlineExceeded",
    "PlanningError",
    "PlanningLimits",
    "PlanningStats",
    "default_planning_context",
]
