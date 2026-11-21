import math
G0 = 9.80665e-3
opt = {5:267.07, 3:205.86, 2:167.28, 1.4:139.38, 1:117.33, 0.7:97.80, 0.5:82.38, 0.3:63.74, 0.2:52.33, 0.14:43.92, 0.1:37.97}
def dv(d, g): return 2 * math.sqrt(d * g * G0)
D = 384400.0; rleo = 6571.0; rllo = 1837.4
cases = {"D=384,400 (what torch-ends used)": D, "d = diff of distances, same side (D - 6571)": D - rleo, "d = diff, LLO on near side (D-1837-6571)": D - rllo - rleo, "opposite sides d = sum (D+6571)": D + rleo, "opposite, far side LLO (D+1837+6571)": D + rllo + rleo}
print("Earth LEO -> low lunar orbit, straight formula over continuous optimum (torch-ends optimum, dv in km/s)")
for name, d in cases.items():
    r = [dv(d, g) / opt[g] - 1 for g in opt]
    print(f"  {name:48} d={d:9.0f}  range {100*min(r):+.1f}% to {100*max(r):+.1f}%   at 1 g {100*(dv(d,1)/opt[1]-1):+.1f}%  at 0.1 g {100*(dv(d,0.1)/opt[0.1]-1):+.1f}%")
print("\nsame-planet hops where same-side vs opposite-side differs a lot (Jupiter, circular 1.1R=76,902 km; moon aKm from moons.json)")
rj = 76902.1
for name, r2 in (("Io", 421800.0), ("Europa", 671100.0), ("Ganymede", 1070400.0), ("Callisto", 1882700.0)):
    ds, dop = r2 - rj, r2 + rj
    print(f"  Jupiter low orbit -> {name}: d same side {ds:,.0f} km, opposite side {dop:,.0f} km, ratio of T and dv = {math.sqrt(dop/ds):.2f}; at 1 g T {2*math.sqrt(ds*1e3/(G0*1e3))/3600:.2f} h vs {2*math.sqrt(dop/G0)/3600:.2f} h")
for n1, r1, n2, r2 in (("Io", 421800.0, "Europa", 671100.0), ("Europa", 671100.0, "Ganymede", 1070400.0), ("Ganymede", 1070400.0, "Callisto", 1882700.0), ("Io", 421800.0, "Callisto", 1882700.0)):
    ds, dop = r2 - r1, r2 + r1
    print(f"  {n1} -> {n2}: d same side {ds:,.0f}, opposite {dop:,.0f}: T and dv differ by x{math.sqrt(dop/ds):.2f}; at 1 g {2*math.sqrt(ds/G0)/3600:.2f} h .. {2*math.sqrt(dop/G0)/3600:.2f} h")
# Io orbit phase: how far does Io move during a 3.3 h hop
P_io = 1.769 * 24; print("\nIo period h", P_io, " Io moves", 360*3.3/P_io, "deg during a 3.3 h hop; a 1 g hop takes", 2*math.sqrt((421800-76902)/G0)/3600, "h")
# bound for low-orbit -> Io at various g with planner-like orbits, and at the design's 1/2 limit
mu = 1.8982e27*6.6743e-11/1e9
for rj_ in (76902.1, 69911+5000):
    for g in (3, 1, 0.5, 0.3):
        d = 421800 - rj_; b = (math.sqrt(mu/rj_) + math.sqrt(mu/421800))/dv(d, g)
        print(f"  r1={rj_:.0f} -> Io at {g} g: bound = {b:.3f}  ({'REFUSED' if b>0.5 else 'allowed'})   thrust / local gravity at start = {g*G0/(mu/rj_**2):.2f}")
