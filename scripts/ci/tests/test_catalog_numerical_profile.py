"""Fail-closed validation of the actual numerical runtime, without loading fixtures."""
import importlib.util
import json
from pathlib import Path

import pytest

PATH = Path(__file__).parents[1] / 'catalog_numerical_profile.py'
spec = importlib.util.spec_from_file_location('catalog_numerical_profile', PATH)
profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profile)


def valid_profile():
    return {'platform': {'system': 'Linux', 'machine': 'x86_64'}, 'inspection_errors': [],
            'openblas': [{'actual_core': 'Nehalem', 'actual_threads': 1, 'sha256': 'a' * 64}]}


def test_actual_core_and_single_thread_profile_is_accepted(monkeypatch, capsys):
    monkeypatch.setattr(profile, 'collect_profile', valid_profile)
    assert profile.main(['--require-core', 'Nehalem']) == 0
    assert json.loads(capsys.readouterr().out)['profile_errors'] == []


@pytest.mark.parametrize('libraries,errors,expected', [
    ([], [], 'exactly one'),
    ([{'actual_core': 'Nehalem', 'actual_threads': 1, 'sha256': 'a' * 64}] * 2, [], 'exactly one'),
    ([{'actual_core': 'SkylakeX', 'actual_threads': 1, 'sha256': 'a' * 64}], [], 'Nehalem'),
    ([{'actual_threads': 1, 'sha256': 'a' * 64}], [], 'Nehalem'),
    ([{'actual_core': 'Nehalem', 'actual_threads': 2, 'sha256': 'a' * 64}], [], 'one thread'),
    ([{'actual_core': 'Nehalem', 'sha256': 'a' * 64}], [], 'one thread'),
    ([{'actual_core': 'Nehalem', 'actual_threads': 1}], [], 'SHA-256'),
    ([{'actual_core': 'Nehalem', 'actual_threads': 1, 'sha256': 'a' * 64}], ['unreadable library'], 'unreadable library'),
])
def test_unknown_or_wrong_runtime_fails_closed(monkeypatch, capsys, libraries, errors, expected):
    data = valid_profile()
    data.update(openblas=libraries, inspection_errors=errors)
    monkeypatch.setattr(profile, 'collect_profile', lambda: data)
    assert profile.main(['--require-core', 'Nehalem']) == 1
    assert expected in '\n'.join(json.loads(capsys.readouterr().out)['profile_errors'])


def test_unsupported_platform_fails_closed(monkeypatch, capsys):
    data = valid_profile()
    data['platform']['system'] = 'Darwin'
    monkeypatch.setattr(profile, 'collect_profile', lambda: data)
    assert profile.main(['--require-core', 'Nehalem']) == 1
    assert 'Linux x86-64' in '\n'.join(json.loads(capsys.readouterr().out)['profile_errors'])


def test_missing_runtime_query_symbol_is_an_inspection_failure(tmp_path, monkeypatch):
    library = tmp_path / 'owned-openblas.so'
    library.write_bytes(b'owned fixture; never loaded')
    monkeypatch.setattr(profile.ctypes, 'CDLL', lambda path: object())
    with pytest.raises(RuntimeError, match='Cannot inspect OpenBLAS actual_core'):
        profile.inspect_library(library)
