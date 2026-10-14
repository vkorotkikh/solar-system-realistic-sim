"""A family's policy applies through run_family exactly as through run_families (SCN-056)."""
from __future__ import annotations

from mission.epo.config import EpisodeConfig, EpisodeFamily, EpisodeFamilyPolicy
from mission.epo.runners import EpisodeRunner

VIOLATING_RESULT = {
    "status": "ok",
    "recommendation": {"missionScore": -100.0, "risk": {"failureProbability": 0.9}},
    "verification": {"valid": False},
}


class _StubPlanner:
    def plan(self, payload):
        return VIOLATING_RESULT


def _strict_family() -> EpisodeFamily:
    policy = EpisodeFamilyPolicy(min_mission_score=100.0, max_failure_probability=0.01, require_verifier_valid=True)
    return EpisodeFamily("strict", "audit", policy, (EpisodeConfig("one", "strict", {}),))


def _runner() -> EpisodeRunner:
    runner = EpisodeRunner()
    runner.planner = _StubPlanner()
    return runner


def test_run_family_enforces_the_family_policy() -> None:
    # Before the fix only run_families registered the policy, so this returned one pass.
    direct = _runner().run_family(_strict_family()).as_dict()
    aggregate = _runner().run_families([_strict_family()]).to_dict()["families"]["strict"]
    assert direct["failed"] == 1 and direct["passed"] == 0
    assert direct["failed"] == aggregate["failed"] and direct["passed"] == aggregate["passed"]
    assert direct["reason_counts"] == aggregate["reason_counts"]
    assert len(direct["reason_counts"]) == 3
