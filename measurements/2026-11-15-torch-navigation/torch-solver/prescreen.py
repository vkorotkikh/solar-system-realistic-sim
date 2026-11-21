"""Item 9: free-space pre-screen vs solved T.  E0 = displacement-only iteration T=2 sqrt(|rB(t0+T)-rA-vA T|/a);
E1 = exact free-space two-burn (velocity mismatch included); E2 = E1 + uniform Sun pull at the chord midpoint."""
import json, numpy as np
from scipy.stats import spearmanr
from lab import *
R = [r for r in json.load(open("grid_results.json"))["results"] if r["ok"] and r.get("E0")]
print("n", len(R))
print("\nrelative error (E - T)/T in %, per acceleration: p5 / median / p95 / max|.|   [E0 | E1 | E2]")
for g in ACCS:
    rr = [r for r in R if r["a_g"] == g]
    row = []
    for k in ("E0", "E1", "E2"):
        x = np.array([(r[k] / r["T"] - 1) * 100 for r in rr if r.get(k)])
        row.append(f"{np.percentile(x,5):+7.3f} {np.median(x):+7.3f} {np.percentile(x,95):+7.3f} {np.abs(x).max():7.3f}")
    print(f"{g:5} | " + " | ".join(row))
print("\nfraction of cases with |err| < 1% / < 0.1%  [E0 | E1 | E2]")
for g in ACCS:
    rr = [r for r in R if r["a_g"] == g]
    row = []
    for k in ("E0", "E1", "E2"):
        x = np.array([abs(r[k] / r["T"] - 1) for r in rr if r.get(k)])
        row.append(f"{np.mean(x<0.01)*100:5.1f}% {np.mean(x<0.001)*100:5.1f}%")
    print(f"{g:5} | " + " | ".join(row))
print("\nE1/E2 solver ok flags: E1 fallbacks", sum(1 for r in R if not r.get("E1ok")), " E2 fallbacks", sum(1 for r in R if not r.get("E2ok")))
# worst cases for E2
w = sorted(R, key=lambda r: -abs(r["E2"] / r["T"] - 1))[:8]
print("worst E2 cases:", [(r["pair"], r["a_g"], round(r["jd"], 1), round((r["E2"] / r["T"] - 1) * 100, 1), round(r["rmin_sun"], 3)) for r in w])
# ranking quality over the 24 dates per pair/a
print("\nranking dates by estimate: per (pair, a) group of 24 dates")
for k in ("E0", "E1", "E2"):
    rho, top1, top3, reg1, reg3, n = [], 0, 0, [], [], 0
    for pr in sorted(set(r["pair"] for r in R)):
        for g in ACCS:
            grp = [r for r in R if r["pair"] == pr and r["a_g"] == g and r.get(k)]
            if len(grp) < 10:
                continue
            n += 1
            T = np.array([r["T"] for r in grp]); E = np.array([r[k] for r in grp])
            rho.append(spearmanr(T, E)[0])
            o = np.argsort(E)
            best = int(np.argmin(T))
            top1 += best == o[0]
            top3 += best in o[:3]
            reg1.append(T[o[0]] / T.min() - 1)
            reg3.append(T[o[:3]].min() / T.min() - 1)
    print(f"{k}: groups {n}  Spearman median {np.median(rho):.4f} min {np.min(rho):.4f} | true-best date ranked #1: {top1}/{n}, in top 3: {top3}/{n} | regret solving best-1: median {np.median(reg1)*100:.4f}% max {np.max(reg1)*100:.3f}%  best-3: median {np.median(reg3)*100:.5f}% max {np.max(reg3)*100:.4f}%")
# how many solves does a search save: if you keep dates whose E is within x of the best E, do you keep the true best?
print("\nkeep-all-within-x rule using E2 (relative to min E2 in the group): fraction of groups that keep the true best, mean kept of 24")
for x in (0.002, 0.005, 0.01, 0.02):
    keep, kept = 0, []
    n = 0
    for pr in sorted(set(r["pair"] for r in R)):
        for g in ACCS:
            grp = [r for r in R if r["pair"] == pr and r["a_g"] == g and r.get("E2")]
            if len(grp) < 10: continue
            n += 1
            E = np.array([r["E2"] for r in grp]); T = np.array([r["T"] for r in grp])
            m = E <= E.min() * (1 + x)
            keep += m[int(np.argmin(T))]
            kept.append(m.sum())
    print(f"x={x:5}: true best kept in {keep}/{n} groups; mean dates kept {np.mean(kept):.1f} of {len(grp)}")
# timing of the estimate
import time
A, B = FN["earth"], FN["mars"]
ts = []
for _ in range(3):
    t = time.perf_counter()
    for i in range(100):
        free_space_T(A, B, 2461356.5 + i, g_to_aud2(0.3))
    ts.append((time.perf_counter() - t) / 100 * 1e6)
print("E1 estimate cost (scalar python, loaded machine), best of 3: %.0f us" % min(ts))
