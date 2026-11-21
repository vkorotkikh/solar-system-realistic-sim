from common import *
import json, math
import planner.trips as T
# realistic rows: straight Earth->Mars 3.3 day course, 181 rows evenly spaced in time
jd0, days = 2461356.5, 3.3107
t = np.linspace(jd0, jd0 + days, 181)
p0, p1 = pos("earth", jd0), pos("mars", jd0 + days)
s = ((t - jd0) / days)[:, None]
xyz = p0 + s * (p1 - p0)
for dec in (4, 5, 6, 7):
    rows = [[round(float(a), 4)] + [round(float(v), dec) for v in r] for a, r in zip(t, xyz)]
    b = len(json.dumps(rows, separators=(",", ":")))
    b2 = len(json.dumps(rows))
    # worst-case rounding error relative to extent (max coordinate span)
    ext = float(np.linalg.norm(p1 - p0))
    err = math.sqrt(3) * 0.5 * 10 ** (-dec)
    print(f"xyz {dec} decimals: {b/1024:.1f} kB compact, {b2/1024:.1f} kB default json; max rounding error {err:.1e} AU = {err/ext:.1e} of the {ext:.2f} AU extent (design tolerance 2e-5)")
leg_extra = 8.5
print()
for name, legs in (("one-way torch search, 2 trips", 2), ("round-trip torch search, 2 round trips", 4), ("6-trip plan, one-way, 2 trips each", 12), ("6-trip plan, round trips, 2 each", 24)):
    print(f"{name}: {legs} legs x ~8.5 kB path = {legs*8.5:.0f} kB (today's 3-trip rocket search is 2.8 kB; today's 6-trip plan is 17 kB)")
