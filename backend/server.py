"""
Solar System Simulation Backend
================================

FastAPI server providing high-fidelity N-body gravitational simulation
over WebSocket, with on-demand Kuiper belt local dynamics.

Run:
    cd backend && pip install -r requirements.txt
    uvicorn server:app --host 127.0.0.1 --port 8042 --reload --no-proxy-headers

Protocol (WebSocket /ws/sim):
    Client → Server:
        {"type": "set_time_scale", "days_per_sec": 10}
        {"type": "pause"}
        {"type": "resume"}
        {"type": "set_julian_date", "jd": 2460000.5, "jd_time_scale": "TDB"}
        {"type": "activate_kuiper", "center": [42, 0, 0], "spread": 5}
        {"type": "deactivate_kuiper"}
        {"type": "get_orbital_elements", "body_id": "earth"}

    Server → Client:
        {"type": "state_update", "engine": "rebound", "jd": ..., "bodies": {...}}
        {"type": "state_update", ..., "kuiper": [[x,y,z], ...]}
        {"type": "orbital_elements", "body_id": "earth", "elements": {...}}
        {"type": "error", "message": "..."}
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import math
import queue
import os
import threading
import time
from collections import Counter, OrderedDict, deque
from collections.abc import Mapping, MutableMapping
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from pathlib import Path
from typing import Annotated, Any, Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictBool, StrictStr, field_validator
from starlette.responses import JSONResponse

from benchmark import (
    MAX_REFERENCE_SCENARIOS,
    benchmark_against_references,
    generate_accuracy_report,
)
from data.bodies import ALL_BODIES
from data.nearby_systems import (
    CATALOG_NAME,
    CATALOG_PATH,
    NEARBY_SYSTEMS_SCHEMA_NAME,
    NEARBY_SYSTEMS_SCHEMA_VERSION,
    get_nearby_system,
    load_nearby_systems_catalog,
    nearby_system_aliases,
    query_nearby_systems,
)
from mission import MissionPlannerAgent
from mission.ephemeris_service import (
    EphemerisBudgetExceeded,
    EphemerisCancelled,
    EphemerisError,
    EphemerisProtocolError,
    EphemerisProviderUnavailable,
    EphemerisTargetUnsupported,
    EphemerisUpstreamRateLimited,
    EphemerisUpstreamTimeout,
    HORIZONS_CONCURRENCY_LIMIT,
    HORIZONS_MAX_TIMEOUT_S,
    HORIZONS_PROVIDER_OUTAGE_COOLDOWN_S,
    HORIZONS_PROVIDER_OUTAGE_MAX_COOLDOWN_S,
    HORIZONS_SUCCESS_CACHE_MAXSIZE,
    TRAJECTORY_STATE_CONTRACT,
)
from sim.base import SimulationEngine
from sim.contracts import attach_runtime_telemetry, normalize_state_update
from sim.kuiper import KuiperActivationError, KuiperBeltEngine
from sim.rebound_nbody import REBOUNDEngine
from sim.solar_physics import ObservedSolarInputUnavailable, SolarCoronaPhysicsModel
from sim.solar_realtime_data import SolarRealtimeDataProvider
from sim.solar_time import current_jd_tdb
from trajectory import (
    DEFAULT_ASSIST_POOL,
    TRAJECTORY_OBJECTIVES,
    plan_interplanetary_route,
    run_porkchop_scan,
    solve_direct_lambert,
)
from trajectory.budget import (
    HARD_MAX_UNIQUE_EPHEMERIS_STATES,
    PlanningBudgetExceeded,
    PlanningCancelled,
    PlanningContext,
    PlanningDeadlineExceeded,
    PlanningLimits,
)
from trajectory.contracts import (
    HARD_MAX_ASSIST_POOL_SIZE,
    HARD_MAX_ROUTE_TOPOLOGIES,
    TrajectoryRequestRejected,
    ValidatedTrajectoryPlan,
    eligible_assist_body_ids,
    eligible_endpoint_body_ids,
    estimate_route_count,
    validate_plan_request,
)
from trajectory.lambert import (
    MIN_PORKCHOP_DEPARTURE_STEP_DAYS,
    MIN_PORKCHOP_TOF_STEP_DAYS,
)
from trajectory.mga import (
    GLOBAL_BEAM_WIDTH,
    MAX_COMPLETED,
    MAX_PARTIALS_PER_ROUTE_PREFIX,
    MAX_RETURNED_ALTERNATIVES,
)

# TudatPy is optional (conda-only package)
try:
    from sim.tudatpy_hooks import TudatPyEngine
    _TUDATPY_AVAILABLE = True
except Exception:
    TudatPyEngine = None  # type: ignore
    _TUDATPY_AVAILABLE = False

app = FastAPI(
    title="Solar System Simulation Backend",
    description="N-body gravitational simulation server for the Solar System Mission Lab.",
    version="0.1.0",
)


class _RequestBodyLimitMiddleware:
    """Reject selected JSON request bodies before FastAPI parses them.

    Checking only ``Content-Length`` is insufficient for chunked requests. For
    the small scientific-control payloads in scope, buffering at most the hard
    ceiling before handing the messages to FastAPI gives deterministic ingress
    memory and validation cost while preserving the underlying receive channel
    for later disconnect detection.
    """

    def __init__(
        self,
        app,
        *,
        max_body_bytes: int,
        paths: set[str],
        max_body_messages: int = 1_024,
    ) -> None:
        self.app = app
        self.max_body_bytes = int(max_body_bytes)
        self.max_body_messages = int(max_body_messages)
        self.paths = frozenset(paths)

    def _error_response(self, code: str, message: str, *, observed: int | None = None) -> JSONResponse:
        context: dict[str, Any] = {"maximumBodyBytes": self.max_body_bytes}
        if observed is not None:
            context["observedBodyBytes"] = int(observed)
        return JSONResponse(
            status_code=(
                413
                if code in {
                    "trajectory_request_body_too_large",
                    "trajectory_request_body_too_fragmented",
                }
                else 400
            ),
            content={
                "detail": {
                    "code": code,
                    "message": message,
                    "retryable": False,
                    "context": context,
                }
            },
        )

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope.get("type") != "http"
            or str(scope.get("method", "")).upper() != "POST"
            or str(scope.get("path", "")) not in self.paths
        ):
            await self.app(scope, receive, send)
            return

        content_length: int | None = None
        for raw_name, raw_value in scope.get("headers", []):
            if raw_name.lower() != b"content-length":
                continue
            try:
                content_length = int(raw_value.decode("ascii"))
            except (UnicodeDecodeError, ValueError):
                response = self._error_response(
                    "trajectory_invalid_content_length",
                    "Request Content-Length must be a non-negative integer.",
                )
                await response(scope, receive, send)
                return
            if content_length < 0:
                response = self._error_response(
                    "trajectory_invalid_content_length",
                    "Request Content-Length must be a non-negative integer.",
                )
                await response(scope, receive, send)
                return
            break

        if content_length is not None and content_length > self.max_body_bytes:
            response = self._error_response(
                "trajectory_request_body_too_large",
                "Trajectory request body exceeds the configured byte limit.",
                observed=content_length,
            )
            await response(scope, receive, send)
            return

        buffered_body = bytearray()
        observed = 0
        message_count = 0
        disconnected = False
        while True:
            message = await receive()
            message_count += 1
            if message_count > self.max_body_messages:
                response = self._error_response(
                    "trajectory_request_body_too_fragmented",
                    "Trajectory request body contains too many streaming fragments.",
                    observed=observed,
                )
                await response(scope, receive, send)
                return
            if message.get("type") == "http.disconnect":
                disconnected = True
                break
            if message.get("type") != "http.request":
                continue
            body = message.get("body", b"")
            body_bytes = bytes(body) if isinstance(body, (bytes, bytearray)) else b""
            observed += len(body_bytes)
            if observed > self.max_body_bytes:
                response = self._error_response(
                    "trajectory_request_body_too_large",
                    "Trajectory request body exceeds the configured byte limit.",
                    observed=observed,
                )
                await response(scope, receive, send)
                return
            buffered_body.extend(body_bytes)
            if not message.get("more_body", False):
                break

        if disconnected:
            buffered_messages: list[dict[str, Any]] = []
            if buffered_body:
                buffered_messages.append(
                    {
                        "type": "http.request",
                        "body": bytes(buffered_body),
                        "more_body": True,
                    }
                )
            buffered_messages.append({"type": "http.disconnect"})
        else:
            buffered_messages = [
                {
                    "type": "http.request",
                    "body": bytes(buffered_body),
                    "more_body": False,
                }
            ]

        buffered_index = 0

        async def replay_receive():
            nonlocal buffered_index
            if buffered_index < len(buffered_messages):
                message = buffered_messages[buffered_index]
                buffered_index += 1
                return message
            return await receive()

        await self.app(scope, replay_receive, send)


class _TrajectoryRateLimitMiddleware:
    """Bound trajectory ingress per peer before reading or parsing its body."""

    def __init__(
        self,
        app,
        *,
        max_requests: int,
        window_seconds: float,
        paths: set[str],
        max_identities: int = 4_096,
        clock=time.monotonic,
    ) -> None:
        self.app = app
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1.0, float(window_seconds))
        self.max_identities = max(1, int(max_identities))
        self.paths = frozenset(paths)
        self.clock = clock
        self._requests: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()

    @staticmethod
    def _identity(scope: dict[str, Any]) -> str:
        client = scope.get("client")
        if isinstance(client, (tuple, list)) and client:
            host = str(client[0]).strip()
            if host:
                return host[:255]
        return "anonymous"

    def _retry_after(self, identity: str) -> int | None:
        now = float(self.clock())
        cutoff = now - self.window_seconds
        with self._lock:
            queue = self._requests.get(identity)
            if queue is None:
                if len(self._requests) >= self.max_identities:
                    # Bound memory even under high-cardinality peer churn. Peer
                    # identity comes from the ASGI transport, not spoofable
                    # forwarding headers.
                    self._requests.popitem(last=False)
                queue = deque()
                self._requests[identity] = queue
            else:
                self._requests.move_to_end(identity)

            while queue and queue[0] <= cutoff:
                queue.popleft()
            if len(queue) >= self.max_requests:
                return max(1, int(math.ceil(queue[0] + self.window_seconds - now)))
            queue.append(now)
        return None

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope.get("type") != "http"
            or str(scope.get("method", "")).upper() not in {"GET", "POST"}
            or str(scope.get("path", "")) not in self.paths
        ):
            await self.app(scope, receive, send)
            return

        retry_after = self._retry_after(self._identity(scope))
        if retry_after is not None:
            response = JSONResponse(
                status_code=429,
                headers={"Retry-After": str(retry_after)},
                content={
                    "detail": {
                        "code": "trajectory_rate_limit_exceeded",
                        "message": "Trajectory request rate limit exceeded; retry later.",
                        "retryable": True,
                        "context": {
                            "maximumRequests": self.max_requests,
                            "windowSeconds": self.window_seconds,
                        },
                    }
                },
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


_DEFAULT_SOLAR_CORS_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
SOLAR_FORWARDED_FOR_MAX_HOPS = 16
SOLAR_FORWARDED_FOR_MAX_BYTES = 2_048
SOLAR_API_KEY_MAX_COUNT = 64
SOLAR_API_KEY_MAX_BYTES = 256
SOLAR_TRUSTED_PROXY_MAX_CIDRS = 32
SOLAR_TRUSTED_PROXY_CONFIG_MAX_BYTES = 4_096
SOLAR_CORS_MAX_ORIGINS = 32
SOLAR_CORS_ORIGIN_MAX_BYTES = 512


@dataclass(frozen=True, slots=True)
class SolarSecurityConfig:
    """Validated solar-endpoint trust boundary.

    Raw credentials are deliberately reduced to one-way digests while the
    environment is loaded. The resulting object is therefore safe to retain
    for process lifetime and to include in diagnostic representations.
    """

    profile: str
    api_key_hashes: frozenset[str]
    trusted_proxy_networks: tuple[
        ipaddress.IPv4Network | ipaddress.IPv6Network,
        ...,
    ]
    cors_allowed_origins: tuple[str, ...]

    @property
    def authentication_required(self) -> bool:
        return self.profile == "network" or bool(self.api_key_hashes)

    @property
    def default_bind_host(self) -> str:
        return "127.0.0.1" if self.profile == "local" else "0.0.0.0"


def _api_key_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _load_solar_security_config(
    environ: Mapping[str, str] | None = None,
) -> SolarSecurityConfig:
    """Load the explicit local/network security profile or fail startup.

    The local default keeps the historical single-machine workflow. A network
    deployment is never permitted to silently fall back to unauthenticated
    solar endpoints.
    """

    source = os.environ if environ is None else environ
    profile = source.get("SOLAR_SECURITY_PROFILE", "local").strip().lower()
    if profile not in {"local", "network"}:
        raise RuntimeError(
            "SOLAR_SECURITY_PROFILE must be either 'local' or 'network'."
        )

    raw_api_keys = source.get("SOLAR_PHYSICS_API_KEYS", "")
    if len(raw_api_keys.encode("utf-8")) > (
        SOLAR_API_KEY_MAX_COUNT * (SOLAR_API_KEY_MAX_BYTES + 1)
    ):
        raise RuntimeError("SOLAR_PHYSICS_API_KEYS exceeds its byte limit.")
    raw_keys = tuple(
        token.strip()
        for token in raw_api_keys.split(",")
        if token.strip()
    )
    if len(raw_keys) > SOLAR_API_KEY_MAX_COUNT:
        raise RuntimeError(
            f"SOLAR_PHYSICS_API_KEYS cannot contain more than "
            f"{SOLAR_API_KEY_MAX_COUNT} keys."
        )
    if any(len(token.encode("utf-8")) > SOLAR_API_KEY_MAX_BYTES for token in raw_keys):
        raise RuntimeError(
            f"Each SOLAR_PHYSICS_API_KEYS token is limited to "
            f"{SOLAR_API_KEY_MAX_BYTES} bytes."
        )
    if any(
        not token.isascii()
        or any(not 33 <= ord(character) <= 126 for character in token)
        for token in raw_keys
    ):
        raise RuntimeError(
            "SOLAR_PHYSICS_API_KEYS tokens must contain printable ASCII "
            "characters without whitespace."
        )
    if profile == "network" and not raw_keys:
        raise RuntimeError(
            "SOLAR_PHYSICS_API_KEYS must contain at least one key when "
            "SOLAR_SECURITY_PROFILE=network."
        )
    api_key_hashes = frozenset(_api_key_digest(token) for token in raw_keys)

    raw_proxy_cidrs = source.get("SOLAR_TRUSTED_PROXY_CIDRS", "")
    if len(raw_proxy_cidrs.encode("utf-8")) > SOLAR_TRUSTED_PROXY_CONFIG_MAX_BYTES:
        raise RuntimeError("SOLAR_TRUSTED_PROXY_CIDRS exceeds its byte limit.")
    proxy_cidrs = tuple(
        cidr.strip() for cidr in raw_proxy_cidrs.split(",") if cidr.strip()
    )
    if len(proxy_cidrs) > SOLAR_TRUSTED_PROXY_MAX_CIDRS:
        raise RuntimeError(
            f"SOLAR_TRUSTED_PROXY_CIDRS cannot contain more than "
            f"{SOLAR_TRUSTED_PROXY_MAX_CIDRS} networks."
        )
    trusted_proxy_networks: list[
        ipaddress.IPv4Network | ipaddress.IPv6Network
    ] = []
    for cidr in proxy_cidrs:
        try:
            trusted_proxy_networks.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError as exc:
            raise RuntimeError(
                f"SOLAR_TRUSTED_PROXY_CIDRS contains invalid CIDR {cidr!r}."
            ) from exc

    cors_raw = source.get("SOLAR_CORS_ALLOWED_ORIGINS")
    if cors_raw is None:
        cors_origins = (
            _DEFAULT_SOLAR_CORS_ALLOWED_ORIGINS if profile == "local" else ()
        )
    else:
        cors_origins = tuple(
            origin.strip() for origin in cors_raw.split(",") if origin.strip()
        )
        if not cors_origins:
            raise RuntimeError("SOLAR_CORS_ALLOWED_ORIGINS cannot be empty.")
    if len(cors_origins) > SOLAR_CORS_MAX_ORIGINS:
        raise RuntimeError(
            f"SOLAR_CORS_ALLOWED_ORIGINS cannot contain more than "
            f"{SOLAR_CORS_MAX_ORIGINS} origins."
        )
    if any(
        len(origin.encode("utf-8")) > SOLAR_CORS_ORIGIN_MAX_BYTES
        for origin in cors_origins
    ):
        raise RuntimeError("SOLAR_CORS_ALLOWED_ORIGINS contains an oversized origin.")
    if any(origin == "*" for origin in cors_origins):
        raise RuntimeError(
            "SOLAR_CORS_ALLOWED_ORIGINS cannot contain the wildcard origin '*'."
        )
    for origin in cors_origins:
        try:
            parsed = urlsplit(origin)
            parsed_port = parsed.port
        except ValueError as exc:
            raise RuntimeError(
                "SOLAR_CORS_ALLOWED_ORIGINS contains an invalid origin."
            ) from exc
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.hostname is None
            or parsed.username is not None
            or parsed.password is not None
            or (
                parsed_port is not None
                and not 1 <= parsed_port <= 65_535
            )
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise RuntimeError(
                "SOLAR_CORS_ALLOWED_ORIGINS entries must be exact HTTP(S) origins."
            )

    return SolarSecurityConfig(
        profile=profile,
        api_key_hashes=api_key_hashes,
        trusted_proxy_networks=tuple(trusted_proxy_networks),
        cors_allowed_origins=tuple(cors_origins),
    )


SOLAR_SECURITY_CONFIG = _load_solar_security_config()
SOLAR_CORS_ALLOWED_ORIGINS = list(SOLAR_SECURITY_CONFIG.cors_allowed_origins)


def _load_env_csv(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return list(default)
    values = [item.strip() for item in raw.split(",") if item.strip()]
    if "*" in values:
        return list(default)
    return values if values else list(default)


def _load_env_int(name: str, default: int, *, min_value: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(min_value, value)


def _load_env_float(name: str, default: float, *, min_value: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    return max(min_value, value)


def _load_bounded_env_int(
    name: str,
    default: int,
    *,
    min_value: int,
    max_value: int,
) -> int:
    """Load an integer knob without permitting safety ceilings to be disabled."""
    return min(max_value, _load_env_int(name, default, min_value=min_value))


def _load_bounded_env_float(
    name: str,
    default: float,
    *,
    min_value: float,
    max_value: float,
) -> float:
    """Load a floating-point knob within a compile-time safety envelope."""
    return min(max_value, _load_env_float(name, default, min_value=min_value))


SUPPORTED_INTEGRATORS = ("ias15", "whfast", "mercurius")
DEFAULT_INTEGRATOR = "ias15"
DEFAULT_ENGINE = "rebound"
WS_PROTOCOL_VERSION = 1
MAX_COMMAND_QUEUE = 1_024
MAX_RESPONSE_QUEUE = 1_024
MAX_COMMANDS_PER_FRAME = 128
WS_SIM_CONNECTION_LIMIT = _load_env_int("WS_SIM_CONNECTION_LIMIT", 4, min_value=1)
WS_SIM_ALLOWED_ORIGINS = frozenset(
    _load_env_csv("WS_SIM_ALLOWED_ORIGINS", SOLAR_CORS_ALLOWED_ORIGINS)
)
EPHEMERIS_PROVIDERS = ("auto", "spice", "horizons", "kepler")
KNOWN_BODY_IDS = {body["id"] for body in ALL_BODIES}
PROJECT_ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_REPORTS_DIR = (PROJECT_ROOT / "my-notes").resolve()
NEARBY_SYSTEMS_SCHEMA = {
    "name": NEARBY_SYSTEMS_SCHEMA_NAME,
    "version": NEARBY_SYSTEMS_SCHEMA_VERSION,
}
SOLAR_PHYSICS_MODEL = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
SOLAR_REALTIME_DATA = SolarRealtimeDataProvider(timeout_s=3.8, cache_ttl_s=120.0)


SOLAR_PHYSICS_MAX_FEATURES = _load_env_int("SOLAR_PHYSICS_MAX_FEATURES", 256, min_value=64)
SOLAR_PHYSICS_MIN_FEATURES = 8
SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW = _load_bounded_env_int(
    "SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW",
    36,
    min_value=2,
    max_value=120,
)
SOLAR_PHYSICS_RATE_WINDOW_SECONDS = _load_bounded_env_float(
    "SOLAR_PHYSICS_RATE_WINDOW_SECONDS",
    60.0,
    min_value=1.0,
    max_value=300.0,
)
SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS = _load_env_float(
    "SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS",
    12.0,
    min_value=0.5,
)
SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT = _load_bounded_env_int(
    "SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT",
    2,
    min_value=1,
    max_value=2,
)
SOLAR_RATE_LIMIT_MAX_IDENTITIES = _load_bounded_env_int(
    "SOLAR_RATE_LIMIT_MAX_IDENTITIES",
    1_024,
    min_value=16,
    max_value=4_096,
)

SOLAR_REALTIME_RATE_LIMIT_PER_WINDOW = _load_bounded_env_int(
    "SOLAR_REALTIME_RATE_LIMIT_PER_WINDOW",
    36,
    min_value=2,
    max_value=120,
)
SOLAR_REALTIME_RATE_WINDOW_SECONDS = _load_bounded_env_float(
    "SOLAR_REALTIME_RATE_WINDOW_SECONDS",
    60.0,
    min_value=1.0,
    max_value=300.0,
)

SOLAR_AIA_TILE_RATE_LIMIT_PER_WINDOW = _load_bounded_env_int(
    "SOLAR_AIA_TILE_RATE_LIMIT_PER_WINDOW",
    60,
    min_value=2,
    max_value=240,
)
SOLAR_AIA_TILE_RATE_WINDOW_SECONDS = _load_bounded_env_float(
    "SOLAR_AIA_TILE_RATE_WINDOW_SECONDS",
    60.0,
    min_value=1.0,
    max_value=300.0,
)
SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT = _load_env_int(
    "SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT",
    2,
    min_value=1,
)
SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS = _load_env_float(
    "SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS",
    4.0,
    min_value=0.5,
)
TRAJECTORY_REQUEST_MAX_BODY_BYTES = _load_bounded_env_int(
    "TRAJECTORY_REQUEST_MAX_BODY_BYTES",
    32 * 1_024,
    min_value=4 * 1_024,
    max_value=32 * 1_024,
)
TRAJECTORY_RATE_LIMIT_PER_WINDOW = _load_bounded_env_int(
    "TRAJECTORY_RATE_LIMIT_PER_WINDOW",
    60,
    min_value=1,
    max_value=60,
)
TRAJECTORY_RATE_LIMIT_WINDOW_SECONDS = _load_bounded_env_float(
    "TRAJECTORY_RATE_LIMIT_WINDOW_SECONDS",
    60.0,
    min_value=60.0,
    max_value=300.0,
)
TRAJECTORY_RATE_LIMIT_MAX_IDENTITIES = _load_bounded_env_int(
    "TRAJECTORY_RATE_LIMIT_MAX_IDENTITIES",
    4_096,
    min_value=128,
    max_value=4_096,
)
TRAJECTORY_PLAN_MAX_ASSIST_POOL_SIZE = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_ASSIST_POOL_SIZE",
    HARD_MAX_ASSIST_POOL_SIZE,
    min_value=1,
    max_value=HARD_MAX_ASSIST_POOL_SIZE,
)
TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES",
    HARD_MAX_ROUTE_TOPOLOGIES,
    min_value=1,
    max_value=HARD_MAX_ROUTE_TOPOLOGIES,
)
TRAJECTORY_PLAN_MAX_ROUTE_PREFIXES = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_ROUTE_PREFIXES",
    256,
    min_value=1,
    max_value=256,
)
TRAJECTORY_PLAN_MAX_LEG_REQUESTS = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_LEG_REQUESTS",
    2_400,
    min_value=1,
    max_value=2_400,
)
TRAJECTORY_PLAN_MAX_LEG_EVALUATIONS = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_LEG_EVALUATIONS",
    2_000,
    min_value=1,
    max_value=2_000,
)
TRAJECTORY_PLAN_MAX_EPHEMERIS_QUERIES = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_EPHEMERIS_QUERIES",
    4_000,
    min_value=2,
    max_value=4_000,
)
TRAJECTORY_PLAN_MAX_UNIQUE_EPHEMERIS_STATES = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_UNIQUE_EPHEMERIS_STATES",
    2_000,
    min_value=2,
    max_value=2_000,
)
TRAJECTORY_PLAN_MAX_REMOTE_EPHEMERIS_STATES = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_REMOTE_EPHEMERIS_STATES",
    128,
    min_value=2,
    max_value=128,
)
TRAJECTORY_PLAN_MAX_EXTERNAL_REQUESTS = _load_bounded_env_int(
    "TRAJECTORY_PLAN_MAX_EXTERNAL_REQUESTS",
    16,
    min_value=1,
    max_value=16,
)
TRAJECTORY_PLAN_INTERNAL_DEADLINE_SECONDS = _load_bounded_env_float(
    "TRAJECTORY_PLAN_INTERNAL_DEADLINE_SECONDS",
    7.0,
    min_value=0.25,
    max_value=7.0,
)
TRAJECTORY_PLAN_COMPUTE_TIMEOUT_SECONDS = _load_bounded_env_float(
    "TRAJECTORY_PLAN_COMPUTE_TIMEOUT_SECONDS",
    8.0,
    min_value=0.5,
    max_value=8.0,
)
TRAJECTORY_PLAN_INTERNAL_DEADLINE_SECONDS = min(
    TRAJECTORY_PLAN_INTERNAL_DEADLINE_SECONDS,
    max(0.1, TRAJECTORY_PLAN_COMPUTE_TIMEOUT_SECONDS - 0.25),
)
TRAJECTORY_PLAN_CONCURRENT_REQUEST_LIMIT = _load_bounded_env_int(
    "TRAJECTORY_PLAN_CONCURRENT_REQUEST_LIMIT",
    1,
    min_value=1,
    max_value=1,
)
TRAJECTORY_LAMBERT_INTERNAL_DEADLINE_SECONDS = _load_bounded_env_float(
    "TRAJECTORY_LAMBERT_INTERNAL_DEADLINE_SECONDS",
    5.0,
    min_value=0.25,
    max_value=5.0,
)
TRAJECTORY_LAMBERT_COMPUTE_TIMEOUT_SECONDS = _load_bounded_env_float(
    "TRAJECTORY_LAMBERT_COMPUTE_TIMEOUT_SECONDS",
    6.0,
    min_value=0.5,
    max_value=6.0,
)
TRAJECTORY_LAMBERT_INTERNAL_DEADLINE_SECONDS = min(
    TRAJECTORY_LAMBERT_INTERNAL_DEADLINE_SECONDS,
    max(0.1, TRAJECTORY_LAMBERT_COMPUTE_TIMEOUT_SECONDS - 0.25),
)
TRAJECTORY_LAMBERT_CONCURRENT_REQUEST_LIMIT = _load_bounded_env_int(
    "TRAJECTORY_LAMBERT_CONCURRENT_REQUEST_LIMIT",
    2,
    min_value=1,
    max_value=2,
)
# Remote ephemerides are safe for a direct two-state Lambert request. Search
# endpoints stay disabled until bounded finalist batching is implemented.
TRAJECTORY_HORIZONS_SEARCH_ENABLED = False
TRAJECTORY_PLAN_MIN_LEG_TOF_DAYS = 45.0
TRAJECTORY_PLAN_MAX_LEG_TOF_DAYS = 2_000.0
TRAJECTORY_PLAN_MAX_ASSIST_TOF_SEEDS_PER_EXTENSION = 8
TRAJECTORY_PLAN_MAX_DIRECT_TOF_SEEDS = 15
TRAJECTORY_LAMBERT_MAX_REVOLUTIONS = 0
TRAJECTORY_PORKCHOP_MAX_GRID_POINTS = _load_bounded_env_int(
    "TRAJECTORY_PORKCHOP_MAX_GRID_POINTS",
    2_000,
    min_value=100,
    max_value=2_000,
)
TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS = _load_bounded_env_float(
    "TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS",
    3_650.0,
    min_value=1.0,
    max_value=3_650.0,
)
TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS = _load_bounded_env_float(
    "TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS",
    3_650.0,
    min_value=1.0,
    max_value=3_650.0,
)
TRAJECTORY_PORKCHOP_MIN_DEPARTURE_STEP_DAYS = _load_bounded_env_float(
    "TRAJECTORY_PORKCHOP_MIN_DEPARTURE_STEP_DAYS",
    MIN_PORKCHOP_DEPARTURE_STEP_DAYS,
    min_value=MIN_PORKCHOP_DEPARTURE_STEP_DAYS,
    max_value=TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS,
)
TRAJECTORY_PORKCHOP_MIN_TOF_STEP_DAYS = _load_bounded_env_float(
    "TRAJECTORY_PORKCHOP_MIN_TOF_STEP_DAYS",
    MIN_PORKCHOP_TOF_STEP_DAYS,
    min_value=MIN_PORKCHOP_TOF_STEP_DAYS,
    max_value=TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS,
)
TRAJECTORY_PORKCHOP_COMPUTE_TIMEOUT_SECONDS = _load_bounded_env_float(
    "TRAJECTORY_PORKCHOP_COMPUTE_TIMEOUT_SECONDS",
    8.0,
    min_value=0.5,
    max_value=8.0,
)
TRAJECTORY_PORKCHOP_INTERNAL_DEADLINE_SECONDS = min(
    7.0,
    max(0.1, TRAJECTORY_PORKCHOP_COMPUTE_TIMEOUT_SECONDS - 0.25),
)
TRAJECTORY_PORKCHOP_CONCURRENT_REQUEST_LIMIT = _load_bounded_env_int(
    "TRAJECTORY_PORKCHOP_CONCURRENT_REQUEST_LIMIT",
    2,
    min_value=1,
    max_value=2,
)
MISSION_PLAN_MAX_RISK_SAMPLES = _load_bounded_env_int(
    "MISSION_PLAN_MAX_RISK_SAMPLES",
    5_000,
    min_value=50,
    max_value=5_000,
)
MISSION_PLAN_MAX_VEHICLE_STAGES = _load_bounded_env_int(
    "MISSION_PLAN_MAX_VEHICLE_STAGES",
    12,
    min_value=1,
    max_value=12,
)
MISSION_PLAN_MAX_ASSIST_POOL_SIZE = _load_bounded_env_int(
    "MISSION_PLAN_MAX_ASSIST_POOL_SIZE",
    HARD_MAX_ASSIST_POOL_SIZE,
    min_value=1,
    max_value=HARD_MAX_ASSIST_POOL_SIZE,
)
MISSION_PLAN_MAX_PAYLOAD_MASS_KG = _load_bounded_env_float(
    "MISSION_PLAN_MAX_PAYLOAD_MASS_KG",
    5_000_000.0,
    min_value=1.0,
    max_value=5_000_000.0,
)
MISSION_PLAN_COMPUTE_TIMEOUT_SECONDS = _load_bounded_env_float(
    "MISSION_PLAN_COMPUTE_TIMEOUT_SECONDS",
    12.0,
    min_value=0.5,
    max_value=12.0,
)
MISSION_PLAN_INTERNAL_DEADLINE_SECONDS = min(
    11.0,
    max(0.1, MISSION_PLAN_COMPUTE_TIMEOUT_SECONDS - 0.25),
)
MISSION_PLAN_CONCURRENT_REQUEST_LIMIT = _load_bounded_env_int(
    "MISSION_PLAN_CONCURRENT_REQUEST_LIMIT",
    1,
    min_value=1,
    max_value=1,
)
BENCHMARK_COMPUTE_TIMEOUT_SECONDS = _load_bounded_env_float(
    "BENCHMARK_COMPUTE_TIMEOUT_SECONDS",
    9.0,
    min_value=0.5,
    max_value=10.0,
)
BENCHMARK_INTERNAL_DEADLINE_SECONDS = min(
    8.0,
    max(0.1, BENCHMARK_COMPUTE_TIMEOUT_SECONDS - 0.25),
)
BENCHMARK_CONCURRENT_REQUEST_LIMIT = _load_bounded_env_int(
    "BENCHMARK_CONCURRENT_REQUEST_LIMIT",
    1,
    min_value=1,
    max_value=1,
)
HEAVY_COMPUTE_THREAD_LIMIT = _load_bounded_env_int(
    "HEAVY_COMPUTE_THREAD_LIMIT",
    2,
    min_value=1,
    max_value=2,
)


def _configured_default_assist_pool(
    *,
    max_pool_size: int,
    max_route_topologies: int,
) -> tuple[str, ...]:
    """Keep implicit defaults valid when operators lower safety ceilings."""

    candidates = tuple(DEFAULT_ASSIST_POOL[: max(0, int(max_pool_size))])
    while (
        candidates
        and estimate_route_count(len(candidates), 3) > max_route_topologies
    ):
        candidates = candidates[:-1]
    return candidates


TRAJECTORY_CONFIGURED_DEFAULT_ASSIST_POOL = _configured_default_assist_pool(
    max_pool_size=TRAJECTORY_PLAN_MAX_ASSIST_POOL_SIZE,
    max_route_topologies=TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
)
MISSION_CONFIGURED_DEFAULT_ASSIST_POOL = _configured_default_assist_pool(
    max_pool_size=MISSION_PLAN_MAX_ASSIST_POOL_SIZE,
    max_route_topologies=TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
)

TRAJECTORY_INGRESS_PATHS = {
    "/trajectory/plan",
    "/trajectory/lambert",
    "/trajectory/porkchop",
    "/mission/plan",
    "/benchmark/accuracy",
    "/benchmark/accuracy/report",
}


@app.exception_handler(RequestValidationError)
async def _bounded_request_validation_error(
    request: Request,
    exc: RequestValidationError,
):
    """Keep trajectory-family schema failures on the public error contract."""

    if request.url.path not in TRAJECTORY_INGRESS_PATHS:
        return await request_validation_exception_handler(request, exc)
    errors = [
        {
            "type": str(error.get("type", "validation_error")),
            "location": [str(part) for part in error.get("loc", ())],
            "message": str(error.get("msg", "Invalid request value")),
        }
        for error in exc.errors()[:64]
    ]
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": "trajectory_request_validation_error",
                "message": "The request does not match the endpoint schema.",
                "retryable": False,
                "context": {"errors": errors},
            }
        },
    )


app.add_middleware(
    _RequestBodyLimitMiddleware,
    max_body_bytes=TRAJECTORY_REQUEST_MAX_BODY_BYTES,
    paths=TRAJECTORY_INGRESS_PATHS,
)
app.add_middleware(
    _TrajectoryRateLimitMiddleware,
    max_requests=TRAJECTORY_RATE_LIMIT_PER_WINDOW,
    window_seconds=TRAJECTORY_RATE_LIMIT_WINDOW_SECONDS,
    max_identities=TRAJECTORY_RATE_LIMIT_MAX_IDENTITIES,
    paths=TRAJECTORY_INGRESS_PATHS,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=SOLAR_CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)

_solar_physics_rate_locks: OrderedDict[str, deque[float]] = OrderedDict()
_solar_physics_rate_lock = threading.Lock()
_solar_realtime_rate_locks: OrderedDict[str, deque[float]] = OrderedDict()
_solar_realtime_rate_lock = threading.Lock()
_solar_physics_concurrent_guard = threading.BoundedSemaphore(SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT)
_solar_aia_tile_rate_locks: OrderedDict[str, deque[float]] = OrderedDict()
_solar_aia_tile_rate_lock = threading.Lock()
_solar_aia_tile_concurrent_guard = threading.BoundedSemaphore(SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT)
_trajectory_plan_concurrent_guard = threading.BoundedSemaphore(TRAJECTORY_PLAN_CONCURRENT_REQUEST_LIMIT)
_trajectory_lambert_concurrent_guard = threading.BoundedSemaphore(TRAJECTORY_LAMBERT_CONCURRENT_REQUEST_LIMIT)
_trajectory_porkchop_concurrent_guard = threading.BoundedSemaphore(TRAJECTORY_PORKCHOP_CONCURRENT_REQUEST_LIMIT)
_mission_plan_concurrent_guard = threading.BoundedSemaphore(MISSION_PLAN_CONCURRENT_REQUEST_LIMIT)
_benchmark_concurrent_guard = threading.BoundedSemaphore(BENCHMARK_CONCURRENT_REQUEST_LIMIT)
_ws_sim_connection_guard = threading.BoundedSemaphore(WS_SIM_CONNECTION_LIMIT)
_ws_sim_connection_lock = threading.Lock()
_ws_sim_active_connections = 0
# Heavy endpoint work never enters Starlette/AnyIO's shared request pool. This
# preserves health/control-plane capacity even while a scientific calculation
# is at its budget. One shared pool also bounds aggregate CPU work across solar,
# trajectory, and mission endpoints instead of enforcing independent limits
# that can add up to host-wide oversubscription.
_heavy_compute_executor = ThreadPoolExecutor(
    max_workers=HEAVY_COMPUTE_THREAD_LIMIT,
    thread_name_prefix="solar-sim-compute",
)
_aia_tile_executor = ThreadPoolExecutor(
    max_workers=SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT,
    thread_name_prefix="solar-aia-io",
)


def _bounded_unique_request_header(
    request: Request,
    name: bytes,
    *,
    max_bytes: int,
) -> tuple[bool, str | None]:
    """Read one ASCII header without accepting duplicate-field ambiguity."""

    value: bytes | None = None
    aggregate_bytes = 0
    matches = 0
    for raw_name, raw_value in request.scope.get("headers", ()):
        if bytes(raw_name).lower() != name:
            continue
        matches += 1
        aggregate_bytes += len(raw_value)
        if matches > 1 or aggregate_bytes > max_bytes:
            return False, None
        value = bytes(raw_value)
    if value is None:
        return True, None
    try:
        return True, value.decode("ascii")
    except UnicodeDecodeError:
        return False, None


def _extract_solar_api_key(request: Request) -> str | None:
    api_key_valid, header_key = _bounded_unique_request_header(
        request,
        b"x-api-key",
        max_bytes=SOLAR_API_KEY_MAX_BYTES,
    )
    auth_valid, auth = _bounded_unique_request_header(
        request,
        b"authorization",
        max_bytes=SOLAR_API_KEY_MAX_BYTES + len("Bearer "),
    )
    if not api_key_valid or not auth_valid:
        return None

    api_key_token = header_key.strip() if header_key else ""
    bearer_token = ""
    if auth and auth.lower().startswith("bearer "):
        bearer_token = auth[7:].strip()
    if api_key_token and bearer_token:
        return None
    token = api_key_token or bearer_token
    if token and len(token.encode("utf-8")) <= SOLAR_API_KEY_MAX_BYTES:
        return token
    return None


def _address_in_trusted_proxy_networks(
    address: ipaddress.IPv4Address | ipaddress.IPv6Address,
    config: SolarSecurityConfig,
) -> bool:
    return any(
        address.version == network.version and address in network
        for network in config.trusted_proxy_networks
    )


def _parse_ip_address(
    raw: str,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(raw.strip())
    except ValueError:
        return None


def _client_identity(
    request: Request,
    *,
    config: SolarSecurityConfig | None = None,
) -> str:
    """Return an authenticated subject or a validated network identity.

    Forwarding headers are considered only when the ASGI peer is itself in an
    explicitly configured trusted-proxy network. A right-to-left walk selects
    the first non-trusted address, preventing intermediary proxy addresses from
    fragmenting the store.
    """

    authenticated_subject = getattr(
        request.state,
        "solar_authenticated_subject",
        None,
    )
    if isinstance(authenticated_subject, str) and authenticated_subject:
        return authenticated_subject

    active_config = SOLAR_SECURITY_CONFIG if config is None else config
    peer_host = (
        request.client.host.strip()
        if request.client and request.client.host
        else "anonymous"
    )
    peer_address = _parse_ip_address(peer_host)
    peer_identity = str(peer_address) if peer_address is not None else peer_host[:255]

    forwarded_header_valid, forwarded_for = _bounded_unique_request_header(
        request,
        b"x-forwarded-for",
        max_bytes=SOLAR_FORWARDED_FOR_MAX_BYTES,
    )
    if (
        not forwarded_header_valid
        or not forwarded_for
        or peer_address is None
        or not _address_in_trusted_proxy_networks(peer_address, active_config)
    ):
        return f"peer:{peer_identity}"

    raw_chain = forwarded_for.split(",")
    if (
        not raw_chain
        or len(raw_chain) > SOLAR_FORWARDED_FOR_MAX_HOPS
        or any(not item.strip() for item in raw_chain)
    ):
        return f"peer:{peer_identity}"
    parsed_chain = [_parse_ip_address(item) for item in raw_chain]
    if any(address is None for address in parsed_chain):
        return f"peer:{peer_identity}"

    complete_chain = [
        *(address for address in parsed_chain if address is not None),
        peer_address,
    ]
    for address in reversed(complete_chain):
        if not _address_in_trusted_proxy_networks(address, active_config):
            return f"peer:{address}"
    return f"peer:{complete_chain[0]}"


def _require_optional_solar_api_key(
    request: Request,
    *,
    config: SolarSecurityConfig | None = None,
) -> str | None:
    active_config = SOLAR_SECURITY_CONFIG if config is None else config
    token = _extract_solar_api_key(request)
    token_digest = _api_key_digest(token) if token is not None else None
    authenticated = token_digest is not None and any(
        hmac.compare_digest(token_digest, configured_digest)
        for configured_digest in active_config.api_key_hashes
    )
    if active_config.authentication_required and not authenticated:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid API key for solar endpoints.",
            headers={"WWW-Authenticate": "X-API-Key"},
        )
    if not authenticated or token_digest is None:
        return None
    subject = f"credential:sha256:{token_digest}"
    request.state.solar_authenticated_subject = subject
    return subject


def _pop_oldest_rate_identity(
    store: MutableMapping[str, deque[float]],
) -> None:
    if not store:
        return
    try:
        store.popitem(last=False)  # type: ignore[call-arg]
    except TypeError:
        del store[next(iter(store))]


def _move_rate_identity_to_end(
    store: MutableMapping[str, deque[float]],
    identity: str,
) -> None:
    move_to_end = getattr(store, "move_to_end", None)
    if callable(move_to_end):
        move_to_end(identity)


def _record_solar_rate_request(
    store: MutableMapping[str, deque[float]],
    *,
    identity: str,
    now: float,
    window_seconds: float,
    max_requests: int,
    max_identities: int,
) -> int | None:
    """Record one request in a bounded TTL/LRU sliding-window store."""

    window = max(1.0, float(window_seconds))
    request_limit = max(1, int(max_requests))
    identity_limit = max(1, int(max_identities))
    cutoff = float(now) - window

    # OrderedDict insertion order is LRU order. Pruning from the cold end
    # amortizes cleanup instead of turning every request into an O(cap) scan.
    while store:
        stored_identity = next(iter(store))
        queue = store[stored_identity]
        while queue and queue[0] <= cutoff:
            queue.popleft()
        if queue:
            break
        del store[stored_identity]

    queue = store.get(identity)
    if queue is None:
        while len(store) >= identity_limit:
            _pop_oldest_rate_identity(store)
        queue = deque()
        store[identity] = queue
    else:
        while queue and queue[0] <= cutoff:
            queue.popleft()
        _move_rate_identity_to_end(store, identity)

    if len(queue) >= request_limit:
        return max(1, int(math.ceil(queue[0] + window - float(now))))
    queue.append(float(now))
    return None


def _enforce_solar_rate_limit(
    request: Request,
    *,
    store: MutableMapping[str, deque[float]],
    lock: threading.Lock,
    window_seconds: float,
    max_requests: int,
    message: str,
) -> None:
    now = time.monotonic()
    identity = _client_identity(request)
    with lock:
        retry_after = _record_solar_rate_request(
            store,
            identity=identity,
            now=now,
            window_seconds=window_seconds,
            max_requests=max_requests,
            max_identities=SOLAR_RATE_LIMIT_MAX_IDENTITIES,
        )
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail=message,
            headers={"Retry-After": str(retry_after)},
        )


def _enforce_solar_request_rate_limit(request: Request) -> None:
    _enforce_solar_rate_limit(
        request,
        store=_solar_physics_rate_locks,
        lock=_solar_physics_rate_lock,
        window_seconds=SOLAR_PHYSICS_RATE_WINDOW_SECONDS,
        max_requests=SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW,
        message="Solar request rate limit exceeded; retry later.",
    )


def _enforce_solar_realtime_rate_limit(request: Request) -> None:
    _enforce_solar_rate_limit(
        request,
        store=_solar_realtime_rate_locks,
        lock=_solar_realtime_rate_lock,
        window_seconds=SOLAR_REALTIME_RATE_WINDOW_SECONDS,
        max_requests=SOLAR_REALTIME_RATE_LIMIT_PER_WINDOW,
        message="Solar realtime request rate limit exceeded; retry later.",
    )


def _enforce_solar_aia_tile_rate_limit(request: Request) -> None:
    _enforce_solar_rate_limit(
        request,
        store=_solar_aia_tile_rate_locks,
        lock=_solar_aia_tile_rate_lock,
        window_seconds=SOLAR_AIA_TILE_RATE_WINDOW_SECONDS,
        max_requests=SOLAR_AIA_TILE_RATE_LIMIT_PER_WINDOW,
        message="Solar AIA tile request rate limit exceeded; retry later.",
    )


def _resolve_jd_tdb_query(
    jd_tdb: str | None,
    jd: str | None,
    *,
    default_to_now: bool,
) -> float | None:
    """Resolve the labelled JDTDB input and its temporary unlabelled alias."""

    def parse(raw_value: str, parameter: str) -> float:
        try:
            parsed = float(raw_value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": f"invalid_{parameter}",
                    "message": f"`{parameter}` must be a finite Julian date in TDB.",
                    "retryable": False,
                },
            ) from exc
        if not math.isfinite(parsed):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": f"invalid_{parameter}",
                    "message": f"`{parameter}` must be a finite Julian date in TDB.",
                    "retryable": False,
                },
            )
        return parsed

    canonical = parse(jd_tdb, "jd_tdb") if jd_tdb is not None else None
    # Deprecated `jd` is interpreted as JDTDB for one compatibility window.
    legacy = parse(jd, "jd") if jd is not None else None
    if canonical is not None and legacy is not None and canonical != legacy:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "conflicting_julian_date_aliases",
                "message": "`jd_tdb` and deprecated `jd` must identify the same JDTDB epoch.",
                "retryable": False,
            },
        )
    resolved = canonical if canonical is not None else legacy
    if resolved is None and default_to_now:
        return current_jd_tdb()
    return resolved


def _observed_solar_input_http_error(
    exc: ObservedSolarInputUnavailable,
) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "code": "solar_observed_input_unavailable",
            "message": "Observed solar forcing is not runtime eligible.",
            "provider": "gong_zqs",
            "product": "zqs",
            "status": exc.reason,
            "reason": exc.reason,
            "retryable": False,
        },
    )


def _build_solar_physics_state(
    epoch_jd: float,
    fidelity_key: str,
    safe_max_features: int,
    forcing_key: str,
    live_data: bool,
    force_data_refresh: bool,
) -> dict[str, Any]:
    if forcing_key == "data_driven":
        raise ObservedSolarInputUnavailable()

    # No observed provider is promoted. Synthetic and hybrid must therefore be
    # deterministic and must never enter a realtime/provider code path.
    wall_epoch_jd_tdb = current_jd_tdb()

    state = SOLAR_PHYSICS_MODEL.sample_state(
        epoch_jd,
        fidelity=fidelity_key,
        max_features=safe_max_features,
        forcing=forcing_key,
        realtime_data=None,
        wall_jd=wall_epoch_jd_tdb,
    )
    state["forcing"] = forcing_key
    state["effective_forcing"] = "synthetic"
    state["live_data_requested"] = bool(live_data)
    state["live_data_enabled"] = False
    forcing_status = {
        "requested": forcing_key,
        "effective": "synthetic",
        "observed_input_status": (
            "not_requested" if forcing_key == "synthetic" else "disabled_unvalidated"
        ),
        "runtime_eligible": False,
    }
    if forcing_key == "hybrid":
        forcing_status["fallback_reason"] = "disabled_unvalidated"
        state["fallback_reason"] = "disabled_unvalidated"
    else:
        state.pop("fallback_reason", None)
    state["forcing_status"] = forcing_status
    state["source"] = "backend"
    return state


def _acquire_nonblocking(sem: threading.BoundedSemaphore) -> bool:
    return sem.acquire(blocking=False)


def _try_acquire_ws_sim_slot() -> bool:
    global _ws_sim_active_connections
    if not _acquire_nonblocking(_ws_sim_connection_guard):
        return False
    with _ws_sim_connection_lock:
        _ws_sim_active_connections += 1
    return True


def _release_ws_sim_slot() -> None:
    global _ws_sim_active_connections
    with _ws_sim_connection_lock:
        if _ws_sim_active_connections <= 0:
            raise RuntimeError("WebSocket simulation admission counter underflow")
        _ws_sim_active_connections -= 1
    _ws_sim_connection_guard.release()


def _websocket_origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    # Non-browser scientific clients commonly omit Origin. Browser clients must
    # match the same explicit loopback allowlist as the HTTP application.
    return origin is None or origin in WS_SIM_ALLOWED_ORIGINS


def _release_guard_when_work_finishes(
    future: "Future[Any]",
    guard: threading.BoundedSemaphore,
) -> None:
    """Release capacity at worker completion and consume detached exceptions."""
    try:
        if not future.cancelled():
            future.exception()
    except BaseException:
        # The request coroutine has already received (or intentionally detached
        # from) this outcome. Capacity release must never be skipped.
        pass
    finally:
        guard.release()


async def _run_owned_thread(
    function,
    *args,
    guard: threading.BoundedSemaphore,
    executor: ThreadPoolExecutor,
    timeout_seconds: float,
    owner_cancel_event: threading.Event | None = None,
    **kwargs,
):
    """Run work without releasing its permit merely because its caller timed out.

    ``asyncio.to_thread`` cannot stop a Python thread. The old endpoint pattern
    released its semaphore in ``finally`` when ``wait_for`` timed out, allowing
    each new wave to start more orphaned work. Here a dedicated executor owns
    the thread, the future is shielded from request cancellation, and only the
    completion callback releases capacity. Cooperative jobs also receive an
    event that is set as soon as their request times out or disconnects.
    """
    call = partial(function, *args, **kwargs)
    try:
        worker_future = executor.submit(call)
    except BaseException:
        guard.release()
        raise

    worker_future.add_done_callback(
        partial(_release_guard_when_work_finishes, guard=guard)
    )
    future = asyncio.wrap_future(worker_future)
    try:
        return await asyncio.wait_for(
            asyncio.shield(future),
            timeout=timeout_seconds,
        )
    except (asyncio.TimeoutError, asyncio.CancelledError):
        if owner_cancel_event is not None:
            owner_cancel_event.set()
        raise


class _RequestOwnerDisconnected(asyncio.CancelledError):
    """Internal signal: the HTTP peer left while owned work was still running."""


async def _wait_for_request_disconnect(request: Request, *, poll_seconds: float = 0.05) -> None:
    while True:
        if await request.is_disconnected():
            return
        await asyncio.sleep(poll_seconds)


async def _run_request_owned_thread(
    request: Request,
    function,
    *args,
    guard: threading.BoundedSemaphore,
    executor: ThreadPoolExecutor,
    timeout_seconds: float,
    owner_context: PlanningContext,
    **kwargs,
):
    """Run an owned worker and cooperatively cancel it after peer disconnect.

    ASGI servers do not universally cancel a response handler when the client
    closes the connection.  Polling the request channel prevents an abandoned
    browser fetch from continuing a full trajectory search.  As with
    ``_run_owned_thread``, the compute permit remains owned until the actual
    worker future exits.
    """

    worker_task = asyncio.create_task(
        _run_owned_thread(
            function,
            *args,
            guard=guard,
            executor=executor,
            timeout_seconds=timeout_seconds,
            owner_cancel_event=owner_context.cancel_event,
            **kwargs,
        )
    )
    disconnect_task = asyncio.create_task(_wait_for_request_disconnect(request))
    try:
        done, _pending = await asyncio.wait(
            (worker_task, disconnect_task),
            return_when=asyncio.FIRST_COMPLETED,
        )
        # Prefer a completed scientific result in a same-tick race.
        if worker_task in done:
            return await worker_task

        await disconnect_task
        owner_context.cancel("client_disconnected")
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        raise _RequestOwnerDisconnected()
    except _RequestOwnerDisconnected:
        raise
    except asyncio.CancelledError:
        # Handler cancellation and HTTP disconnect are not guaranteed to be the
        # same event across ASGI servers. Explicitly detach only the waiter;
        # `_run_owned_thread` keeps the semaphore owned until the real worker
        # exits and its completion callback releases it.
        owner_context.cancel("request_cancelled")
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        raise
    finally:
        if not disconnect_task.done():
            disconnect_task.cancel()
            try:
                await disconnect_task
            except asyncio.CancelledError:
                pass


def _trajectory_http_exception(
    status_code: int,
    code: str,
    message: str,
    *,
    retryable: bool = False,
    context: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message,
            "retryable": bool(retryable),
            "context": dict(context or {}),
        },
        headers=headers,
    )


def _ephemeris_http_exception(exc: EphemerisError) -> HTTPException:
    status_code = 503
    if isinstance(exc, EphemerisTargetUnsupported):
        status_code = 422
    elif isinstance(exc, EphemerisProtocolError):
        status_code = 502
    elif isinstance(exc, EphemerisUpstreamTimeout):
        status_code = 504
    elif isinstance(
        exc,
        (
            EphemerisProviderUnavailable,
            EphemerisUpstreamRateLimited,
            EphemerisBudgetExceeded,
            EphemerisCancelled,
        ),
    ):
        status_code = 503

    payload = exc.to_dict()
    payload.pop("code", None)
    payload.pop("message", None)
    headers = None
    if exc.retry_after_s is not None:
        retry_after = max(1, min(60, int(math.ceil(float(exc.retry_after_s)))))
        headers = {"Retry-After": str(retry_after)}
    return _trajectory_http_exception(
        status_code,
        exc.code,
        str(exc),
        retryable=exc.retryable,
        context=payload,
        headers=headers,
    )


def _trajectory_plan_limits() -> PlanningLimits:
    return PlanningLimits(
        ephemeris_queries=TRAJECTORY_PLAN_MAX_EPHEMERIS_QUERIES,
        unique_ephemeris_states=TRAJECTORY_PLAN_MAX_UNIQUE_EPHEMERIS_STATES,
        remote_ephemeris_states=TRAJECTORY_PLAN_MAX_REMOTE_EPHEMERIS_STATES,
        external_requests=TRAJECTORY_PLAN_MAX_EXTERNAL_REQUESTS,
        leg_requests=TRAJECTORY_PLAN_MAX_LEG_REQUESTS,
        leg_evaluations=TRAJECTORY_PLAN_MAX_LEG_EVALUATIONS,
        route_prefixes=TRAJECTORY_PLAN_MAX_ROUTE_PREFIXES,
    )


def _trajectory_lambert_limits() -> PlanningLimits:
    return PlanningLimits(
        ephemeris_queries=2,
        unique_ephemeris_states=2,
        remote_ephemeris_states=2,
        external_requests=2,
        leg_requests=1,
        leg_evaluations=1,
        route_prefixes=1,
    )


def _trajectory_porkchop_limits() -> PlanningLimits:
    # Remote providers are gated for grid searches in Phase 1, so any attempted
    # upstream operation fails the shared budget closed.
    return PlanningLimits(
        ephemeris_queries=TRAJECTORY_PORKCHOP_MAX_GRID_POINTS * 2,
        unique_ephemeris_states=min(
            HARD_MAX_UNIQUE_EPHEMERIS_STATES,
            TRAJECTORY_PORKCHOP_MAX_GRID_POINTS * 2,
        ),
        remote_ephemeris_states=0,
        external_requests=0,
        leg_requests=TRAJECTORY_PORKCHOP_MAX_GRID_POINTS,
        leg_evaluations=TRAJECTORY_PORKCHOP_MAX_GRID_POINTS,
        route_prefixes=0,
    )


def _mission_plan_limits() -> PlanningLimits:
    # One aggregate budget is shared by outbound planning and every return
    # candidate considered by MissionPlannerAgent.
    return _trajectory_plan_limits()


def _benchmark_limits() -> PlanningLimits:
    # Every scenario shares this one budget and one pinned ephemeris session.
    # Horizons is rejected before admission, so remote counters are closed.
    return PlanningLimits(
        ephemeris_queries=MAX_REFERENCE_SCENARIOS * 2,
        unique_ephemeris_states=MAX_REFERENCE_SCENARIOS * 2,
        remote_ephemeris_states=0,
        external_requests=0,
        leg_requests=MAX_REFERENCE_SCENARIOS,
        leg_evaluations=MAX_REFERENCE_SCENARIOS,
        route_prefixes=0,
    )


def _validate_trajectory_plan_payload(payload: TrajectoryPlanRequest) -> ValidatedTrajectoryPlan:
    return validate_plan_request(
        ALL_BODIES,
        from_id=payload.from_id,
        to_id=payload.to_id,
        departure_jd=payload.departure_jd,
        objective=payload.objective,
        max_assists=payload.max_assists,
        assist_pool=payload.assist_pool,
        default_assist_pool=TRAJECTORY_CONFIGURED_DEFAULT_ASSIST_POOL,
        max_assist_pool_size=TRAJECTORY_PLAN_MAX_ASSIST_POOL_SIZE,
        max_route_topologies=TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
    )


def _validate_trajectory_endpoint_pair(
    *,
    from_id: str,
    to_id: str,
    departure_jd: float,
) -> None:
    """Apply non-combinatorial endpoint eligibility before provider creation."""

    validate_plan_request(
        ALL_BODIES,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        objective="min_distance",
        max_assists=0,
        assist_pool=[],
        default_assist_pool=[],
        max_assist_pool_size=TRAJECTORY_PLAN_MAX_ASSIST_POOL_SIZE,
        max_route_topologies=TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
    )


def _validate_mission_trajectory_payload(payload: MissionPlanRequest) -> None:
    target_id = payload.target_id or payload.to_id or "psyche"
    return_id = payload.return_id or payload.from_id
    _ensure_bodies_known(
        (payload.from_id, "departure"),
        (target_id, "target"),
        (return_id, "return"),
    )
    if payload.from_id == target_id:
        raise _trajectory_http_exception(
            400,
            "trajectory_same_body",
            "Mission departure and target bodies must differ.",
        )
    if target_id == return_id:
        raise _trajectory_http_exception(
            400,
            "trajectory_same_body",
            "Mission target and return bodies must differ.",
        )

    # Validate both route directions before admission. Keep the submitted pool
    # intact for MissionPlannerAgent because each direction removes different
    # endpoint bodies from its own effective pool.
    validate_plan_request(
        ALL_BODIES,
        from_id=payload.from_id,
        to_id=target_id,
        departure_jd=payload.departure_jd,
        objective=payload.objective,
        max_assists=payload.max_assists,
        assist_pool=payload.assist_pool,
        default_assist_pool=MISSION_CONFIGURED_DEFAULT_ASSIST_POOL,
        max_assist_pool_size=MISSION_PLAN_MAX_ASSIST_POOL_SIZE,
        max_route_topologies=TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
    )
    validate_plan_request(
        ALL_BODIES,
        from_id=target_id,
        to_id=return_id,
        departure_jd=payload.departure_jd,
        objective="min_distance",
        max_assists=max(0, payload.max_assists - 1),
        assist_pool=payload.assist_pool,
        default_assist_pool=MISSION_CONFIGURED_DEFAULT_ASSIST_POOL,
        max_assist_pool_size=MISSION_PLAN_MAX_ASSIST_POOL_SIZE,
        max_route_topologies=TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
    )


def _enforce_trajectory_remote_search_policy(provider: str, operation: str) -> None:
    if provider != "horizons" or TRAJECTORY_HORIZONS_SEARCH_ENABLED:
        return
    raise _trajectory_http_exception(
        422,
        "ephemeris_provider_not_supported_for_operation",
        (
            "Explicit Horizons ephemerides are temporarily limited to direct "
            "Lambert requests until bounded remote finalist verification is enabled."
        ),
        context={"provider": provider, "operation": operation},
    )


def _build_aia_tile_payload(
    channel: str,
    jd_tdb: float | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    return SOLAR_REALTIME_DATA.latest_aia_tile(
        channel=channel,
        jd_tdb=jd_tdb,
        force_refresh=bool(force_refresh),
    )


def _run_mission_plan(
    mission_payload: dict[str, Any],
    planning_context: PlanningContext,
) -> dict[str, Any]:
    return MissionPlannerAgent(ALL_BODIES).plan(
        mission_payload,
        planning_context=planning_context,
    )


def _enforce_porkchop_request_size(payload: TrajectoryPorkchopRequest) -> None:
    departure_start = float(payload.departure_start_jd)
    departure_end = float(payload.departure_end_jd)
    tof_min = float(payload.tof_min_days)
    tof_max = float(payload.tof_max_days)
    departure_step = float(payload.departure_step_days)
    tof_step = float(payload.tof_step_days)

    if departure_step < TRAJECTORY_PORKCHOP_MIN_DEPARTURE_STEP_DAYS:
        raise _trajectory_http_exception(
            400,
            "trajectory_invalid_time_range",
            (
                "`departure_step_days` must be at least "
                f"{TRAJECTORY_PORKCHOP_MIN_DEPARTURE_STEP_DAYS:g} days"
            ),
            context={
                "departureStepDays": departure_step,
                "minimumDepartureStepDays": TRAJECTORY_PORKCHOP_MIN_DEPARTURE_STEP_DAYS,
            },
        )
    if tof_step < TRAJECTORY_PORKCHOP_MIN_TOF_STEP_DAYS:
        raise _trajectory_http_exception(
            400,
            "trajectory_invalid_time_range",
            f"`tof_step_days` must be at least {TRAJECTORY_PORKCHOP_MIN_TOF_STEP_DAYS:g} days",
            context={
                "tofStepDays": tof_step,
                "minimumTofStepDays": TRAJECTORY_PORKCHOP_MIN_TOF_STEP_DAYS,
            },
        )

    if departure_end <= departure_start:
        raise _trajectory_http_exception(
            400,
            "trajectory_invalid_time_range",
            "`departure_end_jd` must be greater than `departure_start_jd`",
            context={
                "departureStartJd": departure_start,
                "departureEndJd": departure_end,
            },
        )

    if tof_max <= tof_min:
        raise _trajectory_http_exception(
            400,
            "trajectory_invalid_time_range",
            "`tof_max_days` must be greater than `tof_min_days`",
            context={"tofMinDays": tof_min, "tofMaxDays": tof_max},
        )

    departure_window = departure_end - departure_start
    tof_window = tof_max - tof_min
    if departure_window > TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS:
        raise _trajectory_http_exception(
            413,
            "trajectory_complexity_limit",
            (
                f"`departure_end_jd - departure_start_jd` must be <= "
                f"{TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS} days"
            ),
            context={
                "departureWindowDays": departure_window,
                "maximumDepartureWindowDays": TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS,
            },
        )

    if tof_window > TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS:
        raise _trajectory_http_exception(
            413,
            "trajectory_complexity_limit",
            (
                f"`tof_max_days - tof_min_days` must be <= "
                f"{TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS} days"
            ),
            context={
                "tofWindowDays": tof_window,
                "maximumTofWindowDays": TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS,
            },
        )

    departure_samples = int(departure_window / departure_step) + 1
    tof_samples = int(tof_window / tof_step) + 1
    estimated_points = departure_samples * tof_samples
    if estimated_points > TRAJECTORY_PORKCHOP_MAX_GRID_POINTS:
        raise _trajectory_http_exception(
            413,
            "trajectory_complexity_limit",
            (
                f"Trajectory porkchop request is too large; estimated grid points "
                f"{estimated_points} > {TRAJECTORY_PORKCHOP_MAX_GRID_POINTS}"
            ),
            context={
                "estimatedGridPoints": estimated_points,
                "maximumGridPoints": TRAJECTORY_PORKCHOP_MAX_GRID_POINTS,
            },
        )

    # Each cell can introduce one destination-arrival state, while every
    # departure row introduces one source state. Reject a grid whose worst-case
    # unique state count cannot fit the request-owned state-computation budget;
    # otherwise an admitted scan can deterministically fail halfway through and
    # discard already certified points.
    estimated_unique_states = departure_samples + estimated_points
    unique_state_limit = min(
        HARD_MAX_UNIQUE_EPHEMERIS_STATES,
        estimated_points * 2,
    )
    if estimated_unique_states > unique_state_limit:
        raise _trajectory_http_exception(
            413,
            "trajectory_complexity_limit",
            "Trajectory porkchop grid exceeds the unique-state computation budget.",
            context={
                "estimatedGridPoints": estimated_points,
                "estimatedUniqueEphemerisStates": estimated_unique_states,
                "maximumUniqueEphemerisStates": unique_state_limit,
            },
        )


def _enforce_mission_plan_request_size(payload: MissionPlanRequest) -> None:
    vehicle = payload.vehicle
    if vehicle is not None and len(vehicle.stages) > MISSION_PLAN_MAX_VEHICLE_STAGES:
        raise _trajectory_http_exception(
            413,
            "mission_complexity_limit",
            (
                f"`vehicle.stages` is limited to {MISSION_PLAN_MAX_VEHICLE_STAGES} "
                "entries to prevent request amplification"
            ),
            context={
                "vehicleStageCount": len(vehicle.stages),
                "maximumVehicleStageCount": MISSION_PLAN_MAX_VEHICLE_STAGES,
            },
        )

    assist_pool = payload.assist_pool or []
    if len(assist_pool) > MISSION_PLAN_MAX_ASSIST_POOL_SIZE:
        raise _trajectory_http_exception(
            413,
            "mission_complexity_limit",
            (
                f"`assist_pool` is limited to {MISSION_PLAN_MAX_ASSIST_POOL_SIZE} "
                "entries to prevent request amplification"
            ),
            context={
                "assistPoolSize": len(assist_pool),
                "maximumAssistPoolSize": MISSION_PLAN_MAX_ASSIST_POOL_SIZE,
            },
        )

    if float(payload.payload_mass_kg) > MISSION_PLAN_MAX_PAYLOAD_MASS_KG:
        raise _trajectory_http_exception(
            413,
            "mission_complexity_limit",
            (
                f"`payload_mass_kg` is limited to {MISSION_PLAN_MAX_PAYLOAD_MASS_KG:.1f} "
                "to constrain mission-cost runtime"
            ),
            context={
                "payloadMassKg": float(payload.payload_mass_kg),
                "maximumPayloadMassKg": MISSION_PLAN_MAX_PAYLOAD_MASS_KG,
            },
        )

    if int(payload.risk_samples) > MISSION_PLAN_MAX_RISK_SAMPLES:
        raise _trajectory_http_exception(
            413,
            "mission_complexity_limit",
            (
                f"`risk_samples` is limited to {MISSION_PLAN_MAX_RISK_SAMPLES} "
                "for bounded Monte Carlo cost"
            ),
            context={
                "riskSamples": int(payload.risk_samples),
                "maximumRiskSamples": MISSION_PLAN_MAX_RISK_SAMPLES,
            },
        )


def _rebound_readiness() -> Dict[str, Any]:
    try:
        return REBOUNDEngine().readiness_status()
    except Exception as exc:
        return {
            "available": False,
            "fidelity": None,
            "configured_fidelity": "high",
            "error": str(exc),
        }


def _rebound_available() -> bool:
    return bool(_rebound_readiness().get("available", False))


def _tudatpy_available() -> bool:
    if not _TUDATPY_AVAILABLE or TudatPyEngine is None:
        return False
    try:
        return TudatPyEngine().available
    except Exception:
        return False


class StrictRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def _normalize_body_id(value: str) -> str:
    cleaned = value.strip().lower()
    if not cleaned:
        raise ValueError("must be a non-empty string")
    if len(cleaned) > 64:
        raise ValueError("must contain at most 64 characters")
    return cleaned


def _normalize_objective(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in TRAJECTORY_OBJECTIVES:
        raise ValueError(f"must be one of {list(TRAJECTORY_OBJECTIVES)}")
    return cleaned


def _normalize_ephemeris_provider(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in EPHEMERIS_PROVIDERS:
        raise ValueError(f"must be one of {list(EPHEMERIS_PROVIDERS)}")
    return cleaned


def _normalize_assist_pool(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    cleaned: list[str] = []
    for item in value:
        body_id = item.strip().lower()
        if not body_id:
            raise ValueError("must contain non-empty string values")
        if len(body_id) > 64:
            raise ValueError("body identifiers must contain at most 64 characters")
        cleaned.append(body_id)
    # Preserve cardinality and duplicates here. The trajectory contract rejects
    # duplicates explicitly so callers cannot hide oversized/ambiguous pools
    # behind normalization.
    return cleaned


def _ensure_bodies_known(*body_ids: tuple[str, str]) -> None:
    for body_id, label in body_ids:
        if body_id not in KNOWN_BODY_IDS:
            raise _trajectory_http_exception(
                404,
                "trajectory_unknown_body",
                f"Unknown {label} body `{body_id}`",
                context={"bodyId": body_id, "role": label},
            )


def _resolve_benchmark_report_path(output_path: str | None, default_filename: str) -> Path:
    requested = output_path if output_path is not None else default_filename
    candidate = Path(requested)

    if candidate.is_absolute():
        resolved = candidate.resolve(strict=False)
    else:
        if candidate.parts and candidate.parts[0] == BENCHMARK_REPORTS_DIR.name:
            resolved = (PROJECT_ROOT / candidate).resolve(strict=False)
        else:
            resolved = (BENCHMARK_REPORTS_DIR / candidate).resolve(strict=False)

    try:
        resolved.relative_to(BENCHMARK_REPORTS_DIR)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"`output_path` must resolve under `{BENCHMARK_REPORTS_DIR}`",
        ) from exc

    if resolved.suffix.lower() != ".md":
        raise HTTPException(status_code=400, detail="`output_path` must use a `.md` extension")

    return resolved


class TrajectoryBodyPairRequest(StrictRequestModel):
    from_id: StrictStr
    to_id: StrictStr
    ephemeris_provider: StrictStr = "auto"
    prograde: StrictBool = True

    @field_validator("from_id", "to_id")
    @classmethod
    def _validate_body_id(cls, value: str) -> str:
        return _normalize_body_id(value)

    @field_validator("ephemeris_provider")
    @classmethod
    def _validate_ephemeris_provider(cls, value: str) -> str:
        return _normalize_ephemeris_provider(value)


class TrajectoryPlanRequest(TrajectoryBodyPairRequest):
    objective: StrictStr = "min_distance"
    departure_jd: FiniteFloat
    max_assists: int = Field(default=1, ge=0, le=3)
    assist_pool: list[StrictStr] | None = None

    @field_validator("objective")
    @classmethod
    def _validate_objective(cls, value: str) -> str:
        return _normalize_objective(value)

    @field_validator("assist_pool")
    @classmethod
    def _validate_assist_pool(cls, value: list[str] | None) -> list[str] | None:
        return _normalize_assist_pool(value)


class TrajectoryLambertRequest(TrajectoryBodyPairRequest):
    departure_jd: FiniteFloat
    arrival_jd: FiniteFloat


class TrajectoryPorkchopRequest(TrajectoryBodyPairRequest):
    departure_start_jd: FiniteFloat
    departure_end_jd: FiniteFloat
    departure_step_days: FiniteFloat = Field(default=10.0, gt=0.0)
    tof_min_days: FiniteFloat = Field(default=60.0, gt=0.0)
    tof_max_days: FiniteFloat = Field(default=700.0, gt=0.0)
    tof_step_days: FiniteFloat = Field(default=20.0, gt=0.0)


class MissionStageRequest(StrictRequestModel):
    name: StrictStr | None = None
    dry_mass_kg: FiniteFloat = Field(default=0.0, ge=0.0)
    propellant_mass_kg: FiniteFloat = Field(default=0.0, ge=0.0)
    isp_s: FiniteFloat = Field(default=0.0, ge=0.0)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must be a non-empty string when provided")
        return cleaned


class MissionVehicleRequest(StrictRequestModel):
    name: StrictStr = "custom_vehicle"
    stages: list[MissionStageRequest]

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must be a non-empty string")
        return cleaned

    @field_validator("stages")
    @classmethod
    def _validate_stages(cls, value: list[MissionStageRequest]) -> list[MissionStageRequest]:
        if not value:
            raise ValueError("must contain at least one stage")
        return value


class MissionPlanRequest(StrictRequestModel):
    from_id: StrictStr = "earth"
    target_id: StrictStr | None = None
    to_id: StrictStr | None = None
    return_id: StrictStr | None = None
    departure_jd: FiniteFloat = 2_460_400.5
    objective: StrictStr = "min_distance"
    max_assists: int = Field(default=1, ge=0, le=3)
    assist_pool: list[StrictStr] | None = None
    ephemeris_provider: StrictStr = "auto"
    payload_mass_kg: FiniteFloat = Field(default=6_500.0, gt=0.0)
    reserve_fraction: FiniteFloat = Field(default=0.06, ge=0.0, le=1.0)
    handling_loss_fraction: FiniteFloat = Field(default=0.04, ge=0.0, le=1.0)
    risk_samples: int = Field(default=240, ge=1)
    risk_seed: int = 17
    risk_failure_probability_threshold: FiniteFloat = Field(default=0.45, ge=0.0, le=1.0)
    mining_days: FiniteFloat = Field(default=180.0, ge=0.0)
    ore_grade: FiniteFloat = Field(default=0.18, ge=0.0, le=1.0)
    extraction_rate_kg_day: FiniteFloat = Field(default=1_200.0, ge=0.0)
    refining_yield: FiniteFloat = Field(default=0.82, ge=0.0, le=1.0)
    storage_loss_rate_per_day: FiniteFloat = Field(default=0.0015, ge=0.0)
    available_power_kw: FiniteFloat = Field(default=320.0, ge=0.0)
    power_required_kw_per_kg_day: FiniteFloat = Field(default=0.24, gt=0.0)
    vehicle: MissionVehicleRequest | None = None
    prograde: StrictBool = True

    @field_validator("from_id", "target_id", "to_id", "return_id")
    @classmethod
    def _validate_body_ids(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_body_id(value)

    @field_validator("objective")
    @classmethod
    def _validate_objective(cls, value: str) -> str:
        return _normalize_objective(value)

    @field_validator("assist_pool")
    @classmethod
    def _validate_assist_pool(cls, value: list[str] | None) -> list[str] | None:
        return _normalize_assist_pool(value)

    @field_validator("ephemeris_provider")
    @classmethod
    def _validate_ephemeris_provider(cls, value: str) -> str:
        return _normalize_ephemeris_provider(value)


class AccuracyReportRequest(StrictRequestModel):
    ephemeris_provider: StrictStr = "auto"
    output_path: StrictStr | None = None
    allow_overwrite: StrictBool = False

    @field_validator("ephemeris_provider")
    @classmethod
    def _validate_ephemeris_provider(cls, value: str) -> str:
        return _normalize_ephemeris_provider(value)

    @field_validator("output_path")
    @classmethod
    def _validate_output_path(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must be a non-empty string when provided")
        return cleaned


# ── Health / Info ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    rebound_status = _rebound_readiness()
    tudatpy_ready = _tudatpy_available()
    return {
        "status": "ok",
        "engines": {
            "rebound": rebound_status,
            "tudatpy": {"available": tudatpy_ready, "fidelity": "normal"},
        },
    }


@app.get("/info")
def info():
    return {
        "bodies": [b["id"] for b in ALL_BODIES],
        "body_count": len(ALL_BODIES),
        "integrators": list(SUPPORTED_INTEGRATORS),
        "default_integrator": DEFAULT_INTEGRATOR,
        "engines": {
            "default": DEFAULT_ENGINE,
            "supported": ["rebound", "tudatpy"],
        },
    }


@app.get("/bodies")
def bodies():
    type_counts = dict(Counter(body.get("type", "unknown") for body in ALL_BODIES))
    catalog = [
        {
            "id": body.get("id"),
            "name": body.get("name"),
            "type": body.get("type"),
            "mass_kg": body.get("mass_kg"),
            "radius_km": body.get("radius_km"),
            "has_orbit": body.get("orbit") is not None,
        }
        for body in ALL_BODIES
    ]
    return {
        "count": len(catalog),
        "type_counts": type_counts,
        "bodies": catalog,
    }


@app.get("/solar/capabilities")
def solar_capabilities():
    capabilities = SOLAR_PHYSICS_MODEL.capabilities()
    capabilities["realtime_data"] = SOLAR_REALTIME_DATA.capabilities()
    capabilities["realtime_data"]["aia_tile_proxy_endpoint"] = "/solar/realtime/aia-tile"
    return capabilities


@app.get("/solar/realtime")
def solar_realtime_data(request: Request, force_refresh: bool = False):
    _require_optional_solar_api_key(request)
    _enforce_solar_realtime_rate_limit(request)
    snapshot = SOLAR_REALTIME_DATA.latest(force_refresh=bool(force_refresh))
    return {
        "schema": {"name": "solar_realtime_endpoint", "version": 1},
        "source": "backend",
        "snapshot": snapshot,
    }


@app.get("/solar/realtime/aia-tile")
async def solar_realtime_aia_tile(
    request: Request,
    channel: str = "aia_193",
    jd_tdb: Annotated[
        str | None,
        Query(description="Julian Date in Barycentric Dynamical Time (TDB)."),
    ] = None,
    jd: Annotated[
        str | None,
        Query(
            description="Deprecated alias for `jd_tdb`; interpreted as TDB.",
            deprecated=True,
        ),
    ] = None,
    force_refresh: bool = False,
):
    epoch_jd_tdb = _resolve_jd_tdb_query(jd_tdb, jd, default_to_now=False)
    _require_optional_solar_api_key(request)
    _enforce_solar_aia_tile_rate_limit(request)

    channel_key = channel.strip().lower()
    if channel_key not in SOLAR_REALTIME_DATA.AIA_SOURCE_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"`channel` must be one of {list(SOLAR_REALTIME_DATA.AIA_SOURCE_IDS.keys())}",
        )

    if not _acquire_nonblocking(_solar_aia_tile_concurrent_guard):
        raise HTTPException(
            status_code=503,
            detail="Solar AIA tile requests are temporarily saturated. Retry shortly.",
            headers={"Retry-After": "2"},
        )

    try:
        tile = await _run_owned_thread(
            _build_aia_tile_payload,
            guard=_solar_aia_tile_concurrent_guard,
            executor=_aia_tile_executor,
            timeout_seconds=SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS,
            channel=channel_key,
            jd_tdb=epoch_jd_tdb,
            force_refresh=bool(force_refresh),
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=503,
            detail="AIA tile generation timed out. Try again later.",
        ) from exc
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AIA tile unavailable: {exc}") from exc
    response = Response(
        content=tile["content"],
        media_type=str(tile.get("content_type") or "image/png"),
    )
    response.headers["Cache-Control"] = f"public, max-age={int(SOLAR_REALTIME_DATA.cache_ttl_s)}"
    response.headers["X-Solar-AIA-Channel"] = str(tile.get("channel") or channel_key)
    if tile.get("image_id") is not None:
        response.headers["X-Solar-AIA-Image-Id"] = str(tile["image_id"])
    if tile.get("image_date") is not None:
        response.headers["X-Solar-AIA-Image-Date"] = str(tile["image_date"])
    return response


@app.get("/solar/physics")
async def solar_physics_state(
    request: Request,
    jd_tdb: Annotated[
        str | None,
        Query(description="Julian Date in Barycentric Dynamical Time (TDB)."),
    ] = None,
    jd: Annotated[
        str | None,
        Query(
            description="Deprecated alias for `jd_tdb`; interpreted as TDB.",
            deprecated=True,
        ),
    ] = None,
    fidelity: str = "operational",
    max_features: int = 220,
    forcing: str = "synthetic",
    live_data: bool = False,
    force_data_refresh: bool = False,
):
    epoch_jd = _resolve_jd_tdb_query(jd_tdb, jd, default_to_now=True)
    assert epoch_jd is not None
    _require_optional_solar_api_key(request)

    fidelity_key = fidelity.strip().lower()
    if fidelity_key not in SOLAR_PHYSICS_MODEL.fidelity_levels:
        raise HTTPException(
            status_code=400,
            detail=f"`fidelity` must be one of {list(SOLAR_PHYSICS_MODEL.fidelity_levels)}",
        )

    forcing_key = forcing.strip().lower()
    if forcing_key not in SOLAR_PHYSICS_MODEL.FORCING_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"`forcing` must be one of {list(SOLAR_PHYSICS_MODEL.FORCING_MODES)}",
        )

    if forcing_key == "data_driven":
        try:
            raise ObservedSolarInputUnavailable()
        except ObservedSolarInputUnavailable as exc:
            raise _observed_solar_input_http_error(exc) from exc

    _enforce_solar_request_rate_limit(request)

    requested_max_features = int(max_features)
    safe_max_features = min(
        SOLAR_PHYSICS_MAX_FEATURES,
        max(SOLAR_PHYSICS_MIN_FEATURES, requested_max_features),
    )
    if requested_max_features != safe_max_features:
        raise HTTPException(
            status_code=413,
            detail=(
                "`max_features` must be between "
                f"{SOLAR_PHYSICS_MIN_FEATURES} and {SOLAR_PHYSICS_MAX_FEATURES}"
            ),
        )

    if not _acquire_nonblocking(_solar_physics_concurrent_guard):
        raise HTTPException(
            status_code=503,
            detail="Solar physics requests are temporarily saturated. Retry shortly.",
            headers={"Retry-After": "2"},
        )

    try:
        state = await _run_owned_thread(
            _build_solar_physics_state,
            epoch_jd,
            fidelity_key,
            safe_max_features,
            forcing_key,
            bool(live_data),
            bool(force_data_refresh),
            guard=_solar_physics_concurrent_guard,
            executor=_heavy_compute_executor,
            timeout_seconds=SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=503,
            detail="Solar physics generation timed out. Try again later.",
        ) from exc
    except ObservedSolarInputUnavailable as exc:
        raise _observed_solar_input_http_error(exc) from exc
    return state


@app.get("/nearby-systems")
def nearby_systems(limit: int = 354, max_distance_ly: float = 20.0):
    """
    Nearby stellar-system catalog for interstellar marker rendering.
    """
    safe_limit = max(1, min(5_000, int(limit)))
    safe_max_distance_ly = max(0.1, min(100.0, float(max_distance_ly)))
    all_rows = load_nearby_systems_catalog()
    rows = query_nearby_systems(
        limit=safe_limit,
        max_distance_ly=safe_max_distance_ly,
    )
    return {
        "schema": NEARBY_SYSTEMS_SCHEMA,
        "count": len(rows),
        "total_available": len(all_rows),
        "limit": safe_limit,
        "max_distance_ly": safe_max_distance_ly,
        "source": {
            "catalog_path": str(CATALOG_PATH),
            "catalog_name": CATALOG_NAME,
        },
        "systems": rows,
    }


@app.get("/nearby-systems/{system_ref}")
def nearby_system_detail(system_ref: str):
    system = get_nearby_system(system_ref)
    if system is None:
        raise HTTPException(status_code=404, detail=f"Nearby system `{system_ref}` not found")

    aliases = nearby_system_aliases(system)
    return {
        "schema": NEARBY_SYSTEMS_SCHEMA,
        "source": {
            "catalog_path": str(CATALOG_PATH),
            "catalog_name": CATALOG_NAME,
        },
        "match": {
            "query": system_ref,
            "match_type": "sys_id" if system_ref.strip().isdigit() else "alias",
        },
        "aliases": aliases,
        "system": system,
    }


@app.get("/trajectory/capabilities")
def trajectory_capabilities():
    planner_body_ids = list(eligible_endpoint_body_ids(ALL_BODIES))
    assist_body_ids = list(eligible_assist_body_ids(ALL_BODIES))
    physical_center_provider_ids = [
        body_id
        for body_id in (
            "mercury",
            "venus",
            "earth",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
        )
        if body_id in planner_body_ids
    ]
    state_contract = TRAJECTORY_STATE_CONTRACT
    return {
        "schema": {"name": "trajectory_capabilities", "version": 2},
        "objectives": list(TRAJECTORY_OBJECTIVES),
        "default_objective": "min_distance",
        "max_assists": 3,
        "default_assist_pool": list(TRAJECTORY_CONFIGURED_DEFAULT_ASSIST_POOL),
        "ephemeris_providers": ["auto", "spice", "horizons", "kepler"],
        "planner_body_ids": planner_body_ids,
        "assist_body_ids": assist_body_ids,
        "stateVectorContract": {
            "frameId": state_contract.frame_id,
            "origin": state_contract.origin,
            "orientation": state_contract.orientation,
            "epochCoordinate": "julian_date",
            "timeScale": state_contract.jd_time_scale,
            "positionUnit": state_contract.position_unit,
            "velocityUnit": state_contract.velocity_unit,
            "corrections": state_contract.corrections,
        },
        "limits": {
            "maxRequestBodyBytes": TRAJECTORY_REQUEST_MAX_BODY_BYTES,
            "maxRequestsPerRateWindow": TRAJECTORY_RATE_LIMIT_PER_WINDOW,
            "rateWindowSeconds": TRAJECTORY_RATE_LIMIT_WINDOW_SECONDS,
            "maxAssistPoolSize": TRAJECTORY_PLAN_MAX_ASSIST_POOL_SIZE,
            "maxAssists": 3,
            "maxRouteTopologies": TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
            "maxRoutePrefixes": TRAJECTORY_PLAN_MAX_ROUTE_PREFIXES,
            "globalBeamWidth": GLOBAL_BEAM_WIDTH,
            "maxPartialsPerRoutePrefix": MAX_PARTIALS_PER_ROUTE_PREFIX,
            "maxLegEvaluations": TRAJECTORY_PLAN_MAX_LEG_EVALUATIONS,
            "maxLegRequestsPerPlan": TRAJECTORY_PLAN_MAX_LEG_REQUESTS,
            "maxEphemerisQueriesPerPlan": TRAJECTORY_PLAN_MAX_EPHEMERIS_QUERIES,
            "maxUniqueEphemerisStatesPerPlan": (
                TRAJECTORY_PLAN_MAX_UNIQUE_EPHEMERIS_STATES
            ),
            "maxCompletedRoutesRetained": MAX_COMPLETED,
            "maxReturnedAlternatives": MAX_RETURNED_ALTERNATIVES,
            "minimumPlanLegTofDays": TRAJECTORY_PLAN_MIN_LEG_TOF_DAYS,
            "maximumPlanLegTofDays": TRAJECTORY_PLAN_MAX_LEG_TOF_DAYS,
            "maxAssistTofSeedsPerExtension": (
                TRAJECTORY_PLAN_MAX_ASSIST_TOF_SEEDS_PER_EXTENSION
            ),
            "maxDirectTofSeeds": TRAJECTORY_PLAN_MAX_DIRECT_TOF_SEEDS,
            "maxPorkchopGridPoints": TRAJECTORY_PORKCHOP_MAX_GRID_POINTS,
            "maxPorkchopUniqueEphemerisStates": (
                _trajectory_porkchop_limits().unique_ephemeris_states
            ),
            "maxPorkchopDepartureWindowDays": TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS,
            "maxPorkchopTofWindowDays": TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS,
            "minimumPorkchopDepartureStepDays": TRAJECTORY_PORKCHOP_MIN_DEPARTURE_STEP_DAYS,
            "minimumPorkchopTofStepDays": TRAJECTORY_PORKCHOP_MIN_TOF_STEP_DAYS,
            "planInternalDeadlineMs": int(TRAJECTORY_PLAN_INTERNAL_DEADLINE_SECONDS * 1_000),
            "planTimeoutMs": int(TRAJECTORY_PLAN_COMPUTE_TIMEOUT_SECONDS * 1_000),
            "maxConcurrentPlans": TRAJECTORY_PLAN_CONCURRENT_REQUEST_LIMIT,
            "lambertInternalDeadlineMs": int(TRAJECTORY_LAMBERT_INTERNAL_DEADLINE_SECONDS * 1_000),
            "lambertTimeoutMs": int(TRAJECTORY_LAMBERT_COMPUTE_TIMEOUT_SECONDS * 1_000),
            "maxConcurrentLambertRequests": TRAJECTORY_LAMBERT_CONCURRENT_REQUEST_LIMIT,
            "porkchopInternalDeadlineMs": int(
                TRAJECTORY_PORKCHOP_INTERNAL_DEADLINE_SECONDS * 1_000
            ),
            "porkchopTimeoutMs": int(
                TRAJECTORY_PORKCHOP_COMPUTE_TIMEOUT_SECONDS * 1_000
            ),
            "maxConcurrentPorkchopRequests": (
                TRAJECTORY_PORKCHOP_CONCURRENT_REQUEST_LIMIT
            ),
            "missionInternalDeadlineMs": int(
                MISSION_PLAN_INTERNAL_DEADLINE_SECONDS * 1_000
            ),
            "missionTimeoutMs": int(MISSION_PLAN_COMPUTE_TIMEOUT_SECONDS * 1_000),
            "maxConcurrentMissionRequests": MISSION_PLAN_CONCURRENT_REQUEST_LIMIT,
            "benchmarkInternalDeadlineMs": int(
                BENCHMARK_INTERNAL_DEADLINE_SECONDS * 1_000
            ),
            "benchmarkTimeoutMs": int(BENCHMARK_COMPUTE_TIMEOUT_SECONDS * 1_000),
            "maxConcurrentBenchmarkRequests": BENCHMARK_CONCURRENT_REQUEST_LIMIT,
            "sharedHeavyWorkerThreads": HEAVY_COMPUTE_THREAD_LIMIT,
            "maxRemoteEphemerisStatesPerPlan": TRAJECTORY_PLAN_MAX_REMOTE_EPHEMERIS_STATES,
            "maxExternalRequestsPerPlan": TRAJECTORY_PLAN_MAX_EXTERNAL_REQUESTS,
        },
        "providerPolicies": {
            "auto": {
                "networkAccess": False,
                "resolvedProvider": "kepler",
                "targetCoverage": {
                    "bodyIds": planner_body_ids,
                    "targetDefinition": "catalog_orbit_reference",
                },
                "operations": ["plan", "lambert", "porkchop", "mission", "benchmark"],
            },
            "spice": {
                "networkAccess": False,
                "availability": "optional_local_tooling",
                "targetCoverage": {
                    "bodyIds": physical_center_provider_ids,
                    "targetDefinition": "body_center",
                },
                "operations": ["plan", "lambert", "porkchop", "mission", "benchmark"],
            },
            "horizons": {
                "networkAccess": True,
                "directLambertOnly": not TRAJECTORY_HORIZONS_SEARCH_ENABLED,
                "absoluteRequestTimeoutMs": int(HORIZONS_MAX_TIMEOUT_S * 1_000),
                "globalConcurrencyPerProcess": HORIZONS_CONCURRENCY_LIMIT,
                "automaticRetries": 0,
                "successCacheMaxEntries": HORIZONS_SUCCESS_CACHE_MAXSIZE,
                "sameKeySingleFlight": True,
                "halfOpenProbeLimit": 1,
                "outageCooldownSeconds": {
                    "minimum": HORIZONS_PROVIDER_OUTAGE_COOLDOWN_S,
                    "maximum": HORIZONS_PROVIDER_OUTAGE_MAX_COOLDOWN_S,
                },
                "remoteFinalistVerification": False,
                "targetCoverage": {
                    "bodyIds": physical_center_provider_ids,
                    "targetDefinition": "body_center",
                },
                "operations": ["lambert"] if not TRAJECTORY_HORIZONS_SEARCH_ENABLED else [
                    "plan",
                    "lambert",
                    "porkchop",
                    "mission",
                ],
                "searchEnabled": TRAJECTORY_HORIZONS_SEARCH_ENABLED,
            },
            "kepler": {
                "networkAccess": False,
                "targetCoverage": {
                    "bodyIds": planner_body_ids,
                    "targetDefinition": "catalog_orbit_reference",
                },
                "operations": ["plan", "lambert", "porkchop", "mission", "benchmark"],
            },
        },
        "providerSemantics": {
            "pinnedPerRequest": True,
            "fallbackAfterFailure": False,
            "autoMayUseNetwork": False,
        },
        "lambert": {
            "algorithm": "universal_variables",
            "supportedRevolutions": [0],
            "maximumRevolutions": TRAJECTORY_LAMBERT_MAX_REVOLUTIONS,
            "pathSenses": ["prograde", "retrograde"],
            "timeOfFlightDays": {
                "minimumExclusive": 0.0,
                "maximum": None,
            },
        },
        "searchSemantics": {
            "bounded": True,
            "searchSpaceExhaustive": False,
            "optimalityGuaranteed": False,
            "remoteFinalistVerification": False,
            "tofSeedRangeDays": {
                "minimum": TRAJECTORY_PLAN_MIN_LEG_TOF_DAYS,
                "maximum": TRAJECTORY_PLAN_MAX_LEG_TOF_DAYS,
            },
        },
        "knownLimitations": [
            {
                "code": "bounded_approximate_search",
                "message": (
                    "MGA planning uses a bounded global beam; results are not an exhaustive "
                    "or globally optimal search."
                ),
            },
            {
                "code": "zero_revolution_lambert_only",
                "message": "The Lambert solver currently supports zero-revolution transfers only.",
            },
            {
                "code": "remote_finalist_verification_unavailable",
                "message": (
                    "Horizons finalist batching and remote re-verification are not implemented; "
                    "Horizons is restricted to direct Lambert requests."
                ),
            },
            {
                "code": "bounded_plan_tof_seeds",
                "message": (
                    "MGA leg time-of-flight candidates are seeded only within the advertised "
                    f"{TRAJECTORY_PLAN_MIN_LEG_TOF_DAYS:g}-"
                    f"{TRAJECTORY_PLAN_MAX_LEG_TOF_DAYS:g} day range."
                ),
            },
            {
                "code": "catalog_kepler_approximation",
                "message": (
                    "Auto/Kepler states use catalog two-body orbital elements rather than a "
                    "high-fidelity numerical ephemeris."
                ),
            },
            {
                "code": "path_length_is_endpoint_chord_metric",
                "message": (
                    "pathLengthAu and totalPathLengthAu sum endpoint chord distances; they "
                    "are not the integrated distance flown along the transfer orbit."
                ),
            },
            {
                "code": "assist_gain_is_velocity_deflection",
                "message": (
                    "assistGainKmS is a patched-conic velocity-deflection estimate, not "
                    "propulsive delta-v or guaranteed spacecraft energy gain."
                ),
            },
        ],
    }


@app.post("/trajectory/plan")
async def trajectory_plan(request: Request, payload: TrajectoryPlanRequest):
    if payload.from_id == payload.to_id:
        raise _trajectory_http_exception(
            400,
            "trajectory_same_body",
            "`from_id` and `to_id` must differ",
        )

    _ensure_bodies_known((payload.from_id, "departure"), (payload.to_id, "destination"))
    _enforce_trajectory_remote_search_policy(payload.ephemeris_provider, "plan")

    try:
        validated = _validate_trajectory_plan_payload(payload)
    except TrajectoryRequestRejected as exc:
        raise _trajectory_http_exception(
            422,
            exc.code,
            str(exc),
            context=exc.context,
        ) from exc

    if not _acquire_nonblocking(_trajectory_plan_concurrent_guard):
        raise _trajectory_http_exception(
            503,
            "trajectory_saturated",
            "Trajectory planning capacity is currently occupied. Retry shortly.",
            retryable=True,
            headers={"Retry-After": "2"},
        )

    planning_context = PlanningContext.with_timeout(
        TRAJECTORY_PLAN_INTERNAL_DEADLINE_SECONDS,
        limits=_trajectory_plan_limits(),
    )

    try:
        result = await _run_request_owned_thread(
            request,
            plan_interplanetary_route,
            ALL_BODIES,
            guard=_trajectory_plan_concurrent_guard,
            executor=_heavy_compute_executor,
            timeout_seconds=TRAJECTORY_PLAN_COMPUTE_TIMEOUT_SECONDS,
            owner_context=planning_context,
            from_id=payload.from_id,
            to_id=payload.to_id,
            departure_jd=validated.departure_jd,
            objective=validated.objective,
            max_assists=validated.max_assists,
            assist_pool=list(validated.effective_assist_pool),
            ephemeris_provider=payload.ephemeris_provider,
            prograde=payload.prograde,
            planning_context=planning_context,
        )
    except TrajectoryRequestRejected as exc:
        raise _trajectory_http_exception(422, exc.code, str(exc), context=exc.context) from exc
    except PlanningDeadlineExceeded as exc:
        raise _trajectory_http_exception(504, exc.code, str(exc), context=exc.context) from exc
    except PlanningBudgetExceeded as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except PlanningCancelled as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except EphemerisError as exc:
        raise _ephemeris_http_exception(exc) from exc
    except asyncio.TimeoutError as exc:
        planning_context.cancel("endpoint_timeout")
        raise _trajectory_http_exception(
            504,
            "trajectory_deadline_exceeded",
            "Trajectory planning exceeded its endpoint deadline.",
            context=planning_context.snapshot(),
        ) from exc

    if result.get("best") is None:
        search = result.get("search") if isinstance(result.get("search"), dict) else {}
        if search.get("budgetExhausted") or str(search.get("terminationReason", "")).endswith(
            "budget_exhausted"
        ):
            raise _trajectory_http_exception(
                503,
                "trajectory_compute_budget_exhausted",
                "The bounded trajectory search exhausted its work budget without a result.",
                context={"search": search},
            )
        raise _trajectory_http_exception(
            422,
            "trajectory_no_feasible_route",
            "No feasible route was found in the configured bounded search.",
            context={"search": search},
        )

    result["source"] = "backend"
    result["constraints"] = {
        "objective": validated.objective,
        "max_assists": validated.max_assists,
        "effective_assist_pool": list(validated.effective_assist_pool),
        "estimated_route_count": validated.estimated_route_count,
        "ephemeris_provider": payload.ephemeris_provider,
        "prograde": payload.prograde,
    }
    return result


@app.post("/trajectory/lambert")
async def trajectory_lambert(request: Request, payload: TrajectoryLambertRequest):
    if payload.from_id == payload.to_id:
        raise _trajectory_http_exception(
            400,
            "trajectory_same_body",
            "`from_id` and `to_id` must differ",
        )
    if payload.arrival_jd <= payload.departure_jd:
        raise _trajectory_http_exception(
            400,
            "trajectory_invalid_time_range",
            "`arrival_jd` must be greater than `departure_jd`",
        )
    if not math.isfinite(float(payload.arrival_jd) - float(payload.departure_jd)):
        raise _trajectory_http_exception(
            400,
            "trajectory_invalid_time_range",
            "The requested Lambert time of flight must be finite.",
        )

    _ensure_bodies_known((payload.from_id, "departure"), (payload.to_id, "destination"))
    try:
        _validate_trajectory_endpoint_pair(
            from_id=payload.from_id,
            to_id=payload.to_id,
            departure_jd=payload.departure_jd,
        )
    except TrajectoryRequestRejected as exc:
        raise _trajectory_http_exception(422, exc.code, str(exc), context=exc.context) from exc

    if not _acquire_nonblocking(_trajectory_lambert_concurrent_guard):
        raise _trajectory_http_exception(
            503,
            "trajectory_lambert_saturated",
            "Direct Lambert capacity is currently occupied. Retry shortly.",
            retryable=True,
            headers={"Retry-After": "2"},
        )

    planning_context = PlanningContext.with_timeout(
        TRAJECTORY_LAMBERT_INTERNAL_DEADLINE_SECONDS,
        limits=_trajectory_lambert_limits(),
    )

    try:
        result = await _run_request_owned_thread(
            request,
            solve_direct_lambert,
            ALL_BODIES,
            guard=_trajectory_lambert_concurrent_guard,
            executor=_heavy_compute_executor,
            timeout_seconds=TRAJECTORY_LAMBERT_COMPUTE_TIMEOUT_SECONDS,
            owner_context=planning_context,
            from_id=payload.from_id,
            to_id=payload.to_id,
            departure_jd=float(payload.departure_jd),
            arrival_jd=float(payload.arrival_jd),
            ephemeris_provider=payload.ephemeris_provider,
            prograde=payload.prograde,
            planning_context=planning_context,
        )
    except PlanningDeadlineExceeded as exc:
        raise _trajectory_http_exception(504, exc.code, str(exc), context=exc.context) from exc
    except PlanningBudgetExceeded as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except PlanningCancelled as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except TrajectoryRequestRejected as exc:
        status_code = 400 if exc.code in {
            "trajectory_same_body",
            "trajectory_invalid_time_range",
        } else 422
        raise _trajectory_http_exception(
            status_code,
            exc.code,
            str(exc),
            context=exc.context,
        ) from exc
    except EphemerisError as exc:
        raise _ephemeris_http_exception(exc) from exc
    except asyncio.TimeoutError as exc:
        planning_context.cancel("endpoint_timeout")
        raise _trajectory_http_exception(
            504,
            "trajectory_lambert_deadline_exceeded",
            "Direct Lambert computation exceeded its endpoint deadline.",
            context=planning_context.snapshot(),
        ) from exc

    if result.get("solution") is None:
        raise _trajectory_http_exception(
            422,
            "trajectory_no_lambert_solution",
            str(result.get("error", "No Lambert solution")),
        )
    return result


@app.post("/trajectory/porkchop")
async def trajectory_porkchop(request: Request, payload: TrajectoryPorkchopRequest):
    _enforce_trajectory_remote_search_policy(payload.ephemeris_provider, "porkchop")
    _enforce_porkchop_request_size(payload)
    if payload.from_id == payload.to_id:
        raise _trajectory_http_exception(
            400,
            "trajectory_same_body",
            "`from_id` and `to_id` must differ",
        )

    _ensure_bodies_known((payload.from_id, "departure"), (payload.to_id, "destination"))
    try:
        _validate_trajectory_endpoint_pair(
            from_id=payload.from_id,
            to_id=payload.to_id,
            departure_jd=payload.departure_start_jd,
        )
    except TrajectoryRequestRejected as exc:
        raise _trajectory_http_exception(422, exc.code, str(exc), context=exc.context) from exc

    if not _acquire_nonblocking(_trajectory_porkchop_concurrent_guard):
        raise _trajectory_http_exception(
            503,
            "trajectory_porkchop_saturated",
            "Trajectory porkchop capacity is currently occupied. Retry shortly.",
            retryable=True,
            headers={"Retry-After": "2"},
        )

    planning_context = PlanningContext.with_timeout(
        TRAJECTORY_PORKCHOP_INTERNAL_DEADLINE_SECONDS,
        limits=_trajectory_porkchop_limits(),
    )
    try:
        result = await _run_request_owned_thread(
            request,
            run_porkchop_scan,
            ALL_BODIES,
            guard=_trajectory_porkchop_concurrent_guard,
            executor=_heavy_compute_executor,
            timeout_seconds=TRAJECTORY_PORKCHOP_COMPUTE_TIMEOUT_SECONDS,
            owner_context=planning_context,
            from_id=payload.from_id,
            to_id=payload.to_id,
            departure_start_jd=float(payload.departure_start_jd),
            departure_end_jd=float(payload.departure_end_jd),
            departure_step_days=float(payload.departure_step_days),
            tof_min_days=float(payload.tof_min_days),
            tof_max_days=float(payload.tof_max_days),
            tof_step_days=float(payload.tof_step_days),
            ephemeris_provider=payload.ephemeris_provider,
            prograde=payload.prograde,
            cancel_event=planning_context.cancel_event,
            planning_context=planning_context,
        )
    except PlanningDeadlineExceeded as exc:
        raise _trajectory_http_exception(504, exc.code, str(exc), context=exc.context) from exc
    except PlanningBudgetExceeded as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except PlanningCancelled as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except TrajectoryRequestRejected as exc:
        status_code = 400 if exc.code in {
            "trajectory_same_body",
            "trajectory_invalid_time_range",
        } else 422
        raise _trajectory_http_exception(
            status_code,
            exc.code,
            str(exc),
            context=exc.context,
        ) from exc
    except EphemerisError as exc:
        raise _ephemeris_http_exception(exc) from exc
    except asyncio.TimeoutError as exc:
        planning_context.cancel("endpoint_timeout")
        raise _trajectory_http_exception(
            504,
            "trajectory_porkchop_deadline_exceeded",
            "Trajectory porkchop scan exceeded its endpoint deadline.",
            context=planning_context.snapshot(),
        ) from exc
    return result


@app.get("/mission/capabilities")
def mission_capabilities():
    return {
        "schema": {"name": "mission_capabilities", "version": 2},
        "agents": [
            "MissionPlannerAgent",
            "TrajectoryAgent",
            "MiningAgent",
            "LogisticsAgent",
            "VerifierAgent",
        ],
        "objective": "maximize(returned_payload_kg - propellant_used_kg - risk_penalty - time_penalty)",
        "services": [
            "ephemeris_service",
            "vehicle_service",
            "mining_service",
            "risk_service",
        ],
        "trajectory": {
            "defaultAssistPool": list(MISSION_CONFIGURED_DEFAULT_ASSIST_POOL),
            "maxAssistPoolSize": MISSION_PLAN_MAX_ASSIST_POOL_SIZE,
            "maxAssists": 3,
            "maxRouteTopologies": TRAJECTORY_PLAN_MAX_ROUTE_TOPOLOGIES,
            "providerPolicies": {
                "auto": "local_kepler",
                "horizons": "rejected_before_work",
            },
        },
        "limits": {
            "maxVehicleStages": MISSION_PLAN_MAX_VEHICLE_STAGES,
            "maxRiskSamples": MISSION_PLAN_MAX_RISK_SAMPLES,
            "internalDeadlineMs": int(MISSION_PLAN_INTERNAL_DEADLINE_SECONDS * 1_000),
            "timeoutMs": int(MISSION_PLAN_COMPUTE_TIMEOUT_SECONDS * 1_000),
            "maxConcurrentRequests": MISSION_PLAN_CONCURRENT_REQUEST_LIMIT,
        },
    }


@app.post("/mission/plan")
async def mission_plan(request: Request, payload: MissionPlanRequest):
    _enforce_trajectory_remote_search_policy(payload.ephemeris_provider, "mission")
    try:
        _validate_mission_trajectory_payload(payload)
    except TrajectoryRequestRejected as exc:
        raise _trajectory_http_exception(422, exc.code, str(exc), context=exc.context) from exc
    _enforce_mission_plan_request_size(payload)

    if not _acquire_nonblocking(_mission_plan_concurrent_guard):
        raise _trajectory_http_exception(
            503,
            "mission_plan_saturated",
            "Mission planning capacity is currently occupied. Retry shortly.",
            retryable=True,
            headers={"Retry-After": "2"},
        )

    mission_payload = payload.model_dump(exclude_none=True)
    if payload.assist_pool is None:
        mission_payload["assist_pool"] = list(MISSION_CONFIGURED_DEFAULT_ASSIST_POOL)
    planning_context = PlanningContext.with_timeout(
        MISSION_PLAN_INTERNAL_DEADLINE_SECONDS,
        limits=_mission_plan_limits(),
    )

    try:
        result = await _run_request_owned_thread(
            request,
            _run_mission_plan,
            mission_payload,
            planning_context,
            guard=_mission_plan_concurrent_guard,
            executor=_heavy_compute_executor,
            timeout_seconds=MISSION_PLAN_COMPUTE_TIMEOUT_SECONDS,
            owner_context=planning_context,
        )
    except PlanningDeadlineExceeded as exc:
        raise _trajectory_http_exception(504, exc.code, str(exc), context=exc.context) from exc
    except PlanningBudgetExceeded as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except PlanningCancelled as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except EphemerisError as exc:
        raise _ephemeris_http_exception(exc) from exc
    except TrajectoryRequestRejected as exc:
        raise _trajectory_http_exception(422, exc.code, str(exc), context=exc.context) from exc
    except asyncio.TimeoutError as exc:
        planning_context.cancel("endpoint_timeout")
        raise _trajectory_http_exception(
            504,
            "mission_deadline_exceeded",
            "Mission planning exceeded its endpoint deadline.",
            context=planning_context.snapshot(),
        ) from exc
    if (
        result.get("recommendation") is None
        and result.get("status") == "trajectory_search_inconclusive"
    ):
        raise _trajectory_http_exception(
            503,
            "trajectory_compute_budget_exhausted",
            "Mission trajectory search stopped at a bounded work limit before reaching a conclusive outcome.",
            retryable=True,
            context={"trajectorySearch": result.get("trajectorySearch", {})},
        )
    if result.get("recommendation") is None:
        raise _trajectory_http_exception(
            422,
            "mission_no_feasible_recommendation",
            str(result.get("status", "No feasible mission recommendation")),
        )
    return result


@app.get("/benchmark/accuracy")
async def benchmark_accuracy(request: Request, ephemeris_provider: str = "auto"):
    try:
        provider = _normalize_ephemeris_provider(ephemeris_provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"`ephemeris_provider` {exc}") from exc

    _enforce_trajectory_remote_search_policy(provider, "benchmark")
    if not _acquire_nonblocking(_benchmark_concurrent_guard):
        raise _trajectory_http_exception(
            503,
            "benchmark_saturated",
            "Trajectory benchmark capacity is currently occupied. Retry shortly.",
            retryable=True,
            headers={"Retry-After": "2"},
        )

    planning_context = PlanningContext.with_timeout(
        BENCHMARK_INTERNAL_DEADLINE_SECONDS,
        limits=_benchmark_limits(),
    )

    try:
        return await _run_request_owned_thread(
            request,
            benchmark_against_references,
            ALL_BODIES,
            ephemeris_provider=provider,
            planning_context=planning_context,
            guard=_benchmark_concurrent_guard,
            executor=_heavy_compute_executor,
            timeout_seconds=BENCHMARK_COMPUTE_TIMEOUT_SECONDS,
            owner_context=planning_context,
        )
    except PlanningDeadlineExceeded as exc:
        raise _trajectory_http_exception(504, exc.code, str(exc), context=exc.context) from exc
    except PlanningBudgetExceeded as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except PlanningCancelled as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except EphemerisError as exc:
        raise _ephemeris_http_exception(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asyncio.TimeoutError as exc:
        planning_context.cancel("endpoint_timeout")
        raise _trajectory_http_exception(
            504,
            "benchmark_deadline_exceeded",
            "Trajectory benchmark exceeded its endpoint deadline.",
            context=planning_context.snapshot(),
        ) from exc


@app.post("/benchmark/accuracy/report")
async def benchmark_accuracy_report(request: Request, payload: AccuracyReportRequest):
    _enforce_trajectory_remote_search_policy(payload.ephemeris_provider, "benchmark_report")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    output_path = _resolve_benchmark_report_path(
        payload.output_path,
        default_filename=f"ACCURACY_REPORT_{timestamp}.md",
    )
    if not _acquire_nonblocking(_benchmark_concurrent_guard):
        raise _trajectory_http_exception(
            503,
            "benchmark_saturated",
            "Trajectory benchmark capacity is currently occupied. Retry shortly.",
            retryable=True,
            headers={"Retry-After": "2"},
        )

    planning_context = PlanningContext.with_timeout(
        BENCHMARK_INTERNAL_DEADLINE_SECONDS,
        limits=_benchmark_limits(),
    )

    try:
        return await _run_request_owned_thread(
            request,
            generate_accuracy_report,
            ALL_BODIES,
            output_path=output_path,
            ephemeris_provider=payload.ephemeris_provider,
            allow_overwrite=payload.allow_overwrite,
            planning_context=planning_context,
            guard=_benchmark_concurrent_guard,
            executor=_heavy_compute_executor,
            timeout_seconds=BENCHMARK_COMPUTE_TIMEOUT_SECONDS,
            owner_context=planning_context,
        )
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PlanningDeadlineExceeded as exc:
        raise _trajectory_http_exception(504, exc.code, str(exc), context=exc.context) from exc
    except PlanningBudgetExceeded as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except PlanningCancelled as exc:
        raise _trajectory_http_exception(503, exc.code, str(exc), context=exc.context) from exc
    except EphemerisError as exc:
        raise _ephemeris_http_exception(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asyncio.TimeoutError as exc:
        planning_context.cancel("endpoint_timeout")
        raise _trajectory_http_exception(
            504,
            "benchmark_deadline_exceeded",
            "Trajectory benchmark report exceeded its endpoint deadline.",
            context=planning_context.snapshot(),
        ) from exc


# ── Simulation Runner (background thread) ────────────────────────────────────

class SimulationRunner:
    """Manages a simulation engine in a background thread at target FPS."""

    def __init__(self, engine: SimulationEngine, target_fps: int = 60):
        self.engine = engine
        self.kuiper = KuiperBeltEngine(particle_count=3_000)
        self.command_queue: queue.Queue = queue.Queue(maxsize=MAX_COMMAND_QUEUE)
        self.response_queue: queue.Queue = queue.Queue(maxsize=MAX_RESPONSE_QUEUE)
        self._state_lock = threading.Lock()
        self._latest_state: Optional[dict] = None
        self.time_scale: float = 4.0  # days per second
        self.paused: bool = False
        self.running: bool = True
        self.target_fps = target_fps
        self._frame_index: int = 0
        self._dropped_responses: int = 0
        self._runtime_error: Optional[str] = None
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def start(self):
        self._thread.start()

    def stop(self) -> bool:
        self.running = False
        cancel_pending = getattr(self.engine, "cancel_pending_operation", None)
        if callable(cancel_pending):
            cancel_pending()
        self._thread.join(timeout=3)
        return not self._thread.is_alive()

    def wait_until_stopped(self) -> None:
        self._thread.join()

    def send_command(self, cmd: dict) -> bool:
        try:
            self.command_queue.put_nowait(cmd)
            return True
        except queue.Full:
            self._push_error(
                "Command queue is full; command dropped",
                code="queue_overflow",
            )
            return False

    def get_latest_state(self) -> Optional[dict]:
        with self._state_lock:
            return self._latest_state

    def get_response(self) -> Optional[dict]:
        try:
            return self.response_queue.get_nowait()
        except queue.Empty:
            return None

    @staticmethod
    def _coerce_finite_float(value: Any) -> Optional[float]:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(parsed):
            return None
        return parsed

    @staticmethod
    def _coerce_vec3(value: Any) -> Optional[list[float]]:
        if not isinstance(value, (list, tuple)) or len(value) != 3:
            return None
        out = []
        for coord in value:
            scalar = SimulationRunner._coerce_finite_float(coord)
            if scalar is None:
                return None
            out.append(scalar)
        return out

    def _push_response(self, payload: dict) -> None:
        try:
            self.response_queue.put_nowait(payload)
        except queue.Full:
            self._dropped_responses += 1

    def _push_error(self, message: str, *, action: str = "", code: str = "bad_request") -> None:
        payload = {"type": "error", "message": message, "code": code}
        if action:
            payload["action"] = action
        self._push_response(payload)

    def _loop(self):
        frame_time = 1.0 / self.target_fps

        while self.running:
            self._frame_index += 1
            t0 = time.perf_counter()

            # ── Process commands ──────────────────────────────────────
            processed_commands = 0
            while processed_commands < MAX_COMMANDS_PER_FRAME:
                if not self.running:
                    break
                try:
                    cmd = self.command_queue.get_nowait()
                except queue.Empty:
                    break
                processed_commands += 1
                try:
                    self._handle_command(cmd)
                except Exception as exc:
                    if not self.running:
                        break
                    self._runtime_error = f"Command handling failed: {exc}"
                    self.paused = True
                    self._push_error(self._runtime_error, code="runtime_error")

            if not self.running:
                break

            if (not self.command_queue.empty()) and (self._frame_index % 60 == 0):
                self._push_error(
                    "Command throughput saturated; backend is applying backpressure",
                    code="queue_backpressure",
                )

            # ── Step simulation ───────────────────────────────────────
            if not self.paused and self._runtime_error is None:
                try:
                    dt_days = self.time_scale * frame_time
                    self.engine.step(dt_days)

                    if self.kuiper.active:
                        self.kuiper.step(dt_days)
                except Exception as exc:
                    self._runtime_error = f"Simulation step failed: {exc}"
                    self.paused = True
                    self._push_error(self._runtime_error, code="runtime_error")

            # ── Build state ───────────────────────────────────────────
            try:
                raw_state = self.engine.get_state()
            except Exception as exc:
                self._runtime_error = f"State generation failed: {exc}"
                self.paused = True
                self._push_error(self._runtime_error, code="runtime_error")
                raw_state = {
                    "type": "state_update",
                    "engine": self.engine.engine_name,
                    "fidelity": self.engine.fidelity_level,
                    "jd": self.engine.get_julian_date(),
                    "force_models": {},
                    "bodies": {},
                }
            normalized_state = normalize_state_update(
                raw_state,
                engine_name=self.engine.engine_name,
                fidelity=self.engine.fidelity_level,
                jd_fallback=self.engine.get_julian_date(),
            )
            state = attach_runtime_telemetry(
                normalized_state,
                paused=self.paused,
                time_scale=self.time_scale,
                energy_error=self.engine.get_energy_error(),
                backend={
                    "target_fps": self.target_fps,
                    "command_queue_depth": self.command_queue.qsize(),
                    "response_queue_depth": self.response_queue.qsize(),
                    "kuiper_active": self.kuiper.active,
                    "dropped_responses": self._dropped_responses,
                    "runtime_error": self._runtime_error,
                },
            )

            if self.kuiper.active and self.kuiper.should_send():
                try:
                    kuiper_particles = self.kuiper.get_state()
                    if kuiper_particles:
                        state["kuiper"] = kuiper_particles
                except Exception as exc:
                    self._runtime_error = f"Kuiper state failed: {exc}"
                    self.paused = True
                    self._push_error(self._runtime_error, code="runtime_error")

            with self._state_lock:
                self._latest_state = state

            # ── Frame pacing ──────────────────────────────────────────
            elapsed = time.perf_counter() - t0
            remaining = frame_time - elapsed
            if remaining > 0:
                time.sleep(remaining)

    def _handle_command(self, cmd: dict):
        if not isinstance(cmd, dict):
            self._push_error("Command payload must be a JSON object")
            return

        action_raw = cmd.get("type", "")
        action = action_raw.strip() if isinstance(action_raw, str) else ""
        if not action:
            self._push_error("Command requires a non-empty string `type` field")
            return

        if action == "set_time_scale":
            days_per_sec = self._coerce_finite_float(cmd.get("days_per_sec"))
            if days_per_sec is None:
                self._push_error("`set_time_scale` requires numeric `days_per_sec`", action=action)
                return
            # Keep bounded values to avoid accidental instability.
            self.time_scale = max(-365.0, min(365.0, days_per_sec))

        elif action == "pause":
            self.paused = True

        elif action == "resume":
            self.paused = False

        elif action == "set_julian_date":
            jd = self._coerce_finite_float(cmd.get("jd"))
            if jd is None:
                self._push_error("`set_julian_date` requires numeric `jd`", action=action)
                return
            engine_state = self.engine.get_state()
            jd_time_scale = engine_state.get("jd_time_scale")
            if jd_time_scale and cmd.get("jd_time_scale") != jd_time_scale:
                self._push_error(
                    "`set_julian_date` requires `jd_time_scale` matching the "
                    f"engine contract (`{jd_time_scale}`)",
                    action=action,
                )
                return
            supported_range = getattr(self.engine, "supported_jd_range", None)
            if supported_range is not None:
                min_jd, max_jd = supported_range
                if not min_jd <= jd <= max_jd:
                    self._push_error(
                        "`set_julian_date` is outside the engine's validated "
                        f"interval [{min_jd}, {max_jd}] {jd_time_scale or ''}".strip(),
                        action=action,
                        code="epoch_out_of_range",
                    )
                    return
            if abs(self.engine.get_julian_date() - jd) > 1e-12:
                self.engine.set_julian_date(jd)
            if self.kuiper.active:
                self.kuiper.deactivate()

        elif action == "activate_kuiper":
            center = self._coerce_vec3(cmd.get("center", [42.0, 0.0, 0.0]))
            if center is None:
                self._push_error("`activate_kuiper` requires `center` as [x,y,z] numbers", action=action)
                return
            spread = self._coerce_finite_float(cmd.get("spread", 5.0))
            if spread is None or spread <= 0:
                self._push_error("`activate_kuiper` requires positive numeric `spread`", action=action)
                return
            spread = max(0.25, min(40.0, spread))
            main_state = self.engine.get_state()
            bodies = main_state.get("bodies", {})

            sun = bodies.get("sun", {"pos": [0, 0, 0], "vel": [0, 0, 0]})
            neptune = bodies.get("neptune", {"pos": [30, 0, 0], "vel": [0, 0, 0]})
            jupiter = bodies.get("jupiter")
            saturn = bodies.get("saturn")

            declared_velocity_units = main_state.get("velocity_units")
            if not declared_velocity_units:
                self._push_error(
                    f"`activate_kuiper` requires the {self.engine.engine_name} engine to declare "
                    "`velocity_units` in its state payload; refusing to guess",
                    action=action,
                    code="kuiper_activation_failed",
                )
                return

            try:
                self.kuiper.activate(
                    sun_pos=sun["pos"], sun_vel=sun["vel"],
                    neptune_pos=neptune["pos"], neptune_vel=neptune["vel"],
                    center_au=center, spread_au=spread,
                    jupiter_pos=jupiter["pos"] if jupiter else None,
                    jupiter_vel=jupiter["vel"] if jupiter else None,
                    saturn_pos=saturn["pos"] if saturn else None,
                    saturn_vel=saturn["vel"] if saturn else None,
                    # No default: guessing here is what produced the original
                    # regression. An engine that does not declare its units is a
                    # contract violation, so refuse rather than pick one.
                    velocity_units=declared_velocity_units,
                )
            except KuiperActivationError as exc:
                # Surface this without latching `_runtime_error`: the main
                # simulation is unaffected, so the session must keep stepping.
                self.kuiper.deactivate()
                self._push_error(
                    f"`activate_kuiper` rejected: {exc}",
                    action=action,
                    code="kuiper_activation_failed",
                )
                return

        elif action == "deactivate_kuiper":
            self.kuiper.deactivate()

        elif action == "get_orbital_elements":
            body_id = cmd.get("body_id")
            if body_id:
                if not isinstance(body_id, str):
                    self._push_error("`get_orbital_elements` requires string `body_id`", action=action)
                    return
                canonical_ids = {body.lower(): body for body in self.engine.list_body_ids()}
                body_lookup = canonical_ids.get(body_id.lower(), body_id)
                elems = self.engine.get_orbital_elements(body_lookup)
                if elems:
                    self._push_response({
                        "type": "orbital_elements",
                        "body_id": body_lookup,
                        "elements": elems,
                    })
                else:
                    self._push_error(
                        f"No orbital elements available for `{body_lookup}`",
                        action=action,
                        code="not_available",
                    )
            else:
                self._push_error("`get_orbital_elements` requires `body_id`", action=action)
        else:
            self._push_error(f"Unsupported command type `{action}`", action=action, code="unsupported_command")


# ── WebSocket task helpers ────────────────────────────────────────────────────

async def _ws_receive_loop(websocket: WebSocket, runner: SimulationRunner):
    while True:
        raw = await websocket.receive_text()
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Invalid JSON payload",
            }))
            continue
        if not isinstance(msg, dict):
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Payload must be a JSON object",
            }))
            continue
        if not runner.send_command(msg):
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Command queue is full; retry shortly",
                "code": "queue_overflow",
            }))


async def _ws_send_loop(websocket: WebSocket, runner: SimulationRunner, stream_hz: float):
    interval = 1.0 / max(1.0, stream_hz)
    last_jd: Optional[float] = None
    idle_frames = 0
    idle_send_interval = max(1, int(stream_hz // 3))

    while True:
        resp = runner.get_response()
        while resp is not None:
            await websocket.send_text(json.dumps(resp))
            resp = runner.get_response()

        state = runner.get_latest_state()
        if state:
            jd = float(state.get("jd", 0.0))
            has_kuiper_payload = "kuiper" in state
            should_send = (
                has_kuiper_payload
                or last_jd is None
                or abs(jd - last_jd) > 1e-12
                or idle_frames >= idle_send_interval
            )
            if should_send:
                await websocket.send_text(json.dumps(state))
                last_jd = jd
                idle_frames = 0
            else:
                idle_frames += 1

        await asyncio.sleep(interval)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

async def _serve_simulation_websocket(websocket: WebSocket) -> None:
    # Select engine and integrator from query params
    engine_requested = websocket.query_params.get("engine", DEFAULT_ENGINE).lower()
    integrator_requested = websocket.query_params.get("integrator", DEFAULT_INTEGRATOR).lower()
    protocol_requested_raw = websocket.query_params.get("protocol_version")
    integrator = integrator_requested if integrator_requested in SUPPORTED_INTEGRATORS else DEFAULT_INTEGRATOR

    # Initialize requested engine
    warnings = []
    protocol_requested: int | None = None
    if protocol_requested_raw is not None:
        try:
            protocol_requested = int(protocol_requested_raw)
        except (TypeError, ValueError):
            warnings.append(
                f"Invalid protocol_version `{protocol_requested_raw}`; server uses `{WS_PROTOCOL_VERSION}`"
            )
            protocol_requested = None
    if protocol_requested is not None and protocol_requested != WS_PROTOCOL_VERSION:
        warnings.append(
            f"Protocol version mismatch: client `{protocol_requested}` vs server `{WS_PROTOCOL_VERSION}`"
        )

    if integrator != integrator_requested:
        warnings.append(
            f"Unsupported integrator `{integrator_requested}`; using `{integrator}`"
        )

    rebound_status = _rebound_readiness()
    rebound_ready = bool(rebound_status.get("available", False))
    tudatpy_ready = _tudatpy_available()

    engine: Optional[SimulationEngine] = None
    if engine_requested == "tudatpy":
        if tudatpy_ready and TudatPyEngine is not None:
            enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
            engine = TudatPyEngine(enable_j2=enable_j2)
        elif rebound_ready:
            warnings.append("Engine `tudatpy` unavailable; using `rebound`")
            engine = REBOUNDEngine(integrator=integrator)
    elif engine_requested == "rebound":
        if rebound_ready:
            engine = REBOUNDEngine(integrator=integrator)
        elif tudatpy_ready and TudatPyEngine is not None:
            warnings.append("Engine `rebound` unavailable; using `tudatpy`")
            enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
            engine = TudatPyEngine(enable_j2=enable_j2)
    else:
        warnings.append(f"Unknown engine `{engine_requested}`; selecting available engine")
        if rebound_ready:
            engine = REBOUNDEngine(integrator=integrator)
        elif tudatpy_ready and TudatPyEngine is not None:
            enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
            engine = TudatPyEngine(enable_j2=enable_j2)

    if engine is None:
        rebound_reason = rebound_status.get("error") or "unavailable"
        await websocket.send_text(json.dumps({
            "type": "error",
            "code": "engine_unavailable",
            "message": (
                "No simulation engines are available. "
                f"REBOUND readiness failed: {rebound_reason}"
            ),
        }))
        await websocket.close(code=1013)
        return

    try:
        engine.initialize(ALL_BODIES)
    except Exception as exc:
        await websocket.send_text(json.dumps({
            "type": "error",
            "code": "engine_init_failed",
            "message": str(exc),
        }))
        await websocket.close(code=1011)
        return

    initial_state = engine.get_state()

    target_fps_raw = websocket.query_params.get("fps", "60")
    stream_hz_raw = websocket.query_params.get("stream_hz", "60")
    try:
        target_fps = max(10, min(240, int(float(target_fps_raw))))
    except Exception:
        target_fps = 60
    try:
        stream_hz = max(5.0, min(240.0, float(stream_hz_raw)))
    except Exception:
        stream_hz = float(target_fps)

    runner = SimulationRunner(engine, target_fps=target_fps)
    runner.start()

    # Notify client of connection
    await websocket.send_text(json.dumps({
        "type": "connected",
        "protocol_version": WS_PROTOCOL_VERSION,
        "protocol_version_requested": protocol_requested,
        "engine": engine.engine_name,
        "engine_requested": engine_requested,
        "integrator": integrator,
        "integrator_requested": integrator_requested,
        "fidelity": engine.fidelity_level,
        "bodies": engine.list_body_ids(),
        "jd": engine.get_julian_date(),
        "jd_time_scale": initial_state.get("jd_time_scale"),
        "fps": target_fps,
        "stream_hz": stream_hz,
        "warnings": warnings,
    }))

    try:
        receive_task = asyncio.create_task(_ws_receive_loop(websocket, runner))
        send_task = asyncio.create_task(_ws_send_loop(websocket, runner, stream_hz=stream_hz))
        done, pending = await asyncio.wait(
            {receive_task, send_task},
            return_when=asyncio.FIRST_EXCEPTION,
        )

        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        for task in done:
            if task.cancelled():
                continue
            exc = task.exception()
            if exc is None:
                continue
            if isinstance(exc, WebSocketDisconnect):
                raise exc
            raise exc
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[ws/sim] error: {exc}")
    finally:
        if not runner.stop():
            # Keep the owning connection/admission permit alive until the
            # actual worker exits; a three-second join timeout is not proof of
            # cleanup.
            await asyncio.to_thread(runner.wait_until_stopped)


@app.websocket("/ws/sim")
async def simulation_websocket(websocket: WebSocket):
    if not _websocket_origin_allowed(websocket):
        await websocket.close(code=1008, reason="WebSocket origin is not allowed")
        return
    if not _try_acquire_ws_sim_slot():
        await websocket.close(code=1013, reason="Simulation capacity is exhausted")
        return

    try:
        await websocket.accept()
        await _serve_simulation_websocket(websocket)
    finally:
        _release_ws_sim_slot()


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host=SOLAR_SECURITY_CONFIG.default_bind_host,
        port=8042,
        proxy_headers=False,
        reload=SOLAR_SECURITY_CONFIG.profile == "local",
    )
