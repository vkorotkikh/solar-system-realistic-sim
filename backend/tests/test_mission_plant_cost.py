"""MIS012 PartB direct plant-cost regression, independent literal bounds.

Charter: real parser and MiningService reject unsupported numeric plant costs,
without changing missing defaults, supported coercions, zero available power or
unrelated legacy clamps. The actual HTTP zero rejection is an existing control.
Parser conversion failures retain their legacy0.24 fallback; direct service
conversion failures retain their original exception types. Only normalized
finite numeric costs below1e-9 and nonfinite converted costs are rejected.
No remote services, planner search or unbounded numerical work.
MIS-012: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
"""
from dataclasses import replace
import math

from fastapi.testclient import TestClient
import pytest

import server
from mission.mining_service import MiningService
from mission.schemas import parse_mission_request

CAMPAIGN = {
    'target_body_id': 'mars', 'mining_days': 1.0, 'ore_grade': 1.0,
    'extraction_rate_kg_day': 1.0, 'refining_yield': 1.0,
    'storage_loss_rate_per_day': 0.0, 'available_power_kw': 1e-10,
    'power_required_kw_per_kg_day': 0.24, 'transport_delay_days': 0.0,
}
BAD_COSTS = [0.0, -0.0, -1.0, 1e-12, math.nextafter(1e-9, 0.0),
             float('nan'), float('inf'), float('-inf')]
BAD_IDS = ['zero', 'negative-zero', 'negative', 'tiny-positive', 'next-below-minimum',
           'nan', 'positive-infinity', 'negative-infinity']


def evaluate(entrypoint, cost, **overrides):
    values = {**CAMPAIGN, 'power_required_kw_per_kg_day': cost, **overrides}
    if entrypoint == 'parser':
        # Exercise the public parser then real service, not a synthetic model.
        parsed = parse_mission_request({
            **{key: value for key, value in values.items()
               if key not in ('target_body_id', 'transport_delay_days')},
            'target_id': values['target_body_id'],
        })
        values = {key: getattr(parsed, key) for key in CAMPAIGN
                  if key not in ('target_body_id', 'transport_delay_days')}
        values.update(target_body_id=parsed.target_id,
                      transport_delay_days=overrides.get('transport_delay_days', 0.0))
    return MiningService().evaluate_campaign(**values)


@pytest.mark.parametrize('entrypoint', ['parser', 'service'])
@pytest.mark.parametrize('cost', BAD_COSTS, ids=BAD_IDS)
def test_unsupported_numeric_plant_cost_fails_closed(entrypoint, cost):
    with pytest.raises(ValueError):
        if entrypoint == 'parser':
            # Do not allow the downstream service to hide a parser failure.
            parse_mission_request({'power_required_kw_per_kg_day': cost})
        else:
            MiningService().evaluate_campaign(**{**CAMPAIGN, 'power_required_kw_per_kg_day': cost})


@pytest.mark.parametrize('entrypoint', ['parser', 'service'])
@pytest.mark.parametrize('cost', [1e-9, math.nextafter(1e-9, math.inf), 0.24, 2.0],
                         ids=['minimum', 'next-supported', 'default-cost', 'ordinary'])
def test_supported_cost_remains_exact_finite_and_power_limited(entrypoint, cost):
    result = evaluate(entrypoint, cost)
    assert result['power']['requiredKwPerKgDay'] == cost
    expected_rate = min(1.0, 1e-10 / cost)
    for field in ['effectiveExtractionRateKgDay', 'rawOreKg', 'refinedProductKg', 'storablePayloadKg']:
        assert result[field] == pytest.approx(expected_rate, rel=1e-14)
        assert math.isfinite(result[field])
    assert math.isfinite(result['power']['powerLimitedRateKgDay'])


@pytest.mark.parametrize('entrypoint', ['parser', 'service'])
@pytest.mark.parametrize('cost,expected', [('0.24', 0.24), ('1e-9', 1e-9)])
def test_supported_numeric_text_retains_direct_compatibility(entrypoint, cost, expected):
    result = evaluate(entrypoint, cost)
    assert result['power']['requiredKwPerKgDay'] == expected


def test_missing_parser_cost_still_defaults_to_point_two_four():
    parsed = parse_mission_request({})
    assert parsed.power_required_kw_per_kg_day == 0.24
    result = evaluate('service', parsed.power_required_kw_per_kg_day)
    assert result['power']['requiredKwPerKgDay'] == 0.24


@pytest.mark.parametrize('cost', [None, 'invalid', 10**400],
                         ids=['explicit-none', 'invalid-text', 'integer-float-overflow'])
def test_parser_conversion_failure_retains_legacy_default(cost):
    parsed = parse_mission_request({'power_required_kw_per_kg_day': cost})
    assert parsed.power_required_kw_per_kg_day == 0.24
    assert evaluate('parser', cost)['power']['requiredKwPerKgDay'] == 0.24


@pytest.mark.parametrize('cost,expected_exception', [
    (None, TypeError), ('invalid', ValueError), (10**400, OverflowError),
], ids=['explicit-none', 'invalid-text', 'integer-float-overflow'])
def test_service_conversion_failure_retains_legacy_exception(cost, expected_exception):
    with pytest.raises(expected_exception) as raised:
        evaluate('service', cost)
    assert type(raised.value) is expected_exception


@pytest.mark.parametrize('entrypoint', ['parser', 'service'])
def test_zero_available_power_is_valid_zero_yield(entrypoint):
    result = evaluate(entrypoint, 1e-9, available_power_kw=0.0)
    assert result['power'] == {'availableKw': 0.0, 'requiredKwPerKgDay': 1e-9,
                               'powerLimitedRateKgDay': 0.0}
    for field in ['effectiveExtractionRateKgDay', 'rawOreKg', 'refinedProductKg', 'storablePayloadKg']:
        assert result[field] == 0.0


def test_nonplant_direct_parser_clamps_stay_compatible():
    parsed = parse_mission_request({'power_required_kw_per_kg_day': 0.24,
        'reserve_fraction': 0.9, 'handling_loss_fraction': 0.9,
        'risk_samples': 1, 'payload_mass_kg': 0.25,
        'mining_days': -1.0, 'ore_grade': 2.0, 'extraction_rate_kg_day': -1.0,
        'refining_yield': -1.0, 'storage_loss_rate_per_day': -1.0, 'available_power_kw': -1.0})
    assert (parsed.reserve_fraction, parsed.handling_loss_fraction, parsed.risk_samples,
            parsed.payload_mass_kg) == (0.4, 0.6, 30, 1.0)
    assert (parsed.mining_days, parsed.ore_grade, parsed.extraction_rate_kg_day,
            parsed.refining_yield, parsed.storage_loss_rate_per_day, parsed.available_power_kw) == (0, 1, 0, 0, 0, 0)
    assert parsed.power_required_kw_per_kg_day == 0.24


def test_nonplant_direct_service_clamps_stay_compatible():
    result = evaluate('service', 0.24, mining_days=-1.0, ore_grade=2.0,
        extraction_rate_kg_day=-1.0, refining_yield=-1.0,
        storage_loss_rate_per_day=-1.0, available_power_kw=-1.0, transport_delay_days=-1.0)
    assert {key: result[key] for key in ['miningDays', 'oreGrade', 'extractionRateKgDay',
        'refiningYield', 'storageLossRatePerDay', 'transportDelayDays']} == {
        'miningDays': 0.0, 'oreGrade': 1.0, 'extractionRateKgDay': 0.0,
        'refiningYield': 0.0, 'storageLossRatePerDay': 0.0, 'transportDelayDays': 0.0}
    assert result['power']['availableKw'] == result['storablePayloadKg'] == 0.0
    assert result['power']['requiredKwPerKgDay'] == 0.24


def test_http_zero_cost_is_already_rejected_before_admission(monkeypatch):
    observed = []

    def forbidden(*_args, **_kwargs):
        observed.append('unexpected work')
        raise AssertionError('zero plant cost must fail HTTP validation before mission work')

    monkeypatch.setattr(server, 'SOLAR_SECURITY_CONFIG', replace(server.SOLAR_SECURITY_CONFIG, profile='local'))
    monkeypatch.setattr(server.app, 'middleware_stack', None)
    monkeypatch.setattr(server, '_acquire_nonblocking', forbidden)
    monkeypatch.setattr(server, '_run_mission_plan', forbidden)
    client = TestClient(server.app)
    try:
        response = client.post('/mission/plan', json={
            'from_id': 'earth', 'target_id': 'mars', 'return_id': 'earth',
            'departure_jd': 2460500.5, 'ephemeris_provider': 'kepler',
            'assist_pool': [], 'max_assists': 0, 'power_required_kw_per_kg_day': 0.0})
    finally:
        client.close()
    assert response.status_code == 422
    detail = response.json()['detail']
    assert detail['code'] == 'trajectory_request_validation_error'
    assert detail['retryable'] is False
    assert any(error['location'] == ['body', 'power_required_kw_per_kg_day']
               for error in detail['context']['errors'])
    assert observed == []
