import sys, math
sys.path.insert(0, "<session-dir>/nav-lab/critique-physics")
import q_hop as H
from multiprocessing import Pool
def run(name, mu, R1, R2, a_g, K, mults):
    unit_r = R2; unit_t = math.sqrt(R2 ** 3 / mu); a = a_g * H.G0 * unit_t ** 2 / unit_r; r1 = R1 / R2
    d = R2 - R1; T_hand = 2 * math.sqrt(d / (a_g * H.G0)); dv_hand = 2 * math.sqrt(d * a_g * H.G0)
    v1 = math.sqrt(mu / R1); v2 = math.sqrt(mu / R2); bound = (v1 + v2) / dv_hand
    tasks = [(r1, a, K, T_hand * m / unit_t, f) for m in mults for f in (0.35, 0.5, 0.65)]
    with Pool(9) as p: out = p.map(H.solve_one, tasks)
    good = [o for o in out if o["T"] and o["cons"] is not None and o["cons"] < 1e-5]
    if good:
        Topt = min(o["T"] for o in good) * unit_t
        print(f"{name} a={a_g} g (a/g_local={a_g*H.G0/(mu/R1**2):.3f}): formula T={T_hand:,.0f} s bound={bound:.3f} | feasible shooting T={Topt:,.0f} s | formula/shooting={T_hand/Topt:.3f} ({len(good)}/{len(out)})", flush=True)
    else: print(name, a_g, "none feasible", flush=True)
if __name__ == "__main__":
    MU_J = 1.8982e27 * 6.6743e-11 / 1e9
    for g, K, mults in ((0.5, 18, (1.2, 2.0)), (0.3, 22, (1.5, 2.5))):
        run("Jupiter 1.1R -> Io", MU_J, 76902.1, 421800.0, g, K, mults)
