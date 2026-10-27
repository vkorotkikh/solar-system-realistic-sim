from __future__ import annotations

import json
from pathlib import Path
import shutil

import pytest

from benchmark import benchmark_against_references
import benchmark.accuracy as benchmark_accuracy
from data.bodies import ALL_BODIES
from trajectory.budget import PlanningCancelled, PlanningContext


def test_benchmark_markdown_preserves_small_spread_and_tolerance() -> None:
    report = benchmark_accuracy.render_accuracy_report_markdown({
        "rows": [{
            "id": "small-values",
            "source": "fixture",
            "status": "ok",
            "modelTotalDeltaVKmS": 1.0,
            "referenceTotalDeltaVKmS": 1.0,
            "absErrorKmS": 0.0,
            "pass": True,
            "toleranceKmS": 1.0e-4,
            "reference": {"toolSpreadKmS": 2.5e-5},
        }, {
            "id": "unavailable",
            "source": "fixture",
            "status": "no_solution",
            "reference": {"toolSpreadKmS": 7.5e-5},
        }],
    })

    expected_row = (
        "| small-values | fixture | ok | 1.000 | 1.000 | 0.000 | "
        "2.50e-05 | 1.00e-04 | yes |"
    )
    assert expected_row in report.splitlines()
    assert (
        "| unavailable | fixture | no_solution | - | - | - | 7.50e-05 | - | - |"
        in report.splitlines()
    )


def test_benchmark_uses_strict_reference_integrity() -> None:
    summary = benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")

    assert summary["referenceIntegrityOk"] is True
    assert summary["requiredTools"] == ["gmat", "orekit", "tudat"]
    assert summary["scenarioCount"] >= 1
    assert summary["comparableScenarioCount"] == 3
    assert summary["incomparableCount"] == 0
    assert summary["solvedCount"] == 3
    assert summary["validationCoverage"] == pytest.approx(1.0)
    assert summary["meanAbsErrorKmS"] < 1e-4
    assert summary["passRate"] == 1.0
    fixed = summary["fixedStateReferences"]
    assert fixed["count"] >= 2
    assert fixed["passCount"] == fixed["count"]
    assert fixed["maxAbsErrorKmS"] < 1e-4
    report = benchmark_accuracy.render_accuracy_report_markdown(summary)
    assert "Mean |delta-v error|: 0.000" in report
    assert f"passed: {fixed['count']}/{fixed['count']}" in report

    for row in summary["rows"]:
        assert row["reference"]["calibrationTier"] == "independent_fixed_state"
        reference = row["reference"]["legacyCalibration"]
        assert reference.get("calibrationTier") == "strict"
        assert reference.get("requiredToolsPresent") is True
        assert reference.get("artifactChecksPassed") is True
        assert row["status"] == "ok"
        tools = reference.get("tools", {})
        assert set(tools.keys()) == {"gmat", "orekit", "tudat"}
        comparison = reference.get("comparisonContract", {})
        assert comparison.get("comparableToSolver") is False
        assert comparison.get("problemType") == "window_optimization_legacy"


def test_benchmark_reports_pass_fail_metrics(monkeypatch, tmp_path) -> None:
    reference_path = Path(__file__).resolve().parents[1] / "benchmark" / "reference_scenarios.json"
    scenarios = json.loads(reference_path.read_text(encoding="utf-8"))
    for scenario in scenarios:
        scenario["truth_calibration"]["comparison_contract"] = {
            "problem_type": "fixed_state_lambert",
            "comparable_to_solver": True,
            "compatibility_note": "Unit-test comparable scenario.",
        }
    shutil.copytree(reference_path.parent / "artifacts", tmp_path / "artifacts")
    comparable_path = tmp_path / "reference_scenarios_comparable_for_test.json"
    comparable_path.write_text(json.dumps(scenarios, indent=2), encoding="utf-8")
    scenario_by_window = {
        (float(item["departure_jd"]), float(item["arrival_jd"])): item
        for item in scenarios
    }
    observed_contexts = set()
    observed_sessions = set()

    def fake_solve_direct_lambert(
        bodies,
        *,
        from_id,
        to_id,
        departure_jd,
        arrival_jd,
        ephemeris_provider,
        prograde,
        planning_context,
        ephemeris,
    ):
        observed_contexts.add(id(planning_context))
        observed_sessions.add(id(ephemeris))
        assert ephemeris.planning_context is planning_context
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

    summary = benchmark_accuracy.benchmark_against_references(
        ALL_BODIES,
        ephemeris_provider="kepler",
        scenarios_path=comparable_path,
    )
    rows = {row["id"]: row for row in summary["rows"]}

    assert summary["scenarioCount"] == 3
    assert summary["comparableScenarioCount"] == 3
    assert summary["incomparableCount"] == 0
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
    assert len(observed_contexts) == 1
    assert len(observed_sessions) == 1
    assert summary["planningContext"]["limits"] == {
        "ephemeris_queries": benchmark_accuracy.MAX_REFERENCE_SCENARIOS * 2,
        "unique_ephemeris_states": benchmark_accuracy.MAX_REFERENCE_SCENARIOS * 2,
        "remote_ephemeris_states": 0,
        "external_requests": 0,
        "leg_requests": benchmark_accuracy.MAX_REFERENCE_SCENARIOS,
        "leg_evaluations": benchmark_accuracy.MAX_REFERENCE_SCENARIOS,
        "route_prefixes": 0,
    }


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


def test_benchmark_rejects_horizons_before_scenario_evaluation(monkeypatch) -> None:
    invoked = False

    def forbidden_solver(*_args, **_kwargs):
        nonlocal invoked
        invoked = True
        raise AssertionError("remote scenario evaluation must not start")

    monkeypatch.setattr(benchmark_accuracy, "solve_direct_lambert", forbidden_solver)

    with pytest.raises(ValueError, match="aggregate remote-request budget"):
        benchmark_against_references(ALL_BODIES, ephemeris_provider="horizons")

    assert invoked is False


def test_reference_file_byte_limit_precedes_json_parse_and_ephemeris_creation(
    monkeypatch,
    tmp_path,
) -> None:
    reference_path = tmp_path / "oversized.json"
    reference_path.write_bytes(b" " * (benchmark_accuracy.MAX_REFERENCE_FILE_BYTES + 1))

    def forbidden_ephemeris(*_args, **_kwargs):
        raise AssertionError("ephemeris session must not be created for oversized input")

    monkeypatch.setattr(benchmark_accuracy, "EphemerisService", forbidden_ephemeris)

    with pytest.raises(ValueError, match="exceeds.*byte limit"):
        benchmark_against_references(
            ALL_BODIES,
            ephemeris_provider="kepler",
            scenarios_path=reference_path,
        )


def test_reference_scenario_count_limit_precedes_scenario_iteration(
    monkeypatch,
    tmp_path,
) -> None:
    reference_path = tmp_path / "too-many.json"
    reference_path.write_text(
        json.dumps([{}] * (benchmark_accuracy.MAX_REFERENCE_SCENARIOS + 1)),
        encoding="utf-8",
    )

    def forbidden_prepare(*_args, **_kwargs):
        raise AssertionError("scenario iteration must not begin above the hard cap")

    monkeypatch.setattr(benchmark_accuracy, "_prepare_scenario", forbidden_prepare)

    with pytest.raises(ValueError, match="too many scenarios"):
        benchmark_against_references(
            ALL_BODIES,
            ephemeris_provider="kepler",
            scenarios_path=reference_path,
        )


def test_direct_benchmark_cancellation_precedes_reference_io(monkeypatch) -> None:
    context = PlanningContext.with_timeout(2.0)
    context.cancel("caller_cancelled")

    def forbidden_load(*_args, **_kwargs):
        raise AssertionError("cancelled direct caller must not read references")

    monkeypatch.setattr(benchmark_accuracy, "_load_reference_scenarios", forbidden_load)

    with pytest.raises(PlanningCancelled):
        benchmark_against_references(
            ALL_BODIES,
            ephemeris_provider="kepler",
            planning_context=context,
        )


def test_reference_artifact_cannot_escape_reference_directory(tmp_path) -> None:
    source_path = Path(__file__).resolve().parents[1] / "benchmark" / "reference_scenarios.json"
    scenarios = json.loads(source_path.read_text(encoding="utf-8"))
    scenarios[0]["truth_calibration"]["tools"]["gmat"]["artifact_path"] = "../outside.csv"
    reference_path = tmp_path / "references" / "scenarios.json"
    reference_path.parent.mkdir()
    reference_path.write_text(json.dumps(scenarios), encoding="utf-8")
    (tmp_path / "outside.csv").write_text("outside", encoding="utf-8")

    with pytest.raises(ValueError, match="must stay inside"):
        benchmark_against_references(
            ALL_BODIES,
            ephemeris_provider="kepler",
            scenarios_path=reference_path,
        )


def test_fixed_state_references_catch_a_wrong_solver(monkeypatch) -> None:
    real_solver = benchmark_accuracy.solve_lambert_universal

    def off_by_one_metre_per_second(*args, **kwargs):
        solution = real_solver(*args, **kwargs)
        nudge = 1e-3 * 86_400.0 / 149_597_870.7  # 1 m/s in AU/day
        return {**solution, "v1": [solution["v1"][0] + nudge, *solution["v1"][1:]]}

    monkeypatch.setattr(benchmark_accuracy, "solve_lambert_universal", off_by_one_metre_per_second)
    summary = benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")

    assert summary["fixedStateReferences"]["passCount"] == 0
