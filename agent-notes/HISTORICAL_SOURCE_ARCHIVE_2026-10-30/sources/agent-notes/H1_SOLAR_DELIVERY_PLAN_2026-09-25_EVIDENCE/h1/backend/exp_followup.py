"""Follow-ups (offline, GONG patched to None):
 1. GIL contention apples-to-apples (same jds sequential vs concurrent, fresh caches), with loadavg
 2. 0.001 d sensitivity at a jd that does NOT cross an int(jd*100) seed boundary
 3. deep memory size of one PFSS cache entry
 4. FastAPI serialization cost of a full response on the event-loop thread
 5. size of data_assimilation block with the live snapshot
Run from <worktree>/backend: python exp_followup.py <live_snapshot.json> <out.json>
"""
from __future__ import annotations

import json
import math
import os
import sys
import threading
import time
import tracemalloc

sys.path.insert(0, ".")

import sim.pfss_magnetogram as pm
import sim.solar_physics as sp

pm.fetch_gong_synoptic_map = lambda cr, timeout_s=6.0: None
snapshot = json.load(open(sys.argv[1]))
OUT: dict = {}

# 1) GIL contention
JDS = [2461400.25, 2461401.25]


def run(model, jd, store):
    t = time.perf_counter()
    model.sample_state(jd, "high", 180, "synthetic", None)
    store[jd] = time.perf_counter() - t


m1 = sp.SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
seq = {}
la0 = os.getloadavg()
t0 = time.perf_counter()
for j in JDS:
    run(m1, j, seq)
seq_wall = time.perf_counter() - t0
m2 = sp.SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
conc = {}
ths = [threading.Thread(target=run, args=(m2, j, conc)) for j in JDS]
t0 = time.perf_counter()
for t in ths:
    t.start()
for t in ths:
    t.join()
conc_wall = time.perf_counter() - t0
OUT["gil"] = {"loadavg_before": la0, "loadavg_after": os.getloadavg(),
              "sequential_each_s": [round(seq[j], 3) for j in JDS], "sequential_wall_s": round(seq_wall, 3),
              "concurrent_each_s": [round(conc[j], 3) for j in JDS], "concurrent_wall_s": round(conc_wall, 3)}
print("gil", OUT["gil"])

# 2) 0.001 d with no seed-boundary crossing: jd*100 fractional part ~0.25 -> +0.1 stays in bucket
m3 = sp.SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
jd0 = 2461308.5825
a = m3.sample_state(jd0, "high", 180, "synthetic", None)
b = m3.sample_state(jd0 + 0.001, "high", 180, "synthetic", None)
assert int(jd0 * 100) == int((jd0 + 0.001) * 100)
pa = {l["id"]: l for l in a["pfss_field_lines"]["lines"]}
pb = {l["id"]: l for l in b["pfss_field_lines"]["lines"]}
common = set(pa) & set(pb)
fa = {f["id"]: f for f in a["corona"]["features"]}
fb = {f["id"]: f for f in b["corona"]["features"]}
fc = set(fa) & set(fb)
fdisp = sorted(max(math.dist(p, q) for p, q in zip(fa[k]["arc"], fb[k]["arc"])) for k in fc)
OUT["dt_0.001d_same_seed_bucket"] = {
    "pfss_endpoint_disp_max_Rsun": max(math.dist(pa[k]["arc"][-1], pb[k]["arc"][-1]) for k in common),
    "pfss_topology_flips": sum(1 for k in common if pa[k]["is_open"] != pb[k]["is_open"]),
    "feature_id_jaccard": len(fc) / len(set(fa) | set(fb)),
    "feature_disp_median_Rsun": fdisp[len(fdisp) // 2], "feature_disp_max_Rsun": fdisp[-1],
    "coronal_holes_identical": a["coronal_holes"] == b["coronal_holes"],
    "parker_max_disp_Rsun": max(max(math.dist(p, q) for p, q in zip(x["arc"], y["arc"]))
                                for x, y in zip(a["heliosphere"]["parker_spiral"]["lines"], b["heliosphere"]["parker_spiral"]["lines"])),
}
print("0.001d same bucket", OUT["dt_0.001d_same_seed_bucket"])

# 3) deep memory of one PFSS cache entry
tracemalloc.start()
snap0 = tracemalloc.take_snapshot()
m4 = sp.SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
base_mem = tracemalloc.get_traced_memory()[0]
m4._pfss_cache.get_or_compute(jd=2461500.3, activity=0.5, n_lines=120, lmax=15, gong_timeout_s=3.5)
entry_mem = tracemalloc.get_traced_memory()[0] - base_mem
tracemalloc.stop()
OUT["pfss_entry_traced_bytes"] = entry_mem
print("pfss entry traced bytes", entry_mem)

# 4) FastAPI serialization cost (what runs on the event loop after the worker returns)
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

state = m3.sample_state(jd0 + 3.0, "high", 180, "hybrid", snapshot)
t = time.perf_counter(); enc = jsonable_encoder(state); t_enc = time.perf_counter() - t
t = time.perf_counter(); body = JSONResponse(enc).body; t_render = time.perf_counter() - t
OUT["serialization"] = {"jsonable_encoder_s": round(t_enc, 4), "json_render_s": round(t_render, 4),
                        "body_bytes": len(body)}
import gzip
OUT["serialization"]["gzip6_bytes"] = len(gzip.compress(body, 6))
rounded = json.dumps(json.loads(body), separators=(",", ":"), default=None)
print("serialization", OUT["serialization"])

# 5) data_assimilation size with live snapshot
OUT["hybrid_live_sizes"] = {k: len(json.dumps(v)) for k, v in state.items()}
OUT["hybrid_live_assimilation_keys"] = list(state["data_assimilation"].keys())
OUT["hybrid_live_source_status"] = state["data_assimilation"]["source_status"]
OUT["hybrid_live_coronal_holes_source"] = state["coronal_holes"]["source"]
OUT["hybrid_live_pfss_source"] = state["pfss_field_lines"]["source"]
OUT["hybrid_live_parker_model"] = state["heliosphere"]["parker_spiral"]["wind_speed_model"]
print("sizes", OUT["hybrid_live_sizes"])
json.dump(OUT, open(sys.argv[2], "w"), indent=1, default=str)
