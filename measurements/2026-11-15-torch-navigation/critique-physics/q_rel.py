import math
c = 299792458.0; AU = 149597870700.0; g0 = 9.80665
def newton(d, a):  # flip at midpoint
    T = 2 * math.sqrt(d / a); v = math.sqrt(a * d); return T, v, a * T
def rel(d, a):  # constant PROPER acceleration, flip at mid, distance d in Sun frame
    gam = 1 + a * (d / 2) / c ** 2
    eta = math.acosh(gam)
    Tc = 2 * (c / a) * math.sinh(eta)      # coordinate time
    tau = 2 * (c / a) * eta                 # ship (proper) time
    v = c * math.tanh(eta)
    return Tc, tau, v, 2 * c * eta          # 2 c eta = proper-accel * proper-time (= "delta-v" a*tau) 
print("10 g trip, peak speed (Newtonian) vs distance:")
for name, d_au in (("Mars 0.52", .52), ("Jupiter 4.2", 4.2), ("Neptune 29", 29), ("Kuiper inner 30", 30), ("Kuiper outer 50", 50), ("Eris 38 (q)", 38), ("Eris mean 68", 68), ("Eris 96 (Q)", 96)):
    for g in (10.0, 20.0):
        T, v, dv = newton(d_au * AU, g * g0)
        print(f"  {name:16} {g:4} g: peak {100*v/c:5.2f}% c   T={T/86400:6.2f} d")
print("\nrelativity error as function of NEWTONIAN peak speed (same distance, same proper acceleration):")
for pct in (1, 3, 5, 10, 12):
    a = 10 * g0; v_n = pct / 100 * c; d = v_n ** 2 / a
    T, v, dv = newton(d, a); Tc, tau, vr, dvr = rel(d, a)
    print(f"  {pct:3d}% c (d={d/AU:6.1f} AU): coord time +{100*(Tc/T-1):.3f}%  ship time +{100*(tau/T-1):.3f}%  peak speed {100*(vr/v-1):+.3f}%  a*tau vs a*T {100*(dvr/dv-1):+.3f}%")
print()
for pct in (20, 30, 40):
    a = 10 * g0; v_n = pct / 100 * c; d = v_n ** 2 / a
    T, v, dv = newton(d, a); Tc, tau, vr, dvr = rel(d, a)
    print(f"  {pct:3d}% c (d={d/AU:7.1f} AU): coord time +{100*(Tc/T-1):.2f}%  ship time {100*(tau/T-1):+.2f}%  peak speed {100*(vr/v-1):+.2f}%  a*tau vs a*T {100*(dvr/dv-1):+.2f}%")
print("20 g to Sedna q=76 AU, 500 AU:", [round(100*math.sqrt(20*g0*x*AU)/c,1) for x in (76, 500, 1000)], "% c (Newtonian peak)")
