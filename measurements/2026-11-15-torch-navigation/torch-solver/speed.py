"""Item 5: cheapest configuration that keeps arrival error < 100 km and < 1 m/s, and wall time per solve.
Error = arrival mismatch of the solved parameters re-propagated with a tight Picard (M=24, phi_max=0.2, ptol=1e-14);
that reference is validated against DOP853 (rtol 1e-12) in grid.py / final_verify.py."""
import json, sys, time
import numpy as np
from lab import *
from torch_reference import propagate_arc

R = [r for r in json.load(open("grid_results.json"))["results"] if r["ok"]]
SAMPLE = R[::6]


def tight_err(o, A, B, jd, a_g):
    acc = g_to_aud2(a_g)
    rA, vA = A(jd)
    r, v = propagate_arc(rA[None], vA[None], acc * o["e1"][None], np.array([o["t1"]]), MU, 24, 0.2, 1e-14)
    r, v = propagate_arc(r, v, acc * o["e2"][None], np.array([o["t2"]]), MU, 24, 0.2, 1e-14)
    rB, vB = B(jd + o["t1"] + o["t2"])
    return float(np.linalg.norm(r[0] - rB) * AU_KM), float(np.linalg.norm(v[0] - vB) * AUD_MS)


def run_cfg(cfg, cases, reps=3):
    names = {"M": "M", "phi": "phi_max", "ptol": "ptol", "ntol": "ntol", "jac": "jacobian"}
    kw = {names[k]: v for k, v in cfg.items()}
    outs, best_t = None, 1e99
    for _ in range(reps):
        t = time.perf_counter()
        o = []
        for r in cases:
            A, B = FN[r["pair"].split("-")[0]], FN[r["pair"].split("-")[1]]
            try:
                o.append(solve_trip(A, B, r["jd"], r["a_g"], want_path=False, **kw))
            except Exception:
                o.append(dict(ok=False))
        best_t = min(best_t, time.perf_counter() - t)
        outs = o
    ek, ev, nok, its = [], [], 0, []
    for r, o in zip(cases, outs):
        if not o["ok"]:
            continue
        nok += 1
        A, B = FN[r["pair"].split("-")[0]], FN[r["pair"].split("-")[1]]
        a, b = tight_err(o, A, B, r["jd"], r["a_g"])
        ek.append(a); ev.append(b); its.append(o["iters"])
    ek, ev = np.array(ek), np.array(ev)
    return dict(cfg=cfg, n=len(cases), ok=nok, ms=best_t / len(cases) * 1e3, ek_med=float(np.median(ek)), ek_max=float(ek.max()),
                ev_med=float(np.median(ev)), ev_max=float(ev.max()), iters=float(np.mean(its)))


def show(rows):
    print("config | ok | ms/solve (best of 3) | mean iters | pos err km median/max | vel err m/s median/max")
    for r in rows:
        c = ", ".join(f"{k}={v}" for k, v in r["cfg"].items())
        print(f"{c:58} | {r['ok']}/{r['n']} | {r['ms']:6.2f} | {r['iters']:.2f} | {r['ek_med']:.2e}/{r['ek_max']:.2e} | {r['ev_med']:.2e}/{r['ev_max']:.2e}")


if __name__ == "__main__":
    print("sample size", len(SAMPLE))
    base = dict(M=16, phi=0.5, ptol=1e-13, ntol=1e-11)
    rows = []
    print("\n--- one-at-a-time sweeps around the reference configuration")
    for M in (6, 8, 10, 12, 16, 24):
        rows.append(run_cfg({**base, "M": M}, SAMPLE))
    for phi in (0.25, 0.5, 1.0, 2.0, 4.0):
        rows.append(run_cfg({**base, "M": 12, "phi": phi}, SAMPLE))
    for pt in (1e-13, 1e-11, 1e-9, 1e-7):
        rows.append(run_cfg({**base, "M": 12, "phi": 1.0, "ptol": pt}, SAMPLE))
    for nt in (1e-11, 1e-9, 1e-7, 1e-5, 1e-4):
        rows.append(run_cfg({**base, "M": 12, "phi": 1.0, "ptol": 1e-11, "ntol": nt}, SAMPLE))
    show(rows)
    print("\n--- candidate bundles")
    cands = [dict(M=16, phi=0.5, ptol=1e-13, ntol=1e-11), dict(M=12, phi=1.0, ptol=1e-11, ntol=1e-9), dict(M=10, phi=1.0, ptol=1e-10, ntol=1e-8),
             dict(M=8, phi=1.5, ptol=1e-9, ntol=1e-7), dict(M=8, phi=2.0, ptol=1e-8, ntol=1e-6), dict(M=6, phi=2.0, ptol=1e-7, ntol=1e-5),
             dict(M=10, phi=1.0, ptol=1e-10, ntol=1e-8, jac="fd"), dict(M=12, phi=1.0, ptol=1e-11, ntol=1e-9, jac="fd")]
    rows2 = [run_cfg(c, SAMPLE) for c in cands]
    show(rows2)
    json.dump(dict(sweep=rows, cands=rows2), open("speed_results.json", "w"))
    # --- RK4 fixed-step step count for the same solutions (integration error only)
    print("\n--- fixed-step RK4: arrival error of the solved parameters vs steps per arc (integration error only)")
    from baseline import rk4_arc, dirvec
    sub = SAMPLE[::3]
    for n in (10, 20, 40, 80, 160, 320, 640):
        ek, ev, t = [], [], 0.0
        for r in sub:
            A, B = FN[r["pair"].split("-")[0]], FN[r["pair"].split("-")[1]]
            acc = g_to_aud2(r["a_g"])
            rA, vA = A(r["jd"])
            y0 = np.concatenate([rA, vA])
            t0 = time.perf_counter()
            y = rk4_arc(rk4_arc(y0, np.array(r["e1"]), acc, r["t1"], n), np.array(r["e2"]), acc, r["t2"], n)
            t += time.perf_counter() - t0
            rB, vB = B(r["jd"] + r["t1"] + r["t2"])
            ek.append(np.linalg.norm(y[:3] - rB) * AU_KM); ev.append(np.linalg.norm(y[3:] - vB) * AUD_MS)
        ek, ev = np.array(ek), np.array(ev)
        print(f"RK4 n={n:4d}/arc: pos err km median {np.median(ek):.2e} p95 {np.percentile(ek,95):.2e} max {ek.max():.2e} | vel err m/s median {np.median(ev):.2e} max {ev.max():.2e} | one integration {t/len(sub)*1e3:.2f} ms")
