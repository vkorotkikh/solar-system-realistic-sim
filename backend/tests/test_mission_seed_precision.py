"""Mission seed precision through the actual HTTP/planner/RNG path."""
# Regression: MIS-010 — float coercion changed accepted integer risk seeds.
# Found by /qa on 2026-10-24.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import math
import random
import threading

from fastapi.testclient import TestClient
import pytest

import server
import mission.agents as mission_agents
from mission.risk_service import RiskService
from mission.schemas import parse_mission_request


PAYLOAD = {
    "from_id": "earth", "target_id": "mars", "return_id": "earth",
    "departure_jd": 2_460_500.5, "ephemeris_provider": "kepler",
    "max_assists": 0, "assist_pool": [], "risk_samples": 30,
    "risk_failure_probability_threshold": 1.0,
    "payload_mass_kg": 1.0, "mining_days": 1.0,
    "ore_grade": 1.0, "extraction_rate_kg_day": 1.0,
    "refining_yield": 1.0, "storage_loss_rate_per_day": 0.0,
    "handling_loss_fraction": 0.0,
    "vehicle": {"name": "owned_seed_control", "stages": [
        {"name": "one", "dry_mass_kg": 100.0,
         "propellant_mass_kg": 1_000_000.0, "isp_s": 10_000.0},
    ]},
}
SEEDS = [17, 2**53 + 1, -(2**53 + 1), 10**400]
SEED_IDS = ["ordinary", "positive53", "negative53", "overflow400"]


def expected_delta_v_factors(seed):
    """Independent Random consumer oracle: default sigmas, three draws/sample."""
    rng = random.Random(seed)
    result = []
    for _ in range(30):
        result.append(max(0.5, 1.0 + rng.gauss(0.0, 0.05)))
        rng.gauss(0.0, 0.042)  # time consumes its own draw/cache entry
        rng.gauss(0.0, 0.134)  # extraction consumes its own draw/cache entry
    return result


@pytest.fixture
def endpoint(monkeypatch):
    parsed = []
    observed = []
    original_parse = mission_agents.parse_mission_request
    original_risk = RiskService.run_monte_carlo

    def observe_parse(payload):
        result = original_parse(payload)
        parsed.append((payload["risk_seed"], result.risk_seed))
        return result

    def observe_risk(self, **kwargs):
        factors = []
        original_reclose = kwargs["reclose"]

        def observe_reclose(delta_v_factor, cargo_kg):
            factors.append(delta_v_factor)
            return original_reclose(delta_v_factor, cargo_kg)

        result = original_risk(self, **{**kwargs, "reclose": observe_reclose})
        observed.append({"seed": kwargs["seed"], "factors": factors, "result": result})
        return result

    def propose_owned_routes(self, *, from_id, to_id, departure_jd, **_kwargs):
        assert (from_id, to_id) in {("earth", "mars"), ("mars", "earth")}

        def route():
            return {
                "bodyRoute": [from_id, to_id],
                "legs": [{"departureJd": departure_jd,
                          "arrivalJd": departure_jd + 100.0,
                          "deltaVDepartureKmS": 0.05, "deltaVArrivalKmS": 0.05}],
                "totalDeltaVKmS": 0.1, "totalTimeDays": 100.0,
            }

        return {"best": route(),
                "alternatives": [route(), route()] if from_id == "earth" else [],
                "search": {"terminationReason": "configured_frontier_completed"}}

    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", replace(server.SOLAR_SECURITY_CONFIG, profile="local"))
    monkeypatch.setattr(server.app, "middleware_stack", None)
    monkeypatch.setattr(server, "_mission_plan_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(mission_agents, "parse_mission_request", observe_parse)
    monkeypatch.setattr(RiskService, "run_monte_carlo", observe_risk)
    monkeypatch.setattr(mission_agents.TrajectoryAgent, "propose", propose_owned_routes)
    with ThreadPoolExecutor(max_workers=1) as executor:
        monkeypatch.setattr(server, "_heavy_compute_executor", executor)
        client = TestClient(server.app)
        try:
            yield client, parsed, observed
        finally:
            client.close()


@pytest.mark.parametrize("seed", SEEDS, ids=SEED_IDS)
@pytest.mark.parametrize("contract", ["metadata", "random-factors"])
def test_http_seed_preserves_exact_integer_and_candidate_rng(endpoint, seed, contract):
    client, parsed, observed = endpoint
    bodies = []
    for _ in range(2):
        response = client.post("/mission/plan", json={**PAYLOAD, "risk_seed": seed})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "ok"
        assert body["missionSearch"]["candidatesEvaluated"] == 3
        bodies.append(body)
    assert len(parsed) == 2
    assert [received for received, _normalized in parsed] == [seed, seed]
    assert len(observed) == 6
    first, repeated = observed[:3], observed[3:]
    assert first == repeated  # repeatability alone must not hide the wrong seed
    assert all(len(row["factors"]) == 30 for row in observed)
    if contract == "metadata":
        assert [row["seed"] for row in first] == [seed, seed + 1, seed + 2]
        assert all(type(row["seed"]) is int for row in first)
        assert [normalized for _received, normalized in parsed] == [seed, seed]
        wire_seeds = [bodies[0]["recommendation"]["risk"]["seed"],
                      *[item["risk"]["seed"] for item in bodies[0]["alternatives"]]]
        assert sorted(wire_seeds) == sorted([seed, seed + 1, seed + 2])
    else:
        actual = [factor for row in first for factor in row["factors"]]
        expected = [factor for index in range(3) for factor in expected_delta_v_factors(seed + index)]
        assert actual == pytest.approx(expected, rel=1e-14, abs=1e-14)


@pytest.mark.parametrize("seed", SEEDS, ids=SEED_IDS)
def test_direct_integer_seed_round_trip(seed):
    normalized = parse_mission_request({"risk_seed": seed}).risk_seed
    assert type(normalized) is int
    assert normalized == seed


@pytest.mark.parametrize("value, expected", [
    (True, 1), (False, 0), (17.9, 17), (-17.9, -17),
    ("18.9", 18), ("-18.9", -18), ("invalid", 17), (None, 17),
    (float("nan"), 17), (float("inf"), 17),
    ("9007199254740993", 9_007_199_254_740_992),
], ids=["true-int", "false-int", "fraction", "negative-fraction", "string-fraction",
        "negative-string", "invalid", "missing", "nan-default", "inf-default", "legacy-large-string"])
def test_direct_seed_compatibility_is_preserved(value, expected):
    normalized = parse_mission_request({"risk_seed": value}).risk_seed
    assert type(normalized) is int
    assert normalized == expected


@pytest.mark.parametrize("count, assists, samples", [
    (10**40, 3, 5000), (-(10**40), 0, 30),
    (10**400, 1, 240), (-(10**400), 1, 240),
], ids=["huge-clamped", "negative-clamped", "overflow-default", "negative-overflow-default"])
def test_direct_work_count_compatibility_is_unchanged(count, assists, samples):
    parsed = parse_mission_request({"max_assists": count, "risk_samples": count})
    assert type(parsed.max_assists) is int and parsed.max_assists == assists
    assert type(parsed.risk_samples) is int and parsed.risk_samples == samples


@pytest.mark.parametrize("seed", [True, False, "17", 17.5])
def test_http_seed_strict_type_compatibility(endpoint, seed):
    client, parsed, observed = endpoint
    response = client.post("/mission/plan", json={**PAYLOAD, "risk_seed": seed})
    assert response.status_code == 422
    assert parsed == []
    assert observed == []

