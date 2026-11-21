"""Task 4: four-start rule at <= 0.3 g: how often does it still miss the fastest root, and what does it cost?"""
from multiprocessing import Pool
from clab import *
from exp1 import PAIRS, conj_dates
LOW = [0.01, 0.03, 0.1, 0.3]
KW = dict(jacobian="fd", want_path=False, **FAST)

def starts_for(A, B, jd, acc):
    base = better_guess(A, B, jd, acc)
    res = rescue_guesses(A, B, jd, acc)
    return {"first": base, "naive": naive_guess(A, B, jd, acc), "bent0.25": res[6], "bent0.6": res[7], "_all": [naive_guess(A, B, jd, acc)] + res + [dict(base, t1=base["t1"]*s, t2=base["t2"]*s) for s in (0.8, 0.9, 1.1, 1.25)]}

def one(args):
    a, b, jd, g = args
    A, B = FN[a], FN[b]; acc = g_to_aud2(g)
    S = starts_for(A, B, jd, acc)
    def solve(gs):
        try:
            o = solve_trip(A, B, jd, g, guess=gs, **KW)
            if not o["ok"]:
                o = solve_trip(A, B, jd, g, guess=gs, jacobian="fd", want_path=False)
            return o["T"] if o["ok"] else None
        except Exception:
            return None
    Ts = {k: solve(S[k]) for k in ("first", "naive", "bent0.25", "bent0.6")}
    allT = [solve(s) for s in [S["first"]] + S["_all"]]
    allT = [t for t in allT if t is not None]
    truth = min(allT + [t for t in Ts.values() if t is not None])
    four = min([t for t in Ts.values() if t is not None] or [float("inf")])
    return dict(pair=f"{a}-{b}", jd=jd, g=g, Ts=Ts, truth=truth, one=Ts["first"], four=four)

if __name__ == "__main__":
    rng = np.random.default_rng(11)
    cases = []
    for a, b in PAIRS:
        jds = list(JD0 + rng.uniform(0, 3650, 3).round() + 0.5) + conj_dates(a, b, 3)
        for jd in jds:
            for g in LOW: cases.append((a, b, float(jd), g))
    print(len(cases), "cases", flush=True)
    with Pool(8) as p: res = p.map(one, cases, chunksize=4)
    json.dump(res, open("exp4.json", "w"))
    print("g | n | first-guess misses >1e-4 | four-start misses >1e-4 | max miss first / four % | first failed | four failed")
    for g in LOW:
        R = [r for r in res if r["g"] == g]
        mf = [(r["one"] / r["truth"] - 1) if r["one"] else 9 for r in R]
        m4 = [(r["four"] / r["truth"] - 1) if np.isfinite(r["four"]) else 9 for r in R]
        print(f"{g} | {len(R)} | {sum(x>1e-4 for x in mf)} | {sum(x>1e-4 for x in m4)} | {100*max(mf):.2f} / {100*max(m4):.2f} | {sum(r['one'] is None for r in R)} | {sum(not np.isfinite(r['four']) for r in R)}")
    # which of the 4 starts finds the truth
    for k in ("first", "naive", "bent0.25", "bent0.6"):
        print(k, "hits truth:", sum(1 for r in res if r["Ts"][k] and r["Ts"][k] / r["truth"] - 1 < 1e-4), "/", len(res))
