import json, numpy as np, collections
from lab import *
R = json.load(open("linlaw_results.json"))
print("cases", len(R))
for tag in ("free", "grav"):
    print(f"\n== {tag}: (T_2burn / T_lin - 1) in %  [{'gravity off, linear law exactly optimal' if tag=='free' else 'Sun gravity on, linear law near-optimal reference'}]")
    print("a_g | n ok / n | median | p90 | max | min | starts converged (mean of 3)")
    med = {}
    mx = {}
    for g in ACCS:
        rr = [r[tag] for r in R if r["a_g"] == g and r[tag].get("ok")]
        x = np.array([(r["T2"] / r["Tlin"] - 1) * 100 for r in rr])
        tot = len([r for r in R if r["a_g"] == g])
        med[g] = np.median(x); mx[g] = x.max()
        print(f"{g:5} | {len(rr)}/{tot} | {np.median(x):+.4f} | {np.percentile(x,90):+.4f} | {x.max():+.4f} | {x.min():+.4f} | {np.mean([r['n_ok'] for r in rr]):.2f}")
    # thresholds by log-linear interpolation of median and max (accelerations descending -> find where it crosses)
    def cross(d, thr):
        gs = sorted(d)  # ascending a
        for lo, hi in zip(gs[:-1], gs[1:]):
            if d[lo] >= thr > d[hi]:
                f = (np.log(d[lo]) - np.log(thr)) / (np.log(d[lo]) - np.log(d[hi]))
                return float(np.exp(np.log(lo) + f * (np.log(hi) - np.log(lo))))
        return None if d[gs[0]] < thr else gs[0]
    for thr in (0.1, 1.0):
        print(f"  threshold {thr}%: median crosses at a = {cross({k:abs(v) for k,v in med.items()}, thr)} g ; worst case crosses at a = {cross(mx, thr)} g  (None = never exceeded in 0.01..10 g)")
    print("  per pair, median % at each a:")
    for pr in sorted(set(r["pair"] for r in R)):
        row = []
        for g in ACCS:
            x = [(r[tag]["T2"] / r[tag]["Tlin"] - 1) * 100 for r in R if r["pair"] == pr and r["a_g"] == g and r[tag].get("ok")]
            row.append(f"{np.median(x):8.4f}" if x else "     n/a")
        print(f"   {pr:16}", " ".join(row))
bad = [(r["pair"], r["a_g"], r["grav"].get("ok"), r["free"].get("ok")) for r in R if not (r["grav"].get("ok") and r["free"].get("ok"))]
print("\nfailures (pair,a,grav ok,free ok):", bad)
# negative values: constant-direction faster than linear law => linear law not optimal (local minimum or gravity)
neg = [(r["pair"], r["a_g"], round((r["grav"]["T2"]/r["grav"]["Tlin"]-1)*100,5)) for r in R if r["grav"].get("ok") and r["grav"]["T2"] < r["grav"]["Tlin"]*(1-1e-9)]
print("gravity cases where the constant-direction solution beats the linear law:", len(neg), neg[:10])
negf = [(r["pair"], r["a_g"], round((r["free"]["T2"]/r["free"]["Tlin"]-1)*100,5)) for r in R if r["free"].get("ok") and r["free"]["T2"] < r["free"]["Tlin"]*(1-1e-9)]
print("free-space cases where it beats the linear law (would contradict optimality):", len(negf), negf[:10])
w = [r["free"]["wmin"] for r in R if r["free"].get("ok")]
print("min |p + tau q| over [0,1] (flip sharpness; 0 = exact bang-bang flip) percentiles 5/50/95:", np.percentile(w, [5, 50, 95]).round(5))
# multiple local solutions
spread = [max(t for t in r["free"]["Ts"] if t) - min(t for t in r["free"]["Ts"] if t) for r in R if r["free"].get("ok") and r["free"]["n_ok"] >= 2]
print("free-space: spread between the converged starts' T (days) max", max(spread), " relative to T median", np.median([s/ r['free']['Tlin'] for s, r in zip(spread, [r for r in R if r['free'].get('ok') and r['free']['n_ok']>=2])]))
