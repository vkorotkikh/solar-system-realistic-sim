"""Independent feasible witness for SCN-044, not an exhaustive/global optimum.

Use the pinned lamberthub environment documented for generate_mission_window_references.py.
Catalog Kepler states provide only the input geometry; the production Lambert,
flyby evaluator and search are never imported. scipy.brentq closes both flybys
using independent Izzo velocities. Gooding and DOP853 cross-check each leg.
"""
import importlib.metadata
import json
from pathlib import Path
import sys

import numpy as np
from lamberthub import gooding1990, izzo2015
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / "backend"))
from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements

MU=0.0002959122082855911
AU_KM=149597870.7
BODIES={b["id"]:b for b in ALL_BODIES}


def leg(a,b,jd,tof):
    start=sample_body_state_from_elements(BODIES[a],jd)
    end=sample_body_state_from_elements(BODIES[b],jd+tof)
    r1=np.array(start["position"]); r2=np.array(end["position"])
    v1,v2=izzo2015(MU,r1,r2,tof,atol=1e-12,rtol=1e-12)
    return dict(from_id=a,to_id=b,departure_jd=jd,tof_days=tof,start=start,end=end,
                v1=v1.tolist(),v2=v2.tolist())


def main():
    legs=[leg("earth","jupiter",2460570.5,1540.)]
    for a,b,bracket in [("jupiter","venus",(980,990)),("venus","mars",(650,680))]:
        prior=legs[-1]; jd=prior["departure_jd"]+prior["tof_days"]
        vin=np.linalg.norm(np.array(prior["v2"])-prior["end"]["velocity"])
        def residual(tof):
            next_leg=leg(a,b,jd,tof)
            return np.linalg.norm(np.array(next_leg["v1"])-next_leg["start"]["velocity"])-vin
        tof=brentq(residual,*bracket,xtol=1e-9)
        legs.append(leg(a,b,jd,float(tof)))
    for item in legs:
        r1=np.array(item["start"]["position"]); r2=np.array(item["end"]["position"])
        g1,g2=gooding1990(MU,r1,r2,item["tof_days"],atol=1e-12,rtol=1e-12)
        agreement=max(np.linalg.norm(g1-item["v1"]),np.linalg.norm(g2-item["v2"]))*AU_KM/86400
        def rhs(t,y): return np.r_[y[3:],-MU*y[:3]/np.linalg.norm(y[:3])**3]
        propagated=solve_ivp(rhs,(0,item["tof_days"]),np.r_[r1,item["v1"]],method="DOP853",rtol=2e-13,atol=1e-14)
        miss=float(np.linalg.norm(propagated.y[:3,-1]-r2)*AU_KM)
        assert agreement<1e-8 and propagated.success and miss<0.1
        item.update(oracle_agreement_km_s=float(agreement),propagated_miss_km=miss)
    gain=0.; assists=[]
    for prior,following in zip(legs,legs[1:]):
        incoming=(np.array(prior["v2"])-prior["end"]["velocity"])*AU_KM/86400
        outgoing=(np.array(following["v1"])-following["start"]["velocity"])*AU_KM/86400
        speed=float(np.linalg.norm(incoming))
        angle=float(np.arccos(np.dot(incoming,outgoing)/speed/np.linalg.norm(outgoing)))
        body=BODIES[following["from_id"]]
        mu=float(body["mass_kg"])*6.67430e-20
        rp=mu/speed**2*(1/np.sin(angle/2)-1)
        gain+=2*speed*np.sin(angle/2)
        assists.append(dict(body_id=body["id"],v_infinity_km_s=speed,turn_deg=float(np.degrees(angle)),
                            required_periapsis_km=float(rp)))
    endpoint_vinf=float((np.linalg.norm(np.array(legs[0]["v1"])-legs[0]["start"]["velocity"])+
                         np.linalg.norm(np.array(legs[-1]["v2"])-legs[-1]["end"]["velocity"]))*AU_KM/86400)
    duration=sum(l["tof_days"] for l in legs)
    path=sum(np.linalg.norm(np.array(l["end"]["position"])-l["start"]["position"]) for l in legs)
    score=float(5*gain-1.1*endpoint_vinf-0.002*duration-0.06*path)
    fixture=dict(body_route=["earth","jupiter","venus","mars"],departure_jd=2460570.5,
        legs=legs,assists=assists,endpoint_v_infinity_km_s=endpoint_vinf,max_assist_score=score,
        provenance=dict(kind="independent feasible witness; not global optimum",source="frozen application catalog Kepler input states",
                        versions={p:importlib.metadata.version(p) for p in ("lamberthub","numpy","scipy","numba","llvmlite")},
                        sources=["https://arxiv.org/abs/1403.2705v2","https://doi.org/10.1007/BF00049511"],
                        closure="scipy.brentq on independent Izzo v-infinity residuals; Gooding and DOP853 cross-checks"))
    path=ROOT/"backend/tests/fixtures/mga_independent_witness.json"
    path.write_text(json.dumps(fixture,indent=2)+"\n")
    print(json.dumps({"tofs":[l["tof_days"] for l in legs],"assists":assists,"score":score,
                      "max_propagation_miss_km":max(l["propagated_miss_km"] for l in legs)},indent=2))


if __name__=="__main__": main()
