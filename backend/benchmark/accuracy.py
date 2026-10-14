"""Benchmark solver outputs against strict multi-tool calibration scenarios."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Sequence, Tuple

from mission.ephemeris_service import EphemerisService
from trajectory import solve_direct_lambert
from trajectory.lambert import compute_lambert_leg_from_state_vectors, solve_lambert_universal
from trajectory.budget import PlanningContext, PlanningLimits

REQUIRED_TOOLS: Tuple[str, str, str] = ("gmat", "orekit", "tudat")
DEFAULT_PROBLEM_TYPE = "fixed_state_lambert"
_OVERWRITE_REFUSED = (
    "refusing to overwrite existing report `{path}`; "
    "pass `allow_overwrite: true` to replace it"
)
_SUPPORTED_EPHEMERIS_PROVIDERS = frozenset({"auto", "spice", "horizons", "kepler"})
MAX_REFERENCE_FILE_BYTES = 256 * 1024
MAX_REFERENCE_SCENARIOS = 64
MAX_REFERENCE_ARTIFACT_BYTES = 2 * 1024 * 1024
MAX_REFERENCE_ARTIFACT_TOTAL_BYTES = 16 * 1024 * 1024
BENCHMARK_DEFAULT_TIMEOUT_SECONDS = 8.0


def _sha256_limited(path: Path, *, max_bytes: int) -> tuple[str, int]:
    hasher = hashlib.sha256()
    observed = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(min(65_536, max_bytes + 1 - observed))
            if not chunk:
                break
            observed += len(chunk)
            if observed > max_bytes:
                raise ValueError(
                    f"Reference artifact `{path}` exceeds the {max_bytes}-byte limit"
                )
            hasher.update(chunk)
    return hasher.hexdigest(), observed


class _ArtifactIntegrityBudget:
    """Bound and memoize local reference-artifact integrity work."""

    def __init__(self, reference_file: Path) -> None:
        self.root = reference_file.parent.resolve()
        self.total_bytes = 0
        self._verified: dict[Path, tuple[str, int]] = {}

    def verify(self, raw_path: str, *, scenario_id: str, tool_name: str) -> tuple[Path, str]:
        artifact_path = (self.root / raw_path).resolve()
        try:
            artifact_path.relative_to(self.root)
        except ValueError as exc:
            raise ValueError(
                f"Scenario `{scenario_id}` tool `{tool_name}` artifact must stay "
                "inside the reference directory"
            ) from exc
        if not artifact_path.is_file():
            raise ValueError(
                f"Scenario `{scenario_id}` tool `{tool_name}` artifact missing at "
                f"`{artifact_path}`"
            )

        cached = self._verified.get(artifact_path)
        if cached is not None:
            return artifact_path, cached[0]

        size = artifact_path.stat().st_size
        if size > MAX_REFERENCE_ARTIFACT_BYTES:
            raise ValueError(
                f"Scenario `{scenario_id}` tool `{tool_name}` artifact exceeds the "
                f"{MAX_REFERENCE_ARTIFACT_BYTES}-byte limit"
            )
        if self.total_bytes + size > MAX_REFERENCE_ARTIFACT_TOTAL_BYTES:
            raise ValueError(
                "Reference artifacts exceed the aggregate "
                f"{MAX_REFERENCE_ARTIFACT_TOTAL_BYTES}-byte integrity-work limit"
            )

        digest, observed = _sha256_limited(
            artifact_path,
            max_bytes=MAX_REFERENCE_ARTIFACT_BYTES,
        )
        if self.total_bytes + observed > MAX_REFERENCE_ARTIFACT_TOTAL_BYTES:
            raise ValueError(
                "Reference artifacts exceed the aggregate "
                f"{MAX_REFERENCE_ARTIFACT_TOTAL_BYTES}-byte integrity-work limit"
            )
        self.total_bytes += observed
        self._verified[artifact_path] = (digest, observed)
        return artifact_path, digest


def _load_reference_scenarios(path: Path) -> List[Dict[str, Any]]:
    with path.open("rb") as handle:
        raw = handle.read(MAX_REFERENCE_FILE_BYTES + 1)
    if len(raw) > MAX_REFERENCE_FILE_BYTES:
        raise ValueError(
            f"Reference scenarios file exceeds the {MAX_REFERENCE_FILE_BYTES}-byte limit"
        )
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Reference scenarios file must contain UTF-8 JSON") from exc
    payload = json.loads(text)
    if not isinstance(payload, list):
        raise ValueError("Reference scenarios JSON must be a list")
    if len(payload) > MAX_REFERENCE_SCENARIOS:
        raise ValueError(
            "Reference scenarios file contains too many scenarios: "
            f"{len(payload)} > {MAX_REFERENCE_SCENARIOS}"
        )
    if not all(isinstance(scenario, dict) for scenario in payload):
        raise ValueError("Every reference scenario must be an object")
    return payload


def _parse_tool_entry(
    *,
    scenario_id: str,
    tool_name: str,
    entry: Dict[str, Any],
    reference_file: Path,
    artifact_budget: _ArtifactIntegrityBudget,
) -> Dict[str, Any]:
    if not isinstance(entry, dict):
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` entry must be an object")

    try:
        dv = float(entry["total_delta_v_km_s"])
    except Exception as exc:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires numeric `total_delta_v_km_s`") from exc
    if not math.isfinite(dv) or dv <= 0.0:
        raise ValueError(
            f"Scenario `{scenario_id}` tool `{tool_name}` requires finite positive delta-v"
        )

    tool_version = str(entry.get("tool_version", "")).strip()
    if not tool_version:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires `tool_version`")

    captured_utc = str(entry.get("captured_utc", "")).strip()
    if not captured_utc:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires `captured_utc`")

    artifact_path_raw = str(entry.get("artifact_path", "")).strip()
    if not artifact_path_raw:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires `artifact_path`")
    expected_sha = str(entry.get("artifact_sha256", "")).strip().lower()
    if len(expected_sha) != 64:
        raise ValueError(f"Scenario `{scenario_id}` tool `{tool_name}` requires 64-char `artifact_sha256`")
    artifact_path, actual_sha = artifact_budget.verify(
        artifact_path_raw,
        scenario_id=scenario_id,
        tool_name=tool_name,
    )
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
    artifact_budget: _ArtifactIntegrityBudget,
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
            artifact_budget=artifact_budget,
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

    if not math.isfinite(consensus_declared):
        raise ValueError(f"Scenario `{scenario_id}` consensus must be finite")
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
    if not math.isfinite(tolerance) or tolerance <= 0.0:
        raise ValueError(f"Scenario `{scenario_id}` tolerance must be finite and > 0")

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
    calibration: Dict[str, Any],
    ephemeris_provider: str,
    planning_context: PlanningContext,
    ephemeris: EphemerisService,
) -> Dict[str, Any]:
    planning_context.checkpoint()
    scenario_id = str(scenario.get("id", "")).strip() or "unknown"
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

    independent = calibration.get("independentReference")
    if independent is not None and not comparison_contract["comparableToSolver"]:
        # The legacy captures remain explicitly incomparable. These replacement
        # comparisons use archived provider states and independently executed
        # Izzo/Gooding answers, never outputs of the solver under test.
        start = independent["start_state_au_day"]
        end = independent["end_state_au_day"]
        planning_context.reserve(leg_requests=1, leg_evaluations=1)
        leg = compute_lambert_leg_from_state_vectors(
            start[:3], start[3:], end[:3], end[3:],
            independent["arrival_jd"] - independent["departure_jd"], prograde=True,
        )
        reference = {
            "calibrationTier": "independent_fixed_state",
            "artifactChecksPassed": True,
            "requiredToolsPresent": True,
            "fixedState": independent,
            "legacyCalibration": reference_payload,
            "comparisonContract": {"problemType": "fixed_state_lambert", "comparableToSolver": True},
        }
        base = {"id": scenario_id, "description": scenario.get("description", ""),
                "source": "archived Horizons + lamberthub 1.0.0 Izzo/Gooding", "reference": reference}
        if leg is None:
            return {**base, "status": "no_solution"}
        model = float(leg["deltaVDepartureKmS"]) + float(leg["deltaVArrivalKmS"])
        expected = float(independent["total_v_infinity_km_s"])
        velocity_error = max(
            math.dist(leg[key], independent[expected_key]) * _AU_KM / _DAY_S
            for key, expected_key in (("departureVelocityApprox", "expected_v1_au_day"),
                                      ("arrivalVelocityApprox", "expected_v2_au_day"))
        )
        tolerance = float(independent["tolerance_km_s"])
        return {**base, "status": "ok", "modelTotalDeltaVKmS": model,
                "referenceTotalDeltaVKmS": expected, "absErrorKmS": abs(model-expected),
                "maxVelocityErrorKmS": velocity_error, "toleranceKmS": tolerance,
                "pass": max(abs(model-expected), velocity_error) <= tolerance,
                "ephemerisProvider": "archived_horizons",
                "departureVelocityAuDay": leg["departureVelocityApprox"],
                "arrivalVelocityAuDay": leg["arrivalVelocityApprox"]}

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
        planning_context=planning_context,
        ephemeris=ephemeris,
    )

    if not isinstance(result, dict):
        raise ValueError(f"Scenario `{scenario_id}` solver returned a non-object result")
    if result.get("solution") is None:
        return {
            "id": scenario_id,
            "description": scenario.get("description", ""),
            "source": scenario.get("source", ""),
            "status": "no_solution",
            "reference": reference_payload,
        }

    solution = result["solution"]
    if not isinstance(solution, dict):
        raise ValueError(f"Scenario `{scenario_id}` solver returned an invalid solution object")
    try:
        model_total_dv = float(solution["deltaVDepartureKmS"]) + float(
            solution["deltaVArrivalKmS"]
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(
            f"Scenario `{scenario_id}` solver returned invalid delta-v components"
        ) from exc
    if not math.isfinite(model_total_dv):
        raise ValueError(f"Scenario `{scenario_id}` solver returned non-finite delta-v")
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


_AU_KM = 149_597_870.7
_DAY_S = 86_400.0


def _fixed_state_rows(path: Path, context: PlanningContext) -> List[Dict[str, Any]]:
    """Solve published fixed-state Lambert problems and compare against their printed answers.

    Unlike the legacy window captures these need no external tool to regenerate: the inputs and
    the expected velocities are in the cited texts, so anyone can re-derive the reference.
    """
    if path.stat().st_size > MAX_REFERENCE_FILE_BYTES:
        raise ValueError(f"Fixed-state reference file `{path}` exceeds {MAX_REFERENCE_FILE_BYTES} bytes")
    references = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(references, list) or len(references) > MAX_REFERENCE_SCENARIOS:
        raise ValueError(f"Fixed-state reference file `{path}` must be a list of at most {MAX_REFERENCE_SCENARIOS}")
    rows: List[Dict[str, Any]] = []
    for ref in references:
        context.checkpoint()
        mu = float(ref["mu_km3_s2"]) * _DAY_S**2 / _AU_KM**3
        solution = solve_lambert_universal(
            [float(c) / _AU_KM for c in ref["r1_km"]],
            [float(c) / _AU_KM for c in ref["r2_km"]],
            float(ref["tof_s"]) / _DAY_S,
            mu=mu,
            prograde=bool(ref.get("prograde", True)),
            tol_days=1e-10,
            max_iter=400,
            min_periapsis_au=0.0,
        )
        tolerance = float(ref["tolerance_km_s"])
        row: Dict[str, Any] = {"id": ref["id"], "citation": ref["citation"], "toleranceKmS": tolerance}
        if solution is None:
            rows.append({**row, "status": "no_solution", "pass": False})
            continue
        model = [c * _AU_KM / _DAY_S for c in (*solution["v1"], *solution["v2"])]
        expected = [float(c) for c in (*ref["expected_v1_km_s"], *ref["expected_v2_km_s"])]
        error = max(abs(a - b) for a, b in zip(model, expected))
        rows.append({**row, "status": "ok", "maxAbsErrorKmS": error, "pass": error <= tolerance})
    return rows


def _benchmark_planning_limits() -> PlanningLimits:
    return PlanningLimits(
        ephemeris_queries=MAX_REFERENCE_SCENARIOS * 2,
        unique_ephemeris_states=MAX_REFERENCE_SCENARIOS * 2,
        remote_ephemeris_states=0,
        external_requests=0,
        leg_requests=MAX_REFERENCE_SCENARIOS,
        leg_evaluations=MAX_REFERENCE_SCENARIOS,
        route_prefixes=0,
    )


def _new_benchmark_context() -> PlanningContext:
    return PlanningContext.with_timeout(
        BENCHMARK_DEFAULT_TIMEOUT_SECONDS,
        limits=_benchmark_planning_limits(),
    )


def _prepare_scenario(
    scenario: Dict[str, Any],
    *,
    reference_file: Path,
    artifact_budget: _ArtifactIntegrityBudget,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    scenario_id = str(scenario.get("id", "")).strip()
    if not scenario_id:
        raise ValueError("Every reference scenario requires a non-empty `id`")
    if len(scenario_id) > 128:
        raise ValueError("Reference scenario identifiers may contain at most 128 characters")

    calibration = _parse_strict_calibration(
        scenario,
        reference_file=reference_file,
        artifact_budget=artifact_budget,
    )
    prepared = dict(scenario)
    prepared["id"] = scenario_id

    independent_entry = scenario.get("independent_reference")
    if independent_entry is not None:
        path, digest = artifact_budget.verify(
            independent_entry["artifact_path"], scenario_id=scenario_id, tool_name="independent",
        )
        if digest != independent_entry["artifact_sha256"]:
            raise ValueError(f"Scenario `{scenario_id}` independent artifact checksum mismatch")
        reference = json.loads(path.read_text(encoding="utf-8"))
        if (reference["scenario_id"] != scenario_id
                or reference["departure_jd"] != scenario["departure_jd"]
                or reference["arrival_jd"] != scenario["arrival_jd"]):
            raise ValueError(f"Scenario `{scenario_id}` independent reference identity mismatch")
        for capture in reference["provenance"]["captures"]:
            _, capture_digest = artifact_budget.verify(
                capture["path"], scenario_id=scenario_id, tool_name="horizons_capture",
            )
            if capture_digest != capture["sha256"]:
                raise ValueError(f"Scenario `{scenario_id}` provider capture checksum mismatch")
        calibration["independentReference"] = reference

    if calibration["comparisonContract"]["comparableToSolver"]:
        normalized_ids: dict[str, str] = {}
        for field in ("from_id", "to_id"):
            raw_value = scenario.get(field)
            if not isinstance(raw_value, str) or not raw_value.strip():
                raise ValueError(f"Scenario `{scenario_id}` requires non-empty `{field}`")
            body_id = raw_value.strip().lower()
            if len(body_id) > 64:
                raise ValueError(
                    f"Scenario `{scenario_id}` `{field}` may contain at most 64 characters"
                )
            normalized_ids[field] = body_id
        if normalized_ids["from_id"] == normalized_ids["to_id"]:
            raise ValueError(f"Scenario `{scenario_id}` endpoints must differ")

        normalized_epochs: dict[str, float] = {}
        for field in ("departure_jd", "arrival_jd"):
            try:
                value = float(scenario[field])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(
                    f"Scenario `{scenario_id}` requires finite numeric `{field}`"
                ) from exc
            if not math.isfinite(value):
                raise ValueError(f"Scenario `{scenario_id}` `{field}` must be finite")
            normalized_epochs[field] = value
        if normalized_epochs["arrival_jd"] <= normalized_epochs["departure_jd"]:
            raise ValueError(f"Scenario `{scenario_id}` arrival must follow departure")

        prepared.update(normalized_ids)
        prepared.update(normalized_epochs)

    return prepared, calibration


def benchmark_against_references(
    bodies: Sequence[Dict[str, Any]],
    *,
    ephemeris_provider: str = "auto",
    scenarios_path: str | Path | None = None,
    planning_context: PlanningContext | None = None,
    fixed_state_path: str | Path | None = None,
) -> Dict[str, Any]:
    provider = str(ephemeris_provider).strip().lower()
    if provider not in _SUPPORTED_EPHEMERIS_PROVIDERS:
        raise ValueError(f"Unsupported ephemeris provider `{ephemeris_provider}`")
    if provider == "horizons":
        raise ValueError(
            "Horizons benchmarking is disabled until all reference epochs can be "
            "prefetched under one aggregate remote-request budget"
        )

    base_dir = Path(__file__).resolve().parent
    reference_path = Path(scenarios_path) if scenarios_path else (base_dir / "reference_scenarios.json")
    reference_path = reference_path.resolve()

    context = planning_context or _new_benchmark_context()
    if type(context) is not PlanningContext:
        raise TypeError("Benchmark planning context must be an exact PlanningContext instance")
    context.checkpoint()
    scenarios = _load_reference_scenarios(reference_path)
    artifact_budget = _ArtifactIntegrityBudget(reference_path)
    prepared: list[tuple[Dict[str, Any], Dict[str, Any]]] = []
    seen_ids: set[str] = set()
    for scenario in scenarios:
        context.checkpoint()
        prepared_scenario, calibration = _prepare_scenario(
            scenario,
            reference_file=reference_path,
            artifact_budget=artifact_budget,
        )
        scenario_id = prepared_scenario["id"]
        if scenario_id in seen_ids:
            raise ValueError(f"Duplicate reference scenario id `{scenario_id}`")
        seen_ids.add(scenario_id)
        prepared.append((prepared_scenario, calibration))

    ephemeris = EphemerisService(
        bodies,
        provider=provider,
        context=context,
    )
    comparable_body_ids = [
        prepared_scenario[field]
        for prepared_scenario, calibration in prepared
        if calibration["comparisonContract"]["comparableToSolver"]
        for field in ("from_id", "to_id")
    ]
    if comparable_body_ids:
        # Validate complete provider coverage once, before the first solve, so
        # a bad later scenario cannot leave a partially evaluated benchmark.
        ephemeris.preflight(comparable_body_ids)

    rows = [
        _scenario_row(
            bodies,
            prepared_scenario,
            calibration=calibration,
            ephemeris_provider=provider,
            planning_context=context,
            ephemeris=ephemeris,
        )
        for prepared_scenario, calibration in prepared
    ]
    context.checkpoint()

    ok_rows = [row for row in rows if row.get("status") == "ok"]
    incomparable_count = sum(1 for row in rows if row.get("status") == "incomparable_reference")
    pass_count = sum(1 for row in ok_rows if row.get("pass"))
    fail_count = sum(1 for row in ok_rows if not row.get("pass"))
    no_solution_count = sum(1 for row in rows if row.get("status") == "no_solution")
    # None, not 0.0, when nothing was compared: a zero error reads as a perfect score.
    mean_abs_error = (
        sum(float(row["absErrorKmS"]) for row in ok_rows) / len(ok_rows)
        if ok_rows
        else None
    )
    fixed_rows = _fixed_state_rows(
        Path(fixed_state_path) if fixed_state_path else base_dir / "fixed_state_references.json",
        context,
    )
    reference_integrity_ok = all(
        bool(row.get("reference", {}).get("requiredToolsPresent"))
        and bool(row.get("reference", {}).get("artifactChecksPassed"))
        for row in rows
    )

    return {
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
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
        "passRate": (pass_count / len(ok_rows)) if ok_rows else None,
        "validationCoverage": (len(ok_rows) / len(rows)) if rows else 0.0,
        "meanAbsErrorKmS": mean_abs_error,
        "fixedStateReferences": {
            "count": len(fixed_rows),
            "passCount": sum(1 for row in fixed_rows if row["pass"]),
            "maxAbsErrorKmS": max((row["maxAbsErrorKmS"] for row in fixed_rows if "maxAbsErrorKmS" in row), default=None),
            "rows": fixed_rows,
        },
        "planningContext": context.snapshot(),
        "rows": rows,
    }


def _percent_or_na(value: Any) -> str:
    return "n/a (nothing compared)" if value is None else f"{float(value) * 100.0:.1f}%"


def _km_s_or_na(value: Any, fmt: str = ".3f") -> str:
    return "n/a (nothing compared)" if value is None else f"{float(value):{fmt}} km/s"


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
        f"- Pass rate: {_percent_or_na(summary.get('passRate'))}",
        f"- Mean |delta-v error|: {_km_s_or_na(summary.get('meanAbsErrorKmS'))}",
        "- Fixed-state textbook references passed: "
        f"{summary.get('fixedStateReferences', {}).get('passCount', 0)}"
        f"/{summary.get('fixedStateReferences', {}).get('count', 0)}"
        f" (max |dv| {_km_s_or_na(summary.get('fixedStateReferences', {}).get('maxAbsErrorKmS'), '.2e')})",
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
            "- Archived Horizons fixed states are compared with independently executed Izzo/Gooding references.",
            "- The historical GMAT/Orekit/Tudat captures remain incomparable and are preserved as legacyCalibration; their checksums are integrity checks, not proof of execution.",
            "- Endpoint v-infinity sums are transfer metrics, not parking/capture propulsive burns. These checks validate Lambert, not the live ephemeris provider.",
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
    planning_context: PlanningContext | None = None,
) -> Dict[str, Any]:
    path = Path(output_path)

    # Refuse to clobber an existing report unless the caller explicitly opts in.
    # This endpoint is unauthenticated, and its target directory holds
    # hand-written notes; silently replacing a file there destroys user data.
    # Check before benchmarking so a rejected call costs no work. Include
    # dangling symlinks, which Path.exists() alone deliberately ignores.
    if not allow_overwrite and (path.exists() or path.is_symlink()):
        raise FileExistsError(_OVERWRITE_REFUSED.format(path=path))

    context = planning_context or _new_benchmark_context()
    if type(context) is not PlanningContext:
        raise TypeError("Benchmark planning context must be an exact PlanningContext instance")
    context.checkpoint()
    summary = benchmark_against_references(
        bodies,
        ephemeris_provider=ephemeris_provider,
        scenarios_path=scenarios_path,
        planning_context=context,
    )
    context.checkpoint()
    markdown = render_accuracy_report_markdown(summary)

    context.checkpoint()
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
    "BENCHMARK_DEFAULT_TIMEOUT_SECONDS",
    "MAX_REFERENCE_ARTIFACT_BYTES",
    "MAX_REFERENCE_ARTIFACT_TOTAL_BYTES",
    "MAX_REFERENCE_FILE_BYTES",
    "MAX_REFERENCE_SCENARIOS",
    "benchmark_against_references",
    "generate_accuracy_report",
    "render_accuracy_report_markdown",
]
