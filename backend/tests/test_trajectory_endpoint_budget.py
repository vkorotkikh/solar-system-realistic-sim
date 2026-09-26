from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

import server
from mission.ephemeris_service import EphemerisProtocolError, EphemerisProviderUnavailable


client = TestClient(server.app, raise_server_exceptions=False)


def _plan_payload(**overrides):
    payload = {
        "from_id": "earth",
        "to_id": "jupiter",
        "departure_jd": 2_460_500.5,
        "objective": "min_distance",
        "max_assists": 3,
        "assist_pool": [],
        "ephemeris_provider": "kepler",
        "prograde": True,
    }
    payload.update(overrides)
    return payload


def test_trajectory_capabilities_publish_runtime_limits_and_provider_policy() -> None:
    response = client.get("/trajectory/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == {"name": "trajectory_capabilities", "version": 2}
    assert payload["limits"]["maxAssistPoolSize"] == 8
    assert payload["limits"]["maxRequestBodyBytes"] == 32 * 1_024
    assert payload["limits"]["maxRouteTopologies"] == 401
    assert payload["limits"]["globalBeamWidth"] == 12
    assert payload["limits"]["maxRoutePrefixes"] == 256
    assert payload["limits"]["maxLegEvaluations"] == 2_000
    assert payload["limits"]["maxCompletedRoutesRetained"] == 48
    assert payload["limits"]["maxReturnedAlternatives"] == 5
    assert payload["limits"]["maxAssistTofSeedsPerExtension"] == 8
    assert payload["limits"]["maxDirectTofSeeds"] == 15
    assert "maxTofSeedsPerExtension" not in payload["limits"]
    assert payload["limits"]["maxPorkchopGridPoints"] == 2_000
    assert payload["limits"]["maxPorkchopUniqueEphemerisStates"] == 2_000
    assert payload["limits"]["maximumPlanLegTofDays"] == 2_000.0
    assert len(payload["default_assist_pool"]) <= payload["limits"]["maxAssistPoolSize"]
    assert (
        server.estimate_route_count(len(payload["default_assist_pool"]), 3)
        <= payload["limits"]["maxRouteTopologies"]
    )
    assert (
        payload["limits"]["maxRequestsPerRateWindow"]
        == server.TRAJECTORY_RATE_LIMIT_PER_WINDOW
    )
    assert server.TRAJECTORY_PORKCHOP_MAX_GRID_POINTS == 2_000
    assert payload["providerPolicies"]["auto"]["networkAccess"] is False
    assert payload["providerPolicies"]["auto"]["resolvedProvider"] == "kepler"
    assert "benchmark" in payload["providerPolicies"]["auto"]["operations"]
    assert "benchmark" in payload["providerPolicies"]["spice"]["operations"]
    assert "benchmark" in payload["providerPolicies"]["kepler"]["operations"]
    assert payload["providerPolicies"]["horizons"]["operations"] == ["lambert"]
    assert payload["providerPolicies"]["horizons"]["absoluteRequestTimeoutMs"] == 2_500
    assert payload["providerPolicies"]["horizons"]["globalConcurrencyPerProcess"] == 1
    assert payload["providerPolicies"]["horizons"]["automaticRetries"] == 0
    assert payload["providerPolicies"]["horizons"]["successCacheMaxEntries"] == 4_096
    assert payload["providerPolicies"]["horizons"]["sameKeySingleFlight"] is True
    assert payload["providerPolicies"]["horizons"]["halfOpenProbeLimit"] == 1
    assert payload["providerPolicies"]["horizons"]["outageCooldownSeconds"] == {
        "minimum": 30.0,
        "maximum": 60.0,
    }
    assert payload["providerPolicies"]["horizons"]["directLambertOnly"] is True
    assert payload["providerPolicies"]["horizons"]["remoteFinalistVerification"] is False
    assert "earth" in payload["assist_body_ids"]
    assert "sun" not in payload["assist_body_ids"]
    assert "moon" not in payload["assist_body_ids"]
    assert payload["stateVectorContract"] == {
        "frameId": "heliocentric_ecliptic_j2000_geometric",
        "origin": "sun_center",
        "orientation": "ecliptic_j2000",
        "epochCoordinate": "julian_date",
        "timeScale": "TDB",
        "positionUnit": "AU",
        "velocityUnit": "AU/day",
        "corrections": "NONE",
    }
    assert payload["lambert"]["supportedRevolutions"] == [0]
    assert payload["providerSemantics"]["fallbackAfterFailure"] is False
    assert payload["searchSemantics"]["remoteFinalistVerification"] is False
    assert {
        limitation["code"] for limitation in payload["knownLimitations"]
    } >= {
        "bounded_approximate_search",
        "zero_revolution_lambert_only",
        "remote_finalist_verification_unavailable",
        "bounded_plan_tof_seeds",
        "path_length_is_endpoint_chord_metric",
        "assist_gain_is_velocity_deflection",
    }


def test_trajectory_ingress_middleware_order_is_cors_rate_then_body_limit() -> None:
    middleware_classes = [entry.cls for entry in server.app.user_middleware]

    assert middleware_classes.index(server.CORSMiddleware) < middleware_classes.index(
        server._TrajectoryRateLimitMiddleware
    )
    assert middleware_classes.index(
        server._TrajectoryRateLimitMiddleware
    ) < middleware_classes.index(server._RequestBodyLimitMiddleware)


def test_server_side_resource_knobs_have_compile_time_ceiling() -> None:
    assert server.TRAJECTORY_PORKCHOP_MAX_DEPARTURE_WINDOW_DAYS <= 3_650.0
    assert server.TRAJECTORY_PORKCHOP_MAX_TOF_WINDOW_DAYS <= 3_650.0
    assert server.TRAJECTORY_PORKCHOP_CONCURRENT_REQUEST_LIMIT <= 2
    assert server.MISSION_PLAN_MAX_RISK_SAMPLES <= 5_000
    assert server.MISSION_PLAN_MAX_VEHICLE_STAGES <= 12
    assert server.MISSION_PLAN_MAX_PAYLOAD_MASS_KG <= 5_000_000.0
    assert server.MISSION_PLAN_CONCURRENT_REQUEST_LIMIT <= 1
    assert server.SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT <= 2
    assert server.HEAVY_COMPUTE_THREAD_LIMIT <= 2
    assert server.TRAJECTORY_RATE_LIMIT_PER_WINDOW <= 60
    assert server.TRAJECTORY_RATE_LIMIT_WINDOW_SECONDS >= 60.0


def test_lowered_configuration_always_derives_a_valid_implicit_assist_pool() -> None:
    assert server._configured_default_assist_pool(
        max_pool_size=1,
        max_route_topologies=1,
    ) == ()
    one_assist = server._configured_default_assist_pool(
        max_pool_size=1,
        max_route_topologies=2,
    )
    assert one_assist == (server.DEFAULT_ASSIST_POOL[0],)
    assert server.estimate_route_count(len(one_assist), 3) <= 2


def test_mission_capabilities_publish_configured_trajectory_defaults_and_limits() -> None:
    response = client.get("/mission/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == {"name": "mission_capabilities", "version": 2}
    trajectory = payload["trajectory"]
    assert len(trajectory["defaultAssistPool"]) <= trajectory["maxAssistPoolSize"]
    assert (
        server.estimate_route_count(len(trajectory["defaultAssistPool"]), 3)
        <= trajectory["maxRouteTopologies"]
    )
    assert payload["limits"]["maxVehicleStages"] <= 12


def test_trajectory_rate_limiter_rejects_before_body_read_and_recovers_deterministically() -> None:
    now = [100.0]
    inner_calls = 0
    receive_calls = 0

    async def inner(_scope, receive, _send):
        nonlocal inner_calls
        inner_calls += 1
        await receive()

    middleware = server._TrajectoryRateLimitMiddleware(
        inner,
        max_requests=2,
        window_seconds=10.0,
        max_identities=2,
        paths={"/trajectory/plan"},
        clock=lambda: now[0],
    )

    async def invoke(host: str = "192.0.2.10"):
        nonlocal receive_calls
        sent = []

        async def receive():
            nonlocal receive_calls
            receive_calls += 1
            return {"type": "http.request", "body": b"{}", "more_body": False}

        async def send(message):
            sent.append(message)

        await middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/trajectory/plan",
                "headers": [],
                "client": (host, 1234),
            },
            receive,
            send,
        )
        return sent

    assert asyncio.run(invoke()) == []
    assert asyncio.run(invoke()) == []
    rejected = asyncio.run(invoke())
    assert rejected[0]["status"] == 429
    assert (b"retry-after", b"10") in rejected[0]["headers"]
    assert b"trajectory_rate_limit_exceeded" in rejected[1]["body"]
    assert inner_calls == 2
    assert receive_calls == 2

    now[0] += 10.1
    assert asyncio.run(invoke()) == []
    assert inner_calls == 3

    asyncio.run(invoke("192.0.2.11"))
    asyncio.run(invoke("192.0.2.12"))
    assert len(middleware._requests) <= 2


def test_network_trajectory_rate_limit_uses_bounded_authenticated_subjects(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        server._load_solar_security_config(
            {
                "SOLAR_SECURITY_PROFILE": "network",
                "SOLAR_PHYSICS_API_KEYS": "rate-limit-network-secret",
            }
        ),
    )
    inner_calls = 0

    async def inner(_scope, _receive, _send):
        nonlocal inner_calls
        inner_calls += 1

    middleware = server._TrajectoryRateLimitMiddleware(
        inner,
        max_requests=1,
        window_seconds=60.0,
        max_identities=2,
        paths={"/trajectory/plan"},
        clock=lambda: 100.0,
    )

    async def invoke(subject: str, host: str):
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"{}", "more_body": False}

        async def send(message):
            sent.append(message)

        await middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/trajectory/plan",
                "headers": [],
                "client": (host, 1234),
                "state": {"authenticated_subject": subject},
            },
            receive,
            send,
        )
        return sent

    subject_a = f"credential:sha256:{'a' * 64}"
    subject_b = f"credential:sha256:{'b' * 64}"
    subject_c = f"credential:sha256:{'c' * 64}"

    assert asyncio.run(invoke(subject_a, "10.0.0.9")) == []
    assert asyncio.run(invoke(subject_b, "10.0.0.9")) == []
    repeated_subject = asyncio.run(invoke(subject_a, "10.0.0.10"))
    assert repeated_subject[0]["status"] == 429

    assert asyncio.run(invoke(subject_c, "10.0.0.11")) == []
    assert len(middleware._requests) == 2
    assert set(middleware._requests) == {subject_a, subject_c}
    assert inner_calls == 3


def test_local_trajectory_rate_limit_retains_peer_identity(monkeypatch) -> None:
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        server._load_solar_security_config({"SOLAR_SECURITY_PROFILE": "local"}),
    )

    middleware = server._TrajectoryRateLimitMiddleware(
        lambda *_args: None,
        max_requests=1,
        window_seconds=60.0,
        max_identities=2,
        paths={"/trajectory/plan"},
        clock=lambda: 100.0,
    )
    scope_a = {
        "client": ("192.0.2.10", 1234),
        "state": {"authenticated_subject": f"credential:sha256:{'a' * 64}"},
    }
    scope_b = {
        "client": ("192.0.2.10", 1234),
        "state": {"authenticated_subject": f"credential:sha256:{'b' * 64}"},
    }

    identity_a = middleware._identity(scope_a)
    identity_b = middleware._identity(scope_b)

    assert identity_a == "192.0.2.10"
    assert identity_b == identity_a
    assert middleware._retry_after(identity_a) is None
    assert middleware._retry_after(identity_b) == 60


def test_network_trajectory_rate_identity_rejects_oversized_subject(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        server._load_solar_security_config(
            {
                "SOLAR_SECURITY_PROFILE": "network",
                "SOLAR_PHYSICS_API_KEYS": "bounded-rate-identity-secret",
            }
        ),
    )
    middleware = server._TrajectoryRateLimitMiddleware(
        lambda *_args: None,
        max_requests=1,
        window_seconds=60.0,
        max_identities=2,
        paths={"/trajectory/plan"},
    )
    scope = {
        "client": ("192.0.2.44", 1234),
        "state": {"authenticated_subject": "x" * 10_000},
    }

    identity = middleware._identity(scope)

    assert identity == "192.0.2.44"
    assert len(identity.encode("utf-8")) <= 255


def test_plan_rejects_duplicate_assists_before_worker_submission(monkeypatch) -> None:
    invoked = False

    def fail_if_invoked(*_args, **_kwargs):
        nonlocal invoked
        invoked = True
        raise AssertionError("planner must not run")

    monkeypatch.setattr(server, "plan_interplanetary_route", fail_if_invoked)
    response = client.post(
        "/trajectory/plan",
        json=_plan_payload(assist_pool=["venus", "VENUS"]),
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "trajectory_duplicate_assist"
    assert invoked is False


def test_plan_rejects_large_pool_before_worker_submission(monkeypatch) -> None:
    monkeypatch.setattr(
        server,
        "plan_interplanetary_route",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("planner must not run")),
    )
    response = client.post(
        "/trajectory/plan",
        json=_plan_payload(
            assist_pool=[
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
        ),
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "trajectory_complexity_limit"
    assert detail["context"]["assistPoolSize"] == 9


def test_trajectory_body_limit_rejects_before_json_validation_or_worker(monkeypatch) -> None:
    invoked = False

    def fail_if_invoked(*_args, **_kwargs):
        nonlocal invoked
        invoked = True
        raise AssertionError("planner must not run")

    monkeypatch.setattr(server, "plan_interplanetary_route", fail_if_invoked)
    response = client.post(
        "/trajectory/plan",
        content=b"x" * (server.TRAJECTORY_REQUEST_MAX_BODY_BYTES + 1),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413
    detail = response.json()["detail"]
    assert detail["code"] == "trajectory_request_body_too_large"
    assert detail["context"]["maximumBodyBytes"] == 32 * 1_024
    assert invoked is False


def test_trajectory_body_limit_error_preserves_cors_contract() -> None:
    response = client.post(
        "/trajectory/plan",
        content=b"x" * (server.TRAJECTORY_REQUEST_MAX_BODY_BYTES + 1),
        headers={
            "Content-Type": "application/json",
            "Origin": "http://localhost:3000",
        },
    )

    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.json()["detail"]["code"] == "trajectory_request_body_too_large"


def test_trajectory_body_limit_counts_chunked_messages_without_content_length() -> None:
    inner_called = False
    sent = []
    messages = iter(
        [
            {"type": "http.request", "body": b"12345", "more_body": True},
            {"type": "http.request", "body": b"67890", "more_body": False},
        ]
    )

    async def inner(_scope, _receive, _send):
        nonlocal inner_called
        inner_called = True

    async def receive():
        return next(messages)

    async def send(message):
        sent.append(message)

    middleware = server._RequestBodyLimitMiddleware(
        inner,
        max_body_bytes=8,
        paths={"/trajectory/plan"},
    )
    asyncio.run(
        middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/trajectory/plan",
                "headers": [],
            },
            receive,
            send,
        )
    )

    assert inner_called is False
    assert sent[0]["type"] == "http.response.start"
    assert sent[0]["status"] == 413


def test_trajectory_body_limit_rejects_unbounded_empty_chunk_stream() -> None:
    inner_called = False
    sent = []

    async def inner(_scope, _receive, _send):
        nonlocal inner_called
        inner_called = True

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": True}

    async def send(message):
        sent.append(message)

    middleware = server._RequestBodyLimitMiddleware(
        inner,
        max_body_bytes=8,
        max_body_messages=3,
        paths={"/trajectory/plan"},
    )
    asyncio.run(
        middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/trajectory/plan",
                "headers": [],
            },
            receive,
            send,
        )
    )

    assert inner_called is False
    assert sent[0]["status"] == 413


def test_request_schema_caps_body_identifier_length() -> None:
    response = client.post(
        "/trajectory/plan",
        json=_plan_payload(from_id="x" * 65),
    )

    assert response.status_code == 422
    assert "64 characters" in response.text


def test_request_schema_failure_uses_structured_trajectory_error_contract() -> None:
    response = client.post(
        "/trajectory/plan",
        json=_plan_payload(from_id=123),
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "trajectory_request_validation_error"
    assert detail["retryable"] is False
    assert any(
        error["location"][-1] == "from_id"
        for error in detail["context"]["errors"]
    )


def test_unknown_body_error_is_structured() -> None:
    response = client.post(
        "/trajectory/plan",
        json=_plan_payload(from_id="unknown-world"),
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "trajectory_unknown_body"
    assert detail["context"] == {"bodyId": "unknown-world", "role": "departure"}


def test_explicit_empty_pool_reaches_planner_as_empty(monkeypatch) -> None:
    observed = {}

    def fake_plan(*_args, **kwargs):
        observed.update(kwargs)
        return {"best": {"legs": []}, "alternatives": [], "search": {"complete": True}}

    monkeypatch.setattr(server, "_trajectory_plan_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "plan_interplanetary_route", fake_plan)
    response = client.post("/trajectory/plan", json=_plan_payload(assist_pool=[]))

    assert response.status_code == 200
    assert observed["assist_pool"] == []
    assert observed["planning_context"].limits.leg_evaluations == 2_000
    assert response.json()["constraints"]["estimated_route_count"] == 1


def test_plan_saturation_is_immediate_and_structured(monkeypatch) -> None:
    monkeypatch.setattr(server, "_trajectory_plan_concurrent_guard", threading.BoundedSemaphore(0))

    response = client.post("/trajectory/plan", json=_plan_payload())

    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    detail = response.json()["detail"]
    assert detail["code"] == "trajectory_saturated"
    assert detail["retryable"] is True


def test_plan_temporarily_rejects_explicit_horizons_before_admission() -> None:
    response = client.post(
        "/trajectory/plan",
        json=_plan_payload(ephemeris_provider="horizons"),
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "ephemeris_provider_not_supported_for_operation"
    assert detail["context"] == {"provider": "horizons", "operation": "plan"}


def test_lambert_runs_on_owned_worker_with_tight_budget(monkeypatch) -> None:
    observed = {}

    def fake_lambert(*_args, **kwargs):
        observed.update(kwargs)
        return {"solution": {"fromId": "earth", "toId": "mars"}}

    monkeypatch.setattr(server, "_trajectory_lambert_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "solve_direct_lambert", fake_lambert)
    response = client.post(
        "/trajectory/lambert",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_jd": 2_460_500.5,
            "arrival_jd": 2_460_750.5,
            "ephemeris_provider": "kepler",
            "prograde": True,
        },
    )

    assert response.status_code == 200
    limits = observed["planning_context"].limits
    assert limits.leg_evaluations == 1
    assert limits.external_requests == 2
    assert limits.remote_ephemeris_states == 2


def test_lambert_rejects_orbitless_endpoint_before_worker_submission(monkeypatch) -> None:
    invoked = False

    def fail_if_invoked(*_args, **_kwargs):
        nonlocal invoked
        invoked = True
        raise AssertionError("Lambert worker must not run")

    monkeypatch.setattr(server, "solve_direct_lambert", fail_if_invoked)
    response = client.post(
        "/trajectory/lambert",
        json={
            "from_id": "sun",
            "to_id": "earth",
            "departure_jd": 2_460_500.5,
            "arrival_jd": 2_460_750.5,
            "ephemeris_provider": "kepler",
            "prograde": True,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "trajectory_invalid_endpoint_body"
    assert invoked is False


def test_search_budget_exhaustion_is_not_reported_as_physical_infeasibility(monkeypatch) -> None:
    def fake_plan(*_args, **_kwargs):
        return {
            "best": None,
            "alternatives": [],
            "search": {
                "budgetExhausted": True,
                "terminationReason": "leg_evaluations_budget_exhausted",
            },
        }

    monkeypatch.setattr(server, "_trajectory_plan_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "plan_interplanetary_route", fake_plan)
    response = client.post("/trajectory/plan", json=_plan_payload())

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "trajectory_compute_budget_exhausted"


def test_typed_ephemeris_failure_maps_to_structured_503(monkeypatch) -> None:
    def fail_provider(*_args, **_kwargs):
        raise EphemerisProviderUnavailable(
            "SPICE is not installed",
            provider="spice",
            retry_after_s=4.1,
        )

    monkeypatch.setattr(server, "_trajectory_plan_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "plan_interplanetary_route", fail_provider)
    response = client.post(
        "/trajectory/plan",
        json=_plan_payload(ephemeris_provider="spice"),
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"
    detail = response.json()["detail"]
    assert detail["code"] == "ephemeris_provider_unavailable"
    assert detail["context"]["provider"] == "spice"


def test_typed_ephemeris_protocol_failure_maps_to_502(monkeypatch) -> None:
    def fail_protocol(*_args, **_kwargs):
        raise EphemerisProtocolError("Malformed upstream vectors", provider="horizons")

    monkeypatch.setattr(server, "_trajectory_lambert_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "solve_direct_lambert", fail_protocol)
    response = client.post(
        "/trajectory/lambert",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_jd": 2_460_500.5,
            "arrival_jd": 2_460_750.5,
            "ephemeris_provider": "horizons",
            "prograde": True,
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "ephemeris_protocol_error"


def test_porkchop_uses_request_owned_context(monkeypatch) -> None:
    observed = {}

    def fake_scan(*_args, **kwargs):
        observed.update(kwargs)
        return {"best": None, "points": [], "count": 0}

    monkeypatch.setattr(server, "_trajectory_porkchop_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "run_porkchop_scan", fake_scan)
    response = client.post(
        "/trajectory/porkchop",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_start_jd": 2_460_500.5,
            "departure_end_jd": 2_460_520.5,
            "departure_step_days": 10.0,
            "tof_min_days": 80.0,
            "tof_max_days": 120.0,
            "tof_step_days": 20.0,
            "ephemeris_provider": "kepler",
            "prograde": True,
        },
    )

    assert response.status_code == 200
    context = observed["planning_context"]
    assert observed["cancel_event"] is context.cancel_event
    assert context.limits.leg_evaluations == server.TRAJECTORY_PORKCHOP_MAX_GRID_POINTS
    assert context.limits.external_requests == 0


def test_porkchop_range_and_complexity_errors_are_structured() -> None:
    base = {
        "from_id": "earth",
        "to_id": "mars",
        "departure_start_jd": 2_460_500.5,
        "departure_end_jd": 2_460_500.5,
        "departure_step_days": 10.0,
        "tof_min_days": 80.0,
        "tof_max_days": 120.0,
        "tof_step_days": 20.0,
        "ephemeris_provider": "kepler",
        "prograde": True,
    }
    invalid_range = client.post("/trajectory/porkchop", json=base)
    assert invalid_range.status_code == 400
    assert invalid_range.json()["detail"]["code"] == "trajectory_invalid_time_range"

    oversized = client.post(
        "/trajectory/porkchop",
        json={**base, "departure_end_jd": 2_464_151.5},
    )
    assert oversized.status_code == 413
    assert oversized.json()["detail"]["code"] == "trajectory_complexity_limit"


def test_porkchop_core_minimum_and_unique_state_budget_are_enforced_before_work(
    monkeypatch,
) -> None:
    invoked = False

    def forbidden_scan(*_args, **_kwargs):
        nonlocal invoked
        invoked = True
        raise AssertionError("invalid porkchop request reached its worker")

    monkeypatch.setattr(server, "run_porkchop_scan", forbidden_scan)
    base = {
        "from_id": "earth",
        "to_id": "mars",
        "departure_start_jd": 2_460_000.5,
        "departure_end_jd": 2_460_010.5,
        "departure_step_days": 0.1,
        "tof_min_days": 100.0,
        "tof_max_days": 101.0,
        "tof_step_days": 5.0,
        "ephemeris_provider": "kepler",
        "prograde": True,
    }

    too_fine = client.post("/trajectory/porkchop", json=base)
    assert too_fine.status_code == 400
    assert too_fine.json()["detail"]["code"] == "trajectory_invalid_time_range"

    state_heavy = client.post(
        "/trajectory/porkchop",
        json={
            **base,
            "departure_end_jd": 2_461_000.0,
            "departure_step_days": 0.5,
        },
    )
    assert state_heavy.status_code == 413
    detail = state_heavy.json()["detail"]
    assert detail["code"] == "trajectory_complexity_limit"
    assert detail["context"]["estimatedGridPoints"] == 2_000
    assert detail["context"]["estimatedUniqueEphemerisStates"] == 4_000
    assert invoked is False


def test_porkchop_internal_value_error_is_not_mislabeled_as_bad_input(monkeypatch) -> None:
    monkeypatch.setattr(server, "_trajectory_porkchop_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(
        server,
        "run_porkchop_scan",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("internal invariant")),
    )
    response = client.post(
        "/trajectory/porkchop",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_start_jd": 2_460_500.5,
            "departure_end_jd": 2_460_520.5,
            "departure_step_days": 10.0,
            "tof_min_days": 80.0,
            "tof_max_days": 120.0,
            "tof_step_days": 20.0,
            "ephemeris_provider": "kepler",
            "prograde": True,
        },
    )

    assert response.status_code == 500


def test_porkchop_temporarily_rejects_explicit_horizons() -> None:
    response = client.post(
        "/trajectory/porkchop",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_start_jd": 2_460_500.5,
            "departure_end_jd": 2_460_520.5,
            "departure_step_days": 10.0,
            "tof_min_days": 80.0,
            "tof_max_days": 120.0,
            "tof_step_days": 20.0,
            "ephemeris_provider": "horizons",
            "prograde": True,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "ephemeris_provider_not_supported_for_operation"


def test_porkchop_saturation_is_structured(monkeypatch) -> None:
    monkeypatch.setattr(server, "_trajectory_porkchop_concurrent_guard", threading.BoundedSemaphore(0))
    response = client.post(
        "/trajectory/porkchop",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_start_jd": 2_460_500.5,
            "departure_end_jd": 2_460_520.5,
            "departure_step_days": 10.0,
            "tof_min_days": 80.0,
            "tof_max_days": 120.0,
            "tof_step_days": 20.0,
            "ephemeris_provider": "kepler",
            "prograde": True,
        },
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert response.json()["detail"]["code"] == "trajectory_porkchop_saturated"


def test_mission_rejects_duplicate_assists_before_worker_submission(monkeypatch) -> None:
    invoked = False

    def fail_if_invoked(*_args, **_kwargs):
        nonlocal invoked
        invoked = True
        raise AssertionError("mission worker must not run")

    monkeypatch.setattr(server, "_run_mission_plan", fail_if_invoked)
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": ["venus", "VENUS"],
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "trajectory_duplicate_assist"
    assert invoked is False


def test_mission_complexity_error_is_structured() -> None:
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "risk_samples": server.MISSION_PLAN_MAX_RISK_SAMPLES + 1,
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 413
    detail = response.json()["detail"]
    assert detail["code"] == "mission_complexity_limit"
    assert detail["context"]["maximumRiskSamples"] == 5_000


def test_mission_internal_value_error_is_not_mislabeled_as_bad_input(monkeypatch) -> None:
    monkeypatch.setattr(server, "_mission_plan_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(
        server,
        "_run_mission_plan",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("internal invariant")),
    )
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 500


def test_mission_preserves_empty_pool_and_passes_one_parent_context(monkeypatch) -> None:
    observed = {}

    def fake_mission(payload, planning_context):
        observed["payload"] = payload
        observed["context"] = planning_context
        return {"recommendation": {"outbound": {}}, "alternatives": []}

    monkeypatch.setattr(server, "_mission_plan_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "_run_mission_plan", fake_mission)
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 200
    assert observed["payload"]["assist_pool"] == []
    assert observed["context"].limits.leg_evaluations == 2_000


def test_mission_temporarily_rejects_explicit_horizons() -> None:
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "horizons",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["context"]["operation"] == "mission"


def test_mission_saturation_is_structured(monkeypatch) -> None:
    monkeypatch.setattr(server, "_mission_plan_concurrent_guard", threading.BoundedSemaphore(0))
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert response.json()["detail"]["code"] == "mission_plan_saturated"


def test_handler_cancellation_signals_owner_but_keeps_permit_until_worker_exit() -> None:
    class _ConnectedRequest:
        async def is_disconnected(self) -> bool:
            return False

    guard = threading.BoundedSemaphore(1)
    executor = ThreadPoolExecutor(max_workers=1)
    work_started = threading.Event()
    allow_exit = threading.Event()
    context = server.PlanningContext.with_timeout(10.0)

    def stubborn_worker() -> str:
        work_started.set()
        allow_exit.wait(timeout=2.0)
        return "done"

    async def exercise() -> None:
        assert guard.acquire(blocking=False)
        task = asyncio.create_task(
            server._run_request_owned_thread(
                _ConnectedRequest(),  # type: ignore[arg-type]
                stubborn_worker,
                guard=guard,
                executor=executor,
                timeout_seconds=10.0,
                owner_context=context,
            )
        )
        deadline = asyncio.get_running_loop().time() + 1.0
        while not work_started.is_set() and asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(0.005)
        assert work_started.is_set()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    try:
        asyncio.run(exercise())
        assert context.cancel_event.is_set()
        assert context.snapshot()["terminationReason"] == "request_cancelled"
        assert guard.acquire(blocking=False) is False

        allow_exit.set()
        deadline = time.monotonic() + 1.0
        reacquired = False
        while time.monotonic() < deadline:
            if guard.acquire(blocking=False):
                reacquired = True
                break
            time.sleep(0.005)
        assert reacquired is True
        guard.release()
    finally:
        allow_exit.set()
        executor.shutdown(wait=True)
