from det import *
JD_2026 = 2461041.5
A, B = FN["earth"], FN["mercury"]; g, day = 0.3, 1394; jd = JD_2026 + day
base = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST)
ref = away_ref(base)
o = solve_detour(A, B, jd, g, 0.1, base, ref, phi0=0.05)
ev = solve_detour(A, B, jd, g, 0.1, base, ref, return_eval=True)
e1, e2, t1, t2, phi = o["e1"], o["e2"], o["t1"], o["t2"], o["phi"]
ds = np.linspace(-1e-6, 1e-6, 41)
Fs = np.array([np.concatenate([ev(e1, e2, t1, t2, phi + d, jac=False)[0]]) for d in ds])
for c in range(7):
    co = np.polyfit(ds, Fs[:, c], 3); r = Fs[:, c] - np.polyval(co, ds)
    print("component", c, "noise %.2e" % np.abs(r).max(), "range %.2e" % np.ptp(Fs[:, c]))
# print the sequence of the noisy component to see jumps vs jitter
c = int(np.argmax([np.abs(Fs[:, k] - np.polyval(np.polyfit(ds, Fs[:, k], 3), ds)).max() for k in range(7)]))
r = Fs[:, c] - np.polyval(np.polyfit(ds, Fs[:, c], 3), ds)
print("noisy component", c, "residuals:", np.round(r * 1e7, 2))
# does it depend on collocation settings?  strict settings
for kw in (dict(M=12, phi_max=1.0, ptol=1e-11), dict(M=16, phi_max=0.5, ptol=1e-13), dict(M=16, phi_max=0.5, ptol=1e-13, passes=5)):
    ev2 = solve_detour(A, B, jd, g, 0.1, base, ref, return_eval=True, **{k: v for k, v in kw.items() if k != 'passes'})
    Fs = np.array([ev2(e1, e2, t1, t2, phi + d, jac=False)[0] for d in ds])
    worst = [np.abs(Fs[:, k] - np.polyval(np.polyfit(ds, Fs[:, k], 3), ds)).max() for k in range(7)]
    print(kw, "noise per component", ["%.1e" % w for w in worst])
