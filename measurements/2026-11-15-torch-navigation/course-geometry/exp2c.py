"""Edge of the thrust range (0.01 g .. 10 g): does the same simple-guess Newton still work? earth->mars near the 2028 and 2030 conjunctions."""
import json, time, numpy as np
from multiprocessing import Pool
from course_reference import *

def case(args):
    g, k = args
    jd0 = JD_2026_01_01 + k
    t = time.perf_counter()
    p0, p1, Tf, _ = free_space_course("earth", "mars", jd0, g)
    out = dict(g=g, day=k, free_T=Tf, free_dmin=segment_sun_distance(p0, p1)[0])
    base = solve_torch_trip("earth", "mars", jd0, g)
    out.update(base_ok=base["converged"], base_it=base["iterations"], base_T=base["T_days"], base_rmin=base["min_sun_au"], base_res=base["residual"])
    for name, kw in (("z", dict(lateral="z")), ("away_dyn", dict(lateral="away_dynamic"))):
        if base["converged"] and base["min_sun_au"] < 0.1:
            r = solve_torch_trip("earth", "mars", jd0, g, keepout_au=0.1, **kw)
            out[name] = dict(ok=r["converged"], it=r["iterations"], dT_h=(r["T_days"] - base["T_days"]) * 24, dT_pct=(r["T_days"]/base["T_days"]-1)*100,
                             phi_deg=float(np.degrees(r["x"][6])), rmin=r["min_sun_au"], res=r["residual"])
    out["s"] = time.perf_counter() - t
    return out

if __name__ == "__main__":
    tasks = [(g, k) for g in (0.01, 0.03, 0.1, 3.0, 10.0) for k in (818, 1611)]
    with Pool(5) as p:
        res = p.map(case, tasks)
    json.dump(res, open("exp2c.json", "w"), indent=1)
    for r in res:
        print(f"{r['g']:5} g day {r['day']}: T_free {r['free_T']:.2f} d dmin_free {r['free_dmin']:.3f} | base ok={r['base_ok']} it={r['base_it']} T={r['base_T']:.3f} rmin={r['base_rmin']:.3f} res={r['base_res']:.1e}",
              {k: (v['ok'], v['it'], round(v['dT_h'], 2), round(v['dT_pct'], 2), round(v['phi_deg'], 1), round(v['rmin'], 4)) for k, v in r.items() if k in ("z", "away_dyn")}, f"{r['s']:.1f}s")
