"""Publication/source-store regressions; all fabricated bytes are test-only."""
import gzip
import hashlib
import stat
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capture_catalog_sources as capture
import catalog_sources as sources
from fetch_jpl_sbdb import SBDB_API_URL, phase1_query_params


@pytest.mark.parametrize('mode', [0o644, 0o640, 0o600])
def test_atomic_file_replacement_preserves_existing_permissions(tmp_path, mode):
    path = tmp_path / 'source.json'
    path.write_bytes(b'previous'); path.chmod(mode)
    sources.publish_file(path, b'next')
    assert path.read_bytes() == b'next'
    assert stat.S_IMODE(path.stat().st_mode) == mode


def test_new_catalog_bundle_is_readable_by_a_separate_static_server_identity(tmp_path):
    destination = tmp_path / 'public'
    sources.publish_directory(destination, {'catalog.bin': b'data', 'meta.json': b'metadata'})
    for name in ['catalog.bin', 'meta.json']:
        assert stat.S_IMODE((destination / name).stat().st_mode) == 0o644


@pytest.mark.parametrize('damage', ['missing', 'corrupt', 'wrong-url'])
def test_resume_cannot_report_corrupt_pinned_response_as_success(tmp_path, monkeypatch, damage):
    params = phase1_query_params()
    url = sources.request_url(SBDB_API_URL, params)
    key = hashlib.sha256(url.encode()).hexdigest()
    raw = b'{"test-only":true}'
    manifest = {'schemaVersion': 1, 'responses': {key: {
        'url': url if damage != 'wrong-url' else 'https://example.invalid/wrong',
        'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
    }}}
    original = sources.json_bytes(manifest)
    (tmp_path / 'manifest.json').write_bytes(original)
    if damage != 'missing':
        (tmp_path / f'{key}.json.gz').write_bytes(gzip.compress(b'corrupt' if damage == 'corrupt' else raw))
    monkeypatch.setattr(capture, 'requests', lambda: iter([(SBDB_API_URL, params)]))
    def forbid_network(*_args, **_kwargs):
        raise AssertionError('resume must fail offline, not silently reacquire changed science')
    monkeypatch.setattr(capture.subprocess, 'run', forbid_network)
    with pytest.raises((ValueError, FileNotFoundError)):
        capture.capture(tmp_path, 'asteroids')
    assert (tmp_path / 'manifest.json').read_bytes() == original
