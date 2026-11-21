"""Re-do items 3, 4 and 9 against the MINIMUM-time root found over 14 starts (multiroot_results.json)."""
import json, numpy as np
from scipy.stats import spearmanr
from lab import *
G = [r for r in json.load(open("grid_results.json"))["results"] if r["ok"]]
M = {(m["pair"], round(m["jd"], 4), m["a_g"]): m for m in json.load(open("multiroot_results.json"))}
for r in G:
    r["Tmin"] = M[(r["pair"], round(r["jd"], 4), r["a_g"])]["Tmin"]
print("== item 3 with the minimum-time root: T_on(min root)/T_off - 1, %")
for g in ACCS:
    x = np.array([(r["Tmin"] / r["T_off"] - 1) * 100 for r in G if r["a_g"] == g])
    print(f"{g:5} median {np.median(x):+.4f}  p5 {np.percentile(x,5):+.3f}  p95 {np.percentile(x,95):+.3f}  min {x.min():+.3f}  max {x.max():+.3f}")
print("\n== item 9 with the minimum-time root: (E1 - Tmin)/Tmin, %  p5 / median / p95 / max|.|")
for g in ACCS:
    x = np.array([(r["E1"] / r["Tmin"] - 1) * 100 for r in G if r["a_g"] == g])
    f1 = np.mean(np.abs(x) < 1) * 100; f01 = np.mean(np.abs(x) < 0.1) * 100
    print(f"{g:5} {np.percentile(x,5):+7.3f} {np.median(x):+7.3f} {np.percentile(x,95):+7.3f} {np.abs(x).max():7.3f}   within 1%: {f1:5.1f}%  within 0.1%: {f01:5.1f}%")
for key in ("T", "Tmin"):
    rho, top1, top3, reg1, n = [], 0, 0, [], 0
    for pr in sorted(set(r["pair"] for r in G)):
        for g in ACCS:
            grp = [r for r in G if r["pair"] == pr and r["a_g"] == g]
            T = np.array([r[key] for r in grp]); E = np.array([r["E1"] for r in grp])
            n += 1; rho.append(spearmanr(T, E)[0]); o = np.argsort(E); b = int(np.argmin(T))
            top1 += b == o[0]; top3 += b in o[:3]; reg1.append(T[o[0]] / T.min() - 1)
    print(f"ranking by E1 vs {key}: Spearman median {np.median(rho):.4f} min {np.min(rho):.3f}; best date first {top1}/{n}, top3 {top3}/{n}; regret(top1) median {np.median(reg1)*100:.4f}% max {np.max(reg1)*100:.3f}%")
# keep-within-x with Tmin
for x in (0.005, 0.01, 0.02, 0.05):
    keep, kept, n = 0, [], 0
    for pr in sorted(set(r["pair"] for r in G)):
        for g in ACCS:
            grp = [r for r in G if r["pair"] == pr and r["a_g"] == g]
            E = np.array([r["E1"] for r in grp]); T = np.array([r["Tmin"] for r in grp]); n += 1
            m = E <= E.min() * (1 + x); keep += m[int(np.argmin(T))]; kept.append(m.sum())
    print(f"keep-within-{x*100:g}% of best E1: true best (Tmin) kept in {keep}/{n} groups, mean dates kept {np.mean(kept):.1f}/24")
# item 4
L = json.load(open("linlaw_results.json"))
print("\n== item 4 with the minimum-time two-burn root (gravity on): T2min/Tlin - 1, %")
rows = []
for r in L:
    if not r["grav"].get("ok"): continue
    key = (r["pair"], round(r["jd"], 4), r["a_g"])
    T2 = M[key]["Tmin"]
    rows.append((r["a_g"], (T2 / r["grav"]["Tlin"] - 1) * 100, r["pair"]))
for g in ACCS:
    x = np.array([v for a, v, p in rows if a == g])
    print(f"{g:5} n={len(x)} median {np.median(x):+.4f}  p90 {np.percentile(x,90):+.4f}  max {x.max():+.4f}  min {x.min():+.4f}")
print("note: negative = constant-direction two-burn beats the linear law (the linear law is only exact without gravity)")
