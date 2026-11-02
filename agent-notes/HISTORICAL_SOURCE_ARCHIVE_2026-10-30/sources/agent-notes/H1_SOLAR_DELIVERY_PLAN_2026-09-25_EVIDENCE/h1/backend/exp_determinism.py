"""Determinism, jd-sensitivity, cache-defeat and GIL-contention probes (offline; GONG patched to None).

Uses the canned live snapshot saved by exp_live_fetch.py as realtime_data.
Run from <worktree>/backend:  python exp_determinism.py <live_snapshot.json> <out.json>
"""
from __future__ import annotations

import json
import math
import sys
import threading
import time

sys.path.insert(0, ".")

import sim.pfss_magnetogram as pm
import sim.solar_physics as sp

pm.fetch_gong_synoptic_map = lambda cr, timeout_s=6.0: None
COMPUTES = []
_orig_compute = pm.PFSSCache._compute


def counting_compute(self, cr, activity, jd, n_lines, lmax, t):
    COMPUTES.append((jd, activity))
    return _orig_compute(self, cr, activity, jd, n_lines, lmax, t)


pm.PFSSCache._compute = counting_compute

snapshot = json.load(open(sys.argv[1]))
OUT: dict = {}
model = sp.SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
JD = 2461308.589838526

# 1) hybrid + identical realtime_data + identical jd, 1.5 s apart
n0 = len(COMPUTES)
s1 = model.sample_state(JD, "high", 180, "hybrid", snapshot)
time.sleep(1.5)
s2 = model.sample_state(JD, "high", 180, "hybrid", snapshot)
OUT["hybrid_same_inputs"] = {
    "activity_1": s1["activity_index"], "activity_2": s2["activity_index"],
    "observed_confidence_1": s1["data_assimilation"]["observed_confidence"],
    "observed_confidence_2": s2["data_assimilation"]["observed_confidence"],
    "blend_weight_1": s1["data_assimilation"]["blend_weight"],
    "blend_weight_2": s2["data_assimilation"]["blend_weight"],
    "pfss_computes_for_2_calls": len(COMPUTES) - n0,
    "json_identical": json.dumps(s1) == json.dumps(s2),
}
print("hybrid_same_inputs", json.dumps(OUT["hybrid_same_inputs"], indent=1))


def feat_map(s):
    return {f["id"]: f for f in s["corona"]["features"]}


def max_arc_disp(a, b):
    m = 0.0
    for p, q in zip(a, b):
        m = max(m, math.dist(p, q))
    return m


def compare(base, other):
    fa, fb = feat_map(base), feat_map(other)
    common = set(fa) & set(fb)
    union = set(fa) | set(fb)
    disp = [max_arc_disp(fa[k]["arc"], fb[k]["arc"]) for k in common]
    pa = {l["id"]: l for l in base["pfss_field_lines"]["lines"]}
    pb = {l["id"]: l for l in other["pfss_field_lines"]["lines"]}
    pcommon = set(pa) & set(pb)
    pdisp = [math.dist(pa[k]["arc"][-1], pb[k]["arc"][-1]) for k in pcommon]
    topo_flips = sum(1 for k in pcommon if pa[k]["is_open"] != pb[k]["is_open"])
    sa = base["heliosphere"]["parker_spiral"]["lines"]
    sb = other["heliosphere"]["parker_spiral"]["lines"]
    sdisp = max(max_arc_disp(x["arc"], y["arc"]) for x, y in zip(sa, sb))
    return {
        "activity_delta": other["activity_index"] - base["activity_index"],
        "feature_count": [base["corona"]["feature_count"], other["corona"]["feature_count"]],
        "feature_id_jaccard": round(len(common) / max(1, len(union)), 4),
        "feature_arc_max_disp_Rsun_median": round(sorted(disp)[len(disp) // 2], 6) if disp else None,
        "feature_arc_max_disp_Rsun_max": round(max(disp), 6) if disp else None,
        "coronal_holes_identical": base["coronal_holes"] == other["coronal_holes"],
        "pfss_lines_endpoint_disp_Rsun_max": round(max(pdisp), 6) if pdisp else None,
        "pfss_topology_flips": topo_flips,
        "pfss_open_counts": [base["pfss_field_lines"]["open_line_count"], other["pfss_field_lines"]["open_line_count"]],
        "parker_spiral_max_disp_Rsun": round(sdisp, 4),
        "parker_mean_wind": [base["heliosphere"]["parker_spiral"]["wind_speed_kms"], other["heliosphere"]["parker_spiral"]["wind_speed_kms"]],
    }


# 2) jd sensitivity under synthetic forcing (no wall-clock inputs)
base = model.sample_state(JD, "high", 180, "synthetic", None)
OUT["jd_sensitivity_synthetic"] = {}
for dj, label in ((1e-8, "1e-8 d (0.86 ms, toFixed(8) step)"), (1e-3, "0.001 d (86 s)"),
                  (0.01, "0.01 d (14.4 min)"), (0.1, "0.1 d (2.4 h)"), (1.0, "1 d"), (27.2753, "1 Carrington rotation")):
    n0 = len(COMPUTES)
    t0 = time.perf_counter()
    other = model.sample_state(JD + dj, "high", 180, "synthetic", None)
    dt = time.perf_counter() - t0
    row = compare(base, other)
    row["pfss_recomputed"] = len(COMPUTES) - n0
    row["wall_s"] = round(dt, 3)
    OUT["jd_sensitivity_synthetic"][label] = row
    print(label, json.dumps(row))

# 3) GIL contention: 1 compute alone vs 2 concurrent (distinct jd -> no single-flight dedupe)
t0 = time.perf_counter()
model.sample_state(JD + 100.0, "high", 180, "synthetic", None)
alone = time.perf_counter() - t0
times = {}


def worker(j):
    t = time.perf_counter()
    model.sample_state(j, "high", 180, "synthetic", None)
    times[j] = time.perf_counter() - t


th = [threading.Thread(target=worker, args=(JD + 200.0 + i,)) for i in range(2)]
t0 = time.perf_counter()
for t in th:
    t.start()
for t in th:
    t.join()
both = time.perf_counter() - t0
OUT["gil_contention"] = {"one_alone_s": round(alone, 3), "two_concurrent_each_s": [round(v, 3) for v in times.values()],
                         "two_concurrent_wall_s": round(both, 3)}
print("gil", OUT["gil_contention"])

# 4) memory footprint of one cached PFSS entry (lines + WSA numpy arrays)
entry = next(iter(model._pfss_cache._cache.values()))
wsa = entry["_wsa_result"]
np_bytes = sum(v.nbytes for v in wsa.values() if hasattr(v, "nbytes"))
lines_json = len(json.dumps(entry["lines"]))
OUT["pfss_cache_entry"] = {"wsa_numpy_bytes": np_bytes, "lines_json_bytes": lines_json,
                           "cache_len": len(model._pfss_cache._cache), "cache_max": model._pfss_cache._max_entries}
print("pfss entry", OUT["pfss_cache_entry"])
json.dump(OUT, open(sys.argv[2], "w"), indent=1)
