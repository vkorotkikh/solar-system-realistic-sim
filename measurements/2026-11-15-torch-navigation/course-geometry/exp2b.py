"""Follow-ups: (a) iteration histogram and undamped-Newton success for the baseline 6-unknown solve; (b) how much of the
free-space vs dynamic closest-approach gap is the planet's own velocity and how much is the Sun's gravity."""
import json, numpy as np
from multiprocessing import Pool
import course_reference as cr
from course_reference import *

def base_undamped(args):
    k, g = args
    prob = TorchProblem("earth", "mars", JD_2026_01_01 + k, g)
    x, ok, it, res = newton(prob.residual, prob.simple_guess(), damped=False)
    xd, okd, itd, _ = newton(prob.residual, prob.simple_guess(), damped=True)
    return dict(k=k, g=g, ok_undamped=bool(ok), it_undamped=it, ok_damped=bool(okd), it_damped=itd)

def attribution(args):
    k, g = args
    jd0 = JD_2026_01_01 + k
    p0, p1, Tf, _ = free_space_course("earth", "mars", jd0, g)
    free = segment_sun_distance(p0, p1)[0]
    full = solve_torch_trip("earth", "mars", jd0, g)
    return dict(k=k, g=g, free=free, full=full["min_sun_au"], T_full=full["T_days"], T_free=Tf)

def attribution_nograv(args):
    k, g = args
    cr.MU = 1e-30   # the integrator reads the module global at call time
    jd0 = JD_2026_01_01 + k
    r = solve_torch_trip("earth", "mars", jd0, g)
    return dict(k=k, g=g, nograv=r["min_sun_au"], T_nograv=r["T_days"], ok=r["converged"])

if __name__ == "__main__":
    days = [(k, g) for g in (1.0, 0.3) for k in list(range(0, 36)) + list(range(790, 845)) + list(range(1585, 1630))]
    with Pool(6) as p:
        res = p.map(base_undamped, days, chunksize=4)
        a1 = p.map(attribution, [(k, g) for (k, g) in days if k in (10, 20, 800, 818, 830, 1600, 1611)])
        a2 = p.map(attribution_nograv, [(k, g) for (k, g) in days if k in (10, 20, 800, 818, 830, 1600, 1611)])
    json.dump(dict(base=res, attr_full=a1, attr_nograv=a2), open("exp2b.json", "w"))
    for g in (1.0, 0.3):
        r = [x for x in res if x["g"] == g]
        print(g, "g:", len(r), "days; undamped Newton converged", sum(x["ok_undamped"] for x in r), "iterations (converged) median", np.median([x["it_undamped"] for x in r if x["ok_undamped"]]), "max", max(x["it_undamped"] for x in r if x["ok_undamped"]),
              "| damped converged", sum(x["ok_damped"] for x in r), "median", np.median([x["it_damped"] for x in r]), "max", max(x["it_damped"] for x in r), "n>10:", sum(x["it_damped"] > 10 for x in r))
    for g in (1.0, 0.3):
        for f, n in zip([x for x in a1 if x["g"] == g], [x for x in a2 if x["g"] == g]):
            print(g, "day", f["k"], f"free-space {f['free']:.4f}  full(grav+planet velocity) {f['full']:.4f}  planet velocity only (mu=0) {n['nograv']:.4f}  ok={n['ok']}")
