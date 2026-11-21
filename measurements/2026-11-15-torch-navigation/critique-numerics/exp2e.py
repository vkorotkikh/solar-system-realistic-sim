from det import *
JD_2026 = 2461041.5
ex = json.load(open("exp2b.json")); em = json.load(open("exp2_em.json"))
pool = [r for r in em if r.get("blocked") and r["ok"]][::6][:30] + [r for r in ex if r["pair"] == "earth-mercury" and r.get("blocked") and r["ok"]][::12][:20] + [r for r in ex if r["pair"] == "earth-jupiter" and r.get("blocked") and r["ok"]][::6][:10]
CF = {"FAST M12": dict(M=12, phi_max=1.0, ptol=1e-11), "M16 phi1.0": dict(M=16, phi_max=1.0, ptol=1e-11), "strict M16 phi.5": dict(M=16, phi_max=0.5, ptol=1e-13)}
T = {k: [] for k in CF}; TB = []
for r in pool:
    a, b = r["pair"].split("-"); A, B = FN[a], FN[b]; g = r["g"]; jd = JD_2026 + r["day"]
    bb = 1e9
    for _ in range(3):
        t = time.perf_counter(); base = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST); bb = min(bb, time.perf_counter() - t)
    TB.append(bb * 1e3); ref = away_ref(base)
    for k, kw in CF.items():
        best = 1e9
        for _ in range(3):
            t = time.perf_counter(); o = solve_detour(A, B, jd, g, 0.1, base, ref, phi0=0.1, **kw); best = min(best, time.perf_counter() - t)
        T[k].append(best * 1e3)
print(f"{len(pool)} blocked trips (Mars 1/0.3 g, Mercury, Jupiter), best of 3, sequential")
print(f"unconstrained 6-unknown solve (with path): median {np.median(TB):.1f} ms p90 {np.percentile(TB,90):.1f} max {max(TB):.1f}")
for k, v in T.items(): v = np.array(v); print(f"7-unknown detour {k:18s}: median {np.median(v):.1f} ms p90 {np.percentile(v,90):.1f} max {v.max():.1f}")
