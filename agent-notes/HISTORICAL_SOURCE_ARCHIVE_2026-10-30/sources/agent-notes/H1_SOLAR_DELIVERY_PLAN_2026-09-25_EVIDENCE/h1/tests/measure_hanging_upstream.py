"""How long does ONE frontend-shaped /solar/physics request take when every upstream HANGS until its
socket timeout (vs. refusing fast)? urlopen is replaced by a sleeper; no real network traffic.
PFSS compute is stubbed so only upstream waiting is measured. Usage: python measure_hanging_upstream.py <per_call_timeout_s>"""
from __future__ import annotations
import json, os, sys, threading, time, urllib.error, urllib.request
sys.path.insert(0, os.getcwd())
PER_CALL = float(sys.argv[1]) if len(sys.argv) > 1 else 0.8
calls: list[tuple[float, str, float]] = []
t_start = [0.0]
def hanging_urlopen(req, *a, **k):
    url = req if isinstance(req, str) else getattr(req, "full_url", str(req))
    timeout = float(k.get("timeout") or (a[1] if len(a) > 1 else 10.0))
    calls.append((round(time.perf_counter() - t_start[0], 3), url.split("?")[0][:80], timeout))
    time.sleep(min(timeout, PER_CALL))
    raise urllib.error.URLError("simulated: upstream hung until timeout")
urllib.request.urlopen = hanging_urlopen
import server  # noqa
import sim.pfss_magnetogram as pm  # noqa
from sim.pfss_magnetogram import PFSSCache
from fastapi.testclient import TestClient
server.SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW = 10_000
cache = PFSSCache()
def fake_compute(cr, activity, jd, n_lines, lmax, timeout):
    # keep the real GONG attempt (it is part of the upstream wait), skip the solver
    pm.fetch_gong_synoptic_map(cr, timeout_s=timeout)
    return {"source": "synthetic", "carrington_rotation": cr, "source_surface_radii": 2.5, "lmax": lmax,
            "line_count": 0, "open_line_count": 0, "closed_line_count": 0, "lines": [],
            "wsa": {"mean_velocity_kms": 450.0, "grid_resolution": "36x72", "model": "arge_2003"}, "_wsa_result": None}
cache._compute = fake_compute
server.SOLAR_PHYSICS_MODEL._pfss_cache = cache
c = TestClient(server.app)
t_start[0] = time.perf_counter()
r = c.get("/solar/physics", params={"jd": "2461308.51234567", "fidelity": "high", "max_features": 180, "forcing": "hybrid", "live_data": "true"})
elapsed = time.perf_counter() - t_start[0]
out = {"per_call_hang_s": PER_CALL, "status": r.status_code, "elapsed_s": round(elapsed, 2), "upstream_calls": len(calls),
       "declared_timeouts": sorted({c[2] for c in calls}), "calls": calls,
       "detail": r.json().get("detail") if r.status_code != 200 else None,
       "live_data_available": (r.json().get("data_assimilation") or {}).get("live_data_available") if r.status_code == 200 else None}
print(json.dumps(out, indent=1))
