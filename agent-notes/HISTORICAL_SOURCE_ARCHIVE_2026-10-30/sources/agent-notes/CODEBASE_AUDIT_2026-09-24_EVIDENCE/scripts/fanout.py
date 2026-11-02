"""H-3: count ephemeris samples per /trajectory/plan request. Run from backend/."""
import sys; sys.path.insert(0, '.')
from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService
from trajectory.planner import plan_interplanetary_route
n = [0]; o = EphemerisService._sample_kepler
EphemerisService._sample_kepler = lambda s, b, j: (n.__setitem__(0, n[0]+1), o(s, b, j))[1]
for ma in (0, 1, 2, 3):
    n[0] = 0
    plan_interplanetary_route(ALL_BODIES, from_id='earth', to_id='jupiter', departure_jd=2461307.5, objective='min_distance',
                              max_assists=ma, assist_pool=None, ephemeris_provider='kepler', prograde=True)
    print(f"max_assists={ma}: {n[0]} samples (each = 1 Horizons HTTPS call with the default provider)")
