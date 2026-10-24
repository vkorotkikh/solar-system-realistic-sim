"""TOOL-057 regressions: request-specific SBDB caching with real disk state."""
# Regression: TOOL-057 / R0112 — different SBDB queries reused one cache file.
# Found by /qa on 2026-10-24; report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
from copy import deepcopy
import importlib.util
import os
from pathlib import Path
import sys
import time
from urllib.error import URLError

import pytest

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api'
FIELDS = 'spkid,full_name,H,diameter,albedo,e,a,i,om,w,ma,per,epoch,class,spec_B,spec_T'
BASE_PARAMS = {'fields': FIELDS, 'sb-kind': 'a', 'sort': 'H', 'limit': '100', 'full-prec': 'true'}
FIRST = [{'spkid': '2000001', 'full_name': 'Owned first query', 'h': None}]
SECOND = [{'spkid': '2000002', 'full_name': 'Owned second query', 'h': '4.5'}]


@pytest.fixture
def sbdb(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, 'path', list(sys.path))
    spec = importlib.util.spec_from_file_location('fetch_jpl_sbdb_cache_test', ROOT / 'scripts/fetch_jpl_sbdb.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'CACHE_DIR', tmp_path / 'cache')
    return module


def install_network(monkeypatch, module, expected):
    """Stub only outbound HTTP; cache lookup, JSON serialization and decoding stay real."""
    calls = []

    def fetch(url, *, params, timeout):
        calls.append({'url': url, 'params': dict(params), 'timeout': timeout})
        index = len(calls) - 1
        assert index < len(expected), 'unexpected extra outbound request'
        wanted_url, wanted_params, result = expected[index]
        assert url == wanted_url
        assert params == wanted_params
        assert timeout == 30.0
        return deepcopy(result)

    monkeypatch.setattr(module, 'http_get_json', fetch)
    return calls


def response(rows):
    # Upper-case fields and a short row retain the script's existing decoder contract.
    return {'fields': ['SPKID', 'FULL_NAME', 'H'],
            'data': [[row['spkid'], row['full_name']] if row['h'] is None
                     else [row['spkid'], row['full_name'], row['h']] for row in rows]}


@pytest.mark.parametrize('dimension, kwargs, overrides, changed_params, changed_endpoint', [
    ('limit', {'limit': 1000}, {}, {'limit': '1000'}, ENDPOINT),
    ('kind', {'sb_kind': 'c'}, {}, {'sb-kind': 'c'}, ENDPOINT),
    ('class', {'sb_class': 'TJN'}, {}, {'sb-class': 'TJN'}, ENDPOINT),
    ('group', {'sb_group': 'neo'}, {}, {'sb-group': 'neo'}, ENDPOINT),
    ('sort', {'sort': '-diameter'}, {}, {'sort': '-diameter'}, ENDPOINT),
    ('fields', {}, {'SBDB_FIELDS': 'spkid,full_name,H,diameter'},
     {'fields': 'spkid,full_name,H,diameter'}, ENDPOINT),
    ('endpoint', {}, {'SBDB_API_URL': 'https://example.invalid/owned-sbdb'},
     {}, 'https://example.invalid/owned-sbdb'),
], ids=['limit', 'kind', 'class', 'group', 'sort', 'fields', 'endpoint'])
def test_changed_effective_request_cannot_reuse_another_query(
    sbdb, monkeypatch, dimension, kwargs, overrides, changed_params, changed_endpoint
):
    variant_params = {**BASE_PARAMS, **changed_params}
    calls = install_network(monkeypatch, sbdb, [
        (ENDPOINT, BASE_PARAMS, response(FIRST)),
        (changed_endpoint, variant_params, response(SECOND)),
    ])
    assert sbdb.fetch_sbdb(cache_name='owned') == FIRST
    for name, value in overrides.items():
        monkeypatch.setattr(sbdb, name, value)
    assert sbdb.fetch_sbdb(cache_name='owned', **kwargs) == SECOND, dimension
    assert sbdb.fetch_sbdb(cache_name='owned', **kwargs) == SECOND
    assert len(calls) == 2
    assert len(list(sbdb.CACHE_DIR.glob('*.json'))) == 2


@pytest.mark.parametrize('first_kwargs, second_kwargs, expected_params', [
    ({'sb_class': 'ATE:APO:AMO'}, {'sb_class': 'ATE,APO,AMO'},
     {**BASE_PARAMS, 'sb-class': 'ATE,APO,AMO'}),
    ({}, {'sb_class': '', 'sb_group': ''}, BASE_PARAMS),
    ({'limit': 100}, {'limit': '100'}, BASE_PARAMS),
], ids=['colon-comma-classes', 'empty-optionals', 'stringified-limit'])
def test_same_effective_query_reuses_real_json_cache(
    sbdb, monkeypatch, first_kwargs, second_kwargs, expected_params
):
    calls = install_network(monkeypatch, sbdb, [(ENDPOINT, expected_params, response(FIRST))])
    assert sbdb.fetch_sbdb(cache_name='owned', **first_kwargs) == FIRST
    assert sbdb.fetch_sbdb(cache_name='owned', **second_kwargs) == FIRST
    assert len(calls) == 1
    assert len(list(sbdb.CACHE_DIR.glob('*.json'))) == 1


@pytest.mark.parametrize('legacy_age_hours', [0, 200], ids=['fresh', 'expired'])
def test_unkeyed_legacy_cache_is_never_reused_or_modified(sbdb, monkeypatch, legacy_age_hours):
    legacy = sbdb.CACHE_DIR / 'owned_full_precision_albedo.json'
    sentinel = [{'spkid': 'legacy-unknown-query'}]
    sbdb.load_or_fetch(legacy, lambda: sentinel, max_age_hours=168.0)
    timestamp = time.time() - legacy_age_hours * 3600
    os.utime(legacy, (timestamp, timestamp))
    before_bytes, before_mtime = legacy.read_bytes(), legacy.stat().st_mtime_ns
    calls = install_network(monkeypatch, sbdb, [(ENDPOINT, BASE_PARAMS, response(FIRST))])

    assert sbdb.fetch_sbdb(cache_name='owned') == FIRST
    assert sbdb.fetch_sbdb(cache_name='owned') == FIRST
    assert len(calls) == 1
    assert legacy.read_bytes() == before_bytes
    assert legacy.stat().st_mtime_ns == before_mtime
    assert len(list(sbdb.CACHE_DIR.glob('*.json'))) == 2


def test_legacy_cache_does_not_mask_network_failure(sbdb, monkeypatch):
    legacy = sbdb.CACHE_DIR / 'owned_full_precision_albedo.json'
    sbdb.load_or_fetch(legacy, lambda: [{'spkid': 'legacy-unknown-query'}], max_age_hours=168.0)
    before_bytes, before_mtime = legacy.read_bytes(), legacy.stat().st_mtime_ns
    calls = []

    def unavailable(url, *, params, timeout):
        calls.append(url)
        assert url == ENDPOINT and params == BASE_PARAMS and timeout == 30.0
        raise URLError('owned network failure')

    monkeypatch.setattr(sbdb, 'http_get_json', unavailable)
    with pytest.raises(URLError, match='owned network failure'):
        sbdb.fetch_sbdb(cache_name='owned')
    assert calls == [ENDPOINT]
    assert legacy.read_bytes() == before_bytes
    assert legacy.stat().st_mtime_ns == before_mtime
    assert list(sbdb.CACHE_DIR.glob('*.json')) == [legacy]


@pytest.mark.parametrize('age_hours, expected_rows, expected_calls', [
    (167, FIRST, 1), (169, SECOND, 2),
], ids=['167-hours-fresh', '169-hours-expired'])
def test_existing_one_week_freshness_is_preserved(sbdb, monkeypatch, age_hours, expected_rows, expected_calls):
    calls = install_network(monkeypatch, sbdb, [
        (ENDPOINT, BASE_PARAMS, response(FIRST)), (ENDPOINT, BASE_PARAMS, response(SECOND)),
    ])
    assert sbdb.fetch_sbdb(cache_name='owned') == FIRST
    cache_path, = sbdb.CACHE_DIR.glob('*.json')
    timestamp = time.time() - age_hours * 3600
    os.utime(cache_path, (timestamp, timestamp))
    assert sbdb.fetch_sbdb(cache_name='owned') == expected_rows
    assert len(calls) == expected_calls


def test_row_decoding_and_cached_nulls_are_unchanged(sbdb, monkeypatch):
    data = {'fields': ['SPKID', 'FULL_NAME', 'H'],
            'data': [['owned-short'], ['owned-long', 'Long row', '5.2', 'ignored']]}
    wanted = [{'spkid': 'owned-short', 'full_name': None, 'h': None},
              {'spkid': 'owned-long', 'full_name': 'Long row', 'h': '5.2'}]
    calls = install_network(monkeypatch, sbdb, [(ENDPOINT, BASE_PARAMS, data)])
    assert sbdb.fetch_sbdb(cache_name='owned') == wanted
    assert sbdb.fetch_sbdb(cache_name='owned') == wanted
    assert len(calls) == 1


def test_named_wrappers_preserve_effective_filters(sbdb, monkeypatch):
    calls = install_network(monkeypatch, sbdb, [
        (ENDPOINT, {**BASE_PARAMS, 'limit': '2'}, response(FIRST)),
        (ENDPOINT, {**BASE_PARAMS, 'limit': '3', 'sb-class': 'ATE,APO,AMO'}, response(FIRST)),
        (ENDPOINT, {**BASE_PARAMS, 'limit': '4', 'sb-class': 'TJN'}, response(FIRST)),
    ])
    assert sbdb.fetch_top_asteroids(limit=2) == FIRST
    assert sbdb.fetch_notable_neos(limit=3) == FIRST
    assert sbdb.fetch_trojans(limit=4) == FIRST
    assert len(calls) == 3
