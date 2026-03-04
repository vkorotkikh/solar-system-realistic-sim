#!/usr/bin/env python3
"""Build Phase-1 deterministic asteroid dataset artifacts.

This queries the JPL Small-Body Database for the largest asteroids,
packs the selected orbital/physical fields into a compact Float32 binary blob,
and writes compact JSON metadata.
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
    "X": TaxonomyMapping("C", 0),
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


def _fetch_asteroids(limit: int) -> list[dict[str, Any]]:
    def _fetch():
        return fetch_sbdb(sb_kind="a", sort="-diameter", limit=limit, cache_name=f"sbdb_phase1_diameter_{limit}")

    return load_or_fetch(
        PROJECT_ROOT / "scripts" / ".cache" / f"phase1_diameter_{limit}.json",
        _fetch,
        max_age_hours=24.0,
    )


def _build_records(rows: list[dict[str, Any]]) -> tuple[list[dict[str, float]], dict[str, int], dict[str, int]]:
    records: list[dict[str, float]] = []
    class_counts: dict[str, int] = {}
    taxonomy_counts: dict[str, int] = {"C": 0, "S": 0, "M": 0}

    for row in rows:
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


def _pack_binary(records: list[dict[str, float]]) -> bytes:
    stride = 11
    header = struct.pack("<4sBBBBI", b"ASPH", 1, stride, 0, 0, len(records))
    payload = []
    for record in records:
        payload.extend([
            record["epoch_jd"],
            record["a_au"],
            record["e"],
            record["i_deg"],
            record["ascending_node_deg"],
            record["arg_periapsis_deg"],
            record["mean_anomaly_deg"],
            record["period_days"],
            record["diameter_km"],
            record["albedo"],
            record["taxonomy_index"],
        ])

    return header + struct.pack(f"<{len(payload)}f", *payload)


def _write_meta(
    meta_path: Path,
    records: list[dict[str, float]],
    taxonomy_counts: dict[str, int],
    class_counts: dict[str, int],
    source_rows: int,
    checksum: str | None = None,
    checksum_sha256: str | None = None,
) -> None:
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
        },
        "source_rows": source_rows,
        "stored_count": len(records),
        "record_layout": {
            "format": "f11_le",
            "fields": [
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
                "magic": "ASPH",
                "version": 1,
                "count_u32": True,
                "stride_f32": 11,
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
        "warnings": [],
    }
    if checksum is not None:
        payload["checksum"] = checksum
        payload["checksum_algorithm"] = "fnv1a32"
    if checksum_sha256 is not None:
        payload["checksum_sha256"] = checksum_sha256
        payload["checksum_algorithm_sha256"] = "sha256"
        payload["checksum"] = f"0x{checksum[:8]}"

    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_dataset(output_dir: Path, limit: int, bin_name: str, meta_name: str) -> None:
    rows = _fetch_asteroids(limit)
    if not rows:
        raise RuntimeError("SBDB query returned zero asteroid rows")

    records, taxonomy_counts, class_counts = _build_records(rows)

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
        checksum_sha256=checksum_sha256
    )

    output_dir.joinpath("sample_top_10.json").write_text(
        json.dumps(records[:10], indent=2), encoding="utf-8"
    )

    print(f"[phase1] Built: {bin_path.relative_to(PROJECT_ROOT)} ({len(records):,} records)")
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
        rows = _fetch_asteroids(min(args.limit, 10))
        print(f"[phase1] dry-run OK (query works, got {len(rows)} sample rows)")
        return

    build_dataset(args.output_dir, args.limit, args.bin_name, args.meta_name)


if __name__ == "__main__":
    main()
