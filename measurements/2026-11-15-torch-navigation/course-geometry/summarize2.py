import json, numpy as np
rows = json.load(open("exp2_days.json"))
R0 = 0.1
print("total day-solves", len(rows))
for g in (1.0, 0.3):
    rs = [r for r in rows if r["a_g"] == g]
    ok = [r for r in rs if r["base_ok"]]
    print(f"\n== {g} g: {len(rs)} days, baseline 6-unknown Newton converged {len(ok)}/{len(rs)}; iterations max {max(r['base_it'] for r in ok)} mean {np.mean([r['base_it'] for r in ok]):.2f}")
    fd = np.array([r["free_dmin"] for r in ok]); dd = np.array([r["base_rmin"] for r in ok])
    dT = np.array([r["base_T"] - r["free_T"] for r in ok])
    print(f"   rmin dynamic - free-space: mean {np.mean(dd-fd):.4f} AU, median {np.median(dd-fd):.4f}, min {np.min(dd-fd):.4f}, max {np.max(dd-fd):.4f}; T dyn-free: mean {np.mean(dT)*24:.2f} h range {np.min(dT)*24:.2f}..{np.max(dT)*24:.2f} h")
    bf = fd < R0; bd = dd < R0
    print(f"   R=0.1 blocked: free-space {bf.sum()} days, dynamic {bd.sum()} days; free-only {(bf&~bd).sum()}, dynamic-only {(bd&~bf).sum()}")
    # runs by dynamic
    days = np.array([r["day"] for r in ok])
    order = np.argsort(days); days = days[order]; bd_s = bd[order]
    # group consecutive
    runs = []; start = None
    for d, b in zip(days, bd_s):
        if b and start is None: start = d; prev = d
        elif b: prev = d
        elif start is not None: runs.append((start, prev)); start = None
    if start is not None: runs.append((start, prev))
    print("   dynamic R=0.1 runs (day idx):", runs, "lengths", [e-s+1 for s,e in runs])
    for R in (0.05, 0.2, 0.3):
        pass
    bl = [r for r in ok if r.get("blocked_dyn")]
    print(f"   dynamic-blocked days with detours: {len(bl)}")
    for name in ("z_scratch","z_lm","away_scratch","away_dyn"):
        ms = [r["modes"][name] for r in bl]
        conv = [m for m in ms if m["ok"]]
        # sanity: converged and rmin ~ R and dT small
        sane = [m for m in conv if abs(m["rmin"]-R0) < 1e-6 and m["dT_pct"] < 5 and m["dT_pct"] > -0.5]
        print(f"   {name:13s} converged {len(conv)}/{len(ms)} sane {len(sane)}; iterations mean {np.mean([m['it'] for m in conv]):.1f} max {max(m['it'] for m in conv)}; nfev mean {np.mean([m['nfev'] for m in conv]):.0f}; wall ms mean {np.mean([m['ms'] for m in conv]):.0f}; "
              f"dT h mean {np.mean([m['dT_h'] for m in sane]):.2f} med {np.median([m['dT_h'] for m in sane]):.2f} max {np.max([m['dT_h'] for m in sane]):.2f}; dT% mean {np.mean([m['dT_pct'] for m in sane]):.2f} max {np.max([m['dT_pct'] for m in sane]):.2f}; "
              f"ddv km/s mean {np.mean([m['ddv_kms'] for m in sane]):.1f} max {np.max([m['ddv_kms'] for m in sane]):.1f}; phi deg max {np.max([m['phi_deg'] for m in sane]):.1f}")
    ver = [r["modes"][n]["verify"] for r in bl for n in ("z_scratch","away_dyn") if "verify" in r["modes"][n]]
    print(f"   independent verification of {len(ver)} solved detours: min |r| dense minus R: max |err| {max(abs(v['min_dense_au']-R0) for v in ver):.2e} AU; end miss km max {max(v['end_pos_km'] for v in ver):.2e}; end speed miss m/s max {max(v['end_vel_ms'] for v in ver):.2e}")
    opt = [r for r in bl if "opt8" in r]
    okopt = [r for r in opt if r["opt8"]["ok"]]
    print(f"   SLSQP K=8 minimum-time benchmark: {len(okopt)}/{len(opt)} converged; dT h mean {np.mean([r['opt8']['dT_h'] for r in okopt]):.2f} med {np.median([r['opt8']['dT_h'] for r in okopt]):.2f} max {np.max([r['opt8']['dT_h'] for r in okopt]):.2f}; ddv km/s mean {np.mean([r['opt8']['ddv_kms'] for r in okopt]):.1f}")
    # same-day ratio
    rat = [r["opt8"]["dT_h"]/r["modes"]["away_dyn"]["dT_h"] for r in okopt if r["modes"]["away_dyn"]["dT_h"] > 0.05]
    ratz = [r["opt8"]["dT_h"]/r["modes"]["z_scratch"]["dT_h"] for r in okopt if r["modes"]["z_scratch"]["dT_h"] > 0.05]
    print(f"   opt/away_dyn dT ratio median {np.median(rat):.2f}; opt/z ratio median {np.median(ratz):.2f}")
    # worst cases (fail list)
    for name in ("z_scratch","z_lm","away_scratch","away_dyn"):
        bad = [(r["day"], r["modes"][name]) for r in bl if not r["modes"][name]["ok"]]
        if bad: print("   FAIL", name, [(d, round(m["res"],3)) for d, m in bad][:10])
    # central day stats
    cen = min(bl, key=lambda r: r["base_rmin"])
    print("   deepest-blocked day", cen["day"], "base rmin", round(cen["base_rmin"],4), {k: (round(v["dT_h"],3), round(v["ddv_kms"],1)) for k,v in cen["modes"].items()})
    base_T = np.mean([r["base_T"] for r in bl]); print(f"   mean baseline T {base_T:.3f} d")
