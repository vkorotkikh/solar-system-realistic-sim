import json, numpy as np, collections, sys
mine = json.load(open("exp2_em.json"))
ref = {(r["a_g"], r["day"]): r for r in json.load(open("../course-geometry/exp2_days.json"))}
for g in (1.0, 0.3):
    R = [r for r in mine if r["g"] == g]
    print(f"== earth-mars {g} g: {len(R)} sampled days; base ok {sum(r['base_ok'] for r in R)}")
    bl = [r for r in R if r.get("blocked")]
    ref_bl = {d for (gg, d), r in ref.items() if gg == g and r.get("blocked_dyn")}
    mine_bl = {r["day"] for r in bl}
    print("  blocked mine", len(bl), "ref", len(ref_bl), "only-mine", sorted(mine_bl - ref_bl), "only-ref", sorted(ref_bl - mine_bl))
    ok = [r for r in bl if r["ok"]]
    print("  detour converged", len(ok), "/", len(bl), "msgs", dict(collections.Counter(r["msg"] for r in bl if not r["ok"])))
    its = np.array([r["it"] for r in ok]); ms = np.array([r["ms"] for r in ok])
    print(f"  iters med/max {np.median(its):.0f}/{its.max()}  solve ms med/p90/max {np.median(ms):.1f}/{np.percentile(ms,90):.1f}/{ms.max():.1f}   (base ms med {np.median([r['base_ms'] for r in bl]):.1f})")
    d = []
    for r in ok:
        rr = ref[(g, r["day"])]
        if rr.get("blocked_dyn") and rr["modes"]["away_dyn"]["ok"]:
            Tref = rr["base_T"] + rr["modes"]["away_dyn"]["dT_h"] / 24
            d.append((r["T"] / Tref - 1, r["dT_h"], rr["modes"]["away_dyn"]["dT_h"], r["day"]))
    d = np.array(d)
    print(f"  T vs course-geometry away_dyn: rel diff med {np.median(np.abs(d[:,0])):.1e} max {np.abs(d[:,0]).max():.1e}; dT_h mine mean {d[:,1].mean():.3f} max {d[:,1].max():.3f}  ref mean {d[:,2].mean():.3f} max {d[:,2].max():.3f}")
    bad = d[np.abs(d[:,0]) > 1e-6]
    print("  days where |dT rel| > 1e-6:", len(bad), bad[:6].tolist())
    er = np.array([r["dop"]["err_km"] for r in ok if r.get("dop")]); ev = np.array([r["dop"]["err_ms"] for r in ok if r.get("dop")])
    mn = np.array([r["dop"]["min_dense"] for r in ok if r.get("dop")])
    print(f"  DOP853: arrival err km med/max {np.median(er):.2e}/{er.max():.2e}  m/s max {ev.max():.2e};  min dense-sampled |r| min {mn.min():.8f} (>=0.1?) max {mn.max():.8f}")
    print("  dT_pct max", max((r['dT_h']/24/r['base_T']*100) for r in ok))
    print("  phi deg min/med/max", min(r["phi_deg"] for r in ok), np.median([r["phi_deg"] for r in ok]), max(r["phi_deg"] for r in ok))
