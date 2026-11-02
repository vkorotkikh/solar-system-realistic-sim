"""Regression: BKP-031 / PEER-b, request coverage must not poison Horizons.

Found by /qa on 2026-10-24.
Synthetic in-window cutoff follows the captured Horizons coverage-error shape;
it makes no claim that Earth actually lacks coverage at this epoch.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import socket
import threading
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import server
from data.bodies import ALL_BODIES
from mission import ephemeris_service as module
from trajectory import budget as budget_module
from trajectory.budget import PlanningContext
from test_ephemeris_service_safety import _horizons_payload, _Response


JD = 2_460_400.5


@pytest.fixture(autouse=True)
def isolated_provider_state():
    module._reset_shared_ephemeris_state_for_tests()
    yield
    module._reset_shared_ephemeris_state_for_tests()


def service():
    return module.EphemerisService(
        ALL_BODIES, provider="horizons", context=PlanningContext.with_timeout(2.0)
    )


def refusal(direction="after", era="A.D."):
    return {
        "signature": {"source": "NASA/JPL Horizons API", "version": "1.2"},
        "error": f"No ephemeris for target \"Earth\" {direction} {era} 2024-MAR-30 00:00:00.0000 TDB",
    }


@pytest.mark.parametrize("direction,era", [("after", "A.D."), ("prior to", "A.D."), ("prior to", "B.C.")])
def test_coverage_refusal_preserves_unrelated_client_access(monkeypatch, direction, era):
    calls = []

    def transport(request, *, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            return _Response(json.dumps(refusal(direction, era)).encode())
        return _Response(_horizons_payload(target_id="499", jd=JD + 1))

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    with pytest.raises(module.EphemerisError) as caught:
        service().sample_state("earth", JD)
    error = caught.value
    assert error.code == "ephemeris_epoch_unsupported"
    assert error.retryable is False
    assert error.body_id == "earth"
    assert error.jd == JD
    assert error.retry_after_s is None
    for copy in (error.clone(), module._EphemerisFailureData.from_error(error).to_error()):
        assert type(copy) is type(error)
        assert copy is not error
        assert copy.to_dict() == error.to_dict()

    sample = service().sample_state("mars", JD + 1)
    assert sample.body_id == "mars"
    assert sample.jd == JD + 1
    assert sample.source == "horizons"
    assert len(calls) == 2


@pytest.mark.parametrize("body_id,jd,message", [
    ("earth", 1e15, 'No ephemeris for target "Earth" after A.D. 9999-DEC-30 12:00:00.0000 TDB'),
    ("earth", -1e9, 'No ephemeris for target "Earth" prior to B.C. 9999-MAR-21 00:00:00.0000 TDB'),
    ("pluto", 2_000_000.5, 'No ephemeris for target "Pluto" prior to A.D. 1800-JAN-03 00:00:00.0000 TDB'),
])
def test_refusal_wording_captured_from_live_horizons_is_request_scoped(monkeypatch, body_id, jd, message):
    # Live API, 2026-11-02, this service's query: HTTP 200 with the refusal in both fields.
    captured = {**refusal(), "error": message, "result": f"\n{message}\n"}
    calls = []

    def transport(request, *, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            return _Response(json.dumps(captured).encode())
        return _Response(_horizons_payload(target_id="499", jd=JD + 1))

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    with pytest.raises(module.EphemerisError) as caught:
        service().sample_state(body_id, jd)
    assert caught.value.code == "ephemeris_epoch_unsupported"
    assert service().sample_state("mars", JD + 1).body_id == "mars"
    assert len(calls) == 2


@pytest.mark.parametrize("signature", [
    None, {}, {"source": "not-horizons", "version": "1.2"},
    {"source": "NASA/JPL Horizons API"},
    {"source": "NASA/JPL Horizons API", "version": ""},
    {"source": "NASA/JPL Horizons API", "version": "   "},
    {"source": "NASA/JPL Horizons API", "version": 1.2},
])
def test_coverage_error_requires_provider_provenance_before_classification(monkeypatch, signature):
    payload = refusal()
    payload["signature"] = signature
    calls = []

    def transport(request, *, timeout):
        calls.append(request.full_url)
        return _Response(json.dumps(payload).encode())

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    with pytest.raises(module.EphemerisProtocolError):
        service().sample_state("earth", JD)
    with pytest.raises(module.EphemerisProtocolError):
        service().sample_state("mars", JD + 1)
    assert len(calls) == 1


@pytest.mark.parametrize("message", [
    "service unavailable", "No ephemeris for target Earth", {"error": "after"},
    "No ephemeris for target Earth because the service is unavailable",
    "No ephemeris for target Earth after connection failure",
])
def test_unknown_provider_error_remains_a_protocol_failure(monkeypatch, message):
    payload = refusal()
    payload["error"] = message
    monkeypatch.setattr(module, "_horizons_urlopen", lambda request, *, timeout: _Response(json.dumps(payload).encode()))
    with pytest.raises(module.EphemerisProtocolError):
        service().sample_state("earth", JD)


def test_coverage_refusal_reaches_http_as_nonretryable_422(monkeypatch):
    monkeypatch.setattr(module, "_horizons_urlopen", lambda request, *, timeout: _Response(json.dumps(refusal()).encode()))
    monkeypatch.setattr(server, "_trajectory_lambert_concurrent_guard", threading.BoundedSemaphore(1))
    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post("/trajectory/lambert", json={
        "from_id": "earth", "to_id": "mars", "departure_jd": JD,
        "arrival_jd": JD + 250, "ephemeris_provider": "horizons", "prograde": True,
    })
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "ephemeris_epoch_unsupported"
    assert detail["retryable"] is False
    assert detail["context"]["bodyId"] == "earth"
    assert detail["context"]["jdTdb"] == JD
    assert "retry-after" not in response.headers


def test_shared_coverage_refusal_keeps_typed_follower_error(monkeypatch):
    entered = threading.Event()
    follower_waiting = threading.Event()
    release = threading.Event()
    calls = []

    def transport(request, *, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            entered.set()
            assert release.wait(1.0)
            return _Response(json.dumps(refusal()).encode())
        return _Response(_horizons_payload(target_id="499", jd=JD + 1))

    original_wait = module.EphemerisService._wait_for_shared_ephemeris_event

    def observed_wait(self, event):
        follower_waiting.set()
        return original_wait(self, event)

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    monkeypatch.setattr(module.EphemerisService, "_wait_for_shared_ephemeris_event", observed_wait)
    with ThreadPoolExecutor(max_workers=2) as executor:
        owner = executor.submit(service().sample_state, "earth", JD)
        try:
            assert entered.wait(1.0)
            follower = executor.submit(service().sample_state, "earth", JD)
            assert follower_waiting.wait(1.0)
        finally:
            release.set()
        errors = []
        for future in (owner, follower):
            with pytest.raises(module.EphemerisError) as caught:
                future.result(timeout=1.0)
            errors.append(caught.value)
    assert errors[0].code == errors[1].code == "ephemeris_epoch_unsupported"
    assert errors[0] is not errors[1]
    assert type(errors[0]) is type(errors[1])
    assert len(calls) == 1
    assert service().sample_state("mars", JD + 1).body_id == "mars"
    assert len(calls) == 2


def test_half_open_coverage_refusal_does_not_extend_provider_outage(monkeypatch):
    calls = []
    clock = [time.monotonic()]

    def transport(request, *, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            raise socket.timeout("fixture provider outage")
        if len(calls) == 2:
            return _Response(json.dumps(refusal()).encode())
        return _Response(_horizons_payload(target_id="499", jd=JD + 1))

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    # Share one owned clock between breaker and finite request deadlines without
    # replacing the process-wide standard-library clock used by other workers.
    owned_time = SimpleNamespace(monotonic=lambda: clock[0], sleep=time.sleep)
    monkeypatch.setattr(module, "time", owned_time)
    monkeypatch.setattr(budget_module, "time", owned_time)
    monkeypatch.setattr(module, "HORIZONS_PROVIDER_OUTAGE_COOLDOWN_S", 30.0)
    monkeypatch.setattr(module, "HORIZONS_PROVIDER_OUTAGE_MAX_COOLDOWN_S", 60.0)
    with pytest.raises(module.EphemerisUpstreamTimeout):
        service().sample_state("earth", JD)
    with pytest.raises(module.EphemerisUpstreamTimeout):
        service().sample_state("mars", JD + 1)
    assert len(calls) == 1
    clock[0] += 31.0
    with pytest.raises(module.EphemerisEpochUnsupported):
        service().sample_state("earth", JD)
    # No second time advance: re-opening the outage would reject this client.
    assert service().sample_state("mars", JD + 1).body_id == "mars"
    assert len(calls) == 3
