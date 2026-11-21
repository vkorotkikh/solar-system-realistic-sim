from common import *
from planner.places import PLACES, SUN_ORBITS, MU_SUN_KM3_S2, AU_KM
rows = []
for p in PLACES:
    if p.kind in ("moon", "orbit"): continue
    o = SUN_ORBITS[p.id]
    a, e = float(o["a_au"]), float(o["e"])
    q = a * (1 - e)
    g_a = 3 * MU_SUN_KM3_S2 / (a * AU_KM) ** 2 * 1e3 / G0   # 3x Sun gravity at a, in g
    g_q = 3 * MU_SUN_KM3_S2 / (q * AU_KM) ** 2 * 1e3 / G0
    rows.append((p.id, a, e, q, g_a, g_q))
rows.sort(key=lambda r: r[3])
print("smallest perihelia among the 40 eligible bodies (id, a, e, q, 3xSun-g at a, 3xSun-g at q):")
for r in rows[:4]: print("  %-10s a=%.3f e=%.3f q=%.3f AU  floor@a=%.4f g  floor@q=%.4f g" % r)
print("min q:", min(r[3] for r in rows), "AU; keep-out is 0.1 AU")
