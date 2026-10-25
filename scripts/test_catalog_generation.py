"""Catalog contract regressions; synthetic rows here are tests, never source snapshots."""
import math
import gzip
import hashlib
import json
import sys
import struct
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_asteroid_phase1_dataset as asteroid
import catalog_sources as sources
import generate_moon_ephemeris as moon


def row(**changes):
    value = dict(spkid="2000001", full_name="1 Example", a="2.7", e="0.1",
                 i="10", om="20", w="30", ma="40", per="1620.12567890123",
                 epoch="2461000.5", diameter="10", h="15", albedo=None,
                 spec_b=None, spec_t=None, **{"class": "MBA"})
    value.update(changes)
    return value


@pytest.mark.parametrize("a", ["2.2", "2.6", "3.1"])
def test_missing_science_is_unknown_at_every_belt_radius(a):
    records, counts, _ = asteroid._build_records([row(a=a)])
    assert records[0]["taxonomy_index"] == 255
    assert records[0]["taxonomy_name"] == "unknown"
    assert records[0]["albedo"] is None
    assert counts["unknown"] == 1


def test_observed_albedo_and_precise_period_survive_conversion():
    records, _, _ = asteroid._build_records([row(albedo="0.423", spec_t="V")])
    assert records[0]["albedo"] == 0.423
    assert records[0]["period_days"] == 1620.12567890123


def test_ambiguous_x_taxonomy_is_not_claimed_to_be_metallic():
    records, _, _ = asteroid._build_records([row(spec_b="X")])
    assert records[0]["taxonomy_index"] != 2


def test_diameter_uses_diameter_coefficient_and_requires_known_albedo():
    assert asteroid._estimate_diameter_km(15, None, 0.25) == pytest.approx(2.658)
    assert asteroid._estimate_diameter_km(15, None, None) is None


def test_missing_period_is_rejected_instead_of_silently_synthesized():
    with pytest.raises(ValueError, match="per"):
        asteroid._build_records([row(per=None)])


def test_source_identity_is_unique():
    with pytest.raises(ValueError, match="duplicate"):
        asteroid._build_records([row(), row()])


def test_population_order_is_diameter_descending_with_stable_identity_ties():
    records, _, _ = asteroid._build_records([
        row(spkid="3", diameter="3"), row(spkid="2", diameter="20"),
        row(spkid="1", diameter="20"),
    ])
    assert [r["source_id"] for r in records] == [1, 2, 3]


def test_publication_failure_cannot_mix_binary_and_metadata(tmp_path):
    output = tmp_path / "bundle"
    sources.publish_directory(output, {"catalog.bin": b"old-binary", "catalog.json": b"old-meta"})
    with patch.object(sources, "_exchange_directories", side_effect=OSError("exchange denied")):
        with pytest.raises(OSError, match="exchange denied"):
            sources.publish_directory(output, {"catalog.bin": b"new-binary", "catalog.json": b"new-meta"})
    assert (output / "catalog.bin").read_bytes() == b"old-binary"
    assert (output / "catalog.json").read_bytes() == b"old-meta"
    sources.publish_directory(output, {"catalog.bin": b"new-binary", "catalog.json": b"new-meta"})
    assert (output / "catalog.bin").read_bytes() == b"new-binary"
    assert (output / "catalog.json").read_bytes() == b"new-meta"


def test_missing_offline_inputs_never_attempt_network_or_touch_output(tmp_path):
    output = tmp_path / "output"
    output.mkdir()
    (output / "keep").write_bytes(b"original")
    with patch("urllib.request.urlopen", side_effect=AssertionError("network forbidden")):
        with pytest.raises(FileNotFoundError):
            asteroid.build_dataset(output, 100000, "a.bin", "a.json", tmp_path / "absent")
    assert {p.name: p.read_bytes() for p in output.iterdir()} == {"keep": b"original"}


def test_pinned_source_corruption_is_rejected_before_parse(tmp_path):
    url = sources.request_url("https://example.test/source", {"id": "1"})
    key = hashlib.sha256(url.encode()).hexdigest()
    raw = b'{"realistic":"test-only"}'
    (tmp_path / "manifest.json").write_bytes(sources.json_bytes({"schemaVersion": 1, "responses": {
        key: {"url": url, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
    }}))
    (tmp_path / f"{key}.json.gz").write_bytes(gzip.compress(raw.replace(b"test-only", b"corrupted")))
    with pytest.raises(ValueError, match="checksum"):
        sources.SourceStore(tmp_path).read("https://example.test/source", {"id": "1"})


def test_moon_missing_pin_fails_offline(tmp_path):
    with patch("urllib.request.urlopen", side_effect=AssertionError("network forbidden")):
        with pytest.raises(FileNotFoundError):
            moon._fetch_result(moon._query_params(moon.TARGETS[0], 2451545, 2451546, 0.5), tmp_path)


def test_moon_rejects_truncated_grid_instead_of_extending_query(tmp_path):
    sample = moon.ElementRow(2451545, 0.01, 1, 2, 3, 4, 5, 1000)
    with patch.object(moon, "_fetch_result", return_value="test-only"), patch.object(moon, "_parse_query", return_value=moon.QueryResult((sample,), 1, "SAT441L", "test")):
        with pytest.raises(RuntimeError, match="grid"):
            moon._query(moon.TARGETS[0], moon.COVERAGE_START_JD, 0.5, tmp_path)


def test_real_100k_artifacts_reproduce_offline_and_match_source_science(tmp_path):
    from fetch_jpl_sbdb import SBDB_API_URL, phase1_query_params
    from urllib.parse import urlparse

    # No source is derived from the committed binary. This independent side of
    # the conversion check consumes the raw provider JSON captured over HTTPS.
    store = sources.SourceStore()
    raw = json.loads(store.read(SBDB_API_URL, phase1_query_params()))
    fields = [name.lower() for name in raw["fields"]]
    original = {int(values[0]): dict(zip(fields, values)) for values in raw["data"]}
    assert len(original) == 100000
    assert urlparse(next(e["url"] for e in store.used.values())).hostname == "ssd-api.jpl.nasa.gov"
    for directory in (tmp_path / "first", tmp_path / "second"):
        with patch("socket.create_connection", side_effect=AssertionError("network forbidden")), patch("urllib.request.urlopen", side_effect=AssertionError("network forbidden")):
            asteroid.build_dataset(directory, 100000, asteroid.DEFAULT_BIN_NAME, asteroid.DEFAULT_META_NAME)
    first = tmp_path / "first"
    for name in (asteroid.DEFAULT_BIN_NAME, asteroid.DEFAULT_META_NAME, "sample_top_10.json"):
        expected = (asteroid.DEFAULT_OUTPUT_DIR / name).read_bytes()
        assert (first / name).read_bytes() == expected
        assert (tmp_path / "second" / name).read_bytes() == expected
    binary = (first / asteroid.DEFAULT_BIN_NAME).read_bytes()
    assert len(binary) == 12 + 36 * 100000
    source_ids = []
    unknown_taxonomy = unknown_albedo = 0
    previous_diameter = math.inf
    for offset in range(12, len(binary), 36):
        values = struct.unpack_from("<IffHHHHHffHBBH", binary, offset)
        source_id, period, diameter, albedo_code, taxonomy_code = values[0], values[8], values[9], values[10], values[11]
        source = original[source_id]
        assert period == struct.unpack("<f", struct.pack("<f", float(source["per"])))[0]
        assert diameter == struct.unpack("<f", struct.pack("<f", float(source["diameter"])))[0]
        assert diameter <= previous_diameter
        previous_diameter = diameter
        if source["albedo"] is None:
            assert albedo_code == 0
            unknown_albedo += 1
        else:
            assert abs(albedo_code / 65535 - float(source["albedo"])) <= 0.5 / 65535 + 1e-15
        if not source["spec_b"] and not source["spec_t"]:
            assert taxonomy_code == 255
        if taxonomy_code == 2:
            assert source["spec_t"] == "M"
        unknown_taxonomy += taxonomy_code == 255
        source_ids.append(source_id)
    assert len(set(source_ids)) == 100000
    assert unknown_taxonomy > 90000
    metadata = json.loads((first / asteroid.DEFAULT_META_NAME).read_bytes())
    population = metadata["population_policy"]
    assert population["display_prefix_50000"]["fraction_of_stored"] == 0.5
    assert sum(population["stored"]["a_au_counts"]) == 100000
    assert sum(population["display_prefix_50000"]["inclination_deg_counts"]) == 50000
    assert population["stored"]["unknown_albedo_count"] == unknown_albedo
    assert population["stored"]["taxonomy"]["unknown"] == unknown_taxonomy


def test_check_and_dry_run_do_not_create_or_replace_output(tmp_path):
    absent = tmp_path / "absent"
    asteroid.build_dataset(absent, 1, "a.bin", "a.json", dry_run=True)
    assert not absent.exists()
    with pytest.raises(ValueError, match="artifact differs"):
        asteroid.build_dataset(absent, 1, "a.bin", "a.json", check=True)
    assert not absent.exists()
    output = tmp_path / "present"
    sources.publish_directory(output, {"a.bin": b"old", "a.json": b"old", "sample_top_10.json": b"old"})
    with pytest.raises(ValueError, match="artifact differs"):
        asteroid.build_dataset(output, 1, "a.bin", "a.json", check=True)
    assert {p.read_bytes() for p in output.iterdir()} == {b"old"}


def test_bad_artifact_names_fail_without_writing(tmp_path):
    for binary, meta in (("../escape", "a.json"), ("same", "same"), ("sample_top_10.json", "a.json")):
        with pytest.raises(ValueError):
            asteroid.build_dataset(tmp_path / "output", 1, binary, meta)
    assert list(tmp_path.iterdir()) == []


def test_single_moon_artifact_write_failure_retains_old_bytes(tmp_path):
    path = tmp_path / "moon.json"
    path.write_bytes(b"old")
    with patch.object(sources.os, "replace", side_effect=OSError("injected rename failure")):
        with pytest.raises(OSError):
            sources.publish_file(path, b"new")
    assert path.read_bytes() == b"old"
    assert list(tmp_path.iterdir()) == [path]


def test_moon_multi_target_failure_does_not_publish_partial_artifact(tmp_path):
    path = tmp_path / "moon.json"
    original = sources.json_bytes({"bodies": {t.body_id: {} for t in moon.TARGETS}})
    path.write_bytes(original)
    with patch.object(sys, "argv", ["generator", "--write", "--offline", "--output-path", str(path)]), patch.object(moon, "_generate_target", side_effect=[{"test-only": True}, RuntimeError("injected second target failure")]):
        with pytest.raises(RuntimeError, match="second target"):
            moon.main()
    assert path.read_bytes() == original


def test_moon_subset_cannot_silently_replace_full_population(tmp_path):
    path = tmp_path / "moon.json"
    original = sources.json_bytes({"bodies": {t.body_id: {} for t in moon.TARGETS}})
    path.write_bytes(original)
    with patch.object(sys, "argv", ["generator", "--write", "--bodies", "titan", "--output-path", str(path)]):
        with pytest.raises(SystemExit) as failure:
            moon.main()
    assert failure.value.code == 2
    assert path.read_bytes() == original
