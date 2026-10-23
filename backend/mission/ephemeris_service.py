"""Strict, request-scoped ephemeris sampling for trajectory calculations.

The service deliberately resolves one provider for its whole lifetime. In
particular, ``auto`` is a deterministic, network-free alias for ``kepler``;
provider failures never cause a state-by-state fallback that could mix frames
inside one Lambert solve.
"""

from __future__ import annotations

import csv
import io
import json
import math
from numbers import Real
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from contextlib import closing
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Mapping, Optional, Sequence, Tuple

from sim.solar_http_transport import DeadlineHttpResponse, SolarHttpError

from .orbital import AU_M, DAY_SECONDS, J2000_JD, sample_body_state_from_elements


HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_MAX_TIMEOUT_S = 2.5
HORIZONS_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
HORIZONS_USER_AGENT = "solar-system-realistic-sim/trajectory-ephemeris"
HORIZONS_CONCURRENCY_LIMIT = 1
HORIZONS_MAX_REDIRECTS = 3
HORIZONS_WAIT_POLL_S = 0.05
HORIZONS_SUCCESS_CACHE_MAXSIZE = 4_096
HORIZONS_PROVIDER_OUTAGE_COOLDOWN_S = 30.0
HORIZONS_PROVIDER_OUTAGE_MAX_COOLDOWN_S = 60.0
EPHEMERIS_PREFLIGHT_MAX_TARGETS = 256
SPICE_WAIT_POLL_S = 0.05
SPICE_MAX_WAIT_S = 5.0
SPICE_CALL_WAIT_POLL_S = 0.05
EPHEMERIS_FRAME_ID = "heliocentric_ecliptic_j2000_geometric"


@dataclass(frozen=True, slots=True)
class EphemerisStateContract:
    frame_id: str = EPHEMERIS_FRAME_ID
    origin: str = "sun_center"
    orientation: str = "ecliptic_j2000"
    jd_time_scale: str = "TDB"
    position_unit: str = "AU"
    velocity_unit: str = "AU/day"
    corrections: str = "NONE"

    def to_dict(self) -> Dict[str, str]:
        return asdict(self)


TRAJECTORY_STATE_CONTRACT = EphemerisStateContract()


class EphemerisError(RuntimeError):
    """Base class for safe, typed ephemeris failures."""

    default_code = "ephemeris_error"
    default_retryable = False

    def __init__(
        self,
        message: str,
        *,
        provider: str,
        body_id: str | None = None,
        jd: float | None = None,
        code: str | None = None,
        retryable: bool | None = None,
        retry_after_s: float | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code or self.default_code
        self.provider = provider
        self.body_id = body_id
        self.jd = jd
        self.retryable = self.default_retryable if retryable is None else bool(retryable)
        self.retry_after_s = retry_after_s

    def clone(self) -> "EphemerisError":
        return type(self)(
            str(self),
            provider=self.provider,
            body_id=self.body_id,
            jd=self.jd,
            code=self.code,
            retryable=self.retryable,
            retry_after_s=self.retry_after_s,
        )

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "code": self.code,
            "message": str(self),
            "provider": self.provider,
            "retryable": self.retryable,
        }
        if self.body_id is not None:
            payload["bodyId"] = self.body_id
        if self.jd is not None:
            payload["jdTdb"] = self.jd
        if self.retry_after_s is not None:
            payload["retryAfterSeconds"] = self.retry_after_s
        return payload


class EphemerisProviderUnavailable(EphemerisError):
    default_code = "ephemeris_provider_unavailable"
    default_retryable = True


class EphemerisUpstreamTimeout(EphemerisError):
    default_code = "ephemeris_upstream_timeout"
    default_retryable = True


class EphemerisUpstreamRateLimited(EphemerisError):
    default_code = "ephemeris_upstream_rate_limited"
    default_retryable = True


class EphemerisProtocolError(EphemerisError):
    default_code = "ephemeris_protocol_error"
    default_retryable = False


def _horizons_urlopen(request: urllib.request.Request, *, timeout: float):
    # The shared transport disables redirects and owns kill/reap of all DNS,
    # TLS, header and body I/O. Its response status is data, not an HTTPError.
    return DeadlineHttpResponse(request, timeout)


def _validate_horizons_url(url: str) -> None:
    try:
        parsed = urllib.parse.urlsplit(url)
        valid = (parsed.scheme == "https" and parsed.hostname == "ssd.jpl.nasa.gov"
                 and parsed.port in (None, 443) and parsed.username is None
                 and parsed.password is None and not parsed.fragment)
    except ValueError:
        valid = False
    if not valid:
        raise EphemerisProtocolError("Horizons URL violates the HTTPS host/port allow-list", provider="horizons")


class EphemerisTargetUnsupported(EphemerisError):
    default_code = "ephemeris_target_unsupported"
    default_retryable = False


class EphemerisBudgetExceeded(EphemerisError):
    default_code = "ephemeris_budget_exceeded"
    default_retryable = True


class EphemerisCancelled(EphemerisError):
    default_code = "ephemeris_cancelled"
    default_retryable = True


@dataclass(frozen=True, slots=True)
class EphemerisSample:
    body_id: str
    jd: float
    position_au: Tuple[float, float, float]
    velocity_au_day: Tuple[float, float, float]
    source: str
    contract: EphemerisStateContract = field(default=TRAJECTORY_STATE_CONTRACT)
    target_definition: str = "body_center"
    provider_revision: str | None = None
    model_metadata: Dict[str, Any] | None = None

    def __post_init__(self) -> None:
        try:
            jd = float(self.jd)
            position = tuple(float(value) for value in self.position_au)
            velocity = tuple(float(value) for value in self.velocity_au_day)
        except (TypeError, ValueError) as exc:
            raise ValueError("ephemeris sample contains a non-numeric state") from exc
        if not math.isfinite(jd):
            raise ValueError("ephemeris sample JD must be finite")
        if len(position) != 3 or len(velocity) != 3:
            raise ValueError("ephemeris sample position and velocity must contain three components")
        if not all(math.isfinite(value) for value in (*position, *velocity)):
            raise ValueError("ephemeris sample state components must be finite")
        object.__setattr__(self, "jd", jd)
        object.__setattr__(self, "position_au", position)
        object.__setattr__(self, "velocity_au_day", velocity)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


_ID_TO_SPICE: Mapping[str, str] = {
    "sun": "Sun",
    "mercury": "Mercury",
    "venus": "Venus",
    "earth": "Earth",
    "mars": "Mars",
    "jupiter": "Jupiter",
    "saturn": "Saturn",
    "uranus": "Uranus",
    "neptune": "Neptune",
    "pluto": "Pluto",
}

# Explicit physical-body-center commands. Display-name lookup is intentionally
# forbidden: ``Europa (52)`` must never resolve as the moon Europa because its
# parenthetical number was stripped.
_ID_TO_HORIZONS: Mapping[str, str] = {
    "sun": "10",
    "mercury": "199",
    "venus": "299",
    "earth": "399",
    "mars": "499",
    "jupiter": "599",
    "saturn": "699",
    "uranus": "799",
    "neptune": "899",
    "pluto": "999",
}

_SPICE_READY = False
_SPICE_ATTEMPTED = False
_SPICE_LOADING = False
_SPICE_IMPORT_ERROR = ""
_SPICE_CONDITION = threading.Condition()
_spice = None

# The supervisor retains this permit until its owned HTTP child is killed and
# reaped. Planning cancellation can stop waiting sooner, but the child still
# has the original absolute deadline, so a stalled read cannot starve capacity
# permanently or multiply into abandoned transports across reconnects.
_HORIZONS_CONCURRENCY_GUARD = threading.BoundedSemaphore(HORIZONS_CONCURRENCY_LIMIT)
_SPICE_CALL_CONCURRENCY_GUARD = threading.BoundedSemaphore(1)


@dataclass(frozen=True, slots=True)
class _SharedEphemerisRequestKey:
    provider: str
    command: str
    body_id: str
    epoch_jd: float
    frame_id: str
    center: str
    time_scale: str
    corrections: str
    position_unit: str
    velocity_unit: str
    target_definition: str


@dataclass(frozen=True, slots=True)
class _SharedEphemerisCacheKey:
    provider: str
    provider_revision: str
    command: str
    body_id: str
    epoch_jd: float
    frame_id: str
    center: str
    time_scale: str
    corrections: str
    position_unit: str
    velocity_unit: str
    target_definition: str


@dataclass(slots=True)
class _SharedEphemerisFlight:
    event: threading.Event = field(default_factory=threading.Event)
    sample: EphemerisSample | None = None
    error: BaseException | None = None
    retry_for_new_owner: bool = False


@dataclass(slots=True)
class _ProviderOutage:
    failure: "_EphemerisFailureData"
    retry_at_monotonic: float
    probing: bool = False
    probe_event: threading.Event | None = None


@dataclass(frozen=True, slots=True)
class _EphemerisFailureData:
    kind: str
    message: str
    provider: str
    body_id: str | None
    jd: float | None
    code: str
    retryable: bool
    retry_after_s: float | None

    @classmethod
    def from_error(cls, error: EphemerisError) -> "_EphemerisFailureData":
        return cls(
            kind=type(error).__name__,
            message=str(error),
            provider=error.provider,
            body_id=error.body_id,
            jd=error.jd,
            code=error.code,
            retryable=error.retryable,
            retry_after_s=error.retry_after_s,
        )

    def to_error(self) -> EphemerisError:
        error_types = {
            error_type.__name__: error_type
            for error_type in (
                EphemerisProviderUnavailable,
                EphemerisUpstreamTimeout,
                EphemerisUpstreamRateLimited,
                EphemerisProtocolError,
                EphemerisTargetUnsupported,
            )
        }
        error_type = error_types.get(self.kind, EphemerisError)
        return error_type(
            self.message,
            provider=self.provider,
            body_id=self.body_id,
            jd=self.jd,
            code=self.code,
            retryable=self.retryable,
            retry_after_s=self.retry_after_s,
        )


_SHARED_EPHEMERIS_LOCK = threading.RLock()
_SHARED_EPHEMERIS_SUCCESS: "OrderedDict[_SharedEphemerisCacheKey, EphemerisSample]" = OrderedDict()
_SHARED_EPHEMERIS_ALIASES: "OrderedDict[_SharedEphemerisRequestKey, _SharedEphemerisCacheKey]" = OrderedDict()
_SHARED_EPHEMERIS_INFLIGHT: Dict[_SharedEphemerisRequestKey, _SharedEphemerisFlight] = {}
_SHARED_PROVIDER_OUTAGES: Dict[str, _ProviderOutage] = {}


def _shared_success_get_locked(
    request_key: _SharedEphemerisRequestKey,
) -> EphemerisSample | None:
    full_key = _SHARED_EPHEMERIS_ALIASES.get(request_key)
    if full_key is None:
        return None
    sample = _SHARED_EPHEMERIS_SUCCESS.get(full_key)
    if sample is None:
        _SHARED_EPHEMERIS_ALIASES.pop(request_key, None)
        return None
    _SHARED_EPHEMERIS_ALIASES.move_to_end(request_key)
    _SHARED_EPHEMERIS_SUCCESS.move_to_end(full_key)
    return sample


def _shared_success_put_locked(
    request_key: _SharedEphemerisRequestKey,
    sample: EphemerisSample,
) -> None:
    revision = str(sample.provider_revision or "").strip()
    if not revision:
        raise ValueError("shared ephemeris samples require a provider revision")
    full_key = _SharedEphemerisCacheKey(
        provider=request_key.provider,
        provider_revision=revision,
        command=request_key.command,
        body_id=request_key.body_id,
        epoch_jd=request_key.epoch_jd,
        frame_id=request_key.frame_id,
        center=request_key.center,
        time_scale=request_key.time_scale,
        corrections=request_key.corrections,
        position_unit=request_key.position_unit,
        velocity_unit=request_key.velocity_unit,
        target_definition=request_key.target_definition,
    )
    previous_key = _SHARED_EPHEMERIS_ALIASES.get(request_key)
    if previous_key is not None and previous_key != full_key:
        _SHARED_EPHEMERIS_SUCCESS.pop(previous_key, None)
    _SHARED_EPHEMERIS_SUCCESS[full_key] = sample
    _SHARED_EPHEMERIS_SUCCESS.move_to_end(full_key)
    _SHARED_EPHEMERIS_ALIASES[request_key] = full_key
    _SHARED_EPHEMERIS_ALIASES.move_to_end(request_key)

    maximum = max(1, int(HORIZONS_SUCCESS_CACHE_MAXSIZE))
    while len(_SHARED_EPHEMERIS_SUCCESS) > maximum:
        evicted_key, _ = _SHARED_EPHEMERIS_SUCCESS.popitem(last=False)
        stale_aliases = [
            alias
            for alias, cached_key in _SHARED_EPHEMERIS_ALIASES.items()
            if cached_key == evicted_key
        ]
        for alias in stale_aliases:
            _SHARED_EPHEMERIS_ALIASES.pop(alias, None)


def _reset_shared_ephemeris_state_for_tests() -> None:
    """Clear process state for deterministic isolated tests only."""

    with _SHARED_EPHEMERIS_LOCK:
        if _SHARED_EPHEMERIS_INFLIGHT:
            raise RuntimeError("cannot reset shared ephemeris state while work is in flight")
        _SHARED_EPHEMERIS_SUCCESS.clear()
        _SHARED_EPHEMERIS_ALIASES.clear()
        _SHARED_PROVIDER_OUTAGES.clear()


def _has_canonical_kepler_orbit(body: Mapping[str, Any]) -> bool:
    orbit = body.get("orbit")
    if not isinstance(orbit, Mapping):
        return False
    required = (
        "a_au",
        "e",
        "i_deg",
        "ascending_node_deg",
        "arg_periapsis_deg",
        "mean_anomaly_deg",
        "period_days",
        "epoch_jd",
    )
    parsed: Dict[str, float] = {}
    for name in required:
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


class EphemerisService:
    """Sample body states from one provider pinned for the request."""

    _SUPPORTED_PROVIDERS = ("auto", "spice", "horizons", "kepler")
    _PROVIDER_WIDE_FAILURES = (
        EphemerisProviderUnavailable,
        EphemerisUpstreamTimeout,
        EphemerisUpstreamRateLimited,
        EphemerisProtocolError,
    )

    def __init__(
        self,
        bodies: Sequence[Dict[str, Any]],
        *,
        provider: str = "auto",
        horizons_timeout_s: float = HORIZONS_MAX_TIMEOUT_S,
        enable_cache: bool = True,
        context: Any | None = None,
    ) -> None:
        provider_key = provider.lower().strip()
        if provider_key not in self._SUPPORTED_PROVIDERS:
            raise ValueError(f"Unsupported ephemeris provider `{provider}`")

        try:
            requested_timeout = float(horizons_timeout_s)
        except (TypeError, ValueError) as exc:
            raise ValueError("horizons_timeout_s must be finite and positive") from exc
        if not math.isfinite(requested_timeout) or requested_timeout <= 0.0:
            raise ValueError("horizons_timeout_s must be finite and positive")

        self._provider = provider_key
        self._resolved_provider = "kepler" if provider_key == "auto" else provider_key
        # Import lazily to keep the provider module independent from the
        # trajectory package during module initialization. Every provider can
        # consume CPU/cache or block native work, so none may operate without
        # the real request-owned deadline/budget object.
        from trajectory.budget import PlanningContext

        if type(context) is not PlanningContext:
            raise ValueError(
                "EphemerisService requires a request-owned exact PlanningContext"
            )
        self._horizons_timeout_s = min(HORIZONS_MAX_TIMEOUT_S, requested_timeout)
        self._body_by_id = {
            str(body["id"]).strip().lower(): dict(body)
            for body in bodies
            if isinstance(body, dict) and body.get("id") is not None
        }
        self._cache_enabled = bool(enable_cache)
        self._context = context
        self._cache: Dict[Tuple[str, str, float], EphemerisSample] = {}
        self._failure_cache: Dict[Tuple[str, str, float], EphemerisError] = {}
        self._provider_circuit_failure: EphemerisError | None = None
        self._lock = threading.RLock()

    @property
    def provider(self) -> str:
        """Return the caller-requested provider for response compatibility."""
        return self._provider

    @property
    def resolved_provider(self) -> str:
        """Return the single provider actually used by this service."""
        return self._resolved_provider

    @property
    def state_contract(self) -> EphemerisStateContract:
        return TRAJECTORY_STATE_CONTRACT

    @property
    def planning_context(self) -> Any | None:
        """Return the immutable owner identity used for cross-layer checks."""
        return self._context

    def available_providers(self) -> Dict[str, bool]:
        # Horizons True means configured, not that a live health check passed.
        return {"spice": _load_spice(self._context), "horizons": True, "kepler": True}

    def provider_chain(self) -> list[str]:
        """Compatibility method returning the now-single resolved provider."""
        return [self._resolved_provider]

    def preflight(self, body_ids: Sequence[str]) -> tuple[str, ...]:
        """Validate complete provider coverage before any state computation.

        This is intentionally side-effect free for Horizons: a request with one
        supported endpoint and one unsupported endpoint must make zero network
        calls. SPICE kernel initialization is performed only after the complete
        target set has passed the static coverage check.
        """

        if isinstance(body_ids, (str, bytes, bytearray)) or not isinstance(
            body_ids, Sequence
        ):
            raise ValueError("Ephemeris preflight targets must be a bounded sequence")
        submitted_target_count = len(body_ids)
        if submitted_target_count > EPHEMERIS_PREFLIGHT_MAX_TARGETS:
            raise ValueError(
                "Ephemeris preflight accepts at most "
                f"{EPHEMERIS_PREFLIGHT_MAX_TARGETS} submitted targets"
            )

        self._context_checkpoint()
        normalized: list[str] = []
        seen: set[str] = set()
        for index in range(submitted_target_count):
            self._context_checkpoint()
            try:
                raw_body_id = body_ids[index]
            except (IndexError, KeyError) as exc:
                raise ValueError(
                    "Ephemeris preflight targets changed size during validation"
                ) from exc
            body_id = str(raw_body_id).strip().lower()
            if body_id in seen:
                continue
            seen.add(body_id)
            normalized.append(body_id)

        for body_id in normalized:
            body = self._body_by_id.get(body_id)
            if body is None:
                raise EphemerisTargetUnsupported(
                    f"Unknown body `{body_id}`",
                    provider=self._resolved_provider,
                    body_id=body_id,
                )
            if self._resolved_provider == "kepler" and not _has_canonical_kepler_orbit(body):
                raise EphemerisTargetUnsupported(
                    f"Body `{body_id}` has no local orbital elements or they are invalid",
                    provider="kepler",
                    body_id=body_id,
                )
            if self._resolved_provider == "spice" and body_id not in _ID_TO_SPICE:
                raise EphemerisTargetUnsupported(
                    f"SPICE does not support body `{body_id}`",
                    provider="spice",
                    body_id=body_id,
                )
            if self._resolved_provider == "horizons" and body_id not in _ID_TO_HORIZONS:
                raise EphemerisTargetUnsupported(
                    f"Horizons has no explicit target mapping for `{body_id}`",
                    provider="horizons",
                    body_id=body_id,
                )

        if self._resolved_provider == "spice" and not _load_spice(self._context):
            raise EphemerisProviderUnavailable(
                "SPICE is unavailable in this process",
                provider="spice",
            )

        return tuple(normalized)

    def sample_state(self, body_id: str, jd: float) -> EphemerisSample:
        normalized_body_id = str(body_id).strip().lower()
        if normalized_body_id not in self._body_by_id:
            raise EphemerisTargetUnsupported(
                f"Unknown body `{normalized_body_id}`",
                provider=self._resolved_provider,
                body_id=normalized_body_id,
            )

        try:
            normalized_jd = float(jd)
        except (TypeError, ValueError) as exc:
            raise ValueError("jd must be a finite Julian date") from exc
        if not math.isfinite(normalized_jd):
            raise ValueError("jd must be a finite Julian date")
        jd_key = round(normalized_jd, 9)
        cache_key = (self._resolved_provider, normalized_body_id, jd_key)

        self._context_checkpoint()
        self._context_reserve(ephemeris_queries=1)

        with self._lock:
            if (
                self._resolved_provider != "horizons"
                and self._provider_circuit_failure is not None
            ):
                self._context_increment("negative_cache_hits")
                self._context_increment("circuit_open_rejections")
                raise self._provider_circuit_failure.clone()
            if self._cache_enabled:
                cached = self._cache.get(cache_key)
                if cached is not None:
                    self._context_increment("cache_hits")
                    self._context_increment("request_cache_hits")
                    return cached
                cached_failure = (
                    self._failure_cache.get(cache_key)
                    if self._resolved_provider != "horizons"
                    else None
                )
                if cached_failure is not None:
                    self._context_increment("negative_cache_hits")
                    raise cached_failure.clone()

        try:
            if self._resolved_provider == "horizons":
                sample = self._sample_horizons_process_shared(normalized_body_id, jd_key)
            else:
                self._context_reserve(unique_ephemeris_states=1)
                sample = self._sample_from_resolved_provider(normalized_body_id, jd_key)
        except EphemerisError as exc:
            if self._resolved_provider != "horizons":
                # Horizons records only the single-flight owner below, so
                # followers and process-outage rejections cannot inflate this
                # actual-provider-work counter.
                self._context_increment("provider_failures")
            # A budget/cancellation outcome belongs to this invocation, not to
            # the provider. Replaying it from a negative cache could reject a
            # later request that has a fresh owner and budget.
            if (
                self._resolved_provider != "horizons"
                and not isinstance(exc, (EphemerisBudgetExceeded, EphemerisCancelled))
            ):
                with self._lock:
                    if self._cache_enabled:
                        self._failure_cache[cache_key] = exc.clone()
                    if isinstance(exc, self._PROVIDER_WIDE_FAILURES):
                        self._provider_circuit_failure = exc.clone()
            raise

        if sample.contract != TRAJECTORY_STATE_CONTRACT:
            error = EphemerisProtocolError(
                "Ephemeris provider returned an incompatible state-vector contract",
                provider=self._resolved_provider,
                body_id=normalized_body_id,
                jd=jd_key,
            )
            with self._lock:
                self._provider_circuit_failure = error.clone()
            raise error

        with self._lock:
            if self._cache_enabled:
                self._cache[cache_key] = sample
        return sample

    def sample_states(self, body_ids: Sequence[str], jd: float) -> Dict[str, EphemerisSample]:
        return {body_id: self.sample_state(body_id, jd) for body_id in body_ids}

    def _shared_horizons_request_key(
        self,
        body_id: str,
        jd: float,
    ) -> _SharedEphemerisRequestKey:
        command = self._horizons_command_for_body(body_id)
        if command is None:
            raise EphemerisTargetUnsupported(
                f"Horizons has no explicit target mapping for `{body_id}`",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            )
        contract = TRAJECTORY_STATE_CONTRACT
        return _SharedEphemerisRequestKey(
            provider="horizons",
            command=command,
            body_id=body_id,
            epoch_jd=jd,
            frame_id=contract.frame_id,
            center="10",
            time_scale=contract.jd_time_scale,
            corrections=contract.corrections,
            position_unit=contract.position_unit,
            velocity_unit=contract.velocity_unit,
            target_definition="body_center",
        )

    def _wait_for_shared_ephemeris_event(self, event: threading.Event) -> None:
        while not event.is_set():
            self._context_checkpoint()
            remaining = self._context_remaining_seconds()
            if remaining is not None and remaining <= 0.0:
                # An exact PlanningContext raises at checkpoint; this branch is
                # defensive against a boundary race in remaining_seconds().
                self._context_checkpoint()
            wait_s = HORIZONS_WAIT_POLL_S
            if remaining is not None:
                wait_s = min(wait_s, max(0.001, remaining))
            event.wait(timeout=wait_s)
        self._context_checkpoint()

    @staticmethod
    def _is_owner_control_failure(exc: BaseException) -> bool:
        if isinstance(exc, (EphemerisBudgetExceeded, EphemerisCancelled)):
            return True
        try:
            from trajectory.budget import PlanningError
        except ImportError:  # pragma: no cover - trajectory is part of this application.
            return False
        return isinstance(exc, PlanningError)

    @staticmethod
    def _provider_outage_delay(exc: EphemerisError) -> float:
        retry_after = exc.retry_after_s
        try:
            parsed_retry_after = float(retry_after) if retry_after is not None else 0.0
        except (TypeError, ValueError, OverflowError):
            parsed_retry_after = 0.0
        if not math.isfinite(parsed_retry_after):
            parsed_retry_after = 0.0
        return max(
            HORIZONS_PROVIDER_OUTAGE_COOLDOWN_S,
            min(HORIZONS_PROVIDER_OUTAGE_MAX_COOLDOWN_S, parsed_retry_after),
        )

    def _sample_horizons_process_shared(
        self,
        body_id: str,
        jd: float,
    ) -> EphemerisSample:
        request_key = self._shared_horizons_request_key(body_id, jd)

        while True:
            self._context_checkpoint()
            wait_event: threading.Event | None = None
            cached_failure: EphemerisError | None = None
            flight: _SharedEphemerisFlight | None = None
            owns_flight = False
            owns_half_open_probe = False

            with _SHARED_EPHEMERIS_LOCK:
                if self._cache_enabled:
                    cached = _shared_success_get_locked(request_key)
                    if cached is not None:
                        self._context_increment("cache_hits")
                        self._context_increment("shared_cache_hits")
                        return cached

                now = time.monotonic()
                outage = _SHARED_PROVIDER_OUTAGES.get("horizons")
                if outage is not None:
                    if outage.probing:
                        wait_event = outage.probe_event
                    elif now < outage.retry_at_monotonic:
                        cached_failure = outage.failure.to_error()
                    else:
                        outage.probing = True
                        outage.probe_event = threading.Event()
                        owns_half_open_probe = True

                if wait_event is None and cached_failure is None:
                    flight = _SHARED_EPHEMERIS_INFLIGHT.get(request_key)
                    if flight is None:
                        flight = _SharedEphemerisFlight()
                        _SHARED_EPHEMERIS_INFLIGHT[request_key] = flight
                        owns_flight = True

            if cached_failure is not None:
                self._context_increment("negative_cache_hits")
                self._context_increment("circuit_open_rejections")
                raise cached_failure
            if wait_event is not None:
                self._wait_for_shared_ephemeris_event(wait_event)
                continue
            if flight is None:  # pragma: no cover - guarded by the locked state machine.
                raise RuntimeError("shared Horizons state machine produced no flight")

            if not owns_flight:
                self._wait_for_shared_ephemeris_event(flight.event)
                if flight.sample is not None:
                    self._context_increment("cache_hits")
                    self._context_increment("shared_cache_hits")
                    return flight.sample
                if flight.retry_for_new_owner:
                    continue
                if isinstance(flight.error, EphemerisError):
                    raise flight.error.clone()
                if flight.error is not None:
                    raise EphemerisProtocolError(
                        "The shared Horizons owner failed before publishing a state",
                        provider="horizons",
                        body_id=body_id,
                        jd=jd,
                    ) from flight.error
                continue

            try:
                self._context_reserve(unique_ephemeris_states=1)
                sample = self._sample_horizons(body_id, jd)
                if sample.contract != TRAJECTORY_STATE_CONTRACT:
                    raise EphemerisProtocolError(
                        "Ephemeris provider returned an incompatible state-vector contract",
                        provider="horizons",
                        body_id=body_id,
                        jd=jd,
                    )
                if not str(sample.provider_revision or "").strip():
                    raise EphemerisProtocolError(
                        "Horizons state omitted its provider revision",
                        provider="horizons",
                        body_id=body_id,
                        jd=jd,
                    )
            except BaseException as exc:
                control_failure = self._is_owner_control_failure(exc)
                provider_failure = isinstance(exc, self._PROVIDER_WIDE_FAILURES)
                if isinstance(exc, EphemerisError) and not control_failure:
                    self._context_increment("provider_failures")
                with _SHARED_EPHEMERIS_LOCK:
                    if _SHARED_EPHEMERIS_INFLIGHT.get(request_key) is flight:
                        _SHARED_EPHEMERIS_INFLIGHT.pop(request_key, None)
                    flight.error = exc
                    flight.retry_for_new_owner = control_failure

                    outage = _SHARED_PROVIDER_OUTAGES.get("horizons")
                    probe_event = (
                        outage.probe_event
                        if outage is not None and outage.probing
                        else None
                    )
                    if provider_failure and isinstance(exc, EphemerisError):
                        _SHARED_PROVIDER_OUTAGES["horizons"] = _ProviderOutage(
                            failure=_EphemerisFailureData.from_error(exc),
                            retry_at_monotonic=(
                                time.monotonic() + self._provider_outage_delay(exc)
                            ),
                        )
                    elif owns_half_open_probe and outage is not None:
                        outage.probing = False
                        outage.probe_event = None
                        outage.retry_at_monotonic = time.monotonic()

                    flight.event.set()
                    if probe_event is not None:
                        probe_event.set()
                raise

            with _SHARED_EPHEMERIS_LOCK:
                if self._cache_enabled:
                    _shared_success_put_locked(request_key, sample)
                if _SHARED_EPHEMERIS_INFLIGHT.get(request_key) is flight:
                    _SHARED_EPHEMERIS_INFLIGHT.pop(request_key, None)
                flight.sample = sample
                flight.event.set()
                outage = _SHARED_PROVIDER_OUTAGES.pop("horizons", None)
                if outage is not None and outage.probe_event is not None:
                    outage.probe_event.set()
            return sample

    def _provider_chain(self) -> list[str]:
        """Backward-compatible private helper used by older diagnostics."""
        return self.provider_chain()

    def _sample_from_resolved_provider(self, body_id: str, jd: float) -> EphemerisSample:
        if self._resolved_provider == "kepler":
            return self._sample_kepler(body_id, jd)
        if self._resolved_provider == "spice":
            return self._sample_spice(body_id, jd)
        if self._resolved_provider == "horizons":
            return self._sample_horizons(body_id, jd)
        raise EphemerisProtocolError(
            f"Unsupported resolved ephemeris provider `{self._resolved_provider}`",
            provider=self._resolved_provider,
            body_id=body_id,
            jd=jd,
        )

    def _sample_kepler(self, body_id: str, jd: float) -> EphemerisSample:
        body = self._body_by_id[body_id]
        orbit = body.get("orbit")
        if not _has_canonical_kepler_orbit(body):
            raise EphemerisTargetUnsupported(
                f"Body `{body_id}` has no local orbital elements or they are invalid",
                provider="kepler",
                body_id=body_id,
                jd=jd,
            )
        model = orbit.get("ephemeris_model")
        if model is not None:
            lower, upper = model["supported_jd_tdb_range"]
            if not lower <= jd <= upper:
                raise EphemerisTargetUnsupported(
                    f"Body `{body_id}` is outside the gated local ephemeris interval [{lower}, {upper}] JDTDB",
                    provider="kepler", body_id=body_id, jd=jd,
                )
        try:
            state = sample_body_state_from_elements(body, jd)
            return EphemerisSample(
                body_id=body_id,
                jd=jd,
                position_au=state["position"],
                velocity_au_day=state["velocity"],
                source="kepler",
                # Retain the planner's accepted catalog-reference contract;
                # model_metadata records the physical barycenter it denotes.
                target_definition="catalog_orbit_reference",
                provider_revision="catalog_elements",
                model_metadata=dict(model) if model else {
                    "quality": "approximate_fixed_elements",
                    "initial_epoch_jd_tdb": orbit["epoch_jd"],
                    "supported_jd_tdb_range": None,
                    "accuracy_scope": "unvalidated_no_error_bound",
                },
            )
        except EphemerisError:
            raise
        except Exception as exc:
            raise EphemerisProtocolError(
                f"Local orbital elements for `{body_id}` are malformed",
                provider="kepler",
                body_id=body_id,
                jd=jd,
            ) from exc

    def _sample_spice(self, body_id: str, jd: float) -> EphemerisSample:
        spice_name = _ID_TO_SPICE.get(body_id)
        if spice_name is None:
            raise EphemerisTargetUnsupported(
                f"SPICE does not support body `{body_id}`",
                provider="spice",
                body_id=body_id,
                jd=jd,
            )
        if not _load_spice(self._context):
            raise EphemerisProviderUnavailable(
                "SPICE is unavailable in this process",
                provider="spice",
                body_id=body_id,
                jd=jd,
            )

        self._context_checkpoint()
        epoch_seconds = (jd - J2000_JD) * DAY_SECONDS
        try:
            state_si = self._run_spice_state_call(spice_name, epoch_seconds)
            values = tuple(float(value) for value in state_si)
        except EphemerisError:
            raise
        except Exception as exc:
            if self._is_owner_control_failure(exc):
                raise
            raise EphemerisProviderUnavailable(
                f"SPICE could not sample `{body_id}` at the requested epoch",
                provider="spice",
                body_id=body_id,
                jd=jd,
            ) from exc

        if len(values) != 6 or not all(math.isfinite(value) for value in values):
            raise EphemerisProtocolError(
                "SPICE returned an invalid Cartesian state",
                provider="spice",
                body_id=body_id,
                jd=jd,
            )

        return EphemerisSample(
            body_id=body_id,
            jd=jd,
            position_au=tuple(value / AU_M for value in values[:3]),
            velocity_au_day=tuple(value * DAY_SECONDS / AU_M for value in values[3:]),
            source="spice",
            target_definition="body_center",
            provider_revision="tudatpy_standard_kernels",
        )

    def _run_spice_state_call(self, spice_name: str, epoch_seconds: float) -> Any:
        """Run one native SPICE call without allowing wedged-thread growth."""

        acquired = False
        while not acquired:
            self._context_checkpoint()
            remaining = self._context_remaining_seconds()
            wait_s = SPICE_CALL_WAIT_POLL_S
            if remaining is not None:
                if remaining <= 0.0:
                    self._context_checkpoint()
                wait_s = min(wait_s, max(0.001, remaining))
            acquired = _SPICE_CALL_CONCURRENCY_GUARD.acquire(timeout=wait_s)

        handed_to_worker = False
        done = threading.Event()
        outcome: Dict[str, Any] = {}
        try:
            self._context_checkpoint()

            def native_call() -> None:
                try:
                    try:
                        outcome["state"] = _spice.get_body_cartesian_state_at_epoch(
                            spice_name,
                            "Sun",
                            "ECLIPJ2000",
                            "NONE",
                            epoch_seconds,
                        )
                    except TypeError:
                        outcome["state"] = _spice.get_body_cartesian_state_at_epoch(
                            target_body_name=spice_name,
                            observer_body_name="Sun",
                            reference_frame_name="ECLIPJ2000",
                            aberration_corrections="NONE",
                            ephemeris_time=epoch_seconds,
                        )
                except BaseException as exc:
                    outcome["error"] = exc
                finally:
                    try:
                        _SPICE_CALL_CONCURRENCY_GUARD.release()
                    finally:
                        done.set()

            threading.Thread(
                target=native_call,
                name="spice-state-call",
                daemon=True,
            ).start()
            handed_to_worker = True
        finally:
            if not handed_to_worker:
                _SPICE_CALL_CONCURRENCY_GUARD.release()

        while not done.is_set():
            self._context_checkpoint()
            remaining = self._context_remaining_seconds()
            wait_s = SPICE_CALL_WAIT_POLL_S
            if remaining is not None:
                if remaining <= 0.0:
                    self._context_checkpoint()
                wait_s = min(wait_s, max(0.001, remaining))
            done.wait(timeout=wait_s)

        self._context_checkpoint()
        error = outcome.get("error")
        if isinstance(error, BaseException):
            raise error
        if "state" not in outcome:
            raise RuntimeError("SPICE native call returned no state")
        return outcome["state"]

    def _sample_horizons(self, body_id: str, jd: float) -> EphemerisSample:
        command = self._horizons_command_for_body(body_id)
        if command is None:
            raise EphemerisTargetUnsupported(
                f"Horizons has no explicit target mapping for `{body_id}`",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            )

        self._context_checkpoint()
        timeout_s = self._horizons_request_timeout(body_id, jd)
        params = {
            "format": "json",
            "OBJ_DATA": "NO",
            "COMMAND": command,
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "VECTORS",
            "CENTER": "500@10",
            "TLIST_TYPE": "JD",
            "TIME_TYPE": "TDB",
            "REF_PLANE": "ECLIPTIC",
            "REF_SYSTEM": "ICRF",
            "VEC_CORR": "NONE",
            "OUT_UNITS": "AU-D",
            "VEC_TABLE": "2",
            "CSV_FORMAT": "YES",
            "VEC_LABELS": "YES",
            "TLIST": f"{jd:.9f}",
        }
        url = HORIZONS_API_URL + "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers={"User-Agent": HORIZONS_USER_AGENT})

        try:
            raw = self._run_horizons_request(
                request,
                timeout_s=timeout_s,
                body_id=body_id,
                jd=jd,
            )
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                retry_after_header = exc.headers.get("Retry-After") if exc.headers else None
                retry_after_s = _parse_retry_after_seconds(retry_after_header)
                raise EphemerisUpstreamRateLimited(
                    "Horizons rate limited the request",
                    provider="horizons",
                    body_id=body_id,
                    jd=jd,
                    retry_after_s=retry_after_s,
                ) from exc
            if 500 <= exc.code <= 599:
                raise EphemerisProviderUnavailable(
                    f"Horizons returned HTTP {exc.code}",
                    provider="horizons",
                    body_id=body_id,
                    jd=jd,
                ) from exc
            raise EphemerisProtocolError(
                f"Horizons rejected the state query with HTTP {exc.code}",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            ) from exc
        except (TimeoutError, socket.timeout) as exc:
            raise EphemerisUpstreamTimeout(
                "Horizons state query timed out",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            ) from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, (TimeoutError, socket.timeout)):
                raise EphemerisUpstreamTimeout(
                    "Horizons state query timed out",
                    provider="horizons",
                    body_id=body_id,
                    jd=jd,
                ) from exc
            raise EphemerisProviderUnavailable(
                "Horizons could not be reached",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            ) from exc
        except OSError as exc:
            raise EphemerisProviderUnavailable(
                "Horizons transport failed",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            ) from exc

        self._context_checkpoint()
        if len(raw) > HORIZONS_MAX_RESPONSE_BYTES:
            raise EphemerisProtocolError(
                "Horizons response exceeded the configured size limit",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            )
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise EphemerisProtocolError(
                "Horizons returned malformed JSON",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            ) from exc

        vector, provider_revision = _parse_horizons_payload(
            payload,
            expected_target_id=command,
            expected_jd=jd,
            body_id=body_id,
        )
        return EphemerisSample(
            body_id=body_id,
            jd=jd,
            position_au=vector[:3],
            velocity_au_day=vector[3:],
            source="horizons",
            target_definition="body_center",
            provider_revision=provider_revision,
        )

    def _run_horizons_request(
        self,
        request: urllib.request.Request,
        *,
        timeout_s: float,
        body_id: str,
        jd: float,
    ) -> bytes:
        """Supervise terminable HTTP I/O under an admitted upstream deadline.

        Queueing for the local permit is governed by the owning planning
        context.  Once admitted, every redirect consumes the configured
        upstream deadline (capped by that same context) and an external request
        reservation. The supervisor can outlive a cancelled waiter only until
        that deadline; child kill/reap always precedes permit release.
        """

        _validate_horizons_url(request.full_url)
        acquired = False
        while not acquired:
            self._context_checkpoint()
            # Local admission must never consume the configured upstream
            # timeout: a healthy request may wait behind another local caller.
            # Bound each poll by the owning context instead, so expiry and
            # cancellation retain their owner-control classification.
            remaining = self._context_remaining_seconds()
            if remaining is not None and remaining <= 0.0:
                self._context_checkpoint()
            acquired = _HORIZONS_CONCURRENCY_GUARD.acquire(
                timeout=(
                    HORIZONS_WAIT_POLL_S
                    if remaining is None
                    else min(HORIZONS_WAIT_POLL_S, max(0.001, remaining))
                )
            )

        handed_to_transport = False
        try:
            # Admission can race context expiry/cancellation. Re-check after
            # acquiring so a permit becoming free at the boundary cannot
            # authorize a brand-new outbound call, then start the upstream
            # timeout only for admitted transport work.
            self._context_checkpoint()
            absolute_deadline = min(
                time.monotonic() + max(0.0, float(timeout_s)),
                self._context.deadline_monotonic,
            )
            # Charge only after global admission and immediately before the
            # outbound thread is started. A failed expensive call still owns
            # its reservation.
            self._context_reserve(remote_ephemeris_states=1, external_requests=1)

            done = threading.Event()
            outcome: Dict[str, Any] = {}

            def transport() -> None:
                try:
                    current = request
                    for hop in range(HORIZONS_MAX_REDIRECTS + 1):
                        self._context_checkpoint()
                        _validate_horizons_url(current.full_url)
                        remaining = absolute_deadline - time.monotonic()
                        if remaining <= 0:
                            raise EphemerisUpstreamTimeout("Horizons redirect deadline exceeded", provider="horizons")
                        if hop:
                            self._context_reserve(external_requests=1)
                        with closing(_horizons_urlopen(current, timeout=remaining)) as response:
                            self._context_checkpoint()
                            _validate_horizons_url(response.geturl())
                            status = response.status
                            if status in (301, 302, 303, 307, 308):
                                locations = response.headers.get_all("Location", [])
                                if len(locations) != 1 or not locations[0].strip() or hop >= HORIZONS_MAX_REDIRECTS:
                                    raise EphemerisProtocolError("Horizons redirect limit or missing/ambiguous Location", provider="horizons")
                                target = urllib.parse.urljoin(current.full_url, locations[0])
                                _validate_horizons_url(target)
                                current = urllib.request.Request(target, headers={"User-Agent": HORIZONS_USER_AGENT})
                                continue
                            if status != 200:
                                # Preserve the existing 429/5xx/query-rejection
                                # classification without reading an error body.
                                raise urllib.error.HTTPError(
                                    current.full_url, status, "Horizons HTTP failure",
                                    response.headers, None,
                                )
                            chunks = []
                            received = 0
                            while received <= HORIZONS_MAX_RESPONSE_BYTES:
                                self._context_checkpoint()
                                chunk = response.read(min(64 * 1024, HORIZONS_MAX_RESPONSE_BYTES + 1 - received))
                                if not chunk:
                                    break
                                chunks.append(chunk)
                                received += len(chunk)
                            if received > HORIZONS_MAX_RESPONSE_BYTES:
                                raise EphemerisProtocolError(
                                    "Horizons response exceeded the configured size limit",
                                    provider="horizons", body_id=body_id, jd=jd,
                                )
                            outcome["raw"] = b"".join(chunks)
                        break
                except BaseException as exc:  # Preserve exact transport classification upstream.
                    if isinstance(exc, SolarHttpError):
                        error_type = EphemerisProviderUnavailable
                        if exc.code == "acquisition_deadline":
                            error_type = EphemerisUpstreamTimeout
                        elif exc.code in ("response_byte_limit", "response_metadata_limit"):
                            error_type = EphemerisProtocolError
                        exc = error_type(
                            f"Horizons owned transport failed ({exc.code})",
                            provider="horizons", body_id=body_id, jd=jd,
                        )
                    outcome["error"] = exc
                finally:
                    outcome["finishedMonotonic"] = time.monotonic()
                    try:
                        _HORIZONS_CONCURRENCY_GUARD.release()
                    finally:
                        done.set()

            worker = threading.Thread(
                target=transport,
                name="horizons-transport",
                daemon=True,
            )
            worker.start()
            handed_to_transport = True
        finally:
            if not handed_to_transport:
                _HORIZONS_CONCURRENCY_GUARD.release()

        while not done.is_set():
            self._context_checkpoint()
            remaining = absolute_deadline - time.monotonic()
            if remaining <= 0.0:
                # Prefer a result that finished at the boundary; otherwise the
                # supervisor retains the permit until child kill/reap finishes.
                if done.is_set():
                    break
                raise EphemerisUpstreamTimeout(
                    "Horizons state query exceeded its absolute deadline",
                    provider="horizons",
                    body_id=body_id,
                    jd=jd,
                )
            done.wait(timeout=min(HORIZONS_WAIT_POLL_S, remaining))

        self._context_checkpoint()
        finished = float(outcome.get("finishedMonotonic", math.inf))
        if finished > absolute_deadline:
            raise EphemerisUpstreamTimeout(
                "Horizons state query exceeded its absolute deadline",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            )
        error = outcome.get("error")
        if isinstance(error, BaseException):
            raise error
        raw = outcome.get("raw")
        if not isinstance(raw, bytes):
            raise EphemerisProtocolError(
                "Horizons transport returned no response bytes",
                provider="horizons",
                body_id=body_id,
                jd=jd,
            )
        return raw

    def _horizons_command_for_body(self, body_id: str) -> Optional[str]:
        return _ID_TO_HORIZONS.get(body_id)

    def _horizons_request_timeout(self, body_id: str, jd: float) -> float:
        timeout_s = self._horizons_timeout_s
        remaining = self._context_remaining_seconds()
        if remaining is not None:
            if remaining <= 0.0:
                raise EphemerisBudgetExceeded(
                    "No planning time remains for a Horizons request",
                    provider="horizons",
                    body_id=body_id,
                    jd=jd,
                )
            timeout_s = min(timeout_s, remaining)
        return timeout_s

    def _context_checkpoint(self) -> None:
        checkpoint = getattr(self._context, "checkpoint", None)
        if callable(checkpoint):
            checkpoint()

    def _context_reserve(self, **charges: int) -> None:
        reserve = getattr(self._context, "reserve", None)
        if callable(reserve):
            reserve(**charges)

    def _context_increment(self, name: str, amount: int = 1) -> None:
        increment = getattr(self._context, "increment", None)
        if callable(increment):
            increment(name, amount)

    def _context_remaining_seconds(self) -> float | None:
        remaining_seconds = getattr(self._context, "remaining_seconds", None)
        if not callable(remaining_seconds):
            return None
        remaining = remaining_seconds()
        if remaining is None:
            return None
        try:
            parsed = float(remaining)
        except (TypeError, ValueError) as exc:
            raise ValueError("PlanningContext.remaining_seconds() must be numeric") from exc
        if not math.isfinite(parsed):
            return None if parsed > 0.0 else 0.0
        return max(0.0, parsed)


def _load_spice(context: Any | None = None) -> bool:
    """Initialize SPICE once without pinning a request worker indefinitely.

    Kernel loading is third-party code and cannot be safely interrupted in a
    Python thread. One daemon initializer owns the process-wide loading state;
    request workers poll their PlanningContext and can therefore stop at their
    own cancellation/deadline. If the loader itself wedges, it remains capped
    at exactly one thread and every later request also exits by its own bound.
    """

    global _SPICE_READY, _SPICE_ATTEMPTED, _SPICE_LOADING, _SPICE_IMPORT_ERROR, _spice

    def initialize() -> None:
        global _SPICE_READY, _SPICE_LOADING, _SPICE_IMPORT_ERROR, _spice

        loaded_spice = None
        import_error = ""
        try:
            from tudatpy.kernel.interface import spice  # type: ignore

            spice.load_standard_kernels()
            loaded_spice = spice
        except BaseException as exc:  # pragma: no cover - environment dependent
            # Always publish a terminal state. A BaseException escaping this
            # daemon would otherwise leave every future caller waiting forever.
            import_error = str(exc)

        with _SPICE_CONDITION:
            _spice = loaded_spice
            _SPICE_READY = loaded_spice is not None
            _SPICE_IMPORT_ERROR = import_error
            _SPICE_LOADING = False
            _SPICE_CONDITION.notify_all()

    start_initializer = False
    with _SPICE_CONDITION:
        if _SPICE_READY:
            return True
        if not _SPICE_ATTEMPTED:
            _SPICE_ATTEMPTED = True
            _SPICE_LOADING = True
            start_initializer = True
        elif not _SPICE_LOADING:
            return False

    if start_initializer:
        try:
            threading.Thread(
                target=initialize,
                name="spice-kernel-loader",
                daemon=True,
            ).start()
        except BaseException as exc:
            with _SPICE_CONDITION:
                _SPICE_IMPORT_ERROR = str(exc)
                _SPICE_LOADING = False
                _SPICE_CONDITION.notify_all()
            return False

    checkpoint = getattr(context, "checkpoint", None)
    remaining_seconds = getattr(context, "remaining_seconds", None)
    absolute_wait_deadline = time.monotonic() + SPICE_MAX_WAIT_S
    while True:
        if callable(checkpoint):
            checkpoint()
        transport_remaining = max(0.0, absolute_wait_deadline - time.monotonic())
        if transport_remaining <= 0.0:
            return False
        wait_seconds = min(SPICE_WAIT_POLL_S, transport_remaining)
        if callable(remaining_seconds):
            remaining = max(0.0, float(remaining_seconds()))
            if remaining <= 0.0:
                # A real PlanningContext raises from checkpoint at its deadline;
                # duck-typed diagnostic contexts may only expose zero remaining.
                return False
            wait_seconds = min(wait_seconds, remaining)

        with _SPICE_CONDITION:
            if not _SPICE_LOADING:
                return _SPICE_READY
            _SPICE_CONDITION.wait(timeout=wait_seconds)


def _parse_retry_after_seconds(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed) or parsed < 0.0:
        return None
    return min(parsed, 300.0)


def _extract_horizons_header(result_text: str, prefix: str) -> str:
    for line in result_text.splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped
    raise ValueError(f"response omitted `{prefix}`")


def _numeric_id_from_header(header: str) -> str:
    matches = re.findall(r"\((-?\d+)\)", header)
    if len(matches) != 1:
        raise ValueError("response header must contain exactly one numeric target ID")
    return matches[0]


def _parse_horizons_payload(
    payload: Any,
    *,
    expected_target_id: str,
    expected_jd: float,
    body_id: str,
) -> Tuple[Tuple[float, float, float, float, float, float], str]:
    try:
        if not isinstance(payload, dict):
            raise ValueError("top-level payload is not an object")
        if payload.get("error"):
            raise ValueError("upstream rejected the query")
        signature = payload.get("signature")
        if not isinstance(signature, dict) or signature.get("source") != "NASA/JPL Horizons API":
            raise ValueError("unexpected provider signature")

        result_text = payload.get("result")
        if not isinstance(result_text, str):
            raise ValueError("response omitted the vector result")
        if result_text.count("$$SOE") != 1 or result_text.count("$$EOE") != 1:
            raise ValueError("response did not contain exactly one vector table")

        target_header = _extract_horizons_header(result_text, "Target body name:")
        center_header = _extract_horizons_header(result_text, "Center body name:")
        frame_header = _extract_horizons_header(result_text, "Reference frame :")
        units_header = _extract_horizons_header(result_text, "Output units    :")
        output_type_header = _extract_horizons_header(result_text, "Output type     :")
        start_time_header = _extract_horizons_header(result_text, "Start time      :")
        stop_time_header = _extract_horizons_header(result_text, "Stop  time      :")
        if _numeric_id_from_header(target_header) != expected_target_id:
            raise ValueError("response identified the wrong target")
        if _numeric_id_from_header(center_header) != "10":
            raise ValueError("response identified the wrong center")
        if frame_header != "Reference frame : Ecliptic of J2000.0":
            raise ValueError("response identified an incompatible reference frame")
        if units_header != "Output units    : AU-D":
            raise ValueError("response identified incompatible output units")
        if output_type_header != "Output type     : GEOMETRIC cartesian states":
            raise ValueError("response identified non-geometric state vectors")
        if not start_time_header.endswith(" TDB") or not stop_time_header.endswith(" TDB"):
            raise ValueError("response identified an incompatible time scale")

        stripped_lines = [line.strip() for line in result_text.splitlines()]
        column_headers = [line for line in stripped_lines if line.startswith("JDTDB,")]
        column_labels = (
            {field.strip() for field in column_headers[0].split(",")}
            if len(column_headers) == 1
            else set()
        )
        if (
            len(column_headers) != 1
            or "Calendar Date (TDB)" not in column_headers[0]
            or not {"X", "Y", "Z", "VX", "VY", "VZ"}.issubset(column_labels)
        ):
            raise ValueError("response omitted the canonical TDB vector columns")
        normalized_result = " ".join(result_text.split())
        if "Geometric state vectors have NO corrections or aberrations applied." not in normalized_result:
            raise ValueError("response did not certify uncorrected geometric vectors")
        for line in stripped_lines:
            lowered = line.lower()
            if lowered.startswith("time scale") and ":" in line:
                if line.split(":", 1)[1].strip().upper() != "TDB":
                    raise ValueError("response contradicted the requested TDB time scale")
            if lowered.startswith("vector correction") and ":" in line:
                if line.split(":", 1)[1].strip().upper() != "NONE":
                    raise ValueError("response contradicted the requested correction mode")

        window = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
        rows = [row for row in csv.reader(io.StringIO(window)) if row and any(cell.strip() for cell in row)]
        if len(rows) != 1 or len(rows[0]) < 8:
            raise ValueError("response did not contain exactly one complete vector row")
        row = rows[0]
        returned_jd = float(row[0])
        if not math.isfinite(returned_jd) or not math.isclose(
            returned_jd, expected_jd, rel_tol=0.0, abs_tol=5e-10
        ):
            raise ValueError("response returned a different Julian date")
        vector = tuple(float(row[index]) for index in range(2, 8))
        if not all(math.isfinite(value) for value in vector):
            raise ValueError("response returned a non-finite state")

        target_source_match = re.search(r"\{source:\s*([^}]*)\}", target_header)
        if target_source_match is None or not target_source_match.group(1).strip():
            raise ValueError("target header omitted the source ephemeris")
        center_source_match = re.search(r"\{source:\s*([^}]*)\}", center_header)
        if center_source_match is None or not center_source_match.group(1).strip():
            raise ValueError("center header omitted the source ephemeris")
        # Horizons may select a target-system kernel for both target and center
        # headers (for example jup365_merged). That per-query provenance cannot
        # serve as a cross-body compatibility revision. The validated API
        # signature and canonical state contract are shared by every sample.
        raw_api_version = signature.get("version")
        if not isinstance(raw_api_version, str) or not raw_api_version.strip():
            raise ValueError("provider signature omitted a valid API version")
        api_version = raw_api_version.strip()
        provider_revision = f"horizons-api-{api_version}"
    except (TypeError, ValueError, IndexError, csv.Error) as exc:
        raise EphemerisProtocolError(
            f"Horizons returned an invalid state for `{body_id}`: {exc}",
            provider="horizons",
            body_id=body_id,
            jd=expected_jd,
        ) from exc

    return vector, provider_revision


def _parse_horizons_csv_vector(result_text: str) -> Optional[list[float]]:
    """Legacy parser retained for callers that only need an unverified vector."""
    if "$$SOE" not in result_text or "$$EOE" not in result_text:
        return None
    window = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    rows = [row for row in csv.reader(io.StringIO(window)) if row and any(cell.strip() for cell in row)]
    if len(rows) != 1 or len(rows[0]) < 8:
        return None
    try:
        vector = [float(rows[0][index]) for index in range(2, 8)]
    except (TypeError, ValueError):
        return None
    return vector if all(math.isfinite(value) for value in vector) else None


__all__ = [
    "EPHEMERIS_FRAME_ID",
    "TRAJECTORY_STATE_CONTRACT",
    "EphemerisBudgetExceeded",
    "EphemerisCancelled",
    "EphemerisError",
    "EphemerisProtocolError",
    "EphemerisProviderUnavailable",
    "EphemerisSample",
    "EphemerisService",
    "EphemerisStateContract",
    "EphemerisTargetUnsupported",
    "EphemerisUpstreamRateLimited",
    "EphemerisUpstreamTimeout",
]
