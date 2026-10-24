"""Regression: MIS-022 local family identity must reject before side effects.

Promoted from the reviewed 16-case native candidate; executable cases unchanged.
Found during the 2026-10-24 Markdown audit. Owned real Kepler planning only.
Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
"""
from copy import deepcopy
from dataclasses import replace
import math

import pytest

from mission.epo.config import EpisodeConfig, EpisodeFamily, EpisodeFamilyPolicy
from mission.epo.runners import EpisodeRunner


ERROR = "Episode family must match its owning family."
PAYLOAD = dict(
    from_id="earth", target_id="mars", return_id="earth", departure_jd=2460500.5,
    max_assists=0, ephemeris_provider="kepler", risk_samples=30, mining_days=10,
    storage_loss_rate_per_day=0,
    vehicle={"name": "ample", "stages": [dict(
        name="stage", dry_mass_kg=100, propellant_mass_kg=1000000, isp_s=10000)]},
)


def episode(identity="owned", *, number=0, descriptive_name="descriptive-only"):
    return EpisodeConfig(f"episode-{number}", identity, deepcopy(PAYLOAD),
                         family_name=descriptive_name)


def family(episodes, *, name="owned", reject=False):
    return EpisodeFamily(name, "test-owned native family",
                         EpisodeFamilyPolicy(min_mission_score=0.0 if reject else None,
                                             max_failure_probability=0.1),
                         tuple(episodes))


def invoke(runner, entrypoint, families):
    if entrypoint == "run_family":
        assert len(families) == 1
        return runner.run_family(families[0])
    return getattr(runner, entrypoint)(families)


@pytest.fixture
def observed_runner(monkeypatch):
    runner = EpisodeRunner()
    prior = EpisodeFamilyPolicy(min_mission_score=-1e100)
    foreign = EpisodeFamilyPolicy(min_mission_score=-1e100)
    runner.verifier.register_policy("owned", prior)
    runner.verifier.register_policy("other", foreign)
    state = {"runner": runner, "plans": [], "registrations": [],
             "results": [], "prior_registry": dict(runner.verifier._policies)}
    original_plan = runner.planner.plan
    original_register = runner.verifier.register_policy

    def observe_plan(payload, *args, **kwargs):
        state["plans"].append(deepcopy(payload))
        result = original_plan(payload, *args, **kwargs)
        state["results"].append(result)
        return result

    def observe_register(name, policy):
        state["registrations"].append((name, policy))
        return original_register(name, policy)

    monkeypatch.setattr(runner.planner, "plan", observe_plan)
    monkeypatch.setattr(runner.verifier, "register_policy", observe_register)
    return state


def assert_native_success(result):
    assert result["status"] == "ok"
    recommendation = result["recommendation"]
    assert recommendation["verification"]["valid"] is True
    assert recommendation["logistics"]["feasible"] is True
    assert recommendation["payloadClosure"]["returnedPayloadKg"] > 0
    assert recommendation["risk"]["failureProbability"] <= 0.1
    assert math.isfinite(recommendation["missionScore"])
    assert recommendation["missionScore"] < 0.0


@pytest.mark.parametrize("reject", [False, True], ids=["native-pass", "native-policy-reject"])
def test_matched_native_policy_and_descriptive_name_are_preserved(observed_runner, reject):
    state = observed_runner
    item = episode(descriptive_name="other")  # Display metadata is not a routing key.
    owned = family([item], reject=reject)
    before = deepcopy(owned)
    metrics = state["runner"].run_family(owned)
    assert len(state["plans"]) == len(state["results"]) == 1
    assert state["registrations"] == [("owned", owned.policy)]
    assert state["runner"].verifier._policies["owned"] is owned.policy
    assert_native_success(state["results"][0])
    assert metrics.passed == int(not reject)
    assert metrics.failed == int(reject)
    assert metrics.exception_count == 0
    assert metrics.records[0].verifier_passed is (not reject)
    if reject:
        assert len(metrics.records[0].reasons) == 1
        assert metrics.records[0].reasons[0].startswith("mission_score_below_threshold_")
    else:
        assert metrics.records[0].reasons == []
    assert owned == before and owned.episodes[0] is item
    assert item.family_name == "other" and item.family == "owned"


@pytest.mark.parametrize("entrypoint", ["run_family", "run_families", "run_summary"])
@pytest.mark.parametrize("position", [0, 1], ids=["mismatch-first", "mismatch-later"])
def test_mismatch_rejects_before_all_family_side_effects(observed_runner, entrypoint, position):
    state = observed_runner
    items = [episode(number=0), episode(number=1)]
    items[position] = replace(items[position], family="other")
    owned = family(items, reject=True)
    before = deepcopy(owned)
    # Config construction remains allowed; this is an execution-boundary contract.
    try:
        with pytest.raises(ValueError, match=r"^Episode family must match its owning family\.$") as caught:
            invoke(state["runner"], entrypoint, [owned])
        assert str(caught.value) == ERROR
    finally:
        assert state["registrations"] == []
        assert state["plans"] == [] and state["results"] == []
        assert state["runner"].verifier._policies == state["prior_registry"]
        assert all(state["runner"].verifier._policies[k] is v
                   for k, v in state["prior_registry"].items())
        assert owned == before


def test_empty_family_keeps_registration_and_summary_behavior(observed_runner):
    state = observed_runner
    owned = family([])
    result = state["runner"].run_summary([owned])
    assert state["registrations"] == [("owned", owned.policy)]
    assert state["runner"].verifier._policies["owned"] is owned.policy
    assert state["plans"] == [] and state["results"] == []
    assert result["totals"]["total"] == 0
    assert result["families"]["owned"] == {
        "family": "owned", "total": 0, "passed": 0, "failed": 0,
        "exception_count": 0, "average_score": None, "reason_counts": {},
    }


def test_sequential_shared_names_keep_policy_replacement(observed_runner):
    state = observed_runner
    first = family([episode(number=0)])
    second = family([episode(number=1)], reject=True)
    result = state["runner"].run_families([first, second])
    assert state["registrations"] == [("owned", first.policy), ("owned", second.policy)]
    assert state["runner"].verifier._policies["owned"] is second.policy
    assert len(state["plans"]) == len(state["results"]) == 2
    for native in state["results"]:
        assert_native_success(native)
    metrics = result.by_family["owned"]
    assert metrics.passed == metrics.failed == 1
    assert [record.verifier_passed for record in metrics.records] == [True, False]


@pytest.mark.parametrize("entrypoint", ["run_families", "run_summary"])
def test_earlier_valid_batch_family_effects_are_not_rolled_back(observed_runner, entrypoint):
    state = observed_runner
    first = family([episode("earlier")], name="earlier")
    invalid = family([episode(number=0), episode("other", number=1)], reject=True)
    try:
        with pytest.raises(ValueError, match=r"^Episode family must match its owning family\.$"):
            invoke(state["runner"], entrypoint, [first, invalid])
    finally:
        assert state["registrations"] == [("earlier", first.policy)]
        assert len(state["plans"]) == len(state["results"]) == 1
        assert_native_success(state["results"][0])
        expected = {**state["prior_registry"], "earlier": first.policy}
        assert state["runner"].verifier._policies == expected
        assert all(state["runner"].verifier._policies[k] is v for k, v in expected.items())


def test_bare_run_episode_remains_supported_without_family_registration(observed_runner):
    state = observed_runner
    record = state["runner"].run_episode(episode("unregistered"))
    assert record.verifier_passed is True and record.reasons == []
    assert state["registrations"] == []
    assert state["runner"].verifier._policies == state["prior_registry"]
    assert len(state["plans"]) == len(state["results"]) == 1
    assert_native_success(state["results"][0])


def test_config_assembly_and_replace_are_not_new_validation_boundaries():
    item = episode("other")
    owned = family([item])
    revised = replace(owned, description="still constructible")
    assert owned.episodes[0] is item and item.family == "other"
    assert revised.episodes is owned.episodes
    assert revised.name == "owned" and revised.description == "still constructible"


# Append-only author self-critique supplement. Original fourteen cases above stay exact.
def test_identity_supplement_equal_value_distinct_strings_remain_valid(observed_runner):
    state = observed_runner
    owner_name = "owned"
    embedded_name = "".join(["own", "ed"])
    assert embedded_name == owner_name and embedded_name is not owner_name
    item = episode(embedded_name)
    owned = family([item], name=owner_name)
    metrics = state["runner"].run_family(owned)
    assert metrics.passed == 1 and metrics.failed == 0 and metrics.exception_count == 0
    assert metrics.records[0].family == owner_name
    assert item.family is embedded_name and owned.name is owner_name
    assert state["registrations"] == [(owner_name, owned.policy)]
    assert len(state["plans"]) == len(state["results"]) == 1
    assert_native_success(state["results"][0])


def test_identity_supplement_case_and_whitespace_are_exact_mismatches(observed_runner):
    state = observed_runner
    errors = []
    # Exercise both spellings before the RED assertion; normalization is not key equality.
    for embedded_name in ("Owned", "owned "):
        owned = family([episode(embedded_name)])
        try:
            state["runner"].run_family(owned)
        except ValueError as exc:
            errors.append(str(exc))
        else:
            errors.append(None)
        assert owned.episodes[0].family == embedded_name and owned.name == "owned"
    assert errors == [ERROR, ERROR]
    assert state["registrations"] == []
    assert state["plans"] == [] and state["results"] == []
    assert state["runner"].verifier._policies == state["prior_registry"]
    assert all(state["runner"].verifier._policies[k] is v
               for k, v in state["prior_registry"].items())
