from det import *
JD_2026 = 2461041.5
A, B = FN["earth"], FN["mercury"]
for g, day in ((0.3, 366), (0.3, 1394), (0.3, 3242), (1.0, 1046), (1.0, 1398)):
    jd = JD_2026 + day
    b = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST)
    ref = away_ref(b)
    print("==", g, day, "base T", round(b["T"], 4), "rmin", round(b["rmin_sun"], 5), "t_rmin/T", round(b["t_rmin"] / b["T"], 3), "t1/T", round(b["t1"] / b["T"], 3))
    for phi0 in (0.2, 0.05, 0.5):
        o = solve_detour(A, B, jd, g, 0.1, b, ref, phi0=phi0, verbose=False)
        print("  phi0", phi0, o["ok"], o["msg"], "it", o["iters"], "T", round(o["T"], 4), "phi deg", round(math.degrees(o["phi"]), 3), "rmin", round(o["rmin"], 5), "nF %.2e" % o["nF"], [(round(h[0], 4), round(h[1], 4)) for h in o["hist"][:8]])
    # z reference
    o = solve_detour(A, B, jd, g, 0.1, b, np.array([0, 0, 1.0]), phi0=0.2)
    print("  z-ref", o["ok"], o["msg"], "it", o["iters"], "phi", round(math.degrees(o["phi"]), 3), "T", round(o["T"], 4))
