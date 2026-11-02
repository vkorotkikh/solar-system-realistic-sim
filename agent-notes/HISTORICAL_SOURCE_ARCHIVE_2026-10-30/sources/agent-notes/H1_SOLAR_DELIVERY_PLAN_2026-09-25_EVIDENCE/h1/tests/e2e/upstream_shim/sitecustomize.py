"""E2E harness shim (NOT product code): makes the backend hermetic and deterministic.

Loaded via PYTHONPATH=<this dir> when launching uvicorn from backend/.
H1_UPSTREAM=fixture (default): every non-loopback DNS lookup fails; the realtime provider returns a
    canned live-like snapshot with one AIA channel and serves a 1x1 PNG for any tile URL.
H1_UPSTREAM=offline: DNS blocked only (upstreams refuse fast; provider's real degraded path).
H1_UPSTREAM=hang:    urlopen sleeps its declared timeout then fails (black-holed upstream).
"""
import os
import socket
import sys
import time
import urllib.error
import urllib.request

MODE = os.environ.get("H1_UPSTREAM", "fixture")
_real_gai = socket.getaddrinfo


def _gai(host, *a, **k):
    if host and not str(host).startswith("127.") and host not in ("localhost", "::1"):
        raise socket.gaierror(f"h1 e2e shim: DNS for {host} blocked")
    return _real_gai(host, *a, **k)


socket.getaddrinfo = _gai

if MODE == "hang":
    def _hang(req, *a, **k):
        time.sleep(float(k.get("timeout") or 10.0))
        raise urllib.error.URLError("h1 e2e shim: upstream hung")
    urllib.request.urlopen = _hang

if MODE == "fixture":
    sys.path.insert(0, os.getcwd())
    import sim.solar_realtime_data as _rt  # noqa: E402

    def _png(w=64, h=64):
        import struct, zlib
        def chunk(t, d):
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        raw = b"".join(b"\x00" + bytes([255, 140, 40, 255]) * w for _ in range(h))
        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

    _PNG_1x1 = _png()

    def _iso(seconds_ago):
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - seconds_ago))

    def _fake_snapshot(self, jd):
        return {
            "schema": {"name": "solar_realtime_context", "version": 1},
            "fetched_at_utc": _iso(0),
            "source_status": {"swpc": {"ok": False, "error": "fixture"}, "silso": {"ok": True},
                              "sdo_aia": {"ok": True}, "gong_synoptic": {"ok": True}},
            "swpc": None,
            "silso": {"date": time.strftime("%Y-%m-%d", time.gmtime(time.time() - 86400)), "activity_proxy": 0.31},
            "sdo_aia": {
                "latest_image_date_utc": _iso(3600), "activity_proxy": 0.2, "freshness_proxy": 0.9,
                "visualization": {"preferred_channel": "aia_193"},
                "channels": {"aia_193": {"image_id": "192406635", "image_date": "2026-09-25 00:17:53",
                                          "tile_url": "https://api.helioviewer.org/v2/getTile/?id=192406635&x=-1&y=-1&imageScale=0.6"}},
            },
            "gong_synoptic": {"status": "ready"},
            "combined_activity_proxy": None,
        }

    def _fake_binary_cached(self, url, ttl_s=None):
        return _PNG_1x1, "image/png"

    _rt.SolarRealtimeDataProvider._fetch_snapshot = _fake_snapshot
    _rt.SolarRealtimeDataProvider._fetch_binary_cached = _fake_binary_cached

sys.stderr.write(f"[h1 e2e shim] upstream mode={MODE}\n")
