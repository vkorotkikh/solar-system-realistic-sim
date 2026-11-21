"""Item 6: burn-coast-burn with a delta-v budget.  Adaptive continuation in the budget from the no-coast solution,
rejecting steps that jump T (that is how a different branch is caught).  earth-mars, 1 g and 0.3 g, one date."""
import json, csv, sys
from lab import *

JD = 2461356.5


def curve(a, b, a_g, jd, dv_floor_kms=3.0, **kw):
    A, B = FN[a], FN[b]
    base = solve_trip(A, B, jd, a_g)
    assert base["ok"]
    pts = [dict(dv_kms=base["dv"] / 1e3, T=base["T"], coast=0.0, t1=base["t1"], t2=base["t2"], iters=base["iters"], rmin=base["rmin_sun"],
                e1=base["e1"], e2=base["e2"], steps_rejected=0)]
    prev, h, rej = base, 0.1, 0
    lnb = math.log(base["dv"])
    nsol = 0
    while h > 1e-7:
        bud = math.exp(lnb - h)
        if bud / 1e3 < dv_floor_kms:
            break
        sc = bud / prev["dv"]
        g = dict(e1=prev["e1"], e2=prev["e2"], t1=prev["t1"] * sc, t2=prev["t2"] * sc, tc=max(prev["coast"], 1e-3 * prev["T"]))
        try:
            o = solve_trip(A, B, jd, a_g, dv_budget=bud, guess=g, want_path=False, **kw)
        except Exception:
            o = dict(ok=False)
        nsol += 1
        if o["ok"] and abs(math.log(o["T"] / prev["T"])) < 0.08 and o["coast"] >= 0:
            lnb -= h
            pts.append(dict(dv_kms=bud / 1e3, T=o["T"], coast=o["coast"], t1=o["t1"], t2=o["t2"], iters=o["iters"], rmin=None,
                            e1=o["e1"], e2=o["e2"], steps_rejected=rej, resid_r=o["resid_r"], resid_v=o["resid_v"]))
            prev, rej = o, 0
            h = min(h * 1.5, 0.15)
        else:
            h /= 2
            rej += 1
    return base, pts, nsol


def lam(A, B, jd, T):
    from trajectory.lambert import solve_lambert_universal
    rA, vA = A(jd)
    rB, vB = B(jd + T)
    sl = solve_lambert_universal(rA, rB, float(T))
    if sl is None:
        return None
    d1, d2 = np.array(sl["v1"]) - vA, vB - np.array(sl["v2"])
    return (np.linalg.norm(d1) + np.linalg.norm(d2)) * AUD_MS / 1e3, d1, d2


def tail(a, b, a_g, jd, last, n=16):
    """below where the budget continuation stalls: seed from the impulsive Lambert transfer with the same dv
    (smaller-T side of the dv minimum), then solve the finite-burn problem."""
    A, B = FN[a], FN[b]
    acc = g_to_aud2(a_g)
    Ts = np.linspace(last["T"], 600.0, 300)
    dvs = np.array([(lam(A, B, jd, T) or (np.inf,))[0] for T in Ts])
    i = int(np.argmin(dvs))
    dvf = dvs[i]
    pts = []
    for bud in np.geomspace(last["dv_kms"] * 0.999, dvf * 1.0006, n):
        Ts_ = float(np.interp(bud, dvs[: i + 1][::-1], Ts[: i + 1][::-1]))
        l = lam(A, B, jd, Ts_)
        t1, t2 = np.linalg.norm(l[1]) / acc, np.linalg.norm(l[2]) / acc
        g = dict(e1=l[1] / np.linalg.norm(l[1]), e2=l[2] / np.linalg.norm(l[2]), t1=t1, t2=t2, tc=Ts_ - t1 - t2)
        o = solve_trip(A, B, jd, a_g, dv_budget=bud * 1e3, guess=g, want_path=False)
        if o["ok"] and abs(o["T"] / Ts_ - 1) < 0.1:
            pts.append(dict(dv_kms=bud, T=o["T"], coast=o["coast"], t1=o["t1"], t2=o["t2"], iters=o["iters"], rmin=None,
                            e1=o["e1"], e2=o["e2"], steps_rejected=0, resid_r=o["resid_r"], resid_v=o["resid_v"], seeded="lambert", T_lambert=Ts_))
    return pts, dvf, Ts[i]


if __name__ == "__main__":
    out, rows_csv = {}, []
    for a_g in (1.0, 0.3):
        base, pts, nsol = curve("earth", "mars", a_g, JD)
        tp, dvf, Tf = tail("earth", "mars", a_g, JD, pts[-1])
        print(f"continuation stalled at dv={pts[-1]['dv_kms']:.3f} km/s; impulsive Lambert dv minimum {dvf:.3f} km/s at T={Tf:.1f} d; tail points {len(tp)}")
        pts = sorted(pts + tp, key=lambda p: -p['dv_kms'])
        out[str(a_g)] = [{k: (list(map(float, v)) if k in ("e1", "e2") else v) for k, v in p.items()} for p in pts]
        print(f"\n== earth-mars {a_g} g, JD {JD}: no-coast T={base['T']:.4f} d dv={base['dv']/1e3:.1f} km/s;  {len(pts)} accepted points, {nsol} solves")
        print(" dv km/s |  T days | coast d | burn1 d | burn2 d | iters | dv/dv_lambert(T) | resid km, m/s")
        sel = sorted(set([0, len(pts) - 1] + [int(i) for i in np.linspace(0, len(pts) - 1, 24)]))
        for i in sel:
            p = pts[i]
            l = lam(FN["earth"], FN["mars"], JD, p["T"]) if p["coast"] > 0 else None
            rt = f"{p['dv_kms'] / l[0]:.4f}" if l else "-"
            print(f"{p['dv_kms']:9.3f} | {p['T']:8.3f} | {p['coast']:8.3f} | {p['t1']:.5f} | {p['t2']:.5f} | {p['iters']:3d} | {rt:>8} | {(p.get('resid_r') or 0):.2g} {(p.get('resid_v') or 0):.2g}")
        last = pts[-1]
        print(f"last point: dv {last['dv_kms']:.4f} km/s  T {last['T']:.2f} d  coast {last['coast']:.2f} d  ")
        print("max residual over curve: %.3g km, %.3g m/s" % (max(p.get('resid_r') or 0 for p in pts), max(p.get('resid_v') or 0 for p in pts)))
        for p in pts:
            rows_csv.append([a_g, p["dv_kms"], p["T"], p["coast"], p["t1"], p["t2"]])
    json.dump(out, open("coast_results.json", "w"))
    with open("coast_curve.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["a_g", "dv_kms", "T_days", "coast_days", "burn1_days", "burn2_days"]); w.writerows(rows_csv)
