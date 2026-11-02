#!/usr/bin/env python3
"""
Preview legacy JPL Small-Body Database additions without publishing sources.

Legacy source publication is retired: planets.js no longer exists, and catalog
sources must not be partially updated. Shared query helpers remain available to
capture_catalog_sources.py and build_asteroid_phase1_dataset.py. Use the latter
for validated offline preview or explicit --write artifact publication.

Usage:
  python scripts/fetch_jpl_sbdb.py --dry-run
  python scripts/fetch_jpl_sbdb.py --dry-run --limit 80 --neo-limit 20 --trojan-limit 15
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_utils import (
    CACHE_DIR,
    ensure_cache_dir,
    http_get_json,
    load_or_fetch,
    safe_float,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BODIES_PY_PATH = PROJECT_ROOT / "backend" / "data" / "bodies.py"
PLANETS_JS_PATH = PROJECT_ROOT / "src" / "data" / "planets.js"

SBDB_API_URL = "https://ssd-api.jpl.nasa.gov/sbdb_query.api"
SBDB_FIELDS = "spkid,full_name,H,diameter,albedo,e,a,i,om,w,ma,per,epoch,class,spec_B,spec_T"


def phase1_query_params() -> dict[str, str]:
    return {
        "fields": SBDB_FIELDS, "sb-kind": "a", "sb-class": "MBA,IMB,OMB",
        "sort": "-diameter,spkid", "limit": "100000", "full-prec": "true",
        "sb-cdata": json.dumps({"AND": ["a|GE|2", "a|LE|3.5", "diameter|GT|0"]}, separators=(",", ":")),
    }

# ── Taxonomy color mapping ──

TAXONOMY_COLORS = {
    "C": "#5a5a5a",   # carbonaceous, dark gray
    "B": "#6b6b75",   # similar to C, slightly blue
    "F": "#5e5e5a",   # similar to C
    "G": "#585858",   # similar to C
    "S": "#a09888",   # silicaceous, sandy
    "K": "#9a8e80",   # between S and C
    "L": "#8a8070",   # between S and C
    "M": "#8a8a8a",   # metallic, medium gray
    "V": "#9a8a7a",   # basaltic (Vesta-like)
    "E": "#b0b0a8",   # enstatite, bright
    "D": "#6e5a4a",   # dark, reddish
    "P": "#555050",   # primitive, very dark
    "T": "#605850",   # trojan-like
    "A": "#8a7a6a",   # olivine-rich
    "Q": "#9a9080",   # ordinary chondrite
    "R": "#8a6a5a",   # pyroxene-rich
    "X": "#7a7a7a",   # unknown/ambiguous
    "O": "#888078",   # other
}
DEFAULT_COLOR = "#7a7a72"


def spectral_to_color(spec_b: str | None, spec_t: str | None) -> str:
    """Get hex color from taxonomic classification."""
    for spec in [spec_t, spec_b]:
        if spec and isinstance(spec, str) and spec.strip():
            first = spec.strip()[0].upper()
            if first in TAXONOMY_COLORS:
                return TAXONOMY_COLORS[first]
    return DEFAULT_COLOR


# ── Name/ID utilities ──

def parse_name(full_name: str) -> tuple[str, str]:
    """Parse JPL full_name like '433 Eros (A898 PA)' into (display_name, id).

    Returns (display_name, body_id).
    """
    name = full_name.strip()
    # Remove parenthetical designations at end
    name = re.sub(r'\s*\([^)]*\)\s*$', '', name).strip()

    # Pattern: "number Name" or just "number designation"
    match = re.match(r'^(\d+)\s+(.+)$', name)
    if match:
        number = match.group(1)
        body_name = match.group(2).strip()
        # Check if body_name is a proper name (starts with uppercase letter)
        if body_name[0].isalpha() and body_name[0].isupper():
            display = f"{body_name} ({number})"
            body_id = sanitize_id(f"{body_name.lower()}-{number}")
        else:
            display = name
            body_id = sanitize_id(name)
        return display, body_id

    return name, sanitize_id(name)


def sanitize_id(name: str) -> str:
    """Convert name to a safe kebab-case ID."""
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = re.sub(r'^-|-$', '', s)
    return s


# ── Radius estimation from absolute magnitude ──

def estimate_radius_km(h_mag: float | None, diameter_km: float | None, albedo: float = 0.15) -> float:
    """Estimate radius from diameter or absolute magnitude H."""
    if diameter_km is not None and diameter_km > 0:
        return diameter_km / 2.0
    if h_mag is None or not math.isfinite(h_mag):
        return 5.0  # default small
    # r = 664.5 / sqrt(albedo) * 10^(-H/5)
    return 664.5 / math.sqrt(albedo) * (10.0 ** (-h_mag / 5.0))


def period_from_a(a_au: float) -> float:
    """Compute orbital period in days from semi-major axis (Kepler's 3rd law)."""
    return 365.25 * (a_au ** 1.5)


# ── SBDB API queries ──

def fetch_sbdb(
    sb_kind: str = "a",
    sb_class: str | None = None,
    sb_group: str | None = None,
    sort: str = "H",
    limit: int = 100,
    cache_name: str = "sbdb_query",
) -> list[dict]:
    """Query JPL SBDB Query API."""
    cache_path = CACHE_DIR / f"{cache_name}_full_precision_albedo.json"

    def _fetch():
        params: dict = {
            "fields": SBDB_FIELDS,
            "sb-kind": sb_kind,
            "sort": sort,
            "limit": str(limit),
            "full-prec": "true",
        }
        if sb_class:
            params["sb-class"] = sb_class.replace(":", ",")
        if sb_group:
            params["sb-group"] = sb_group
        print(f"  Querying JPL SBDB (kind={sb_kind}, class={sb_class or 'all'}, limit={limit})...")
        data = http_get_json(SBDB_API_URL, params=params, timeout=30.0)
        if "data" not in data or "fields" not in data:
            print(f"  Warning: Unexpected SBDB response structure")
            return []
        fields = [f.lower() for f in data["fields"]]
        rows = []
        for row_values in data["data"]:
            row = {}
            for i, field in enumerate(fields):
                row[field] = row_values[i] if i < len(row_values) else None
            rows.append(row)
        print(f"  Got {len(rows)} results")
        return rows

    return load_or_fetch(cache_path, _fetch, max_age_hours=168.0)


def fetch_top_asteroids(limit: int = 100) -> list[dict]:
    return fetch_sbdb(sb_kind="a", limit=limit, cache_name="sbdb_top_asteroids")


def fetch_notable_neos(limit: int = 30) -> list[dict]:
    return fetch_sbdb(
        sb_kind="a", sb_class="ATE:APO:AMO", sort="H", limit=limit,
        cache_name="sbdb_neos",
    )


def fetch_trojans(limit: int = 20) -> list[dict]:
    return fetch_sbdb(
        sb_kind="a", sb_class="TJN", sort="H", limit=limit,
        cache_name="sbdb_trojans",
    )


# ── Deduplication and processing ──

def get_existing_body_names(bodies_py_path: Path) -> set[str]:
    """Extract existing asteroid names/IDs from bodies.py to avoid duplicates."""
    if not bodies_py_path.exists():
        return set()
    content = bodies_py_path.read_text()
    names = set()
    # Match "id": "something" patterns
    for match in re.finditer(r'"id"\s*:\s*"([^"]+)"', content):
        names.add(match.group(1).lower())
    # Match "name": "something" patterns
    for match in re.finditer(r'"name"\s*:\s*"([^"]+)"', content):
        names.add(match.group(1).lower())
    return names


def process_sbdb_rows(
    rows: list[dict],
    existing_names: set[str],
    seen_spkids: set[str],
) -> list[dict]:
    """Convert SBDB rows to our internal format, skipping duplicates."""
    bodies = []
    for row in rows:
        spkid = str(row.get("spkid", ""))
        if spkid in seen_spkids:
            continue
        seen_spkids.add(spkid)

        full_name = row.get("full_name", "")
        if not full_name:
            continue

        display_name, body_id = parse_name(full_name)
        if body_id.lower() in existing_names or display_name.lower() in existing_names:
            continue

        a_au = safe_float(row.get("a"))
        e = safe_float(row.get("e"))
        i_deg = safe_float(row.get("i"))
        om = safe_float(row.get("om"))  # ascending node
        w = safe_float(row.get("w"))    # arg periapsis
        ma = safe_float(row.get("ma"))  # mean anomaly
        per = safe_float(row.get("per"))  # period in days
        epoch = safe_float(row.get("epoch"))
        h_mag = safe_float(row.get("h"))
        diameter = safe_float(row.get("diameter"))
        spec_b = row.get("spec_b")
        spec_t = row.get("spec_t")
        orbit_class = row.get("class", "")

        if a_au is None or e is None:
            continue

        radius_km = estimate_radius_km(h_mag, diameter)
        if per is None or per <= 0:
            per = period_from_a(a_au)
        if epoch is None:
            epoch = 2460000.5  # ~2023

        color = spectral_to_color(spec_b, spec_t)

        body_type = "asteroid"
        if radius_km > 400:
            body_type = "dwarf"

        bodies.append({
            "id": body_id,
            "name": display_name,
            "type": body_type,
            "mass_kg": None,
            "radius_km": round(radius_km, 2),
            "color": color,
            "orbit_class": orbit_class,
            "h_mag": h_mag,
            "orbit": {
                "epoch_jd": epoch,
                "a_au": round(a_au, 8),
                "e": round(e, 8),
                "i_deg": round(i_deg or 0, 6),
                "ascending_node_deg": round(om or 0, 6),
                "arg_periapsis_deg": round(w or 0, 6),
                "mean_anomaly_deg": round(ma or 0, 6),
                "period_days": round(per, 4),
            },
        })
    return bodies


# ── File modification ──

def _escape_py_str(value: str) -> str:
    """Escape a string for safe inclusion inside double quotes in Python source."""
    return json.dumps(value)[1:-1]


def generate_py_entry(body: dict) -> str:
    """Generate a Python dict literal for one asteroid body."""
    orbit = body["orbit"]
    mass_line = "None" if body["mass_kg"] is None else str(body["mass_kg"])
    safe_id = _escape_py_str(body['id'])
    safe_name = _escape_py_str(body['name'])
    safe_type = _escape_py_str(body['type'])
    return textwrap.dedent(f"""\
    {{
        "id": "{safe_id}",
        "name": "{safe_name}",
        "type": "{safe_type}",
        "mass_kg": {mass_line},
        "radius_km": {body['radius_km']},
        "orbit": {{
            "epoch_jd": {orbit['epoch_jd']},
            "a_au": {orbit['a_au']},
            "e": {orbit['e']},
            "i_deg": {orbit['i_deg']},
            "ascending_node_deg": {orbit['ascending_node_deg']},
            "arg_periapsis_deg": {orbit['arg_periapsis_deg']},
            "mean_anomaly_deg": {orbit['mean_anomaly_deg']},
            "period_days": {orbit['period_days']},
        }},
    }}""")


def _escape_js_str(value: str) -> str:
    """Escape a string for safe inclusion inside single quotes in JS source."""
    return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r")


def generate_js_entry(body: dict) -> str:
    """Generate a JS object literal for one asteroid body."""
    orbit = body["orbit"]
    mass_line = "null" if body["mass_kg"] is None else str(body["mass_kg"])
    safe_id = _escape_js_str(body['id'])
    safe_name = _escape_js_str(body['name'])
    safe_type = _escape_js_str(body['type'])
    safe_color = _escape_js_str(body['color'])
    return textwrap.dedent(f"""\
  {{
    id: '{safe_id}',
    name: '{safe_name}',
    type: '{safe_type}',
    massKg: {mass_line},
    radiusKm: {body['radius_km']},
    color: '{safe_color}',
    orbit: {{
      epochJd: {orbit['epoch_jd']},
      aAu: {orbit['a_au']},
      e: {orbit['e']},
      iDeg: {orbit['i_deg']},
      ascendingNodeDeg: {orbit['ascending_node_deg']},
      argPeriapsisDeg: {orbit['arg_periapsis_deg']},
      meanAnomalyDeg: {orbit['mean_anomaly_deg']},
      periodDays: {orbit['period_days']},
    }},
  }}""")


# ── Main ──

def main():
    parser = argparse.ArgumentParser(description="Preview legacy JPL SBDB additions; source publication is retired.",
        epilog="Use scripts/build_asteroid_phase1_dataset.py for validated offline preview, "
               "or add --write there to publish the maintained Phase-1 artifact bundle.")
    parser.add_argument("--limit", type=int, default=100, help="Top N asteroids by H magnitude")
    parser.add_argument("--neo-limit", type=int, default=30, help="Notable NEO count")
    parser.add_argument("--trojan-limit", type=int, default=20, help="Jupiter Trojan count")
    parser.add_argument("--dry-run", action="store_true", help="Required for legacy preview; may populate query caches, never source files")
    parser.add_argument("--write", action="store_true", help="Retired; use the maintained Phase-1 builder to publish")
    args = parser.parse_args()

    if args.write or not args.dry_run:
        parser.error("Legacy source publication is retired. Use --dry-run to preview additions, "
                     "or scripts/build_asteroid_phase1_dataset.py for validated offline preview "
                     "and explicit --write artifact publication.")

    ensure_cache_dir()

    print("=== JPL Small-Body Database Fetcher ===\n")

    # Step 1: Get existing body names to avoid duplicates
    existing_names = get_existing_body_names(BODIES_PY_PATH)
    print(f"  Existing named bodies: {len(existing_names)}")

    # Step 2: Fetch from SBDB
    print("\nStep 1: Fetching top asteroids by absolute magnitude...")
    top_asteroids = fetch_top_asteroids(limit=args.limit)

    print("\nStep 2: Fetching notable NEOs...")
    neos = fetch_notable_neos(limit=args.neo_limit)

    print("\nStep 3: Fetching Jupiter Trojans...")
    trojans = fetch_trojans(limit=args.trojan_limit)

    # Step 3: Process and deduplicate
    print("\nStep 4: Processing and deduplicating...")
    seen_spkids: set[str] = set()
    all_bodies = []
    all_bodies.extend(process_sbdb_rows(top_asteroids, existing_names, seen_spkids))
    all_bodies.extend(process_sbdb_rows(neos, existing_names, seen_spkids))
    all_bodies.extend(process_sbdb_rows(trojans, existing_names, seen_spkids))

    print(f"  New bodies to add: {len(all_bodies)}")

    # Categorize
    main_belt = [b for b in all_bodies if 1.7 < b["orbit"]["a_au"] < 4.0 and b["orbit_class"] not in ("TJN", "ATE", "APO", "AMO")]
    neo_bodies = [b for b in all_bodies if b["orbit_class"] in ("ATE", "APO", "AMO")]
    trojan_bodies = [b for b in all_bodies if b["orbit_class"] == "TJN"]
    other = [b for b in all_bodies if b not in main_belt and b not in neo_bodies and b not in trojan_bodies]

    print(f"    Main belt: {len(main_belt)}")
    print(f"    NEOs: {len(neo_bodies)}")
    print(f"    Trojans: {len(trojan_bodies)}")
    print(f"    Other: {len(other)}")

    print("\n=== Legacy preview - sample entries (source publication retired) ===")
    for body in all_bodies[:5]:
        print(f"\n  Python:\n{generate_py_entry(body)}")
        print(f"\n  JavaScript:\n{generate_js_entry(body)}")
    print(f"\n  (Showing 5 of {len(all_bodies)} entries)")


if __name__ == "__main__":
    main()
