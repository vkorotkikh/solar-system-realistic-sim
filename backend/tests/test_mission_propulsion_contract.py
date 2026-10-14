"""SCN-020/078: protected and discarded fuel cannot fund parking/capture burns."""
import math

import pytest

from mission.agents import MissionPlannerAgent
from mission.risk_service import RiskService
from mission.vehicle_service import StageDefinition, VehicleDefinition, VehicleService
from data.bodies import ALL_BODIES


@pytest.mark.parametrize("burns", [[0.0], [2.0], [3.0], [100.0]])
def test_margin_is_only_onboard_usable_fuel_and_mass_is_conserved(burns):
    vehicle = VehicleDefinition("two", [StageDefinition("a", 200, 1000, 300), StageDefinition("b", 50, 400, 320)])
    result = VehicleService().evaluate_burn_budget(vehicle, payload_mass_kg=100,
        burns_km_s=burns, reserve_fraction=0.1)
    stages = result["stageTelemetry"]
    remaining = sum(s["propellant_mass_kg"]-s["propellant_used_kg"] for s in stages if not s["jettisoned"])
    reserves = sum(s["propellant_mass_kg"]*0.1 for s in stages if not s["jettisoned"])
    discarded = sum(s["propellant_mass_kg"]-s["propellant_used_kg"] for s in stages if s["jettisoned"])
    assert result["propellantMarginKg"] == pytest.approx(max(0,remaining-reserves))
    assert result["propellantOnboardKg"] == pytest.approx(remaining)
    assert result["propellantReserveOnboardKg"] == pytest.approx(reserves)
    assert result["propellantDiscardedKg"] == pytest.approx(discarded)
    assert remaining + discarded + result["totalPropellantUsedKg"] == pytest.approx(1400)
    assert result["finalMassKg"] == pytest.approx(100+remaining+sum(s["dry_mass_kg"] for s in stages if not s["jettisoned"]))


def test_exhausted_risk_samples_report_zero_usable_margin():
    vehicle = VehicleDefinition("one", [StageDefinition("a",100,1000,300)])
    risk = RiskService().run_monte_carlo(base_total_delta_v_km_s=100,
        base_total_time_days=100, base_returned_payload_kg=10, base_arrival_jd=2460500,
        reclose=lambda factor,cargo: VehicleService().evaluate_burn_budget(vehicle,
            payload_mass_kg=100,burns_km_s=[100*factor],reserve_fraction=0.1), samples=30)
    assert risk["failureProbability"] == 1.0
    assert risk["envelopes"]["propellantMarginKg"] == {"p05":0.0,"p50":0.0,"p95":0.0}


def test_parking_burn_satisfies_independent_specific_energy_cases():
    from mission.propulsion import circular_parking_burn_km_s
    # Unit case: mu/r=1, v_inf=sqrt(2) -> v_hyp=2, v_circ=1, burn=1.
    assert circular_parking_burn_km_s(math.sqrt(2), 100, 100) == pytest.approx(1.0)
    assert circular_parking_burn_km_s(0, 100, 100) == pytest.approx(math.sqrt(2)-1)
    # Earth 200 km parking orbit: independently enforce epsilon=v_inf^2/2.
    mu, radius, vinf = 398600.4418, 6578.137, 3.0
    burn = circular_parking_burn_km_s(vinf,mu,radius)
    periapsis_speed = math.sqrt(mu/radius)+burn
    assert periapsis_speed**2/2-mu/radius == pytest.approx(vinf**2/2)


def test_mission_uses_four_burns_and_loads_cargo_after_target_capture():
    result = MissionPlannerAgent(ALL_BODIES).plan(dict(from_id="earth",target_id="mars",
        return_id="earth",departure_jd=2460500.5,max_assists=0,ephemeris_provider="kepler",
        parking_altitude_km=200,risk_samples=30,mining_days=10,storage_loss_rate_per_day=0,
        vehicle={"name":"ample","stages":[dict(name="stage",dry_mass_kg=100,
            propellant_mass_kg=1000000,isp_s=10000)]}))
    candidate = result["recommendation"] or result["alternatives"][0]
    budget = candidate["logistics"]
    events = budget["propulsion"]["events"]
    assert [e["event"] for e in events] == ["departure","capture","departure","capture"]
    assert [e["bodyId"] for e in events] == ["earth","mars","mars","earth"]
    assert events[2]["jd"]-events[1]["jd"] == pytest.approx(10)
    assert [b["cargoAddedKg"] for b in budget["burns"]] == [0,0,budget["returnCargoKg"],0]
    assert budget["totalRequestedDeltaV_km_s"] == pytest.approx(sum(e["deltaVKmS"] for e in events))
    for event,burn in zip(events,budget["burns"]):
        assert event["deltaVKmS"] == pytest.approx(burn["requestedDeltaV_km_s"])
        assert (math.sqrt(event["muKm3S2"]/event["parkingRadiusKm"])+event["deltaVKmS"])**2/2-event["muKm3S2"]/event["parkingRadiusKm"] == pytest.approx(event["vInfinityKmS"]**2/2)
