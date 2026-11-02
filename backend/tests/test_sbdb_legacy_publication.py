"""An obsolete second catalog target must never cause a partial source update."""
import importlib.util
import sys
from pathlib import Path

import pytest


@pytest.fixture
def legacy_sbdb(tmp_path, monkeypatch):
    scripts = Path(__file__).resolve().parents[2] / "scripts"
    monkeypatch.syspath_prepend(str(scripts))
    spec = importlib.util.spec_from_file_location("owned_legacy_sbdb", scripts / "fetch_jpl_sbdb.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    bodies = tmp_path / "backend/data/bodies.py"
    bodies.parent.mkdir(parents=True)
    bodies.write_bytes(b"ASTEROID_BELT_OBJECTS = []\nKUIPER_BELT_OBJECTS = []\n")
    cache = tmp_path / "cache"
    cache.mkdir()
    monkeypatch.setattr(module, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(module, "BODIES_PY_PATH", bodies)
    monkeypatch.setattr(module, "PLANETS_JS_PATH", tmp_path / "src/data/planets.js")
    monkeypatch.setattr(module, "CACHE_DIR", cache)
    acquisition = []
    row = {"spkid": "29999999", "full_name": "999999 AuditFixture", "a": "2.7",
           "e": "0.1", "i": "10", "om": "20", "w": "30", "ma": "40",
           "per": "1620", "epoch": "2461000.5", "h": "15", "diameter": "10", "class": "MBA"}
    def acquire(name, result):
        def call(*args, **kwargs):
            acquisition.append(name)
            return result
        return call
    monkeypatch.setattr(module, "ensure_cache_dir", acquire("cache", None))
    monkeypatch.setattr(module, "fetch_top_asteroids", acquire("top", [row]))
    monkeypatch.setattr(module, "fetch_notable_neos", acquire("neos", []))
    monkeypatch.setattr(module, "fetch_trojans", acquire("trojans", []))
    return module, bodies, cache, acquisition


@pytest.mark.parametrize("arguments", [[], ["--limit", "1"], ["--write"], ["--dry-run", "--write"]])
def test_retired_write_rejected_before_fetch_cache_or_partial_source_update(
        legacy_sbdb, monkeypatch, capsys, arguments):
    module, bodies, cache, acquisition = legacy_sbdb
    initial = bodies.read_bytes()
    monkeypatch.setattr(sys, "argv", [module.__file__, *arguments])
    failure = None
    try:
        module.main()
    except (SystemExit, OSError) as error:
        failure = error
    assert bodies.read_bytes() == initial
    assert list(cache.iterdir()) == []
    assert not module.PLANETS_JS_PATH.exists()
    assert acquisition == []
    assert isinstance(failure, SystemExit) and failure.code == 2
    message = capsys.readouterr().err
    assert "retired" in message
    assert "build_asteroid_phase1_dataset.py" in message
    assert "--dry-run" in message


def test_legacy_preview_keeps_sources_and_catalog_output_unchanged(legacy_sbdb, monkeypatch, capsys):
    module, bodies, cache, _acquisition = legacy_sbdb
    initial = bodies.read_bytes()
    monkeypatch.setattr(sys, "argv", [module.__file__, "--dry-run"])
    module.main()
    assert bodies.read_bytes() == initial
    assert list(cache.iterdir()) == []
    assert not module.PLANETS_JS_PATH.exists()
    assert "AuditFixture" in capsys.readouterr().out


def test_legacy_help_documents_preview_and_publication_replacement(legacy_sbdb, monkeypatch, capsys):
    module, _bodies, _cache, acquisition = legacy_sbdb
    monkeypatch.setattr(sys, "argv", [module.__file__, "--help"])
    with pytest.raises(SystemExit) as exit_info:
        module.main()
    assert exit_info.value.code == 0
    output = capsys.readouterr().out
    assert "retired" in output
    assert "build_asteroid_phase1_dataset.py" in output
    assert "--dry-run" in output
    assert acquisition == []
