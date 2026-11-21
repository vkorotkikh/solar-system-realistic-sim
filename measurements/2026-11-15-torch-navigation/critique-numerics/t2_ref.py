from det import *
JD_2026 = 2461041.5
A, B = FN["earth"], FN["mars"]
rng = np.random.default_rng(3)
for g, day in ((1.0, 1604), (0.3, 807), (1.0, 818)):
    jd = JD_2026 + day
    base = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", M=16, phi_max=0.5, ptol=1e-13, ntol=1e-11)
    ref0 = away_ref(base)
    print(f"== earth-mars {g} g day {day}: base T {base['T']:.5f} rmin {base['rmin_sun']:.4f}")
    rows = []
    for tag, ref in [("away(node)", ref0), ("+z", np.array([0, 0, 1.0])), ("-z", np.array([0, 0, -1.0])), ("-away", -ref0)] + \
                    [(f"away+{d}", (ref0 + d * w) / np.linalg.norm(ref0 + d * w)) for d in (0.05, 0.15, 0.4) for w in [rng.normal(size=3)]]:
        o = solve_detour(A, B, jd, g, 0.1, base, ref, phi0=0.1, M=16, phi_max=0.5, ptol=1e-13)
        rows.append((tag, o["ok"], (o["T"] - base["T"]) * 24 if o["ok"] else None, math.degrees(o["phi"]) if o["ok"] else None))
    print("   " + " | ".join(f"{t}: {'%.3f h phi %.1f' % (d, p) if ok else 'FAIL'}" for t, ok, d, p in rows))
