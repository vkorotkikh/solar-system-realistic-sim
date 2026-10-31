"""EPO smoke distinguishes verified missions, proven budget failure and input rejection."""
import pytest

from mission.epo import smoke_test
from mission.epo.config import EpisodeConfig, EpisodeFamilyPolicy
from mission.epo.verifier import DemoVerifier


def test_default_real_smoke_covers_positive_and_explicit_negative_contracts():
    result = smoke_test.run_smoke_test()
    assert result["totals"]["failed"] == 0, result
    assert result["totals"]["passed"] == result["totals"]["total"] > 0
    episodes = [episode for family in result["families"].values() for episode in family["episodes"]]
    assert {episode["expectedOutcome"] for episode in episodes} == {
        "verified", "vehicle_infeasible", "request_rejected"}


def test_original_stress_failure_reports_candidate_physics_and_search_diagnostics():
    result = smoke_test.run_smoke_test(["mining_core"])
    assert result["totals"]["failed"] == 10
    first = result["families"]["mining_core"]["episodes"][0]
    assert first["status"] == "no_verified_candidate"
    assert "vehicle_budget_not_feasible" in first["diagnostics"]["candidateVerificationReasons"]
    assert first["diagnostics"]["searchTerminationReasons"]


def test_original_outer_search_budget_failures_remain_inconclusive():
    result = smoke_test.run_smoke_test(["outer_reacher"])
    episodes = result["families"]["outer_reacher"]["episodes"]
    for episode in episodes[4:6]:  # Original Pluto/Eris inputs, unchanged.
        assert episode["status"] == "trajectory_search_inconclusive"
        assert episode["passed"] is False
        assert "assist_depth_1_budget_exhausted" in episode["diagnostics"]["searchTerminationReasons"]


def test_invalid_planner_result_is_a_reported_failure(monkeypatch):
    from mission.epo.runners import EpisodeRunner

    runner = EpisodeRunner()
    monkeypatch.setattr(runner.planner, "plan", lambda payload: [])
    record = runner.run_episode(EpisodeConfig("bad-result", "known", {}))
    assert record.status == "invalid_result"
    assert record.verifier_passed is False
    assert record.reasons == ["invalid_result"]


@pytest.mark.parametrize("status", ["trajectory_search_inconclusive", "no_trajectory", "no_feasible_candidate"])
def test_inconclusive_or_missing_search_is_never_a_physical_negative_pass(status):
    episode = EpisodeConfig("negative", "known", {}, expected_outcome="vehicle_infeasible")
    passed, reasons, _ = DemoVerifier().verify(episode, {"status": status, "recommendation": None})
    assert passed is False
    assert f"expected_vehicle_infeasible_got_{status}" in reasons


@pytest.mark.parametrize("code,body", [
    ("different_error", "flora"), ("mission_propulsion_body_unsupported", "mars")])
def test_negative_input_contract_matches_exact_reason_and_body(code, body):
    episode = EpisodeConfig("unsupported", "known", {}, expected_outcome="request_rejected",
        expected_rejection_code="mission_propulsion_body_unsupported", expected_rejection_body_id="flora")
    passed, reasons, _ = DemoVerifier().verify(episode, {"status": "request_rejected",
        "error": {"code": code, "context": {"bodyId": body}}})
    assert passed is False
    assert "request_rejection_mismatch" in reasons


@pytest.mark.parametrize("logistics", [
    {"feasible": True, "totalUnmetDeltaV_km_s": 1, "returnCargoKg": 0},
    {"feasible": False, "totalUnmetDeltaV_km_s": 0, "returnCargoKg": 0},
    {"feasible": False, "totalUnmetDeltaV_km_s": 1, "returnCargoKg": 100},
])
def test_physical_negative_requires_empty_vehicle_burn_budget_evidence(logistics):
    episode = EpisodeConfig("negative", "known", {}, expected_outcome="vehicle_infeasible")
    result = {"status": "no_verified_candidate", "recommendation": None, "alternatives": [{
        "verification": {"valid": False, "reasons": ["vehicle_budget_not_feasible"]},
        "logistics": logistics}]}
    passed, reasons, _ = DemoVerifier().verify(episode, result)
    assert passed is False
    assert "missing_empty_vehicle_infeasibility_evidence" in reasons
