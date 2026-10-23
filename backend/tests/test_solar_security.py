from __future__ import annotations

import asyncio
from collections import OrderedDict, deque
from collections.abc import Sequence
import json
import os
from pathlib import Path
import subprocess
import sys

from fastapi.testclient import TestClient
import pytest
from starlette.requests import Request

import server


client = TestClient(server.app)


def _request(
    *,
    peer: str = "198.51.100.9",
    headers: dict[str, str] | Sequence[tuple[str, str]] | None = None,
) -> Request:
    header_items = headers.items() if isinstance(headers, dict) else (headers or ())
    encoded_headers = [
        (name.lower().encode("ascii"), value.encode("ascii"))
        for name, value in header_items
    ]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/solar/physics",
            "raw_path": b"/solar/physics",
            "query_string": b"",
            "headers": encoded_headers,
            "client": (peer, 43100),
            "server": ("127.0.0.1", 8042),
        }
    )


def _security_env(**overrides: str) -> dict[str, str]:
    values = {
        "SOLAR_SECURITY_PROFILE": "local",
        "SOLAR_CORS_ALLOWED_ORIGINS": "http://localhost:3000",
    }
    values.update(overrides)
    return values


def test_local_security_profile_preserves_unauthenticated_loopback_development() -> None:
    config = server._load_solar_security_config(_security_env())

    assert config.profile == "local"
    assert config.authentication_required is False
    assert config.default_bind_host == "127.0.0.1"
    assert config.api_key_hashes == frozenset()


def test_network_security_profile_fails_closed_without_api_keys() -> None:
    with pytest.raises(RuntimeError, match="SOLAR_PHYSICS_API_KEYS"):
        server._load_solar_security_config(
            _security_env(SOLAR_SECURITY_PROFILE="network")
        )


def test_network_server_startup_fails_closed_without_api_keys() -> None:
    environment = os.environ.copy()
    environment["SOLAR_SECURITY_PROFILE"] = "network"
    environment.pop("SOLAR_PHYSICS_API_KEYS", None)

    completed = subprocess.run(
        [sys.executable, "-c", "import server"],
        cwd=Path(server.__file__).resolve().parent,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10.0,
        check=False,
    )

    assert completed.returncode != 0
    assert "SOLAR_PHYSICS_API_KEYS" in completed.stderr


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"SOLAR_SECURITY_PROFILE": "public"}, "SOLAR_SECURITY_PROFILE"),
        ({"SOLAR_TRUSTED_PROXY_CIDRS": "not-a-cidr"}, "SOLAR_TRUSTED_PROXY_CIDRS"),
        ({"SOLAR_CORS_ALLOWED_ORIGINS": "*"}, "wildcard"),
    ],
)
def test_invalid_solar_security_configuration_is_rejected_loudly(
    overrides: dict[str, str],
    message: str,
) -> None:
    with pytest.raises(RuntimeError, match=message):
        server._load_solar_security_config(_security_env(**overrides))


@pytest.mark.parametrize(
    "origin",
    [
        "HTTP://LOCALHOST:5173",
        "http://localhost:80",
        "https://solar.example:443",
        "http://localhost?",
        "http://localhost#",
        "http://localhost:05173",
        "http://[0:0:0:0:0:0:0:1]",
        "https://b\u00fccher.example",
        "http://127.1",
    ],
)
def test_cors_configuration_rejects_noncanonical_browser_origins(
    origin: str,
) -> None:
    with pytest.raises(RuntimeError, match=r"exact HTTP\(S\) origins"):
        server._load_solar_security_config(
            _security_env(SOLAR_CORS_ALLOWED_ORIGINS=origin)
        )


def test_cors_configuration_retains_canonical_browser_origins() -> None:
    origins = (
        "http://localhost",
        "http://localhost:5173",
        "https://solar.example",
        "https://solar.example:8443",
        "http://127.0.0.1:5173",
        "http://[::1]",
        "http://[::1]:5173",
        "https://xn--bcher-kva.example",
    )

    config = server._load_solar_security_config(
        _security_env(SOLAR_CORS_ALLOWED_ORIGINS=",".join(origins))
    )

    assert config.cors_allowed_origins == origins


def test_security_config_retains_only_api_key_hashes() -> None:
    raw_key = "a-secret-that-must-not-be-retained"
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS=raw_key,
            SOLAR_CORS_ALLOWED_ORIGINS="https://solar.example",
        )
    )

    assert config.authentication_required is True
    assert raw_key not in repr(config)
    assert all(raw_key != digest for digest in config.api_key_hashes)


def test_network_security_profile_defaults_cors_to_deny_all() -> None:
    config = server._load_solar_security_config(
        {
            "SOLAR_SECURITY_PROFILE": "network",
            "SOLAR_PHYSICS_API_KEYS": "network-secret",
        }
    )

    assert config.cors_allowed_origins == ()


def test_local_security_profile_allows_vite_dev_and_preview_origins() -> None:
    config = server._load_solar_security_config(
        {"SOLAR_SECURITY_PROFILE": "local"}
    )

    assert {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    }.issubset(config.cors_allowed_origins)


@pytest.mark.parametrize(
    ("variable", "value"),
    [
        (
            "SOLAR_PHYSICS_API_KEYS",
            ",".join(
                f"key-{index}" for index in range(server.SOLAR_API_KEY_MAX_COUNT + 1)
            ),
        ),
        ("SOLAR_PHYSICS_API_KEYS", "x" * (server.SOLAR_API_KEY_MAX_BYTES + 1)),
        ("SOLAR_PHYSICS_API_KEYS", "not-ascii-☃"),
        ("SOLAR_PHYSICS_API_KEYS", "control-\x7f"),
        (
            "SOLAR_TRUSTED_PROXY_CIDRS",
            ",".join(
                f"10.{index}.0.0/16"
                for index in range(server.SOLAR_TRUSTED_PROXY_MAX_CIDRS + 1)
            ),
        ),
    ],
)
def test_security_configuration_cardinality_and_bytes_are_hard_bounded(
    variable: str,
    value: str,
) -> None:
    with pytest.raises(RuntimeError, match=variable):
        server._load_solar_security_config(
            {
                "SOLAR_SECURITY_PROFILE": "network",
                "SOLAR_PHYSICS_API_KEYS": "network-secret",
                variable: value,
            }
        )


def test_untrusted_peer_cannot_select_identity_with_forwarded_for() -> None:
    config = server._load_solar_security_config(
        _security_env(SOLAR_TRUSTED_PROXY_CIDRS="10.0.0.0/8")
    )
    request = _request(
        peer="198.51.100.9",
        headers={"x-forwarded-for": "203.0.113.1"},
    )

    assert server._client_identity(request, config=config) == "peer:198.51.100.9"


def test_trusted_proxy_uses_validated_bounded_forwarding_chain() -> None:
    config = server._load_solar_security_config(
        _security_env(SOLAR_TRUSTED_PROXY_CIDRS="10.0.0.0/8,2001:db8::/32")
    )
    proxied = _request(
        peer="10.2.3.4",
        headers={"x-forwarded-for": "192.0.2.7, 10.1.1.8"},
    )
    malformed = _request(
        peer="10.2.3.4",
        headers={"x-forwarded-for": "192.0.2.7, not-an-address"},
    )
    overlong = _request(
        peer="10.2.3.4",
        headers={
            "x-forwarded-for": ",".join(
                f"192.0.2.{index % 250 + 1}"
                for index in range(server.SOLAR_FORWARDED_FOR_MAX_HOPS + 1)
            )
        },
    )

    assert server._client_identity(proxied, config=config) == "peer:192.0.2.7"
    assert server._client_identity(malformed, config=config) == "peer:10.2.3.4"
    assert server._client_identity(overlong, config=config) == "peer:10.2.3.4"


def test_forwarding_chain_stops_at_first_untrusted_hop_from_the_right() -> None:
    config = server._load_solar_security_config(
        _security_env(SOLAR_TRUSTED_PROXY_CIDRS="10.0.0.0/8")
    )
    request = _request(
        peer="10.2.3.4",
        headers={
            "x-forwarded-for": "203.0.113.99, 192.0.2.7, 10.1.1.8",
        },
    )

    assert server._client_identity(request, config=config) == "peer:192.0.2.7"


def test_duplicate_forwarded_for_headers_fall_back_to_immediate_peer() -> None:
    config = server._load_solar_security_config(
        _security_env(SOLAR_TRUSTED_PROXY_CIDRS="10.0.0.0/8")
    )
    request = _request(
        peer="10.2.3.4",
        headers=[
            ("x-forwarded-for", "192.0.2.7"),
            ("x-forwarded-for", "203.0.113.8"),
        ],
    )

    assert server._client_identity(request, config=config) == "peer:10.2.3.4"


def test_five_thousand_spoofed_forwarding_values_share_one_untrusted_identity() -> None:
    config = server._load_solar_security_config(
        _security_env(SOLAR_TRUSTED_PROXY_CIDRS="10.0.0.0/8")
    )

    identities = {
        server._client_identity(
            _request(
                peer="198.51.100.9",
                headers={"x-forwarded-for": f"203.0.{index // 256}.{index % 256}"},
            ),
            config=config,
        )
        for index in range(5_000)
    }

    assert identities == {"peer:198.51.100.9"}


def test_authenticated_subject_precedes_peer_and_never_contains_raw_key() -> None:
    raw_key = "credential-identity-key"
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS=raw_key,
        )
    )
    request = _request(
        headers={"x-api-key": raw_key, "x-forwarded-for": "203.0.113.5"}
    )

    subject = server._require_optional_solar_api_key(request, config=config)
    identity = server._client_identity(request, config=config)

    assert subject is not None
    assert identity == subject
    assert identity.startswith("credential:sha256:")
    assert raw_key not in identity


def test_oversized_request_credential_is_not_hashed_or_authenticated() -> None:
    config = server._load_solar_security_config(
        {
            "SOLAR_SECURITY_PROFILE": "network",
            "SOLAR_PHYSICS_API_KEYS": "network-secret",
        }
    )
    request = _request(
        headers={"x-api-key": "x" * (server.SOLAR_API_KEY_MAX_BYTES + 1)}
    )

    with pytest.raises(server.HTTPException) as raised:
        server._require_optional_solar_api_key(request, config=config)

    assert raised.value.status_code == 401


def test_bounded_rate_store_has_lru_cap_expiry_and_deterministic_retry_after() -> None:
    store: OrderedDict[str, deque[float]] = OrderedDict()

    assert server._record_solar_rate_request(
        store,
        identity="a",
        now=0.0,
        window_seconds=10.0,
        max_requests=2,
        max_identities=2,
    ) is None
    assert server._record_solar_rate_request(
        store,
        identity="b",
        now=1.0,
        window_seconds=10.0,
        max_requests=2,
        max_identities=2,
    ) is None
    assert server._record_solar_rate_request(
        store,
        identity="a",
        now=2.0,
        window_seconds=10.0,
        max_requests=2,
        max_identities=2,
    ) is None
    assert list(store) == ["b", "a"]

    assert server._record_solar_rate_request(
        store,
        identity="c",
        now=3.0,
        window_seconds=10.0,
        max_requests=2,
        max_identities=2,
    ) is None
    assert list(store) == ["a", "c"]

    retry_after = server._record_solar_rate_request(
        store,
        identity="a",
        now=3.1,
        window_seconds=10.0,
        max_requests=2,
        max_identities=2,
    )
    assert retry_after == 7

    assert server._record_solar_rate_request(
        store,
        identity="d",
        now=13.0,
        window_seconds=10.0,
        max_requests=2,
        max_identities=2,
    ) is None
    assert list(store) == ["d"]


@pytest.mark.parametrize(
    ("store_name", "enforcer_name"),
    [
        ("_solar_physics_rate_locks", "_enforce_solar_request_rate_limit"),
        ("_solar_realtime_rate_locks", "_enforce_solar_realtime_rate_limit"),
        ("_solar_aia_tile_rate_locks", "_enforce_solar_aia_tile_rate_limit"),
    ],
)
def test_each_solar_rate_store_obeys_the_hard_identity_cap(
    monkeypatch,
    store_name: str,
    enforcer_name: str,
) -> None:
    store: OrderedDict[str, deque[float]] = OrderedDict()
    monkeypatch.setattr(server, store_name, store)
    monkeypatch.setattr(server, "SOLAR_RATE_LIMIT_MAX_IDENTITIES", 2)
    enforcer = getattr(server, enforcer_name)

    enforcer(_request(peer="192.0.2.1"))
    enforcer(_request(peer="192.0.2.2"))
    enforcer(_request(peer="192.0.2.3"))

    assert list(store) == ["peer:192.0.2.2", "peer:192.0.2.3"]


def test_solar_realtime_authenticates_before_provider_work(monkeypatch) -> None:
    raw_key = "network-only-secret"
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS=raw_key,
        )
    )
    provider_calls = 0

    def fake_latest(*, force_refresh: bool):
        nonlocal provider_calls
        provider_calls += 1
        return {"force_refresh": force_refresh}

    rate_store: OrderedDict[str, deque[float]] = OrderedDict()
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    monkeypatch.setattr(server, "_solar_realtime_rate_locks", rate_store)
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest", fake_latest)

    denied = client.get("/solar/realtime")

    assert denied.status_code == 401
    assert provider_calls == 0

    allowed = client.get("/solar/realtime", headers={"x-api-key": raw_key})

    assert allowed.status_code == 200
    assert provider_calls == 1
    assert len(rate_store) == 1
    assert next(iter(rate_store)).startswith("credential:sha256:")
    assert raw_key not in repr(rate_store)


def test_solar_realtime_rate_limits_before_second_provider_call(monkeypatch) -> None:
    provider_calls = 0

    def fake_latest(*, force_refresh: bool):
        nonlocal provider_calls
        provider_calls += 1
        return {"force_refresh": force_refresh}

    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        server._load_solar_security_config(_security_env()),
    )
    monkeypatch.setattr(server, "_solar_realtime_rate_locks", OrderedDict())
    monkeypatch.setattr(server, "SOLAR_REALTIME_RATE_LIMIT_PER_WINDOW", 1)
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest", fake_latest)

    first = client.get("/solar/realtime")
    rejected = client.get("/solar/realtime")

    assert first.status_code == 200
    assert rejected.status_code == 429
    assert rejected.headers["retry-after"] == str(
        server.SOLAR_REALTIME_RATE_WINDOW_SECONDS.__ceil__()
    )
    assert provider_calls == 1


def test_solar_physics_and_aia_authenticate_before_admission(monkeypatch) -> None:
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS="required-secret",
        )
    )
    physics_admissions = 0
    aia_admissions = 0

    def physics_admission(_request: Request) -> None:
        nonlocal physics_admissions
        physics_admissions += 1

    def aia_admission(_request: Request) -> None:
        nonlocal aia_admissions
        aia_admissions += 1

    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    monkeypatch.setattr(server, "_enforce_solar_request_rate_limit", physics_admission)
    monkeypatch.setattr(server, "_enforce_solar_aia_tile_rate_limit", aia_admission)

    physics = client.get("/solar/physics")
    aia = client.get("/solar/realtime/aia-tile")

    assert physics.status_code == 401
    assert aia.status_code == 401
    assert (physics_admissions, aia_admissions) == (0, 0)


def test_network_profile_authenticates_every_http_route_family_except_liveness(
    monkeypatch,
) -> None:
    raw_key = "route-wide-network-secret"
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS=raw_key,
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)

    protected_requests = (
        ("GET", "/health", None),
        ("GET", "/info", None),
        ("GET", "/bodies", None),
        ("GET", "/solar/capabilities", None),
        ("GET", "/nearby-systems?limit=1", None),
        ("GET", "/trajectory/capabilities", None),
        ("GET", "/mission/capabilities", None),
        ("GET", "/docs", None),
        ("GET", "/openapi.json", None),
        ("GET", "/not-a-real-route", None),
        ("POST", "/trajectory/plan", b"{"),
        ("POST", "/mission/plan", b"{"),
        ("POST", "/benchmark/accuracy/report", b"{"),
    )
    for method, path, content in protected_requests:
        response = client.request(
            method,
            path,
            content=content,
            headers={"content-type": "application/json"} if content else None,
        )
        assert response.status_code == 401, (method, path, response.text)
        assert response.json() == {
            "detail": {
                "code": "authentication_required",
                "message": "Authentication is required for this network endpoint.",
                "retryable": False,
            }
        }

    liveness = client.get("/health/live")
    assert liveness.status_code == 200
    assert liveness.json() == {"status": "ok"}

    authenticated = client.get("/info", headers={"x-api-key": raw_key})
    assert authenticated.status_code == 200


@pytest.mark.parametrize(
    ("root_path", "path", "expected_status"),
    [
        ("/", "//health/live", 204),
        ("/api", "/api/health/live", 204),
        ("/api/", "/api//health/live", 204),
        ("/", "//info", 401),
        ("/api/", "/api//info", 401),
    ],
)
def test_network_authentication_uses_router_equivalent_root_path(
    monkeypatch,
    root_path: str,
    path: str,
    expected_status: int,
) -> None:
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS="root-path-secret",
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    downstream_called = False
    messages: list[dict[str, object]] = []

    async def downstream(scope, _receive, send) -> None:
        nonlocal downstream_called
        downstream_called = True
        assert server.scope_route_path(scope) == "/health/live"
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message) -> None:
        messages.append(message)

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "root_path": root_path,
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": [],
        "client": ("198.51.100.10", 43100),
        "server": ("backend.internal", 8042),
    }

    asyncio.run(server._NetworkAuthenticationMiddleware(downstream)(scope, receive, send))

    assert messages[0]["status"] == expected_status
    assert downstream_called is (expected_status == 204)


def test_network_authentication_rejects_before_reading_request_body(monkeypatch) -> None:
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS="body-boundary-secret",
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    downstream_called = False
    receive_called = False
    messages: list[dict[str, object]] = []

    async def downstream(_scope, _receive, _send) -> None:
        nonlocal downstream_called
        downstream_called = True

    async def receive():
        nonlocal receive_called
        receive_called = True
        raise AssertionError("authentication middleware read an unauthorized body")

    async def send(message) -> None:
        messages.append(message)

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/trajectory/plan",
        "raw_path": b"/trajectory/plan",
        "query_string": b"",
        "headers": [(b"content-type", b"application/json")],
        "client": ("198.51.100.10", 43100),
        "server": ("backend.internal", 8042),
    }

    asyncio.run(server._NetworkAuthenticationMiddleware(downstream)(scope, receive, send))

    assert downstream_called is False
    assert receive_called is False
    assert messages[0]["status"] == 401
    response_body = json.loads(messages[1]["body"])
    assert response_body["detail"]["code"] == "authentication_required"


def test_network_authentication_is_inside_exact_origin_cors(monkeypatch) -> None:
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS="cors-boundary-secret",
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    origin = "http://localhost:3000"

    rejected = client.get("/info", headers={"origin": origin})
    assert rejected.status_code == 401
    assert rejected.headers["access-control-allow-origin"] == origin

    preflight = client.options(
        "/trajectory/plan",
        headers={
            "origin": origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == origin


def test_network_public_route_allowlist_cannot_expand_with_registered_routes() -> None:
    registered_http_routes = {
        (method, route.path)
        for route in server.app.routes
        for method in getattr(route, "methods", set())
    }

    assert server.NETWORK_PUBLIC_HTTP_ROUTES == frozenset(
        {("GET", "/health/live"), ("HEAD", "/health/live")}
    )
    assert registered_http_routes & server.NETWORK_PUBLIC_HTTP_ROUTES == set(
        server.NETWORK_PUBLIC_HTTP_ROUTES
    )


def test_network_protected_responses_are_private_and_vary_by_credentials(
    monkeypatch,
) -> None:
    raw_key = "network-cache-boundary-secret"
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS=raw_key,
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)

    authenticated = client.get(
        "/info",
        headers={"origin": "http://localhost:3000", "x-api-key": raw_key},
    )
    rejected = client.get(
        "/info",
        headers={"origin": "http://localhost:3000"},
    )

    for response in (authenticated, rejected):
        assert response.headers["cache-control"] == "private, no-store"
        assert {
            token.strip().lower()
            for token in response.headers["vary"].split(",")
        } == {"authorization", "origin", "x-api-key"}


def test_network_response_policy_merges_existing_cache_and_vary_headers(
    monkeypatch,
) -> None:
    raw_key = "network-cache-merge-secret"
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS=raw_key,
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    messages: list[dict[str, object]] = []

    async def downstream(_scope, _receive, send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (
                        b"cache-control",
                        b"public, max-age=120, stale-if-error=30",
                    ),
                    (b"vary", b"Accept-Encoding"),
                    (b"vary", b"Origin, accept-encoding"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message) -> None:
        messages.append(message)

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/info",
        "raw_path": b"/info",
        "query_string": b"",
        "headers": [(b"x-api-key", raw_key.encode("ascii"))],
        "client": ("198.51.100.10", 43100),
        "server": ("backend.internal", 8042),
    }

    asyncio.run(server._NetworkAuthenticationMiddleware(downstream)(scope, receive, send))

    response_headers = [
        (name.decode("ascii").lower(), value.decode("ascii"))
        for name, value in messages[0]["headers"]
    ]
    cache_directives = {
        directive.strip().lower()
        for name, value in response_headers
        if name == "cache-control"
        for directive in value.split(",")
    }
    vary_fields = {
        field.strip().lower()
        for name, value in response_headers
        if name == "vary"
        for field in value.split(",")
    }

    assert cache_directives == {
        "max-age=120",
        "no-store",
        "private",
        "stale-if-error=30",
    }
    assert vary_fields == {
        "accept-encoding",
        "authorization",
        "origin",
        "x-api-key",
    }


def test_network_public_liveness_keeps_public_cache_contract(monkeypatch) -> None:
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS="network-liveness-secret",
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)

    response = client.get("/health/live")

    assert response.status_code == 200
    assert "cache-control" not in response.headers
    vary_fields = {
        field.strip().lower()
        for field in response.headers.get("vary", "").split(",")
        if field.strip()
    }
    assert vary_fields.isdisjoint({"authorization", "x-api-key"})


@pytest.mark.parametrize(
    ("path", "rate_enforcer"),
    [
        ("/solar/realtime?force_refresh=true", "_enforce_solar_realtime_rate_limit"),
        (
            "/solar/realtime/aia-tile?force_refresh=true",
            "_enforce_solar_aia_tile_rate_limit",
        ),
        (
            "/solar/physics?force_data_refresh=true",
            "_enforce_solar_request_rate_limit",
        ),
    ],
)
def test_network_profile_rejects_refresh_get_flags_before_work(
    monkeypatch,
    path: str,
    rate_enforcer: str,
) -> None:
    raw_key = "network-refresh-secret"
    config = server._load_solar_security_config(
        _security_env(
            SOLAR_SECURITY_PROFILE="network",
            SOLAR_PHYSICS_API_KEYS=raw_key,
        )
    )
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    work_called = False

    def unexpected_work(_request: Request) -> None:
        nonlocal work_called
        work_called = True
        raise AssertionError("network refresh GET reached rate or work admission")

    monkeypatch.setattr(server, rate_enforcer, unexpected_work)

    response = client.get(path, headers={"x-api-key": raw_key})

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "network_refresh_get_forbidden",
        "message": "Explicit refresh is disabled for GET requests in network profile.",
        "retryable": False,
    }
    assert work_called is False


def test_realtime_provider_deadline_is_inside_server_timeout_contracts() -> None:
    assert 0.0 < server.SOLAR_REALTIME_DATA.timeout_s
    assert (
        server.SOLAR_REALTIME_DATA.timeout_s
        < server.SOLAR_REALTIME_REQUEST_TIMEOUT_SECONDS
    )
    assert (
        server.SOLAR_REALTIME_DATA.timeout_s
        < server.SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS
    )


@pytest.mark.parametrize(
    ("image_date", "expected_status", "expected_header"),
    (
        ("2026-09-27 12:34:56", 200, "2026-09-27T12:34:56Z"),
        ("2026-09-27T12:34:56Z", 200, "2026-09-27T12:34:56Z"),
        ("2026-09-27T12:34:56Z\r\nX-Injected: yes", 503, None),
        ("2026-09-27T12:34:5\u2603Z", 503, None),
        ("x" * 129, 503, None),
        ("not-a-date", 503, None),
    ),
    ids=(
        "upstream-format-canonicalized",
        "canonical",
        "control",
        "non-ascii",
        "overlong",
        "invalid-date",
    ),
)
def test_aia_tile_date_is_safe_and_canonical_before_header_emission(
    monkeypatch,
    image_date: str,
    expected_status: int,
    expected_header: str | None,
) -> None:
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        server._load_solar_security_config(_security_env()),
    )
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", OrderedDict())
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda **_kwargs: {
            "channel": "aia_193",
            "image_id": "1",
            "image_date": image_date,
            "content": b"png",
            "content_type": "image/png",
            "artifact": {
                "schema": {
                    "name": "helioviewer_viewport_tile",
                    "version": 1,
                },
                "delivery": "raw_on_demand",
            },
            "spatial_use": {
                "eligible": False,
                "reason": "viewport_tile_has_no_validated_solar_surface_projection",
                "contract": None,
            },
        },
    )

    response = client.get("/solar/realtime/aia-tile")

    assert response.status_code == expected_status
    if expected_header is None:
        assert response.json()["detail"]["code"] == "invalid_aia_provider_contract"
        assert "x-solar-aia-image-date" not in response.headers
    else:
        assert response.headers["x-solar-aia-image-date"] == expected_header
