import sys, json
sys.path.insert(0, "<session-dir>/nav-lab/critique-physics")
from plab import *
from multiprocessing import Pool
a_au = {k: BY[k]["orbit"]["a_au"] for k in BY if BY[k].get("orbit") and "a_au" in BY[k]["orbit"]}
e_ = {k: BY[k]["orbit"]["e"] for k in a_au}
def floors(pair):
    a, b = pair
    small = a if a_au[a] < a_au[b] else b
    fa = 3 * g_sun_g(a_au[small]); fq = 3 * g_sun_g(a_au[small] * (1 - e_[small]))
    return small, fa, fq
def one(task):
    pair, jd, a_g, tag = task
    A, B = FN[pair[0]], FN[pair[1]]
    acc = g_to_aud2(a_g)
    try: E1 = free_space_T(A, B, jd, acc)["T"]
    except Exception: E1 = float("nan")
    roots = {}
    for name, gs in all_starts(A, B, jd, acc):
        signal.alarm(8)
        try:
            o = solve_trip(A, B, jd, a_g, guess=gs, want_path=True)
            signal.alarm(0)
            if o["ok"]:
                roots[name] = (o["T"], o["rmin_sun"], o["dv"] / 1e3)
        except TO: pass
        except Exception: signal.alarm(0)
    signal.alarm(0)
    return dict(pair=pair, jd=jd, a_g=a_g, tag=tag, E1=E1, roots=roots)
if __name__ == "__main__":
    tasks = []
    # Mercury perihelion date near 2461000..2461100
    mjd = min(np.arange(2461000, 2461100, 1.0), key=lambda j: np.linalg.norm(FN["mercury"](j)[0]))
    print("mercury perihelion-ish jd", mjd, np.linalg.norm(FN["mercury"](mjd)[0]))
    for pair in [("earth", "mars"), ("earth", "venus"), ("earth", "mercury"), ("mercury", "venus")]:
        small, fa, fq = floors(pair)
        print(pair, "smaller", small, f"floor(a)={fa:.5f} g  floor(q)={fq:.5f} g  10x(a)={10*fa:.4f}")
        dates = [2461356.5 + 45 * k for k in range(8)] + ([mjd] if "mercury" in pair else [])
        for jd in dates:
            for tag, g in (("floor_a", fa), ("floor_q", fq), ("10x_q", 10 * fq)):
                tasks.append((pair, jd, g, tag))
    t = time.perf_counter()
    with Pool(10) as p: res = p.map(one, tasks, chunksize=1)
    print("wall", time.perf_counter() - t)
    json.dump(res, open("q_floor.json", "w"))
