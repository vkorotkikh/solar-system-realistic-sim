"""Offline input integrity, independent accuracy, and publication regressions."""
import json
from pathlib import Path
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_moon_repairs as repairs


def test_real_extension_rebuild_is_byte_identical_without_network():
    with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')), patch('socket.create_connection', side_effect=AssertionError('network forbidden')):
        assert repairs.encoded(repairs.generate()) == repairs.OUTPUT.read_bytes()


def test_missing_source_does_not_attempt_network(tmp_path):
    with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
        with pytest.raises(FileNotFoundError):
            repairs.generate(tmp_path)


def test_corrupted_normalized_source_is_rejected(tmp_path):
    manifest = json.loads((repairs.INPUTS / 'manifest.json').read_bytes())
    entry = next(iter(manifest['bodies'].values()))['inputs']['source']
    (tmp_path / entry['file']).write_bytes(b'corrupted source')
    with pytest.raises(ValueError, match='checksum'):
        repairs.read_rows(tmp_path, entry)


@pytest.mark.parametrize('purpose', ['held', 'endpoints', 'oracle'])
def test_training_cannot_include_validation_epochs(purpose):
    row = repairs.fit.original.ElementRow(2451545., .1, 1., 2., 3., 4., 5., 1000.)
    with pytest.raises(ValueError, match='overlap'):
        repairs.ensure_disjoint([row], [row] if purpose == 'held' else [],
            [row] if purpose == 'endpoints' else [], [{'jd_tdb': row.jd}] if purpose == 'oracle' else [])


def test_failed_publication_preserves_existing_artifact(tmp_path):
    path = tmp_path / 'artifact.json'
    path.write_bytes(b'old')
    with patch.object(repairs.os, 'replace', side_effect=OSError('injected failure')):
        with pytest.raises(OSError, match='injected failure'):
            repairs.publish(path, b'new')
    assert path.read_bytes() == b'old'
    assert list(tmp_path.iterdir()) == [path]
