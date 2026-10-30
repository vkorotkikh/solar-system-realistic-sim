"""H-1 draft contract tests for /solar/physics and /solar/realtime/aia-tile.

Target location after the fix: backend/tests/test_solar_physics_h1_contract.py
(drop the sys.path shim below; backend/tests/conftest.py already provides it).

Design rules encoded here:
* Hermetic: an autouse fixture fails closed on any non-loopback DNS lookup, so no test can reach
  gong.nso.edu / helioviewer / NOAA / SILSO (the existing suite does, 20 attempts per run).
* Rate-limit and guard state are module globals in server.py; every test gets fresh ones, or the
  36-requests-per-60-s limiter makes later tests flaky as the file grows.
* Uses the FRONTEND's query (hybrid + live_data=true + high + 180), not the route defaults
  (synthetic + live_data=false) that every existing API test exercises.
* Counts work (PFSS solves, snapshot fetches) instead of timing it wherever possible.
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest

BACKEND = Path(os.environ.get("H1_BACKEND_DIR", "")).resolve()
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from sim.pfss_magnetogram import PFSSCache  # noqa: E402

FRONTEND_QUERY = {"fidelity": "high", "max_features": 180, "forcing": "hybrid", "live_data": "true"}
JD = 2_461_308.5
CLIENT_TIMEOUT_S = 2.6  # src/sunController.ts:155 at bd48a7d; import from a shared policy file after the fix
CLIENT_POLL_S = 0.9  # src/sunController.ts:154
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
PREVIEW_ORIGINS = ["http://localhost:4173", "http://127.0.0.1:4173"]

client = TestClient(server.app)


# ── fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def hermetic_network(monkeypatch):
    real = socket.getaddrinfo

    def guarded(host, *args, **kwargs):
        if host and not str(host).startswith("127.") and host not in ("localhost", "::1", "testserver"):
            raise socket.gaierror(f"hermetic test: DNS for {host} blocked")
        return real(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", guarded)


@pytest.fixture(autouse=True)
def fresh_limits(monkeypatch):
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(server, "_solar_physics_concurrent_guard", threading.BoundedSemaphore(2))
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "_snapshot_cache", type(server.SOLAR_REALTIME_DATA._snapshot_cache)())
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "_inflight_failures", {})


def _fresh_iso(seconds_ago: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - seconds_ago))


def _live_like_snapshot() -> dict[str, Any]:
    """Shape copied from a live run (payload_shape_online.json); timestamps are 'now' so the
    freshness weighting in SolarCoronaPhysicsModel._apply_realtime_forcing is active."""
    return {
        "schema": {"name": "solar_realtime_context", "version": 1},
        "fetched_at_utc": _fresh_iso(0),
        "source_status": {"swpc": {"ok": False}, "silso": {"ok": True}, "sdo_aia": {"ok": True}, "gong_synoptic": {"ok": True}},
        "swpc": None,
        "silso": {"date": time.strftime("%Y-%m-%d", time.gmtime(time.time() - 86_400)), "activity_proxy": 0.31},
        "sdo_aia": {
            "latest_image_date_utc": _fresh_iso(3_600),
            "activity_proxy": 0.2,
            "freshness_proxy": 0.9,
            "visualization": {"preferred_channel": "aia_193"},
            "channels": {"aia_193": {"image_id": "192406635", "image_date": "2026-09-25 00:17:53",
                                      "tile_url": "https://api.helioviewer.org/v2/getTile/?id=192406635"}},
        },
        "gong_synoptic": {"status": "ready"},
        "combined_activity_proxy": None,
    }


@pytest.fixture
def work_counters(monkeypatch):
    """Replace the two expensive steps with recording fakes: upstream snapshot + PFSS solve."""
    counts = {"snapshot": 0, "pfss": 0, "pfss_keys": []}

    def fake_snapshot(jd):
        counts["snapshot"] += 1
        return _live_like_snapshot()

    cache = PFSSCache()

    def fake_pfss(cr, activity, jd, n_lines, lmax, timeout):
        counts["pfss"] += 1
        counts["pfss_keys"].append((cr, activity, jd))
        return {"source": "synthetic", "carrington_rotation": cr, "source_surface_radii": 2.5, "lmax": lmax,
                "line_count": 0, "open_line_count": 0, "closed_line_count": 0, "lines": [],
                "wsa": {"mean_velocity_kms": 450.0, "grid_resolution": "36x72", "model": "arge_2003"},
                "_wsa_result": None}

    cache._compute = fake_pfss  # type: ignore[method-assign]
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "_fetch_snapshot", fake_snapshot)
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "_pfss_cache", cache)
    return counts


def _physics(jd: float, origin: str | None = None, **extra):
    headers = {"origin": origin} if origin else {}
    return client.get("/solar/physics", params={"jd": f"{jd:.8f}", **FRONTEND_QUERY, **extra}, headers=headers)


# ── caching / quantisation ──────────────────────────────────────────────────


def test_frames_within_one_jd_bucket_share_snapshot_and_pfss_work(work_counters) -> None:
    """Client sends jd.toFixed(8) of a clock that advances every frame (1e-8 d = 0.86 ms)."""
    first = _physics(JD)
    second = _physics(JD + 1e-8)
    assert first.status_code == second.status_code == 200
    assert work_counters["snapshot"] == 1, "upstream snapshot re-fetched for a sub-millisecond jd change"
    assert work_counters["pfss"] == 1, f"PFSS re-solved; keys={work_counters['pfss_keys']}"


def test_identical_requests_reuse_pfss_even_as_wall_clock_advances(work_counters) -> None:
    """Live freshness weights use datetime.now(), so the blended `activity` float (part of the PFSS
    cache key) drifts between two byte-identical requests."""
    _physics(JD)
    time.sleep(0.05)
    _physics(JD)
    assert work_counters["pfss"] == 1, f"PFSS key drifted; keys={work_counters['pfss_keys']}"


# ── concurrency guard / orphaned work ───────────────────────────────────────


def test_timed_out_work_for_same_bucket_is_joined_not_rejected(monkeypatch) -> None:
    """Two requests time out (client gone); their work keeps running and holds both guard permits.
    A third request for the same bucket must attach to that work, not get 503 'saturated'."""
    release = threading.Event()
    builds = {"n": 0}

    def slow_build(*_a, **_k):
        builds["n"] += 1
        release.wait(timeout=5.0)
        return {"source": "backend", "schema": {"name": "solar_physics_state", "version": 1}}

    monkeypatch.setattr(server, "_build_solar_physics_state", slow_build)
    monkeypatch.setattr(server, "SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS", 0.2)
    try:
        assert _physics(JD).status_code == 503  # orphan #1
        assert _physics(JD + 1e-8).status_code == 503  # orphan #2 (same bucket after quantisation)
        threading.Timer(0.3, release.set).start()  # lets a joined request finish after the fix
        monkeypatch.setattr(server, "SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS", 5.0)
        third = _physics(JD + 2e-8)
        assert third.status_code == 200, third.text
        assert builds["n"] == 1, "identical-bucket work was started more than once"
    finally:
        release.set()


def test_compute_timeout_503_carries_retry_after(monkeypatch) -> None:
    monkeypatch.setattr(server, "_build_solar_physics_state", lambda *a, **k: time.sleep(0.3) or {})
    monkeypatch.setattr(server, "SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS", 0.05)
    response = _physics(JD)
    assert response.status_code == 503
    assert response.headers.get("retry-after") is not None


def test_rate_limit_admits_the_client_poll_rate() -> None:
    per_minute_allowed = server.SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW * 60.0 / server.SOLAR_PHYSICS_RATE_WINDOW_SECONDS
    assert per_minute_allowed >= 60.0 / CLIENT_POLL_S, (
        f"server admits {per_minute_allowed:.0f}/min but the client polls {60.0 / CLIENT_POLL_S:.0f}/min"
    )


# ── degraded upstreams ──────────────────────────────────────────────────────


def test_black_holed_upstreams_still_yield_degraded_200_within_client_budget(monkeypatch) -> None:
    """Upstreams that HANG (not refuse). Each fake urlopen sleeps its declared timeout scaled by 1/10;
    at HEAD four sequential calls (3.8+3.8+3.8+3.5 s real) exceed the 12 s compute timeout -> 503."""
    scale = 0.1

    def hanging(req, *a, **k):
        time.sleep(float(k.get("timeout") or 10.0) * scale)
        raise urllib.error.URLError("simulated hang")

    monkeypatch.setattr(urllib.request, "urlopen", hanging)
    monkeypatch.setattr(server, "SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS", 12.0 * scale)
    import sim.pfss_magnetogram as pfss_module

    def pfss_with_real_gong_attempt(cr, activity, jd, n_lines, lmax, timeout):
        pfss_module.fetch_gong_synoptic_map(cr, timeout_s=timeout)  # keeps the 4th sequential upstream wait
        return {"source": "synthetic", "carrington_rotation": cr, "lines": [], "_wsa_result": None,
                "wsa": {"mean_velocity_kms": 450.0}}

    cache = PFSSCache()
    cache._compute = pfss_with_real_gong_attempt  # type: ignore[method-assign]
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "_pfss_cache", cache)
    start = time.monotonic()
    response = _physics(JD)
    elapsed = time.monotonic() - start
    assert response.status_code == 200, response.text
    assert elapsed < CLIENT_TIMEOUT_S * scale, f"{elapsed:.2f}s (scaled) vs client budget {CLIENT_TIMEOUT_S * scale:.2f}s"
    assimilation = response.json()["data_assimilation"]
    assert assimilation["live_data_available"] is False


def test_refused_upstreams_report_truthful_provenance(monkeypatch) -> None:
    """Real provider fetch path; hermetic_network makes every upstream refuse fast."""
    cache = PFSSCache()
    cache._compute = lambda cr, *a: {"source": "synthetic", "carrington_rotation": cr, "lines": [], "_wsa_result": None,  # type: ignore[method-assign]
                                     "wsa": {"mean_velocity_kms": 450.0}}
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "_pfss_cache", cache)
    response = _physics(JD)
    assert response.status_code == 200
    body = response.json()
    status = body["data_assimilation"]["source_status"]
    assert body["data_assimilation"]["live_data_available"] is False
    assert body["pfss_field_lines"]["source"] == "synthetic"
    not_ok = {name for name, entry in status.items() if not entry.get("ok")}
    assert not_ok == set(status), f"sources claiming ok while offline: {set(status) - not_ok}"


# ── CORS ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("origin", DEV_ORIGINS + PREVIEW_ORIGINS)
def test_cors_allows_dev_and_preview_origins_on_physics_preflight(origin: str) -> None:
    response = client.options(
        "/solar/physics",
        headers={"origin": origin, "access-control-request-method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_foreign_origin() -> None:
    response = client.get("/solar/capabilities", headers={"origin": "https://attacker.invalid"})
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("origin", DEV_ORIGINS + PREVIEW_ORIGINS)
def test_aia_tile_carries_cors_header_for_webgl_texture_use(origin: str, monkeypatch) -> None:
    """THREE.TextureLoader loads with crossOrigin='anonymous'; without ACAO the <img> errors and the
    texture is never uploaded."""
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", lambda **kw: {
        "channel": "aia_193", "image_id": "192406635", "image_date": "2026-09-25 00:17:53",
        "tile_url": "x", "content": b"\x89PNG\r\n\x1a\nfake", "content_type": "image/png"})
    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193", "image_id": "192406635", "v": "192406635"},
                          headers={"origin": origin})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


def test_aia_tile_honours_the_image_id_the_physics_payload_selected(monkeypatch) -> None:
    """buildAiaProxyTextureUrl (solarObservationTexture.ts:120-135) sends image_id; the route ignores it
    and serves whatever latest_aia_tile(jd=None) returns."""
    seen: dict[str, Any] = {}

    def fake_tile(**kwargs):
        seen.update(kwargs)
        return {"channel": "aia_193", "image_id": "999", "image_date": "x", "tile_url": "x",
                "content": b"\x89PNG\r\n\x1a\nfake", "content_type": "image/png"}

    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_tile)
    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193", "image_id": "192406635"})
    assert response.status_code == 200
    assert response.headers.get("x-solar-aia-image-id") == "192406635" or seen.get("image_id") == "192406635"


# ── latency (perf job only) ─────────────────────────────────────────────────


@pytest.mark.skipif(os.environ.get("H1_PERF") != "1", reason="wall-clock budget; run in the perf job (H1_PERF=1)")
def test_frontend_query_cold_miss_fits_half_the_client_timeout(monkeypatch) -> None:
    """Real solver, upstreams refused (hermetic). Median of 3 distinct-jd cold misses."""
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "_pfss_cache", PFSSCache())
    samples = []
    for i in range(3):
        start = time.monotonic()
        assert _physics(JD + i * 0.5).status_code == 200
        samples.append(time.monotonic() - start)
    samples.sort()
    assert samples[1] < CLIENT_TIMEOUT_S / 2, f"median cold miss {samples[1]:.2f}s; samples={samples}"
