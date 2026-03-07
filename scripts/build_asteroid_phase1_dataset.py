#!/usr/bin/env python3
"""Build Phase-1 deterministic asteroid dataset artifacts.

This queries the JPL Small-Body Database for the largest asteroids,
filters to the main-belt population, packs the selected orbital/physical
fields into the canonical ACBF binary format, and writes compact JSON metadata.
"""

from __future__ import annotations

import argparse
import json
import math
import hashlib
import re
import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fetch_utils import load_or_fetch
from fetch_jpl_sbdb import SBDB_API_URL, SBDB_FIELDS, fetch_sbdb

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "asteroid-phase1"
DEFAULT_BIN_NAME = "asteroid_phase1_main_100000.bin"
DEFAULT_META_NAME = "asteroid_phase1_main_100000.meta.json"

ACBF_MAGIC = b"ACBF"
ACBF_VERSION = 1
ACBF_STRIDE_BYTES = 36
ANGLE_SCALE_U16 = 65535
ANGLE_BOUNDS = {
    "eccentricity": (0.0, 1.0),
    "inclination": (0.0, 180.0),
    "angle": (0.0, 360.0),
    "albedo": (0.0, 1.0),
}

MAIN_BELT_CLASS_WHITELIST = {"MBA", "IMB", "OMB"}
MAIN_BELT_AU_MIN = 2.0
MAIN_BELT_AU_MAX = 3.5
DEFAULT_MAIN_BELT_FETCH_LIMIT = 20_000
MAX_MAIN_BELT_FETCH_LIMIT = 1_000_000


@dataclass(frozen=True)
class TaxonomyMapping:
    name: str
    material_index: int


TAXONOMY_BY_CHAR = {
    # Carbonaceous / volatile-rich / dark classes
    "C": TaxonomyMapping("C", 0),
    "B": TaxonomyMapping("C", 0),
    "G": TaxonomyMapping("C", 0),
    "F": TaxonomyMapping("C", 0),
    "P": TaxonomyMapping("C", 0),
    "D": TaxonomyMapping("C", 0),
    "T": TaxonomyMapping("C", 0),
    "X": TaxonomyMapping("M", 2),
    # Silicaceous classes
    "S": TaxonomyMapping("S", 1),
    "Q": TaxonomyMapping("S", 1),
    "L": TaxonomyMapping("S", 1),
    "K": TaxonomyMapping("S", 1),
    "A": TaxonomyMapping("S", 1),
    "V": TaxonomyMapping("S", 1),
    "R": TaxonomyMapping("S", 1),
    # Metallic classes
    "M": TaxonomyMapping("M", 2),
    "E": TaxonomyMapping("M", 2),
}


TAXONOMY_ALBEDO_RANGES = {
    0: (0.03, 0.10),  # C-type
    1: (0.10, 0.22),  # S-type
    2: (0.10, 0.18),  # M-type
}


def _safe_number(value: Any, default: float | None = None) -> float | None:
    try:
        if value in (None, "", "null"):
            return default
        num = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(num):
        return default
    return num


def _is_main_belt(row: dict[str, Any]) -> bool:
    raw_class = row.get("class")
    orbit_class = str(raw_class).strip().upper() if isinstance(raw_class, str) else ""
    a_au = _safe_number(row.get("a"), None)

    if orbit_class and orbit_class not in MAIN_BELT_CLASS_WHITELIST:
        return False

    if a_au is None:
        return False

    return MAIN_BELT_AU_MIN <= a_au <= MAIN_BELT_AU_MAX


def _clean_orbit_value(raw: Any, default: float) -> float:
    value = _safe_number(raw, default)
    if value is None:
        return default
    return value


def _taxon_from_spec(spec_b: Any, spec_t: Any, a_au: float | None) -> TaxonomyMapping:
    for spec in (spec_t, spec_b):
        if isinstance(spec, str):
            key = spec.strip().upper()[:1]
            mapped = TAXONOMY_BY_CHAR.get(key)
            if mapped:
                return mapped

    if a_au is None:
        return TAXONOMY_BY_CHAR["C"]
    if a_au < 2.5:
        return TAXONOMY_BY_CHAR["S"]
    if a_au > 2.7:
        return TAXONOMY_BY_CHAR["C"]
    return TAXONOMY_BY_CHAR["M"]


def _estimate_albedo(spec_b: Any, spec_t: Any, a_au: float | None) -> float:
    tax = _taxon_from_spec(spec_b, spec_t, a_au)
    lo, hi = TAXONOMY_ALBEDO_RANGES[tax.material_index]
    return (lo + hi) * 0.5


def _estimate_diameter_km(h_mag: float | None, diameter_km: float | None, albedo: float) -> float:
    if diameter_km is not None and diameter_km > 0:
        return diameter_km
    if h_mag is None or h_mag <= 0 or not math.isfinite(h_mag):
        return 1.0
    if not math.isfinite(albedo) or albedo <= 0:
        albedo = 0.1
    return max(0.001, 664.5 / math.sqrt(albedo) * (10.0 ** (-h_mag / 5.0)))


def _estimate_period_days(a_au: float) -> float:
    if a_au <= 0 or not math.isfinite(a_au):
        return 365.25
    return 365.25 * (a_au ** 1.5)


def _strip_space_name(full_name: str) -> str:
    clean = (full_name or "").strip()
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def _fetch_asteroids(
    limit: int,
    *,
    initial_fetch_limit: int | None = None
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []

    initial_fetch = DEFAULT_MAIN_BELT_FETCH_LIMIT if initial_fetch_limit is None else initial_fetch_limit
    fetch_limit = max(limit, initial_fetch)
    while True:
        limited_fetch = min(fetch_limit, MAX_MAIN_BELT_FETCH_LIMIT)
        cache_name = f"sbdb_phase1_diameter_{limited_fetch}"
        cache_path = PROJECT_ROOT / "scripts" / ".cache" / f"phase1_diameter_{limited_fetch}.json"

        def _fetch():
            return fetch_sbdb(sb_kind="a", sort="-diameter", limit=limited_fetch, cache_name=cache_name)

        rows = load_or_fetch(
            cache_path,
            _fetch,
            max_age_hours=24.0,
        )

        filtered_rows = [row for row in rows if _is_main_belt(row)]
        if len(filtered_rows) >= limit:
            return filtered_rows[:limit]
        if limited_fetch >= MAX_MAIN_BELT_FETCH_LIMIT or len(rows) < limited_fetch:
            return filtered_rows

        fetch_limit = min(fetch_limit * 2, MAX_MAIN_BELT_FETCH_LIMIT)
        if fetch_limit <= limited_fetch:
            return filtered_rows


def _build_records(rows: list[dict[str, Any]]) -> tuple[list[dict[str, float]], dict[str, int], dict[str, int]]:
    records: list[dict[str, float]] = []
    class_counts: dict[str, int] = {}
    taxonomy_counts: dict[str, int] = {"C": 0, "S": 0, "M": 0}

    for row in rows:
        if not _is_main_belt(row):
            continue
        a_au = _safe_number(row.get("a"), None)
        e = _clean_orbit_value(row.get("e"), 0.0)
        i_deg = _clean_orbit_value(row.get("i"), 0.0)
        om = _clean_orbit_value(row.get("om"), 0.0)
        w = _clean_orbit_value(row.get("w"), 0.0)
        ma = _clean_orbit_value(row.get("ma"), 0.0)
        normalized_a_au = a_au if a_au is not None else 2.8
        period_default = _estimate_period_days(normalized_a_au)
        per = _clean_orbit_value(row.get("per"), period_default)
        if per <= 0.0:
            per = period_default
        diameter = _clean_orbit_value(row.get("diameter"), None)
        h_mag = _safe_number(row.get("h"), None)

        spec_b = row.get("spec_b")
        spec_t = row.get("spec_t")
        taxonomy = _taxon_from_spec(spec_b, spec_t, a_au)
        class_name = row.get("class")
        if isinstance(class_name, str) and class_name:
            class_counts[class_name] = class_counts.get(class_name, 0) + 1

        albedo = _estimate_albedo(spec_b, spec_t, a_au)
        diameter_km = _estimate_diameter_km(h_mag, diameter, albedo)

        records.append({
            "epoch_jd": _clean_orbit_value(row.get("epoch"), 2_451_545.0),
            "a_au": normalized_a_au,
            "e": e,
            "i_deg": i_deg,
            "ascending_node_deg": om,
            "arg_periapsis_deg": w,
            "mean_anomaly_deg": ma,
            "period_days": per,
            "diameter_km": max(0.001, diameter_km),
            "albedo": albedo,
            "taxonomy_index": float(taxonomy.material_index),
            "taxonomy_name": taxonomy.name,
            "orbit_class": class_name,
            "source_id": float(_clean_orbit_value(row.get("spkid"), 0.0)),
            "name": _strip_space_name(row.get("full_name", "")),
        })

        taxonomy_counts[taxonomy.name] += 1

    return records, taxonomy_counts, class_counts


def _pack_u16(raw: Any, min_value: float, max_value: float) -> int:
    value = _safe_number(raw, min_value)
    if value is None:
        value = min_value
    value = max(min_value, min(max_value, value))
    ratio = (value - min_value) / (max_value - min_value)
    return int(round(ratio * ANGLE_SCALE_U16))


def _pack_source_id(value: Any) -> int:
    source_id = int(_safe_number(value, 0.0) or 0)
    if source_id < 0:
        return 0
    if source_id > 0xFFFF_FFFF:
        return 0xFFFF_FFFF
    return source_id


def _pack_binary(records: list[dict[str, float]]) -> bytes:
    header = struct.pack("<4sBBBBI", ACBF_MAGIC, ACBF_VERSION, 0, ACBF_STRIDE_BYTES, 0, len(records))
    payload = bytearray()
    for record in records:
        e_q = _pack_u16(record["e"], *ANGLE_BOUNDS["eccentricity"])
        i_q = _pack_u16(record["i_deg"], *ANGLE_BOUNDS["inclination"])
        asc_q = _pack_u16(record["ascending_node_deg"], *ANGLE_BOUNDS["angle"])
        arg_q = _pack_u16(record["arg_periapsis_deg"], *ANGLE_BOUNDS["angle"])
        ma_q = _pack_u16(record["mean_anomaly_deg"], *ANGLE_BOUNDS["angle"])
        albedo_q = _pack_u16(record["albedo"], *ANGLE_BOUNDS["albedo"])
        taxonomy = int(record["taxonomy_index"])
        if taxonomy < 0:
            taxonomy = 0
        elif taxonomy > 255:
            taxonomy = 255

        payload.extend(struct.pack(
            "<IffHHHHHffHBBH",
            _pack_source_id(record["source_id"]),
            float(record["epoch_jd"]),
            float(record["a_au"]),
            e_q,
            i_q,
            asc_q,
            arg_q,
            ma_q,
            float(record["period_days"]),
            float(record["diameter_km"]),
            albedo_q,
            taxonomy,
            0,
            0
        ))

    return header + payload


def _write_meta(
    meta_path: Path,
    records: list[dict[str, float]],
    taxonomy_counts: dict[str, int],
    class_counts: dict[str, int],
    source_rows: int,
    checksum: str | None = None,
    checksum_sha256: str | None = None,
    warnings: list[str] | None = None,
) -> None:
    warnings = warnings or []
    payload = {
        "version": 1,
        "generated_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "description": "Phase-1 deterministic main-belt-oriented asteroid corpus.",
        "query": {
            "endpoint": SBDB_API_URL,
            "fields": SBDB_FIELDS.split(","),
            "sb_kind": "a",
            "sort": "-diameter",
            "limit": len(records),
            "filters": {
                "main_belt_class_whitelist": sorted(MAIN_BELT_CLASS_WHITELIST),
                "main_belt_au_min": MAIN_BELT_AU_MIN,
                "main_belt_au_max": MAIN_BELT_AU_MAX,
            },
        },
        "source_rows": source_rows,
        "stored_count": len(records),
        "record_layout": {
            "format": "acbf_v1",
            "fields": [
                "source_id",
                "epoch_jd",
                "a_au",
                "e",
                "i_deg",
                "ascending_node_deg",
                "arg_periapsis_deg",
                "mean_anomaly_deg",
                "period_days",
                "diameter_km",
                "albedo",
                "taxonomy_index",
            ],
            "header": {
                "magic": "ACBF",
                "version": ACBF_VERSION,
                "count_u32": True,
                "stride_bytes": ACBF_STRIDE_BYTES,
            },
        },
        "taxonomy_map": {
            "C": 0,
            "S": 1,
            "M": 2,
        },
        "counts": {
            "taxonomy": taxonomy_counts,
            "orbit_class": dict(sorted(class_counts.items(), key=lambda item: (-item[1], item[0]))),
        },
        "warnings": warnings,
    }
    if checksum is not None:
        payload["checksum"] = checksum
        payload["checksum_algorithm"] = "fnv1a32"
    if checksum_sha256 is not None:
        payload["checksum_sha256"] = checksum_sha256
        payload["checksum_algorithm_sha256"] = "sha256"

    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_dataset(output_dir: Path, limit: int, bin_name: str, meta_name: str) -> None:
    rows = _fetch_asteroids(limit)
    if not rows:
        raise RuntimeError("SBDB query returned zero asteroid rows")

    records, taxonomy_counts, class_counts = _build_records(rows)
    warnings: list[str] = []
    if len(records) < limit:
        warnings.append(
            f"Filtered dataset contains {len(records)} objects, below requested limit={limit}."
            " Non-belt rows were excluded."
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    bin_path = output_dir / bin_name
    meta_path = output_dir / meta_name

    binary = _pack_binary(records)
    bin_path.parent.mkdir(parents=True, exist_ok=True)
    bin_path.write_bytes(binary)
    checksum_sha256 = hashlib.sha256(binary).hexdigest()
    checksum_fnv = 0x811C9DC5
    for byte in binary:
        checksum_fnv ^= byte
        checksum_fnv = (checksum_fnv * 0x01000193) % (1 << 32)
    checksum_fnv_hex = f"0x{checksum_fnv:08x}"
    _write_meta(
        meta_path,
        records,
        taxonomy_counts,
        class_counts,
        source_rows=len(rows),
        checksum=checksum_fnv_hex,
        checksum_sha256=checksum_sha256,
        warnings=warnings,
    )

    output_dir.joinpath("sample_top_10.json").write_text(
        json.dumps(records[:10], indent=2), encoding="utf-8"
    )

    print(f"[phase1] Built: {bin_path.relative_to(PROJECT_ROOT)} ({len(records):,} records)")
    if warnings:
        for warning in warnings:
            print(f"[phase1] warning: {warning}")
    print(f"[phase1] Metadata: {meta_path.relative_to(PROJECT_ROOT)}")
    print(f"[phase1] Taxonomy counts: {taxonomy_counts}")
    print(f"[phase1] Orbit class sample: {dict(list(class_counts.items())[:10])}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build phase-1 deterministic asteroid dataset")
    parser.add_argument("--limit", type=int, default=100_000, help="Top N asteroids by diameter")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Output directory")
    parser.add_argument("--bin-name", type=str, default=DEFAULT_BIN_NAME, help="Binary filename")
    parser.add_argument("--meta-name", type=str, default=DEFAULT_META_NAME, help="Metadata filename")
    parser.add_argument("--dry-run", action="store_true", help="Validate query only; don't write artifacts")

    args = parser.parse_args()

    if args.limit <= 0:
        raise ValueError("--limit must be > 0")

    if args.dry_run:
        probe_limit = min(args.limit, 10)
        rows = _fetch_asteroids(probe_limit, initial_fetch_limit=probe_limit)
        print(f"[phase1] dry-run OK (query works, got {len(rows)} sample rows)")
        return

    build_dataset(args.output_dir, args.limit, args.bin_name, args.meta_name)


if __name__ == "__main__":
    main()
