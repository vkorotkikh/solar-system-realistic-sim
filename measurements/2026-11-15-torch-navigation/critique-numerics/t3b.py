from det import *
from tr import _basis
JD_2026 = 2461041.5
def scan(pair, g, day):
    a, b = pair; A, B = FN[a], FN[b]; jd = JD_2026 + day
    base = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST)
    ref = away_ref(base)
    o = solve_detour(A, B, jd, g, 0.1, base, ref, phi0=0.05)
    ev = solve_detour(A, B, jd, g, 0.1, base, ref, return_eval=True)
    e1, e2, t1, t2, phi = o["e1"], o["e2"], o["t1"], o["t2"], o["phi"]
    print(f"== {pair} {g} g day {day}: stalled nF={o['nF']:.2e}, T={t1+t2:.4f}, t1/T={t1/(t1+t2):.4f}")
    b11, b12 = _basis(e1); b21, b22 = _basis(e2)
    Tg = t1 + t2
    def at(k, d):
        E1, E2, T1, T2, P = e1.copy(), e2.copy(), t1, t2, phi
        if k == 0: E1 = e1 + d * b11
        if k == 1: E1 = e1 + d * b12
        if k == 2: E2 = e2 + d * b21
        if k == 3: E2 = e2 + d * b22
        if k == 4: T1 = t1 + d * Tg
        if k == 5: T2 = t2 + d * Tg
        if k == 6: P = phi + d
        E1 = E1 / np.linalg.norm(E1); E2 = E2 / np.linalg.norm(E2)
        return ev(E1, E2, T1, T2, P, jac=False)
    names = ["e1.a", "e1.b", "e2.a", "e2.b", "t1", "t2", "phi"]
    for span in (1e-7, 1e-5, 1e-3):
        line = f" span {span:.0e}: "
        for k in range(7):
            ds = np.linspace(-span, span, 21)
            Fs = np.array([np.concatenate([at(k, d)[0][:6] , [at(k, d)[3]]]) for d in ds])   # 6 residuals + rmin
            worst = 0
            for c in range(7):
                co = np.polyfit(ds, Fs[:, c], 3); r = Fs[:, c] - np.polyval(co, ds); worst = max(worst, np.abs(r).max())
            line += f"{names[k]}:{worst:.1e} "
        print(line)
scan(("earth", "mercury"), 0.3, 1394)
scan(("earth", "mercury"), 0.3, 366)
scan(("earth", "mars"), 1.0, 818)
