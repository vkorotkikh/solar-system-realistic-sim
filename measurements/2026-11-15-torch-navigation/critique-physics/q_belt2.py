import sys, numpy as np
sys.path.insert(0, "<session-dir>/nav-lab/belt-data")
import belts_reference as B
cat = B.load_catalog()
a, e = cat["a_au"], cat["e"]; q, Q = a * (1 - e), a * (1 + e)
lo, hi = 2.06, 3.28
def r_at(jd):
    M = np.radians(cat["M_deg"]) + 2 * np.pi * (jd - cat["epoch_jd"]) / cat["period_d"]
    M = np.mod(M, 2 * np.pi); E = M.copy()
    for _ in range(60): E = E - (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
    return a * (1 - e * np.cos(E))
for jd in (cat["epoch_jd"][0], cat["epoch_jd"][0] + 1000, 2461000.5, 2461356.5):
    r = r_at(jd)
    print(f"jd {jd:.1f}: distance <{lo}: {100*np.mean(r<lo):.1f}%   >{hi}: {100*np.mean(r>hi):.1f}%   outside total {100*np.mean((r<lo)|(r>hi)):.1f}%   r pct 1/5/50/95/99 = {np.percentile(r,[1,5,50,95,99]).round(2)}   r<1.7 (Mars-orbit reach): {np.sum(r<1.7)}  r<2.0: {np.sum(r<2.0)}  r>3.5: {np.sum(r>3.5)}")
print("min q", q.min().round(3), " n q<1.666 (inside Mars aphelion):", int(np.sum(q < 1.666)), " n q<2.06:", int(np.sum(q < lo)), " n Q>3.28:", int(np.sum(Q > hi)), " max Q", Q.max().round(2))
print("epoch spread of catalog:", np.unique(cat["epoch_jd"])[:5])
