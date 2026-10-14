"""SCN-043 reference integrity only. Passing this does NOT certify propagated moon states."""
import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CATALOG = json.loads((ROOT / 'src/data/moons.json').read_text())
ORACLE = json.loads((ROOT / 'backend/tests/fixtures/all_moons_horizons_oracle.json').read_text())
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
