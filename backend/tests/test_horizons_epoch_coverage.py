"""A Horizons coverage refusal is request-scoped: it must not open the outage breaker.

Horizons answers an epoch outside one target's ephemeris with HTTP 200 and
"No ephemeris for target ... after|prior to <date>". That refusal belongs to the
one request: the client gets a non-retryable 422, and the process-wide outage
breaker that would block every other client stays closed.
The synthetic in-window cutoff below follows the captured shape; it makes no
claim that Earth actually lacks coverage at this epoch.
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


# Extended by /ship coverage audit, 2026-11-02: last row only (refusal sentence behind a prefix).
# Value: protects=Provider error text that embeds the refusal sentence after other text stays a protocol failure, so untrusted envelopes keep outage protection;
#   fails_when=the refusal match is loosened from anchored-at-start (re.match plus ^) to a substring search;
#   why_new=existing negative rows either start with the sentence or lack its era-and-date tail; none carries a full sentence behind a prefix;
#   seam=none;
#   no_claim=breaker side effects (this table asserts the exception type only; the signature test asserts breaker state)
@pytest.mark.parametrize("message", [
    "service unavailable", "No ephemeris for target Earth", {"error": "after"},
    "No ephemeris for target Earth because the service is unavailable",
    "No ephemeris for target Earth after connection failure",
    'Gateway relayed: No ephemeris for target "Earth" after A.D. 2024-MAR-30 00:00:00.0000 TDB',
])
def test_unknown_provider_error_remains_a_protocol_failure(monkeypatch, message):
    payload = refusal()
    payload["error"] = message
    monkeypatch.setattr(module, "_horizons_urlopen", lambda request, *, timeout: _Response(json.dumps(payload).encode()))
    with pytest.raises(module.EphemerisProtocolError):
        service().sample_state("earth", JD)


# Added by /ship coverage audit, 2026-11-02.
# Value: protects=A coverage refusal padded with whitespace is still a request-scoped epoch refusal, not a provider-wide protocol outage;
#   fails_when=the strip() before the refusal match is removed, so padded text becomes a protocol error that blocks every client for 30-60 s;
#   why_new=every other refusal row is unpadded, so nothing else exercises strip();
#   seam=none;
#   no_claim=whether live Horizons ever pads the error field (padding here is synthetic)
@pytest.mark.parametrize("pad", [
    pytest.param("\n", id="newline"),
    pytest.param("  ", id="spaces"),
    pytest.param(" \t\r\n", id="mixed"),
])
def test_coverage_refusal_ignores_surrounding_whitespace(monkeypatch, pad):
    padded = refusal()
    padded["error"] = f"{pad}{padded['error']}{pad}"
    calls = []

    def transport(request, *, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            return _Response(json.dumps(padded).encode())
        return _Response(_horizons_payload(target_id="499", jd=JD + 1))

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    with pytest.raises(module.EphemerisEpochUnsupported):
        service().sample_state("earth", JD)
    assert service().sample_state("mars", JD + 1).body_id == "mars"
    assert len(calls) == 2


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


# Added by /ship coverage audit, 2026-11-02.
# Value: protects=Lambert to a Horizons-unmapped body returns a non-retryable HTTP 422 ephemeris_target_unsupported and makes no upstream call;
#   fails_when=_ephemeris_http_exception stops mapping EphemerisTargetUnsupported to 422 (falls to 503), or preflight lets the call reach Horizons;
#   why_new=no other test asserts this status; the 422 isinstance tuple covers target and epoch refusals, and the other 422 test covers only the epoch side;
#   seam=none;
#   no_claim=live Horizons target coverage (static id map; fake transport must stay unused)
def test_unmapped_horizons_target_reaches_http_as_nonretryable_422_without_upstream_call(monkeypatch):
    calls = []

    def transport(request, *, timeout):
        calls.append(request.full_url)
        raise AssertionError("target preflight must reject before any Horizons call")

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    monkeypatch.setattr(server, "_trajectory_lambert_concurrent_guard", threading.BoundedSemaphore(1))
    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post("/trajectory/lambert", json={
        "from_id": "earth", "to_id": "psyche", "departure_jd": JD,
        "arrival_jd": JD + 250, "ephemeris_provider": "horizons", "prograde": True,
    })
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "ephemeris_target_unsupported"
    assert detail["retryable"] is False
    assert detail["context"]["bodyId"] == "psyche"
    assert "retry-after" not in response.headers
    assert calls == []


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
    # The refused probe hands the breaker back to half-open, so the next client probes alone.
    outage = module._SHARED_PROVIDER_OUTAGES["horizons"]
    assert outage.probing is False
    assert outage.probe_event is None
    # No second time advance: re-opening the outage would reject this client.
    # Bounded because a probe-reset regression makes this client wait forever on
    # the frozen clock (seen under mutation on 2026-11-02): fail, never hang CI.
    with ThreadPoolExecutor(max_workers=1) as executor:
        try:
            sample = executor.submit(service().sample_state, "mars", JD + 1).result(timeout=5.0)
        finally:
            clock[0] += 10_000.0
    assert sample.body_id == "mars"
    assert len(calls) == 3


# Added by /ship coverage audit, 2026-11-02.
# Value: protects=A client waiting on a half-open Horizons probe is released and proceeds when the probe owner is refused for its own epoch;
#   fails_when=the probe event is never set, or the half-open state is not reset at all, when the probe owner is refused, hanging or re-rejecting the waiter;
#   why_new=the existing half-open refusal test is sequential, so no test has a second client waiting on the probe event;
#   seam=none;
#   no_claim=wall-clock cooldown timing and live network (fake clock and transport; thread order is event-synchronised)
def test_waiter_on_half_open_probe_proceeds_when_probe_is_refused_for_its_epoch(monkeypatch):
    calls = []
    clock = [time.monotonic()]
    probe_in_flight = threading.Event()
    waiter_waiting = threading.Event()
    release = threading.Event()

    def transport(request, *, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            raise socket.timeout("fixture provider outage")
        if len(calls) == 2:
            probe_in_flight.set()
            assert release.wait(5.0)
            return _Response(json.dumps(refusal()).encode())
        return _Response(_horizons_payload(target_id="499", jd=JD + 1))

    original_wait = module.EphemerisService._wait_for_shared_ephemeris_event

    def observed_wait(self, event):
        waiter_waiting.set()
        return original_wait(self, event)

    monkeypatch.setattr(module, "_horizons_urlopen", transport)
    monkeypatch.setattr(module.EphemerisService, "_wait_for_shared_ephemeris_event", observed_wait)
    owned_time = SimpleNamespace(monotonic=lambda: clock[0], sleep=time.sleep)
    monkeypatch.setattr(module, "time", owned_time)
    monkeypatch.setattr(budget_module, "time", owned_time)
    monkeypatch.setattr(module, "HORIZONS_PROVIDER_OUTAGE_COOLDOWN_S", 30.0)
    monkeypatch.setattr(module, "HORIZONS_PROVIDER_OUTAGE_MAX_COOLDOWN_S", 60.0)
    with pytest.raises(module.EphemerisUpstreamTimeout):
        service().sample_state("earth", JD)
    clock[0] += 31.0
    with ThreadPoolExecutor(max_workers=2) as executor:
        try:
            probe = executor.submit(service().sample_state, "earth", JD)
            assert probe_in_flight.wait(5.0)
            waiter = executor.submit(service().sample_state, "mars", JD + 1)
            assert waiter_waiting.wait(5.0)
            release.set()
            with pytest.raises(module.EphemerisEpochUnsupported):
                probe.result(timeout=5.0)
            sample = waiter.result(timeout=5.0)
        finally:
            release.set()
            # Expire every deadline so a stranded waiter exits and the executor can join.
            clock[0] += 10_000.0
    assert sample.body_id == "mars"
    assert len(calls) == 3
    assert module._SHARED_PROVIDER_OUTAGES == {}
