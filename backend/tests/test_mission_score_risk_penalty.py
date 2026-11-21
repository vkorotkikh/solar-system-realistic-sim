"""The mission objective charges for risk: a riskier candidate must score and rank worse.

Audit finding mission-16 (2026-11-17 record): changing `risk_penalty = failureProbability * 9_000.0`
to `* 0.0` in MissionPlannerAgent.plan passed the full backend suite. The existing score tests only
check `missionScore == payload - propellant - riskPenalty - timePenalty`, which holds for any weight,
including zero. The API advertises `maximize(returned_payload_kg - propellant_used_kg - risk_penalty
- time_penalty)`; here the planner runs on two candidates that are identical except for the
failure probability the risk service reports.
"""

from __future__ import annotations

from copy import deepcopy

import pytest

import mission.agents as agents
from data.bodies import ALL_BODIES
from mission.risk_service import RiskService

PAYLOAD = dict(from_id="earth", target_id="mars", return_id="earth",
    departure_jd=2460500.5, ephemeris_provider="kepler", max_assists=0, assist_pool=[],
    risk_samples=30, risk_seed=17,
    risk_failure_probability_threshold=1.0,  # keep every candidate verified so ranking is by score
    payload_mass_kg=100.0, mining_days=180.0, ore_grade=0.18, extraction_rate_kg_day=1200.0,
    refining_yield=0.82, storage_loss_rate_per_day=0.0015, handling_loss_fraction=0.1,
    vehicle={"name": "ample", "stages": [{"name": "ample", "dry_mass_kg": 100.0,
        "propellant_mass_kg": 1000000.0, "isp_s": 10000.0}]})


@pytest.fixture
def plan_with_failure_probabilities(monkeypatch):
    """plan(p0, p1, ...) -> result; candidate i gets failureProbability p_i, all else identical."""
    def route(from_id, to_id, departure_jd, days=100.0):
        return {"bodyRoute": [from_id, to_id], "legs": [{"departureJd": departure_jd,
            "arrivalJd": departure_jd + days, "deltaVDepartureKmS": 0.05, "deltaVArrivalKmS": 0.05}],
            "totalDeltaVKmS": 0.1, "totalTimeDays": days}

    state = {"probabilities": [], "calls": 0, "outbound_candidates": 1}
    original_risk = RiskService.run_monte_carlo

    def propose(self, *, from_id, to_id, departure_jd, **_kwargs):
        if from_id == "earth":  # outbound: one best route plus identical alternatives
            extra = [route(from_id, to_id, departure_jd) for _ in range(state["outbound_candidates"] - 1)]
            return {"best": route(from_id, to_id, departure_jd), "alternatives": extra,
                    "search": {"terminationReason": "configured_frontier_completed"}}
        return {"best": route(from_id, to_id, departure_jd, 250.0), "alternatives": [],
                "search": {"terminationReason": "configured_frontier_completed"}}

    def risk(self, **kwargs):
        result = original_risk(self, **kwargs)
        result["failureProbability"] = state["probabilities"][state["calls"]]
        state["calls"] += 1
        return result

    monkeypatch.setattr(agents.TrajectoryAgent, "propose", propose)
    monkeypatch.setattr(RiskService, "run_monte_carlo", risk)

    def plan(*probabilities):
        state.update(probabilities=list(probabilities), calls=0, outbound_candidates=len(probabilities))
        result = agents.MissionPlannerAgent(ALL_BODIES).plan(deepcopy(PAYLOAD))
        assert result["status"] == "ok"
        assert state["calls"] == len(probabilities)
        return result

    return plan


def _score_before_penalties(candidate):
    ob = candidate["objectiveBreakdown"]
    return ob["returnedPayloadKg"] - ob["propellantUsedKg"] - ob["timePenalty"]


def test_risk_penalty_grows_linearly_with_failure_probability_and_lowers_the_score(
    plan_with_failure_probabilities,
) -> None:
    runs = {p: plan_with_failure_probabilities(p)["recommendation"] for p in (0.0, 0.2, 0.4)}
    penalty = {p: c["objectiveBreakdown"]["riskPenalty"] for p, c in runs.items()}

    assert penalty[0.0] == 0.0
    assert penalty[0.2] > 0.0
    assert penalty[0.4] == pytest.approx(2.0 * penalty[0.2])  # proportional to the probability
    for p, candidate in runs.items():
        assert candidate["risk"]["failureProbability"] == p
        # The penalty is the ONLY thing the probability changes: same payload, propellant, time.
        assert candidate["missionScore"] == pytest.approx(
            _score_before_penalties(candidate) - penalty[p]
        )
        assert _score_before_penalties(candidate) == pytest.approx(_score_before_penalties(runs[0.0]))
    assert runs[0.0]["missionScore"] > runs[0.2]["missionScore"] > runs[0.4]["missionScore"]


def test_the_riskier_of_two_otherwise_identical_candidates_ranks_lower(plan_with_failure_probabilities) -> None:
    # Candidate 0 (first evaluated, so it wins a score tie) is the risky one.
    result = plan_with_failure_probabilities(0.4, 0.0)
    best, runner_up = result["recommendation"], result["alternatives"][0]

    assert best["risk"]["failureProbability"] == 0.0
    assert runner_up["risk"]["failureProbability"] == 0.4
    assert _score_before_penalties(best) == pytest.approx(_score_before_penalties(runner_up))
    assert best["missionScore"] - runner_up["missionScore"] == pytest.approx(
        runner_up["objectiveBreakdown"]["riskPenalty"]
    )
    assert best["missionScore"] > runner_up["missionScore"]
