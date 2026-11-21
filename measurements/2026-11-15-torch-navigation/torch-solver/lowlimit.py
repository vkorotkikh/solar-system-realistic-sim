"""Item 8: where does the model stop making sense?  Sweep a far below the grid's 0.01 g.
For each case report: converged?, T, closest approach, number of Sun revolutions (swept angle/2pi) along the path,
thrust / (Sun gravity at the smaller orbit radius), and whether the answer is a sane 'two-burn' path."""
import json, sys
from multiprocessing import Pool
from lab import *

G_SUN_1AU_MS2 = GM_SUN_KM3S2 / AU_KM ** 2 * 1e3          # m/s^2 at 1 AU


def sun_g(r_au):
    return G_SUN_1AU_MS2 / r_au ** 2


def revs(path):
    r = path[:, 1:4]
    ang = np.arccos(np.clip((r[:-1] * r[1:]).sum(1) / np.linalg.norm(r[:-1], axis=1) / np.linalg.norm(r[1:], axis=1), -1, 1)).sum()
    return ang / (2 * math.pi)


def one(args):
    a, b, jd, a_ms2_over_g = args
    A, B = FN[a], FN[b]
    a_g = a_ms2_over_g
    rA, rB = np.linalg.norm(A(jd)[0]), np.linalg.norm(B(jd)[0])
    rs = min(rA, rB)
    ratio = a_g * G0 / sun_g(rs)
    acc = g_to_aud2(a_g)
    attempts = [better_guess(A, B, jd, acc), naive_guess(A, B, jd, acc)] + rescue_guesses(A, B, jd, acc)
    res = None
    for i, g in enumerate(attempts):
        try:
            o = solve_trip(A, B, jd, a_g, guess=g, want_path=True)
        except Exception as ex:
            o = dict(ok=False, msg=str(ex))
        if o["ok"]:
            res = (i, o)
            break
    rec = dict(pair=f"{a}-{b}", jd=jd, a_g=a_g, r_small=rs, thrust_over_sungrav=ratio, tries=(i + 1))
    if res is None:
        rec.update(ok=False, msg=o.get("msg"))
        return rec
    i, o = res
    # genuine check: free-space estimate T for comparison; revolutions about the Sun; T vs orbital period at r_small
    P_small = 2 * math.pi * math.sqrt(rs ** 3 / MU)
    rec.update(ok=True, via=i, T=o["T"], dv=o["dv"], rmin=o["rmin_sun"], revs=revs(o["path"]), T_over_period=o["T"] / P_small,
               iters=o["iters"], resid_r_km=o["resid_r"], rmax=float(np.linalg.norm(o["path"][:, 1:4], axis=1).max()))
    try:
        er, ev = reintegrate(o, A, B, jd, a_g)
        rec.update(dop_km=er, dop_ms=ev)
    except Exception:
        pass
    try:
        rec["E1"] = free_space_T(A, B, jd, acc)["T"]
    except Exception:
        rec["E1"] = None
    return rec


if __name__ == "__main__":
    D = json.load(open("grid_results.json"))["dates"]
    accs = [0.01, 0.005, 0.003, 0.002, 0.001, 0.0006, 0.0004, 0.0003, 0.0002, 0.0001, 3e-5, 1e-5]
    pairs = [("earth", "mars"), ("earth", "venus"), ("earth", "mercury"), ("earth", "jupiter"), ("mars", "ceres"), ("earth", "neptune")]
    cases = []
    for a, b in pairs:
        ds = D[f"{a}-{b}"]
        for k in (1, 5, 9, 13):
            for g in accs:
                cases.append((a, b, ds[k][0], g))
    print(len(cases), flush=True)
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 5) as p:
        res = p.map(one, cases, chunksize=2)
    json.dump(res, open("lowlimit_results.json", "w"))
    print("pair | a_g | thrust/g_sun(r_small) range | ok | median T/T_E1-1 | median revs | median T/period | max dop km")
    for pr in sorted(set(r["pair"] for r in res)):
        for g in accs:
            rr = [r for r in res if r["pair"] == pr and r["a_g"] == g]
            okr = [r for r in rr if r["ok"]]
            ratios = [r["thrust_over_sungrav"] for r in rr]
            print(f"{pr:15} {g:8g} | {min(ratios):8.2f}-{max(ratios):8.2f} | {len(okr)}/{len(rr)} | "
                  + (f"{np.median([r['T']/r['E1']-1 for r in okr if r['E1']])*100:7.2f}% | {np.median([r['revs'] for r in okr]):.3f} | {np.median([r['T_over_period'] for r in okr]):.3f} | {max(r.get('dop_km', 0) for r in okr):.2g}" if okr else "none converged"))
