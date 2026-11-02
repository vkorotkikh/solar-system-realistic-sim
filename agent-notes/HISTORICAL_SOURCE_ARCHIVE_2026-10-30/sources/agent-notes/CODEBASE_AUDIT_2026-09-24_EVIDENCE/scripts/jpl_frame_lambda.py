"""M-23: compare JPL-published mean longitude with Horizons, in each moon's own Laplace frame
(node measured from the reference plane's ascending node on the ICRF equator). Usage:
  python jpl_frame_lambda.py <horizons_2026-09-24.json> <src/data/moons.json>"""
import json, math, sys, numpy as np
hz = json.load(open(sys.argv[1])); raw = {m['name']: m for m in json.load(open(sys.argv[2]))}
GM = {'399': 398600.4418, '599': 126686534.0, '699': 37931187.0, '799': 5793939.0, '899': 6836529.0, '999': 870.3, '499': 42828.37}
eps = math.radians(84381.448/3600)
ecl2eq = lambda v: np.array([v[0], v[1]*math.cos(eps)-v[2]*math.sin(eps), v[1]*math.sin(eps)+v[2]*math.cos(eps)])
def osc(r, v, mu):
    rm = np.linalg.norm(r); h = np.cross(r, v); hm = np.linalg.norm(h); n = np.array([-h[1], h[0], 0.0]); nm = np.linalg.norm(n)
    ev = ((v@v-mu/rm)*r-(r@v)*v)/mu; e = np.linalg.norm(ev); i = math.degrees(math.acos(h[2]/hm))
    Om = math.degrees(math.atan2(n[1], n[0])) % 360 if nm > 1e-12 else 0.0
    nh = n/nm if nm > 1e-12 else np.array([1.0, 0, 0]); u = math.degrees(math.atan2(np.cross(nh, r)@(h/hm), nh@r)) % 360
    nu = math.degrees(math.atan2(np.cross(ev, r)@(h/hm), ev@r)) % 360 if e > 1e-9 else 0.0
    E = 2*math.atan2(math.tan(math.radians(nu)/2)*math.sqrt(1-e), math.sqrt(1+e)); M = math.degrees(E-e*math.sin(E)) % 360
    return i, (Om+(u-nu)+M) % 360
for name, o in hz['moons'].items():
    j = raw.get(name)
    if not j or j['poleRaDeg'] is None: continue
    r = [x for x in o['recs'] if x['jd'] == 2451545.0][0]
    ra, de = math.radians(j['poleRaDeg']), math.radians(j['poleDecDeg'])
    z = np.array([math.cos(de)*math.cos(ra), math.cos(de)*math.sin(ra), math.sin(de)]); x = np.cross([0, 0, 1.0], z); x /= np.linalg.norm(x); y = np.cross(z, x)
    Rm = np.vstack([x, y, z]); i, lam = osc(Rm@ecl2eq([r['x'], r['y'], r['z']]), Rm@ecl2eq([r['vx'], r['vy'], r['vz']]), GM[o['parent']])
    lj = (j['ascendingNodeDeg']+j['argPeriapsisDeg']+j['meanAnomalyDeg']) % 360
    print(f"{name:10s} i {i:7.2f}/{j['inclinationDeg']:<6} lambda H {lam:7.2f}  JPL {lj:7.2f}  d {((lam-lj+540)%360)-180:+8.2f}")
