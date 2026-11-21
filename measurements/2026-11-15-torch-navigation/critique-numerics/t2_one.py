from det import *
import sys
JD_2026 = 2461041.5
for g, day in ((1.0, 818), (0.3, 818), (1.0, 0)):
    jd = JD_2026 + day
    A, B = FN["earth"], FN["mars"]
    b = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST)
    print("base", g, day, b["ok"], b["iters"], "T", b["T"], "rmin", b["rmin_sun"])
    ref = away_ref(b)
    for phi0 in (0.05, 0.2):
        o = solve_detour(A, B, jd, g, 0.1, b, ref, phi0=phi0, verbose=False)
        print("  phi0", phi0, o["ok"], o["msg"], "it", o["iters"], "nfev", o["nfev"], f"{o['ms']:.0f} ms", "T", o["T"], "dT_h", (o["T"] - b["T"]) * 24, "phi", math.degrees(o["phi"]), "rmin", o["rmin"])
        if o["ok"]:
            print("   dop", detour_dop(o, A, B, jd, g))
