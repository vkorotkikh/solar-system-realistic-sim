"""Generate /solar/physics-equivalent payloads offline (no network) for frontend cost analysis.

Calls the same _build_solar_physics_state path shape as server.py:389-418 but with
forcing='synthetic'/live_data=False semantics for the realtime part, and monkeypatches
fetch_gong_synoptic_map -> None so PFSS uses its synthetic magnetogram (no GONG request).
"""
import json, sys, time, os
WT = sys.argv[1]
OUT = sys.argv[2]
sys.path.insert(0, os.path.join(WT, "backend"))
import sim.pfss_magnetogram as pm
pm.fetch_gong_synoptic_map = lambda cr, timeout_s=6.0: None
from sim.solar_physics import SolarCoronaPhysicsModel
model = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
jd0 = 2461308.25  # ~2026-09-24
results = []
for label, jd in [("now", jd0), ("now+3.6d", jd0 + 3.6), ("now+0.9s_at_4dps_repeat", jd0 + 3.6)]:
    t = time.perf_counter()
    st = model.sample_state(jd, fidelity="high", max_features=180, forcing="hybrid", realtime_data=None)
    dt = time.perf_counter() - t
    st["forcing"] = "hybrid"; st["live_data_enabled"] = True; st["source"] = "backend"
    s = json.dumps(st)
    feats = st["corona"]["features"]
    pf = st["pfss_field_lines"]
    ps = st["heliosphere"]["parker_spiral"]
    arc_pts = sum(len(f.get("arc") or []) for f in feats)
    pf_pts = sum(len(l.get("arc") or []) for l in pf.get("lines", []))
    ps_pts = sum(len(l.get("arc") or []) for l in (ps.get("lines") or []))
    kinds = {}
    for f in feats:
        kinds[f.get("kind")] = kinds.get(f.get("kind"), 0) + 1
    r = dict(label=label, jd=jd, compute_s=round(dt, 3), json_bytes=len(s), features=len(feats),
             feature_kinds=kinds, feature_arc_points=arc_pts, pfss_lines=len(pf.get("lines", [])),
             pfss_points=pf_pts, pfss_source=pf.get("source"), cr=pf.get("carrington_rotation"),
             parker_lines=len(ps.get("lines") or []), parker_points=ps_pts,
             coronal_holes=len((st.get("coronal_holes") or {}).get("holes") or []),
             top_keys=sorted(st.keys()), feature_keys=sorted(feats[0].keys()) if feats else [],
             pfss_line_keys=sorted(pf["lines"][0].keys()) if pf.get("lines") else [],
             parker_line_keys=sorted(ps["lines"][0].keys()) if ps.get("lines") else [],
             assimilation_keys=sorted(st["data_assimilation"].keys()))
    results.append(r)
    if label == "now":
        with open(os.path.join(OUT, "payload_high_180.json"), "w") as fh:
            fh.write(s)
    if label == "now+3.6d":
        with open(os.path.join(OUT, "payload_high_180_b.json"), "w") as fh:
            fh.write(s)
print(json.dumps(results, indent=1))
