"""Reject unsupported optional recommendations in local episode-family policies.

Real local config, verifier and runner controls plus actual HTTP exclusion;
finite owned planner results only, no mission search or live provider.
"""
# Regression: MIS022 — unsupported False recommendation policy was silently accepted.
# Found by /qa on 2026-10-24.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
from copy import deepcopy
from dataclasses import replace

from fastapi.testclient import TestClient
import pytest
import server
from mission.epo.config import EpisodeConfig, EpisodeFamily, EpisodeFamilyPolicy
from mission.epo.runners import EpisodeRunner
from mission.epo.verifier import DemoVerifier

EPISODE = EpisodeConfig('owned', 'owned', {})
GOOD = {'status': 'ok', 'recommendation': {'missionScore': 100.0,
        'risk': {'failureProbability': 0.0}, 'verification': {'valid': True}}}


@pytest.mark.parametrize('entrypoint', ['constructor', 'merge'])
def test_proposed_unsupported_false_policy_rejects_explicitly(entrypoint):
    with pytest.raises(ValueError, match='require_recommendation'):
        if entrypoint == 'constructor':
            EpisodeFamilyPolicy(require_recommendation=False)
        else:
            EpisodeFamilyPolicy().merge_payload({'require_recommendation': False})


@pytest.mark.parametrize('explicit', [False, True], ids=['default', 'explicit-true'])
def test_supported_default_and_true_policy_remain_valid(explicit):
    policy = EpisodeFamilyPolicy(require_recommendation=True) if explicit else EpisodeFamilyPolicy()
    assert policy.require_recommendation is True


def test_other_policy_merge_fields_remain_supported():
    before = EpisodeFamilyPolicy()
    after = before.merge_payload({'min_mission_score': 42.0, 'max_failure_probability': 0.1,
                                  'require_verifier_valid': False})
    assert after.min_mission_score == 42.0
    assert after.max_failure_probability == 0.1
    assert after.require_verifier_valid is False
    assert after.require_recommendation is True
    assert before.min_mission_score is None


@pytest.mark.parametrize('explicit', [False, True], ids=['default', 'explicit-true'])
@pytest.mark.parametrize('case,reasons', [
    ('valid', []),
    ('missing', ['missing_recommendation', 'missing_mission_score', 'missing_failure_probability']),
    ('score', ['missing_mission_score']),
    ('risk', ['missing_failure_probability']),
    ('embedded', ['embedded_verifier_rejected']),
    ('status', ['planner_status_not_ok', 'planner_status_no_verified_candidate']),
])
def test_supported_policies_preserve_current_fail_closed_verifier(explicit, case, reasons):
    policy = EpisodeFamilyPolicy(require_recommendation=True) if explicit else EpisodeFamilyPolicy()
    result = deepcopy(GOOD)
    if case == 'missing': result['recommendation'] = None
    elif case == 'score': result['recommendation'].pop('missionScore')
    elif case == 'risk': result['recommendation'].pop('risk')
    elif case == 'embedded': result['recommendation']['verification']['valid'] = False
    elif case == 'status': result['status'] = 'no_verified_candidate'
    passed, actual, metrics = DemoVerifier({'owned': policy}).verify(EPISODE, result)
    assert passed is (not reasons)
    assert actual == reasons
    assert metrics['planner_status'] == result['status']


@pytest.mark.parametrize('explicit', [False, True], ids=['default', 'explicit-true'])
@pytest.mark.parametrize('missing', [False, True], ids=['valid', 'missing'])
def test_family_runner_preserves_known_pass_and_fail(explicit, missing):
    class OwnedPlanner:
        def plan(self, _payload):
            return {'status': 'ok', 'recommendation': None} if missing else deepcopy(GOOD)

    policy = EpisodeFamilyPolicy(require_recommendation=True) if explicit else EpisodeFamilyPolicy()
    runner = EpisodeRunner(bodies=[])
    runner.planner = OwnedPlanner()
    result = runner.run_family(EpisodeFamily('owned', 'test-owned finite result', policy, (EPISODE,)))
    assert result.passed == (0 if missing else 1)
    assert result.failed == (1 if missing else 0)
    assert result.exception_count == 0


@pytest.mark.parametrize('field', ['require_recommendation', 'requireRecommendation'])
def test_local_policy_option_is_not_an_http_mission_input(field, monkeypatch):
    attempts = []

    def forbidden(*_args, **_kwargs):
        attempts.append('work')
        raise AssertionError('unknown policy option must be rejected before work')

    monkeypatch.setattr(server, 'SOLAR_SECURITY_CONFIG', replace(server.SOLAR_SECURITY_CONFIG, profile='local'))
    monkeypatch.setattr(server.app, 'middleware_stack', None)
    monkeypatch.setattr(server, '_acquire_nonblocking', forbidden)
    monkeypatch.setattr(server, '_run_mission_plan', forbidden)
    client = TestClient(server.app)
    try:
        response = client.post('/mission/plan', json={'from_id': 'earth', 'target_id': 'mars',
            'return_id': 'earth', 'departure_jd': 2460500.5, 'ephemeris_provider': 'kepler',
            'assist_pool': [], 'max_assists': 0, field: False})
    finally:
        client.close()
    assert response.status_code == 422
    assert any(row['location'] == ['body', field] for row in response.json()['detail']['context']['errors'])
    assert field not in server.MissionPlanRequest.model_json_schema()['properties']
    assert attempts == []
