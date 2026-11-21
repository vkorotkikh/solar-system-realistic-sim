import sys, math
sys.path.insert(0,"<session-dir>/wt-c1/backend")
import numpy as np
from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
AU=149597870.7e3; g=9.80665
BY={b["id"]:b for b in ALL_BODIES}
def pos(i,jd): return np.array(sample_body_state_from_elements(BY[i],jd)["position"])
def brach(D_m,a): T=2*math.sqrt(D_m/a); return T, 2*math.sqrt(D_m*a)
print("Brachistochrone T=2 sqrt(D/a), dv=2 sqrt(D a), straight line, static distance")
for name,D in [("1 AU",1.0),("0.4 AU",0.4),("Earth-Mars @2026-11-12",None),("Earth-Mars min 0.37AU",0.3727),("Earth-Mars max 2.67AU",2.67),("Earth-Jupiter 4.2AU",4.2),("30 AU",30.0)]:
    if D is None: D=np.linalg.norm(pos("earth",2461356.5)-pos("mars",2461356.5))
    for ag in (0.1,0.3,1,3,10):
        T,dv=brach(D*AU,ag*g)
        print(f"{name:26s} D={D:7.4f} AU a={ag:5.1f} g  T={T/86400:8.3f} d ({T/3600:8.2f} h)  dv={dv/1e3:9.1f} km/s  vmax={dv/2e3:9.1f} km/s")
# Parker
Rs=695700.0
print("Parker 9.86 Rsun =",9.86*Rs,"km =",9.86*Rs*1e3/AU,"AU; flux ratio",(1/(9.86*Rs*1e3/AU))**2)
d=6167590+Rs; print("Dec-2024 6,167,590 km altitude + R_sun = ",d,"km =",d*1e3/AU,"AU =",d/Rs,"Rsun; flux ratio",(AU/1e3/d)**2, "S=",1361*(AU/1e3/d)**2/1e3,"kW/m2")
for r in (0.05,0.1,0.2,0.3,0.387):
    print(f"flux at {r} AU: {1361/r**2:9.0f} W/m2  ({1/r**2:7.1f}x)")
# Drive: 5% c in 37 h
c=299792458; t=37*3600; print("Drive 0.05c/37h avg a =",0.05*c/t,"m/s2 =",0.05*c/t/g,"g")
# 1800 km/s in?; Rocinante 0.3 g 3 weeks dv
print("0.3 g x 21 d dv =",0.3*g*21*86400/1e3,"km/s =",0.3*21,"g-days; 28 d:",0.3*28,"g-days; 4000 km/s =",4e6/(g*86400),"g-days")
print("Atomic Rockets example: dv 1.8e6 m/s a 3 m/s2 D=",(1.8e6/2)**2/3/1e9,"million km =",(1.8e6/2)**2/3/AU,"AU; T=",1.8e6/3/86400,"d")
# sanity: kirkwood
print("Epstein check 2 sqrt(D/a) Earth-Jupiter 4.2AU 1 g:",2*math.sqrt(4.2*AU/g)/3600,"h; 0.3g:",2*math.sqrt(4.2*AU/(0.3*g))/3600,"h; 7g",2*math.sqrt(4.2*AU/(7*g))/3600,"; 12g",2*math.sqrt(4.2*AU/(12*g))/3600)
print("Pluto 38.53 AU 1g:",2*math.sqrt(38.53*AU/g)/86400,"d; 0.3g",2*math.sqrt(38.53*AU/(0.3*g))/86400)
