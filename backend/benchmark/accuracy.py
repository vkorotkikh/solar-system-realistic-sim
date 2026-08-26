"""Benchmark solver outputs against strict multi-tool calibration scenarios."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Sequence, Tuple

from trajectory import solve_direct_lambert

REQUIRED_TOOLS: Tuple[str, str, str] = ("gmat", "orekit", "tudat")
DEFAULT_PROBLEM_TYPE = "fixed_state_lambert"
_OVERWRITE_REFUSED = (
    "refusing to overwrite existing report `{path}`; "
    "pass `allow_overwrite: true` to replace it"
)


def _sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65_536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _load_reference_scenarios(path: Path) -> List[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Reference scenarios JSON must be a list")
    return payload


def _parse_tool_entry(
    *,
    scenario_id: str,
    tool_name: str,
    entry: Dict[str, Any],
    reference_file: Path,
) -> Dict[str, Any]:
    if not isinstance(entry, dict):
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` entry must be an object")

    try:
        dv = float(entry["total_delta_v_km_s"])
    except Exception as exc:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires numeric `total_delta_v_km_s`") from exc
    if dv <= 0.0:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` has non-positive delta-v")

    tool_version = str(entry.get("tool_version", "")).strip()
    if not tool_version:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires `tool_version`")

    captured_utc = str(entry.get("captured_utc", "")).strip()
    if not captured_utc:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires `captured_utc`")

    artifact_path_raw = str(entry.get("artifact_path", "")).strip()
    if not artifact_path_raw:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires `artifact_path`")
    artifact_path = (reference_file.parent / artifact_path_raw).resolve()
    if not artifact_path.is_file():
        raise ValueError(
            f"Scenario `{scenario_id}` tool `{tool_name}` artifact missing at `{artifact_path}`"
        )

    expected_sha = str(entry.get("artifact_sha256", "")).strip().lower()
    if len(expected_sha) != 64:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires 64-char `artifact_sha256`")
    actual_sha = _sha256(artifact_path)
    if actual_sha != expected_sha:
        raise ValueError(
            f"Scenario `{scenario_id}` tool `{tool_name}` artifact checksum mismatch: "
            f"expected {expected_sha}, got {actual_sha}"
        )

    return {
        "tool": tool_name,
        "toolVersion": tool_version,
        "capturedUtc": captured_utc,
        "runId": str(entry.get("run_id", "")).strip(),
        "totalDeltaVKmS": dv,
        "artifactPath": str(artifact_path.relative_to(reference_file.parent)),
        "artifactSha256": actual_sha,
    }


def _parse_strict_calibration(
    scenario: Dict[str, Any],
    *,
    reference_file: Path,
) -> Dict[str, Any]:
    scenario_id = str(scenario.get("id", "")).strip() or "unknown"
    calibration = scenario.get("truth_calibration")
    if not isinstance(calibration, dict):
        raise ValueError(f"Scenario `{scenario_id}` missing required `truth_calibration` object")

    tier = str(calibration.get("tier", "")).strip().lower()
    if tier != "strict":
        raise ValueError(f"Scenario `{scenario_id}` must set `truth_calibration.tier` to `strict`")

    tools_raw = calibration.get("tools")
    if not isinstance(tools_raw, dict):
        raise ValueError(f"Scenario `{scenario_id}` requires `truth_calibration.tools` object")

    missing_tools = [tool for tool in REQUIRED_TOOLS if tool not in tools_raw]
    if missing_tools:
        raise ValueError(
            f"Scenario `{scenario_id}` missing required tool calibrations: {missing_tools}"
        )

    parsed_tools: Dict[str, Dict[str, Any]] = {}
    for tool in REQUIRED_TOOLS:
        parsed_tools[tool] = _parse_tool_entry(
            scenario_id=scenario_id,
            tool_name=tool,
            entry=tools_raw[tool],
            reference_file=reference_file,
        )

    tool_values = [parsed_tools[tool]["totalDeltaVKmS"] for tool in REQUIRED_TOOLS]
    consensus_from_tools = mean(tool_values)
    spread = max(tool_values) - min(tool_values)

    consensus_declared = calibration.get("consensus_total_delta_v_km_s", consensus_from_tools)
    try:
        consensus_declared = float(consensus_declared)
    except Exception as exc:
        raise ValueError(
            f"Scenario `{scenario_id}` `consensus_total_delta_v_km_s` must be numeric"
        ) from exc

    if abs(consensus_declared - consensus_from_tools) > 0.02:
        raise ValueError(
            f"Scenario `{scenario_id}` consensus mismatch; "
            f"declared={consensus_declared:.6f}, tools_mean={consensus_from_tools:.6f}"
        )

    tolerance = calibration.get("delta_v_tolerance_km_s")
    if tolerance is None:
        tolerance = max(0.25, spread * 3.0)
    try:
        tolerance = float(tolerance)
    except Exception as exc:
        raise ValueError(f"Scenario `{scenario_id}` tolerance must be numeric") from exc
    if tolerance <= 0.0:
        raise ValueError(f"Scenario `{scenario_id}` tolerance must be > 0")

    provenance = calibration.get("provenance", {})
    if provenance and not isinstance(provenance, dict):
        raise ValueError(f"Scenario `{scenario_id}` `provenance` must be an object when present")

    comparison_contract = calibration.get("comparison_contract", {})
    if comparison_contract and not isinstance(comparison_contract, dict):
        raise ValueError(f"Scenario `{scenario_id}` `comparison_contract` must be an object when present")

    problem_type = str(comparison_contract.get("problem_type", DEFAULT_PROBLEM_TYPE)).strip() or DEFAULT_PROBLEM_TYPE
    comparable_to_solver = comparison_contract.get("comparable_to_solver", True)
    if not isinstance(comparable_to_solver, bool):
        raise ValueError(f"Scenario `{scenario_id}` `comparison_contract.comparable_to_solver` must be boolean")
    compatibility_note = str(comparison_contract.get("compatibility_note", "")).strip()

    return {
        "tier": "strict",
        "consensusTotalDeltaVKmS": consensus_declared,
        "toolSpreadKmS": spread,
        "toleranceKmS": tolerance,
        "tools": parsed_tools,
        "provenance": provenance,
        "comparisonContract": {
            "problemType": problem_type,
            "comparableToSolver": comparable_to_solver,
            "compatibilityNote": compatibility_note,
        },
    }


def _scenario_row(
    bodies: Sequence[Dict[str, Any]],
    scenario: Dict[str, Any],
    *,
    ephemeris_provider: str,
    reference_file: Path,
) -> Dict[str, Any]:
    scenario_id = str(scenario.get("id", "")).strip() or "unknown"
    calibration = _parse_strict_calibration(scenario, reference_file=reference_file)
    comparison_contract = calibration["comparisonContract"]

    reference_payload = {
        "calibrationTier": calibration["tier"],
        "requiredToolsPresent": True,
        "artifactChecksPassed": True,
        "consensusTotalDeltaVKmS": calibration["consensusTotalDeltaVKmS"],
        "toolSpreadKmS": calibration["toolSpreadKmS"],
        "toleranceKmS": calibration["toleranceKmS"],
        "tools": calibration["tools"],
        "provenance": calibration["provenance"],
        "comparisonContract": comparison_contract,
    }

    if not comparison_contract["comparableToSolver"]:
        return {
            "id": scenario_id,
            "description": scenario.get("description", ""),
            "source": scenario.get("source", ""),
            "status": "incomparable_reference",
            "reference": reference_payload,
        }

    result = solve_direct_lambert(
        bodies,
        from_id=str(scenario["from_id"]),
        to_id=str(scenario["to_id"]),
        departure_jd=float(scenario["departure_jd"]),
        arrival_jd=float(scenario["arrival_jd"]),
        ephemeris_provider=ephemeris_provider,
        prograde=True,
    )

    if result.get("solution") is None:
        return {
            "id": scenario_id,
            "description": scenario.get("description", ""),
            "source": scenario.get("source", ""),
            "status": "no_solution",
            "reference": reference_payload,
        }

    solution = result["solution"]
    model_total_dv = float(solution["deltaVDepartureKmS"]) + float(solution["deltaVArrivalKmS"])
    ref_total_dv = calibration["consensusTotalDeltaVKmS"]
    abs_error = abs(model_total_dv - ref_total_dv)
    tolerance = calibration["toleranceKmS"]

    return {
        "id": scenario_id,
        "description": scenario.get("description", ""),
        "source": scenario.get("source", ""),
        "status": "ok",
        "modelTotalDeltaVKmS": model_total_dv,
        "referenceTotalDeltaVKmS": ref_total_dv,
        "absErrorKmS": abs_error,
        "toleranceKmS": tolerance,
        "pass": abs_error <= tolerance,
        "ephemerisProvider": result.get("ephemerisProvider"),
        "reference": reference_payload,
    }


def benchmark_against_references(
    bodies: Sequence[Dict[str, Any]],
    *,
    ephemeris_provider: str = "auto",
    scenarios_path: str | Path | None = None,
) -> Dict[str, Any]:
    base_dir = Path(__file__).resolve().parent
    reference_path = Path(scenarios_path) if scenarios_path else (base_dir / "reference_scenarios.json")
    reference_path = reference_path.resolve()

    scenarios = _load_reference_scenarios(reference_path)
    rows = [
        _scenario_row(
            bodies,
            scenario,
            ephemeris_provider=ephemeris_provider,
            reference_file=reference_path,
        )
        for scenario in scenarios
    ]

    ok_rows = [row for row in rows if row.get("status") == "ok"]
    incomparable_count = sum(1 for row in rows if row.get("status") == "incomparable_reference")
    pass_count = sum(1 for row in ok_rows if row.get("pass"))
    fail_count = sum(1 for row in ok_rows if not row.get("pass"))
    no_solution_count = sum(1 for row in rows if row.get("status") == "no_solution")
    mean_abs_error = (
        sum(float(row["absErrorKmS"]) for row in ok_rows) / len(ok_rows)
        if ok_rows
        else 0.0
    )
    reference_integrity_ok = all(
        bool(row.get("reference", {}).get("requiredToolsPresent"))
        and bool(row.get("reference", {}).get("artifactChecksPassed"))
        for row in rows
    )

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "referenceFile": str(reference_path),
        "requiredTools": list(REQUIRED_TOOLS),
        "referenceIntegrityOk": reference_integrity_ok,
        "scenarioCount": len(rows),
        "comparableScenarioCount": len(ok_rows) + no_solution_count,
        "incomparableCount": incomparable_count,
        "solvedCount": len(ok_rows),
        "noSolutionCount": no_solution_count,
        "passCount": pass_count,
        "failedCount": fail_count,
        "passRate": (pass_count / len(ok_rows)) if ok_rows else 0.0,
        "validationCoverage": (len(ok_rows) / len(rows)) if rows else 0.0,
        "meanAbsErrorKmS": mean_abs_error,
        "rows": rows,
    }


def render_accuracy_report_markdown(summary: Dict[str, Any]) -> str:
    lines = [
        "# Trajectory Accuracy Benchmark Report",
        "",
        f"Generated: {summary.get('timestamp')}",
        "",
        "## Summary",
        "",
        f"- Scenarios: {summary.get('scenarioCount', 0)}",
        f"- Comparable scenarios: {summary.get('comparableScenarioCount', 0)}",
        f"- Incomparable references: {summary.get('incomparableCount', 0)}",
        f"- Solved: {summary.get('solvedCount', 0)}",
        f"- No solution: {summary.get('noSolutionCount', 0)}",
        f"- Passed tolerance: {summary.get('passCount', 0)}",
        f"- Failed tolerance: {summary.get('failedCount', 0)}",
        f"- Validation coverage: {float(summary.get('validationCoverage', 0.0)) * 100.0:.1f}%",
        f"- Pass rate: {float(summary.get('passRate', 0.0)) * 100.0:.1f}%",
        f"- Mean |delta-v error|: {float(summary.get('meanAbsErrorKmS', 0.0)):.3f} km/s",
        f"- Reference integrity OK: {summary.get('referenceIntegrityOk', False)}",
        f"- Required calibration tools: {', '.join(summary.get('requiredTools', []))}",
        f"- Reference file: `{summary.get('referenceFile', '')}`",
        "",
        "## Scenario Results",
        "",
        "| Scenario | Source | Status | Model dV (km/s) | Reference dV (km/s) | |Error| (km/s) | Tool spread | Tolerance | Pass |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for row in summary.get("rows", []):
        ref = row.get("reference", {})
        spread = ref.get("toolSpreadKmS", 0.0)
        if row.get("status") != "ok":
            comparison_contract = ref.get("comparisonContract", {})
            note = comparison_contract.get("compatibilityNote", "")
            lines.append(
                f"| {row.get('id')} | {row.get('source','')} | {row.get('status')} | - | - | - | {float(spread):.3f} | - | - |"
            )
            if note:
                lines.append(f"|  |  |  |  |  |  |  |  | note: {note} |")
            continue

        lines.append(
            "| {id} | {source} | ok | {model:.3f} | {ref:.3f} | {err:.3f} | {spread:.3f} | {tol:.3f} | {passed} |".format(
                id=row.get("id"),
                source=row.get("source", ""),
                model=float(row.get("modelTotalDeltaVKmS", 0.0)),
                ref=float(row.get("referenceTotalDeltaVKmS", 0.0)),
                err=float(row.get("absErrorKmS", 0.0)),
                spread=float(spread),
                tol=float(row.get("toleranceKmS", 0.0)),
                passed="yes" if row.get("pass") else "no",
            )
        )

        tools = ref.get("tools", {})
        tool_bits: List[str] = []
        for tool_name in REQUIRED_TOOLS:
            tool_row = tools.get(tool_name)
            if isinstance(tool_row, dict):
                tool_bits.append(f"{tool_name}={float(tool_row.get('totalDeltaVKmS', 0.0)):.3f}")
        if tool_bits:
            lines.append(f"|  |  |  |  |  |  |  |  | tool refs: {'; '.join(tool_bits)} |")

    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This report compares current Lambert outputs against strict multi-tool calibration rows.",
            "- Each scenario requires GMAT, Orekit, and Tudat entries with artifact checksum validation.",
            "- Reference rows are stored in `backend/benchmark/reference_scenarios.json`.",
        ]
    )

    return "\n".join(lines)


def generate_accuracy_report(
    bodies: Sequence[Dict[str, Any]],
    *,
    output_path: str | Path,
    ephemeris_provider: str = "auto",
    scenarios_path: str | Path | None = None,
    allow_overwrite: bool = False,
) -> Dict[str, Any]:
    path = Path(output_path)

    # Reports land in a directory of hand-written notes, and the endpoint that
    # reaches this function is unauthenticated, so an existing file is never
    # replaced unless the caller explicitly opts in. Checked before the
    # benchmark runs so a refused call costs no work.
    if not allow_overwrite and (path.exists() or path.is_symlink()):
        raise FileExistsError(_OVERWRITE_REFUSED.format(path=path))

    summary = benchmark_against_references(
        bodies,
        ephemeris_provider=ephemeris_provider,
        scenarios_path=scenarios_path,
    )
    markdown = render_accuracy_report_markdown(summary)

    path.parent.mkdir(parents=True, exist_ok=True)
    if allow_overwrite:
        path.write_text(markdown, encoding="utf-8")
    else:
        # Exclusive create closes the window between the check above and this
        # write: O_EXCL refuses any pre-existing path, dangling symlinks included.
        try:
            with path.open("x", encoding="utf-8") as handle:
                handle.write(markdown)
        except FileExistsError as exc:
            raise FileExistsError(_OVERWRITE_REFUSED.format(path=path)) from exc

    return {
        "summary": summary,
        "reportPath": str(path),
    }


__all__ = [
    "benchmark_against_references",
    "generate_accuracy_report",
    "render_accuracy_report_markdown",
]
