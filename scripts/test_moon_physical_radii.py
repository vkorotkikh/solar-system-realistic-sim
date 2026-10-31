"""Source integrity and reproducibility for nullable moon physical radii."""
import gzip
import json
from pathlib import Path
import shutil
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_moon_physical_radii as generator


def test_source_reported_radii_reproduce_without_network_and_retain_uncertainty():
    with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
        raw = generator.artifact()
    assert raw == generator.OUTPUT.read_bytes()
    data = json.loads(raw)
    assert len(data['bodies']) == 46
    assert data['bodies']['301']['radiusKm'] == 1737.4
    assert data['bodies']['301']['uncertaintyKm'] == .1
    assert data['bodies']['903']['radiusKm'] == 18.5
    assert '715' not in data['bodies']
    assert all(row['reference'] in data['references'] for row in data['bodies'].values())


def test_changed_physical_source_bytes_fail_before_parsing(tmp_path):
    shutil.copytree(generator.INPUT, tmp_path / 'input')
    path = tmp_path / 'input/jpl-satellite-physical.html.gz'
    raw = gzip.decompress(path.read_bytes()).replace(b'1737.4', b'1737.5')
    path.write_bytes(gzip.compress(raw))
    with pytest.raises(ValueError, match='checksum'):
        generator.artifact(tmp_path / 'input')
