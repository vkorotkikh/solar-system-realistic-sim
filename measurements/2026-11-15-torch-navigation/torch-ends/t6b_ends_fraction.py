"""How big are the ends against the Sun-centred leg for planner-scale pairs? Sun-leg dv = 2 sqrt(a L) at the closest circular-orbit separation
L = |a1 - a2| (measured: Earth-Mars Sun-only optimum equals this to 0.005% for a >= 0.1 g, t6_earth_mars). Ends from ends_reference, planner default orbits."""
import sys, math
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
sys.path.insert(0, "<session-dir>/wt-c1/backend")
from planner import places
from data.bodies import ALL_BODIES
from ends_reference import escape_cost, G0_KM_S2
AU = 149_597_870.7
P = {p.id: p for p in places.PLACES}
A = {b["id"]: b["orbit"]["a_au"] for b in ALL_BODIES if b.get("orbit") and "a_au" in b["orbit"]}
def end(pid, a):
    o = P[pid].default_orbit
    dv, t = escape_cost(P[pid].mu_km3_s2, o.periapsis_km, o.apoapsis_km, a)
    vp = math.sqrt(P[pid].mu_km3_s2 * (2 / o.periapsis_km - 2 / (o.periapsis_km + o.apoapsis_km)))
    return dv, vp
pairs = [("earth", "venus"), ("earth", "mars"), ("mars", "ceres"), ("earth", "ceres"), ("earth", "jupiter"), ("jupiter", "saturn"), ("saturn", "neptune"), ("mercury", "venus")]
print("pair | L=|a1-a2| AU | a(g): sun-leg dv km/s ; ends (esc+cap) km/s = % of sun leg ; vA+vB km/s ; model errors vs truth: patched <= (ends + 0.58 (vA+vB))/dv, sun-only <= 0.58 (vA+vB)/dv")
for x, y in pairs:
    L = abs(A[x] - A[y]) * AU
    for g in (0.1, 1.0):
        a = g * G0_KM_S2
        dv = 2 * math.sqrt(a * L * 1e3) * 1e-3 * 1.0  # a km/s^2 * L km -> km^2/s^2 ; sqrt -> km/s
        dv = 2 * math.sqrt(a * L)
        e1, v1 = end(x, a); e2, v2 = end(y, a)
        print("%-8s-%-8s | %.3f | %.1f g: sun %.1f ; ends %.2f = %.2f%% ; vA+vB %.1f ; patched<=%.2f%% sun-only<=%.2f%%" % (
            x, y, L / AU, g, dv, e1 + e2, 100 * (e1 + e2) / dv, v1 + v2, 100 * (e1 + e2 + 0.58 * (v1 + v2)) / dv, 100 * 0.58 * (v1 + v2) / dv))
