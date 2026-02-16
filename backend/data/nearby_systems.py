"""
Nearby star system catalog access.

Phase 1 source of truth:
  solar-systems/nearby_star_systems_ranked_full.csv
"""

from __future__ import annotations

import csv
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = PROJECT_ROOT / "solar-systems" / "nearby_star_systems_ranked_full.csv"
CATALOG_NAME = "J/A+A/650/A201 tablea1"
NEARBY_SYSTEMS_SCHEMA_NAME = "nearby_systems_catalog"
NEARBY_SYSTEMS_SCHEMA_VERSION = "1.2.0"


def _to_int(value: str | None) -> int | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return int(text)
    except (TypeError, ValueError):
        return None


def _to_float(value: str | None) -> float | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


@lru_cache(maxsize=1)
def load_nearby_systems_catalog() -> list[dict[str, Any]]:
    """Load the ranked nearby-system catalog from disk once per process."""
    if not CATALOG_PATH.exists():
        return []

    rows: list[dict[str, Any]] = []
    with CATALOG_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rank = _to_int(row.get("rank"))
            sys_id = _to_int(row.get("sys_id"))
            parallax_mas = _to_float(row.get("parallax_mas"))
            ra_deg = _to_float(row.get("ra_deg"))
            dec_deg = _to_float(row.get("dec_deg"))
            if rank is None or sys_id is None:
                continue
            if parallax_mas is None or parallax_mas <= 0:
                continue
            if ra_deg is None or dec_deg is None:
                continue

            rows.append(
                {
                    "rank": rank,
                    "sys_id": sys_id,
                    "seq": _to_int(row.get("seq")),
                    "catalog_name": (row.get("catalog_name") or "").strip(),
                    "identifier": (row.get("identifier") or "").strip(),
                    "obj_type": (row.get("obj_type") or "").strip(),
                    "distance_ly": _to_float(row.get("distance_ly")),
                    "distance_pc": _to_float(row.get("distance_pc")),
                    "parallax_mas": parallax_mas,
                    "ra_deg": ra_deg,
                    "dec_deg": dec_deg,
                    "epoch_year": _to_float(row.get("epoch_year")),
                    "pm_ra_mas_per_yr": _to_float(row.get("pm_ra_mas_per_yr")),
                    "pm_dec_mas_per_yr": _to_float(row.get("pm_dec_mas_per_yr")),
                    "rv_km_s": _to_float(row.get("rv_km_s")),
                    "spectral_type": (row.get("spectral_type") or "").strip(),
                    "gmag": _to_float(row.get("gmag")),
                }
            )

    rows.sort(key=lambda item: item["rank"])
    return rows


def query_nearby_systems(
    *,
    limit: int | None = None,
    max_distance_ly: float | None = None,
) -> list[dict[str, Any]]:
    """
    Return nearby systems sorted by rank with simple filtering.
    """
    systems = load_nearby_systems_catalog()

    if max_distance_ly is not None:
        systems = [
            item
            for item in systems
            if item.get("distance_ly") is not None and item["distance_ly"] <= max_distance_ly
        ]

    if limit is not None:
        systems = systems[: max(0, limit)]

    return systems


def _normalize_lookup_token(value: str) -> str:
    text = value.strip().lower().replace("_", " ").replace("-", " ")
    text = re.sub(r"[^a-z0-9\s]+", " ", text)
    return " ".join(text.split())


def nearby_system_aliases(system: dict[str, Any]) -> list[str]:
    aliases = []
    for candidate in (
        str(system.get("sys_id", "")).strip(),
        str(system.get("identifier", "")).strip(),
        str(system.get("catalog_name", "")).strip(),
    ):
        if not candidate:
            continue
        if candidate not in aliases:
            aliases.append(candidate)
    return aliases


@lru_cache(maxsize=1)
def _nearby_system_lookup_index() -> tuple[dict[int, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_sys_id: dict[int, dict[str, Any]] = {}
    by_alias: dict[str, dict[str, Any]] = {}

    for system in load_nearby_systems_catalog():
        sys_id = system.get("sys_id")
        if isinstance(sys_id, int):
            by_sys_id[sys_id] = system

        alias_values = nearby_system_aliases(system)
        for alias in alias_values:
            normalized = _normalize_lookup_token(alias)
            if not normalized:
                continue
            # Keep first match (lowest rank) for deterministic lookup.
            if normalized not in by_alias:
                by_alias[normalized] = system

    return by_sys_id, by_alias


def get_nearby_system(system_key: str | int) -> dict[str, Any] | None:
    by_sys_id, by_alias = _nearby_system_lookup_index()

    if isinstance(system_key, int):
        system = by_sys_id.get(system_key)
        return dict(system) if system is not None else None

    key_text = str(system_key).strip()
    if not key_text:
        return None

    try:
        key_int = int(key_text)
    except ValueError:
        key_int = None
    if key_int is not None:
        system = by_sys_id.get(key_int)
        if system is not None:
            return dict(system)

    normalized = _normalize_lookup_token(key_text)
    if not normalized:
        return None
    system = by_alias.get(normalized)
    return dict(system) if system is not None else None
