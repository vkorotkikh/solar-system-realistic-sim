from __future__ import annotations

import mission.agents as mission_agents
from data.bodies import ALL_BODIES
from mission import MissionPlannerAgent
from mission.agents import TrajectoryAgent
from mission.explainability import DecisionLog


def test_mission_planner_agent_emits_recommendation_and_logs() -> None:
    planner = MissionPlannerAgent(ALL_BODIES)

    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_450.5,
            "max_assists": 0,
            "objective": "min_distance",
            "ephemeris_provider": "kepler",
            "risk_samples": 30,
            "payload_mass_kg": 5_500.0,
            "mining_days": 5_000.0,
            "ore_grade": 1.0,
            "extraction_rate_kg_day": 50_000.0,
            "refining_yield": 1.0,
            "storage_loss_rate_per_day": 0.0,
            "handling_loss_fraction": 0.0,
            "risk_failure_probability_threshold": 1.0,
            "vehicle": {
                "name": "validation_vehicle",
                "stages": [
                    {"name": "stage_1", "dry_mass_kg": 100.0, "propellant_mass_kg": 1_000_000.0, "isp_s": 1_000.0},
                    {"name": "stage_2", "dry_mass_kg": 100.0, "propellant_mass_kg": 1_000_000.0, "isp_s": 1_000.0},
                ],
            },
        }
    )

    assert result["recommendation"] is not None
    recommendation = result["recommendation"]
    assert "decisionLog" in recommendation
    assert len(recommendation["decisionLog"]) > 0
    assert "objectiveBreakdown" in recommendation
    assert "verification" in recommendation
    assert recommendation["verification"]["valid"] is True


def test_trajectory_agent_passes_prograde_to_route_planner(monkeypatch) -> None:
    observed: dict = {}

    def fake_plan_interplanetary_route(*_args, **kwargs):
        observed.update(kwargs)
        return {"best": None, "alternatives": []}

    monkeypatch.setattr(mission_agents, "plan_interplanetary_route", fake_plan_interplanetary_route)

    agent = TrajectoryAgent(ALL_BODIES)
    agent.propose(
        from_id="earth",
        to_id="mars",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=1,
        assist_pool=["venus"],
        ephemeris_provider="kepler",
        prograde=False,
        decision_log=DecisionLog(),
    )

    assert observed["prograde"] is False


def test_mission_planner_forwards_prograde_to_trajectory_agent() -> None:
    calls = []

    class FakeTrajectoryAgent:
        def propose(self, **kwargs):
            calls.append(kwargs)
            return {"best": None, "alternatives": []}

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = FakeTrajectoryAgent()  # type: ignore[attr-defined]

    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "mars",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "ephemeris_provider": "kepler",
            "prograde": False,
        }
    )

    assert calls
    assert calls[0]["prograde"] is False
    assert result["status"] == "no_trajectory"


def test_mission_planner_returns_no_verified_candidate_when_all_fail_verifier() -> None:
    planner = MissionPlannerAgent(ALL_BODIES)
    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_450.5,
            "max_assists": 0,
            "objective": "min_distance",
            "ephemeris_provider": "kepler",
            "risk_samples": 40,
            "payload_mass_kg": 2_000_000.0,
        }
    )

    assert result["status"] == "no_verified_candidate"
    assert result["recommendation"] is None
    assert len(result["alternatives"]) > 0
    first_reason = result["alternatives"][0]["verification"]["reasons"]
    assert "vehicle_budget_not_feasible" in first_reason
