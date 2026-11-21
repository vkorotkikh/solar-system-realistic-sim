from common import *
from planner.places import PLACES
C_KMS = 299_792.458
jd = 2461356.5
rows = []
for p in PLACES:
    if p.kind in ("moon", "orbit"): continue
    if p.id == "earth": continue
    for g in (1.0, 20.0):
        T = free_T("earth", p.id, jd, g)          # days
        a = g * G0
        dv = a * T * 86400 / 1000                  # km/s, thrust x time
        vpk = dv / 2
        rows.append((p.id, g, T, dv, vpk / C_KMS))
for g in (1.0, 20.0):
    sub = sorted([r for r in rows if r[1] == g], key=lambda r: -r[4])[:6]
    print(f"--- g={g}: highest peak speed over c, Earth to body, 2026-11-12")
    for r in sub: print(f"  {r[0]:<18} T={r[2]:9.2f} d  total dv={r[3]:12.0f} km/s  peak={100*r[4]:6.1f}% c")
    over = [r for r in rows if r[1] == g and r[4] > 0.03]
    over10 = [r for r in rows if r[1] == g and r[4] > 0.10]
    over_c = [r for r in rows if r[1] == g and r[3] > C_KMS]
    print(f"  bodies over 3% c: {len(over)}; over 10% c: {len(over10)}; total delta-v above c: {[r[0] for r in over_c]}")
print("eligible sun bodies:", sum(1 for p in PLACES if p.kind not in ("moon","orbit")))
