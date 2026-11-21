import sys, numpy as np
sys.path.insert(0, "<session-dir>/nav-lab/belt-data")
import belts_reference as B
cat = B.load_catalog()
print("fields", list(cat.keys()), "n", len(cat["id"]))
a = cat["a"] if "a" in cat else cat["a_au"]
e = cat["e"]
print("a range", a.min(), a.max(), "e median/p90/max", np.median(e), np.percentile(e, 90), e.max())
lo, hi = 2.06, 3.28
q = a * (1 - e); Q = a * (1 + e)
print(f"by semi-major axis: inside [{lo},{hi}]: {100*np.mean((a>=lo)&(a<=hi)):.1f}%  below {100*np.mean(a<lo):.1f}%  above {100*np.mean(a>hi):.1f}%")
for jd in (2461000.5, 2461000.5 + 1000, 2461000.5 + 4000):
    pos = np.concatenate([B.propagate(cat, [jd], sl=slice(i, i + 20000))[:, 0] for i in range(0, len(a), 20000)])
    r = np.linalg.norm(pos, axis=1)
    out = (r < lo) | (r > hi)
    print(f"jd {jd}: by DISTANCE inside {100*np.mean(~out):.1f}%  outside {100*np.mean(out):.1f}%  (<{lo}: {100*np.mean(r<lo):.1f}%  >{hi}: {100*np.mean(r>hi):.1f}%)  r p1/p99 {np.percentile(r,1):.2f}/{np.percentile(r,99):.2f}")
# time-average over a full orbit (uniform in mean anomaly) by semi-major axis class
rng = np.random.default_rng(1)
M = rng.uniform(0, 2 * np.pi, len(a))
E = M.copy()
for _ in range(50): E = E - (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
r_t = a * (1 - e * np.cos(E))
print(f"random phase: outside distance band {100*np.mean((r_t<lo)|(r_t>hi)):.1f}% ; of those with a INSIDE the band: {100*np.mean(((r_t<lo)|(r_t>hi))[(a>=lo)&(a<=hi)]):.1f}% sit outside the band")
# time-weighted fraction of an orbit spent outside the band, for a=2.7, e=0.15
for aa, ee in ((2.7, 0.15), (2.2, 0.15), (3.1, 0.15), (2.2, 0.0)):
    Mm = np.linspace(0, 2*np.pi, 20001); Ee = Mm.copy()
    for _ in range(60): Ee = Ee - (Ee - ee*np.sin(Ee) - Mm)/(1-ee*np.cos(Ee))
    rr = aa*(1-ee*np.cos(Ee)); print(f"  a={aa} e={ee}: time outside band {100*np.mean((rr<lo)|(rr>hi)):.1f}%")
# what the catalog says about Hildas / Trojans / NEA in a ranges
print("a<2.06:", int(np.sum(a<lo)), " a>3.28:", int(np.sum(a>hi)), " a>3.5:", int(np.sum(a>3.5)), " q<1.3 (NEA-like):", int(np.sum(q<1.3)), " Q>4.5:", int(np.sum(Q>4.5)))
print("share of catalog whose orbit ever leaves the band (q<2.06 or Q>3.28):", f"{100*np.mean((q<lo)|(Q>hi)):.1f}%")
