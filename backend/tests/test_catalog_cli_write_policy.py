"""TOOL-056 / P6: explicit CLI catalog-publication opt-in.

Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
Promotes the approved 40-case candidate; synthetic inputs and owned outputs only.
Actual main/argparse/publishers run. Direct APIs, Gaia acquisition/cache and
separately explicit fallback writes retain their existing contracts.
"""
from __future__ import annotations

import csv
import importlib.util
import json
import os
import socket
import sys
import urllib.request
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
TAP_HEADER = "source_id,ra,dec,phot_g_mean_mag,bp_rp,parallax,pmra,pmdec,radial_velocity\n"
TAP_ROW = "1234567890123456789,12.25,30.5,2.0,1.0,200,3,4,5\n"


def load_script(name, monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(f"tool056_owned_{name}", SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def denied(*args, **kwargs):
        raise AssertionError("TOOL056 forbids provider/network access")
    monkeypatch.setattr(socket, "create_connection", denied)
    monkeypatch.setattr(socket.socket, "connect", denied)
    monkeypatch.setattr(urllib.request, "urlopen", denied)
    yield denied


def invoke(module, argv, monkeypatch):
    monkeypatch.setattr(sys, "argv", [module.__file__, *argv])
    return module.main()


def snapshot(path):
    return path.read_bytes() if path.exists() else None


@pytest.fixture
def phase(tmp_path, monkeypatch):
    module = load_script("build_asteroid_phase1_dataset", monkeypatch)
    output = tmp_path / "phase-default"
    source = tmp_path / "source-placeholder-not-read"
    calls = []

    def artifacts(limit, bin_name, meta_name, source_dir):
        calls.append((limit, bin_name, meta_name, source_dir))
        return {bin_name: b"OWNED SYNTHETIC BINARY\n", meta_name: b'{"owned":true}\n', "sample_top_10.json": b"[]\n"}

    monkeypatch.setattr(module, "DEFAULT_OUTPUT_DIR", output)
    monkeypatch.setattr(module, "SOURCE_DIR", source)
    monkeypatch.setattr(module, "dataset_artifacts", artifacts)
    return SimpleNamespace(module=module, output=output, source=source, calls=calls)


@pytest.mark.parametrize("existing", [False, True])
def test_phase_default_does_not_publish(phase, existing, monkeypatch):
    target = phase.output / phase.module.DEFAULT_BIN_NAME
    if existing:
        phase.output.mkdir()
        target.write_bytes(b"OLD OWNED BUNDLE\n")
    before = snapshot(target)
    invoke(phase.module, [], monkeypatch)
    assert len(phase.calls) == 1
    assert snapshot(target) == before


def test_phase_selection_flags_do_not_authorize_publication(phase, monkeypatch):
    invoke(phase.module, ["--offline", "--limit", "3"], monkeypatch)
    assert phase.calls[0][0] == 3
    assert not phase.output.exists()


@pytest.mark.parametrize("existing", [False, True])
def test_control_phase_dry_run_preserves_explicit_destination(phase, tmp_path, existing, monkeypatch):
    output = tmp_path / "explicit-dry-run"
    target = output / "chosen.bin"
    if existing:
        output.mkdir()
        target.write_bytes(b"OLD\n")
    before = snapshot(target)
    invoke(phase.module, ["--dry-run", "--output-dir", str(output), "--bin-name", "chosen.bin", "--meta-name", "chosen.json"], monkeypatch)
    assert snapshot(target) == before
    assert not phase.output.exists()
    assert phase.calls == [(100000, "chosen.bin", "chosen.json", phase.source)]


def test_control_phase_check_byte_identical_does_not_republish(phase, monkeypatch):
    phase.output.mkdir()
    payload = phase.module.dataset_artifacts(100000, phase.module.DEFAULT_BIN_NAME, phase.module.DEFAULT_META_NAME, phase.source)
    for name, data in payload.items():
        (phase.output / name).write_bytes(data)
    before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns, p.stat().st_ino) for p in phase.output.iterdir()}
    invoke(phase.module, ["--check"], monkeypatch)
    assert {p.name: (p.read_bytes(), p.stat().st_mtime_ns, p.stat().st_ino) for p in phase.output.iterdir()} == before


def test_control_phase_check_mismatch_does_not_repair(phase, monkeypatch):
    phase.output.mkdir()
    target = phase.output / phase.module.DEFAULT_BIN_NAME
    target.write_bytes(b"MISMATCH\n")
    with pytest.raises(ValueError, match="artifact differs"):
        invoke(phase.module, ["--check"], monkeypatch)
    assert target.read_bytes() == b"MISMATCH\n"
    assert list(phase.output.iterdir()) == [target]


def test_control_phase_help_does_not_generate(phase, monkeypatch):
    with pytest.raises(SystemExit) as exc:
        invoke(phase.module, ["--help"], monkeypatch)
    assert exc.value.code == 0
    assert phase.calls == []
    assert not phase.output.exists()


def test_control_phase_existing_modes_remain_exclusive(phase, monkeypatch):
    with pytest.raises(SystemExit) as exc:
        invoke(phase.module, ["--check", "--dry-run"], monkeypatch)
    assert exc.value.code == 2
    assert phase.calls == []
    assert not phase.output.exists()


def test_control_phase_direct_api_still_publishes(phase):
    phase.module.build_dataset(phase.output, 2, "direct.bin", "direct.json", phase.source)
    assert (phase.output / "direct.bin").read_bytes() == b"OWNED SYNTHETIC BINARY\n"
    assert (phase.output / "direct.json").read_bytes() == b'{"owned":true}\n'
    assert (phase.output / "sample_top_10.json").read_bytes() == b"[]\n"


@pytest.fixture
def gaia(tmp_path, monkeypatch, no_network):
    module = load_script("fetch_gaia_catalog", monkeypatch)
    owner = tmp_path / "gaia"
    stars = owner / "src/data/stars_catalog.json"
    nearby = owner / "solar-systems/nearby.csv"
    stars.parent.mkdir(parents=True)
    nearby.parent.mkdir(parents=True)
    cache = owner / "query-cache"
    fallback = owner / "fallback"
    for name, value in {"PROJECT_ROOT": owner, "STARS_JSON_PATH": stars, "NEARBY_CSV_PATH": nearby, "CACHE_DIR": cache, "FALLBACK_DIR": fallback}.items():
        monkeypatch.setattr(module, name, value)
    original_ensure = module.ensure_cache_dir
    monkeypatch.setattr(module, "ensure_cache_dir", lambda: original_ensure(cache))
    monkeypatch.setattr(module, "http_get", no_network)
    calls = []
    responses = {"bright": TAP_HEADER + TAP_ROW, "nearby": TAP_HEADER + TAP_ROW}

    def tap(request, endpoint, timeout=120.0):
        kind = "nearby" if "SELECT source_id" in request["QUERY"] else "bright"
        calls.append((kind, dict(request), endpoint, timeout))
        return responses[kind]

    monkeypatch.setattr(module, "_run_tap_request", tap)
    return SimpleNamespace(module=module, owner=owner, stars=stars, nearby=nearby, cache=cache, fallback=fallback, calls=calls, responses=responses)


def seed_gaia(gaia):
    gaia.stars.write_bytes(b"[[999,999,999,999]]\n")
    with gaia.nearby.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=gaia.module.CSV_FIELDNAMES)
        writer.writeheader()
        writer.writerow({"rank": "7", "sys_id": "7", "identifier": "OWNED existing", "ra_deg": "0", "dec_deg": "0"})


@pytest.mark.parametrize("existing", [False, True])
@pytest.mark.parametrize("target_name", ["stars", "nearby"])
def test_gaia_default_does_not_publish_catalogs(gaia, existing, target_name, monkeypatch):
    if existing:
        seed_gaia(gaia)
    target = getattr(gaia, target_name)
    before = snapshot(target)
    invoke(gaia.module, [], monkeypatch)
    assert [c[0] for c in gaia.calls] == ["bright", "nearby"]
    assert snapshot(target) == before


def test_gaia_save_fallback_only_does_not_authorize_catalog_publication(gaia, monkeypatch):
    seed_gaia(gaia)
    before = (snapshot(gaia.stars), snapshot(gaia.nearby))
    invoke(gaia.module, ["--save-fallback"], monkeypatch)
    assert (gaia.fallback / "gaia_bright_stars_fallback.json").exists()
    assert (snapshot(gaia.stars), snapshot(gaia.nearby)) == before


def test_gaia_selection_flags_do_not_authorize_publication(gaia, monkeypatch):
    invoke(gaia.module, ["--max-stars", "1", "--max-mag", "5.5", "--min-parallax-mas", "150", "--match-radius", "1"], monkeypatch)
    assert "phot_g_mean_mag < 5.5" in gaia.calls[0][1]["QUERY"]
    assert "parallax > 150.0" in gaia.calls[1][1]["QUERY"]
    assert not gaia.stars.exists()
    assert not gaia.nearby.exists()


def test_control_gaia_still_acquires_and_populates_query_cache(gaia, monkeypatch):
    invoke(gaia.module, [], monkeypatch)
    assert [c[0] for c in gaia.calls] == ["bright", "nearby"]
    caches = sorted(gaia.cache.glob("*.json"))
    assert len(caches) == 2
    assert all(json.loads(p.read_bytes())[0]["ra"] == 12.25 for p in caches)
    invoke(gaia.module, [], monkeypatch)
    assert len(gaia.calls) == 2


def test_control_gaia_explicit_fallback_still_writes(gaia, monkeypatch):
    invoke(gaia.module, ["--save-fallback"], monkeypatch)
    saved = json.loads((gaia.fallback / "gaia_bright_stars_fallback.json").read_bytes())
    assert saved[0]["ra"] == 12.25
    assert saved[0]["phot_g_mean_mag"] == 2.0


def test_control_gaia_does_not_implicitly_save_fallback(gaia, monkeypatch):
    invoke(gaia.module, [], monkeypatch)
    assert not gaia.fallback.exists()


def test_control_gaia_no_nearby_data_preserves_csv(gaia, monkeypatch):
    seed_gaia(gaia)
    before = gaia.nearby.read_bytes()
    gaia.responses["nearby"] = TAP_HEADER
    invoke(gaia.module, [], monkeypatch)
    assert gaia.nearby.read_bytes() == before


def test_control_gaia_direct_writers_remain_available(gaia):
    gaia.module.write_stars_catalog([[1, 2, 3, 4]], gaia.stars)
    gaia.module.write_nearby_csv([{"rank": "1", "identifier": "OWNED direct"}], gaia.nearby)
    assert json.loads(gaia.stars.read_bytes()) == [[1, 2, 3, 4]]
    assert gaia.module.load_existing_nearby_csv(gaia.nearby)[0]["identifier"] == "OWNED direct"


def test_control_gaia_help_does_not_acquire_or_write(gaia, monkeypatch):
    with pytest.raises(SystemExit) as exc:
        invoke(gaia.module, ["--help"], monkeypatch)
    assert exc.value.code == 0
    assert gaia.calls == []
    assert not gaia.cache.exists()
    assert not gaia.stars.exists()
    assert not gaia.nearby.exists()
    assert not gaia.fallback.exists()


# Append-only root policy supplement. Original22 prefix remains byte-identical.
@pytest.mark.parametrize("existing", [False, True])
@pytest.mark.parametrize("external", [False, True])
def test_phase_explicit_write_publishes_selected_destination(phase, tmp_path, existing, external, monkeypatch):
    output = tmp_path / "external-publication" if external else phase.output
    if existing:
        output.mkdir()
        (output / "chosen.bin").write_bytes(b"OLD OWNED BINARY\n")
        (output / "keep.txt").write_bytes(b"UNRELATED OWNED\n")
    argv = ["--write", "--limit", "2", "--bin-name", "chosen.bin", "--meta-name", "chosen.json"]
    if external:
        argv += ["--output-dir", str(output)]
    invoke(phase.module, argv, monkeypatch)
    assert (output / "chosen.bin").read_bytes() == b"OWNED SYNTHETIC BINARY\n"
    assert (output / "chosen.json").read_bytes() == b'{"owned":true}\n'
    assert (output / "sample_top_10.json").read_bytes() == b"[]\n"
    assert phase.calls == [(2, "chosen.bin", "chosen.json", phase.source)]
    if existing:
        assert (output / "keep.txt").read_bytes() == b"UNRELATED OWNED\n"
    if external:
        assert not phase.output.exists()


@pytest.mark.parametrize("existing", [False, True])
def test_phase_output_selection_alone_does_not_authorize_publication(phase, tmp_path, existing, monkeypatch):
    output = tmp_path / "selected-without-consent"
    target = output / phase.module.DEFAULT_BIN_NAME
    if existing:
        output.mkdir()
        target.write_bytes(b"OLD EXTERNAL\n")
    before = snapshot(target)
    invoke(phase.module, ["--output-dir", str(output)], monkeypatch)
    assert len(phase.calls) == 1
    assert snapshot(target) == before
    assert not phase.output.exists()


@pytest.mark.parametrize("other", ["--check", "--dry-run"])
def test_phase_write_conflicts_fail_before_generation(phase, other, monkeypatch, capsys):
    with pytest.raises(SystemExit) as exc:
        invoke(phase.module, ["--write", other], monkeypatch)
    assert exc.value.code == 2
    assert "not allowed with argument" in capsys.readouterr().err
    assert phase.calls == []
    assert not phase.output.exists()


@pytest.mark.parametrize("existing", [False, True])
@pytest.mark.parametrize("save_fallback", [False, True])
def test_gaia_explicit_write_publishes_catalogs_and_only_requested_fallback(gaia, existing, save_fallback, monkeypatch):
    if existing:
        seed_gaia(gaia)
    argv = ["--write"] + (["--save-fallback"] if save_fallback else [])
    invoke(gaia.module, argv, monkeypatch)
    assert json.loads(gaia.stars.read_bytes()) == [[12.25, 30.5, 2.0, 0.84]]
    rows = gaia.module.load_existing_nearby_csv(gaia.nearby)
    assert len(rows) == (2 if existing else 1)
    assert rows[-1]["identifier"] == "Gaia DR3 1234567890123456789"
    assert rows[-1]["rank"] == ("8" if existing else "1")
    if existing:
        assert rows[0]["identifier"] == "OWNED existing"
    fallback = gaia.fallback / "gaia_bright_stars_fallback.json"
    assert fallback.exists() is save_fallback
    if save_fallback:
        assert json.loads(fallback.read_bytes())[0]["ra"] == 12.25
    assert len(list(gaia.cache.glob("*.json"))) == 2
    assert [c[0] for c in gaia.calls] == ["bright", "nearby"]


def test_gaia_write_without_nearby_data_preserves_csv(gaia, monkeypatch):
    seed_gaia(gaia)
    before = gaia.nearby.read_bytes()
    gaia.responses["nearby"] = TAP_HEADER
    invoke(gaia.module, ["--write"], monkeypatch)
    assert gaia.nearby.read_bytes() == before
    assert json.loads(gaia.stars.read_bytes()) == [[12.25, 30.5, 2.0, 0.84]]


def test_phase_help_documents_write_opt_in(phase, monkeypatch, capsys):
    with pytest.raises(SystemExit) as exc:
        invoke(phase.module, ["--help"], monkeypatch)
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "--write" in out
    assert "--check" in out and "--dry-run" in out


def test_gaia_help_documents_write_and_cache_effects(gaia, monkeypatch, capsys):
    with pytest.raises(SystemExit) as exc:
        invoke(gaia.module, ["--help"], monkeypatch)
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "--write" in out
    assert "cache" in out.lower()
    assert "--save-fallback" in out


def test_phase_default_output_explains_publication_opt_in(phase, monkeypatch, capsys):
    invoke(phase.module, [], monkeypatch)
    out = capsys.readouterr().out
    assert "--write" in out
    assert "[phase1] built" not in out


def test_gaia_default_output_explains_publication_opt_in(gaia, monkeypatch, capsys):
    invoke(gaia.module, [], monkeypatch)
    out = capsys.readouterr().out
    assert "--write" in out
    assert "Wrote" not in out
    assert "cache" in out.lower()


def test_control_gaia_preview_still_builds_and_cross_matches(gaia, monkeypatch):
    seed_gaia(gaia)
    built, matched = [], []
    original_build = gaia.module.build_stars_catalog
    original_match = gaia.module.cross_match_nearby

    def build(*args, **kwargs):
        result = original_build(*args, **kwargs)
        built.append(result)
        return result

    def match(*args, **kwargs):
        result = original_match(*args, **kwargs)
        matched.append(result)
        return result

    monkeypatch.setattr(gaia.module, "build_stars_catalog", build)
    monkeypatch.setattr(gaia.module, "cross_match_nearby", match)
    invoke(gaia.module, [], monkeypatch)
    assert built == [[[12.25, 30.5, 2.0, 0.84]]]
    assert len(matched) == 1
    assert [r["identifier"] for r in matched[0]] == ["OWNED existing", "Gaia DR3 1234567890123456789"]


