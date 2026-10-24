"""FE-EPOCH-RANGE: exact configured bounds on the existing range error only.

Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
Actual ASGI and owned runner; no live provider or numerical-accuracy claim.
"""
from __future__ import annotations

from dataclasses import replace
import math

from fastapi.testclient import TestClient
import pytest
import server


@pytest.fixture
def owned(monkeypatch):
    minimum = server.J2000_JD - 365.251234567
    maximum = server.J2000_JD + 365.251234567
    calls = {"rate": [], "runner": []}
    class Runner:
        async def run(self, payload, *, timeout_seconds):
            calls["runner"].append((dict(payload), timeout_seconds))
            return {"owned_fixture": True, "epoch_jd_tdb": payload["epoch_jd_tdb"]}
    monkeypatch.setattr(server, "SOLAR_PHYSICS_JD_MIN", minimum)
    monkeypatch.setattr(server, "SOLAR_PHYSICS_JD_MAX", maximum)
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", replace(server.SOLAR_SECURITY_CONFIG, profile="local", api_key_hashes=frozenset()))
    monkeypatch.setattr(server, "_enforce_solar_request_rate_limit", lambda request: calls["rate"].append(request.url.path))
    monkeypatch.setattr(server, "_solar_physics_runner", Runner())
    client = TestClient(server.app)
    try:
        yield client, minimum, maximum, calls
    finally:
        client.close()


@pytest.mark.parametrize("side", ["lower", "upper"])
def test_selected_contract_exact_fractional_configured_range_before_admission(owned, side):
    client, minimum, maximum, calls = owned
    epoch = minimum - 1 if side == "lower" else maximum + 1
    response = client.get("/solar/physics", params={"jd_tdb": repr(epoch)})
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "jd_out_of_range"
    assert detail["retryable"] is False
    assert detail["message"] == f"'jd_tdb' must be within [{minimum:.1f}, {maximum:.1f}] JDTDB (the corona model validity window)."
    assert calls == {"rate": [], "runner": []}
    bounds = detail.get("valid_jd_range")
    assert bounds == {"min_jd_tdb": minimum, "max_jd_tdb": maximum}
    assert all(type(value) in (float, int) and math.isfinite(value) for value in bounds.values())
    assert bounds["min_jd_tdb"] != float(f"{minimum:.1f}")
    assert "retry-after" not in response.headers


@pytest.mark.parametrize("side", ["lower", "upper"])
def test_control_inclusive_exact_configured_endpoint_reaches_owned_runner(owned, side):
    client, minimum, maximum, calls = owned
    epoch = minimum if side == "lower" else maximum
    response = client.get("/solar/physics", params={"jd_tdb": repr(epoch)})
    assert response.status_code == 200
    assert response.json() == {"owned_fixture": True, "epoch_jd_tdb": epoch}
    assert calls["rate"] == ["/solar/physics"]
    assert len(calls["runner"]) == 1
    assert calls["runner"][0][0]["epoch_jd_tdb"] == epoch
    assert "valid_jd_range" not in response.json()


@pytest.mark.parametrize(("query", "status", "code"), [
    ({"jd_tdb": "nan"}, 400, "invalid_jd_tdb"),
    ({"jd_tdb": "2451545", "jd": "2451546"}, 400, "conflicting_julian_date_aliases"),
    ({"jd_tdb": "9999999", "julian_date": "2451545"}, 400, "unknown_query_parameters"),
    ({"jd_tdb": "9999999", "max_features": "not-an-int"}, 422, None),
])
def test_control_unrelated_parser_errors_do_not_advertise_bounds(owned, query, status, code):
    client, _, _, calls = owned
    response = client.get("/solar/physics", params=query)
    assert response.status_code == status
    detail = response.json()["detail"]
    if code is not None:
        assert detail["code"] == code
    assert "valid_jd_range" not in str(detail)
    assert calls == {"rate": [], "runner": []}


@pytest.mark.parametrize(("authenticated", "refresh", "expected", "code"), [
    (False, False, 401, "authentication_required"),
    (True, True, 400, "network_refresh_get_forbidden"),
])
def test_control_network_auth_and_refresh_precedence_remain(owned, monkeypatch, authenticated, refresh, expected, code):
    client, _, maximum, calls = owned
    key = "owned-epoch-range-key-not-a-secret"
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", replace(server.SOLAR_SECURITY_CONFIG, profile="network", api_key_hashes=frozenset({server._api_key_digest(key)})))
    response = client.get("/solar/physics", params={"jd_tdb": repr(maximum + 1), "force_data_refresh": str(refresh).lower()}, headers={"X-API-Key": key} if authenticated else {})
    assert response.status_code == expected
    assert response.json()["detail"]["code"] == code
    assert "valid_jd_range" not in response.text
    assert calls == {"rate": [], "runner": []}
