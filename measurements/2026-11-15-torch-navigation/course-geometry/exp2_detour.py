"""Task 2: keep-out detours for earth->mars across the five conjunctions of 2026-2036.
usage: python -B exp2_detour.py   (about 5-10 minutes on a busy machine, 6 worker processes)"""
import json, time, sys
import numpy as np
from multiprocessing import Pool
from course_reference import *
from course_reference import _rhs

R0 = 0.1
RUNS = {1.0: [(0, 39), (792, 843), (1589, 1632), (2369, 2405), (3140, 3173)],
        0.3: [(0, 45), (798, 849), (1594, 1636), (2373, 2409), (3143, 3176)]}
MARGIN = 15
DV = lambda a_g, dT_days: a_g * G0 * dT_days * DAY_S / 1000.0  # km/s, thrust always on => a * dT


def verify(prob, x):
    """Independent check of a solved trip: dense-output sampling (not the event finder) of min |r|, and the
    end-state residual in km and m/s."""
    segs = bias_segments(x, None, prob.lateral_ref) if len(x) == 7 else None
    if segs is None:
        lon1, lat1, lon2, lat2, f, T = x
        segs = [(unit_from_angles(lon1, lat1), f * T), (unit_from_angles(lon2, lat2), (1 - f) * T)]
    y = prob.y0.copy(); rmin = 1e9
    for u, dur in segs:
        sol = solve_ivp(_rhs, (0, dur), y, method="DOP853", rtol=1e-12, atol=1e-14, dense_output=True,
                        args=(float(u[0]), float(u[1]), float(u[2]), prob.a))
        tt = np.linspace(0, dur, 4001)
        rmin = min(rmin, float(np.linalg.norm(sol.sol(tt)[:3], axis=0).min()))
        y = sol.y[:, -1]
    T = x[5]
    rb, vb = body_state(prob.b_id, prob.jd0 + T)
    return dict(min_dense_au=rmin, end_pos_km=float(np.linalg.norm(y[:3] - rb) * AU_KM),
                end_vel_ms=float(np.linalg.norm(y[3:] - vb) * AU_M / DAY_S))


def one_day(args):
    k, a_g, do_opt = args
    jd0 = JD_2026_01_01 + k
    p0, p1, Tfree, _ = free_space_course("earth", "mars", jd0, a_g)
    dfree, _ = segment_sun_distance(p0, p1)
    row = dict(day=k, a_g=a_g, free_dmin=dfree, free_T=Tfree)
    t = time.perf_counter()
    base = solve_torch_trip("earth", "mars", jd0, a_g)
    row.update(base_ok=base["converged"], base_it=base["iterations"], base_T=base["T_days"],
               base_rmin=base["min_sun_au"], base_ms=(time.perf_counter() - t) * 1e3)
    if not base["converged"] or base["min_sun_au"] >= R0:
        return row
    row["blocked_dyn"] = True
    modes = {}
    for name, kw in (("z_scratch", dict(lateral="z")),
                     ("z_lm", dict(lateral="z", method="lm")),
                     ("away_scratch", dict(lateral="away")),
                     ("away_dyn", dict(lateral="away_dynamic"))):
        t = time.perf_counter()
        r = solve_torch_trip("earth", "mars", jd0, a_g, keepout_au=R0, **kw)
        m = dict(ok=r["converged"], it=r["iterations"], nfev=r["nfev"], ms=(time.perf_counter() - t) * 1e3,
                 dT_h=(r["T_days"] - base["T_days"]) * 24, dT_pct=(r["T_days"] / base["T_days"] - 1) * 100,
                 ddv_kms=DV(a_g, r["T_days"] - base["T_days"]), phi_deg=float(np.degrees(r["x"][6])),
                 rmin=r["min_sun_au"], res=r["residual"])
        if name in ("z_scratch", "away_dyn") and r["converged"]:
            m["verify"] = verify(r["problem"], r["x"])
        modes[name] = m
    row["modes"] = modes
    if do_opt:
        t = time.perf_counter()
        o = optimal_detour("earth", "mars", jd0, a_g, R0, K=8, x_start=base["x"])
        row["opt8"] = dict(ok=o["converged"], dT_h=(o["T_days"] - base["T_days"]) * 24,
                           ddv_kms=DV(a_g, o["T_days"] - base["T_days"]), s=time.perf_counter() - t, nit=o["nit"])
    return row


def radius_case(args):
    a_g, k, R = args
    jd0 = JD_2026_01_01 + k
    base = solve_torch_trip("earth", "mars", jd0, a_g)
    out = dict(a_g=a_g, R=R, base_rmin=base["min_sun_au"], base_T=base["T_days"])
    for name, kw in (("z_scratch", dict(lateral="z")), ("away_dyn", dict(lateral="away_dynamic"))):
        r = solve_torch_trip("earth", "mars", jd0, a_g, keepout_au=R, **kw)
        out[name] = dict(ok=r["converged"], it=r["iterations"], dT_h=(r["T_days"] - base["T_days"]) * 24,
                         ddv_kms=DV(a_g, r["T_days"] - base["T_days"]), phi_deg=float(np.degrees(r["x"][6])), rmin=r["min_sun_au"])
    # continuation in R from the 6-unknown trip: R_j = rmin + j/4 (R - rmin), each solve starts from the last
    try:
        prob_x = np.concatenate([base["x"], [0.0]]); okc = True; its = 0
        for j in range(1, 5):
            Rj = base["min_sun_au"] + j / 4 * (R - base["min_sun_au"])
            r = solve_torch_trip("earth", "mars", jd0, a_g, keepout_au=Rj, x0=prob_x + np.array([0] * 6 + [0.02]) if j == 1 else prob_x, lateral="z")
            its += r["iterations"]; okc &= r["converged"]; prob_x = r["x"]
        out["z_continuation"] = dict(ok=bool(okc), it=its, dT_h=(r["T_days"] - base["T_days"]) * 24, phi_deg=float(np.degrees(r["x"][6])))
    except Exception as e:
        out["z_continuation"] = dict(ok=False, err=str(e))
    return out


def perturbed(args):
    a_g, k, seed, mode = args
    rng = np.random.default_rng(seed)
    jd0 = JD_2026_01_01 + k
    base = solve_torch_trip("earth", "mars", jd0, a_g)
    x6 = base["problem"].simple_guess()
    x6 = x6 + np.array([*rng.uniform(-np.radians(10), np.radians(10), 4), rng.uniform(-0.1, 0.1), 0.0])
    x6[5] *= rng.uniform(0.9, 1.1)
    x0 = np.concatenate([x6, [rng.uniform(0.02, 0.8)]])
    r = solve_torch_trip("earth", "mars", jd0, a_g, keepout_au=R0, x0=x0, lateral="z", method=mode)
    same = abs(r["T_days"] - (base["T_days"] + 0)) / base["T_days"] < 0.05 and 0 < r["x"][6] < 0.8
    return dict(ok=r["converged"], sane=bool(r["converged"] and same), it=r["iterations"], phi_deg=float(np.degrees(r["x"][6])),
                dT_h=(r["T_days"] - base["T_days"]) * 24)


if __name__ == "__main__":
    t0 = time.time()
    tasks = []
    for a_g, runs in RUNS.items():
        for (s, e) in runs:
            for k in range(max(0, s - MARGIN), min(3652, e + MARGIN) + 1):
                tasks.append((k, a_g, (k - s) % 3 == 0 and s <= k <= e))
    print("day tasks", len(tasks), flush=True)
    with Pool(6) as pool:
        rows = pool.map(one_day, tasks, chunksize=4)
        json.dump(rows, open("exp2_days.json", "w"))
        print("days done", time.time() - t0, flush=True)
        rad = pool.map(radius_case, [(g, k, R) for g in (1.0, 0.3) for k in (818, 1611) for R in (0.05, 0.1, 0.2, 0.3)])
        json.dump(rad, open("exp2_radius.json", "w"), indent=1)
        print("radius done", time.time() - t0, flush=True)
        per = {}
        for g in (1.0, 0.3):
            for mode in ("newton", "lm"):
                per[f"{g}-{mode}"] = pool.map(perturbed, [(g, 818, s, mode) for s in range(60)])
        json.dump(per, open("exp2_perturbed.json", "w"))
    print("done", time.time() - t0)
