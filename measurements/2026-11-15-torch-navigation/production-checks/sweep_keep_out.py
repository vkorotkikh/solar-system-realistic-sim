"""Sweep of the production torch solver with the 0.1 AU keep-out on.

Questions: on blocked days, does the detour converge; what does it cost in time; does an independent
integrator agree that the course clears the Sun and arrives? And across every pair of the catalog's
Sun-orbiting bodies, is there any day with no trip, and is the fallback start ever used?
Run: python -B sweep_keep_out.py <backend dir>
"""
import json, math, sys, time
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import minimize_scalar
sys.path.insert(0, sys.argv[1])
from planner import torch
from planner.places import PLACES

JD0 = 2461041.5
fallbacks = [0]
straight = torch._straight_at_target
def counted(*args):
    fallbacks[0] += 1
    return straight(*args)
torch._straight_at_target = counted

def reintegrate(trip, start):
    acc = trip.acceleration_g * torch.G_AU_DAY2
    t1, t2 = trip.burn_days
    total = t1 + t2
    tilted = (0.0, 0.0, 0.0, 0.0)
    if trip.tilt_rad:
        begin, end = trip.tilt_window
        tilted = tuple(total * mark for mark in (begin, begin + (end - begin) / 4, end - (end - begin) / 4, end))
    cuts = sorted({0.0, t1, total, *tilted})
    y = np.concatenate(start(trip.depart_jd))
    closest = math.inf
    for lo, hi in zip(cuts[:-1], cuts[1:]):
        middle = 0.5 * (lo + hi)
        thrust = trip.directions[0] if middle < t1 else trip.directions[1]
        if tilted[0] < middle < tilted[3]:
            across = trip.tilt_toward - np.dot(trip.tilt_toward, thrust) * thrust
            sign = 1.0 if middle < tilted[1] or middle > tilted[2] else -1.0
            thrust = math.cos(trip.tilt_rad) * thrust + sign * math.sin(trip.tilt_rad) * across / np.linalg.norm(across)
        def rhs(_, y, thrust=thrust):
            return np.concatenate([y[3:], -torch.MU_SUN * y[:3] / np.linalg.norm(y[:3]) ** 3 + acc * thrust])
        flown = solve_ivp(rhs, (0.0, hi - lo), y, method="DOP853", rtol=1e-12, atol=1e-14, dense_output=True)
        def distance(t, flown=flown):
            return np.linalg.norm(flown.sol(t)[:3], axis=0)
        times = np.linspace(0.0, hi - lo, 2001)
        nearest = int(distance(times).argmin())
        bracket = times[max(nearest - 1, 0)], times[min(nearest + 1, 2000)]
        closest = min(closest, minimize_scalar(distance, bounds=bracket, method="bounded", options={"xatol": 1e-12}).fun)
        y = flown.y[:, -1]
    return y, closest

out = {}
print("== daily, one synodic period or more ==", flush=True)
for origin, target, days in (("earth", "mars", 780), ("earth", "mercury", 730), ("earth", "venus", 584), ("earth", "jupiter", 399)):
    A, B = torch.body_state(origin), torch.body_state(target)
    for g in (0.1, 0.3, 1.0, 3.0, 12.0):
        blocked, no_trip, ms, extra, worst_km, worst_ms, least, tilt = 0, [], [], [], 0.0, 0.0, math.inf, []
        for day in range(days):
            jd = JD0 + day
            free = torch.solve(origin, target, jd, g, keep_out_au=0.0)
            if free.closest_sun_au >= torch.KEEP_OUT_AU:
                continue
            blocked += 1
            started = time.perf_counter()
            try:
                trip = torch.solve(origin, target, jd, g)
            except torch.NoTrip:
                no_trip.append(day)
                continue
            ms.append((time.perf_counter() - started) * 1e3)
            extra.append(trip.days / free.days - 1.0)
            tilt.append(trip.tilt_rad)
            y, closest = reintegrate(trip, A)
            rB, vB = B(trip.arrive_jd)
            worst_km = max(worst_km, float(np.linalg.norm(y[:3] - rB) * torch.AU_KM))
            worst_ms = max(worst_ms, float(np.linalg.norm(y[3:] - vB) * torch.KM_S * 1e3))
            least = min(least, closest)
        key = f"{origin}-{target} {g} g"
        out[key] = dict(days=days, blocked=blocked, no_trip=no_trip, ms_median=float(np.median(ms)) if ms else None,
                        ms_max=max(ms, default=None), extra_max=max(extra, default=None), extra_mean=float(np.mean(extra)) if extra else None,
                        worst_km=worst_km, worst_m_s=worst_ms, least_closest=least, tilt_min=min(tilt, default=None), tilt_max=max(tilt, default=None))
        row = out[key]
        print(f"{key:24s} blocked {blocked:3d}/{days}  no trip {len(no_trip):2d}  "
              + (f"ms median {row['ms_median']:.1f} max {row['ms_max']:.1f}  extra time mean {100 * row['extra_mean']:.3f}% max {100 * row['extra_max']:.3f}%  "
                 f"DOP853 worst {worst_km:.2f} km {worst_ms:.4f} m/s  closest {least:.7f} AU  tilt {row['tilt_min']:+.3f}..{row['tilt_max']:+.3f} rad" if ms else ""), flush=True)

print("== every ordered pair of Sun-orbiting catalog places ==", flush=True)
ids = [place.id for place in PLACES if place.around == "sun" and place.body == ""]
print(len(ids), "bodies", flush=True)
solved = detours = 0
slowest = pair_km = pair_m_s = 0.0
pair_least = math.inf
no_trip, slow = [], []
started_all = time.perf_counter()
for g in (0.1, 1.0, 12.0):
    for jd in (JD0 + 77.0, JD0 + 2903.0):
        for origin in ids:
            for target in ids:
                if origin == target:
                    continue
                started = time.perf_counter()
                try:
                    trip = torch.solve(origin, target, jd, g)
                except torch.NoTrip as error:
                    no_trip.append((origin, target, g, jd, str(error)))
                    continue
                ms = (time.perf_counter() - started) * 1e3
                solved += 1
                detours += bool(trip.tilt_rad)
                slowest = max(slowest, ms)
                if trip.tilt_rad:
                    y, closest = reintegrate(trip, torch.body_state(origin))
                    rB, vB = torch.body_state(target)(trip.arrive_jd)
                    pair_km = max(pair_km, float(np.linalg.norm(y[:3] - rB) * torch.AU_KM))
                    pair_m_s = max(pair_m_s, float(np.linalg.norm(y[3:] - vB) * torch.KM_S * 1e3))
                    pair_least = min(pair_least, closest)
                if ms > 60.0:
                    slow.append((origin, target, g, jd, round(ms, 1)))
print(f"solved {solved}  detours {detours}  no trip {len(no_trip)}  fallback starts used {fallbacks[0]}  slower than 60 ms: {len(slow)}  "
      f"total {time.perf_counter() - started_all:.1f} s", flush=True)
print(f"detoured trips against DOP853: worst {pair_km:.2f} km {pair_m_s:.4f} m/s, closest approach {pair_least:.7f} AU; slowest solve {slowest:.1f} ms", flush=True)
for row in no_trip[:40]:
    print("NO TRIP", row)
for row in slow[:20]:
    print("SLOW", row)
out["all_pairs"] = dict(bodies=ids, solved=solved, detours=detours, no_trip=no_trip, slow=slow, fallbacks=fallbacks[0])
json.dump(out, open(sys.argv[0].replace(".py", ".json"), "w"))
