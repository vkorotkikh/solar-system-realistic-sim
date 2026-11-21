from clab import *
from exp4 import starts_for, KW
res = json.load(open("exp4.json"))
sub = res[::3]
T1, T4, Tstart = {g: [] for g in (0.01, 0.03, 0.1, 0.3)}, {g: [] for g in (0.01, 0.03, 0.1, 0.3)}, []
for r in sub:
    a, b = r["pair"].split("-"); A, B = FN[a], FN[b]; jd, g = r["jd"], r["g"]; acc = g_to_aud2(g)
    def timed(names):
        best = 1e9
        for _ in range(3):
            t = time.perf_counter()
            S = starts_for.__wrapped__(A, B, jd, acc) if hasattr(starts_for, "__wrapped__") else None
            best = min(best, time.perf_counter() - t)
        return best
    # time the guess construction + solves for 1 start vs 4 starts
    best1 = best4 = 1e9
    for _ in range(3):
        t = time.perf_counter()
        base = better_guess(A, B, jd, acc)
        try: solve_trip(A, B, jd, g, guess=base, **KW)
        except Exception: pass
        best1 = min(best1, time.perf_counter() - t)
    for _ in range(3):
        t = time.perf_counter()
        base = better_guess(A, B, jd, acc); res_ = rescue_guesses(A, B, jd, acc)
        for gs in (base, naive_guess(A, B, jd, acc), res_[6], res_[7]):
            try: solve_trip(A, B, jd, g, guess=gs, **KW)
            except Exception: pass
        best4 = min(best4, time.perf_counter() - t)
    T1[g].append(best1 * 1e3); T4[g].append(best4 * 1e3)
for g in T1:
    a1, a4 = np.array(T1[g]), np.array(T4[g])
    print(f"{g} g n={len(a1)}: 1 start median {np.median(a1):.1f} ms p90 {np.percentile(a1,90):.1f} max {a1.max():.1f} | 4 starts median {np.median(a4):.1f} p90 {np.percentile(a4,90):.1f} max {a4.max():.1f}  ratio {np.median(a4)/np.median(a1):.2f}")
