import sys, json
sys.path.insert(0, "<session-dir>/nav-lab/critique-physics")
from plab import *
from multiprocessing import Pool
M = json.load(open(TS + "/multiroot_results.json"))
cases = [m for m in M if m["a_g"] <= 0.3 and m["Tdef"] / m["Tmin"] - 1 > 1e-4]
def one(m):
    a, b = m["pair"].split("-"); A, B = FN[a], FN[b]; jd, g = m["jd"], m["a_g"]; acc = g_to_aud2(g)
    st = dict(all_starts(A, B, jd, acc))
    out = {}
    for k in ("first", "naive", "d6", "d7"):
        signal.alarm(15)
        try:
            o = solve_trip(A, B, jd, g, guess=st[k], want_path=False); signal.alarm(0)
            out[k] = o["T"] if o["ok"] else None
        except Exception: signal.alarm(0); out[k] = None
    return m, out
if __name__ == "__main__":
    with Pool(10) as p: res = p.map(one, cases, chunksize=2)
    miss = []
    for m, out in res:
        ts = [t for t in out.values() if t]
        best = min(ts) if ts else None
        miss.append((best / m["Tmin"] - 1) * 100 if best else float("nan"))
    miss = np.array(miss)
    print("cases", len(cases), "| 4-start (first,naive,d6,d7) still >0.01% above the 14-start minimum:", int((miss > 1e-2).sum()), "| max shortfall %", np.nanmax(miss), "| nan", int(np.isnan(miss).sum()))
    for g in (0.01, 0.03, 0.1, 0.3):
        mm = np.array([x for x, (m, o) in zip(miss, res) if m["a_g"] == g])
        print(f"  {g} g: n known-miss cases {len(mm)}, still missed {int((mm>1e-2).sum())}, max remaining miss {np.nanmax(mm) if len(mm) else 0:.3f}%")
    # what was the 'first' miss in those cases
    for g in (0.01, 0.03, 0.1, 0.3):
        mm = [(m["Tdef"] / m["Tmin"] - 1) * 100 for m, o in res if m["a_g"] == g]
        print(f"  first-start miss at {g} g: max {max(mm):.2f}%")
    # above 0.3 g
    for g in (1.0, 3.0, 10.0):
        rr = [(r["Tdef"] / r["Tmin"] - 1) * 100 for r in M if r["a_g"] == g]
        print(f"  a={g} g: max miss of first start vs 14-start min: {max(rr):.4f}%  n>0.01%: {sum(x>0.01 for x in rr)}")
