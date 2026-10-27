"""Real native source integrity, withheld phase and publication reproducibility."""
import gzip
import json
from pathlib import Path
import sys
from unittest.mock import patch

import pytest

pytest.importorskip('spiceypy', reason='native SPK validation requires SpiceyPy; not a scientific pass')
sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_spk_moon_ephemeris as repair
from generate_moon_repairs import encoded


def test_native_75052_rebuild_matches_shipped_model_without_network():
    with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
        body = repair.generate(75052)
    expected = json.loads(repair.OUTPUT.read_bytes())['bodies']['s2025_u_1']
    assert encoded(body) == encoded(expected)
    assert body['validation']['accuracyLimits'] == {'positionKm': 57.844, 'velocityMPerS': 10.}
    query = json.loads(body['provenance']['query'])
    assert query['downloadedBytes'] == 1831968
    assert query['additionalHeldOutSamples'] > 4000


def test_native_resampling_rejects_an_uncaptured_record():
    captured = json.loads(gzip.decompress((repair.PINNED/'75052.json.gz').read_bytes()))
    with pytest.raises(ValueError, match='uncaptured'):
        repair.evaluate_captured_epochs(captured, [2451546.234567])
