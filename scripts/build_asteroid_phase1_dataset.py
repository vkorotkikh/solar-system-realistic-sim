#!/usr/bin/env python3
"""Reproduce the Phase-1 asteroid bundle offline from pinned REAL JPL inputs.

Refresh inputs explicitly with capture_catalog_sources.py. All three artifacts
are staged and published as one directory generation; --check never writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
from pathlib import Path
from typing import Any

from catalog_sources import SOURCE_DIR, SourceStore, json_bytes, publish_directory, request_url
from fetch_jpl_sbdb import SBDB_API_URL, phase1_query_params

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "asteroid-phase1"
DEFAULT_BIN_NAME = "asteroid_phase1_main_100000.bin"
DEFAULT_META_NAME = "asteroid_phase1_main_100000.meta.json"
ACBF_MAGIC = b"ACBF"
ACBF_VERSION = 1
ACBF_STRIDE_BYTES = 36
ANGLE_SCALE_U16 = 65535
MAIN_BELT_CLASS_WHITELIST = {"MBA", "IMB", "OMB"}
MAIN_BELT_AU_MIN = 2.0
MAIN_BELT_AU_MAX = 3.5
UNKNOWN_TAXONOMY = 255
# These are coarse VISUAL families, not composition determinations. In
# particular SMASS X and Tholen E must not be reported as metallic M.
VISUAL_FAMILIES = {**dict.fromkeys("CBGFPDT", ("C", 0)), **dict.fromkeys("SQLKAVR", ("S", 1))}


def _safe_number(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def _is_main_belt(row: dict) -> bool:
    a = _safe_number(row.get("a"))
    return (row.get("class") in MAIN_BELT_CLASS_WHITELIST and a is not None
            and MAIN_BELT_AU_MIN <= a <= MAIN_BELT_AU_MAX)


def _taxonomy(row: dict) -> tuple[str, int]:
    tholen = str(row.get("spec_t") or "").strip().upper()
    if tholen == "M":
        return "M", 2
    for field in ("spec_t", "spec_b"):
        value = str(row.get(field) or "").strip().upper()
        # A qualified/ambiguous label is not an unambiguous measurement.
        if value and ":" not in value and "?" not in value and value[0] in VISUAL_FAMILIES:
            return VISUAL_FAMILIES[value[0]]
    return "unknown", UNKNOWN_TAXONOMY


def _estimate_diameter_km(h_mag: float | None, diameter_km: float | None,
                          albedo: float | None) -> float | None:
    if diameter_km is not None and math.isfinite(diameter_km) and diameter_km > 0:
        return diameter_km
    if h_mag is None or not math.isfinite(h_mag) or albedo is None or not 0 < albedo <= 1:
        return None
    # D (not radius) in km: Harris & Harris 1997; JPL CNEOS size estimator.
    return 1329.0 / math.sqrt(albedo) * 10.0 ** (-h_mag / 5.0)


def _required(row: dict, name: str, lo: float = -math.inf, hi: float = math.inf) -> float:
    value = _safe_number(row.get(name))
    if value is None or not lo <= value <= hi:
        raise ValueError(f"invalid/missing {name} for source {row.get('spkid')}")
    return value


def _build_records(rows: list[dict]) -> tuple[list[dict], dict[str, int], dict[str, int]]:
    records: list[dict] = []
    taxonomy_counts = {"C": 0, "S": 0, "M": 0, "unknown": 0}
    class_counts: dict[str, int] = {}
    seen: set[int] = set()
    for row in rows:
        if not _is_main_belt(row):
            continue
        source_id = _required(row, "spkid", 1, 0xFFFFFFFF)
        if not source_id.is_integer():
            raise ValueError("noninteger source identity")
        if int(source_id) in seen:
            raise ValueError(f"duplicate source identity: {int(source_id)}")
        seen.add(int(source_id))
        albedo = _safe_number(row.get("albedo"))
        if albedo is not None and not 0 < albedo <= 1:
            raise ValueError(f"invalid albedo for source {int(source_id)}")
        diameter = _safe_number(row.get("diameter"))
        diameter_km = _estimate_diameter_km(_safe_number(row.get("h")), diameter, albedo)
        if diameter_km is None or not math.isfinite(diameter_km) or diameter_km <= 0:
            raise ValueError(f"unknown diameter for source {int(source_id)}")
        taxonomy_name, taxonomy_index = _taxonomy(row)
        record = {
            "source_id": int(source_id), "name": re.sub(r"\s+", " ", str(row.get("full_name") or "")).strip(),
            "epoch_jd": _required(row, "epoch", 1), "a_au": _required(row, "a", 2, 3.5),
            "e": _required(row, "e", 0, math.nextafter(1.0, 0)),
            "i_deg": _required(row, "i", 0, 180),
            "ascending_node_deg": _required(row, "om") % 360,
            "arg_periapsis_deg": _required(row, "w") % 360,
            "mean_anomaly_deg": _required(row, "ma") % 360,
            "period_days": _required(row, "per", math.nextafter(0.0, 1)),
            "diameter_km": diameter_km, "diameter_origin": "SBDB" if diameter and diameter > 0 else "H-and-observed-albedo-estimate",
            "albedo": albedo, "taxonomy_index": taxonomy_index, "taxonomy_name": taxonomy_name,
            "spec_b": row.get("spec_b"), "spec_t": row.get("spec_t"), "orbit_class": row["class"],
        }
        records.append(record)
        taxonomy_counts[taxonomy_name] += 1
        class_counts[row["class"]] = class_counts.get(row["class"], 0) + 1
    records.sort(key=lambda record: (-record["diameter_km"], record["source_id"]))
    return records, taxonomy_counts, class_counts


def _pack_u16(value: float, maximum: float) -> int:
    return round(value / maximum * ANGLE_SCALE_U16)


def _pack_binary(records: list[dict]) -> bytes:
    payload = bytearray(struct.pack("<4sBBBBI", ACBF_MAGIC, ACBF_VERSION, 0, ACBF_STRIDE_BYTES, 0, len(records)))
    for r in records:
        # Existing ACBF v1 layout is unchanged. 0 albedo means unknown;
        # positive source albedo is at least code 1. 255 is unknown taxonomy.
        albedo_code = 0 if r["albedo"] is None else max(1, _pack_u16(r["albedo"], 1))
        payload.extend(struct.pack(
            "<IffHHHHHffHBBH", r["source_id"], r["epoch_jd"], r["a_au"],
            _pack_u16(r["e"], 1), _pack_u16(r["i_deg"], 180),
            _pack_u16(r["ascending_node_deg"], 360), _pack_u16(r["arg_periapsis_deg"], 360),
            _pack_u16(r["mean_anomaly_deg"], 360), r["period_days"], r["diameter_km"],
            albedo_code, r["taxonomy_index"], 0, 0,
        ))
    return bytes(payload)


def _population(records: list[dict]) -> dict:
    def histogram(field: str, edges: list[float]) -> list[int]:
        return [sum(lo <= r[field] < hi for r in records) for lo, hi in zip(edges, edges[1:])]
    return {
        "count": len(records), "diameter_min_km": min(r["diameter_km"] for r in records),
        "diameter_max_km": max(r["diameter_km"] for r in records),
        "taxonomy": {name: sum(r["taxonomy_name"] == name for r in records) for name in ("C", "S", "M", "unknown")},
        "unknown_albedo_count": sum(r["albedo"] is None for r in records),
        "a_au_edges": [2, 2.5, 2.82, 3.500001], "a_au_counts": histogram("a_au", [2, 2.5, 2.82, 3.500001]),
        "inclination_deg_edges": [0, 5, 10, 20, 180.000001], "inclination_deg_counts": histogram("i_deg", [0, 5, 10, 20, 180.000001]),
    }


def dataset_artifacts(limit: int, bin_name: str, meta_name: str, source_dir: Path = SOURCE_DIR) -> dict[str, bytes]:
    if not 1 <= limit <= 100_000:
        raise ValueError("limit must be between 1 and the pinned population of 100000")
    if len({bin_name, meta_name, "sample_top_10.json"}) != 3:
        raise ValueError("artifact filenames must be distinct")
    for name in (bin_name, meta_name):
        if Path(name).name != name or name in ("", ".", ".."):
            raise ValueError("artifact names must be simple filenames")
    store = SourceStore(source_dir)
    params = phase1_query_params()
    raw = store.read(SBDB_API_URL, params)
    source = json.loads(raw)
    if source.get("signature", {}).get("version") != "1.0":
        raise ValueError("unsupported SBDB API source version")
    if source.get("fields") != params["fields"].split(","):
        raise ValueError("unexpected SBDB source fields")
    fields = [field.lower() for field in source["fields"]]
    if any(len(values) != len(fields) for values in source["data"]):
        raise ValueError("incomplete SBDB source row")
    rows = [dict(zip(fields, values)) for values in source["data"]]
    all_records, _, _ = _build_records(rows)
    if len(all_records) != 100_000:
        raise ValueError(f"pinned source population incomplete: {len(all_records)} != 100000")
    if any(r["diameter_origin"] != "SBDB" for r in all_records):
        raise ValueError("largest-first catalog requires SBDB-supplied diameters")
    records = all_records[:limit]
    binary = _pack_binary(records)
    url = request_url(SBDB_API_URL, params)
    entry = store.manifest["responses"][hashlib.sha256(url.encode("ascii")).hexdigest()]
    coverage = _population(records)
    prefix = records[:50_000]
    meta = {
        "version": 1, "generated_utc": entry["capturedUtc"],
        "description": "Largest-first prefix of diameter-bearing JPL main-belt asteroids; not a representative population sample.",
        "query": {"endpoint": SBDB_API_URL, **params},
        "source_rows": len(rows), "stored_count": len(records),
        "source": {"url": url, "sha256": entry["sha256"], "signature": source["signature"], "captured_utc": entry["capturedUtc"], "matching_database_rows": int(source["count"])},
        "checksum_sha256": hashlib.sha256(binary).hexdigest(), "checksum_algorithm_sha256": "sha256",
        "population_policy": {"selection": "largest-first-prefix", "order": ["diameter_km descending", "source_id ascending for ties"], "representative": False, "scope": "known SBDB diameters, MBA/IMB/OMB, 2 <= a <= 3.5 AU", "stored": coverage, "display_prefix_50000": {**_population(prefix), "fraction_of_stored": len(prefix) / len(records)}},
        "fidelity": {"status": "not-independently-validated", "integrity": "SHA-256 binds artifact bytes only, not scientific accuracy", "period": "SBDB full-prec=true per (days), rounded only to ACBF float32", "taxonomy": "coarse visual families from observed spec_T/spec_B; original labels remain in pinned input; no semimajor-axis inference; X/E are not metallic M", "albedo": "SBDB source value or unknown; no assumed albedo", "diameter": "SBDB-supplied diameter in km; no magnitude-derived diameters in this population", "dynamics": "quantized fixed osculating elements with two-body propagation, not a validated multi-epoch ephemeris", "appearance": "colors and irregularity are illustrative"},
        "record_layout": {"format": "acbf_v1", "stride_bytes": 36, "unknown_taxonomy_u8": 255, "unknown_albedo_u16": 0, "positive_albedo_min_code": 1, "quantization": {"float32": ["epoch_jd", "a_au", "period_days", "diameter_km"], "u16_ranges": {"e": [0, 1], "i_deg": [0, 180], "angles_deg": [0, 360], "albedo": [0, 1]}}},
        "taxonomy_map": {"C": 0, "S": 1, "M": 2, "unknown": 255},
        "counts": {"taxonomy": coverage["taxonomy"], "orbit_class": {key: sum(r["orbit_class"] == key for r in records) for key in sorted(MAIN_BELT_CLASS_WHITELIST)}},
        "scientific_references": ["https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html", "https://cneos.jpl.nasa.gov/tools/ast_size_est.html"],
    }
    return {bin_name: binary, meta_name: json_bytes(meta), "sample_top_10.json": json_bytes(records[:10])}


def build_dataset(output_dir: Path, limit: int, bin_name: str, meta_name: str,
                  source_dir: Path = SOURCE_DIR, *, check: bool = False, dry_run: bool = False) -> None:
    artifacts = dataset_artifacts(limit, bin_name, meta_name, source_dir)
    if check:
        for name, content in artifacts.items():
            if not (output_dir / name).exists() or (output_dir / name).read_bytes() != content:
                raise ValueError(f"artifact differs: {output_dir / name}")
    elif not dry_run:
        publish_directory(output_dir, artifacts)
    print(f"[phase1] {'byte-identical' if check else 'validated' if dry_run else 'built'} {limit:,} records: {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100_000)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--bin-name", default=DEFAULT_BIN_NAME)
    parser.add_argument("--meta-name", default=DEFAULT_META_NAME)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--offline", action="store_true", help="explicit default; generation never accesses the network")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="byte-compare without writing")
    mode.add_argument("--dry-run", action="store_true", help="validate all pinned inputs and serialize without writing")
    args = parser.parse_args()
    build_dataset(args.output_dir, args.limit, args.bin_name, args.meta_name, args.source_dir, check=args.check, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
