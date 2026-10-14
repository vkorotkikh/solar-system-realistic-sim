"""Lambert transfer solver and porkchop window utilities."""

from __future__ import annotations

import math
from numbers import Real
from threading import Event
from typing import Any, Dict, List, Optional, Sequence, Tuple

from mission.ephemeris_service import (
    EphemerisProtocolError,
    EphemerisSample,
    EphemerisService,
    TRAJECTORY_STATE_CONTRACT,
)
from mission.orbital import (
    MU_SUN_AU3_DAY2,
    au_per_day_to_km_per_sec,
    safe_angle_between,
    vector_cross,
    vector_dot,
    vector_length,
    vector_sub,
)

from .budget import (
    HARD_MAX_UNIQUE_EPHEMERIS_STATES,
    PlanningBudgetExceeded,
    PlanningContext,
    PlanningError,
)
from .contracts import MAX_BODY_ID_LENGTH


LAMBERT_ROOT_TOLERANCE_DAYS = 1.0e-4
MAX_LAMBERT_ROOT_ITERATIONS = 512
MAX_LAMBERT_REVOLUTIONS = 10
FOUR_PI_SQUARED = 4.0 * math.pi * math.pi
# cosh/sinh(sqrt(-z)) overflow a double near sqrt(-z) = 710.
HYPERBOLIC_Z_LIMIT = -4.9e5
# IAU 2015 nominal solar radius. A point-mass Lambert problem has no minimum time of flight:
# near-parabolic arcs that dive at the focus get arbitrarily fast. Those are not trajectories.
SOLAR_RADIUS_AU = 695_700.0 / 149_597_870.7
MAX_PORKCHOP_GRID_POINTS = 2_000
MAX_PORKCHOP_WINDOW_DAYS = 3_650.0
MIN_PORKCHOP_DEPARTURE_STEP_DAYS = 0.5
MIN_PORKCHOP_TOF_STEP_DAYS = 5.0


class TrajectoryInputError(ValueError):
    """Pure request-validation failure carrying a stable machine code."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        context: Dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = str(code)
        self.context = dict(context or {})


class PorkchopScanCancelled(RuntimeError):
    """Raised when a request owner cancels an in-progress grid scan."""


def _bounded_vector3(vector: Any, label: str) -> tuple[float, float, float]:
    """Read at most four values so arbitrary iterables cannot amplify work."""

    try:
        iterator = iter(vector)
    except TypeError as exc:
        raise ValueError(f"{label} must contain three finite values") from exc

    values: list[float] = []
    try:
        for _ in range(4):
            try:
                raw_value = next(iterator)
            except StopIteration:
                break
            values.append(float(raw_value))
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f"{label} must contain three finite values") from exc
    if len(values) != 3 or not all(math.isfinite(value) for value in values):
        raise ValueError(f"{label} must contain three finite values")
    return values[0], values[1], values[2]


def _validated_body_pair(from_id: str, to_id: str) -> tuple[str, str]:
    if not isinstance(from_id, str) or not isinstance(to_id, str):
        raise TrajectoryInputError(
            "trajectory_invalid_body_id",
            "Trajectory body identifiers must be non-empty strings",
        )
    normalized_from = from_id.strip().lower()
    normalized_to = to_id.strip().lower()
    if not normalized_from or not normalized_to:
        raise TrajectoryInputError(
            "trajectory_invalid_body_id",
            "Trajectory body identifiers must be non-empty strings",
        )
    if len(normalized_from) > MAX_BODY_ID_LENGTH or len(normalized_to) > MAX_BODY_ID_LENGTH:
        raise TrajectoryInputError(
            "trajectory_invalid_body_id",
            f"Trajectory body identifiers are limited to {MAX_BODY_ID_LENGTH} characters",
            context={"maximumLength": MAX_BODY_ID_LENGTH},
        )
    if normalized_from == normalized_to:
        raise TrajectoryInputError(
            "trajectory_same_body",
            "Trajectory departure and destination bodies must differ",
            context={"bodyId": normalized_from},
        )
    return normalized_from, normalized_to


def _finite_time_value(name: str, value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            f"`{name}` must be a finite number",
            context={"field": name},
        )
    try:
        normalized = float(value)
    except (OverflowError, TypeError, ValueError) as exc:
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            f"`{name}` must be a finite number",
            context={"field": name},
        ) from exc
    if not math.isfinite(normalized):
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            f"`{name}` must be a finite number",
            context={"field": name},
        )
    return normalized


def validate_direct_lambert_request(
    *,
    from_id: str,
    to_id: str,
    departure_jd: Any,
    arrival_jd: Any,
) -> tuple[str, str, float, float]:
    """Normalize a direct-transfer request without touching a provider."""

    normalized_from, normalized_to = _validated_body_pair(from_id, to_id)
    departure = _finite_time_value("departure_jd", departure_jd)
    arrival = _finite_time_value("arrival_jd", arrival_jd)
    tof = arrival - departure
    if tof <= 0.0 or not math.isfinite(tof):
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "`arrival_jd` must be greater than `departure_jd` and produce a finite time of flight",
            context={"departureJd": departure, "arrivalJd": arrival},
        )
    return normalized_from, normalized_to, departure, arrival


def _validate_lambert_leg_request(
    *,
    from_id: str,
    to_id: str,
    departure_jd: Any,
    tof_days: Any,
) -> tuple[str, str, float, float]:
    normalized_from, normalized_to = _validated_body_pair(from_id, to_id)
    departure = _finite_time_value("departure_jd", departure_jd)
    tof = _finite_time_value("tof_days", tof_days)
    arrival = departure + tof
    if tof <= 0.0 or not math.isfinite(arrival) or arrival <= departure:
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "`tof_days` must be positive and produce a finite arrival epoch",
            context={"departureJd": departure, "tofDays": tof},
        )
    return normalized_from, normalized_to, departure, tof


def validate_porkchop_request(
    *,
    from_id: str,
    to_id: str,
    departure_start_jd: Any,
    departure_end_jd: Any,
    departure_step_days: Any,
    tof_min_days: Any,
    tof_max_days: Any,
    tof_step_days: Any,
) -> Dict[str, Any]:
    """Normalize and bound a porkchop grid before any session/provider work."""

    normalized_from, normalized_to = _validated_body_pair(from_id, to_id)
    values = {
        name: _finite_time_value(name, value)
        for name, value in {
            "departure_start_jd": departure_start_jd,
            "departure_end_jd": departure_end_jd,
            "departure_step_days": departure_step_days,
            "tof_min_days": tof_min_days,
            "tof_max_days": tof_max_days,
            "tof_step_days": tof_step_days,
        }.items()
    }
    departure_window = values["departure_end_jd"] - values["departure_start_jd"]
    if not math.isfinite(departure_window):
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "Porkchop departure range must have a finite span",
        )
    if departure_window < 0.0:
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "Porkchop departure range must be ordered",
        )
    if departure_window > MAX_PORKCHOP_WINDOW_DAYS:
        raise TrajectoryInputError(
            "trajectory_complexity_limit",
            f"Porkchop departure window may not exceed {MAX_PORKCHOP_WINDOW_DAYS} days",
        )
    if values["departure_step_days"] < MIN_PORKCHOP_DEPARTURE_STEP_DAYS:
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "Porkchop departure step must be at least "
            f"{MIN_PORKCHOP_DEPARTURE_STEP_DAYS} days",
        )

    tof_window = values["tof_max_days"] - values["tof_min_days"]
    if not math.isfinite(tof_window):
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "Porkchop time-of-flight range must have a finite span",
        )
    if values["tof_min_days"] <= 0.0 or tof_window < 0.0:
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "Porkchop time-of-flight range must be positive and ordered",
        )
    if tof_window > MAX_PORKCHOP_WINDOW_DAYS:
        raise TrajectoryInputError(
            "trajectory_complexity_limit",
            f"Porkchop time-of-flight window may not exceed {MAX_PORKCHOP_WINDOW_DAYS} days",
        )
    if values["tof_step_days"] < MIN_PORKCHOP_TOF_STEP_DAYS:
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            f"Porkchop time-of-flight step must be at least {MIN_PORKCHOP_TOF_STEP_DAYS} days",
        )

    departure_count = int(
        math.floor(departure_window / values["departure_step_days"] + 1.0e-12)
    ) + 1
    tof_count = int(math.floor(tof_window / values["tof_step_days"] + 1.0e-12)) + 1
    if (
        departure_count > 1
        and values["departure_start_jd"] + values["departure_step_days"]
        <= values["departure_start_jd"]
    ):
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "Porkchop departure step cannot advance the departure epoch",
        )
    if (
        tof_count > 1
        and values["tof_min_days"] + values["tof_step_days"]
        <= values["tof_min_days"]
    ):
        raise TrajectoryInputError(
            "trajectory_invalid_time_range",
            "Porkchop time-of-flight step cannot advance the grid",
        )
    for departure in (values["departure_start_jd"], values["departure_end_jd"]):
        for tof in (values["tof_min_days"], values["tof_max_days"]):
            arrival = departure + tof
            if not math.isfinite(arrival) or arrival <= departure:
                raise TrajectoryInputError(
                    "trajectory_invalid_time_range",
                    "Porkchop epochs and times of flight must produce finite, later arrivals",
                )
    estimated_grid_points = departure_count * tof_count
    if estimated_grid_points > MAX_PORKCHOP_GRID_POINTS:
        raise TrajectoryInputError(
            "trajectory_complexity_limit",
            f"Porkchop grid may contain at most {MAX_PORKCHOP_GRID_POINTS} points",
            context={"estimatedGridPointCount": estimated_grid_points},
        )

    # Compute the exact cache-key domain before any provider/session work.
    # This is itself bounded by MAX_PORKCHOP_GRID_POINTS and accounts for
    # arrival-epoch collisions rather than relying on a loose 2*N estimate.
    departure_values = [
        values["departure_start_jd"]
        + departure_index * values["departure_step_days"]
        for departure_index in range(departure_count)
    ]
    tof_values = [
        values["tof_min_days"] + tof_index * values["tof_step_days"]
        for tof_index in range(tof_count)
    ]
    prospective_states = {
        ("from", round(departure, 9)) for departure in departure_values
    }
    prospective_states.update(
        ("to", round(departure + tof, 9))
        for departure in departure_values
        for tof in tof_values
    )
    estimated_unique_states = len(prospective_states)
    if estimated_unique_states > HARD_MAX_UNIQUE_EPHEMERIS_STATES:
        raise TrajectoryInputError(
            "trajectory_complexity_limit",
            "Porkchop grid exceeds the unique-state computation budget",
            context={
                "estimatedGridPointCount": estimated_grid_points,
                "estimatedUniqueEphemerisStates": estimated_unique_states,
                "maximumUniqueEphemerisStates": HARD_MAX_UNIQUE_EPHEMERIS_STATES,
            },
        )

    return {
        "from_id": normalized_from,
        "to_id": normalized_to,
        **values,
        "departure_count": departure_count,
        "tof_count": tof_count,
        "estimated_grid_points": estimated_grid_points,
        "estimated_unique_states": estimated_unique_states,
    }


def _underlying_ephemeris_session(ephemeris: Any) -> Any:
    """Reject duck-typed sessions that can bypass shared provider budgets."""

    if type(ephemeris) is not EphemerisService:
        raise ValueError("Ephemeris session must be an exact EphemerisService")
    return ephemeris


def _session_planning_context(ephemeris: Any) -> PlanningContext | None:
    session = _underlying_ephemeris_session(ephemeris)
    context = getattr(session, "planning_context", getattr(session, "_context", None))
    return context if type(context) is PlanningContext else None


def _require_session_context(
    ephemeris: Any,
    planning_context: PlanningContext | None = None,
) -> PlanningContext:
    owned_context = _session_planning_context(ephemeris)
    if owned_context is None:
        raise ValueError("Ephemeris session must be owned by a PlanningContext")
    if planning_context is not None and owned_context is not planning_context:
        raise ValueError("Ephemeris session does not belong to the supplied planning context")
    return owned_context


def _resolved_provider(ephemeris: Any) -> str:
    session = _underlying_ephemeris_session(ephemeris)
    return str(getattr(session, "resolved_provider", "")).strip().lower()


def _protocol_error(
    ephemeris: Any,
    message: str,
    *,
    body_id: str | None = None,
    jd: float | None = None,
) -> EphemerisProtocolError:
    return EphemerisProtocolError(
        message,
        provider=_resolved_provider(ephemeris) or "unknown",
        body_id=body_id,
        jd=jd,
    )


def _validate_lambert_state_pair(
    ephemeris: Any,
    from_state: Any,
    to_state: Any,
    *,
    from_id: str,
    to_id: str,
    departure_jd: float,
    arrival_jd: float,
) -> tuple[EphemerisSample, EphemerisSample]:
    """Fail closed before solving if two provider states are not compatible."""

    if not isinstance(from_state, EphemerisSample) or not isinstance(to_state, EphemerisSample):
        raise _protocol_error(
            ephemeris,
            "Ephemeris provider returned a non-canonical state sample",
        )

    requested = (
        (from_state, str(from_id).strip().lower(), float(departure_jd), "departure"),
        (to_state, str(to_id).strip().lower(), float(arrival_jd), "arrival"),
    )
    for sample, expected_body_id, expected_jd, label in requested:
        if str(sample.body_id).strip().lower() != expected_body_id:
            raise _protocol_error(
                ephemeris,
                f"Ephemeris {label} state identified the wrong body",
                body_id=expected_body_id,
                jd=expected_jd,
            )
        if not math.isclose(float(sample.jd), expected_jd, rel_tol=0.0, abs_tol=5.0e-10):
            raise _protocol_error(
                ephemeris,
                f"Ephemeris {label} state identified the wrong epoch",
                body_id=expected_body_id,
                jd=expected_jd,
            )

    session = _underlying_ephemeris_session(ephemeris)
    session_contract = getattr(session, "state_contract", None)
    if (
        session_contract != TRAJECTORY_STATE_CONTRACT
        or from_state.contract != session_contract
        or to_state.contract != session_contract
        or from_state.contract != to_state.contract
    ):
        raise _protocol_error(
            ephemeris,
            "Ephemeris states do not share the canonical trajectory frame/unit contract",
        )

    provider = _resolved_provider(ephemeris)
    if not provider or from_state.source != provider or to_state.source != provider:
        raise _protocol_error(
            ephemeris,
            "Ephemeris states were mixed across providers",
        )
    from_revision = str(from_state.provider_revision or "").strip()
    to_revision = str(to_state.provider_revision or "").strip()
    if not from_revision or not to_revision or from_revision != to_revision:
        raise _protocol_error(
            ephemeris,
            "Ephemeris states used missing or incompatible provider revisions",
        )

    expected_target_definition = (
        "catalog_orbit_reference" if provider == "kepler" else "body_center"
    )
    for sample, expected_body_id, expected_jd, label in requested:
        if sample.target_definition != expected_target_definition:
            raise _protocol_error(
                ephemeris,
                f"Ephemeris {label} state used an incompatible target definition",
                body_id=expected_body_id,
                jd=expected_jd,
            )

    return from_state, to_state


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
    cross = vector_cross(r1, r2)
    sin_theta = min(1.0, vector_length(cross) / (r1_mag * r2_mag))
    # Unlike acos(cos(theta)), atan2 retains the cross product's absolute angle precision near pi.
    theta = math.atan2(sin_theta, cos_theta)

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

        # Near the hyperbolic boundary and the 4 pi^2 N^2 singularities TOF is steep in z, so a
        # fixed 1e-8 bracket width stopped short of strict tolerances; stop at double precision.
        if abs(z_right - z_left) <= 4.0 * math.ulp(max(1.0, abs(z_left), abs(z_right))):
            break

    return (best_z, best_state) if best_abs <= tol_days else None


def _extend_hyperbolic_bracket(
    z_start: float,
    start_state: Tuple[float, float, float, float],
    tof_target: float,
    r1_mag: float,
    r2_mag: float,
    A: float,
    mu: float,
) -> Optional[Tuple[float, Tuple[float, float, float, float], float, Tuple[float, float, float, float]]]:
    """Bracket a root below z_start, where TOF(z_start) is still longer than the target.

    TOF falls monotonically as z decreases. On the short way (A > 0) y reaches 0 at a finite z
    where TOF -> 0, so every positive TOF has a root; bisect onto that boundary when a step
    crosses it. On the long way (A < 0) TOF has a positive lower limit, and None is the answer.
    """
    z_high, high_state = z_start, start_state
    z = min(z_start, -1.0)
    while z > HYPERBOLIC_Z_LIMIT:
        z = max(HYPERBOLIC_Z_LIMIT, 2.0 * z)
        state = _tof_from_z(z, r1_mag, r2_mag, A, mu)
        if state is None:
            invalid = z
            for _ in range(200):
                mid = 0.5 * (invalid + z_high)
                mid_state = _tof_from_z(mid, r1_mag, r2_mag, A, mu)
                if mid_state is None:
                    invalid = mid
                elif mid_state[0] < tof_target:
                    return mid, mid_state, z_high, high_state
                else:
                    z_high, high_state = mid, mid_state
            return None
        if state[0] < tof_target:
            return z, state, z_high, high_state
        z_high, high_state = z, state
    return None


def _multi_revolution_bracket(
    revolutions: int,
    branch: str,
    tof_target: float,
    r1_mag: float,
    r2_mag: float,
    A: float,
    mu: float,
) -> Optional[Tuple[float, Tuple[float, float, float, float], float, Tuple[float, float, float, float]]]:
    """Bracket the N-revolution root on z in (4 pi^2 N^2, 4 pi^2 (N+1)^2).

    TOF -> infinity at both ends of that interval and has a single minimum inside it, so a
    target above the minimum has one root on each side: `branch` "low" (smaller z, Izzo 2015's
    low path) or "high".
    """
    lo = FOUR_PI_SQUARED * revolutions * revolutions
    hi = FOUR_PI_SQUARED * (revolutions + 1) ** 2
    margin = 1e-9 * (hi - lo)
    z_left_end, z_right_end = lo + margin, hi - margin

    def tof(z: float) -> float:
        state = _tof_from_z(z, r1_mag, r2_mag, A, mu)
        return state[0] if state is not None else math.inf

    ratio = (math.sqrt(5.0) - 1.0) / 2.0
    a, b = z_left_end, z_right_end
    c, d = b - ratio * (b - a), a + ratio * (b - a)
    tof_c, tof_d = tof(c), tof(d)
    for _ in range(200):
        if tof_c < tof_d:
            b, d, tof_d = d, c, tof_c
            c = b - ratio * (b - a)
            tof_c = tof(c)
        else:
            a, c, tof_c = c, d, tof_d
            d = a + ratio * (b - a)
            tof_d = tof(d)
        if b - a <= 1e-12 * (hi - lo):
            break
    z_min = 0.5 * (a + b)
    min_state = _tof_from_z(z_min, r1_mag, r2_mag, A, mu)
    if min_state is None or min_state[0] > tof_target:
        return None
    # Walk from the minimum toward the chosen end until TOF passes the target. Evaluating at the
    # end itself overflows: TOF there is astronomically large, not just large.
    end = z_left_end if branch == "low" else z_right_end
    z_out = z_min
    for _ in range(200):
        z_out = 0.5 * (z_out + end)
        out_state = _tof_from_z(z_out, r1_mag, r2_mag, A, mu)
        if out_state is not None and out_state[0] > tof_target:
            break
    else:
        return None
    if branch == "low":
        return z_out, out_state, z_min, min_state
    return z_min, min_state, z_out, out_state


def solve_lambert_universal(
    r1: Sequence[float],
    r2: Sequence[float],
    tof_days: float,
    *,
    mu: float = MU_SUN_AU3_DAY2,
    prograde: bool = True,
    max_iter: int = 80,
    tol_days: float = 1e-4,
    revolutions: int = 0,
    branch: str = "low",
    min_periapsis_au: float = SOLAR_RADIUS_AU,
) -> Optional[Dict[str, Any]]:
    """Solve Lambert's problem with universal variables in AU/day units.

    `revolutions` N >= 1 selects the N-revolution solutions, z in (4 pi^2 N^2, 4 pi^2 (N+1)^2);
    each exists only above that branch's minimum time of flight and comes as a pair, chosen with
    `branch`: "low" (smaller z; Izzo 2015's low path) or "high". N = 0 ignores `branch`.
    An arc that passes periapsis inside `min_periapsis_au` (default: the Sun's radius, matching
    the default `mu`) is no solution.
    Cross-checked against lamberthub's izzo2015 for M = 0..3, both branches, prograde and
    retrograde: 148 common solutions agree to 1.2e-7 m/s and neither finds one the other misses.
    """

    try:
        gravitational_parameter = float(mu)
        tolerance_days = float(tol_days)
    except (TypeError, ValueError) as exc:
        raise ValueError("Lambert solver parameters must be finite numbers") from exc
    if not math.isfinite(gravitational_parameter) or gravitational_parameter <= 0.0:
        raise ValueError("Lambert gravitational parameter must be finite and positive")
    if (
        not math.isfinite(tolerance_days)
        or tolerance_days <= 0.0
        or tolerance_days > LAMBERT_ROOT_TOLERANCE_DAYS
    ):
        raise ValueError(
            f"Lambert root tolerance must be in (0, {LAMBERT_ROOT_TOLERANCE_DAYS}] days"
        )
    if (
        isinstance(max_iter, bool)
        or not isinstance(max_iter, int)
        or max_iter < 0
        or max_iter > MAX_LAMBERT_ROOT_ITERATIONS
    ):
        raise ValueError(
            f"Lambert max_iter must be an integer between 0 and {MAX_LAMBERT_ROOT_ITERATIONS}"
        )

    if (
        isinstance(revolutions, bool)
        or not isinstance(revolutions, int)
        or not 0 <= revolutions <= MAX_LAMBERT_REVOLUTIONS
    ):
        raise ValueError(f"Lambert revolutions must be an integer between 0 and {MAX_LAMBERT_REVOLUTIONS}")
    if branch not in ("low", "high"):
        raise ValueError("Lambert branch must be 'low' or 'high'")
    try:
        minimum_periapsis = float(min_periapsis_au)
    except (TypeError, ValueError) as exc:
        raise ValueError("Lambert min_periapsis_au must be a finite number") from exc
    if not math.isfinite(minimum_periapsis) or minimum_periapsis < 0.0:
        raise ValueError("Lambert min_periapsis_au must be finite and non-negative")

    normalized_vectors = [
        _bounded_vector3(vector, f"Lambert {label}")
        for label, vector in (("r1", r1), ("r2", r2))
    ]
    r1_values, r2_values = normalized_vectors

    tof_target = float(tof_days)
    if not math.isfinite(tof_target) or tof_target <= 0.0:
        return None

    r1_mag = vector_length(r1_values)
    r2_mag = vector_length(r2_values)
    if r1_mag < 1e-12 or r2_mag < 1e-12:
        return None

    theta = _transfer_angle(r1_values, r2_values, prograde=prograde)
    cross_sine = vector_length(vector_cross(r1_values, r2_values)) / (r1_mag * r2_mag)
    signed_sine = -cross_sine if theta > math.pi else cross_sine
    # Recover A from the vectors themselves. Calling sin(theta) would discard the precision that
    # atan2 preserved near pi, while the unit-chord identity remains stable near both 0 and pi.
    denominator = max(
        1e-15,
        0.5
        * sum(
            (r1_values[idx] / r1_mag - r2_values[idx] / r2_mag) ** 2
            for idx in range(3)
        ),
    )
    A = signed_sine * math.sqrt((r1_mag * r2_mag) / denominator)
    if abs(A) < 1e-12:
        return None

    if revolutions > 0:
        multi_rev = _multi_revolution_bracket(
            revolutions, branch, tof_target, r1_mag, r2_mag, A, gravitational_parameter
        )
        if multi_rev is None:
            return None
        root_low, root_low_state, root_high, root_high_state = multi_rev
        return _finish_lambert_solution(
            root_low, root_high, root_low_state, root_high_state,
            tof_target=tof_target, r1_values=r1_values, r2_values=r2_values, r1_mag=r1_mag,
            r2_mag=r2_mag, A=A, mu=gravitational_parameter, theta=theta, max_iter=max_iter,
            tol_days=tolerance_days, revolutions=revolutions, branch=branch, prograde=prograde,
            min_periapsis_au=minimum_periapsis,
        )

    z_min = -40.0
    # The zero-revolution branch ends at z = 4 pi^2, where TOF -> infinity. Sampling past it
    # (the old grid ran to 40) can bracket across the singularity into the one-revolution branch.
    z_max = FOUR_PI_SQUARED - 1e-3
    step = 0.25

    sampled: List[Tuple[float, float, Tuple[float, float, float, float]]] = []
    z = z_min
    while z <= z_max + 1e-12:
        tof_state = _tof_from_z(z, r1_mag, r2_mag, A, gravitational_parameter)
        if tof_state is not None:
            sampled.append((z, tof_state[0] - tof_target, tof_state))
        z += step
    upper_state = _tof_from_z(z_max, r1_mag, r2_mag, A, gravitational_parameter)
    if upper_state is not None and (not sampled or sampled[-1][0] < z_max):
        sampled.append((z_max, upper_state[0] - tof_target, upper_state))

    if not sampled:
        return None

    root_low: Optional[float] = None
    root_high: Optional[float] = None
    root_low_state: Optional[Tuple[float, float, float, float]] = None
    root_high_state: Optional[Tuple[float, float, float, float]] = None
    for idx in range(len(sampled) - 1):
        z0, f0, state0 = sampled[idx]
        z1, f1, state1 = sampled[idx + 1]
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

    # The pairwise loop does not otherwise inspect the last sampled point as a
    # possible exact, degenerate bracket.
    if root_low is None:
        final_z, final_residual, final_state = sampled[-1]
        if final_residual == 0.0:
            root_low = final_z
            root_high = final_z
            root_low_state = final_state
            root_high_state = final_state

    # Faster than anything on the sampled grid: a hyperbolic transfer below z = -40.
    if root_low is None and sampled[0][1] > 0.0:
        extended = _extend_hyperbolic_bracket(
            sampled[0][0], sampled[0][2], tof_target, r1_mag, r2_mag, A, gravitational_parameter
        )
        if extended is not None:
            root_low, root_low_state, root_high, root_high_state = extended

    if root_low is None or root_high is None:
        return None

    return _finish_lambert_solution(
        root_low, root_high, root_low_state, root_high_state,
        tof_target=tof_target, r1_values=r1_values, r2_values=r2_values, r1_mag=r1_mag,
        r2_mag=r2_mag, A=A, mu=gravitational_parameter, theta=theta, max_iter=max_iter,
        tol_days=tolerance_days, revolutions=0, branch=None, prograde=prograde,
        min_periapsis_au=minimum_periapsis,
    )


def _periapsis_on_arc_au(
    r1: Sequence[float], v1: Sequence[float], theta: float, revolutions: int, mu: float
) -> Optional[float]:
    """Periapsis distance when the arc from r1 through `theta` (+ full revolutions) passes it."""
    r_mag = vector_length(r1)
    radial = vector_dot(r1, v1)
    speed_sq = vector_dot(v1, v1)
    e_vec = [((speed_sq - mu / r_mag) * r1[i] - radial * v1[i]) / mu for i in range(3)]
    e = vector_length(e_vec)
    h = vector_length(vector_cross(r1, v1))
    periapsis = (h * h / mu) / (1.0 + e)
    if revolutions > 0 or e < 1e-12:
        return periapsis
    nu1 = math.acos(max(-1.0, min(1.0, vector_dot(e_vec, r1) / (e * r_mag))))
    if radial < 0.0:
        nu1 = -nu1  # inbound: true anomaly in (-pi, 0)
    passes = nu1 <= 0.0 <= nu1 + theta or nu1 + theta >= 2.0 * math.pi
    return periapsis if passes else None


def _finish_lambert_solution(
    root_low: float,
    root_high: float,
    root_low_state: Optional[Tuple[float, float, float, float]],
    root_high_state: Optional[Tuple[float, float, float, float]],
    *,
    tof_target: float,
    r1_values: Sequence[float],
    r2_values: Sequence[float],
    r1_mag: float,
    r2_mag: float,
    A: float,
    mu: float,
    theta: float,
    max_iter: int,
    tol_days: float,
    revolutions: int,
    branch: Optional[str],
    prograde: bool,
    min_periapsis_au: float,
) -> Optional[Dict[str, Any]]:
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

    v1 = [(r2_values[idx] - f * r1_values[idx]) / g for idx in range(3)]
    v2 = [(g_dot * r2_values[idx] - r1_values[idx]) / g for idx in range(3)]

    periapsis = _periapsis_on_arc_au(r1_values, v1, theta, revolutions, mu)
    if periapsis is not None and periapsis < min_periapsis_au:
        return None

    solution = {
        "v1": v1,
        "v2": v2,
        "transferAngleDeg": math.degrees(theta),
        "computedTofDays": tof_value,
        "z": z_star,
        "rootResidualDays": abs(tof_value - tof_target),
        "rootBracketed": True,
        "revolutions": revolutions,
        "pathSense": "prograde" if prograde else "retrograde",
    }
    if branch is not None:
        solution["branch"] = branch
    return solution


def compute_lambert_leg_from_state_vectors(
    start_position_au: Sequence[float],
    start_velocity_au_day: Sequence[float],
    end_position_au: Sequence[float],
    end_velocity_au_day: Sequence[float],
    tof_days: float,
    *,
    prograde: bool = True,
) -> Optional[Dict[str, Any]]:
    normalized = [
        _bounded_vector3(vector, label)
        for label, vector in (
        ("start_position_au", start_position_au),
        ("start_velocity_au_day", start_velocity_au_day),
        ("end_position_au", end_position_au),
        ("end_velocity_au_day", end_velocity_au_day),
        )
    ]
    start_position, start_velocity, end_position, end_velocity = normalized

    lambert = solve_lambert_universal(
        start_position,
        end_position,
        tof_days,
        prograde=prograde,
    )
    if lambert is None or not bool(lambert.get("rootBracketed")):
        return None
    residual_days = float(lambert.get("rootResidualDays", math.inf))
    if not math.isfinite(residual_days) or residual_days > LAMBERT_ROOT_TOLERANCE_DAYS:
        return None

    v_depart = lambert["v1"]
    v_arrive = lambert["v2"]
    delta_v_depart = au_per_day_to_km_per_sec(vector_length(vector_sub(v_depart, start_velocity)))
    delta_v_arrive = au_per_day_to_km_per_sec(vector_length(vector_sub(end_velocity, v_arrive)))
    chord = vector_length(vector_sub(end_position, start_position))

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
        "startPosition": list(start_position),
        "endPosition": list(end_position),
        "departureVelocityApprox": list(v_depart),
        "arrivalVelocityApprox": list(v_arrive),
        "fromPlanetVelocity": list(start_velocity),
        "toPlanetVelocity": list(end_velocity),
        "solver": "lambert_universal",
    }


def _compute_lambert_leg_reserved(
    ephemeris: EphemerisService,
    from_id: str,
    to_id: str,
    departure_jd: float,
    tof_days: float,
    *,
    prograde: bool = True,
) -> Optional[Dict[str, Any]]:
    from_id, to_id, departure_jd, tof_days = _validate_lambert_leg_request(
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        tof_days=tof_days,
    )
    _require_session_context(ephemeris)
    # Validate the complete pair before sampling either endpoint. Otherwise a
    # strict remote/native provider can perform work for the departure and only
    # then discover that the destination is unsupported.
    ephemeris.preflight([from_id, to_id])
    arrival_jd = departure_jd + tof_days
    from_state = ephemeris.sample_state(from_id, departure_jd)
    to_state = ephemeris.sample_state(to_id, arrival_jd)
    from_state, to_state = _validate_lambert_state_pair(
        ephemeris,
        from_state,
        to_state,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        arrival_jd=arrival_jd,
    )

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
            "stateContract": from_state.contract.to_dict(),
            "stateTargets": {
                "from": {
                    "bodyId": from_state.body_id,
                    "targetDefinition": from_state.target_definition,
                    "providerRevision": from_state.provider_revision,
                },
                "to": {
                    "bodyId": to_state.body_id,
                    "targetDefinition": to_state.target_definition,
                    "providerRevision": to_state.provider_revision,
                },
            },
        }
    )
    return leg


def compute_lambert_leg(
    ephemeris: EphemerisService,
    from_id: str,
    to_id: str,
    departure_jd: float,
    tof_days: float,
    *,
    prograde: bool = True,
) -> Optional[Dict[str, Any]]:
    """Compute one public Lambert leg and charge its request-owned budget.

    Search implementations that already reserve a logical leg request and
    evaluation use ``_compute_lambert_leg_reserved``. Keeping the reservation
    at this public boundary prevents direct Python callers from bypassing the
    same hard ceilings enforced by the HTTP and search entry points.
    """

    from_id, to_id, departure_jd, tof_days = _validate_lambert_leg_request(
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        tof_days=tof_days,
    )
    context = _require_session_context(ephemeris)
    ephemeris.preflight([from_id, to_id])
    context.reserve(leg_requests=1, leg_evaluations=1)
    return _compute_lambert_leg_reserved(
        ephemeris,
        from_id,
        to_id,
        departure_jd,
        tof_days,
        prograde=prograde,
    )


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
    planning_context: PlanningContext | None = None,
) -> Dict[str, Any]:
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
    from_id = validated["from_id"]
    to_id = validated["to_id"]

    session = _underlying_ephemeris_session(ephemeris)
    requested_provider = str(getattr(session, "provider", "")).strip().lower()
    resolved_provider = _resolved_provider(session)
    if "horizons" in (requested_provider, resolved_provider):
        raise ValueError(
            "Horizons is not supported for combinatorial trajectory search; "
            "use `kepler`/`auto` for porkchop scans or direct Lambert for Horizons"
        )

    context = _require_session_context(session, planning_context)
    if cancel_event is not None and context.cancel_event is not cancel_event:
        raise ValueError("Porkchop cancellation event must belong to the planning context")
    if validated["estimated_unique_states"] > context.limits.unique_ephemeris_states:
        raise TrajectoryInputError(
            "trajectory_complexity_limit",
            "Porkchop grid exceeds this planning context's unique-state budget",
            context={
                "estimatedUniqueEphemerisStates": validated["estimated_unique_states"],
                "maximumUniqueEphemerisStates": context.limits.unique_ephemeris_states,
            },
        )
    session.preflight([from_id, to_id])

    dep_step = validated["departure_step_days"]
    tof_step = validated["tof_step_days"]
    estimated_grid_points = validated["estimated_grid_points"]

    points: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    departure_start = validated["departure_start_jd"]
    tof_min = validated["tof_min_days"]
    departure_count = validated["departure_count"]
    tof_count = validated["tof_count"]
    truncated = False
    budget_exhausted = False
    termination_reason = "configured_grid_completed"
    try:
        for departure_index in range(departure_count):
            context.checkpoint()
            dep = departure_start + departure_index * dep_step
            for tof_index in range(tof_count):
                context.checkpoint()
                tof = tof_min + tof_index * tof_step
                context.reserve(leg_requests=1, leg_evaluations=1)
                leg = _compute_lambert_leg_reserved(
                    session,
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
                            "computedTofDays": float(leg["computedTofDays"]),
                            "rootResidualDays": float(leg["rootResidualDays"]),
                            "rootBracketed": bool(leg["rootBracketed"]),
                        }
                    )
    except PlanningError as exc:
        if not points:
            raise
        truncated = True
        budget_exhausted = isinstance(exc, PlanningBudgetExceeded)
        termination_reason = context.termination_reason or exc.code

    points.sort(key=lambda item: (float(item["totalDeltaVKmS"]), float(item["tofDays"])))
    pareto = _pareto_by_tof(points)

    return {
        "fromId": from_id,
        "toId": to_id,
        "grid": {
            "departureStartJd": validated["departure_start_jd"],
            "departureEndJd": validated["departure_end_jd"],
            "departureStepDays": dep_step,
            "tofMinDays": tof_min,
            "tofMaxDays": validated["tof_max_days"],
            "tofStepDays": tof_step,
            "prograde": bool(prograde),
        },
        "count": len(points),
        "successCount": len(points),
        "failureCount": len(failures),
        "evaluatedCount": len(points) + len(failures),
        "estimatedGridPointCount": estimated_grid_points,
        "estimatedUniqueEphemerisStates": validated["estimated_unique_states"],
        "configuredGridCompleted": not truncated,
        "truncated": truncated,
        "budgetExhausted": budget_exhausted,
        "terminationReason": termination_reason,
        "best": points[0] if points else None,
        "pareto": pareto[:40],
        "points": points[:500],
        "failures": failures[:100],
        "retention": {
            "pointsReturned": min(len(points), 500),
            "pointsTotal": len(points),
            "pointsTruncated": len(points) > 500,
            "paretoReturned": min(len(pareto), 40),
            "paretoTotal": len(pareto),
            "paretoTruncated": len(pareto) > 40,
            "failuresReturned": min(len(failures), 100),
            "failuresTotal": len(failures),
            "failuresTruncated": len(failures) > 100,
        },
    }


def estimate_turn_angle_deg(incoming_v_inf: Sequence[float], outgoing_v_inf: Sequence[float]) -> float:
    return math.degrees(safe_angle_between(incoming_v_inf, outgoing_v_inf))


__all__ = [
    "LAMBERT_ROOT_TOLERANCE_DAYS",
    "MAX_LAMBERT_ROOT_ITERATIONS",
    "MAX_PORKCHOP_GRID_POINTS",
    "TrajectoryInputError",
    "compute_lambert_leg",
    "estimate_turn_angle_deg",
    "scan_porkchop_window",
    "solve_lambert_universal",
    "validate_direct_lambert_request",
    "validate_porkchop_request",
]
