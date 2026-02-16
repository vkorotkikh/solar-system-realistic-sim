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

    return {
        "tier": "strict",
        "consensusTotalDeltaVKmS": consensus_declared,
        "toolSpreadKmS": spread,
        "toleranceKmS": tolerance,
        "tools": parsed_tools,
        "provenance": provenance,
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
            "reference": {
                "calibrationTier": calibration["tier"],
                "requiredToolsPresent": True,
                "artifactChecksPassed": True,
                "consensusTotalDeltaVKmS": calibration["consensusTotalDeltaVKmS"],
                "toolSpreadKmS": calibration["toolSpreadKmS"],
                "tools": calibration["tools"],
            },
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
        "reference": {
            "calibrationTier": calibration["tier"],
            "requiredToolsPresent": True,
            "artifactChecksPassed": True,
            "consensusTotalDeltaVKmS": calibration["consensusTotalDeltaVKmS"],
            "toolSpreadKmS": calibration["toolSpreadKmS"],
            "toleranceKmS": calibration["toleranceKmS"],
            "tools": calibration["tools"],
            "provenance": calibration["provenance"],
        },
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
    pass_count = sum(1 for row in ok_rows if row.get("pass"))
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
        "solvedCount": len(ok_rows),
        "passCount": pass_count,
        "passRate": (pass_count / len(ok_rows)) if ok_rows else 0.0,
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
        f"- Solved: {summary.get('solvedCount', 0)}",
        f"- Passed tolerance: {summary.get('passCount', 0)}",
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
            lines.append(
                f"| {row.get('id')} | {row.get('source','')} | {row.get('status')} | - | - | - | {float(spread):.3f} | - | - |"
            )
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
) -> Dict[str, Any]:
    summary = benchmark_against_references(
        bodies,
        ephemeris_provider=ephemeris_provider,
        scenarios_path=scenarios_path,
    )
    markdown = render_accuracy_report_markdown(summary)

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown, encoding="utf-8")

    return {
        "summary": summary,
        "reportPath": str(path),
    }


__all__ = [
    "benchmark_against_references",
    "generate_accuracy_report",
    "render_accuracy_report_markdown",
]
