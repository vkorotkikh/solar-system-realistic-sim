from exp5 import *
for g, truth in ((1.0, 882), (0.3, 881)):
    A, B = FN["earth"], FN["mercury"]; acc = g_to_aud2(g)
    grid = np.unique(JD_2026 + np.arange(0, NDAYS, NDAYS / 366.0).round())
    est = np.array([est_T(A, B, jd, acc)[0] for jd in grid])
    # local minima of the estimate on the grid
    lm = [i for i in range(1, len(est) - 1) if est[i] < est[i - 1] and est[i] <= est[i + 1]]
    lm.sort(key=lambda i: est[i])
    ranks = [(int(grid[i] - JD_2026), round(est[i], 5)) for i in lm[:8]]
    near = [k for k, i in enumerate(lm) if abs(grid[i] - JD_2026 - truth) <= 12]
    print(f"mercury {g} g: best grid local minima (day, est T): {ranks}; true best day {truth} is local-minimum rank {near[0] + 1 if near else None} of {len(lm)}")
    # solve the best 3 local minima (daily refine +-10 d) and keep the shortest
    cand = []
    for i in lm[:3]:
        days = np.arange(grid[i] - 10, grid[i] + 11)
        e2 = [est_T(A, B, jd, acc)[0] for jd in days]; j = int(np.argmin(e2))
        r = solve_day((("earth", "mercury", g, int(days[j] - JD_2026))))
        cand.append((int(days[j] - JD_2026), r["T"] if not r.get("blocked") else r.get("T_detour")))
    print("   top-3 candidates (day, solved T):", cand, " best:", min(cand, key=lambda x: x[1]))
