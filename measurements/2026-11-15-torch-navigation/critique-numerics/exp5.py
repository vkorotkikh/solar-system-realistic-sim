"""Task 5: date ranking by the closed-form free-space estimate vs solving every day."""
from multiprocessing import Pool
from det import *
JD_2026 = 2461041.5
NDAYS = 3652
def est_T(A, B, jd, acc):
    r = free_space_T(A, B, jd, acc)
    return r["T"], r["ok"]
def rank(a, b, g):
    A, B = FN[a], FN[b]; acc = g_to_aud2(g)
    grid = JD_2026 + np.arange(0, NDAYS, NDAYS / 366.0).round()        # at most 366 points
    grid = np.unique(grid)
    est = np.array([est_T(A, B, jd, acc)[0] for jd in grid])
    i = int(est.argmin()); step = float(np.median(np.diff(grid)))
    lo, hi = grid[i] - step, grid[i] + step
    daily = np.arange(max(lo, JD_2026), min(hi, JD_2026 + NDAYS - 1) + 1)
    est2 = np.array([est_T(A, B, jd, acc)[0] for jd in daily])
    j = int(est2.argmin())
    return float(daily[j]), float(est2[j]), len(grid), len(daily)

def solve_day(args):
    a, b, g, day = args
    A, B = FN[a], FN[b]; jd = JD_2026 + day; acc = g_to_aud2(g)
    Ts = []
    starts = [better_guess(A, B, jd, acc)]
    if g <= 0.3:
        rs = rescue_guesses(A, B, jd, acc); starts += [naive_guess(A, B, jd, acc), rs[6], rs[7]]
    best = None
    for gs in starts:
        try:
            o = solve_trip(A, B, jd, g, guess=gs, want_path=True, jacobian="fd", **FAST)
        except Exception:
            continue
        if o["ok"] and (best is None or o["T"] < best["T"]): best = o
    if best is None: return dict(day=day, ok=False)
    out = dict(day=day, ok=True, T=best["T"], rmin=best["rmin_sun"], blocked=bool(best["rmin_sun"] < 0.1))
    if out["blocked"]:
        try:
            d = solve_detour(A, B, jd, g, 0.1, best, away_ref(best), phi0=0.1, M=16, phi_max=1.0, ptol=1e-11)
            out["T_detour"] = d["T"] if d["ok"] else None
        except Exception:
            out["T_detour"] = None
    return out

if __name__ == "__main__":
    rows = []
    with Pool(8) as p:
        for pair in (("earth", "mars"), ("earth", "jupiter"), ("earth", "mercury")):
            for g in (1.0, 0.3):
                a, b = pair
                tt = []
                for _ in range(3):
                    t = time.perf_counter(); chosen, Te, ng, nd = rank(a, b, g); tt.append(time.perf_counter() - t)
                res = p.map(solve_day, [(a, b, g, d) for d in range(NDAYS)], chunksize=16)
                R = {r["day"]: r for r in res if r["ok"]}
                def Teff(d):
                    r = R[d]; return r["T_detour"] if r.get("blocked") and r.get("T_detour") else (None if r.get("blocked") else r["T"])
                valid = {d: Teff(d) for d in R if Teff(d) is not None}
                dbest = min(valid, key=valid.get)
                every10 = {d: v for d, v in valid.items() if d % 10 == 0}
                d10 = min(every10, key=every10.get)
                cday = int(chosen - JD_2026)
                Tc = valid.get(cday)
                rows.append(dict(pair=f"{a}-{b}", g=g, rank_ms=min(tt) * 1e3, n_grid=ng, n_daily=nd, est_chosen_day=cday, est_T=Te,
                                 solved_T_chosen=Tc, best_day_all=dbest, best_T_all=valid[dbest], best_day_every10=d10, best_T_every10=every10[d10],
                                 unsolved_days=NDAYS - len(R), blocked_days=sum(1 for r in R.values() if r.get("blocked")),
                                 detour_fail=sum(1 for r in R.values() if r.get("blocked") and not r.get("T_detour"))))
                r = rows[-1]
                print(json.dumps(r), flush=True)
    json.dump(rows, open("exp5.json", "w"))
