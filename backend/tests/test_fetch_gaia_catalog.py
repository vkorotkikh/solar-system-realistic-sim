"""EXO-026 regressions: exact Gaia identity through parsing and real disk caches.

Source: https://irsa.ipac.caltech.edu/data/Gaia/dr3/gaia_dr3_source_colDescriptions.html
Gaia DR3 source_id is a long integer, unlike its physical floating-point fields.
"""
# Regression: EXO-026 — float decoding rounded Gaia identifiers before catalog naming.
# Found by /qa on 2026-10-24; report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
from copy import deepcopy
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import URLError

import pytest

ROOT = Path(__file__).resolve().parents[2]
ESA = 'https://gea.esac.esa.int/tap-server/tap/sync'
VIZIER = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync'
IDENTITIES = ['4472832130942575872', '5853498713190525696',
              '9007199254740992', '9007199254740993', '9007199254740994']
CSV_HEADER = 'source_id,ra,dec,parallax,parallax_error,pmra,pmdec,radial_velocity,phot_g_mean_mag,bp_rp\n'
EXACT_CSV = CSV_HEADER + ''.join(f'{identity},{10 + index * 30},20,200,0.1,1,2,3,4,0.5\n'
                               for index, identity in enumerate(IDENTITIES))
PHYSICAL = {'ra': 10.0, 'dec': 20.0, 'parallax': 200.0, 'parallax_error': 0.1,
            'pmra': 1.0, 'pmdec': 2.0, 'radial_velocity': 3.0,
            'phot_g_mean_mag': 4.0, 'bp_rp': 0.5}
EXISTING = {'rank': '4', 'sys_id': '7', 'catalog_name': 'Known nearby star',
            'identifier': 'Known nearby star', 'ra_deg': '200', 'dec_deg': '-20'}


@pytest.fixture
def gaia(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, 'path', list(sys.path))
    spec = importlib.util.spec_from_file_location('fetch_gaia_catalog_test', ROOT / 'scripts/fetch_gaia_catalog.py')
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'CACHE_DIR', tmp_path / 'cache')
    monkeypatch.setattr(module, 'FALLBACK_DIR', tmp_path / 'fallback')

    def unexpected_network(*args, **kwargs):
        raise AssertionError('test has no owned HTTP response for this call')

    monkeypatch.setattr(module, 'http_get', unexpected_network)
    return module


def owned_http_sequence(module, monkeypatch, expected):
    calls = []

    def owned_http(url, *, params, timeout):
        index = len(calls)
        assert index < len(expected), 'unexpected additional HTTP call'
        wanted_url, outcome = expected[index]
        assert url == wanted_url
        assert set(params) == {'REQUEST', 'LANG', 'FORMAT', 'QUERY'}
        assert params['REQUEST'] == 'doQuery'
        assert params['LANG'] == 'ADQL'
        assert params['FORMAT'] == 'csv'
        assert 'FROM gaiadr3.gaia_source' in params['QUERY']
        assert timeout == 120.0
        calls.append((url, deepcopy(params)))
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(module, 'http_get', owned_http)
    return calls


def test_csv_source_ids_emit_exact_distinct_identifiers(gaia):
    rows = gaia._parse_gaia_csv(EXACT_CSV)
    result = gaia.cross_match_nearby([], rows)
    assert [row['identifier'] for row in result] == [f'Gaia DR3 {identity}' for identity in IDENTITIES]
    assert len({row['identifier'] for row in result}) == 5
    assert [str(row['source_id']) for row in rows] == IDENTITIES
    assert all(type(row['source_id']) in (int, str) for row in rows)


@pytest.mark.parametrize('supplied, expected', [
    (4472832130942575872, '4472832130942575872'),
    ('4472832130942575872', '4472832130942575872'),
    (5853498713190525696, '5853498713190525696'),
    ('5853498713190525696', '5853498713190525696'),
    (9007199254740993, '9007199254740993'),
    ('9007199254740993', '9007199254740993'),
    (-7, '-7'), ('-7', '-7'), ('+00042', '42'), (' 42 ', '42'),
    ('4_472_832_130_942_575_872', '4472832130942575872'), ('١٢٣', '123'),
], ids=['first-int', 'first-text', 'second-int', 'second-text', 'above-2p53-int',
        'above-2p53-text', 'negative-int', 'negative-text', 'signed-padding', 'whitespace',
        'underscore-integer', 'unicode-integer'])
def test_exact_supplied_decimal_identity_is_preserved(gaia, supplied, expected):
    result = gaia.cross_match_nearby([], [{**PHYSICAL, 'source_id': supplied}])
    assert len(result) == 1
    assert result[0]['identifier'] == f'Gaia DR3 {expected}'
    assert result[0]['catalog_name'] == f'Gaia DR3 {expected}'


@pytest.mark.parametrize('supplied', [
    None, '', 'null', 'not-an-id', '42.0', '4.2e1', 42.5, 42.0,
    float(4472832130942575872), float('nan'), float('inf'), True, False, 0, '0',
], ids=['missing', 'blank', 'null-text', 'malformed', 'fraction-text', 'exponent-text',
        'fraction-float', 'integral-float', 'rounded-large-float', 'nan', 'infinity',
        'true', 'false', 'zero-int', 'zero-text'])
def test_unsupported_or_missing_identity_keeps_the_star_with_a_safe_name(gaia, supplied):
    result = gaia.cross_match_nearby([dict(EXISTING)], [{**PHYSICAL, 'source_id': supplied}])
    assert len(result) == 2
    assert result[0] == EXISTING
    assert result[1]['identifier'] == 'Gaia-nearby-8'
    assert result[1]['catalog_name'] == 'Gaia-nearby-8'
    assert result[1]['rank'] == '5'
    assert result[1]['sys_id'] == '8'
    assert result[1]['distance_pc'] == '5.0000'
    assert result[1]['parallax_mas'] == '200.0000'


@pytest.mark.parametrize('source_id', ['', 'null', 'not-an-id', '42.0', '4.2e1', 'NaN', 'inf', '-inf', '0'],
                         ids=['blank', 'null', 'malformed', 'fraction', 'exponent', 'nan', 'infinity', 'negative-infinity', 'zero'])
def test_csv_invalid_or_zero_identity_uses_existing_safe_fallback(gaia, source_id):
    rows = gaia._parse_gaia_csv(CSV_HEADER + f'{source_id},10,20,200,0.1,1,2,3,4,0.5\n')
    result = gaia.cross_match_nearby([], rows)
    assert len(result) == 1
    assert result[0]['identifier'] == 'Gaia-nearby-1'
    assert result[0]['distance_pc'] == '5.0000'


@pytest.mark.parametrize('entrypoint', ['direct', 'csv'])
def test_integer_digit_limit_rejection_keeps_the_star_with_a_safe_name(gaia, entrypoint):
    digit_limit = sys.get_int_max_str_digits()
    if digit_limit == 0 or digit_limit > 10000:
        pytest.skip('bounded probe requires an enabled integer digit limit no larger than 10000')
    source_id = '9' * (digit_limit + 1)
    if entrypoint == 'csv':
        rows = gaia._parse_gaia_csv(CSV_HEADER + f'{source_id},10,20,200,0.1,1,2,3,4,0.5\n')
    else:
        rows = [{**PHYSICAL, 'source_id': source_id}]
    result = gaia.cross_match_nearby([], rows)
    assert len(result) == 1
    assert result[0]['identifier'] == 'Gaia-nearby-1'
    assert result[0]['distance_pc'] == '5.0000'


def test_physical_measurement_and_null_decoding_stay_unchanged(gaia):
    rows = gaia._parse_gaia_csv(' SOURCE_ID , RA , DEC , PARALLAX , PMRA , PMDEC , RADIAL_VELOCITY , PHOT_G_MEAN_MAG , BP_RP\n'
                               '4472832130942575872,10,20,200,1,,null,4,0.5\n')
    assert {key: value for key, value in rows[0].items() if key != 'source_id'} == {
        'ra': 10.0, 'dec': 20.0, 'parallax': 200.0, 'pmra': 1.0,
        'pmdec': None, 'radial_velocity': None, 'phot_g_mean_mag': 4.0, 'bp_rp': 0.5,
    }
    assert type(rows[0]['ra']) is float


def test_invalid_unused_identity_does_not_drop_or_rename_a_positional_match(gaia):
    existing = {**EXISTING, 'ra_deg': '10', 'dec_deg': '20'}
    result = gaia.cross_match_nearby([existing], [{**PHYSICAL, 'source_id': 'not-an-id'}])
    assert len(result) == 1
    assert result[0]['identifier'] == 'Known nearby star'
    assert result[0]['catalog_name'] == 'Known nearby star'
    assert result[0]['rank'] == '4'
    assert result[0]['sys_id'] == '7'
    assert result[0]['parallax_mas'] == '200.0000'
    assert result[0]['pm_ra_mas_per_yr'] == '1.0000'
    assert result[0]['pm_dec_mas_per_yr'] == '2.0000'
    assert result[0]['rv_km_s'] == '3.00'
    assert result[0]['gmag'] == '4.000'


def test_nearby_exact_identity_survives_real_json_cache_miss_and_hit(gaia, monkeypatch):
    calls = owned_http_sequence(gaia, monkeypatch, [(ESA, EXACT_CSV)])
    fresh = gaia.fetch_nearby_stars()
    cached = gaia.fetch_nearby_stars()
    assert len(calls) == 1
    assert fresh == cached
    assert [row['identifier'] for row in gaia.cross_match_nearby([], cached)] == [f'Gaia DR3 {identity}' for identity in IDENTITIES]
    cache_path, = gaia.CACHE_DIR.glob('*.json')
    stored = json.loads(cache_path.read_text())
    assert [str(row['source_id']) for row in stored] == IDENTITIES
    assert all(type(row['source_id']) in (int, str) for row in stored)


@pytest.mark.parametrize('legacy_age_hours', [0, 200], ids=['fresh', 'expired'])
def test_rounded_legacy_cache_is_unused_and_untouched(gaia, monkeypatch, legacy_age_hours):
    legacy = gaia.CACHE_DIR / 'gaia_nearby_stars.json'
    gaia.load_or_fetch(legacy, lambda: [{**PHYSICAL, 'source_id': 4472832130942575616.0}], max_age_hours=168)
    timestamp = time.time() - legacy_age_hours * 3600
    os.utime(legacy, (timestamp, timestamp))
    before = (legacy.read_bytes(), legacy.stat().st_mtime_ns)
    calls = owned_http_sequence(gaia, monkeypatch, [(ESA, EXACT_CSV)])
    fresh = gaia.fetch_nearby_stars()
    cached = gaia.fetch_nearby_stars()
    assert len(calls) == 1
    assert len(fresh) == len(cached) == 5
    assert (legacy.read_bytes(), legacy.stat().st_mtime_ns) == before
    assert [row['identifier'] for row in gaia.cross_match_nearby([], cached)] == [f'Gaia DR3 {identity}' for identity in IDENTITIES]
    assert len(list(gaia.CACHE_DIR.glob('*.json'))) == 2


def test_provider_outage_never_reuses_the_rounded_legacy_population(gaia, monkeypatch):
    legacy = gaia.CACHE_DIR / 'gaia_nearby_stars.json'
    gaia.load_or_fetch(legacy, lambda: [{**PHYSICAL, 'source_id': 4472832130942575616.0}], max_age_hours=168)
    before = (legacy.read_bytes(), legacy.stat().st_mtime_ns)
    calls = owned_http_sequence(gaia, monkeypatch, [(ESA, URLError('owned ESA outage')),
                                                 (VIZIER, URLError('owned mirror outage'))])
    assert gaia.fetch_nearby_stars() == []
    assert gaia.fetch_nearby_stars() == []
    assert len(calls) == 2
    assert (legacy.read_bytes(), legacy.stat().st_mtime_ns) == before


def test_bright_star_query_cache_and_catalog_remain_compatible(gaia, monkeypatch):
    bright_csv = 'ra,dec,phot_g_mean_mag,bp_rp,parallax,pmra,pmdec\n10,20,4,0.5,200,1,2\n'
    calls = owned_http_sequence(gaia, monkeypatch, [(ESA, bright_csv)])
    fresh = gaia.fetch_bright_stars()
    assert gaia.fetch_bright_stars() == fresh
    assert gaia.build_stars_catalog(fresh) == [[10.0, 20.0, 4.0, 0.476]]
    assert len(calls) == 1
    assert len(list(gaia.CACHE_DIR.glob('*.json'))) == 1


# Regression: TOOL-057 / R0112 — Gaia caches reused rows from a different query.
# Found by /qa on 2026-10-24; report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
BRIGHT_CSV = {
    3.0: 'ra,dec,phot_g_mean_mag,bp_rp,parallax,pmra,pmdec\n10,20,2,0.5,200,1,2\n',
    7.0: 'ra,dec,phot_g_mean_mag,bp_rp,parallax,pmra,pmdec\n30,40,6,0.5,200,1,2\n',
}
NEARBY_CSV = {
    100.0: CSV_HEADER + '42,10,20,150,0.1,1,2,3,4,0.5\n',
    200.0: CSV_HEADER + '43,30,40,250,0.1,1,2,3,4,0.5\n',
}
# Literal wire-contract oracles, independent of the product query builders.
BRIGHT_QUERY = (
    'SELECT ra, dec, phot_g_mean_mag, bp_rp, parallax, pmra, pmdec\n'
    '    FROM gaiadr3.gaia_source\n'
    '    WHERE phot_g_mean_mag IS NOT NULL\n'
    '      AND phot_g_mean_mag < {threshold}\n'
    '      AND parallax IS NOT NULL\n'
    '      AND parallax > 0\n'
    '      AND bp_rp IS NOT NULL\n'
    '    ORDER BY phot_g_mean_mag ASC'
)
NEARBY_QUERY = (
    'SELECT source_id, ra, dec, parallax, parallax_error, pmra, pmdec,\n'
    '           radial_velocity, phot_g_mean_mag, bp_rp\n'
    '    FROM gaiadr3.gaia_source\n'
    '    WHERE parallax > {threshold}\n'
    '      AND parallax_over_error > 5\n'
    '    ORDER BY parallax DESC'
)


def expected_tap_request(kind, threshold):
    query = BRIGHT_QUERY if kind == 'bright' else NEARBY_QUERY
    return {'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv',
            'QUERY': query.format(threshold=threshold)}


def fetch_query(module, kind, threshold):
    if kind == 'bright':
        return module.fetch_bright_stars(max_mag=threshold)
    return module.fetch_nearby_stars(min_parallax_mas=threshold)


def query_http_sequence(module, monkeypatch, expected):
    calls = []

    def owned_http(url, *, params, timeout):
        index = len(calls)
        assert index < len(expected), 'unexpected additional HTTP call'
        wanted_url, kind, threshold, outcome = expected[index]
        assert url == wanted_url
        assert params == expected_tap_request(kind, threshold)
        assert timeout == 120.0
        calls.append((url, deepcopy(params)))
        if callable(outcome):
            outcome = outcome()
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(module, 'http_get', owned_http)
    return calls


@pytest.mark.parametrize('kind, first, second, first_ra, second_ra', [
    ('bright', 3.0, 7.0, 10.0, 30.0), ('bright', 7.0, 3.0, 30.0, 10.0),
    ('nearby', 100.0, 200.0, 10.0, 30.0), ('nearby', 200.0, 100.0, 30.0, 10.0),
], ids=['bright-broader', 'bright-narrower', 'nearby-narrower', 'nearby-broader'])
def test_changed_threshold_cannot_reuse_another_query(gaia, monkeypatch, kind, first, second, first_ra, second_ra):
    csvs = BRIGHT_CSV if kind == 'bright' else NEARBY_CSV
    calls = query_http_sequence(gaia, monkeypatch, [
        (ESA, kind, first, csvs[first]), (ESA, kind, second, csvs[second]),
    ])
    assert fetch_query(gaia, kind, first)[0]['ra'] == first_ra
    assert fetch_query(gaia, kind, second)[0]['ra'] == second_ra
    assert fetch_query(gaia, kind, second)[0]['ra'] == second_ra
    assert len(calls) == 2
    assert len(list(gaia.CACHE_DIR.glob('*.json'))) == 2


@pytest.mark.parametrize('kind', ['bright', 'nearby'])
@pytest.mark.parametrize('endpoint_name', ['ESA_TAP_URL', 'VIZIER_TAP_URL'])
def test_changed_endpoint_policy_cannot_reuse_another_source(gaia, monkeypatch, kind, endpoint_name):
    threshold = 7.0 if kind == 'bright' else 100.0
    first_csv, second_csv = (BRIGHT_CSV[3.0], BRIGHT_CSV[7.0]) if kind == 'bright' else (NEARBY_CSV[100.0], NEARBY_CSV[200.0])
    owned_endpoint = 'https://example.invalid/owned-tap'
    if endpoint_name == 'ESA_TAP_URL':
        expected = [(ESA, kind, threshold, first_csv), (owned_endpoint, kind, threshold, second_csv)]
    else:
        expected = [(ESA, kind, threshold, URLError('owned ESA outage')), (VIZIER, kind, threshold, first_csv),
                    (ESA, kind, threshold, URLError('owned ESA outage')), (owned_endpoint, kind, threshold, second_csv)]
    calls = query_http_sequence(gaia, monkeypatch, expected)
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 10.0
    monkeypatch.setattr(gaia, endpoint_name, owned_endpoint)
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 30.0
    assert len(calls) == len(expected)


@pytest.mark.parametrize('kind', ['bright', 'nearby'])
def test_same_query_reuses_real_cache(gaia, monkeypatch, kind):
    threshold = 3.0 if kind == 'bright' else 100.0
    csv_text = BRIGHT_CSV[3.0] if kind == 'bright' else NEARBY_CSV[100.0]
    calls = query_http_sequence(gaia, monkeypatch, [(ESA, kind, threshold, csv_text)])
    first = fetch_query(gaia, kind, threshold)
    assert first[0]['ra'] == 10.0
    assert fetch_query(gaia, kind, threshold) == first
    assert len(calls) == 1


@pytest.mark.parametrize('kind, legacy_names', [
    ('bright', ['gaia_bright_stars.json']),
    ('nearby', ['gaia_nearby_stars_v2.json']),
    ('nearby', ['gaia_nearby_stars.json', 'gaia_nearby_stars_v2.json']),
], ids=['bright-unkeyed', 'nearby-exact-unkeyed', 'nearby-both-generations'])
@pytest.mark.parametrize('age_hours', [0, 200], ids=['fresh', 'expired'])
def test_unknown_query_generations_are_unused_and_untouched(gaia, monkeypatch, kind, legacy_names, age_hours):
    before = {}
    for index, name in enumerate(legacy_names):
        path = gaia.CACHE_DIR / name
        gaia.load_or_fetch(path, lambda: [{'ra': -999 - index, 'source_id': 42}], max_age_hours=168)
        timestamp = time.time() - age_hours * 3600
        os.utime(path, (timestamp, timestamp))
        before[path] = (path.read_bytes(), path.stat().st_mtime_ns)
    threshold = 3.0 if kind == 'bright' else 100.0
    csv_text = BRIGHT_CSV[3.0] if kind == 'bright' else NEARBY_CSV[100.0]
    calls = query_http_sequence(gaia, monkeypatch, [(ESA, kind, threshold, csv_text)])
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 10.0
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 10.0
    assert len(calls) == 1
    assert len(list(gaia.CACHE_DIR.glob('*.json'))) == len(legacy_names) + 1
    for path, state in before.items():
        assert (path.read_bytes(), path.stat().st_mtime_ns) == state


def test_static_result_for_one_query_cannot_mask_another(gaia, monkeypatch):
    fallback = gaia.FALLBACK_DIR / 'gaia_bright_stars_fallback.json'
    static = [{**PHYSICAL, 'ra': 99.0, 'phot_g_mean_mag': 2.0}]
    gaia.load_or_fetch(fallback, lambda: static, max_age_hours=168)
    before = (fallback.read_bytes(), fallback.stat().st_mtime_ns)
    calls = query_http_sequence(gaia, monkeypatch, [
        (ESA, 'bright', 3.0, URLError('owned ESA outage')),
        (VIZIER, 'bright', 3.0, URLError('owned mirror outage')),
        (ESA, 'bright', 7.0, BRIGHT_CSV[7.0]),
    ])
    assert gaia.fetch_bright_stars(max_mag=3.0) == static
    assert gaia.fetch_bright_stars(max_mag=3.0) == static
    assert gaia.fetch_bright_stars(max_mag=7.0)[0]['ra'] == 30.0
    assert len(calls) == 3
    assert (fallback.read_bytes(), fallback.stat().st_mtime_ns) == before


@pytest.mark.parametrize('kind', ['bright', 'nearby'])
@pytest.mark.parametrize('first_result', [URLError('owned ESA outage'), ''], ids=['error', 'empty-success'])
def test_fallback_preserves_provider_order(gaia, monkeypatch, kind, first_result):
    threshold = 3.0 if kind == 'bright' else 100.0
    csv_text = BRIGHT_CSV[3.0] if kind == 'bright' else NEARBY_CSV[100.0]
    calls = query_http_sequence(gaia, monkeypatch, [(ESA, kind, threshold, first_result), (VIZIER, kind, threshold, csv_text)])
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 10.0
    assert len(calls) == 2


def test_bright_outage_without_static_fallback_still_raises(gaia, monkeypatch):
    calls = query_http_sequence(gaia, monkeypatch, [
        (ESA, 'bright', 3.0, URLError('owned ESA outage')),
        (VIZIER, 'bright', 3.0, URLError('owned mirror outage')),
    ])
    with pytest.raises(RuntimeError, match='All TAP endpoints failed'):
        gaia.fetch_bright_stars(max_mag=3.0)
    assert len(calls) == 2
    assert not gaia.CACHE_DIR.exists()


def test_empty_nearby_result_is_cached_only_for_its_query(gaia, monkeypatch):
    calls = query_http_sequence(gaia, monkeypatch, [
        (ESA, 'nearby', 100.0, ''), (VIZIER, 'nearby', 100.0, URLError('owned mirror outage')),
        (ESA, 'nearby', 200.0, NEARBY_CSV[200.0]),
    ])
    assert gaia.fetch_nearby_stars(min_parallax_mas=100.0) == []
    assert gaia.fetch_nearby_stars(min_parallax_mas=100.0) == []
    assert gaia.fetch_nearby_stars(min_parallax_mas=200.0)[0]['ra'] == 30.0
    assert len(calls) == 3


@pytest.mark.parametrize('kind', ['bright', 'nearby'])
@pytest.mark.parametrize('age_hours, expected_ra, expected_calls', [(167, 10.0, 1), (169, 30.0, 2)], ids=['fresh', 'expired'])
def test_query_cache_preserves_168_hour_lifetime(gaia, monkeypatch, kind, age_hours, expected_ra, expected_calls):
    threshold = 7.0 if kind == 'bright' else 100.0
    first_csv, second_csv = (BRIGHT_CSV[3.0], BRIGHT_CSV[7.0]) if kind == 'bright' else (NEARBY_CSV[100.0], NEARBY_CSV[200.0])
    calls = query_http_sequence(gaia, monkeypatch, [(ESA, kind, threshold, first_csv), (ESA, kind, threshold, second_csv)])
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 10.0
    cache_path, = gaia.CACHE_DIR.glob('*.json')
    timestamp = time.time() - age_hours * 3600
    os.utime(cache_path, (timestamp, timestamp))
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == expected_ra
    assert len(calls) == expected_calls


@pytest.mark.parametrize('kind', ['bright', 'nearby'])
def test_one_acquisition_keeps_its_captured_endpoint_policy(gaia, monkeypatch, kind):
    threshold = 7.0 if kind == 'bright' else 100.0
    first_csv, second_csv = (BRIGHT_CSV[3.0], BRIGHT_CSV[7.0]) if kind == 'bright' else (NEARBY_CSV[100.0], NEARBY_CSV[200.0])
    changed_mirror = 'https://example.invalid/new-mirror'

    def change_config_during_first_provider():
        monkeypatch.setattr(gaia, 'VIZIER_TAP_URL', changed_mirror)
        return URLError('owned ESA outage after configuration changed')

    calls = query_http_sequence(gaia, monkeypatch, [
        (ESA, kind, threshold, change_config_during_first_provider), (VIZIER, kind, threshold, first_csv),
        (ESA, kind, threshold, URLError('owned ESA outage')), (changed_mirror, kind, threshold, second_csv),
    ])
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 10.0
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 30.0
    assert fetch_query(gaia, kind, threshold)[0]['ra'] == 30.0
    assert len(calls) == 4


@pytest.mark.parametrize('kind', ['bright', 'nearby'])
@pytest.mark.parametrize('overrides', [False, True], ids=['defaults', 'custom-endpoint-timeout'])
def test_direct_tap_calls_keep_queries_signatures_and_timeouts(gaia, monkeypatch, kind, overrides):
    threshold = 7.5 if kind == 'bright' else 100.0
    csv_text = BRIGHT_CSV[3.0] if kind == 'bright' else NEARBY_CSV[100.0]
    url = 'https://example.invalid/direct-tap' if overrides else ESA
    timeout = 4.5 if overrides else 120.0
    calls = []

    def owned_http(actual_url, *, params, timeout):
        calls.append((actual_url, params, timeout))
        return csv_text

    monkeypatch.setattr(gaia, 'http_get', owned_http)
    function = gaia.fetch_bright_stars_tap if kind == 'bright' else gaia.fetch_nearby_stars_tap
    rows = function(tap_url=url, timeout=timeout) if overrides else function()
    assert rows[0]['ra'] == 10.0
    assert calls == [(url, expected_tap_request(kind, threshold), timeout)]
    assert not gaia.CACHE_DIR.exists()


@pytest.mark.parametrize('request_changes, endpoints, schema, kind', [
    ({'REQUEST': 'otherQuery'}, (ESA, VIZIER), 2, 'bright'),
    ({'LANG': 'otherLanguage'}, (ESA, VIZIER), 2, 'bright'),
    ({'FORMAT': 'json'}, (ESA, VIZIER), 2, 'bright'),
    ({'MAXREC': '500'}, (ESA, VIZIER), 2, 'bright'),
    ({'QUERY': BRIGHT_QUERY.format(threshold=3.0).replace('SELECT ra, dec,', 'SELECT source_id, ra, dec,')}, (ESA, VIZIER), 2, 'bright'),
    ({'QUERY': BRIGHT_QUERY.format(threshold=3.0).replace('gaiadr3.gaia_source', 'gaiadr2.gaia_source')}, (ESA, VIZIER), 2, 'bright'),
    ({'QUERY': BRIGHT_QUERY.format(threshold=3.0).replace('phot_g_mean_mag <', 'phot_g_mean_mag <=')}, (ESA, VIZIER), 2, 'bright'),
    ({'QUERY': BRIGHT_QUERY.format(threshold=7.0)}, (ESA, VIZIER), 2, 'bright'),
    ({'QUERY': BRIGHT_QUERY.format(threshold=3.0).replace('ORDER BY phot_g_mean_mag ASC', 'ORDER BY ra ASC')}, (ESA, VIZIER), 2, 'bright'),
    ({}, ('https://example.invalid/primary', VIZIER), 2, 'bright'),
    ({}, (ESA, 'https://example.invalid/mirror'), 2, 'bright'),
    ({}, (VIZIER, ESA), 2, 'bright'),
    ({}, (ESA, VIZIER), 3, 'bright'),
    ({}, (ESA, VIZIER), 2, 'nearby'),
], ids=['request-mode', 'language', 'format', 'new-request-field', 'selected-fields', 'release',
        'comparison', 'threshold', 'order-by', 'primary', 'mirror', 'endpoint-order', 'schema', 'kind'])
def test_complete_request_policy_and_generation_each_affect_cache_identity(gaia, request_changes, endpoints, schema, kind):
    request = expected_tap_request('bright', 3.0)
    first = gaia._gaia_query_cache_path('bright', request, (ESA, VIZIER), schema=2)
    changed = gaia._gaia_query_cache_path(kind, {**request, **request_changes}, endpoints, schema=schema)
    assert changed != first
    assert not gaia.CACHE_DIR.exists()


def test_request_mapping_order_does_not_change_cache_identity(gaia):
    request = expected_tap_request('bright', 3.0)
    reordered = dict(reversed(list(request.items())))
    first = gaia._gaia_query_cache_path('bright', request, (ESA, VIZIER), schema=2)
    assert gaia._gaia_query_cache_path('bright', reordered, (ESA, VIZIER), schema=2) == first
    assert first.parent == gaia.CACHE_DIR
    assert not gaia.CACHE_DIR.exists()
