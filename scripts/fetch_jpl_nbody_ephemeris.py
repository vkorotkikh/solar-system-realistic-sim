#!/usr/bin/env python3
"""Regenerate or verify the REBOUND backend's JPL ephemeris fixtures.

This is an explicit network maintenance tool; the runtime and test suite use
only committed JSON.  It fetches geometric Cartesian vectors from Horizons and
matching gravity parameters from JPL/NAIF's DE440 constants kernel.

Examples:
  python scripts/fetch_jpl_nbody_ephemeris.py --check
  python scripts/fetch_jpl_nbody_ephemeris.py --write
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping


ROOT = Path(__file__).resolve().parents[1]
INITIAL_PATH = (
    ROOT
    / "backend"
    / "data"
    / "ephemerides"
    / "jpl_horizons_de441_j2000_barycenters.json"
)
VALIDATION_PATH = (
    ROOT / "backend" / "tests" / "fixtures" / "nbody_horizons_validation.json"
)
HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_DOC_URL = "https://ssd-api.jpl.nasa.gov/doc/horizons.html"
GM_KERNEL_URL = (
    "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc"
)
J2000_JD_TDB = 2_451_545.0
EXPECTED_STATE_EPHEMERIS = "DE441"

# The outer targets are system barycenters because their moons are not modeled.
# Earth and Moon are separate because DE440 integrates them separately and the
# application ID `earth` is expected to remain the physical Earth center.
TARGETS: Mapping[str, Mapping[str, str]] = {
    "sun": {"command": "10", "resolved_target_id": "10", "target_name": "Sun", "gm_id": "10"},
    # Horizons canonicalizes the moonless Mercury/Venus barycenter aliases to
    # their planet-center IDs in the returned target header.
    "mercury": {"command": "1", "resolved_target_id": "199", "target_name": "Mercury barycenter", "gm_id": "1"},
    "venus": {"command": "2", "resolved_target_id": "299", "target_name": "Venus barycenter", "gm_id": "2"},
    "earth": {"command": "399", "resolved_target_id": "399", "target_name": "Earth", "gm_id": "399"},
    "mars": {"command": "4", "resolved_target_id": "4", "target_name": "Mars system barycenter", "gm_id": "4"},
    "jupiter": {"command": "5", "resolved_target_id": "5", "target_name": "Jupiter system barycenter", "gm_id": "5"},
    "saturn": {"command": "6", "resolved_target_id": "6", "target_name": "Saturn system barycenter", "gm_id": "6"},
    "uranus": {"command": "7", "resolved_target_id": "7", "target_name": "Uranus system barycenter", "gm_id": "7"},
    "neptune": {"command": "8", "resolved_target_id": "8", "target_name": "Neptune system barycenter", "gm_id": "8"},
    "pluto": {"command": "9", "resolved_target_id": "9", "target_name": "Pluto system barycenter", "gm_id": "9"},
    "moon": {"command": "301", "resolved_target_id": "301", "target_name": "Moon", "gm_id": "301"},
}
PUBLIC_BODY_IDS = tuple(body_id for body_id in TARGETS if body_id != "moon")
VALIDATION_EPOCHS = (
    ("1990-01-01", 2_447_892.5),
    ("2026-08-23", 2_461_275.5),
    ("2050-01-01", 2_469_807.5),
)
COMMON_QUERY: Mapping[str, str] = {
    "format": "json",
    "OBJ_DATA": "NO",
    "MAKE_EPHEM": "YES",
    "EPHEM_TYPE": "VECTORS",
    "CENTER": "500@0",
    "TLIST_TYPE": "JD",
    "TIME_TYPE": "TDB",
    "REF_PLANE": "ECLIPTIC",
    "REF_SYSTEM": "ICRF",
    "OUT_UNITS": "AU-D",
    "VEC_TABLE": "2",
    "VEC_CORR": "NONE",
    "CSV_FORMAT": "YES",
    "VEC_LABELS": "YES",
}


def _fetch_bytes(url: str) -> tuple[bytes, Mapping[str, str]]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "solar-system-realistic-sim/1"},
    )
    with urllib.request.urlopen(request, timeout=30.0) as response:
        return response.read(), dict(response.headers.items())


def _fetch_gms() -> tuple[Dict[str, float], str, str | None]:
    raw, headers = _fetch_bytes(GM_KERNEL_URL)
    text = raw.decode("utf-8")
    values: Dict[str, float] = {}
    pattern = re.compile(r"BODY(\d+)_GM\s*=\s*\(\s*([+\-0-9.EeDd]+)\s*\)")
    for body_id, number in pattern.findall(text):
        values[body_id] = float(number.replace("D", "E").replace("d", "e"))
    missing = sorted({target["gm_id"] for target in TARGETS.values()} - set(values))
    if missing:
        raise RuntimeError(f"GM kernel did not contain required BODY IDs: {missing}")
    return values, hashlib.sha256(raw).hexdigest(), headers.get("Last-Modified")


def _extract_header(result: str, prefix: str) -> str:
    for line in result.splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped
    raise RuntimeError(f"Horizons response omitted `{prefix}` header")


def _body_id_from_header(header: str, field: str) -> str:
    matches = re.findall(r"\((-?\d+)\)", header)
    if not matches:
        raise RuntimeError(f"Horizons `{field}` header omitted a numeric target ID: {header}")
    return matches[-1]


def _fetch_vector(
    body_id: str,
    jd_tdb: float,
    *,
    command: str | None = None,
    center: str = "500@0",
    expected_center_name: str = "Solar System Barycenter (0)",
) -> Dict[str, Any]:
    target = TARGETS[body_id]
    params = dict(COMMON_QUERY)
    params.update(
        {
            "COMMAND": command or target["command"],
            "CENTER": center,
            "TLIST": f"{jd_tdb:.9f}",
        }
    )
    raw, _headers = _fetch_bytes(
        HORIZONS_API_URL + "?" + urllib.parse.urlencode(params)
    )
    payload = json.loads(raw.decode("utf-8"))
    if payload.get("error"):
        raise RuntimeError(f"Horizons rejected {body_id}: {payload['error']}")
    result = str(payload.get("result", ""))
    if "$$SOE" not in result or "$$EOE" not in result:
        raise RuntimeError(f"Horizons response for {body_id} had no vector table")
    table = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    vector_line = next(line for line in table.splitlines() if line.strip())
    row = next(csv.reader(io.StringIO(vector_line)))
    if len(row) < 8:
        raise RuntimeError(f"Horizons vector row for {body_id} was incomplete")
    vector = [float(row[idx]) for idx in range(2, 8)]
    target_header = _extract_header(result, "Target body name:")
    center_header = _extract_header(result, "Center body name:")
    frame_header = _extract_header(result, "Reference frame :")
    units_header = _extract_header(result, "Output units    :")
    source_match = re.search(r"\{source:\s*([^}]+)\}", target_header)
    signature = payload.get("signature") or {}
    if signature.get("source") != "NASA/JPL Horizons API":
        raise RuntimeError(f"unexpected Horizons signature for {body_id}: {signature}")
    if expected_center_name not in center_header:
        raise RuntimeError(f"unexpected Horizons center for {body_id}: {center_header}")
    expected_target_id = command or target["resolved_target_id"]
    if _body_id_from_header(target_header, "target") != expected_target_id:
        raise RuntimeError(f"unexpected Horizons target for {body_id}: {target_header}")
    expected_center_id = center.rsplit("@", 1)[-1]
    if _body_id_from_header(center_header, "center") != expected_center_id:
        raise RuntimeError(f"unexpected Horizons center ID for {body_id}: {center_header}")
    if frame_header != "Reference frame : Ecliptic of J2000.0":
        raise RuntimeError(f"unexpected Horizons frame for {body_id}: {frame_header}")
    if units_header != "Output units    : AU-D":
        raise RuntimeError(f"unexpected Horizons units for {body_id}: {units_header}")
    returned_jd_tdb = float(row[0])
    if not math.isclose(returned_jd_tdb, jd_tdb, rel_tol=0.0, abs_tol=5e-10):
        raise RuntimeError(
            f"Horizons returned JDTDB {returned_jd_tdb} for requested {jd_tdb}"
        )
    if not all(math.isfinite(component) for component in vector):
        raise RuntimeError(f"Horizons returned a non-finite state for {body_id}")
    if source_match is None:
        raise RuntimeError(f"Horizons target header omitted ephemeris source: {target_header}")
    fingerprint_payload = {
        "target_header": target_header,
        "center_header": center_header,
        "frame_header": frame_header,
        "units_header": units_header,
        "jd_tdb": float(row[0]),
        "state": vector,
    }
    fingerprint = hashlib.sha256(
        json.dumps(
            fingerprint_payload,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return {
        "position_au": vector[:3],
        "velocity_au_per_day": vector[3:],
        "state_ephemeris": source_match.group(1).strip(),
        "result_fingerprint_sha256": fingerprint,
        "api_version": str(signature.get("version", "unknown")),
    }


def _query_metadata(jd_tdb: float) -> Dict[str, str]:
    query = dict(COMMON_QUERY)
    query["TLIST"] = f"{jd_tdb:.1f}"
    return query


def _build_initial_fixture(retrieved_utc: str) -> Dict[str, Any]:
    gms, gm_sha256, gm_last_modified = _fetch_gms()
    states = {body_id: _fetch_vector(body_id, J2000_JD_TDB) for body_id in TARGETS}
    ephemerides = {state["state_ephemeris"] for state in states.values()}
    api_versions = {state["api_version"] for state in states.values()}
    if ephemerides != {EXPECTED_STATE_EPHEMERIS} or len(api_versions) != 1:
        raise RuntimeError(
            f"mixed upstream versions: ephemerides={ephemerides}, APIs={api_versions}"
        )

    bodies: Dict[str, Any] = {}
    for body_id, target in TARGETS.items():
        state = states[body_id]
        bodies[body_id] = {
            "horizons_target_id": target["command"],
            "target_name": target["target_name"],
            "state_ephemeris": state["state_ephemeris"],
            "result_fingerprint_sha256": state["result_fingerprint_sha256"],
            "gm_km3_s2": gms[target["gm_id"]],
            "position_au": state["position_au"],
            "velocity_au_per_day": state["velocity_au_per_day"],
        }

    return {
        "schema_version": 1,
        "dataset_id": "jpl-horizons-de441-j2000-reduced-major-bodies-v1",
        "description": (
            "Instantaneous J2000 Cartesian states for the reduced DE440-aligned "
            "major-body point-mass model used by the REBOUND backend."
        ),
        "epoch": {
            "jd_tdb": J2000_JD_TDB,
            "time_scale": "TDB",
            "label": "A.D. 2000-Jan-01 12:00 TDB",
        },
        "input_frame": {
            "origin": "solar_system_barycenter",
            "orientation": "ecliptic_j2000",
            "reference_system": "ICRF",
            "position_unit": "AU",
            "velocity_unit": "AU/day",
            "aberration_correction": "NONE",
        },
        "dynamics": {
            "representation": "planetary_system_barycenters_with_explicit_earth_moon",
            "state_ephemeris": next(iter(ephemerides)),
            "gravity_parameter_unit": "km^3/s^2",
            "gravity_parameter_source": GM_KERNEL_URL,
            "gravity_parameter_sha256": gm_sha256,
            "gravity_parameter_last_modified": gm_last_modified,
            "scope_note": (
                "Earth and Moon are separate active particles with BODY399/BODY301 GMs. "
                "Mars through Pluto are planetary-system barycenters with matching "
                "BODY4-BODY9 system GMs because their satellites are not integrated."
            ),
        },
        "provenance": {
            "provider": "NASA/JPL Horizons API",
            "api_version": next(iter(api_versions)),
            "retrieved_utc": retrieved_utc,
            "api_url": HORIZONS_API_URL,
            "documentation_url": HORIZONS_DOC_URL,
            "query": _query_metadata(J2000_JD_TDB),
            "result_fingerprint_contract": (
                "SHA-256 of canonical target/center/frame/unit headers, JDTDB, and "
                "six-vector; excludes the request-generation timestamp"
            ),
        },
        "bodies": bodies,
    }


def _build_validation_fixture(retrieved_utc: str) -> Dict[str, Any]:
    epochs = []
    api_versions = set()
    state_ephemerides = set()
    for label, jd_tdb in VALIDATION_EPOCHS:
        bodies: Dict[str, Any] = {}
        for body_id in PUBLIC_BODY_IDS:
            state = _fetch_vector(body_id, jd_tdb)
            api_versions.add(state.pop("api_version"))
            state_ephemerides.add(state.pop("state_ephemeris"))
            bodies[body_id] = state
        epochs.append({"label": label, "jd_tdb": jd_tdb, "bodies": bodies})
    if state_ephemerides != {EXPECTED_STATE_EPHEMERIS} or len(api_versions) != 1:
        raise RuntimeError(
            "unexpected validation sources: "
            f"ephemerides={state_ephemerides}, APIs={api_versions}"
        )
    saturn_center = _fetch_vector(
        "saturn",
        2_461_275.5,
        command="699",
        center="500@10",
        expected_center_name="Sun (10)",
    )
    api_versions.add(saturn_center.pop("api_version"))
    moon = _fetch_vector("moon", 2_461_275.5)
    api_versions.add(moon.pop("api_version"))
    if moon.get("state_ephemeris") != EXPECTED_STATE_EPHEMERIS:
        raise RuntimeError(f"unexpected Moon validation source: {moon['state_ephemeris']}")
    if len(api_versions) != 1:
        raise RuntimeError(f"mixed Horizons API versions: {api_versions}")
    return {
        "schema_version": 1,
        "fixture_id": "jpl-horizons-de441-reduced-model-validation-v1",
        "description": (
            "Independent off-epoch Horizons states for offline heliocentric "
            "position and velocity regression gates."
        ),
        "provenance": {
            "provider": "NASA/JPL Horizons API",
            "api_version": next(iter(api_versions)),
            "state_ephemeris": next(iter(state_ephemerides)),
            "retrieved_utc": retrieved_utc,
            "api_url": HORIZONS_API_URL,
            "documentation_url": HORIZONS_DOC_URL,
            "query_without_tlist_or_command": dict(COMMON_QUERY),
            "result_fingerprint_contract": (
                "SHA-256 of canonical target/center/frame/unit headers, JDTDB, and "
                "six-vector; excludes the request-generation timestamp"
            ),
        },
        "target_contract": {
            body_id: {
                "horizons_target_id": TARGETS[body_id]["command"],
                "target_name": TARGETS[body_id]["target_name"],
            }
            for body_id in PUBLIC_BODY_IDS
        },
        "planet_center_proxy_checks": [
            {
                "body_id": "saturn",
                "horizons_target_id": "699",
                "target_name": "Saturn",
                "center": "500@10",
                "jd_tdb": 2_461_275.5,
                **saturn_center,
            }
        ],
        "internal_particle_checks": [
            {
                "body_id": "moon",
                "horizons_target_id": "301",
                "target_name": "Moon",
                "relative_to_body_id": "earth",
                "jd_tdb": 2_461_275.5,
                **moon,
            }
        ],
        "epochs": epochs,
    }


def _without_retrieval_time(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_retrieval_time(child)
            for key, child in value.items()
            if key not in {"retrieved_utc", "gravity_parameter_last_modified"}
        }
    if isinstance(value, list):
        return [_without_retrieval_time(child) for child in value]
    return value


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _check_fixture(path: Path, generated: Mapping[str, Any]) -> bool:
    committed = json.loads(path.read_text(encoding="utf-8"))
    if _without_retrieval_time(committed) == _without_retrieval_time(generated):
        print(f"verified {path.relative_to(ROOT)}")
        return True
    print(f"STALE {path.relative_to(ROOT)}", file=sys.stderr)
    return False


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--check",
        action="store_true",
        help="compare live JPL data to committed fixtures",
    )
    mode.add_argument(
        "--write",
        action="store_true",
        help="overwrite committed fixtures with live JPL data",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    retrieved_utc = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    initial = _build_initial_fixture(retrieved_utc)
    validation = _build_validation_fixture(retrieved_utc)
    if args.write:
        _write_json(INITIAL_PATH, initial)
        _write_json(VALIDATION_PATH, validation)
        print(f"wrote {INITIAL_PATH.relative_to(ROOT)}")
        print(f"wrote {VALIDATION_PATH.relative_to(ROOT)}")
        return 0
    return 0 if all(
        (
            _check_fixture(INITIAL_PATH, initial),
            _check_fixture(VALIDATION_PATH, validation),
        )
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
