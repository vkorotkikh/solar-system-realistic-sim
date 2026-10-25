"""SCN-044: dated two-assist quality floor and independent conic physics."""
import json
from pathlib import Path
import math
import numpy as np
from scipy.integrate import solve_ivp

from data.bodies import ALL_BODIES
from trajectory import plan_interplanetary_route
from trajectory.budget import PlanningContext, PlanningLimits


def test_real_window_retains_an_independently_closed_two_assist_witness():
    witness=json.loads((Path(__file__).parent/"fixtures/mga_independent_witness.json").read_text())
    result=plan_interplanetary_route(ALL_BODIES,from_id="earth",to_id="mars",
        departure_jd=witness["departure_jd"],objective="max_assist",max_assists=2,ephemeris_provider="kepler")
    best=result["best"]
    assert best["bodyRoute"] == witness["body_route"]
    assert best["score"] >= witness["max_assist_score"]-0.01
    bodies={b["id"]:b for b in ALL_BODIES}
    for prior,following in zip(best["legs"],best["legs"][1:]):
        vin=(np.array(prior["arrivalVelocityApprox"])-prior["toPlanetVelocity"])*149597870.7/86400
        vout=(np.array(following["departureVelocityApprox"])-following["fromPlanetVelocity"])*149597870.7/86400
        speed=float(np.linalg.norm(vin)); speed_out=float(np.linalg.norm(vout))
        assert abs(speed-speed_out)<=max(0.001,1e-4*max(speed,speed_out))
        theta=float(np.arccos(np.clip(np.dot(vin,vout)/(speed*speed_out),-1,1)))
        body=bodies[prior["toId"]]
        mu=float(body["mass_kg"])*6.67430e-20
        periapsis=mu/speed**2*(1/math.sin(theta/2)-1)
        # Independent policy values: Jupiter equatorial-radius radiation floor,
        # Venus atmospheric floor, not copied from the production helper at run time.
        assert periapsis >= {"jupiter":671492.,"venus":6351.8}[body["id"]]
        assert prior["arrivalJd"] == following["departureJd"]
    for leg in best["legs"]:
        def rhs(t,y): return np.r_[y[3:],-0.0002959122082855911*y[:3]/np.linalg.norm(y[:3])**3]
        propagated=solve_ivp(rhs,(0,leg["tofDays"]),np.r_[leg["startPosition"],leg["departureVelocityApprox"]],
                             method="DOP853",rtol=2e-13,atol=1e-14)
        assert propagated.success
        assert np.linalg.norm(propagated.y[:3,-1]-leg["endPosition"])*149597870.7 < 50
    assert result["search"]["optimalityGuaranteed"] is False
    assert result["search"]["searchSpaceExhaustive"] is False


def test_exhausted_real_window_is_explicitly_inconclusive():
    context=PlanningContext.with_timeout(2,limits=PlanningLimits(leg_evaluations=20))
    result=plan_interplanetary_route(ALL_BODIES,from_id="earth",to_id="mars",departure_jd=2460570.5,
        objective="max_assist",max_assists=2,ephemeris_provider="kepler",planning_context=context)
    assert result["search"]["truncated"] is True
    assert result["search"]["budgetExhausted"] is True
    assert result["search"]["configuredFrontierCompleted"] is False
    assert result["search"]["optimalityGuaranteed"] is False
