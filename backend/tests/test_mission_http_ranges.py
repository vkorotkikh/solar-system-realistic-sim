"""MIS010/011 PartA: real HTTP admission, finite worker, real parser/services.

No trajectory search/provider; a test-owned worker
observes actual parser, vehicle, mining, and Random risk service outputs.
Contract: reject ten outside-modeled-range values before permits/submission;
retain supported boundaries, direct compatibility, configured413 and OpenAPI.
Each capture is externally bounded; this module never invokes a live provider.
MIS-010 / MIS-011: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
"""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import math
import threading

from fastapi.testclient import TestClient
import pytest

import server
from mission.schemas import parse_mission_request
from mission.mining_service import MiningService
from mission.risk_service import RiskService
from mission.vehicle_service import VehicleDefinition, StageDefinition, VehicleService

BASE = {
    'from_id': 'earth', 'target_id': 'mars', 'return_id': 'earth',
    'departure_jd': 2460500.5, 'ephemeris_provider': 'kepler',
    'assist_pool': [], 'max_assists': 0, 'mining_days': 1.0,
    'available_power_kw': 1e-10, 'extraction_rate_kg_day': 1.0,
    'ore_grade': 1.0, 'refining_yield': 1.0, 'storage_loss_rate_per_day': 0.0,
    'risk_samples': 30,
}
DEFAULTS = {'reserve_fraction': 0.06, 'handling_loss_fraction': 0.04,
            'risk_samples': 240, 'payload_mass_kg': 6500.0,
            'power_required_kw_per_kg_day': 0.24}


class CountingGuard:
    def __init__(self):
        self.inner = threading.BoundedSemaphore(1)
        self.acquisitions = 0
        self.releases = 0

    def acquire(self, *args, **kwargs):
        self.acquisitions += 1
        return self.inner.acquire(*args, **kwargs)

    def release(self):
        self.releases += 1
        return self.inner.release()


class CountingExecutor(ThreadPoolExecutor):
    def __init__(self):
        super().__init__(max_workers=1)
        self.submissions = 0

    def submit(self, *args, **kwargs):
        self.submissions += 1
        return super().submit(*args, **kwargs)


@pytest.fixture
def endpoint(monkeypatch):
    calls = []
    guard = CountingGuard()

    def finite_worker(payload, context):
        context.checkpoint()
        normalized = parse_mission_request(payload).to_dict()
        sample_calls = 0

        def reclose(_delta_v, _cargo):
            nonlocal sample_calls
            sample_calls += 1
            return {'feasible': True, 'propellantMarginKg': 1.0}

        risk = RiskService().run_monte_carlo(
            base_total_delta_v_km_s=1.0, base_total_time_days=1.0,
            base_returned_payload_kg=1.0, base_arrival_jd=2460500.5,
            reclose=reclose, samples=normalized['risk_samples'], seed=normalized['risk_seed'])
        mining = MiningService().evaluate_campaign(
            target_body_id=normalized['target_id'], transport_delay_days=0.0,
            **{key: normalized[key] for key in (
                'mining_days', 'ore_grade', 'extraction_rate_kg_day', 'refining_yield',
                'storage_loss_rate_per_day', 'available_power_kw', 'power_required_kw_per_kg_day')})
        vehicle = VehicleService().evaluate_burn_budget(
            VehicleDefinition('owned', [StageDefinition('one', 10.0, 100.0, 300.0)]),
            payload_mass_kg=normalized['payload_mass_kg'], burns_km_s=[],
            reserve_fraction=normalized['reserve_fraction'])
        handling = MiningService().payload_return_closure(
            {'storablePayloadKg': 100.0}, outbound_propellant_kg=0.0,
            return_propellant_kg=0.0, return_capacity_kg=100.0,
            handling_loss_fraction=normalized['handling_loss_fraction'])
        observation = {'received': payload, 'normalized': normalized, 'vehicle': vehicle,
                       'mining': mining, 'handling': handling, 'risk': risk, 'sample_calls': sample_calls}
        calls.append(observation)
        return {'recommendation': {'outbound': {}}, 'observation': observation}

    monkeypatch.setattr(server, 'SOLAR_SECURITY_CONFIG', replace(server.SOLAR_SECURITY_CONFIG, profile='local'))
    monkeypatch.setattr(server.app, 'middleware_stack', None)
    monkeypatch.setattr(server.app, 'openapi_schema', None)
    monkeypatch.setattr(server, 'MISSION_PLAN_MAX_RISK_SAMPLES', 5000)
    monkeypatch.setattr(server, '_mission_plan_concurrent_guard', guard)
    monkeypatch.setattr(server, '_run_mission_plan', finite_worker)
    with CountingExecutor() as executor:
        monkeypatch.setattr(server, '_heavy_compute_executor', executor)
        client = TestClient(server.app)
        try:
            yield client, guard, executor, calls
        finally:
            client.close()


def no_work(endpoint):
    _client, guard, executor, calls = endpoint
    return {'permit_attempts': guard.acquisitions, 'submissions': executor.submissions, 'worker_calls': len(calls)}


@pytest.mark.parametrize('field,value', [
    ('reserve_fraction', math.nextafter(0.4, math.inf)), ('reserve_fraction', 0.9),
    ('handling_loss_fraction', math.nextafter(0.6, math.inf)), ('handling_loss_fraction', 0.9),
    ('risk_samples', 1), ('risk_samples', 29),
    ('payload_mass_kg', 0.25), ('payload_mass_kg', math.nextafter(1.0, 0.0)),
    ('power_required_kw_per_kg_day', 1e-12), ('power_required_kw_per_kg_day', math.nextafter(1e-9, 0.0)),
], ids=['reserve-next-outside', 'reserve-nine-tenths', 'handling-next-outside', 'handling-nine-tenths',
        'risk-one', 'risk-below-thirty', 'payload-quarter', 'payload-next-outside', 'cost-tiny', 'cost-next-outside'])
def test_outside_modeled_http_range_rejects_before_admission(endpoint, field, value):
    client, _guard, _executor, _calls = endpoint
    response = client.post('/mission/plan', json={**BASE, field: value})
    observed = no_work(endpoint)
    assert (response.status_code, observed) == (
        422, {'permit_attempts': 0, 'submissions': 0, 'worker_calls': 0}), response.text
    detail = response.json()['detail']
    assert detail['code'] == 'trajectory_request_validation_error'
    assert detail['retryable'] is False
    assert any(error['location'] == ['body', field] for error in detail['context']['errors'])


@pytest.mark.parametrize('field,value', [
    ('reserve_fraction', 0.0), ('reserve_fraction', math.nextafter(0.0, math.inf)),
    ('reserve_fraction', math.nextafter(0.4, 0.0)), ('reserve_fraction', 0.4),
    ('handling_loss_fraction', 0.0), ('handling_loss_fraction', math.nextafter(0.0, math.inf)),
    ('handling_loss_fraction', math.nextafter(0.6, 0.0)), ('handling_loss_fraction', 0.6),
    ('risk_samples', 30), ('risk_samples', 31), ('risk_samples', 5000),
    ('payload_mass_kg', 1.0), ('payload_mass_kg', math.nextafter(1.0, math.inf)), ('payload_mass_kg', 6500.0),
    ('power_required_kw_per_kg_day', 1e-9), ('power_required_kw_per_kg_day', math.nextafter(1e-9, math.inf)),
    ('power_required_kw_per_kg_day', 0.24),
], ids=['reserve-zero', 'reserve-next-positive', 'reserve-next-inside', 'reserve-maximum',
        'handling-zero', 'handling-next-positive', 'handling-next-inside', 'handling-maximum',
        'risk-minimum', 'risk-next-inside', 'risk-work-maximum',
        'payload-minimum', 'payload-next-inside', 'payload-default',
        'cost-minimum', 'cost-next-inside', 'cost-default'])
def test_supported_boundaries_reach_parser_and_services_unchanged(endpoint, field, value):
    client, _guard, _executor, calls = endpoint
    response = client.post('/mission/plan', json={**BASE, field: value})
    assert response.status_code == 200, response.text
    assert no_work(endpoint) == {'permit_attempts': 1, 'submissions': 1, 'worker_calls': 1}
    row, = calls
    assert row['received'][field] == value
    assert row['normalized'][field] == value
    assert row['vehicle']['reserveFraction'] == row['received']['reserve_fraction']
    assert row['vehicle']['payloadMassKg'] == row['received']['payload_mass_kg']
    assert row['handling']['handlingLossFraction'] == row['received']['handling_loss_fraction']
    assert row['mining']['power']['requiredKwPerKgDay'] == row['received']['power_required_kw_per_kg_day']
    assert row['risk']['samples'] == row['sample_calls'] == row['received']['risk_samples']
    expected_extraction = min(1.0, 1e-10 / row['received']['power_required_kw_per_kg_day'])
    assert row['mining']['effectiveExtractionRateKgDay'] == pytest.approx(expected_extraction, rel=1e-14)


def test_valid_defaults_reach_services_unchanged(endpoint):
    client, _guard, _executor, calls = endpoint
    payload = {key: value for key, value in BASE.items() if key != 'risk_samples'}
    response = client.post('/mission/plan', json=payload)
    assert response.status_code == 200, response.text
    row, = calls
    assert {key: row['received'][key] for key in DEFAULTS} == DEFAULTS
    assert {key: row['normalized'][key] for key in DEFAULTS} == DEFAULTS
    assert row['risk']['samples'] == row['sample_calls'] == 240


@pytest.mark.parametrize('field,value', [
    ('reserve_fraction', -1.0), ('reserve_fraction', 1.1),
    ('handling_loss_fraction', -1.0), ('handling_loss_fraction', 1.1),
    ('risk_samples', 0), ('payload_mass_kg', 0.0), ('power_required_kw_per_kg_day', 0.0),
])
def test_existing_invalid_http_ranges_stay_422_without_work(endpoint, field, value):
    client, _guard, _executor, _calls = endpoint
    response = client.post('/mission/plan', json={**BASE, field: value})
    assert response.status_code == 422
    detail = response.json()['detail']
    assert detail['code'] == 'trajectory_request_validation_error'
    assert detail['retryable'] is False
    assert any(error['location'] == ['body', field] for error in detail['context']['errors'])
    assert no_work(endpoint) == {'permit_attempts': 0, 'submissions': 0, 'worker_calls': 0}


@pytest.mark.parametrize('cap,value', [(5000, 5001), (50, 51)], ids=['hard-default-cap', 'configured-lower-cap'])
def test_risk_complexity_limit_remains_413_before_admission(endpoint, monkeypatch, cap, value):
    client, _guard, _executor, _calls = endpoint
    monkeypatch.setattr(server, 'MISSION_PLAN_MAX_RISK_SAMPLES', cap)
    response = client.post('/mission/plan', json={**BASE, 'risk_samples': value})
    assert response.status_code == 413, response.text
    assert response.json()['detail']['code'] == 'mission_complexity_limit'
    assert response.json()['detail']['context']['maximumRiskSamples'] == cap
    assert no_work(endpoint) == {'permit_attempts': 0, 'submissions': 0, 'worker_calls': 0}


def test_exact_configured_risk_cap_still_admits_exact_work(endpoint, monkeypatch):
    client, _guard, _executor, calls = endpoint
    monkeypatch.setattr(server, 'MISSION_PLAN_MAX_RISK_SAMPLES', 50)
    response = client.post('/mission/plan', json={**BASE, 'risk_samples': 50})
    assert response.status_code == 200, response.text
    row, = calls
    assert row['sample_calls'] == row['risk']['samples'] == 50


@pytest.mark.parametrize('field,keyword,bound', [
    ('reserve_fraction', 'maximum', 0.4), ('handling_loss_fraction', 'maximum', 0.6),
    ('risk_samples', 'minimum', 30), ('payload_mass_kg', 'minimum', 1.0),
    ('power_required_kw_per_kg_day', 'minimum', 1e-9),
])
def test_openapi_publishes_supported_not_silently_rewritten_ranges(endpoint, field, keyword, bound):
    client, _guard, _executor, _calls = endpoint
    response = client.get('/openapi.json')
    assert response.status_code == 200
    properties = response.json()['components']['schemas']['MissionPlanRequest']['properties']
    assert properties[field].get(keyword) == bound
    assert properties[field]['default'] == DEFAULTS[field]
    assert 'maximum' not in properties['risk_samples']  # configured admission retains413
    assert no_work(endpoint) == {'permit_attempts': 0, 'submissions': 0, 'worker_calls': 0}


def test_legacy_direct_parser_clamps_are_not_changed_by_http_policy():
    # Nonplant direct clamps remain compatible. MIS-012 now rejects unsupported
    # plant costs separately (test_mission_plant_cost.py), so use a supported cost.
    parsed = parse_mission_request({'reserve_fraction': 0.9, 'handling_loss_fraction': 0.9,
        'risk_samples': 1, 'payload_mass_kg': 0.25, 'power_required_kw_per_kg_day': 0.24})
    assert (parsed.reserve_fraction, parsed.handling_loss_fraction, parsed.risk_samples,
            parsed.payload_mass_kg, parsed.power_required_kw_per_kg_day) == (0.4, 0.6, 30, 1.0, 0.24)
    assert parse_mission_request({'risk_samples': 5001}).risk_samples == 5000
