"""TOOL-050 under permanent publisher retirement, using owned fixtures only.

Old target-preflight and successful append cases now require refusal before any
acquisition/cache work, even for a valid pair or symlink. Explicit --dry-run is
still a legacy preview (query caches are permitted); source publication belongs
to the maintained pinned-source builder. Query isolation is covered separately
by backend/tests/test_fetch_jpl_sbdb_cache.py.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/fetch_jpl_sbdb.py'
ROW = dict(spkid='29999999', full_name='9999999 AuditFixture', a='2.7', e='0.1', i='1', om='2',
           w='3', ma='4', per='1600', epoch='2461000.5', h='15', diameter='2', albedo='0.1',
           **{'class': 'MBA'})
PY = 'ASTEROID_BELT_OBJECTS = [\n]\nKUIPER_BELT_OBJECTS = []\nALL_BODIES = ASTEROID_BELT_OBJECTS + KUIPER_BELT_OBJECTS\n'
JS = 'export const ASTEROID_BELT_OBJECTS = [\n];\nexport const KUIPER_BELT_OBJECTS = [];\n'
TS = '// Owned sentinel: never redirect the retired updater to planets.ts.\n'
CACHE = '{"owned":"unchanged"}\n'


def save_fixture(path: Path, text: str) -> None:
    assert not path.is_relative_to(ROOT)
    assert not path.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def load_script():
    previous = sys.path[:]
    try:
        spec = importlib.util.spec_from_file_location('tool050_owned_candidate', SOURCE)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path[:] = previous


def paths(root: Path) -> dict[str, Path]:
    return {
        'backend': root / 'backend/data/bodies.py',
        'frontend': root / 'src/data/planets.js',
        'typescript': root / 'src/data/planets.ts',
        'cache': root / 'cache/sbdb_catalog.json',
    }


def prepare(root: Path, invalid: str | None = None, duplicate: bool = False):
    target_paths = paths(root)
    for name, text in [('backend', PY), ('frontend', JS), ('typescript', TS), ('cache', CACHE)]:
        if invalid in (f'missing-{name}', f'directory-{name}'):
            if invalid.startswith('directory-'):
                target_paths[name].mkdir(parents=True)
            continue
        if name == 'backend' and duplicate:
            text = text.replace('[\n]', '[\n    {"id": "auditfixture-9999999", "name": "AuditFixture (9999999)"},\n]', 1)
        save_fixture(target_paths[name], text)
    return target_paths


def snapshot(target_paths):
    return {
        key: ('file', path.read_bytes()) if path.is_file()
        else ('directory', tuple(sorted(p.name for p in path.iterdir()))) if path.is_dir()
        else ('socket', None) if path.is_socket()
        else ('missing', None)
        for key, path in target_paths.items()
    }


def configure(module, root: Path, calls: list, *, no_rows: bool = False, trace: bool = False):
    target_paths = paths(root)
    module.PROJECT_ROOT = root
    module.BODIES_PY_PATH = target_paths['backend']
    module.PLANETS_JS_PATH = target_paths['frontend']
    module.CACHE_DIR = target_paths['cache'].parent

    def record(name, value=None):
        calls.append((name, value))
        if trace:
            print(f'OWNED_SIDE_EFFECT_ATTEMPT:{name}')

    def ensure():
        record('ensure_cache_dir')
        assert module.CACHE_DIR.is_dir()
        return module.CACHE_DIR

    def provider(name, *, limit):
        record(name, limit)
        return [] if no_rows or name != 'top' else [dict(ROW)]

    def no_network(*args, **kwargs):
        raise AssertionError('This candidate must never reach a network transport')

    module.ensure_cache_dir = ensure
    module.fetch_top_asteroids = lambda *, limit: provider('top', limit=limit)
    module.fetch_notable_neos = lambda *, limit: provider('neo', limit=limit)
    module.fetch_trojans = lambda *, limit: provider('trojan', limit=limit)
    module.http_get_json = no_network


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('Live network is forbidden in publisher contract tests')
    monkeypatch.setattr(socket.socket, 'connect', forbidden)
    monkeypatch.setattr(socket, 'getaddrinfo', forbidden)


def invoke(monkeypatch, module, argv=()):
    monkeypatch.setattr(sys, 'argv', ['fetch_jpl_sbdb.py', *argv])
    return module.main()


def expected_calls(limits=(100, 30, 20)):
    return [('ensure_cache_dir', None), ('top', limits[0]), ('neo', limits[1]), ('trojan', limits[2])]


def assert_refused(monkeypatch, capsys, module, calls, targets, argv=()):
    before = snapshot(targets)
    cache_before = tuple(sorted(module.CACHE_DIR.iterdir()))

    def forbidden_read(*args):
        raise AssertionError('Publication refusal must precede even reading source IDs')

    monkeypatch.setattr(module, 'get_existing_body_names', forbidden_read)
    with pytest.raises(SystemExit) as failure:
        invoke(monkeypatch, module, argv)
    assert failure.value.code == 2
    assert snapshot(targets) == before
    assert tuple(sorted(module.CACHE_DIR.iterdir())) == cache_before
    assert calls == []
    captured = capsys.readouterr()
    assert captured.out == ''
    assert 'Legacy source publication is retired' in captured.err
    assert '--dry-run' in captured.err
    assert 'scripts/build_asteroid_phase1_dataset.py' in captured.err


@pytest.mark.parametrize('invalid', [None, 'missing-backend', 'missing-frontend', 'directory-backend', 'directory-frontend'])
@pytest.mark.parametrize('argv', [[], ['--write'], ['--dry-run', '--write'], ['--limit', '1']])
def test_publication_is_permanently_refused_regardless_of_target_state(tmp_path, monkeypatch, capsys, invalid, argv):
    targets = prepare(tmp_path, invalid)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    assert_refused(monkeypatch, capsys, module, calls, targets, argv)


@pytest.mark.parametrize('no_rows,duplicate', [(True, False), (False, True)])
def test_empty_or_existing_identity_cannot_bypass_publication_refusal(tmp_path, monkeypatch, capsys, no_rows, duplicate):
    targets = prepare(tmp_path, duplicate=duplicate)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls, no_rows=no_rows)
    assert_refused(monkeypatch, capsys, module, calls, targets)


@pytest.mark.parametrize('invalid', [None, 'missing-backend', 'missing-frontend', 'directory-frontend'])
@pytest.mark.parametrize('argv,limits', [([], (100, 30, 20)), (['--limit', '7', '--neo-limit', '3', '--trojan-limit', '2'], (7, 3, 2))])
def test_only_explicit_dry_run_generates_samples_and_forwards_limits(tmp_path, monkeypatch, capsys, invalid, argv, limits):
    targets = prepare(tmp_path, invalid)
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    assert invoke(monkeypatch, module, ['--dry-run', *argv]) is None
    assert snapshot(targets) == before
    assert calls == expected_calls(limits)
    output = capsys.readouterr().out
    assert 'Legacy preview - sample entries (source publication retired)' in output
    assert 'Python:' in output and 'JavaScript:' in output
    assert 'auditfixture-9999999' in output
    assert '"period_days": 1600.0' in output and 'periodDays: 1600.0' in output
    assert 'Updated ' not in output


def test_dry_run_retains_existing_backend_directory_read_failure(tmp_path, monkeypatch):
    targets = prepare(tmp_path, 'directory-backend')
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    with pytest.raises(IsADirectoryError):
        invoke(monkeypatch, module, ['--dry-run'])
    assert calls == [('ensure_cache_dir', None)]
    assert snapshot(targets) == before


@pytest.mark.parametrize('no_rows,duplicate', [(True, False), (False, True)])
def test_dry_run_with_no_new_rows_preserves_sources_and_legacy_catalog_cache(tmp_path, monkeypatch, capsys, no_rows, duplicate):
    targets = prepare(tmp_path, duplicate=duplicate)
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls, no_rows=no_rows)
    invoke(monkeypatch, module, ['--dry-run'])
    assert calls == expected_calls()
    assert snapshot(targets) == before
    output = capsys.readouterr().out
    assert 'New bodies to add: 0' in output
    assert 'Python:' not in output and 'Updated ' not in output


def test_dry_run_may_populate_query_caches_but_never_publish_sources(tmp_path, monkeypatch):
    targets = prepare(tmp_path)
    before = snapshot(targets)
    module = load_script()
    wrappers = {name: getattr(module, name) for name in ('fetch_top_asteroids', 'fetch_notable_neos', 'fetch_trojans')}
    configure(module, tmp_path, [])
    for name, wrapper in wrappers.items():
        monkeypatch.setattr(module, name, wrapper)
    requests = []

    def offline_response(url, *, params, timeout):
        requests.append(dict(params))
        assert url == module.SBDB_API_URL and timeout == 30.0
        fields = module.SBDB_FIELDS.split(',')
        return {'fields': fields, 'data': [[ROW.get(field.lower()) for field in fields]]}

    monkeypatch.setattr(module, 'http_get_json', offline_response)
    invoke(monkeypatch, module, ['--dry-run'])
    assert len(requests) == 3
    assert len(list(module.CACHE_DIR.glob('*_query_v2_*.json'))) == 3
    assert snapshot(targets) == before
    invoke(monkeypatch, module, ['--dry-run'])
    assert len(requests) == 3
    assert snapshot(targets) == before


def test_import_and_shared_query_helper_remain_usable_without_legacy_target():
    previous_path = sys.path[:]
    module = load_script()
    assert sys.path == previous_path
    assert module.PLANETS_JS_PATH == ROOT / 'src/data/planets.js'
    assert module.SBDB_API_URL == 'https://ssd-api.jpl.nasa.gov/sbdb_query.api'
    assert module.phase1_query_params() == {
        'fields': module.SBDB_FIELDS, 'sb-kind': 'a', 'sb-class': 'MBA,IMB,OMB',
        'sort': '-diameter,spkid', 'limit': '100000', 'full-prec': 'true',
        'sb-cdata': '{"AND":["a|GE|2","a|LE|3.5","diameter|GT|0"]}',
    }


def test_owned_cli_refuses_before_any_acquisition_or_partial_publication(tmp_path):
    targets = prepare(tmp_path, 'missing-frontend')
    before = snapshot(targets)
    result = subprocess.run(
        [sys.executable, '-B', str(Path(__file__).resolve()), '--owned-cli', str(tmp_path)],
        text=True, capture_output=True, timeout=10,
        env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'},
    )
    assert result.returncode == 2
    assert snapshot(targets) == before
    assert result.stdout == ''
    assert 'Legacy source publication is retired' in result.stderr
    assert '--dry-run' in result.stderr
    assert 'build_asteroid_phase1_dataset.py' in result.stderr


def test_python_help_remains_available_without_acquisition(tmp_path, monkeypatch, capsys):
    targets = prepare(tmp_path, 'missing-frontend')
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    with pytest.raises(SystemExit) as done:
        invoke(monkeypatch, module, ['--help'])
    assert done.value.code == 0
    assert calls == []
    assert snapshot(targets) == before
    output = capsys.readouterr().out
    assert 'source publication is retired' in output
    assert '--dry-run' in output and '--write' in output
    assert 'query caches' in ' '.join(output.split())
    assert 'build_asteroid_phase1_dataset.py' in output


@pytest.mark.parametrize('target_name', ['backend', 'frontend'])
def test_existing_symlink_targets_cannot_reenable_publication(tmp_path, monkeypatch, capsys, target_name):
    targets = prepare(tmp_path, f'missing-{target_name}')
    target = targets[target_name]
    backing = target.with_name(target.name + '.owned-regular')
    save_fixture(backing, PY if target_name == 'backend' else JS)
    target.symlink_to(backing.name)
    before_link, before_bytes = target.readlink(), backing.read_bytes()
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    assert_refused(monkeypatch, capsys, module, calls, targets)
    assert target.is_symlink() and target.readlink() == before_link
    assert backing.read_bytes() == before_bytes


def test_socket_target_refuses_before_any_cache_or_acquisition_work(tmp_path, monkeypatch, capsys):
    if not hasattr(socket, 'AF_UNIX'):
        pytest.skip('Unix-domain filesystem sockets are unavailable on this platform')
    targets = prepare(tmp_path, 'missing-frontend')
    target = targets['frontend']
    target.parent.mkdir(parents=True, exist_ok=True)
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as owned_socket:
        owned_socket.bind(str(target))
        calls = []
        module = load_script()
        configure(module, tmp_path, calls)
        assert_refused(monkeypatch, capsys, module, calls, targets)
        assert target.is_socket()


if __name__ == '__main__':
    assert len(sys.argv) == 3 and sys.argv[1] == '--owned-cli'
    root = Path(sys.argv[2]).resolve()
    assert not root.is_relative_to(ROOT)
    module = load_script()
    configure(module, root, [], trace=True)
    sys.argv = ['fetch_jpl_sbdb.py']
    module.main()
