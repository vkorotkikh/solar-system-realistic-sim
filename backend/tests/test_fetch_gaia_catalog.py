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


def test_bright_star_query_cache_and_catalog_are_unchanged(gaia, monkeypatch):
    bright_csv = 'ra,dec,phot_g_mean_mag,bp_rp,parallax,pmra,pmdec\n10,20,4,0.5,200,1,2\n'
    calls = owned_http_sequence(gaia, monkeypatch, [(ESA, bright_csv)])
    fresh = gaia.fetch_bright_stars()
    assert gaia.fetch_bright_stars() == fresh
    assert gaia.build_stars_catalog(fresh) == [[10.0, 20.0, 4.0, 0.476]]
    assert len(calls) == 1
    assert (gaia.CACHE_DIR / 'gaia_bright_stars.json').exists()
