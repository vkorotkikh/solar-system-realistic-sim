import signal, sys, time, json
from lab import *
from lowlimit import sun_g, revs
class TO(Exception): pass
def handler(s, f): raise TO()
signal.signal(signal.SIGALRM, handler)
jd = 2461356.5
accs = [0.01, 0.005, 0.003, 0.002, 0.001, 0.0006, 0.0004, 0.0003, 0.0002, 0.0001]
out = []
print("pair | a (g) | a/g_sun(r_small) | ok (starts tried) | T d | E1 d | T/E1-1 % | Sun revolutions | T/period(r_small) | rmin AU | DOP853 err km | wall s")
for a, b in [("earth", "mars"), ("earth", "venus"), ("earth", "mercury"), ("earth", "jupiter")]:
    A, B = FN[a], FN[b]
    rs = min(np.linalg.norm(A(jd)[0]), np.linalg.norm(B(jd)[0]))
    P = 2 * math.pi * math.sqrt(rs ** 3 / MU)
    for g in accs:
        acc = g_to_aud2(g)
        k = g * G0 / sun_g(rs)
        starts = [better_guess(A, B, jd, acc), naive_guess(A, B, jd, acc)] + rescue_guesses(A, B, jd, acc)
        t0 = time.perf_counter(); res = None; tried = 0
        for gs in starts:
            tried += 1
            signal.alarm(12)
            try:
                o = solve_trip(A, B, jd, g, guess=gs, want_path=True)
                signal.alarm(0)
            except TO:
                o = dict(ok=False, msg="timeout")
            except Exception as ex:
                signal.alarm(0); o = dict(ok=False, msg=str(ex)[:40])
            if o["ok"]:
                res = o; break
        wall = time.perf_counter() - t0
        try:
            E1 = free_space_T(A, B, jd, acc)["T"]
        except Exception:
            E1 = float("nan")
        if res:
            try:
                er = reintegrate(res, A, B, jd, g)[0]
            except Exception:
                er = float("nan")
            print(f"{a}-{b} | {g:g} | {k:7.2f} | yes ({tried}) | {res['T']:.2f} | {E1:.2f} | {(res['T']/E1-1)*100:+.1f} | {revs(res['path']):.3f} | {res['T']/P:.3f} | {res['rmin_sun']:.3f} | {er:.2g} | {wall:.1f}", flush=True)
        else:
            print(f"{a}-{b} | {g:g} | {k:7.2f} | NO ({tried} starts) | - | {E1:.2f} | - | - | - | - | - | {wall:.1f}   last: {o.get('msg')}", flush=True)
