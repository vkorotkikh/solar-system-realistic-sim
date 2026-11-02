"""Backend features are z-up (solar_physics.py:69-75); frontend sunspot code reads lat=asin(y) (sunVisuals.ts:635-636).
Compare the backend's own latitude of each active-region centre with the latitude the frontend derives."""
import json, math, sys
s = json.load(open(sys.argv[1]))
rows = []
for f in s["corona"]["features"]:
    if f["kind"] not in ("loop", "cme"): continue
    b, p = f["base_dir"], f["paired_dir"]
    c = [b[i] + p[i] for i in range(3)]; n = math.sqrt(sum(x * x for x in c)); c = [x / n for x in c]
    rows.append((math.degrees(math.asin(c[2])), math.degrees(math.asin(c[1]))))
be = [abs(r[0]) for r in rows]; fe = [abs(r[1]) for r in rows]
q = lambda a, x: sorted(a)[int(len(a) * x)]
print(f"n={len(rows)} loop/cme features")
print(f"backend |lat| (asin z): p50={q(be,.5):.1f} p95={q(be,.95):.1f} max={max(be):.1f} deg")
print(f"frontend |lat| (asin y): p50={q(fe,.5):.1f} p95={q(fe,.95):.1f} max={max(fe):.1f} deg; share above 40 deg: {sum(1 for x in fe if x > 40)/len(fe):.2f}")
