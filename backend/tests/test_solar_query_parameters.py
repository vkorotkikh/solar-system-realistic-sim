"""SOL-QUERY / SDEL-002 endpoint-only unknown-query regression coverage.

Selected HTTP 400/code policy; see
agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
Responses below are synthetic routing sentinels, not solar predictions.
No real process runner, provider, or model is invoked by this fixture.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import server

NOW = 2_460_500.7508007
EPOCH = 2_460_000.5
KNOWN = {"jd_tdb", "jd", "fidelity", "max_features", "forcing", "live_data", "force_data_refresh", "delivery", "geometry_version"}


@pytest.fixture
def route(monkeypatch):
    events = {"rate": 0, "get_runner": 0, "runs": []}

    class FakeRunner:
        async def run(self, payload, *, timeout_seconds):
            events["runs"].append((dict(payload), timeout_seconds))
            return {
                "test_only_non_science": True, "received": dict(payload),
                "corona": {"features": []}, "pfss_field_lines": {"lines": []},
                "heliosphere": {"parker_spiral": {"lines": []}},
            }

    runner = FakeRunner()

    def get_runner():
        events["get_runner"] += 1
        return runner

    def rate(_request):
        events["rate"] += 1

    def forbidden(*_args, **_kwargs):
        raise AssertionError("real model/process/thread work is forbidden in this fixture")

    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({}))
    monkeypatch.setattr(server.app, "middleware_stack", None)
    monkeypatch.setattr(server, "current_jd_tdb", lambda: NOW)
    monkeypatch.setattr(server, "_get_solar_physics_runner", get_runner)
    monkeypatch.setattr(server, "_enforce_solar_request_rate_limit", rate)
    monkeypatch.setattr(server, "_run_owned_thread", forbidden)
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "sample_state", forbidden)
    client = TestClient(server.app)
    try:
        yield client, events
    finally:
        client.close()


@pytest.mark.parametrize("query", [
    "julian_date=2460000.5",
    "jd_tdb=2460000.5&julian_date=2460001.5",
    "JD_TDB=2460000.5",
    "julian%5Fdate=2460000.5",
    "=2460000.5",
    "julian_date",
    "julian_date=2460000.5&julian_date=2460001.5",
    "jd_tdb=2460000.5&jd=2460000.5&fidelity=preview&max_features=8&forcing=synthetic&live_data=false&force_data_refresh=false&extra=x",
])
def test_unknown_query_rejected_before_admission_and_runner(route, query):
    client, events = route
    response = client.get("/solar/physics?" + query)
    assert response.status_code == 400, (response.status_code, response.json(), events)
    detail = response.json()["detail"]
    assert detail["code"] == "unknown_query_parameters"
    assert detail["retryable"] is False
    assert isinstance(detail["message"], str) and detail["message"]
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


@pytest.mark.parametrize(("query", "expected"), [
    ("", {"epoch_jd_tdb": NOW, "fidelity": "operational", "max_features": 220, "forcing": "synthetic", "live_data": False}),
    ("jd_tdb=2460000.5", {"epoch_jd_tdb": EPOCH}),
    ("delivery=full&geometry_version=" + "a" * 64, {"epoch_jd_tdb": NOW}),
    ("jd=2460000.5", {"epoch_jd_tdb": EPOCH}),
    ("jd_tdb=2460000.5&jd=2460000.5", {"epoch_jd_tdb": EPOCH}),
    ("jd_tdb=2460000.5&jd=2460000.5&fidelity=preview&max_features=8&forcing=synthetic&live_data=false&force_data_refresh=false", {"epoch_jd_tdb": EPOCH, "fidelity": "preview", "max_features": 8, "forcing": "synthetic", "live_data": False}),
    ("jd%5Ftdb=2460000.5&fidelity=preview&max_features=8&forcing=hybrid&live_data=true&force_data_refresh=true", {"epoch_jd_tdb": EPOCH, "fidelity": "preview", "max_features": 8, "forcing": "hybrid", "live_data": True}),
    ("fidelity=%20PREVIEW%20&forcing=%20SYNTHETIC%20", {"fidelity": "preview", "forcing": "synthetic"}),
])
def test_declared_query_compatibility(route, query, expected):
    client, events = route
    response = client.get("/solar/physics?" + query)
    assert response.status_code == 200, response.text
    assert response.json()["test_only_non_science"] is True
    payload = response.json()["received"]
    assert {key: payload[key] for key in expected} == expected
    assert events == {"rate": 1, "get_runner": 1, "runs": [(payload, server.SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS)]}


@pytest.mark.parametrize(("query", "key", "value"), [
    ("jd_tdb=2460001.5&jd_tdb=2460000.5", "epoch_jd_tdb", EPOCH),
    ("fidelity=not-a-level&fidelity=preview", "fidelity", "preview"),
    ("live_data=invalid&live_data=true", "live_data", True),
])
def test_duplicate_declared_scalar_retains_last_value(route, query, key, value):
    client, events = route
    response = client.get("/solar/physics?" + query)
    assert response.status_code == 200
    assert response.json()["received"][key] == value
    assert events["rate"] == events["get_runner"] == len(events["runs"]) == 1


@pytest.mark.parametrize(("query", "status", "code", "rate"), [
    ("jd_tdb=no", 400, "invalid_jd_tdb", 0),
    ("jd_tdb=nan", 400, "invalid_jd_tdb", 0),
    ("jd_tdb=2460000.5&jd=2460001.5", 400, "conflicting_julian_date_aliases", 0),
    ("fidelity=unknown", 400, None, 0),
    ("forcing=unknown", 400, None, 0),
    ("live_data=invalid", 422, None, 0),
    ("max_features=no", 422, None, 0),
    ("max_features=7", 413, None, 1),
])
def test_existing_declared_validation_and_admission_order(route, query, status, code, rate):
    client, events = route
    response = client.get("/solar/physics?" + query)
    assert response.status_code == status, response.text
    if code is not None:
        assert response.json()["detail"]["code"] == code
    assert events == {"rate": rate, "get_runner": 0, "runs": []}


def test_openapi_declares_exact_nine_query_names_and_legacy_alias(route):
    client, events = route
    response = client.get("/openapi.json")
    assert response.status_code == 200
    parameters = {item["name"]: item for item in response.json()["paths"]["/solar/physics"]["get"]["parameters"] if item["in"] == "query"}
    assert set(parameters) == KNOWN
    assert parameters["jd"]["deprecated"] is True
    assert "TDB" in parameters["jd_tdb"]["description"]
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


@pytest.mark.parametrize(("headers", "status", "code"), [
    ({}, 401, None),
    ({"X-API-Key": "owned-synthetic-key"}, 400, "network_refresh_get_forbidden"),
])
def test_network_authentication_and_recognized_refresh_policy(route, monkeypatch, headers, status, code):
    client, events = route
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({"SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": "owned-synthetic-key"}))
    response = client.get("/solar/physics?force_data_refresh=true", headers=headers)
    assert response.status_code == status
    if code is not None:
        assert response.json()["detail"]["code"] == code
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


# Append-only root-selected fixed-message and precedence supplement.
def test_unknown_key_error_does_not_reflect_input(route):
    client, events = route
    response = client.get("/solar/physics?unknown%3Cscript%3E=private-marker-do-not-reflect")
    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "unknown_query_parameters",
        "message": "Unknown query parameters for /solar/physics.",
        "retryable": False,
    }
    assert "script" not in response.text
    assert "private-marker" not in response.text
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


def test_unknown_key_rejects_before_default_epoch_computation(route, monkeypatch):
    client, events = route
    calls = []

    def now():
        calls.append("called")
        return NOW

    monkeypatch.setattr(server, "current_jd_tdb", now)
    response = client.get("/solar/physics?julian_date=2460000.5")
    assert calls == [], "unknown keys must not compute a misleading default epoch"
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "unknown_query_parameters"
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


@pytest.mark.parametrize("invalid", ["jd_tdb=not-a-date", "fidelity=not-a-level", "forcing=not-a-mode"])
def test_unknown_key_precedes_string_semantic_validation(route, invalid):
    client, events = route
    response = client.get("/solar/physics?extra=x&" + invalid)
    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "unknown_query_parameters",
        "message": "Unknown query parameters for /solar/physics.",
        "retryable": False,
    }
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


@pytest.mark.parametrize("invalid", ["live_data=not-a-boolean", "max_features=not-an-integer"])
def test_unknown_key_does_not_preempt_framework_typed_validation(route, invalid):
    client, events = route
    response = client.get("/solar/physics?extra=x&" + invalid)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


@pytest.mark.parametrize(("headers", "status", "code"), [
    ({}, 401, None),
    ({"X-API-Key": "owned-synthetic-key"}, 400, "network_refresh_get_forbidden"),
])
def test_unknown_key_does_not_preempt_network_auth_or_refresh(route, monkeypatch, headers, status, code):
    client, events = route
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({"SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": "owned-synthetic-key"}))
    response = client.get("/solar/physics?force_data_refresh=true&extra=x", headers=headers)
    assert response.status_code == status
    if code is not None:
        assert response.json()["detail"]["code"] == code
    assert events == {"rate": 0, "get_runner": 0, "runs": []}


@pytest.mark.parametrize("version", [None, "a" * 64])
def test_render_delivery_query_keys_are_admitted(route, version):
    client, events = route
    params = {"jd_tdb": EPOCH, "delivery": "render-v1"}
    if version is not None:
        params["geometry_version"] = version
    response = client.get("/solar/physics", params=params)
    assert response.status_code == 200, response.text
    assert response.json()["delivery"]["schema"] == {"name": "solar_render_delivery", "version": 1}
    assert len(events["runs"]) == 1
    payload, _timeout = events["runs"][0]
    assert "delivery" not in payload and "geometry_version" not in payload


@pytest.mark.parametrize("version", ["short", "A" * 64, "g" * 64, "a" * 65])
def test_invalid_geometry_versions_rejected_before_runner(route, version):
    client, events = route
    response = client.get("/solar/physics", params={"delivery": "render-v1", "geometry_version": version})
    assert response.status_code == 422
    assert events == {"rate": 0, "get_runner": 0, "runs": []}
