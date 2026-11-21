"""Check K-convergence: re-solve selected Earth-Moon cases with more control nodes, warm-started from the K=10 solution."""
import sys, json
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
from t5_earth_moon import *
if __name__ == "__main__":
    src, Knew = sys.argv[1], int(sys.argv[2]); wanted = [float(v) for v in sys.argv[3].split(",")]
    res = json.load(open(sys.path[0] + "/t5_earth_moon_%s.json" % src)); out = []
    with Pool(int(sys.argv[4]) if len(sys.argv) > 4 else 12) as pool:
        for r in res:
            if r["a_g"] not in wanted: continue
            z, K = np.array(r["z"]), r["K"]; T, p = r["T"], z[2]
            ok1, ok2 = knots(T, p, K); nk1, nk2 = knots(T, p, Knew)
            zn = np.concatenate([z[:3], np.interp(nk1, ok1, z[3:4 + K]), np.interp(nk2, ok2, z[4 + K:])])
            zn, info = solve(r["a_g"], zn, Knew, pool)
            info["z"] = zn.tolist(); out.append(info)
            print("   K=%d -> K=%d: T %.2f -> %.2f s (%.4f%%)" % (K, Knew, r["T"], info["T"], 100 * (info["T"] / r["T"] - 1)), flush=True)
            json.dump(out, open(sys.path[0] + "/t5_earth_moon_%s_K%d.json" % (src, Knew), "w"))
