import json, numpy as np, collections
from lab import *
D = json.load(open("grid_results.json")); R = D["results"]
print("cases", len(R))
accs = ACCS
def frac(sel): return f"{sum(sel)}/{len(sel)}"
print("\n== Item 1: convergence per acceleration (all 9 pairs x 24 dates)")
print("a_g | naive guess ok | better guess ok | after rescue | unsolved | med/max iters (better) | med nfev")
for g in accs:
    rr = [r for r in R if r["a_g"] == g]
    n = len(rr)
    nv = sum(r["naive_ok"] for r in rr); bt = sum(r["better_ok"] for r in rr); ok = sum(r["ok"] for r in rr)
    it = [r["better_iters"] for r in rr if r["better_ok"]]
    nf = [r["better_nfev"] for r in rr if r["better_ok"]]
    print(f"{g:5} | {nv}/{n} | {bt}/{n} | {ok}/{n} | {n-ok} | {np.median(it):.0f}/{max(it)} | {np.median(nf):.0f}")
print("overall naive %d/%d better %d/%d rescued-ok %d/%d" % (sum(r['naive_ok'] for r in R),len(R),sum(r['better_ok'] for r in R),len(R),sum(r['ok'] for r in R),len(R)))
print("\nper pair (better / rescue-ok of 168):")
for p in sorted(set(r["pair"] for r in R)):
    rr=[r for r in R if r["pair"]==p]
    print(p, sum(r["naive_ok"] for r in rr), sum(r["better_ok"] for r in rr), sum(r["ok"] for r in rr), "of", len(rr))
print("\nfailures of 'better' (msg counts):", collections.Counter(r["better_msg"] for r in R if not r["better_ok"]))
print("failures of naive (msg counts):", collections.Counter(r["naive_msg"] for r in R if not r["naive_ok"]))
unsolved = [r for r in R if not r["ok"]]
print("\nunsolved even after rescue:", len(unsolved))
for r in unsolved[:40]:
    print(r["pair"], round(r["jd"],1), r["conj_ang"] and round(r["conj_ang"],2), r["a_g"], r["better_msg"], "nF",r.get("fail_nF"))
resc = [r for r in R if r.get("rescued")]
print("rescued:", len(resc), collections.Counter((r["pair"]) for r in resc), collections.Counter(r["a_g"] for r in resc))
print("\nby date kind (even vs conj): better ok")
for kind in ("even","conj"):
    rr=[r for r in R if (r["conj_ang"] is None)==(kind=="even")]
    print(kind, sum(r["better_ok"] for r in rr), sum(r["naive_ok"] for r in rr), sum(r["ok"] for r in rr), "of", len(rr))
S=[r for r in R if r["ok"]]
print("\n== Item 7: closest Sun approach; cases < 0.1 AU, < R_sun")
low=[r for r in S if r["rmin_sun"]<0.1]
print("n<0.1AU:", len(low), " n<R_sun(0.00465):", sum(r["rmin_sun"]<R_SUN_AU for r in S))
import csv
with open("cases_under_0.1AU.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(["pair","jd","conjunction_angle_deg","a_g","rmin_sun_AU","rmin_over_Rsun","T_days","dv_kms"])
    for r in sorted(low,key=lambda r:r["rmin_sun"]): w.writerow([r["pair"],r["jd"],r["conj_ang"],r["a_g"],round(r["rmin_sun"],5),round(r["rmin_sun"]/R_SUN_AU,2),round(r["T"],4),round(r["dv"]/1e3,1)])
print("count <0.1 AU by a_g:", {g:sum(1 for r in low if r["a_g"]==g) for g in accs})
print("count <0.1 AU by pair:", collections.Counter(r["pair"] for r in low))
print("cases < 0.02 AU:", [(r["pair"],round(r["jd"],1),r["a_g"],round(r["rmin_sun"],4)) for r in S if r["rmin_sun"]<0.02][:50])
print("inside the Sun:", [(r["pair"],round(r["jd"],1),r["a_g"],round(r["rmin_sun"],5)) for r in S if r["rmin_sun"]<R_SUN_AU])
print("rmin quantiles (AU) all solved:", np.percentile([r["rmin_sun"] for r in S],[0,1,5,25,50]).round(4))
print("conj-date rmin by pair/a (min over 6 conj dates):")
for p in sorted(set(r["pair"] for r in S)):
    row=[]
    for g in accs:
        v=[r["rmin_sun"] for r in S if r["pair"]==p and r["a_g"]==g and r["conj_ang"] is not None]
        row.append(f"{min(v):.3f}" if v else "-")
    print(f"{p:16}", " ".join(row))
print("\n== Item 2 (gravity on): DOP853 re-integration errors")
for g in accs:
    rr=[r for r in S if r["a_g"]==g and r.get("dop_err_km") is not None]
    ek=np.array([r["dop_err_km"] for r in rr]); ev=np.array([r["dop_err_ms"] for r in rr])
    rk=np.array([r["resid_r_km"] for r in rr])
    print(f"{g:5} n={len(rr)} pos err km median {np.median(ek):.2e} max {ek.max():.2e} | vel err m/s median {np.median(ev):.2e} max {ev.max():.2e} | solver resid km max {rk.max():.2e}")
print("\n== Item 3: gravity on vs off (T_on/T_off-1)")
for g in accs:
    rr=[r for r in S if r["a_g"]==g and r.get("T_off")]
    x=np.array([r["T"]/r["T_off"]-1 for r in rr])*100
    print(f"{g:5} n={len(rr)} median {np.median(x):+.4f}%  p5 {np.percentile(x,5):+.3f}%  p95 {np.percentile(x,95):+.3f}%  min {x.min():+.3f}%  max {x.max():+.3f}%   med dT {np.median([r['T']-r['T_off'] for r in rr]):+.4f} d, med dv_on {np.median([r['dv'] for r in rr])/1e3:.1f} km/s")
print("\nper-pair median |dT| % at each a")
for p in sorted(set(r["pair"] for r in S)):
    row=[]
    for g in accs:
        x=[abs(r["T"]/r["T_off"]-1)*100 for r in S if r["pair"]==p and r["a_g"]==g and r.get("T_off")]
        row.append(f"{np.median(x):8.4f}")
    print(f"{p:16}"," ".join(row))
# E1 consistency
d=[abs(r["T_off"]/r["E1"]-1) for r in S if r.get("T_off") and r.get("E1") and r.get("E1ok")]
print("\nT_off(numerical, mu=0) vs E1 closed form: n",len(d),"max rel diff",max(d))
json.dump({}, open("/dev/null","w"))
