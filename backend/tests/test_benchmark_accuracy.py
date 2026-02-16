from __future__ import annotations

import json
from pathlib import Path
import shutil

import pytest

from benchmark import benchmark_against_references
from data.bodies import ALL_BODIES


def test_benchmark_uses_strict_reference_integrity() -> None:
    summary = benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")

    assert summary["referenceIntegrityOk"] is True
    assert summary["requiredTools"] == ["gmat", "orekit", "tudat"]
    assert summary["scenarioCount"] >= 1

    for row in summary["rows"]:
        reference = row.get("reference", {})
        assert reference.get("calibrationTier") == "strict"
        assert reference.get("requiredToolsPresent") is True
        assert reference.get("artifactChecksPassed") is True
        tools = reference.get("tools", {})
        assert set(tools.keys()) == {"gmat", "orekit", "tudat"}


def test_benchmark_fails_on_checksum_mismatch(tmp_path) -> None:
    src = tmp_path / "reference_scenarios_bad_checksum.json"
    reference_path = Path(__file__).resolve().parents[1] / "benchmark" / "reference_scenarios.json"
    original = json.loads(
        reference_path.read_text(encoding="utf-8")
    )
    shutil.copytree(reference_path.parent / "artifacts", tmp_path / "artifacts")
    original[0]["truth_calibration"]["tools"]["gmat"]["artifact_sha256"] = "0" * 64
    src.write_text(json.dumps(original, indent=2), encoding="utf-8")

    with pytest.raises(ValueError, match="checksum mismatch"):
        benchmark_against_references(
            ALL_BODIES,
            ephemeris_provider="kepler",
            scenarios_path=src,
        )
