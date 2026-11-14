"""Evidence for the agent capability proposal. Sections A-G run EXISTING repo code; section H is a scratch model."""
import json, math, re, sys, time
sys.path.insert(0, '.')
from astropy.time import Time
from data.bodies import ALL_BODIES
from trajectory import run_porkchop_scan, plan_interplanetary_route
from trajectory.contracts import PLANNING_JD_MIN, PLANNING_JD_MAX, eligible_endpoint_body_ids
from mission.propulsion import circular_parking_burn_km_s
from mission.vehicle_service import VehicleService, default_vehicle

G = 6.674e-20  # km^3 kg^-1 s^-2
BY_ID = {b["id"]: b for b in ALL_BODIES}
day = lambda jd: Time(jd, format="jd").iso[:10]
mu = lambda body_id: G * float(BY_ID[body_id]["mass_kg"])
START = 2461356.5  # 2026-11-12
AU, MU_SUN = 1.495978707e8, 1.32712440018e11

def hohmann_days(a_au):
    a = (1.0 + a_au) / 2.0 * AU
    return math.pi * math.sqrt(a ** 3 / MU_SUN) / 86400.0

def window_search(to_id, years, tof_lo, tof_hi, from_id="earth"):
    """Chunked scan under the existing 2,000-point cap. Returns (bests per chunk, solves, seconds, errors)."""
    bests, solves, errors, t0 = [], 0, [], time.perf_counter()
    span, chunk, dep_step = years * 365.25, 730.0, 10.0
    tof_step = (tof_hi - tof_lo) / 25.0
    s = START
    while s < START + span - 1:
        e = min(s + chunk, START + span)
        try:
            r = run_porkchop_scan(ALL_BODIES, from_id=from_id, to_id=to_id, departure_start_jd=s, departure_end_jd=e,
                                  departure_step_days=dep_step, tof_min_days=tof_lo, tof_max_days=tof_hi, tof_step_days=tof_step)
            solves += int(r.get("evaluatedCount") or 0)
            if r.get("best"): bests.append(r["best"])
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {str(exc)[:110]}")
        s = e
    return bests, solves, time.perf_counter() - t0, errors

print(f"E. planning range: {day(PLANNING_JD_MIN)} to {day(PLANNING_JD_MAX)}; endpoint bodies accepted today: {len(eligible_endpoint_body_ids(ALL_BODIES))}")

print("\nA. ten-year Earth->Mars window search, existing scan, chunked under the 2,000-point cap")
bests, solves, secs, errors = window_search("mars", 10, 120.0, 420.0)
print(f"   {solves} transfer solves in {secs:.2f} s ({solves / secs:.0f}/s); errors: {errors}")
for b in bests:
    dep = circular_parking_burn_km_s(b["deltaVDepartureKmS"], mu("earth"), BY_ID["earth"]["radius_km"] + 200)
    arr = circular_parking_burn_km_s(b["deltaVArrivalKmS"], mu("mars"), BY_ID["mars"]["radius_km"] + 400)
    print(f"   window: leave {day(b['departureJd'])}, arrive {day(b['arrivalJd'])}, {b['tofDays']:.0f} d | scan 'delta-v' {b['totalDeltaVKmS']:.2f} (v-inf {b['deltaVDepartureKmS']:.2f}+{b['deltaVArrivalKmS']:.2f}) | burns from 200 km Earth orbit to 400 km Mars orbit {dep:.2f}+{arr:.2f}={dep + arr:.2f} km/s")

print("\nB. best direct one-way trip from Earth within 10 years, existing scan (v-inf sums, km/s)")
jupiter_best = None
for to_id in ("mercury", "venus", "jupiter", "saturn", "uranus", "neptune", "pluto", "ceres", "psyche"):
    h = hohmann_days(float(BY_ID[to_id]["orbit"]["a_au"]))
    bests, solves, secs, errors = window_search(to_id, 10, 0.5 * h, 1.3 * h)
    if bests:
        b = min(bests, key=lambda x: x["totalDeltaVKmS"])
        if to_id == "jupiter": jupiter_best = b
        print(f"   {to_id:8s} leave {day(b['departureJd'])} arrive {day(b['arrivalJd'])} {b['tofDays']:6.0f} d  v-inf {b['deltaVDepartureKmS']:.2f}+{b['deltaVArrivalKmS']:.2f}={b['totalDeltaVKmS']:.2f}  ({solves} solves, {secs:.2f} s) {('errors: ' + errors[0]) if errors else ''}")
    else:
        print(f"   {to_id:8s} NO RESULT (Hohmann time {h:.0f} d = {h / 365.25:.1f} y): {errors[:1]}")

print("\nC. existing flyby search, Earth->Jupiter and Earth->Saturn, fixed departure date")
for to_id, jd in (("jupiter", jupiter_best["departureJd"] if jupiter_best else START), ("saturn", START)):
    for assists in (0, 1, 2):
        t = time.perf_counter()
        try:
            r = plan_interplanetary_route(ALL_BODIES, from_id="earth", to_id=to_id, departure_jd=jd, max_assists=assists)
            b = r.get("best") or {}
            seq = b.get("sequence") or [leg.get("toId") for leg in b.get("legs", [])]
            print(f"   {to_id} max_assists={assists}: {time.perf_counter() - t:.2f} s, total {b.get('totalDeltaVKmS', float('nan')):.2f} km/s, {b.get('totalTimeDays', float('nan')):.0f} d, via {seq}, alternatives {len(r.get('alternatives') or [])}, search {json.dumps({k: v for k, v in (r.get('search') or {}).items() if not isinstance(v, (dict, list))})[:160]}")
        except Exception as exc:
            print(f"   {to_id} max_assists={assists}: {time.perf_counter() - t:.2f} s ERROR {type(exc).__name__}: {str(exc)[:140]}")

print("\nD. what one scan returns besides 'best'")
r = run_porkchop_scan(ALL_BODIES, from_id="earth", to_id="mars", departure_start_jd=START, departure_end_jd=START + 730,
                      departure_step_days=10.0, tof_min_days=120.0, tof_max_days=420.0, tof_step_days=12.0)
print(f"   points kept {len(r.get('points') or [])} of {r.get('evaluatedCount')}; pareto {len(r.get('pareto') or [])} entries; retention {json.dumps(r.get('retention'))[:200]}")
for p in (r.get("pareto") or [])[:4]:
    print(f"   pareto: leave {day(p['departureJd'])} {p['tofDays']:.0f} d total {p['totalDeltaVKmS']:.2f}")

print("\nF. existing vehicle check on a one-way Earth->Mars trip (burns from A)")
res = VehicleService().evaluate_burn_budget(default_vehicle(), payload_mass_kg=6500.0, burns_km_s=[3.6, 2.1], reserve_fraction=0.05)
print("   keys:", sorted(res.keys()))
print("   feasible:", res.get("feasible"), "| total requested:", res.get("totalRequestedDeltaV_km_s"), "| shortfall/extra:", {k: v for k, v in res.items() if "short" in k.lower() or "margin" in k.lower() or "unmet" in k.lower()})

print("\nG. names: moons vs bodies the backend already knows")
moons = json.load(open("../src/data/moons.json"))
norm = lambda s: re.sub(r"\s*\(.*?\)", "", str(s)).strip().lower()
backend_names = {norm(b.get("name", b["id"])): b["id"] for b in ALL_BODIES}
clashes = sorted({m["name"] for m in moons if norm(m["name"]) in backend_names})
provisional = [m["name"] for m in moons if re.match(r"^S/\d{4}", m["name"])]
dupes = sorted({n for n in (m["name"] for m in moons) if [x["name"] for x in moons].count(n) > 1})
print(f"   {len(moons)} moons; {len(provisional)} have only a provisional designation such as {provisional[:2]}; duplicate moon names: {dupes[:5]}")
print(f"   moon names that also name a backend body: {[(c, backend_names[norm(c)]) for c in clashes]}")
print(f"   moons.json fields with a mass or GM: {[k for k in moons[0] if 'mass' in k.lower() or 'gm' in k.lower()]}")

print("\nH. SCRATCH MODEL (not repo code): two-body transfers stitched together")
MU_E, R_E, MU_M, R_M, A_M = 398600.4418, 6378.137, 4902.8, 1737.4, 384400.0
circ = lambda m, r: math.sqrt(m / r)
vis = lambda m, r, a: math.sqrt(m * (2 / r - 1 / a))
r1 = R_E + 200.0
at = (r1 + A_M) / 2
tli = vis(MU_E, r1, at) - circ(MU_E, r1)
vinf_moon = circ(MU_E, A_M) - vis(MU_E, A_M, at)
rp = R_M + 100.0
loi = math.hypot(vinf_moon, math.sqrt(2) * circ(MU_M, rp)) - circ(MU_M, rp)
print(f"   200 km Earth orbit -> 100 km lunar orbit: leave {tli:.2f} + arrive {loi:.2f} = {tli + loi:.2f} km/s, {math.pi * math.sqrt(at ** 3 / MU_E) / 86400:.1f} d")
rp_n, ra_n = 3366.0, 70000.0
nrho = math.sqrt(vinf_moon ** 2 + 2 * MU_M / rp_n) - vis(MU_M, rp_n, (rp_n + ra_n) / 2)
print(f"   200 km Earth orbit -> NRHO treated as a {rp_n:.0f} x {ra_n:.0f} km lunar ellipse: leave {tli:.2f} + arrive {nrho:.2f} = {tli + nrho:.2f} km/s")
rg = 42164.0
ag = (r1 + rg) / 2
geo = (vis(MU_E, r1, ag) - circ(MU_E, r1)) + (circ(MU_E, rg) - vis(MU_E, rg, ag))
print(f"   200 km Earth orbit -> geostationary orbit, same plane: {geo:.2f} km/s")
if jupiter_best:
    MU_J, A_EU, MU_EU, R_EU = mu("jupiter"), 671100.0, 3202.7, 1560.8
    v_rel = math.sqrt(jupiter_best["deltaVArrivalKmS"] ** 2 + 2 * MU_J / A_EU) - circ(MU_J, A_EU)
    cap = math.hypot(v_rel, math.sqrt(2) * circ(MU_EU, R_EU + 100)) - circ(MU_EU, R_EU + 100)
    dep = circular_parking_burn_km_s(jupiter_best["deltaVDepartureKmS"], mu("earth"), r1)
    print(f"   Earth -> Europa, straight in: leave Earth orbit {dep:.2f} + brake into 100 km Europa orbit {cap:.2f} = {dep + cap:.2f} km/s (arrival speed relative to Europa {v_rel:.2f})")
    loose = math.sqrt(jupiter_best["deltaVArrivalKmS"] ** 2 + 2 * MU_J / (BY_ID["jupiter"]["radius_km"] * 1.1)) - vis(MU_J, BY_ID["jupiter"]["radius_km"] * 1.1, (BY_ID["jupiter"]["radius_km"] * 1.1 + 200 * BY_ID["jupiter"]["radius_km"]) / 2)
    low = circular_parking_burn_km_s(jupiter_best["deltaVArrivalKmS"], MU_J, BY_ID["jupiter"]["radius_km"] * 1.1)
    print(f"   arriving 'at Jupiter': low circular orbit {low:.2f} km/s vs loose capture ellipse {loose:.2f} km/s")
MU_MARS, R_MARS, A_PH = mu("mars"), BY_ID["mars"]["radius_km"], 9376.0
rm = R_MARS + 400.0
ap = (rm + A_PH) / 2
print(f"   400 km Mars orbit -> Phobos: {(vis(MU_MARS, rm, ap) - circ(MU_MARS, rm)) + (circ(MU_MARS, A_PH) - vis(MU_MARS, A_PH, ap)):.2f} km/s")
