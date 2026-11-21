import math
AU=149597870.7e3; g=9.80665; c=299792458.0
# 1. relativity: coordinate-time factor for constant proper accel with flip, T_rel/T_cl = sqrt(1+(v/c)^2/4)
for f in (0.03,0.05,0.10,0.12):
    print(f"v_peak={f:.2f}c  time factor-1 = {math.sqrt(1+f*f/4)-1:.3e}")
# D at which 10 g trip reaches 3% c and 12% c ; and Kuiper (30-50 AU) peak speed at 10 g, 1 g, 20 g
for a_g in (1,10,20):
    for D in (30,40,50,97):
        v=math.sqrt(a_g*g*D*AU)
        print(f"a={a_g:>2} g D={D:>3} AU  v_peak={v/1e3:9.0f} km/s = {v/c*100:5.2f}% c")
print("D for 3 pct c at 10 g: {:.2f} AU".format(((0.03*c)**2/(10*g))/AU))
# 2. crew note: distance at which burn exceeds 24 h at 2 g (>2g..4g) and 1 h at 4 g
for a_g,T_h in ((2,24),(4,24),(4,1)):
    D=a_g*g*(T_h*3600/2)**2   # T=2 sqrt(D/a) -> D=a (T/2)^2
    print(f"a={a_g} g: burn> {T_h} h needs D > {D/AU:.4f} AU")
# 3. closing speed in belt: Earth->Jupiter brachistochrone 4.2 AU, speed at 2.5 AU from Earth start... speed = a*t, at x: v=sqrt(2 a x) up to midpoint
for a_g in (0.3,1,12):
    D=4.2*AU
    for x_au in (1.0,2.1):  # distance from start (belt ~ 1.1-2.3 AU from Earth)
        x=x_au*AU
        v=math.sqrt(2*a_g*g*x) if x<=D/2 else math.sqrt(2*a_g*g*(D-x))
        print(f"Earth->Jupiter a={a_g} g at {x_au} AU out: v={v/1e3:8.0f} km/s ; vs Pioneer10 ~14 km/s ratio {v/1e3/14:7.0f}x, KE ratio {(v/1e3/14)**2:.2e}")
# 4. plan time: screens per search
for legs in (1,2,3,6,12,18):
    print(f"legs={legs:>2}: screen time {legs*0.16:5.2f} .. {legs*0.47:5.2f} s")
