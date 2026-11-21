import sys
sys.path.insert(0, "<session-dir>/nav-lab/critique-physics")
from plab import *
sys.path.insert(0, TS + "/../torch-ends")
import ends_reference as ER
AUm = AU_KM * 1e3
# ---- claim 2 numbers
print("g_sun at 1 AU (g):", g_sun_g(1.0), " x3 =", 3 * g_sun_g(1.0))
for b in ("mercury", "venus", "earth", "mars"):
    a = BY[b]["orbit"]["a_au"]; e = BY[b]["orbit"]["e"]
    print(f"{b}: floor 3x at a={3*g_sun_g(a):.5f} g, at perihelion q={a*(1-e):.4f} AU: {3*g_sun_g(a*(1-e)):.5f} g;  g_sun(q)={g_sun_g(a*(1-e)):.5f} g  g_sun(0.1AU keep-out)={g_sun_g(0.1):.4f} g")
# ---- claim 1: bounds. orbital speeds (circular, km/s)
MU = {"earth": 398600.4418, "venus": 324858.592, "mercury": 22031.78, "mars": 42828.375, "jupiter": 126686534.0}
def vc(mu, r): return math.sqrt(mu / r)
RAD = {k: BY[k]["radius_km"] for k in ("earth","venus","mercury","mars","jupiter")}
print({k: RAD[k] for k in RAD})
ends = {"earth": vc(MU["earth"], 6371+200), "venus": vc(MU["venus"], RAD["venus"] + 400), "mercury": vc(MU["mercury"], RAD["mercury"] + 400),
        "mars": vc(MU["mars"], RAD["mars"]+400), "jup1.1R": vc(MU["jupiter"], 1.1*RAD["jupiter"]), "jup+5000": vc(MU["jupiter"], RAD["jupiter"]+5000),
        "jupcapt_peri": math.sqrt(2*MU["jupiter"]*13982200/(76902.1*(76902.1+13982200)))}
print({k: round(v, 3) for k, v in ends.items()})
def torch_dv(L_au, a_g):  # km/s, straight line flip-and-burn
    return 2 * math.sqrt(a_g * G0 * L_au * AUm) / 1e3
print("\npair | thrust g | L AU (closest/typical-best) | dv km/s | bound = (vA+vB)/dv %")
cases = [("Earth-Mars", "earth", "mars", 1.0, 0.52), ("Earth-Mars", "earth", "mars", 0.3, 0.52), ("Earth-Mars", "earth", "mars", 0.05, 0.52),
         ("Earth-Jupiter 1.1R circ", "earth", "jup1.1R", 0.05, 4.2), ("Earth-Jupiter 1.1R circ", "earth", "jup1.1R", 0.3, 4.2), ("Earth-Jupiter 1.1R circ", "earth", "jup1.1R", 1.0, 4.2),
         ("Earth-Jupiter alt 5000", "earth", "jup+5000", 0.05, 4.2), ("Earth-Jupiter capture ellipse (peri speed)", "earth", "jupcapt_peri", 0.05, 4.2),("Earth-Jupiter capture ellipse (peri speed)", "earth", "jupcapt_peri", 1.0, 4.2),
         ("Earth-Venus", "earth", "venus", 0.02, 0.277), ("Earth-Venus", "earth", "venus", 0.0035, 0.277), ("Earth-Venus", "earth", "venus", 0.1, 0.277), ("Earth-Venus", "earth", "venus", 1.0, 0.277),
         ("Earth-Mercury", "earth", "mercury", 0.012, 0.61), ("Earth-Mercury", "earth", "mercury", 0.1, 0.61), ("Earth-Mercury", "earth", "mercury", 1.0, 0.61)]
for name, a, b, g, L in cases:
    dv = torch_dv(L, g); s = ends[a] + ends[b]
    print(f"{name} | {g} | {L} | {dv:.1f} | {s:.2f}/{dv:.1f} = {100*s/dv:.2f}%")
# patched (esc+cap) at those thrusts via ends_reference.escape_cost
print("\nescape costs (km/s, hours) circular orbits via ends_reference.escape_cost")
for body, mu, r in (("earth LEO", MU["earth"], 6571.0), ("venus 400km", MU["venus"], RAD["venus"]+400), ("mercury 400km", MU["mercury"], RAD["mercury"]+400),
                    ("jupiter 1.1R", MU["jupiter"], 1.1*RAD["jupiter"])):
    for g in (0.3, 0.05, 0.02, 0.012, 0.0035):
        dv, t = ER.escape_cost(mu, r, r, g * G0 * 1e-3)
        print(f"  {body:14} a={g:6} g  a/g0={g*G0*1e-3/(mu/r**2):.4f}  esc dv={dv:7.2f} km/s ({dv/vc(mu,r):.2f} vc)  t={t/3600:8.2f} h")
