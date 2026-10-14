"""SCN-043 reference integrity only. Passing this does NOT certify propagated moon states."""
import json
import math
import base64
import hashlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CATALOG = json.loads((ROOT / 'src/data/moons.json').read_text())
ORACLE = json.loads((ROOT / 'backend/tests/fixtures/all_moons_horizons_oracle.json').read_text())
SPK_75052 = json.loads((ROOT / 'backend/tests/fixtures/uranus_75052_spk_capture.json').read_text())
SPK_DAPHNIS = json.loads((ROOT / 'backend/tests/fixtures/daphnis_legacy_spk_capture.json').read_text())
PARENTS = {'Earth': '399', 'Mars': '499', 'Jupiter': '599', 'Saturn': '699',
           'Uranus': '799', 'Neptune': '899', 'Pluto': '999'}


def test_oracle_accounts_for_every_catalog_moon_without_silent_omissions():
    assert len(CATALOG) == 424
    assert set(ORACLE['bodies']) == {str(m['id']) for m in CATALOG}
    assert ORACLE['coverage_scope'] == 'provider_vectors_only_model_accuracy_not_certified'


def test_partial_daphnis_capture_is_not_claimed_as_full_span():
    reference = next(row for row in ORACLE['bodies'].values() if row['name'] == 'Daphnis')
    assert reference['status'] == 'partial'
    assert '2018-JAN-17' in reference['error']
    assert reference['missing_jd_tdb'] == ORACLE['requested_jd_tdb'][5:]
    assert [row['jd_tdb'] for row in reference['states']] == ORACLE['requested_jd_tdb'][:5]
    assert reference['query']['COMMAND'] == '635'
    assert reference['query']['CENTER'] == '500@699'
    assert '(635)' in reference['headers']['Target body name']
    assert reference['query']['TIME_TYPE'] == 'TDB'
    assert reference['query']['VEC_CORR'] == 'NONE'
    assert reference['query']['REF_PLANE'] == 'ECLIPTIC'
    assert reference['query']['OUT_UNITS'] == 'AU-D'
    for row in reference['states']:
        assert all(math.isfinite(v) for v in row['position_au'] + row['velocity_au_per_day'])


def test_wrong_asteroid_response_is_not_accepted_as_a_uranian_moon():
    reference = next(row for row in ORACLE['bodies'].values() if row['name'] == 'S2025_U_1')
    assert reference['status'] == 'unavailable'
    assert '1999 UM50' in reference['error']
    assert 'states' not in reference


@pytest.mark.parametrize('moon', CATALOG, ids=lambda moon: moon['name'])
def test_independent_reference_provenance_and_seven_epochs(moon):
    reference = ORACLE['bodies'][str(moon['id'])]
    if str(moon['iauCode']) == '635':
        assert SPK_DAPHNIS['target'] == 635 and SPK_DAPHNIS['center'] == 699
        assert SPK_DAPHNIS['frame'] == 'ECLIPJ2000' and SPK_DAPHNIS['time_scale'] == 'TDB'
        assert SPK_DAPHNIS['corrections'] == 'NONE'
        assert SPK_DAPHNIS['source_quality'] == 'legacy_Cassini_fit_precessing_ellipse_SPK_type17_not_current_numerical_solution'
        payload = base64.b64decode(SPK_DAPHNIS['kernel_base64'], validate=True)
        assert len(payload) == SPK_DAPHNIS['kernel_bytes'] == 9216
        assert hashlib.sha256(payload).hexdigest() == SPK_DAPHNIS['sha256']
        assert [row['jd_tdb'] for row in SPK_DAPHNIS['states']] == ORACLE['requested_jd_tdb']
        for row in SPK_DAPHNIS['states']:
            assert all(math.isfinite(v) for v in row['position_au'] + row['velocity_au_per_day'])
        return
    if str(moon['iauCode']) == '75052':
        assert SPK_75052['target'] == 75052 and SPK_75052['center'] == 799
        assert SPK_75052['frame'] == 'ECLIPJ2000' and SPK_75052['timeScale'] == 'TDB'
        assert SPK_75052['corrections'] == 'NONE'
        assert SPK_75052['jds'] == ORACLE['requested_jd_tdb']
        assert [row['jdTdb'] for row in SPK_75052['states']] == ORACLE['requested_jd_tdb']
        for captured_range in SPK_75052['ranges']:
            payload = base64.b64decode(captured_range['base64'], validate=True)
            assert len(payload) == captured_range['length']
            assert hashlib.sha256(payload).hexdigest() == captured_range['sha256']
        for row in SPK_75052['states']:
            assert all(math.isfinite(v) for v in row['positionAu'] + row['velocityAuDay'])
        return
    if reference['status'] != 'captured':
        pytest.skip('Uncaptured independent reference: ' + reference['error'])
    assert reference['horizons_target_id'] == moon['iauCode']
    query = reference['query']
    assert query['COMMAND'] == str(moon['iauCode'])
    assert query['CENTER'] == '500@' + PARENTS[moon['planet']]
    assert query['REF_PLANE'] == 'ECLIPTIC'
    assert query['REF_SYSTEM'] == 'ICRF'
    assert query['TIME_TYPE'] == 'TDB'
    assert query['VEC_CORR'] == 'NONE'
    assert query['OUT_UNITS'] == 'AU-D'
    assert len(reference['response_sha256']) == 64
    assert [row['jd_tdb'] for row in reference['states']] == ORACLE['requested_jd_tdb']
    assert len(reference['states']) == 7
    for row in reference['states']:
        assert len(row['position_au']) == len(row['velocity_au_per_day']) == 3
        assert all(math.isfinite(v) for v in row['position_au'] + row['velocity_au_per_day'])


def test_native_daphnis_reference_has_real_piecewise_discontinuities():
    """Do not misrepresent this legacy provider as a continuous numerical orbit."""
    pytest.importorskip('spiceypy')
    import importlib.util
    import numpy as np
    spec = importlib.util.spec_from_file_location('daphnis_reference', ROOT / 'scripts/capture_daphnis_spk_oracle.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for jd, minimum_km, minimum_m_s in [(2455197.5, 640, 79), (2457388.5, 160, 20)]:
        rows = module.evaluate(SPK_DAPHNIS, [jd - 1e-6, jd + 1e-6])
        position = np.array([row['position_au'] for row in rows]) * module.AU_KM
        velocity = np.array([row['velocity_au_per_day'] for row in rows]) * module.AU_KM / 86400
        jump = position[1] - position[0] - (velocity[0] + velocity[1]) * 1e-6 * 86400
        assert np.linalg.norm(jump) > minimum_km
        assert np.linalg.norm(velocity[1] - velocity[0]) * 1000 > minimum_m_s
