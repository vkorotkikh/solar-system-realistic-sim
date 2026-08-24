"""R4: determinism and request-bound tests for /solar/physics.

These exist because the PFSS layer shipped keyed its cache on Carrington rotation
alone, so identical requests could return different payloads depending on which
fidelity computed a rotation first (SF-4), and the endpoint had no concurrency or
range bound (R3). Each assertion below fails against that pre-R3 behaviour.

`wall_epoch_jd` is intentionally a wall-clock stamp and is excluded from the
byte-identity comparison; everything else must be reproducible for a fixed jd.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

import server
from server import app

client = TestClient(app)

_JD = 2_461_000.5


def _payload(**params):
    resp = client.get("/solar/physics", params={"jd": _JD, "forcing": "synthetic", **params})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    body.pop("wall_epoch_jd", None)  # wall-clock, deliberately non-deterministic
    return body


def test_identical_requests_are_byte_identical() -> None:
    assert _payload(fidelity="operational") == _payload(fidelity="operational")


def test_different_fidelity_yields_a_different_payload() -> None:
    # The PFSS cache must not serve an operational result to a high-fidelity caller.
    assert _payload(fidelity="operational") != _payload(fidelity="high")


def test_jd_outside_the_validity_window_is_rejected_without_computing() -> None:
    resp = client.get("/solar/physics", params={"jd": server.SOLAR_PHYSICS_JD_MAX + 1.0})
    assert resp.status_code == 400
    assert "jd" in resp.json()["detail"].lower()


def test_jd_inside_the_window_is_accepted() -> None:
    resp = client.get("/solar/physics", params={"jd": server.J2000_JD})
    assert resp.status_code == 200


def test_oversized_max_features_is_rejected_with_413() -> None:
    resp = client.get(
        "/solar/physics",
        params={"jd": _JD, "max_features": server.SOLAR_PHYSICS_MAX_FEATURES + 1000},
    )
    assert resp.status_code == 413


def test_saturation_sheds_load_with_503() -> None:
    # Drain the concurrency guard by hand, then a real request must be shed, not queued.
    guard = server._solar_physics_concurrent_guard
    acquired = 0
    while server._acquire_nonblocking(guard):
        acquired += 1
    try:
        resp = client.get("/solar/physics", params={"jd": _JD, "fidelity": "preview"})
        assert resp.status_code == 503
        assert resp.headers.get("Retry-After")
    finally:
        for _ in range(acquired):
            guard.release()
