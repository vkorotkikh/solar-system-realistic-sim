"""SOL-AIA-ID/P031: reject malformed client identities before admission.

Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
Real FastAPI parsing, request policy, payload builder and native AIA identity
normalization execute. Snapshot/binary acquisition and thread scheduling are
controlled fixtures; no live upstream acquisition or observed solar data.
"""
from __future__ import annotations

import threading

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import server
from sim.solar_realtime_data import SolarRealtimeDataProvider, SolarRealtimeFetchError

PATH = "/solar/realtime/aia-tile"
BODY = b"owned synthetic tile bytes; not an observed image"
INVALID = ["abc", "0", "00", "01", "+1", "-1", "1.0", "1e2", " 1", "1 ", "1_0", "١", "１", "1\n", "1" * 21, "1" * 128]


@pytest.fixture
def route(monkeypatch):
    events = {"rate": 0, "acquire": 0, "release": 0, "thread": 0, "provider": [], "snapshot": 0, "binary": 0}
    state = {"available": "123", "snapshot_error": None, "saturated": False, "rate_error": False}
    provider = SolarRealtimeDataProvider()
    real_latest_tile = provider.latest_aia_tile
    semaphore = threading.BoundedSemaphore(1)

    class Guard:
        def acquire(self, *args, **kwargs):
            events["acquire"] += 1
            return False if state["saturated"] else semaphore.acquire(*args, **kwargs)

        def release(self):
            events["release"] += 1
            semaphore.release()

    def rate(_request):
        events["rate"] += 1
        if state["rate_error"]:
            raise HTTPException(429, "owned synthetic rate sentinel")

    def snapshot(**_kwargs):
        events["snapshot"] += 1
        if state["snapshot_error"] is not None:
            raise state["snapshot_error"]
        return {"sdo_aia": {"channels": {channel: {
            "image_id": state["available"],
            "image_date": "2026-10-24T00:00:00Z",
            "tile_url": "https://owned.invalid/synthetic.png",
        } for channel in provider.AIA_SOURCE_IDS}}}

    def binary(_url, *, ttl_s):
        events["binary"] += 1
        assert ttl_s == provider.cache_ttl_s
        return BODY, "image/png"

    def latest_tile(*args, **kwargs):
        events["provider"].append(dict(kwargs))
        return real_latest_tile(*args, **kwargs)

    async def owned_thread(function, *args, guard, executor, timeout_seconds, **kwargs):
        del executor
        assert timeout_seconds == server.SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS
        events["thread"] += 1
        try:
            return function(*args, **kwargs)
        finally:
            guard.release()

    def no_network(*_args, **_kwargs):
        pytest.fail("native provider network acquisition is forbidden")

    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({}))
    monkeypatch.setattr(server.app, "middleware_stack", None)
    monkeypatch.setattr(server, "SOLAR_REALTIME_DATA", provider)
    monkeypatch.setattr(server, "_solar_aia_tile_concurrent_guard", Guard())
    monkeypatch.setattr(server, "_enforce_solar_aia_tile_rate_limit", rate)
    monkeypatch.setattr(server, "_run_owned_thread", owned_thread)
    monkeypatch.setattr(provider, "_latest_aia_bundle", snapshot)
    monkeypatch.setattr(provider, "latest_aia_tile", latest_tile)
    monkeypatch.setattr(provider, "_fetch_aia_png_cached", binary)
    monkeypatch.setattr(provider, "_request_bytes", no_network)
    client = TestClient(server.app)
    try:
        yield client, events, state
    finally:
        client.close()


def untouched(events):
    assert events == {"rate": 0, "acquire": 0, "release": 0, "thread": 0, "provider": [], "snapshot": 0, "binary": 0}


def invalid_response(response, events):
    assert response.status_code == 400, (response.status_code, response.json(), events)
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_image_id"
    assert detail["retryable"] is False
    assert isinstance(detail["message"], str) and detail["message"]
    assert "retry-after" not in response.headers
    untouched(events)


@pytest.mark.parametrize("image_id", INVALID)
def test_malformed_identity_is_client_error_before_admission(route, image_id):
    client, events, _ = route
    invalid_response(client.get(PATH, params={"image_id": image_id}), events)


@pytest.mark.parametrize("image_id", [None, "1", "9007199254740993", "99999999999999999999"])
def test_valid_identity_is_exact_and_omission_stays_supported(route, image_id):
    client, events, state = route
    state["available"] = image_id or "123"
    response = client.get(PATH, params={} if image_id is None else {"image_id": image_id})
    assert response.status_code == 200, response.text
    assert response.content == BODY
    assert response.headers["x-solar-aia-image-id"] == state["available"]
    assert response.headers["x-solar-aia-spatial-use"] == "disabled"
    expected = {"channel": "aia_193", "jd_tdb": None, "force_refresh": False}
    if image_id is not None:
        expected["image_id"] = image_id
    assert events == {"rate": 1, "acquire": 1, "release": 1, "thread": 1, "provider": [expected], "snapshot": 1, "binary": 1}


@pytest.mark.parametrize(("params", "status", "code"), [
    ({"image_id": ""}, 422, None),
    ({"image_id": "1" * 129}, 422, None),
    ({"image_id": "abc", "force_refresh": "not-a-bool"}, 422, None),
    ({"image_id": "abc", "jd_tdb": "nan"}, 400, "invalid_jd_tdb"),
    ({"image_id": "abc", "jd_tdb": "2460000.5", "jd": "2460001.5"}, 400, "conflicting_julian_date_aliases"),
])
def test_existing_typed_and_epoch_precedence(route, params, status, code):
    client, events, _ = route
    response = client.get(PATH, params=params)
    assert response.status_code == status, response.text
    if code is not None:
        assert response.json()["detail"]["code"] == code
    untouched(events)


@pytest.mark.parametrize(("headers", "refresh", "status", "code"), [
    ({}, False, 401, None),
    ({"X-API-Key": "wrong-owned-key"}, False, 401, None),
    ({"X-API-Key": "owned-synthetic-key"}, True, 400, "network_refresh_get_forbidden"),
    ({"X-API-Key": "owned-synthetic-key"}, False, 400, "invalid_image_id"),
])
def test_network_authentication_and_refresh_precedence(route, monkeypatch, headers, refresh, status, code):
    client, events, _ = route
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": "owned-synthetic-key",
    }))
    response = client.get(PATH, params={"image_id": "abc", "force_refresh": str(refresh).lower()}, headers=headers)
    assert response.status_code == status, response.text
    if code is not None:
        assert response.json()["detail"]["code"] == code
    untouched(events)


@pytest.mark.parametrize(("values", "valid"), [(["abc", "123"], True), (["123", "abc"], False)])
def test_duplicate_identity_keeps_existing_last_value_semantics(route, values, valid):
    client, events, _ = route
    response = client.get(PATH, params=[("image_id", value) for value in values])
    if valid:
        assert response.status_code == 200
        assert events["provider"][0]["image_id"] == "123"
        assert response.headers["x-solar-aia-image-id"] == "123"
    else:
        invalid_response(response, events)


@pytest.mark.parametrize("failure", ["bad-upstream-id", "generic", "typed-media"])
def test_valid_client_identity_does_not_reclassify_upstream_failures(route, failure):
    client, events, state = route
    expected_code = "aia_tile_unavailable"
    if failure == "bad-upstream-id":
        state["available"] = "bad-provider-id"
    elif failure == "generic":
        state["snapshot_error"] = RuntimeError("owned private provider diagnostic")
    else:
        state["snapshot_error"] = SolarRealtimeFetchError("invalid_aia_media_type", "owned private diagnostic")
        expected_code = "invalid_aia_media_type"
    response = client.get(PATH, params={"image_id": "123"})
    assert response.status_code == 503, response.text
    assert response.json()["detail"]["code"] == expected_code
    assert response.json()["detail"]["retryable"] is True
    assert "owned private" not in response.text
    assert events["rate"] == events["acquire"] == events["release"] == events["thread"] == events["snapshot"] == 1
    assert events["binary"] == 0


def test_valid_but_different_retained_identity_remains_conflict(route):
    client, events, state = route
    state["available"] = "124"
    response = client.get(PATH, params={"image_id": "123"})
    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "aia_image_identity_mismatch",
        "message": "Requested AIA image is no longer the retained channel snapshot.",
        "requested_image_id": "123", "available_image_id": "124", "retryable": True,
    }
    assert events["rate"] == events["acquire"] == events["release"] == events["thread"] == events["snapshot"] == 1
    assert events["binary"] == 0


def test_invalid_identity_precedes_rate_exhaustion(route):
    client, events, state = route
    state["rate_error"] = True
    invalid_response(client.get(PATH, params={"image_id": "abc"}), events)


def test_valid_identity_preserves_rate_rejection(route):
    client, events, state = route
    state["rate_error"] = True
    response = client.get(PATH, params={"image_id": "123"})
    assert response.status_code == 429
    assert events["rate"] == 1
    assert events["acquire"] == events["thread"] == 0


def test_valid_identity_preserves_saturation(route):
    client, events, state = route
    state["saturated"] = True
    response = client.get(PATH, params={"image_id": "123"})
    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert events["rate"] == events["acquire"] == 1
    assert events["release"] == events["thread"] == 0


def test_valid_identity_preserves_invalid_channel_policy(route):
    client, events, _ = route
    response = client.get(PATH, params={"image_id": "123", "channel": "aia_999"})
    assert response.status_code == 400
    assert "channel" in response.json()["detail"]
    assert events["rate"] == 1
    assert events["acquire"] == events["thread"] == 0


def test_openapi_retains_existing_query_bounds_and_names(route):
    client, events, _ = route
    response = client.get("/openapi.json")
    assert response.status_code == 200
    params = {item["name"]: item for item in response.json()["paths"][PATH]["get"]["parameters"] if item["in"] == "query"}
    assert set(params) == {"channel", "image_id", "jd_tdb", "jd", "jd_tdb1", "jd_tdb2", "force_refresh"}
    image_schema = next(item for item in params["image_id"]["schema"]["anyOf"] if item.get("type") == "string")
    assert image_schema["minLength"] == 1
    assert image_schema["maxLength"] == 128
    untouched(events)


# Root-selected safe error prose and explicit preflight precedence.
# Original forty cases above are an immutable byte prefix.
@pytest.mark.parametrize("image_id", ["abc", "owned-private-marker-that-must-not-be-reflected"])
def test_invalid_identity_uses_exact_safe_detail_without_reflection(route, image_id):
    client, events, _ = route
    response = client.get(PATH, params={"image_id": image_id})
    assert response.status_code == 400
    assert response.json() == {"detail": {
        "code": "invalid_image_id",
        "message": "Invalid AIA image ID.",
        "retryable": False,
    }}
    assert image_id not in response.text
    assert "retry-after" not in response.headers
    untouched(events)


def test_invalid_identity_precedes_invalid_channel_without_admission(route):
    client, events, _ = route
    response = client.get(PATH, params={"image_id": "abc", "channel": "aia_999"})
    assert response.status_code == 400
    assert response.json() == {"detail": {
        "code": "invalid_image_id",
        "message": "Invalid AIA image ID.",
        "retryable": False,
    }}
    assert "retry-after" not in response.headers
    untouched(events)
