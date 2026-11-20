"""MIS029 continuous storage and departure/delivery contract regressions."""
# Regression: MIS-029 /qa 2026-10-24.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
from copy import deepcopy
from decimal import Decimal, localcontext
import math
import random

import pytest

from data.bodies import ALL_BODIES
import mission.agents as agents
from mission.explainability import DecisionLog
from mission.mining_service import MiningService
from mission.risk_service import RiskService
from mission.vehicle_service import VehicleService, default_vehicle


CAMPAIGN = dict(target_body_id="mars", mining_days=180.0, ore_grade=0.18,
                extraction_rate_kg_day=1200.0, refining_yield=0.82,
                storage_loss_rate_per_day=0.0015, available_power_kw=320.0,
                power_required_kw_per_kg_day=0.24, transport_delay_days=250.0)
CASES = [
    ("ordinary", {}), ("no-transit", {"transport_delay_days": 0.0}),
    ("no-loss", {"storage_loss_rate_per_day": 0.0}),
    ("tiny-x", {"storage_loss_rate_per_day": 1e-20}),
    ("zero-duration", {"mining_days": 0.0}),
    ("zero-grade", {"ore_grade": 0.0}),
    ("zero-yield", {"refining_yield": 0.0}),
    ("zero-power", {"available_power_kw": 0.0}),
    ("power-limited", {"available_power_kw": 24.0}),
    ("rate-first-underflow", dict(extraction_rate_kg_day=1e-300,
        ore_grade=1e-24, refining_yield=1.0, mining_days=1e300,
        storage_loss_rate_per_day=2e-300, transport_delay_days=0.0)),
    ("x-overflow", dict(extraction_rate_kg_day=1e305, available_power_kw=1e305,
        power_required_kw_per_kg_day=1.0, ore_grade=1.0, refining_yield=1.0,
        mining_days=10.0, storage_loss_rate_per_day=1e308, transport_delay_days=0.0)),
    ("x-underflow", dict(extraction_rate_kg_day=1e200, available_power_kw=1e200,
        power_required_kw_per_kg_day=1.0, ore_grade=1.0, refining_yield=1.0,
        mining_days=1e-200, storage_loss_rate_per_day=1e-200, transport_delay_days=0.0)),
    ("full-transit-decay", {"storage_loss_rate_per_day": 10.0}),
]


def decimal_campaign(arguments):
    """Independent high-precision integration, not the proposed float algorithm."""
    with localcontext() as ctx:
        ctx.prec = 400
        d = {key: Decimal(str(value)) for key, value in arguments.items()
             if key != "target_body_id"}
        effective = min(d["extraction_rate_kg_day"],
                        d["available_power_kw"] / d["power_required_kw_per_kg_day"])
        rate = effective * d["ore_grade"] * d["refining_yield"]
        time, loss = d["mining_days"], d["storage_loss_rate_per_day"]
        x = loss * time
        decay = Decimal(0) if x > 2000 else (-x).exp()
        stock = rate * time if loss == 0 else rate * (1 - decay) / loss
        transit = loss * d["transport_delay_days"]
        survival = Decimal(0) if transit > 2000 else (-transit).exp()
        return float(stock), float(survival), float(stock * survival)


@pytest.mark.parametrize("_label, overrides", CASES, ids=[row[0] for row in CASES])
def test_current_continuous_arithmetic(_label, overrides):
    arguments = {**CAMPAIGN, **overrides}
    result = MiningService().evaluate_campaign(**arguments)
    _stock, _survival, expected = decimal_campaign(arguments)
    assert math.isfinite(result["storablePayloadKg"])
    assert result["storablePayloadKg"] == pytest.approx(expected, rel=2e-13, abs=0.0)
    effective = min(arguments["extraction_rate_kg_day"],
                    arguments["available_power_kw"] / arguments["power_required_kw_per_kg_day"])
    assert result["refinedProductKg"] == (
        effective * arguments["mining_days"] * arguments["ore_grade"] * arguments["refining_yield"])
    assert result["effectiveExtractionRateKgDay"] == effective
    assert result["power"]["availableKw"] == arguments["available_power_kw"]


@pytest.mark.parametrize("_label, overrides", CASES, ids=[row[0] for row in CASES])
def test_selected_campaign_metadata(_label, overrides):
    arguments = {**CAMPAIGN, **overrides}
    result = MiningService().evaluate_campaign(**arguments)
    stock, survival, _arrived = decimal_campaign(arguments)
    assert result["departureStockKg"] == pytest.approx(stock, rel=2e-13, abs=0.0)
    assert result["transportSurvivalFraction"] == pytest.approx(survival, rel=2e-13, abs=0.0)
    assert result["departureStockKg"] >= 0
    assert 0 <= result["transportSurvivalFraction"] <= 1


@pytest.mark.parametrize("capacity, handling, returned", [
    (600.0, 0.1, 300.0), (2000.0, 0.1, 450.0),
    (600.0, 0.0, 300.0), (600.0, 0.6, 200.0), (0.0, 0.1, 0.0),
])
def test_selected_capacity_before_transit_and_handling_once(capacity, handling, returned):
    mining = {"departureStockKg": 1000.0, "transportSurvivalFraction": 0.5,
              "storablePayloadKg": 500.0}
    actual = MiningService().payload_return_closure(mining,
        outbound_propellant_kg=9000.0, return_propellant_kg=7000.0,
        return_capacity_kg=capacity, handling_loss_fraction=handling)
    assert actual == {"storablePayloadKg": 500.0, "handlingLossFraction": handling,
        "deliveredBeforePropellantKg": 500.0 * (1 - handling),
        "outboundPropellantKg": 9000.0, "returnPropellantKg": 7000.0,
        "returnCapacityKg": capacity, "returnedPayloadKg": returned}


@pytest.mark.parametrize("mining, expected", [
    ({"storablePayloadKg": 500.0}, 480.0), ({}, 0.0),
    ({"storablePayloadKg": 500.0, "departureStockKg": 1000.0,
      "transportSurvivalFraction": 0.5}, 960.0),
    ({"storablePayloadKg": 0.0, "departureStockKg": 1000.0,
      "transportSurvivalFraction": 0.0}, 960.0),
])
def test_selected_departure_helper_and_legacy_fallback(mining, expected):
    assert MiningService.departure_cargo_kg(mining) == expected


INVALID_METADATA = [
    {"departureStockKg": 1000.0}, {"transportSurvivalFraction": 0.5},
    *[{"departureStockKg": value, "transportSurvivalFraction": 0.5}
      for value in [-1.0, math.nan, math.inf]],
    *[{"departureStockKg": 1000.0, "transportSurvivalFraction": value}
      for value in [-0.01, 1.01, math.nan, math.inf]],
]


@pytest.mark.parametrize("metadata", INVALID_METADATA, ids=[
    "missing-survival", "missing-stock", "negative-stock", "nan-stock", "infinite-stock",
    "negative-survival", "above-one-survival", "nan-survival", "infinite-survival"])
@pytest.mark.parametrize("operation", ["departure", "closure"])
def test_selected_invalid_metadata_rejected(metadata, operation):
    mining = {"storablePayloadKg": 500.0, **metadata}
    with pytest.raises(ValueError):
        if operation == "departure":
            MiningService.departure_cargo_kg(mining)
        else:
            MiningService().payload_return_closure(mining, outbound_propellant_kg=0.0,
                return_propellant_kg=0.0, return_capacity_kg=2000.0)


RISK = dict(base_total_delta_v_km_s=5.0, base_total_time_days=500.0,
            base_returned_payload_kg=500.0, base_arrival_jd=2461000.5,
            samples=30, seed=17)


def quantiles(values):
    values = sorted(values)
    result = {}
    for label, q in [("p05", .05), ("p50", .5), ("p95", .95)]:
        index = q * (len(values) - 1)
        lo = math.floor(index)
        part = index - lo
        result[label] = values[lo] * (1 - part) + values[min(lo + 1, len(values) - 1)] * part
    return result


def random_oracle(seed, departure, delivered, *, zero_sigma=False):
    rng = random.Random(seed)
    rows = []
    for _ in range(30):
        dv = max(.5, 1 + rng.gauss(0, 0 if zero_sigma else .05))
        time = max(.4, 1 + rng.gauss(0, 0 if zero_sigma else .042))
        payload = max(0, 1 + rng.gauss(0, 0 if zero_sigma else .134))
        rows.append((dv, time, min(departure * payload, departure),
                     min(delivered * payload, delivered)))
    return rows


@pytest.mark.parametrize("mode", ["success", "mixed", "failed", "zero-yield"])
def test_control_legacy_risk_rng_and_failure_zeros(mode):
    observed = []
    delivered = 0.0 if mode == "zero-yield" else 500.0
    def reclose(factor, cargo):
        observed.append((factor, cargo))
        return {"feasible": mode not in {"failed"} and (mode != "mixed" or factor <= 1.0),
                "propellantMarginKg": 1000.0 - cargo}
    actual = RiskService().run_monte_carlo(**{**RISK, "base_returned_payload_kg": delivered}, reclose=reclose)
    rows = random_oracle(17, delivered, delivered)
    assert [row[0] for row in observed] == pytest.approx([r[0] for r in rows])
    assert [row[1] for row in observed] == pytest.approx([r[2] for r in rows])
    failed = [mode == "failed" or (mode == "mixed" and r[0] > 1) or delivered == 0 for r in rows]
    assert actual["failureProbability"] == sum(failed) / 30
    assert actual["envelopes"]["returnedPayloadKg"] == pytest.approx(quantiles([
        0.0 if bad else row[3] for row, bad in zip(rows, failed)]))
    assert actual["envelopes"]["deltaV_km_s"] == pytest.approx(quantiles([5 * r[0] for r in rows]))
    assert actual["envelopes"]["timeDays"] == pytest.approx(quantiles([500 * r[1] for r in rows]))
    assert actual["envelopes"]["arrivalJd"] == pytest.approx(quantiles([2461000.5 + 500 * r[1] - 500 for r in rows]))
    assert actual["envelopes"]["propellantMarginKg"] == pytest.approx(quantiles([1000 - r[2] for r in rows]))


@pytest.mark.parametrize("mode", ["success", "mixed", "departure-threshold", "full-decay", "equal-masses"])
def test_selected_risk_two_masses_rng_and_failure_zeros(mode):
    delivered = 0.0 if mode == "full-decay" else 500.0
    departure = 500.0 if mode == "equal-masses" else 1000.0
    zero_sigma = mode == "departure-threshold"
    observed = []
    def reclose(factor, cargo):
        observed.append((factor, cargo))
        feasible = (mode != "mixed" or factor <= 1) and (mode != "departure-threshold" or cargo <= 750)
        return {"feasible": feasible, "propellantMarginKg": 2000 - cargo}
    options = dict(RISK, base_returned_payload_kg=delivered, base_departure_cargo_kg=departure)
    if zero_sigma:
        options.update(ephemeris_sigma_fraction=0, thrust_sigma_fraction=0, extraction_sigma_fraction=0)
    actual = RiskService().run_monte_carlo(**options, reclose=reclose)
    rows = random_oracle(17, departure, delivered, zero_sigma=zero_sigma)
    assert [row[0] for row in observed] == pytest.approx([r[0] for r in rows])
    assert [row[1] for row in observed] == pytest.approx([r[2] for r in rows])
    failed = [(mode == "mixed" and r[0] > 1) or (mode == "departure-threshold" and r[2] > 750)
              or delivered == 0 for r in rows]
    assert actual["failureProbability"] == sum(failed) / 30
    assert actual["envelopes"]["returnedPayloadKg"] == pytest.approx(quantiles([
        0.0 if bad else row[3] for row, bad in zip(rows, failed)]))
    assert actual["envelopes"]["timeDays"] == pytest.approx(quantiles([500 * r[1] for r in rows]))
    assert actual["envelopes"]["propellantMarginKg"] == pytest.approx(quantiles([2000 - r[2] for r in rows]))
    if mode == "equal-masses":
        observed.clear()
        legacy = RiskService().run_monte_carlo(**RISK, reclose=reclose)
        assert actual == legacy
        assert [row[1] for row in observed] == pytest.approx([r[2] for r in rows])


@pytest.mark.parametrize("departure, delivered", [
    (-1.0, 0.0), (100.0, -1.0), (100.0, 101.0),
    (math.nan, 0.0), (math.inf, 0.0), (100.0, math.nan), (100.0, math.inf),
])
def test_selected_risk_invalid_opt_in_pair_before_rng_or_callback(monkeypatch, departure, delivered):
    def forbidden(*_args, **_kwargs):
        pytest.fail("invalid opt-in pair reached RNG or closure work")
    monkeypatch.setattr("mission.risk_service.random.Random", forbidden)
    with pytest.raises(ValueError):
        RiskService().run_monte_carlo(**{**RISK, "base_returned_payload_kg": delivered},
            base_departure_cargo_kg=departure, reclose=forbidden)


PAYLOAD = dict(from_id="earth", target_id="mars", return_id="earth",
    departure_jd=2460500.5, ephemeris_provider="kepler", max_assists=0, assist_pool=[],
    risk_samples=30, risk_seed=17, risk_failure_probability_threshold=1.0,
    payload_mass_kg=100.0, mining_days=180.0, ore_grade=0.18, extraction_rate_kg_day=1200.0,
    refining_yield=0.82, storage_loss_rate_per_day=0.0015, handling_loss_fraction=0.1,
    vehicle={"name": "owned-mis029", "stages": [{"name": "ample", "dry_mass_kg": 100.0,
        "propellant_mass_kg": 1000000.0, "isp_s": 10000.0}]})


@pytest.fixture
def planner(monkeypatch):
    observations = {"risk": [], "parse": [], "verify": [], "mining": [], "logistics": []}
    outbound_days = [100.0]
    original_parse = agents.parse_mission_request
    original_risk = RiskService.run_monte_carlo
    original_verify = agents.VerifierAgent.verify
    original_mining = MiningService.evaluate_campaign
    original_logistics = agents.LogisticsAgent.evaluate
    def parse(payload):
        result = original_parse(payload)
        observations["parse"].append(result)
        return result
    def risk(self, **kwargs):
        observed = {key: value for key, value in kwargs.items() if key != "reclose"}
        observed["calls"] = []
        callback = kwargs["reclose"]
        def reclose(factor, cargo):
            budget = callback(factor, cargo)
            observed["calls"].append((factor, cargo, budget))
            return budget
        result = original_risk(self, **{**kwargs, "reclose": reclose})
        observations["risk"].append(observed)
        return result
    def verify(self, **kwargs):
        result = original_verify(self, **kwargs)
        observations["verify"].append(result)
        return result
    def mining(self, **kwargs):
        result = original_mining(self, **kwargs)
        observations["mining"].append(kwargs)
        return result
    def logistics(self, **kwargs):
        result = original_logistics(self, **kwargs)
        observations["logistics"].append(kwargs["return_cargo_available_kg"])
        return result
    def propose(self, *, from_id, to_id, departure_jd, **_kwargs):
        assert (from_id, to_id) in {( "earth", "mars"), ("mars", "earth")}
        days = outbound_days[0] if from_id == "earth" else 250.0
        return {"best": {"bodyRoute": [from_id, to_id], "legs": [{
            "departureJd": departure_jd, "arrivalJd": departure_jd + days,
            "deltaVDepartureKmS": 0.05, "deltaVArrivalKmS": 0.05}],
            "totalDeltaVKmS": 0.1, "totalTimeDays": days}, "alternatives": [],
            "search": {"terminationReason": "configured_frontier_completed"}}
    monkeypatch.setattr(agents, "parse_mission_request", parse)
    monkeypatch.setattr(agents.TrajectoryAgent, "propose", propose)
    monkeypatch.setattr(RiskService, "run_monte_carlo", risk)
    monkeypatch.setattr(agents.VerifierAgent, "verify", verify)
    monkeypatch.setattr(MiningService, "evaluate_campaign", mining)
    monkeypatch.setattr(agents.LogisticsAgent, "evaluate", logistics)
    def run(days=100.0, **overrides):
        outbound_days[0] = days
        result = agents.MissionPlannerAgent(ALL_BODIES).plan({**deepcopy(PAYLOAD), **overrides})
        candidate = result["recommendation"] or result["alternatives"][0]
        return result, candidate
    return run, observations


@pytest.mark.parametrize("contract", ["return-delay", "departure-load", "delivered-mass", "risk-load"])
def test_current_real_planner_two_mass_wiring(planner, contract):
    run, seen = planner
    result, candidate = run()
    stock, survival, _arrived = decimal_campaign(CAMPAIGN)
    available = stock * 0.9
    assert result["status"] == "ok"
    assert len(seen["parse"]) == len(seen["verify"]) == len(seen["risk"]) == 1
    assert candidate["verification"]["valid"] is True
    if contract == "return-delay":
        assert seen["mining"][0]["transport_delay_days"] == 250.0
    elif contract == "departure-load":
        assert seen["logistics"][0] == pytest.approx(available)
        assert candidate["logistics"]["returnCargoKg"] == pytest.approx(available)
    elif contract == "delivered-mass":
        assert candidate["payloadClosure"]["returnedPayloadKg"] == pytest.approx(available * survival)
    else:
        calls = seen["risk"][0]["calls"]
        expected = random_oracle(17, available, available * survival)
        assert [factor for factor, _cargo, _budget in calls] == pytest.approx([row[0] for row in expected])
        assert [cargo for _factor, cargo, _budget in calls] == pytest.approx([row[2] for row in expected])
        for _factor, cargo, budget in calls:
            assert [burn["cargoAddedKg"] for burn in budget["burns"]] == [0, 0, cargo, 0]


def test_current_outbound_duration_does_not_age_future_product(planner):
    run, _seen = planner
    _, first = run(100.0)
    _, second = run(300.0)
    assert first["mining"]["storablePayloadKg"] == second["mining"]["storablePayloadKg"]
    assert first["logistics"]["returnCargoKg"] == second["logistics"]["returnCargoKg"]
    assert first["payloadClosure"] == second["payloadClosure"]
    assert second["objectiveBreakdown"]["timePenalty"] - first["objectiveBreakdown"]["timePenalty"] == 50.0
    assert second["return"]["legs"][-1]["arrivalJd"] - first["return"]["legs"][-1]["arrivalJd"] == 200.0


def test_control_real_planner_four_burns_and_score_still_use_nominal_delivery(planner):
    run, seen = planner
    _, candidate = run(storage_loss_rate_per_day=0.0)
    budget, closure = candidate["logistics"], candidate["payloadClosure"]
    assert [event["event"] for event in budget["propulsion"]["events"]] == ["departure", "capture", "departure", "capture"]
    assert [burn["cargoAddedKg"] for burn in budget["burns"]] == [0, 0, budget["returnCargoKg"], 0]
    assert budget["returnCargoKg"] == closure["returnedPayloadKg"]
    assert candidate["missionScore"] == pytest.approx(closure["returnedPayloadKg"] - budget["totalPropellantUsedKg"]
        - candidate["objectiveBreakdown"]["riskPenalty"] - candidate["objectiveBreakdown"]["timePenalty"])
    assert seen["parse"][0].storage_loss_rate_per_day == 0.0
    assert seen["verify"][0]["valid"] is True


def test_selected_full_decay_planner_still_loads_real_mass_and_rejects_no_yield(planner):
    run, seen = planner
    result, candidate = run(storage_loss_rate_per_day=10.0)
    assert candidate["logistics"]["returnCargoKg"] > 0.0
    assert candidate["payloadClosure"]["returnedPayloadKg"] == 0.0
    assert all(cargo > 0 for _factor, cargo, _budget in seen["risk"][0]["calls"])
    assert candidate["risk"]["failureProbability"] == 1.0
    assert candidate["risk"]["envelopes"]["returnedPayloadKg"] == {"p05": 0, "p50": 0, "p95": 0}
    assert "no_returned_payload" in candidate["verification"]["reasons"]
    assert result["recommendation"] is None


def test_selected_real_logistics_capacity_closes_departure_before_survival():
    budget = agents.LogisticsAgent().evaluate(vehicle=default_vehicle(), payload_mass_kg=6500.0,
        propulsion={"events": [{"deltaVKmS": dv} for dv in [1.0, .5, 1.0, .5]]},
        reserve_fraction=.05, return_cargo_available_kg=1e6,
        failure_probability_threshold=1.0, decision_log=DecisionLog())
    loaded = budget["returnCargoKg"]
    assert 0 < loaded < 1e6 and budget["feasible"]
    assert [burn["cargoAddedKg"] for burn in budget["burns"]] == [0, 0, loaded, 0]
    closure = MiningService().payload_return_closure(
        {"departureStockKg": 1e6, "transportSurvivalFraction": .5, "storablePayloadKg": 5e5},
        outbound_propellant_kg=1000, return_propellant_kg=1000,
        return_capacity_kg=loaded, handling_loss_fraction=0)
    assert closure["returnedPayloadKg"] == loaded * .5

# Root-approved append-only invalid-None supplement; original81 above unchanged.
@pytest.mark.parametrize("field", ["departureStockKg", "transportSurvivalFraction"])
@pytest.mark.parametrize("operation", ["departure", "closure"])
def test_selected_none_metadata_is_value_error(field, operation):
    mining = {"storablePayloadKg": 500.0, "departureStockKg": 1000.0,
              "transportSurvivalFraction": 0.5, field: None}
    with pytest.raises(ValueError):
        if operation == "departure":
            MiningService.departure_cargo_kg(mining)
        else:
            MiningService().payload_return_closure(mining, outbound_propellant_kg=0,
                return_propellant_kg=0, return_capacity_kg=2000)


def test_selected_none_returned_mass_rejected_before_rng_or_callback(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("invalid explicit pair reached RNG or closure work")
    monkeypatch.setattr("mission.risk_service.random.Random", forbidden)
    with pytest.raises(ValueError):
        RiskService().run_monte_carlo(**{**RISK, "base_returned_payload_kg": None},
            base_departure_cargo_kg=100.0, reclose=forbidden)


def test_real_lambert_planner_continuous_production_and_lossy_return_end_to_end():
    from mission.epo.sample_episodes import FEASIBLE_MISSION_PAYLOAD

    result = agents.MissionPlannerAgent(ALL_BODIES).plan(deepcopy(FEASIBLE_MISSION_PAYLOAD))
    assert result["status"] == "ok"
    candidate = result["recommendation"]
    assert candidate["verification"] == {"valid": True, "reasons": []}
    mining, logistics = candidate["mining"], candidate["logistics"]
    # Integrate production at 1*.18*.82 kg/day over ten days, not a single
    # batch aged for the full campaign; cargo exists only after the outbound.
    stock = (1.0 * .18 * .82) * -math.expm1(-.001 * 10.0) / .001
    departure = stock * .96
    survival = math.exp(-.001 * candidate["return"]["totalTimeDays"])
    assert mining["departureStockKg"] == pytest.approx(stock)
    assert mining["transportDelayDays"] == candidate["return"]["totalTimeDays"]
    assert logistics["returnCargoKg"] == pytest.approx(departure)
    assert [burn["cargoAddedKg"] for burn in logistics["burns"]] == pytest.approx([0, 0, departure, 0])
    delivered = candidate["payloadClosure"]["returnedPayloadKg"]
    assert delivered == pytest.approx(departure * survival)
    assert 0 < delivered < departure < stock
    assert candidate["risk"]["failureProbability"] == 0
    assert 0 < candidate["risk"]["envelopes"]["returnedPayloadKg"]["p50"] <= delivered
    assert candidate["risk"]["envelopes"]["returnedPayloadKg"]["p95"] <= delivered
    objective = candidate["objectiveBreakdown"]
    assert candidate["missionScore"] == pytest.approx(delivered - logistics["totalPropellantUsedKg"]
        - objective["riskPenalty"] - objective["timePenalty"])


# Capacity-bound risk sampling: the sampled mining draw scales the mined stock, not the manifest.
def test_capacity_bound_cargo_is_not_lightened_by_a_shortfall_that_leaves_stock_above_capacity(planner, monkeypatch):
    # Capacity is a quarter of the mined stock, so any mining draw above 25% leaves the load unchanged.
    monkeypatch.setattr(VehicleService, "max_closable_cargo_kg",
                        lambda self, vehicle, *, available_cargo_kg, **_: available_cargo_kg / 4)
    run, seen = planner
    _, candidate = run()
    capacity = candidate["logistics"]["returnCargoKg"]
    assert capacity == pytest.approx(seen["logistics"][0] / 4)
    assert min(cargo for _factor, cargo, _budget in seen["risk"][0]["calls"]) == capacity


@pytest.mark.parametrize("stock", [1000.0, 1500.0, 5000.0])
def test_selected_risk_departure_stock_limits_cargo_to_manifest_or_realized_stock(stock):
    cargo = []

    def reclose(_factor, kg):
        cargo.append(kg)
        return {"feasible": True}
    RiskService().run_monte_carlo(**RISK, base_departure_cargo_kg=1000.0, departure_stock_kg=stock, reclose=reclose)
    # random_oracle(.., stock, ..) rows are min(stock * draw, stock); the sampled cargo is that capped at the manifest.
    assert cargo == pytest.approx([min(1000.0, row[2]) for row in random_oracle(17, stock, 500.0)])


def test_capacity_bound_risk_yield_uses_the_cargo_that_actually_flies(monkeypatch):
    # Alternating mining draws leave either 500 kg or more than the 1000 kg
    # manifest in stock. Fixed 50% transit survival delivers 250 or 500 kg.
    class Draws:
        def __init__(self, _seed):
            self.draws = iter([0.0, 0.0, -0.9, 0.0, 0.0, 0.0] * 15)

        def gauss(self, _mean, _sigma):
            return next(self.draws)

    monkeypatch.setattr("mission.risk_service.random.Random", Draws)
    risk = RiskService().run_monte_carlo(
        **RISK, base_departure_cargo_kg=1000.0, departure_stock_kg=5000.0,
        reclose=lambda _factor, _cargo: {"feasible": True},
    )
    assert risk["envelopes"]["returnedPayloadKg"] == pytest.approx({"p05": 250.0, "p50": 375.0, "p95": 500.0})


@pytest.mark.parametrize("stock, departure", [
    (math.nan, 1000.0), (math.inf, 1000.0), (-1.0, 1000.0), (999.0, 1000.0), ("x", 1000.0), (2000.0, None)])
def test_selected_risk_invalid_departure_stock_before_rng_or_callback(monkeypatch, stock, departure):
    def forbidden(*_args, **_kwargs):
        pytest.fail("invalid departure stock reached RNG or closure work")
    monkeypatch.setattr("mission.risk_service.random.Random", forbidden)
    with pytest.raises(ValueError):
        RiskService().run_monte_carlo(**RISK, base_departure_cargo_kg=departure,
                                      departure_stock_kg=stock, reclose=forbidden)
