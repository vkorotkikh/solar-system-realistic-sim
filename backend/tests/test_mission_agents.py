from __future__ import annotations

import pytest

import mission.agents as mission_agents
from data.bodies import ALL_BODIES
from mission import MissionPlannerAgent
from mission.agents import TrajectoryAgent
from mission.ephemeris_service import EphemerisTargetUnsupported
from mission.explainability import DecisionLog
from trajectory.budget import PlanningBudgetExceeded, PlanningCancelled, PlanningContext


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


def test_mission_planner_reuses_parent_context_and_ephemeris_for_return_searches() -> None:
    calls = []

    class FakeTrajectoryAgent:
        def propose(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                return {
                    "best": {
                        "bodyRoute": ["earth", "mars"],
                        "legs": [{"arrivalJd": 2_460_700.5}],
                        "totalDeltaVKmS": 5.0,
                        "totalTimeDays": 200.0,
                    },
                    "alternatives": [],
                    "search": {"terminationReason": "configured_frontier_completed"},
                }
            return {
                "best": None,
                "alternatives": [],
                "search": {"terminationReason": "configured_frontier_completed"},
            }

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = FakeTrajectoryAgent()  # type: ignore[attr-defined]
    context = PlanningContext.with_timeout(10.0)

    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "mars",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
        },
        planning_context=context,
    )

    assert result["status"] == "no_feasible_candidate"
    assert len(calls) == 2
    assert all(call["planning_context"] is context for call in calls)
    assert calls[0]["ephemeris"] is calls[1]["ephemeris"]
    assert calls[0]["assist_pool"] == []
    assert calls[1]["assist_pool"] == []


def test_mission_retains_verified_candidate_when_later_return_exhausts_budget() -> None:
    calls = 0

    def route(from_id: str, to_id: str, arrival_jd: float, delta_v: float) -> dict:
        return {
            "bodyRoute": [from_id, to_id],
            "legs": [{"arrivalJd": arrival_jd}],
            "totalDeltaVKmS": delta_v,
            "totalTimeDays": 100.0,
        }

    class StoppingTrajectoryAgent:
        def propose(self, **_kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                return {
                    "best": route("earth", "mars", 2_460_600.5, 4.0),
                    "alternatives": [route("earth", "mars", 2_460_620.5, 5.0)],
                    "search": {"terminationReason": "configured_frontier_completed"},
                }
            if calls == 2:
                return {
                    "best": route("mars", "earth", 2_460_900.5, 4.0),
                    "alternatives": [],
                    "search": {"terminationReason": "configured_frontier_completed"},
                }
            raise PlanningBudgetExceeded(
                "leg_evaluations",
                used=2_000,
                requested=1,
                limit=2_000,
            )

    class AlwaysValidVerifier:
        def verify(self, **_kwargs):
            return {"valid": True, "reasons": []}

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = StoppingTrajectoryAgent()  # type: ignore[attr-defined]
    planner._verifier_agent = AlwaysValidVerifier()  # type: ignore[attr-defined]

    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "mars",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
            "risk_samples": 50,
            "risk_failure_probability_threshold": 1.0,
        }
    )

    assert calls == 3
    assert result["status"] == "ok"
    assert result["recommendation"] is not None
    assert result["recommendation"]["verification"]["valid"] is True
    assert result["missionSearch"] == {
        "configuredCandidatesCompleted": False,
        "truncated": True,
        "terminationReason": "trajectory_compute_budget_exhausted",
        "candidateLimit": 2,
        "candidatesEvaluated": 1,
    }


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


def test_mission_cannot_turn_cancelled_child_result_into_success() -> None:
    context = PlanningContext.with_timeout(10.0)
    calls = 0

    def route(from_id: str, to_id: str, arrival_jd: float) -> dict:
        return {
            "bodyRoute": [from_id, to_id],
            "legs": [{"arrivalJd": arrival_jd}],
            "totalDeltaVKmS": 5.0,
            "totalTimeDays": 100.0,
        }

    class CancellingTrajectoryAgent:
        def propose(self, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                best = route("earth", "mars", 2_460_600.5)
            else:
                context.cancel("client_disconnected")
                best = route("mars", "earth", 2_460_900.5)
            return {
                "best": best,
                "alternatives": [],
                "search": {"terminationReason": "configured_frontier_completed"},
            }

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = CancellingTrajectoryAgent()  # type: ignore[attr-defined]

    with pytest.raises(PlanningCancelled) as caught:
        planner.plan(
            {
                "from_id": "earth",
                "target_id": "mars",
                "return_id": "earth",
                "departure_jd": 2_460_500.5,
                "ephemeris_provider": "kepler",
                "risk_samples": 30,
            },
            planning_context=context,
        )

    assert caught.value.context["terminationReason"] == "client_disconnected"
    assert calls == 2


def test_mission_checks_cancelled_parent_before_parsing_payload(monkeypatch) -> None:
    context = PlanningContext.with_timeout(10.0)
    context.cancel("already_disconnected")
    parse_calls = 0

    def forbidden_parse(_payload):
        nonlocal parse_calls
        parse_calls += 1
        raise AssertionError("cancelled mission must not parse nested payloads")

    monkeypatch.setattr(mission_agents, "parse_mission_request", forbidden_parse)

    with pytest.raises(PlanningCancelled):
        MissionPlannerAgent(ALL_BODIES).plan({}, planning_context=context)

    assert parse_calls == 0


def test_mission_preflights_unsupported_return_before_outbound_search(monkeypatch) -> None:
    trajectory_calls = 0
    spice_load_calls = 0

    class ForbiddenTrajectoryAgent:
        def propose(self, **_kwargs):
            nonlocal trajectory_calls
            trajectory_calls += 1
            raise AssertionError("mission search started before complete provider preflight")

    def forbidden_spice_load(_context=None):
        nonlocal spice_load_calls
        spice_load_calls += 1
        raise AssertionError("SPICE initialized before complete target coverage passed")

    # Patch the defining module: preflight must reject Psyche before reaching it.
    monkeypatch.setattr("mission.ephemeris_service._load_spice", forbidden_spice_load)

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = ForbiddenTrajectoryAgent()  # type: ignore[attr-defined]

    with pytest.raises(EphemerisTargetUnsupported) as caught:
        planner.plan(
            {
                "from_id": "earth",
                "target_id": "mars",
                "return_id": "psyche",
                "departure_jd": 2_460_500.5,
                "assist_pool": [],
                "ephemeris_provider": "spice",
            }
        )

    assert caught.value.body_id == "psyche"
    assert trajectory_calls == 0
    assert spice_load_calls == 0


def test_mission_marks_outbound_budget_stop_as_inconclusive() -> None:
    class BudgetStoppedTrajectoryAgent:
        def propose(self, **_kwargs):
            return {
                "best": None,
                "alternatives": [],
                "search": {
                    "truncated": True,
                    "budgetExhausted": True,
                    "terminationReason": "leg_evaluations_budget_exhausted",
                },
            }

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = BudgetStoppedTrajectoryAgent()  # type: ignore[attr-defined]

    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "mars",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
        }
    )

    assert result["recommendation"] is None
    assert result["status"] == "trajectory_search_inconclusive"
    assert result["trajectorySearch"]["outbound"]["budgetExhausted"] is True


def test_mission_preserves_inconclusive_return_search_telemetry() -> None:
    calls = 0

    class BudgetStoppedReturnAgent:
        def propose(self, **_kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                return {
                    "best": {
                        "bodyRoute": ["earth", "mars"],
                        "legs": [{"arrivalJd": 2_460_700.5}],
                        "totalDeltaVKmS": 5.0,
                        "totalTimeDays": 200.0,
                    },
                    "alternatives": [],
                    "search": {"terminationReason": "configured_frontier_completed"},
                }
            return {
                "best": None,
                "alternatives": [],
                "search": {
                    "truncated": True,
                    "budgetExhausted": True,
                    "terminationReason": "assist_depth_1_budget_exhausted",
                },
            }

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = BudgetStoppedReturnAgent()  # type: ignore[attr-defined]

    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "mars",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
        }
    )

    assert result["status"] == "trajectory_search_inconclusive"
    assert result["trajectorySearch"]["returns"][0]["search"]["truncated"] is True


def test_invalid_candidate_plus_incomplete_later_search_is_inconclusive() -> None:
    calls = 0

    def route(arrival_jd: float, delta_v: float) -> dict:
        return {
            "bodyRoute": ["earth", "mars"],
            "legs": [{"arrivalJd": arrival_jd}],
            "totalDeltaVKmS": delta_v,
            "totalTimeDays": 100.0,
        }

    class MixedTrajectoryAgent:
        def propose(self, **_kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                return {
                    "best": route(2_460_600.5, 4.0),
                    "alternatives": [route(2_460_620.5, 5.0)],
                    "search": {"terminationReason": "configured_frontier_completed"},
                }
            if calls == 2:
                return {
                    "best": route(2_460_900.5, 4.0),
                    "alternatives": [],
                    "search": {"terminationReason": "configured_frontier_completed"},
                }
            return {
                "best": None,
                "alternatives": [],
                "search": {
                    "truncated": True,
                    "budgetExhausted": True,
                    "terminationReason": "leg_evaluations_budget_exhausted",
                },
            }

    class AlwaysInvalidVerifier:
        def verify(self, **_kwargs):
            return {"valid": False, "reasons": ["fixture"]}

    planner = MissionPlannerAgent(ALL_BODIES)
    planner._trajectory_agent = MixedTrajectoryAgent()  # type: ignore[attr-defined]
    planner._verifier_agent = AlwaysInvalidVerifier()  # type: ignore[attr-defined]
    result = planner.plan(
        {
            "from_id": "earth",
            "target_id": "mars",
            "return_id": "earth",
            "departure_jd": 2_460_500.5,
            "assist_pool": [],
            "ephemeris_provider": "kepler",
            "risk_samples": 50,
        }
    )

    assert calls == 3
    assert result["recommendation"] is None
    assert result["status"] == "trajectory_search_inconclusive"
    assert result["alternatives"][0]["verification"] == {
        "valid": False,
        "reasons": ["fixture"],
    }
    assert result["trajectorySearch"]["returns"][1]["search"]["truncated"] is True
    assert result["missionSearch"]["truncated"] is True
    assert result["missionSearch"]["configuredCandidatesCompleted"] is False
    assert (
        result["missionSearch"]["terminationReason"]
        == "child_trajectory_search_inconclusive"
    )
