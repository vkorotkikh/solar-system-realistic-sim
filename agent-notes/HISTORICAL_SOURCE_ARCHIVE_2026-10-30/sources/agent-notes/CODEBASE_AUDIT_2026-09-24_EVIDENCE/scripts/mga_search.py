"""M-4 and flyby physics: 144 plans; recompute each returned flyby's v-infinity. Run from backend/."""
import sys, math, collections; sys.path.insert(0, '.')
from data.bodies import ALL_BODIES
from trajectory.planner import plan_interplanetary_route
from mission.ephemeris_service import EphemerisService
AU = 149597870.7; DAY = 86400; eph = EphemerisService(ALL_BODIES, provider="kepler"); S = collections.Counter(); alt = [0, 0]
for to in ("mars", "jupiter", "saturn", "uranus", "neptune", "venus"):
    for dep in [2461307.5+k*120 for k in range(12)]:
        for ma in (1, 2):
            r = plan_interplanetary_route(ALL_BODIES, from_id="earth", to_id=to, departure_jd=dep, objective="max_assist",
                                          max_assists=ma, assist_pool=None, ephemeris_provider="kepler", prograde=True)
            b = r.get("best") or {}; a = b.get("assists") or []; S[(to, ma, len(a))] += 1
            for x in r.get("alternatives") or []: alt[0] += 1; alt[1] += bool(x.get("assists"))
            legs = b.get("legs") or []
            for k, fb in enumerate(a):
                body = fb.get("bodyId") or fb.get("body"); lin, lout = legs[k], legs[k+1]
                pv = eph.sample_state(body, lin["departureJd"]+lin["tofDays"]).velocity_au_day
                vi = math.hypot(*[lin["arrivalVelocityApprox"][i]-pv[i] for i in range(3)])*AU/DAY
                vo = math.hypot(*[lout["departureVelocityApprox"][i]-pv[i] for i in range(3)])*AU/DAY
                print(f"flyby {to} via {body}: vinf in {vi:.4f} out {vo:.4f} mismatch {abs(vi-vo)*1000:.4f} m/s (reported {fb.get('vInfMismatchKmS')})")
for k, v in sorted(S.items()): print(k, v)
print("alternatives", alt[0], "with assist", alt[1])
