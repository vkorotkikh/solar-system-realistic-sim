"""Task 1: complex-step vs forward-difference Jacobian on a sample of the grid."""
import sys
from multiprocessing import Pool
from clab import *

PAIRS = [("earth","mars"),("earth","venus"),("earth","mercury"),("earth","jupiter"),("earth","saturn"),
         ("earth","neptune"),("mars","ceres"),("earth","eris"),("jupiter","saturn")]
ACCS = [0.03, 0.1, 0.3, 1.0, 3.0, 10.0]

def conj_dates(a, b, n=3, sep=40):
    days = np.arange(JD0, JD0 + 3650, 1.0)
    ang = []
    for jd in days:
        ra, rb = FN[a](jd)[0], FN[b](jd)[0]
        ang.append(math.acos(np.clip(ra @ rb / np.linalg.norm(ra) / np.linalg.norm(rb), -1, 1)))
    ang = np.array(ang); picked = []
    for i in np.argsort(-ang):
        if all(abs(days[i]-days[j]) > sep for j in picked): picked.append(i)
        if len(picked) == n: break
    return [float(days[i]) for i in picked]

def build():
    cases = []
    rng = np.random.default_rng(7)
    for a, b in PAIRS:
        ev = list(JD0 + rng.uniform(0, 3650, 3).round() + 0.5)
        cj = conj_dates(a, b, 3)
        for jd in ev + cj:
            for g in ACCS:
                cases.append((a, b, float(jd), g, jd in cj))
    return cases

CFGS = {
 "complex/FAST": dict(jacobian="complex", **FAST),
 "fd1e-4/FAST": dict(jacobian="fd", fdh=1e-4, **FAST),
 "fd1e-5/FAST": dict(jacobian="fd", fdh=1e-5, **FAST),
 "fd1e-6/FAST": dict(jacobian="fd", fdh=1e-6, **FAST),
 "fd1e-7/FAST": dict(jacobian="fd", fdh=1e-7, **FAST),
 "fd1e-8/FAST": dict(jacobian="fd", fdh=1e-8, **FAST),
 "fd1e-9/FAST": dict(jacobian="fd", fdh=1e-9, **FAST),
 "complex/strict": dict(jacobian="complex"),
 "fd1e-6/strict": dict(jacobian="fd", fdh=1e-6),
 "fd1e-7/strict": dict(jacobian="fd", fdh=1e-7),
 "fd1e-8/strict": dict(jacobian="fd", fdh=1e-8),
}

def one(args):
    a, b, jd, g, isconj = args
    A, B = FN[a], FN[b]; acc = g_to_aud2(g)
    out = dict(pair=f"{a}-{b}", jd=jd, g=g, conj=isconj)
    try: gs = better_guess(A, B, jd, acc)
    except Exception: gs = naive_guess(A, B, jd, acc)
    for name, kw in CFGS.items():
        try:
            o = solve_trip(A, B, jd, g, guess=gs, want_path=False, **kw)
        except Exception as ex:
            out[name] = dict(ok=False, msg="exc " + type(ex).__name__); continue
        r = dict(ok=bool(o["ok"]), msg=o["msg"], it=o["iters"], nfev=o["nfev"], T=o["T"], nF=float(o["nF"]))
        if o["ok"]:
            try: r["er"], r["ev"] = reintegrate(o, A, B, jd, g)
            except Exception: pass
        out[name] = r
    return out

if __name__ == "__main__":
    cases = build()
    print(len(cases), "trips", flush=True)
    t = time.time()
    with Pool(8) as p: res = p.map(one, cases, chunksize=4)
    json.dump(res, open("exp1.json", "w"))
    print("done", round(time.time()-t, 1), "s")
