"""Task 1: how often does the straight free-space course pass close to the Sun?
Daily departures 2026-01-01 .. 2036-01-01 inclusive (3,653 days), 1 g and 0.3 g, six pairs."""
import json, time
import numpy as np
from course_reference import *

PAIRS = [("earth","mars"),("earth","venus"),("earth","mercury"),("earth","jupiter"),("earth","saturn"),("mars","ceres")]
RADII = [0.05, 0.1, 0.2, 0.3]
NDAYS = int(round(JD_2026_01_01 + 3652 - JD_2026_01_01)) + 1   # 2036-01-01 is 3652 days after 2026-01-01
NDAYS = 3653
out = {"days": NDAYS, "first_jd": JD_2026_01_01, "rows": []}
runs_store = {}
t0 = time.time()
for a_id, b_id in PAIRS:
    for a_g in (1.0, 0.3):
        a = g_to_au_day2(a_g)
        dmin = np.empty(NDAYS); smin = np.empty(NDAYS); T = np.empty(NDAYS); L = np.empty(NDAYS)
        P0 = np.empty((NDAYS, 3)); P1 = np.empty((NDAYS, 3)); iters = 0
        for k in range(NDAYS):
            p0, p1, Tk, it = free_space_course(a_id, b_id, JD_2026_01_01 + k, a_g)
            iters = max(iters, it)
            P0[k], P1[k], T[k] = p0, p1, Tk
            dmin[k], smin[k] = segment_sun_distance(p0, p1)
            L[k] = np.linalg.norm(p1 - p0)
        for R in RADII:
            blocked = dmin < R
            # longest consecutive run
            best = cur = 0; runs = []; start = None
            for k, bflag in enumerate(blocked):
                if bflag:
                    cur += 1
                    if start is None: start = k
                    best = max(best, cur)
                elif start is not None:
                    runs.append((start, k - 1)); start = None; cur = 0
            if start is not None: runs.append((start, NDAYS - 1))
            extra = []
            extra_t = []
            for k in np.nonzero(blocked)[0]:
                Ld = detour_length(P0[k], P1[k], R)
                if np.isfinite(Ld):
                    extra.append(Ld - L[k]); extra_t.append((np.sqrt(Ld / L[k]) - 1.0))
            extra = np.array(extra); extra_t = np.array(extra_t)
            row = dict(pair=f"{a_id}-{b_id}", a_g=a_g, R=R, blocked_days=int(blocked.sum()),
                       fraction=float(blocked.mean()), longest_run_days=int(best), n_runs=len(runs),
                       runs=[(int(s), int(e)) for s, e in runs],
                       extra_au_mean=float(extra.mean()) if len(extra) else None,
                       extra_au_max=float(extra.max()) if len(extra) else None,
                       extra_pct_of_chord_mean=float(np.mean(extra / L[blocked][:len(extra)]) * 100) if len(extra) else None,
                       extra_time_pct_mean=float(extra_t.mean() * 100) if len(extra_t) else None,
                       extra_time_pct_max=float(extra_t.max() * 100) if len(extra_t) else None,
                       trip_days_median=float(np.median(T)), chord_au_median=float(np.median(L)),
                       max_fixed_point_iters=iters,
                       endpoint_inside=int(((np.linalg.norm(P0, axis=1) <= R) | (np.linalg.norm(P1, axis=1) <= R)).sum()))
            out["rows"].append(row)
        runs_store[f"{a_id}-{b_id}-{a_g}"] = dict(dmin=dmin.tolist(), T=T.tolist(), L=L.tolist())
out["seconds"] = time.time() - t0
json.dump(out, open("exp1_blocked.json", "w"), indent=1)
json.dump(runs_store, open("exp1_daily.json", "w"))
print("seconds", out["seconds"])
for r in out["rows"]:
    print(f"{r['pair']:14s} {r['a_g']:>3} g R={r['R']:<4} frac={r['fraction']*100:6.2f}% days={r['blocked_days']:4d} longest={r['longest_run_days']:3d} runs={r['n_runs']:2d} "
          f"extra_au mean={r['extra_au_mean'] if r['extra_au_mean'] is None else round(r['extra_au_mean'],4)} max={r['extra_au_max'] if r['extra_au_max'] is None else round(r['extra_au_max'],4)} "
          f"extra_t%mean={r['extra_time_pct_mean'] if r['extra_time_pct_mean'] is None else round(r['extra_time_pct_mean'],2)} T_med={r['trip_days_median']:.2f}d iters<={r['max_fixed_point_iters']} endinside={r['endpoint_inside']}")
