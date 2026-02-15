"""Benchmark solver outputs against reference mission scenarios."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Sequence

from trajectory import solve_direct_lambert


def _load_reference_scenarios(path: Path) -> List[Dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def _scenario_row(
    bodies: Sequence[Dict[str, Any]],
    scenario: Dict[str, Any],
    *,
    ephemeris_provider: str,
) -> Dict[str, Any]:
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
            "id": scenario.get("id"),
            "description": scenario.get("description", ""),
            "source": scenario.get("source", ""),
            "status": "no_solution",
        }

    solution = result["solution"]
    model_total_dv = float(solution["deltaVDepartureKmS"]) + float(solution["deltaVArrivalKmS"])
    ref_total_dv = float(scenario["reference_total_delta_v_km_s"])
    abs_error = abs(model_total_dv - ref_total_dv)
    tolerance = float(scenario.get("delta_v_tolerance_km_s", 5.0))

    return {
        "id": scenario.get("id"),
        "description": scenario.get("description", ""),
        "source": scenario.get("source", ""),
        "status": "ok",
        "modelTotalDeltaVKmS": model_total_dv,
        "referenceTotalDeltaVKmS": ref_total_dv,
        "absErrorKmS": abs_error,
        "toleranceKmS": tolerance,
        "pass": abs_error <= tolerance,
        "ephemerisProvider": result.get("ephemerisProvider"),
    }


def benchmark_against_references(
    bodies: Sequence[Dict[str, Any]],
    *,
    ephemeris_provider: str = "auto",
    scenarios_path: str | Path | None = None,
) -> Dict[str, Any]:
    base_dir = Path(__file__).resolve().parent
    reference_path = Path(scenarios_path) if scenarios_path else (base_dir / "reference_scenarios.json")

    scenarios = _load_reference_scenarios(reference_path)
    rows = [_scenario_row(bodies, scenario, ephemeris_provider=ephemeris_provider) for scenario in scenarios]

    ok_rows = [row for row in rows if row.get("status") == "ok"]
    pass_count = sum(1 for row in ok_rows if row.get("pass"))
    mean_abs_error = (
        sum(float(row["absErrorKmS"]) for row in ok_rows) / len(ok_rows)
        if ok_rows
        else 0.0
    )

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
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
        "",
        "## Scenario Results",
        "",
        "| Scenario | Source | Status | Model dV (km/s) | Reference dV (km/s) | |Error| (km/s) | Tolerance | Pass |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]

    for row in summary.get("rows", []):
        if row.get("status") != "ok":
            lines.append(
                f"| {row.get('id')} | {row.get('source','')} | {row.get('status')} | - | - | - | - | - |"
            )
            continue

        lines.append(
            "| {id} | {source} | ok | {model:.3f} | {ref:.3f} | {err:.3f} | {tol:.3f} | {passed} |".format(
                id=row.get("id"),
                source=row.get("source", ""),
                model=float(row.get("modelTotalDeltaVKmS", 0.0)),
                ref=float(row.get("referenceTotalDeltaVKmS", 0.0)),
                err=float(row.get("absErrorKmS", 0.0)),
                tol=float(row.get("toleranceKmS", 0.0)),
                passed="yes" if row.get("pass") else "no",
            )
        )

    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This report compares current Lambert outputs against configured reference scenarios.",
            "- Reference rows are stored in `backend/benchmark/reference_scenarios.json` and can be replaced with stricter GMAT/Orekit/Tudat baselines.",
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
