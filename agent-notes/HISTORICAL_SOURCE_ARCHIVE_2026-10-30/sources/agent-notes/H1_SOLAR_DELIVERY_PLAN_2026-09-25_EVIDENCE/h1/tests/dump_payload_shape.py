"""Dump the key-tree (types, not values) of the /solar/physics payload the frontend requests.
Usage: python dump_payload_shape.py offline|online <out.json>"""
from __future__ import annotations
import json, os, socket, sys
MODE = sys.argv[1]; OUTF = sys.argv[2]
_g = socket.getaddrinfo
def _gai(host, *a, **k):
    if MODE == "offline" and host and not str(host).startswith("127.") and host not in ("localhost", "::1"):
        raise socket.gaierror("blocked")
    return _g(host, *a, **k)
socket.getaddrinfo = _gai
sys.path.insert(0, os.getcwd())
import server
from fastapi.testclient import TestClient
server.SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW = 10_000
c = TestClient(server.app)
import time
t0 = time.perf_counter()
r = c.get("/solar/physics", params={"jd": "2461308.51234567", "fidelity": "high", "max_features": 180, "forcing": "hybrid", "live_data": "true"})
dt = time.perf_counter() - t0
body = r.json()
def shape(v, depth=0):
    if isinstance(v, dict):
        if depth > 5: return "dict"
        return {k: shape(x, depth + 1) for k, x in v.items()}
    if isinstance(v, list):
        return [shape(v[0], depth + 1), f"len={len(v)}"] if v else ["empty"]
    return type(v).__name__
da = body.get("data_assimilation", {})
summary = {
    "mode": MODE, "status": r.status_code, "seconds": round(dt, 3), "bytes": len(r.content),
    "schema": body.get("schema"),
    "data_assimilation": {k: (v if not isinstance(v, (dict, list)) else "<" + type(v).__name__ + ">") for k, v in da.items()},
    "sources_keys": list((da.get("sources") or {}).keys()),
    "sdo_aia_keys": list(((da.get("sources") or {}).get("sdo_aia") or {}).keys()) if isinstance((da.get("sources") or {}).get("sdo_aia"), dict) else (da.get("sources") or {}).get("sdo_aia"),
    "sdo_aia_channels": {k: {kk: vv for kk, vv in (v or {}).items() if kk in ("image_id", "image_date", "tile_url", "error")} for k, v in ((((da.get("sources") or {}).get("sdo_aia") or {}).get("channels") or {}).items())} if isinstance((da.get("sources") or {}).get("sdo_aia"), dict) else None,
    "source_status": (da.get("sources") or {}).get("source_status") or da.get("source_status"),
    "pfss_source": (body.get("pfss_field_lines") or {}).get("source"),
    "shape": shape(body),
}
json.dump(summary, open(OUTF, "w"), indent=1, default=str)
print(json.dumps({k: summary[k] for k in ("mode", "status", "seconds", "bytes", "schema", "data_assimilation", "sources_keys", "sdo_aia_keys", "source_status", "pfss_source")}, indent=1, default=str))
