"""Task 3: is rmin(parameters) smooth enough for Newton?  Probe the single-row evaluation (no Jacobian rows)."""
from det import *
JD_2026 = 2461041.5
def probe(pair, g, day, label):
    a, b = pair
    A, B = FN[a], FN[b]
    jd = JD_2026 + day
    base = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST)
    ref = away_ref(base)
    o = solve_detour(A, B, jd, g, 0.1, base, ref, phi0=0.05)
    sol = o if o["ok"] else dict(e1=base["e1"], e2=base["e2"], t1=base["t1"], t2=base["t2"], phi=o["phi"])
    ev = solve_detour(A, B, jd, g, 0.1, base, ref, return_eval=True)
    e1, e2, t1, t2, phi = sol["e1"], sol["e2"], sol["t1"], sol["t2"], sol["phi"]
    print(f"== {label}: {pair} {g} g day {day}  detour ok={o['ok']} phi={math.degrees(phi):.3f} deg")
    # (a) micro scan of phi: rmin vs phi at 1e-9 spacing -> noise relative to the local linear trend
    for span, name in ((2e-7, "2e-7"), (2e-5, "2e-5"), (2e-3, "2e-3")):
        ph = phi + np.linspace(-span, span, 41)
        rm = np.array([ev(e1, e2, t1, t2, p, jac=False)[3] for p in ph])
        c = np.polyfit(ph - phi, rm, 2)
        res = rm - np.polyval(c, ph - phi)
        print(f"   phi scan +-{name}: slope {c[1]:+.4f} AU/rad, curvature {2*c[0]:+.3f}, residual of quadratic fit max {np.abs(res).max():.2e} AU")
    # (b) which segment owns the minimum as phi sweeps, and kinks: second difference across a wide sweep
    ph = np.linspace(0.0, math.radians(25), 251)
    rm = []; own = []
    for p in ph:
        F, J, rec, r_ = ev(e1, e2, t1, t2, p, jac=False)
        rm.append(r_)
    rm = np.array(rm)
    d2 = np.diff(rm, 2) / (ph[1] - ph[0]) ** 2
    big = np.where(np.abs(d2) > 20 * np.median(np.abs(d2)) + 1)[0]
    print(f"   wide sweep phi 0..25deg: rmin {rm.min():.4f}..{rm.max():.4f}; max |d2 rmin/dphi2| {np.abs(d2).max():.2f}, median {np.median(np.abs(d2)):.3f}; spikes at phi(deg) {[round(math.degrees(ph[i+1]),2) for i in big[:6]]}")
    # (c) FD derivative of rmin wrt phi at different steps -> shows Jacobian-column noise
    outs = []
    for h in (1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4):
        d = (ev(e1, e2, t1, t2, phi + h, jac=False)[3] - ev(e1, e2, t1, t2, phi, jac=False)[3]) / h
        outs.append((h, round(float(d), 6)))
    print("   d rmin/d phi by step:", outs)
    return ev, sol
if __name__ == "__main__":
    probe(("earth", "mars"), 1.0, 818, "good case")
    probe(("earth", "mercury"), 0.3, 1394, "failing case")
    probe(("earth", "mercury"), 0.3, 366, "failing case (barely blocked)")
