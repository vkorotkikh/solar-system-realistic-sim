from __future__ import annotations

from data.bodies import ALL_BODIES
from mission import MissionPlannerAgent


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
            "risk_samples": 60,
            "payload_mass_kg": 5_500.0,
            "mining_days": 120.0,
        }
    )

    assert result["recommendation"] is not None
    recommendation = result["recommendation"]
    assert "decisionLog" in recommendation
    assert len(recommendation["decisionLog"]) > 0
    assert "objectiveBreakdown" in recommendation
    assert "verification" in recommendation
