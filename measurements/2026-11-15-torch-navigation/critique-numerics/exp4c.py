from clab import *
from exp4 import KW
res = json.load(open("exp4.json"))
slow = []
for r in res[::3]:
    if r["g"] > 0.1: continue
    a, b = r["pair"].split("-"); A, B = FN[a], FN[b]; jd, g = r["jd"], r["g"]; acc = g_to_aud2(g)
    base = better_guess(A, B, jd, acc); rs = rescue_guesses(A, B, jd, acc)
    for name, gs in (("first", base), ("naive", naive_guess(A, B, jd, acc)), ("bent0.25", rs[6]), ("bent0.6", rs[7])):
        t = time.perf_counter()
        try:
            o = solve_trip(A, B, jd, g, guess=gs, **KW); msg = o["msg"]; ok = o["ok"]; it = o["iters"]
        except Exception as ex:
            msg = type(ex).__name__; ok = False; it = -1
        dt = (time.perf_counter() - t) * 1e3
        if dt > 100: slow.append((dt, r["pair"], round(jd), g, name, ok, msg, it))
slow.sort(reverse=True)
for s in slow[:12]: print("%.0f ms" % s[0], s[1:])
print(len(slow), "start-solves slower than 100 ms")
