from __future__ import annotations

import json
from pathlib import Path
import shutil

import pytest

from benchmark import benchmark_against_references
import benchmark.accuracy as benchmark_accuracy
from data.bodies import ALL_BODIES


def test_benchmark_uses_strict_reference_integrity() -> None:
    summary = benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")

    assert summary["referenceIntegrityOk"] is True
    assert summary["requiredTools"] == ["gmat", "orekit", "tudat"]
    assert summary["scenarioCount"] >= 1
    assert summary["solvedCount"] == summary["scenarioCount"]
    assert summary["validationCoverage"] == pytest.approx(1.0)

    for row in summary["rows"]:
        reference = row.get("reference", {})
        assert reference.get("calibrationTier") == "strict"
        assert reference.get("requiredToolsPresent") is True
        assert reference.get("artifactChecksPassed") is True
        tools = reference.get("tools", {})
        assert set(tools.keys()) == {"gmat", "orekit", "tudat"}


def test_benchmark_reports_pass_fail_metrics(monkeypatch) -> None:
    reference_path = Path(__file__).resolve().parents[1] / "benchmark" / "reference_scenarios.json"
    scenarios = json.loads(reference_path.read_text(encoding="utf-8"))
    scenario_by_window = {
        (float(item["departure_jd"]), float(item["arrival_jd"])): item
        for item in scenarios
    }

    def fake_solve_direct_lambert(
        bodies,
        *,
        from_id,
        to_id,
        departure_jd,
        arrival_jd,
        ephemeris_provider,
        prograde,
    ):
        scenario = scenario_by_window[(float(departure_jd), float(arrival_jd))]
        calibration = scenario["truth_calibration"]
        consensus = float(calibration["consensus_total_delta_v_km_s"])
        tolerance = float(calibration["delta_v_tolerance_km_s"])

        if scenario["id"] == "earth_mars_2024_window":
            model_total = consensus
        elif scenario["id"] == "earth_venus_2024_window":
            model_total = consensus + tolerance * 0.5
        else:
            model_total = consensus + tolerance * 1.5

        return {
            "solution": {
                "deltaVDepartureKmS": model_total / 2.0,
                "deltaVArrivalKmS": model_total / 2.0,
            },
            "ephemerisProvider": ephemeris_provider,
        }

    monkeypatch.setattr(benchmark_accuracy, "solve_direct_lambert", fake_solve_direct_lambert)

    summary = benchmark_accuracy.benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")
    rows = {row["id"]: row for row in summary["rows"]}

    assert summary["scenarioCount"] == 3
    assert summary["solvedCount"] == 3
    assert summary["noSolutionCount"] == 0
    assert summary["passCount"] == 2
    assert summary["failedCount"] == 1
    assert summary["passRate"] == pytest.approx(2 / 3)
    assert summary["validationCoverage"] == pytest.approx(1.0)
    assert summary["meanAbsErrorKmS"] == pytest.approx(
        sum(float(row["absErrorKmS"]) for row in summary["rows"]) / 3.0
    )

    assert rows["earth_mars_2024_window"]["pass"] is True
    assert rows["earth_venus_2024_window"]["pass"] is True
    assert rows["earth_jupiter_2024_window"]["pass"] is False
    assert {row["ephemerisProvider"] for row in summary["rows"]} == {"kepler"}


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
