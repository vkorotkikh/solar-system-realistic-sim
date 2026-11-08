"""Offline input integrity, independent accuracy, and publication regressions."""
import json
from pathlib import Path
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_moon_repairs as repairs


def assert_same_artifact_bytes(actual, expected):
    # Pytest's CI byte diff can spend minutes formatting a failed large JSON
    # comparison. Keep exact equality, but bound the diagnostic explicitly.
    if actual != expected:
        offset = next((i for i, pair in enumerate(zip(actual, expected))
                       if pair[0] != pair[1]), min(len(actual), len(expected)))
        start, end = max(0, offset - 16), offset + 16
        pytest.fail(
            f'Artifact bytes differ at offset {offset}: '
            f'actual length={len(actual)} sha256={repairs.sha(actual)}; '
            f'expected length={len(expected)} sha256={repairs.sha(expected)}; '
            f'actual context={actual[start:end]!r}; expected context={expected[start:end]!r}',
            pytrace=False,
        )


@pytest.mark.parametrize('actual_suffix,expected_suffix', [(b'X', b'Y'), (b'', b'Y'), (b'X', b'')])
def test_artifact_mismatch_report_is_bounded_for_large_and_prefix_differences(actual_suffix, expected_suffix):
    prefix = b'0' * 750_000
    with pytest.raises(pytest.fail.Exception) as failure:
        assert_same_artifact_bytes(prefix + actual_suffix, prefix + expected_suffix)
    message = str(failure.value)
    assert 'offset 750000' in message
    assert len(message) < 500


def test_real_extension_rebuild_is_byte_identical_without_network():
    with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')), patch('socket.create_connection', side_effect=AssertionError('network forbidden')):
        assert_same_artifact_bytes(repairs.encoded(repairs.generate()), repairs.OUTPUT.read_bytes())


def test_pinned_carme_cartesian_state_is_cpu_dispatch_independent():
    manifest = json.loads((repairs.INPUTS / 'manifest.json').read_bytes())
    recipe = manifest['bodies']['carme']
    source = repairs.read_rows(repairs.INPUTS, recipe['inputs']['source'])
    index = next(i for i, row in enumerate(source) if row.jd == 2451925.125)
    # Keep the real vector input: native SIMD atan2 changes this pinned row's
    # periapsis by one ULP. These scalar-angle reference values are fixed
    # independently of the function under test; exact bits are the contract.
    features = repairs.fit.features(source, recipe['target']['nominal_period_days'])
    position, velocity = repairs.fit.state_from_features(features[:, 1:])
    assert position[index].tolist() == [
        22073442.050252274, 259720.13972179778, 4878443.271358,
    ]
    assert velocity[index].tolist() == [
        0.6242218964767052, -2.2684118729148506, -0.20899042471775053,
    ]


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
