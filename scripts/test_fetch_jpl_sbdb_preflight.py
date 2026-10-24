"""TOOL-050 missing-target preflight regression; owned fixtures only.

The non-dry-run no-row cases pin the parent's selected early-rejection policy,
not additional observed catalog corruption. This does not promise atomic writes
when two existing regular targets later fail publication or marker validation.
No product edits, live providers, or replacement planets.ts target are used.
"""
from __future__ import annotations

# Regression: TOOL-050-MISSING-TARGET /qa 2026-10-24.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md

import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback

import pytest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/fetch_jpl_sbdb.py'
ROW = dict(spkid='29999999', full_name='9999999 AuditFixture', a='2.7', e='0.1', i='1', om='2',
           w='3', ma='4', per='1600', epoch='2461000.5', h='15', diameter='2', albedo='0.1',
           **{'class': 'MBA'})
PY = 'ASTEROID_BELT_OBJECTS = [\n]\nKUIPER_BELT_OBJECTS = []\nALL_BODIES = ASTEROID_BELT_OBJECTS + KUIPER_BELT_OBJECTS\n'
JS = 'export const ASTEROID_BELT_OBJECTS = [\n];\nexport const KUIPER_BELT_OBJECTS = [];\n'
TS = '// Owned sentinel: never redirect the legacy updater to planets.ts.\n'
CACHE = '{"owned":"unchanged"}\n'


def save_fixture(path: Path, text: str) -> None:
    """Create only owned pytest fixtures, without an external editing tool."""
    assert not path.is_relative_to(ROOT)
    assert not path.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def load_script():
    # The real script inserts its own directory on import; restore caller state.
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
        # Existing owned cache only; never call imported default real-cache path.
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


def invoke(monkeypatch, module, argv=()):
    monkeypatch.setattr(sys, 'argv', ['fetch_jpl_sbdb.py', *argv])
    return module.main()


def expected_calls(limits=(100, 30, 20)):
    return [('ensure_cache_dir', None), ('top', limits[0]), ('neo', limits[1]), ('trojan', limits[2])]


@pytest.mark.parametrize('invalid', ['missing-backend', 'missing-frontend', 'directory-backend', 'directory-frontend'])
def test_invalid_non_dry_run_targets_fail_before_side_effects(tmp_path, monkeypatch, invalid):
    targets = prepare(tmp_path, invalid)
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    exception_class = FileNotFoundError if invalid.startswith('missing-') else IsADirectoryError
    with pytest.raises(exception_class) as failure:
        invoke(monkeypatch, module)
    # Both existing source bytes and the prior cache must survive unchanged.
    assert snapshot(targets) == before
    assert calls == []
    diagnostic = ''.join(traceback.format_exception_only(failure.type, failure.value))
    assert str(targets[invalid.split('-', 1)[1]]) in diagnostic
    assert '--dry-run' in diagnostic


@pytest.mark.parametrize('invalid', ['missing-backend', 'missing-frontend'])
def test_selected_policy_rejects_missing_target_even_when_provider_would_return_no_rows(tmp_path, monkeypatch, invalid):
    targets = prepare(tmp_path, invalid)
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls, no_rows=True)
    with pytest.raises(FileNotFoundError):
        invoke(monkeypatch, module)
    assert calls == []
    assert snapshot(targets) == before


@pytest.mark.parametrize('invalid', ['missing-backend', 'missing-frontend', 'directory-frontend'])
def test_dry_run_still_generates_samples_with_unavailable_write_target(tmp_path, monkeypatch, capsys, invalid):
    targets = prepare(tmp_path, invalid)
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    assert invoke(monkeypatch, module, ['--dry-run']) is None
    assert snapshot(targets) == before
    assert calls == expected_calls()
    output = capsys.readouterr().out
    assert '=== Dry Run - Sample entries ===' in output
    assert 'Python:' in output and 'JavaScript:' in output
    assert 'auditfixture-9999999' in output
    assert 'Updated ' not in output


def test_dry_run_preserves_existing_backend_directory_read_failure(tmp_path, monkeypatch):
    # --dry-run still reads existing backend IDs; no new parser policy is chosen.
    targets = prepare(tmp_path, 'directory-backend')
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    with pytest.raises(IsADirectoryError):
        invoke(monkeypatch, module, ['--dry-run'])
    assert calls == [('ensure_cache_dir', None)]
    assert snapshot(targets) == before


@pytest.mark.parametrize('argv,limits', [([], (100, 30, 20)), (['--limit', '7', '--neo-limit', '3', '--trojan-limit', '2'], (7, 3, 2))])
def test_valid_legacy_pair_preserves_native_output_and_limit_forwarding(tmp_path, monkeypatch, capsys, argv, limits):
    targets = prepare(tmp_path)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    assert invoke(monkeypatch, module, argv) is None
    assert calls == expected_calls(limits)
    tree = ast.parse(targets['backend'].read_text())
    assignment = next(node for node in tree.body if isinstance(node, ast.Assign) and node.targets[0].id == 'ASTEROID_BELT_OBJECTS')
    bodies = ast.literal_eval(assignment.value)
    assert len(bodies) == 1
    assert bodies[0]['id'] == 'auditfixture-9999999'
    assert bodies[0]['orbit'] == {
        'epoch_jd': 2461000.5, 'a_au': 2.7, 'e': 0.1, 'i_deg': 1.0,
        'ascending_node_deg': 2.0, 'arg_periapsis_deg': 3.0,
        'mean_anomaly_deg': 4.0, 'period_days': 1600.0,
    }
    javascript = targets['frontend'].read_text()
    assert "id: 'auditfixture-9999999'" in javascript
    assert 'epochJd: 2461000.5' in javascript
    cached = json.loads(targets['cache'].read_text())
    assert len(cached) == 1 and cached[0]['id'] == bodies[0]['id']
    assert cached[0]['orbit'] == bodies[0]['orbit']
    assert targets['typescript'].read_text() == TS
    output = capsys.readouterr().out
    assert 'Updated backend/data/bodies.py: +1 entries' in output
    assert 'Updated src/data/planets.js: +1 entries' in output
    assert 'Total new asteroids: 1' in output
    assert 'Files modified: bodies.py, planets.js' in output


@pytest.mark.parametrize('no_rows,duplicate', [(True, False), (False, True)])
def test_valid_pair_preserves_empty_or_existing_identity_no_new_behavior(tmp_path, monkeypatch, capsys, no_rows, duplicate):
    targets = prepare(tmp_path, duplicate=duplicate)
    before = snapshot(targets)
    calls = []
    module = load_script()
    configure(module, tmp_path, calls, no_rows=no_rows)
    assert invoke(monkeypatch, module) is None
    assert calls == expected_calls()
    after = snapshot(targets)
    for name in ('backend', 'frontend', 'typescript'):
        assert after[name] == before[name]
    assert json.loads(targets['cache'].read_text()) == []
    output = capsys.readouterr().out
    assert 'No new bodies to add. Done.' in output
    assert 'Updated ' not in output


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


def test_owned_cli_missing_frontend_preserves_error_exit_without_partial_publication(tmp_path):
    targets = prepare(tmp_path, 'missing-frontend')
    before = snapshot(targets)
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), '--owned-cli', str(tmp_path)],
        text=True, capture_output=True, timeout=10,
        env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'},
    )
    assert result.returncode == 1
    assert 'FileNotFoundError' in result.stderr
    assert snapshot(targets) == before
    assert 'OWNED_SIDE_EFFECT_ATTEMPT:' not in result.stdout
    assert str(targets['frontend']) in result.stderr
    assert '--dry-run' in result.stderr


def test_help_remains_available_before_target_validation(tmp_path, monkeypatch, capsys):
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
    assert 'Fetch JPL SBDB asteroid data' in output
    assert '--dry-run' in output


if __name__ == '__main__':
    # Deliberately uncaught product exceptions preserve the real CLI exit path.
    assert len(sys.argv) == 3 and sys.argv[1] == '--owned-cli'
    root = Path(sys.argv[2]).resolve()
    assert not root.is_relative_to(ROOT)
    module = load_script()
    configure(module, root, [], trace=True)
    sys.argv = ['fetch_jpl_sbdb.py']
    module.main()


# Append-only supplemental policy/compatibility cases; original seventeen intact.
@pytest.mark.parametrize('target_name', ['backend', 'frontend'])
def test_valid_owned_symlink_target_preserves_existing_follow_behavior(tmp_path, monkeypatch, capsys, target_name):
    targets = prepare(tmp_path, f'missing-{target_name}')
    target = targets[target_name]
    backing = target.with_name(target.name + '.owned-regular')
    save_fixture(backing, PY if target_name == 'backend' else JS)
    target.symlink_to(backing.name)
    before_link = target.readlink()
    assert target.is_symlink() and target.is_file()
    calls = []
    module = load_script()
    configure(module, tmp_path, calls)
    assert invoke(monkeypatch, module) is None
    assert calls == expected_calls()
    assert target.is_symlink() and target.readlink() == before_link
    assert target.read_bytes() == backing.read_bytes()
    assert 'auditfixture-9999999' in backing.read_text()
    assert 'auditfixture-9999999' in targets['backend'].read_text()
    assert "id: 'auditfixture-9999999'" in targets['frontend'].read_text()
    cached = json.loads(targets['cache'].read_text())
    assert len(cached) == 1 and cached[0]['id'] == 'auditfixture-9999999'
    assert targets['typescript'].read_text() == TS
    output = capsys.readouterr().out
    assert 'Updated backend/data/bodies.py: +1 entries' in output
    assert 'Updated src/data/planets.js: +1 entries' in output


def test_owned_unix_socket_target_rejects_before_non_dry_run_side_effects(tmp_path, monkeypatch):
    import socket
    if not hasattr(socket, 'AF_UNIX'):
        pytest.skip('Unix-domain filesystem sockets are unavailable on this platform')
    targets = prepare(tmp_path, 'missing-frontend')
    target = targets['frontend']
    target.parent.mkdir(parents=True, exist_ok=True)
    # Filesystem-only owned endpoint; never listen/connect or contact any provider.
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as owned_socket:
        owned_socket.bind(str(target))
        assert target.is_socket() and not target.is_file()
        before = snapshot(targets)
        calls = []
        module = load_script()
        configure(module, tmp_path, calls)
        with pytest.raises(OSError) as failure:
            invoke(monkeypatch, module)
        # Deliberate preflight OSError, not the later incidental open(socket) error.
        assert snapshot(targets) == before
        assert calls == []
        assert target.is_socket()
        diagnostic = ''.join(traceback.format_exception_only(failure.type, failure.value))
        assert str(target) in diagnostic
        assert '--dry-run' in diagnostic
