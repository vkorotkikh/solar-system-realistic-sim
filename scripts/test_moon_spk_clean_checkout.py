"""Pinned native reconstruction must not require or create a local npm cache."""
import json
from pathlib import Path
import sys
from unittest.mock import patch

import pytest

pytest.importorskip('spiceypy', reason='native validation requires SpiceyPy; not a scientific pass')
sys.path.insert(0, str(Path(__file__).resolve().parent))
import capture_daphnis_spk_oracle as daphnis
import repair_spk_moon_ephemeris as repair
from generate_moon_repairs import encoded


def test_offline_75052_generation_neither_requires_nor_creates_candidate_cache(tmp_path, monkeypatch):
    cache = tmp_path / 'missing-parent' / 'candidate-cache'
    monkeypatch.setattr(repair, 'CACHE', cache)
    monkeypatch.setattr(repair, 'OFFLINE', True)
    with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
        body = repair.generate(75052)
    expected = json.loads(repair.OUTPUT.read_bytes())['bodies']['s2025_u_1']
    assert encoded(body) == encoded(expected)
    assert not cache.parent.exists()


def test_daphnis_native_evaluation_does_not_require_repository_cache(tmp_path, monkeypatch):
    captured = json.loads(daphnis.DESTINATION.read_bytes())
    monkeypatch.setattr(daphnis, 'ROOT', tmp_path / 'clean-checkout')
    with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
        actual = daphnis.evaluate(captured)
    assert actual == captured['states']
    assert not (tmp_path / 'clean-checkout').exists()
