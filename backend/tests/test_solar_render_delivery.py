"""HTTP delivery budget and conditional geometry, using actual model output."""
import copy
import hashlib
import json

from fastapi.testclient import TestClient
import pytest

import server
from sim.solar_process_worker import build_solar_physics_state
from sim.solar_physics import SolarCoronaPhysicsModel


@pytest.fixture(scope='module')
def model_state():
    return build_solar_physics_state(
        SolarCoronaPhysicsModel(seed=17, base_tube_count=540),
        epoch_jd_tdb=2460000.5, wall_epoch_jd_tdb=2460000.5,
        fidelity='high', max_features=180, forcing='hybrid', live_data=True,
    )


@pytest.fixture
def endpoint(monkeypatch, model_state):
    class Runner:
        async def run(self, payload, *, timeout_seconds):
            state = copy.deepcopy(model_state)
            state['epoch_jd_tdb'] = state['epoch_jd'] = payload['epoch_jd_tdb']
            return state
    monkeypatch.setattr(server, '_solar_physics_runner', Runner())
    monkeypatch.setattr(server, '_solar_physics_rate_locks', {})
    return TestClient(server.app)


def test_http_full_update_reuse_and_reconnect_preserve_latest_state(endpoint, model_state):
    query = dict(jd_tdb=2460000.5, fidelity='high', max_features=180,
                 forcing='hybrid', delivery='render-v1')
    first = endpoint.get('/solar/physics', params=query)
    assert first.status_code == 200
    assert first.headers.get('content-encoding') == 'gzip'
    assert int(first.headers['content-length']) <= 512 * 1024
    payload = first.json()
    assert payload['delivery']['geometry_included'] is True
    version = payload['delivery']['geometry_version']
    assert len(version) == 64
    for key in model_state:
        assert payload[key] == json.loads(json.dumps(model_state[key]))
    # Even when all geometry stays fixed, scalar freshness must update.
    model_state['activity_index'] = 0.123
    model_state['wall_epoch_jd_tdb'] = model_state['wall_epoch_jd'] = 2460001.5
    second = endpoint.get('/solar/physics', params={**query, 'geometry_version': version})
    assert second.status_code == 200
    assert int(second.headers['content-length']) < 16 * 1024
    reused = second.json()
    assert reused['activity_index'] == 0.123
    assert reused['wall_epoch_jd_tdb'] == 2460001.5
    assert reused['delivery']['geometry_included'] is False
    assert 'features' not in reused['corona']
    assert 'lines' not in reused['pfss_field_lines']
    assert 'lines' not in reused['heliosphere']['parker_spiral']
    # A changed geometry must replace the cached arrays, never label them reused.
    model_state['corona']['features'][0]['arc'][0][0] += 0.001
    updated = endpoint.get('/solar/physics', params={**query, 'geometry_version': version}).json()
    assert updated['delivery']['geometry_included'] is True
    assert updated['delivery']['geometry_version'] != version
    assert updated['corona']['features'][0]['arc'][0] == model_state['corona']['features'][0]['arc'][0]
    reconnect = endpoint.get('/solar/physics', params=query).json()
    assert reconnect['delivery']['geometry_included'] is True
    assert reconnect['fallback_reason'] == 'disabled_unvalidated'
    assert reconnect['forcing_status']['runtime_eligible'] is False


def test_delivery_rejects_unsupported_versions_before_computing(endpoint):
    assert endpoint.get('/solar/physics', params={'delivery': 'render-v9'}).status_code == 400


def test_delivery_rejects_oversize_bodies_without_silently_dropping_geometry(endpoint, model_state):
    # Deliberately uncompressible metadata must trip the encoded budget too.
    model_state['oversize'] = ''.join(hashlib.sha256(str(i).encode()).hexdigest() for i in range(16000))
    response = endpoint.get('/solar/physics', params={
        'jd_tdb': 2460000.5, 'forcing': 'hybrid', 'delivery': 'render-v1',
    })
    assert response.status_code == 413
    assert response.json()['detail']['code'] == 'solar_delivery_budget_exceeded'


def test_decoded_budget_rejects_compressible_oversize(endpoint, model_state):
    model_state['oversize'] = 'x' * (2 * 1024 * 1024)
    response = endpoint.get('/solar/physics', params={
        'jd_tdb': 2460000.5, 'forcing': 'hybrid', 'delivery': 'render-v1',
    })
    assert response.status_code == 413
    assert response.json()['detail']['code'] == 'solar_delivery_budget_exceeded'
