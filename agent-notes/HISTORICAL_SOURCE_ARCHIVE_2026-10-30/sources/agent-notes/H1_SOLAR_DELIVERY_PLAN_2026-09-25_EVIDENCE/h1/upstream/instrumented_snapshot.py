"""One live, instrumented cold snapshot: logs every upstream call with latency/bytes.

Also times SolarCoronaPhysicsModel.sample_state separately (compute share of /solar/physics).
Runs against the READ-ONLY scratch worktree code; writes nothing into the worktree.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

WT = "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/backend"
sys.path.insert(0, WT)
sys.dont_write_bytecode = True

import sim.solar_realtime_data as srd  # noqa: E402
import sim.pfss_magnetogram as pfss  # noqa: E402

log: list[dict] = []
_real_urlopen = urllib.request.urlopen


class _Wrapped:
    def __init__(self, resp, url, t0):
        self._resp, self._url, self._t0 = resp, url, t0
        self.headers = resp.headers

    def read(self, *a):
        data = self._resp.read(*a)
        log.append({
            "utc": datetime.now(timezone.utc).isoformat(),
            "url": self._url,
            "status": getattr(self._resp, "status", None),
            "bytes": len(data),
            "elapsed_s": round(time.perf_counter() - self._t0, 3),
        })
        return data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._resp.close()
        return False


def urlopen_logged(req, timeout=None, *a, **k):
    url = req.full_url if hasattr(req, "full_url") else str(req)
    t0 = time.perf_counter()
    try:
        resp = _real_urlopen(req, timeout=timeout, *a, **k)
    except Exception as exc:
        log.append({
            "utc": datetime.now(timezone.utc).isoformat(),
            "url": url,
            "error": repr(exc)[:200],
            "elapsed_s": round(time.perf_counter() - t0, 3),
        })
        raise
    return _Wrapped(resp, url, t0)


urllib.request.urlopen = urlopen_logged  # both modules call urllib.request.urlopen at call time

provider = srd.SolarRealtimeDataProvider(timeout_s=3.8, cache_ttl_s=120.0)
jd_now = time.time() / 86400.0 + 2440587.5

t0 = time.perf_counter()
snap = provider.latest(jd=jd_now)
t_snapshot = time.perf_counter() - t0

# second call, same jd -> should be a cache hit
t1 = time.perf_counter()
provider.latest(jd=jd_now)
t_hit = time.perf_counter() - t1

# a jd 1e-5 later (what the frontend sends ~1 s later at 1x) -> cache miss? count upstream calls
n_before = len(log)
t2 = time.perf_counter()
provider.latest(jd=jd_now + 4.0 * 0.9)  # default 4 days/s * 0.9 s poll
t_next = time.perf_counter() - t2
n_next = len(log) - n_before

from sim.solar_physics import SolarCoronaPhysicsModel  # noqa: E402

model = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
n_before2 = len(log)
t3 = time.perf_counter()
state = model.sample_state(jd_now, fidelity="high", max_features=180, forcing="hybrid", realtime_data=snap)
t_compute = time.perf_counter() - t3
gong_calls = log[n_before2:]

out = {
    "jd": jd_now,
    "cold_snapshot_s": round(t_snapshot, 3),
    "same_jd_hit_s": round(t_hit, 6),
    "next_poll_jd_plus_3p6d_s": round(t_next, 3),
    "next_poll_upstream_calls": n_next,
    "sample_state_compute_s_incl_gong": round(t_compute, 3),
    "gong_calls_during_compute": gong_calls,
    "pfss_source": (state.get("pfss_field_lines") or {}).get("source"),
    "upstream_log": log,
    "source_status": snap.get("source_status"),
}
print(json.dumps(out, indent=1))
