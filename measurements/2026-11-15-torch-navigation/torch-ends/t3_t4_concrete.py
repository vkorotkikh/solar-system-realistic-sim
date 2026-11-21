"""Tasks 3 and 4: elliptical-orbit escape (from periapsis) and concrete values for named places."""
import sys, math, json, time
sys.path.insert(0, "<session-dir>/wt-c1/backend")
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
from data.bodies import ALL_BODIES
from ends_reference import escape_cost, G0_KM_S2, _escape_nd
BY = {b["id"]: b for b in ALL_BODIES}
G = 6.67430e-11
moon_gm = json.load(open("<session-dir>/wt-c1/backend/data/moon_gm.json"))["bodies"]["301"]["gmKm3S2"]
mu = {k: BY[k]["mass_kg"] * G * 1e-9 for k in ("earth", "mars", "jupiter", "ceres")}   # km^3/s^2
mu["moon"] = moon_gm
R = {k: BY[k]["radius_km"] for k in ("earth", "mars", "jupiter", "ceres")}
R["moon"] = 1737.4   # src/data/moonPhysicalRadii.json (planner's source, via places.PLACES)
cases = [
    ("Earth 200 km circ", mu["earth"], R["earth"] + 200, R["earth"] + 200),
    ("Mars 400 km circ", mu["mars"], R["mars"] + 400, R["mars"] + 400),
    ("Moon 100 km circ", mu["moon"], R["moon"] + 100, R["moon"] + 100),
    ("Jupiter 1.1 R circ", mu["jupiter"], 1.1 * R["jupiter"], 1.1 * R["jupiter"]),
    ("Jupiter 1.1-200 R ellipse", mu["jupiter"], 1.1 * R["jupiter"], 200 * R["jupiter"]),
    ("Ceres 100 km circ", mu["ceres"], R["ceres"] + 100, R["ceres"] + 100),
]
GS = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0]
if __name__ == "__main__":
    print("mu km3/s2:", {k: round(v, 4) for k, v in mu.items()})
    print("%-26s %7s %8s %9s | %s" % ("case", "g0 m/s2", "vc km/s", "dv_imp", "per a (g): dv km/s, t s   [a/g0]"))
    out = []
    for name, m, rp, ra in cases:
        g0 = m / rp ** 2 * 1e3          # m/s^2
        vp = math.sqrt(m * (2 / rp - 2 / (rp + ra)))
        imp = math.sqrt(2 * m / rp) - vp
        row = {"case": name, "mu": m, "rp": rp, "ra": ra, "g0_m_s2": g0, "vp": vp, "dv_impulsive": imp, "by_g": {}}
        line = []
        for g in GS:
            dv, t = escape_cost(m, rp, ra, g * G0_KM_S2)
            row["by_g"][g] = (dv, t)
            line.append("%g g: %.3f km/s %s [%.3g]" % (g, dv, ("%.0f s" % t) if t < 1e5 else ("%.2f d" % (t / 86400)), g * 9.80665 / g0))
        print("%-26s %7.3f %8.3f %9.4f | %s" % (name, g0, vp, imp, "; ".join(line)))
        out.append(row)
    json.dump(out, open(sys.path[0] + "/t4_concrete.json", "w"), indent=1)

    # Task 3: eccentricity sweep from periapsis, dv relative to the impulsive periapsis burn
    print("\nTask 3: ellipse from periapsis, thrust along velocity until E=0. dv / dv_impulsive (impulsive = sqrt(2)vc(rp) - vp)")
    ratios = [1.0, 1.1, 1.5, 2.0, 5.0, 20.0, 181.8, 1000.0]
    xs = [0.01, 0.1, 0.3, 1.0, 3.0, 10.0, 100.0]
    print("ra/rp  e       dv_imp/vc  |  " + "  ".join("a/g0=%-7g" % x for x in xs))
    for ra in ratios:
        vp = math.sqrt(2 - 2 / (1 + ra)); imp = math.sqrt(2) - vp
        cells = []
        for x in xs:
            t, y = _escape_nd(x, ra)
            cells.append("%.3f(%.2f)" % (x * t / imp, t / (2 * math.pi * (0.5 * (1 + ra)) ** 1.5)))
        print("%-6g %-7.4f %-10.4f |  %s" % (ra, (ra - 1) / (ra + 1), imp, "  ".join(cells)))
    print("(cell = dv/dv_impulsive (elapsed burn time / orbital period))")
    # timing of one call, best of three
    for name, m, rp, ra in (cases[0], cases[4]):
        for g in (0.01, 0.1, 1.0, 10.0):
            best = min((lambda t0: (escape_cost(m, rp, ra, g * G0_KM_S2), time.perf_counter() - t0)[1])(time.perf_counter()) for _ in range(3))
            print("timing %-26s %5g g: %.1f ms (best of 3)" % (name, g, best * 1e3))
