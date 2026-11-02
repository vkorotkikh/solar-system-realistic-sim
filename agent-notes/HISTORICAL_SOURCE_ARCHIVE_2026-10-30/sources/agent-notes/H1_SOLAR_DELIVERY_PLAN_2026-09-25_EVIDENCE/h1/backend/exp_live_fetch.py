"""ONE live realtime snapshot + ONE live GONG fetch, with per-request timing.

Outbound: SWPC x2, SILSO x1, Helioviewer getClosestImage x5 + getTile x5, GONG listing x1 + FITS x1.
Saves the snapshot (minus binaries) for offline reuse. Run from <worktree>/backend.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request

sys.path.insert(0, ".")

import sim.pfss_magnetogram as pm
from sim.solar_physics import utc_now_to_julian_date
from sim.solar_realtime_data import SolarRealtimeDataProvider

LOG = []

prov = SolarRealtimeDataProvider(timeout_s=3.8, cache_ttl_s=120.0)
for meth in ("_fetch_json", "_fetch_text", "_fetch_binary"):
    orig = getattr(prov, meth)

    def make(orig=orig, meth=meth):
        def w(url):
            t0 = time.perf_counter()
            err = None
            out = None
            try:
                out = orig(url)
                return out
            except Exception as exc:  # noqa
                err = f"{type(exc).__name__}: {exc}"
                raise
            finally:
                size = None
                if isinstance(out, str):
                    size = len(out)
                elif isinstance(out, tuple):
                    size = len(out[0])
                elif out is not None:
                    size = len(json.dumps(out))
                LOG.append({"meth": meth, "url": url[:110], "s": round(time.perf_counter() - t0, 3), "bytes": size, "err": err})
        return w
    setattr(prov, meth, make())

orig_urlopen = urllib.request.urlopen


def timed_urlopen(req, *a, **k):
    url = req.full_url if hasattr(req, "full_url") else str(req)
    t0 = time.perf_counter()
    try:
        resp = orig_urlopen(req, *a, **k)
        LOG.append({"meth": "urlopen", "url": url[:110], "s_open": round(time.perf_counter() - t0, 3)})
        return resp
    except Exception as exc:
        LOG.append({"meth": "urlopen", "url": url[:110], "s_open": round(time.perf_counter() - t0, 3), "err": f"{type(exc).__name__}: {exc}"})
        raise


urllib.request.urlopen = timed_urlopen

jd = utc_now_to_julian_date()
t0 = time.perf_counter()
snap = prov.latest(jd=jd)
snap_s = time.perf_counter() - t0

cr = pm.carrington_rotation_number(jd)
t1 = time.perf_counter()
gong = pm.fetch_gong_synoptic_map(cr, timeout_s=3.5)
gong_s = time.perf_counter() - t1

out = {
    "jd": jd,
    "snapshot_total_s": round(snap_s, 3),
    "gong_cr": cr,
    "gong_total_s": round(gong_s, 3),
    "gong_shape": None if gong is None else list(gong.shape),
    "gong_stats": None if gong is None else {
        "min": float(gong.min()), "max": float(gong.max()), "mean": float(gong.mean()),
        "row0_mean": float(gong[0].mean()), "rowN_mean": float(gong[-1].mean()),
        "nan_count": int((gong != gong).sum()),
    },
    "requests": LOG,
    "source_status": snap.get("source_status"),
    "combined_activity_proxy": snap.get("combined_activity_proxy"),
    "swpc": snap.get("swpc"),
    "silso": snap.get("silso"),
    "sdo_aia_summary": None if not isinstance(snap.get("sdo_aia"), dict) else {
        k: snap["sdo_aia"].get(k) for k in ("request_date_utc", "latest_image_date_utc", "freshness_s",
                                            "activity_proxy", "channel_activity_proxy", "visualization")
    },
    "coronal_holes_source": (snap.get("sdo_aia") or {}).get("coronal_holes", {}) and snap["sdo_aia"]["coronal_holes"].get("source"),
    "coronal_hole_count": ((snap.get("sdo_aia") or {}).get("coronal_holes") or {}).get("hole_count"),
}
print(json.dumps(out, indent=1, default=str))
with open(sys.argv[1], "w") as fh:
    json.dump(out, fh, indent=1, default=str)
with open(sys.argv[2], "w") as fh:
    json.dump(snap, fh, indent=1, default=str)
if gong is not None:
    import numpy as np
    np.save(sys.argv[3], gong)
