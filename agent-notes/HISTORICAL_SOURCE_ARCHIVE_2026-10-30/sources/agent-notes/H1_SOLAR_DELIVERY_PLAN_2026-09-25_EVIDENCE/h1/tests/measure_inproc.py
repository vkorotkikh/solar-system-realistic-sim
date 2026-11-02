"""In-process latency of the frontend's exact /solar/physics query (TestClient, no server).

Usage: python measure_inproc.py [offline|online]
offline: blocks non-loopback DNS/connect (degraded upstream path); online: real upstreams (keep N tiny).
"""
from __future__ import annotations

import json
import os
import socket
import sys
import time

MODE = sys.argv[1] if len(sys.argv) > 1 else "offline"
attempts: list[str] = []
_orig_gai = socket.getaddrinfo


def _gai(host, *a, **k):
    if host and not str(host).startswith("127.") and host not in ("localhost", "::1"):
        attempts.append(str(host))
        if MODE == "offline":
            raise socket.gaierror(f"blocked {host}")
    return _orig_gai(host, *a, **k)


socket.getaddrinfo = _gai
sys.path.insert(0, os.getcwd())
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

server.SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW = 10_000
client = TestClient(server.app)
base_jd = 2_461_308.5  # 2026-09-24 00:00 UTC-ish
results = []
plan = [
    ("cold, frontend params", base_jd + 0.00000000),
    ("same jd again (cache?)", base_jd + 0.00000000),
    ("jd + 1e-8 d (toFixed(8) step)", base_jd + 0.00000001),
    ("jd + 0.0001 d (~9 s sim time)", base_jd + 0.0001),
]
for label, jd in plan:
    before = len(attempts)
    t0 = time.perf_counter()
    r = client.get(
        "/solar/physics",
        params={"jd": f"{jd:.8f}", "fidelity": "high", "max_features": 180, "forcing": "hybrid", "live_data": "true"},
        headers={"origin": "http://localhost:5173"},
    )
    dt = time.perf_counter() - t0
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    da = body.get("data_assimilation", {}) if isinstance(body, dict) else {}
    results.append({
        "label": label,
        "jd": f"{jd:.8f}",
        "status": r.status_code,
        "seconds": round(dt, 3),
        "acao": r.headers.get("access-control-allow-origin"),
        "assim_applied": da.get("applied"),
        "observed_confidence": da.get("observed_confidence"),
        "pfss_source": (body.get("pfss_field_lines") or {}).get("source") if isinstance(body, dict) else None,
        "dns_attempts_this_call": len(attempts) - before,
        "top_level_keys": sorted(body.keys())[:40] if isinstance(body, dict) else None,
    })
print(json.dumps({"mode": MODE, "results": results, "hosts": sorted(set(attempts))}, indent=1))
