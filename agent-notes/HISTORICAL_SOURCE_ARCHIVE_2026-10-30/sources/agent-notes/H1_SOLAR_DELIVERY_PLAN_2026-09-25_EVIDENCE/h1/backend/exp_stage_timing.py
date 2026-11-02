"""Offline stage timing of SolarCoronaPhysicsModel.sample_state (no network).

GONG fetch is patched to return None (synthetic magnetogram path), realtime_data
is either None or a canned snapshot. Wraps each stage function with a timer.
Run from <worktree>/backend.
"""
from __future__ import annotations

import json
import sys
import threading
import time
from collections import defaultdict

sys.path.insert(0, ".")

import sim.pfss_magnetogram as pm
import sim.solar_physics as sp

TIMES: dict[str, list[float]] = defaultdict(list)
_tls = threading.local()


def timed(name, fn):
    def wrapper(*a, **k):
        t0 = time.perf_counter()
        try:
            return fn(*a, **k)
        finally:
            TIMES[name].append(time.perf_counter() - t0)
    return wrapper


GONG_CALLS = []


def fake_gong(cr, timeout_s=6.0):
    GONG_CALLS.append((cr, timeout_s))
    return None


pm.fetch_gong_synoptic_map = fake_gong
for name in ("synthetic_magnetogram", "decompose_spherical_harmonics", "trace_field_lines",
             "compute_wsa_velocity_map", "wsa_velocity_at_source_surface"):
    setattr(pm, name, timed(name, getattr(pm, name)))

M = sp.SolarCoronaPhysicsModel
for name in ("_apply_realtime_forcing", "_build_feature_arc", "_synthetic_coronal_holes",
             "_build_parker_spiral", "_feature_score", "_feature_temporal_state"):
    orig = getattr(M, name)
    if isinstance(M.__dict__[name], staticmethod):
        setattr(M, name, staticmethod(timed(name, orig)))
    else:
        setattr(M, name, timed(name, orig))
M._pfss_get = None

model = sp.SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
model._pfss_cache.get_or_compute = timed("pfss_cache.get_or_compute", model._pfss_cache.get_or_compute)
print("seeds", len(model.seeds), "active_regions", len(model.active_regions))

JD = 2461308.0  # ~2026-09-24 12:00 UTC
results = {}
for max_features in (180, 220):
    for rep in range(2):
        TIMES.clear()
        jd = JD + 0.123456 * (max_features + rep)  # unique jd -> PFSS cache miss
        t0 = time.perf_counter()
        state = model.sample_state(jd, fidelity="high", max_features=max_features,
                                   forcing="hybrid", realtime_data=None)
        total = time.perf_counter() - t0
        body = json.dumps(state)
        sizes = {k: len(json.dumps(v)) for k, v in state.items()}
        row = {
            "jd": jd,
            "total_s": round(total, 3),
            "json_bytes": len(body),
            "top_level_sizes": sizes,
            "feature_count": state["corona"]["feature_count"],
            "pfss_line_count": state["pfss_field_lines"]["line_count"],
            "pfss_open": state["pfss_field_lines"]["open_line_count"],
            "pfss_source": state["pfss_field_lines"]["source"],
            "stage_s": {k: [round(sum(v), 4), len(v)] for k, v in TIMES.items()},
        }
        results[f"mf{max_features}_rep{rep}"] = row
        print(json.dumps(row, indent=1))

# Same jd repeat (synthetic forcing, no realtime data) -> PFSS cache hit expected
TIMES.clear()
jd = JD + 5.0
t0 = time.perf_counter(); s1 = model.sample_state(jd, "high", 180, "synthetic", None); a = time.perf_counter() - t0
t0 = time.perf_counter(); s2 = model.sample_state(jd, "high", 180, "synthetic", None); b = time.perf_counter() - t0
print("synthetic same-jd first/second s:", round(a, 3), round(b, 3), "identical:", json.dumps(s1) == json.dumps(s2))
results["synthetic_same_jd"] = {"first_s": a, "second_s": b, "identical_json": json.dumps(s1) == json.dumps(s2)}
print("GONG calls (patched):", len(GONG_CALLS), GONG_CALLS[:3])
with open(sys.argv[1] if len(sys.argv) > 1 else "/dev/null", "w") as fh:
    json.dump(results, fh, indent=1)
