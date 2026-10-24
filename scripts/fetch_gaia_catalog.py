#!/usr/bin/env python3
"""
Fetch Gaia DR3 star catalog for the Solar System Mission Lab.

Previews acquisition and catalog conversion by default; may contact TAP and
populate query caches. --save-fallback separately authorizes a fallback write.
Pass --write to publish:
  - src/data/stars_catalog.json   (bright sky stars, [ra, dec, mag, bv] tuples)
  - solar-systems/nearby_star_systems_ranked_full.csv  (enriched nearby systems)

Usage:
  python scripts/fetch_gaia_catalog.py
  python scripts/fetch_gaia_catalog.py --write --max-stars 5000 --min-parallax-mas 125
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import os
import sys
from pathlib import Path
from urllib.error import URLError

# Add scripts dir to path for local imports
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_utils import (
    CACHE_DIR,
    ensure_cache_dir,
    http_get,
    load_or_fetch,
    safe_float,
    safe_int,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STARS_JSON_PATH = PROJECT_ROOT / "src" / "data" / "stars_catalog.json"
NEARBY_CSV_PATH = PROJECT_ROOT / "solar-systems" / "nearby_star_systems_ranked_full.csv"
FALLBACK_DIR = Path(__file__).resolve().parent / "data"

ESA_TAP_URL = "https://gea.esac.esa.int/tap-server/tap/sync"
VIZIER_TAP_URL = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync"

# ── Gaia bp_rp to Johnson B-V conversion ──
# Empirical polynomial from Evans et al. (2018)
def bp_rp_to_bv(bp_rp: float) -> float:
    """Convert Gaia DR3 bp_rp color to Johnson B-V."""
    if bp_rp is None or not math.isfinite(bp_rp):
        return 0.65  # solar-like default
    bv = 0.0981 + 0.7687 * bp_rp - 0.0269 * bp_rp * bp_rp
    return max(-0.4, min(2.5, bv))


def _tap_request(adql: str) -> dict[str, str]:
    return {
        "REQUEST": "doQuery",
        "LANG": "ADQL",
        "FORMAT": "csv",
        "QUERY": adql,
    }


def _run_tap_request(request: dict[str, str], tap_url: str, timeout: float = 120.0) -> str:
    return http_get(tap_url, params=request, timeout=timeout)


def _run_tap_query(adql: str, tap_url: str = ESA_TAP_URL, timeout: float = 120.0) -> str:
    """Execute a synchronous TAP/ADQL query, return CSV text."""
    return _run_tap_request(_tap_request(adql), tap_url, timeout)


def _gaia_query_cache_path(
    kind: str, request: dict[str, str], endpoints: tuple[str, ...], *, schema: int,
) -> Path:
    identity = {"schema": schema, "kind": kind, "request": request, "endpoints": endpoints}
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return CACHE_DIR / f"gaia_{kind}_stars_query_v{schema}_{digest}.json"


def _parse_gaia_source_id(value: object) -> int | None:
    """Keep exact integer identities; floats may already have lost digits."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _parse_gaia_csv(csv_text: str) -> list[dict]:
    """Parse Gaia TAP CSV with exact source IDs and floating-point measurements."""
    rows = []
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        parsed = {}
        for key, val in row.items():
            key = key.strip().lower()
            parsed[key] = _parse_gaia_source_id(val) if key == "source_id" else safe_float(val)
        rows.append(parsed)
    return rows


def _bright_stars_query(max_mag: float) -> str:
    return f"""
    SELECT ra, dec, phot_g_mean_mag, bp_rp, parallax, pmra, pmdec
    FROM gaiadr3.gaia_source
    WHERE phot_g_mean_mag IS NOT NULL
      AND phot_g_mean_mag < {max_mag}
      AND parallax IS NOT NULL
      AND parallax > 0
      AND bp_rp IS NOT NULL
    ORDER BY phot_g_mean_mag ASC
    """.strip()


def _nearby_stars_query(min_parallax_mas: float) -> str:
    return f"""
    SELECT source_id, ra, dec, parallax, parallax_error, pmra, pmdec,
           radial_velocity, phot_g_mean_mag, bp_rp
    FROM gaiadr3.gaia_source
    WHERE parallax > {min_parallax_mas}
      AND parallax_over_error > 5
    ORDER BY parallax DESC
    """.strip()


def fetch_bright_stars_tap(
    max_mag: float = 7.5,
    tap_url: str = ESA_TAP_URL,
    timeout: float = 120.0,
) -> list[dict]:
    """Fetch bright stars from Gaia DR3 via TAP."""
    csv_text = _run_tap_query(_bright_stars_query(max_mag), tap_url=tap_url, timeout=timeout)
    return _parse_gaia_csv(csv_text)


def fetch_nearby_stars_tap(
    min_parallax_mas: float = 100.0,
    tap_url: str = ESA_TAP_URL,
    timeout: float = 120.0,
) -> list[dict]:
    """Fetch nearby stars (large parallax) from Gaia DR3 via TAP."""
    csv_text = _run_tap_query(_nearby_stars_query(min_parallax_mas), tap_url=tap_url, timeout=timeout)
    return _parse_gaia_csv(csv_text)


def fetch_bright_stars(max_mag: float = 7.5) -> list[dict]:
    """Fetch bright stars with TAP fallback chain: ESA -> VizieR -> static fallback."""
    request = _tap_request(_bright_stars_query(max_mag))
    endpoints = (ESA_TAP_URL, VIZIER_TAP_URL)
    cache_path = _gaia_query_cache_path("bright", request, endpoints, schema=2)

    def _fetch():
        # Try ESA TAP
        for label, url in zip(("ESA Gaia Archive", "VizieR TAP mirror"), endpoints):
            try:
                print(f"  Querying {label} for bright stars (mag < {max_mag})...")
                stars = _parse_gaia_csv(_run_tap_request(request, url))
                if stars:
                    print(f"  Got {len(stars)} stars from {label}")
                    return stars
            except (URLError, OSError) as exc:
                print(f"  {label} failed: {exc}")
                continue

        # Static fallback
        fallback_path = FALLBACK_DIR / "gaia_bright_stars_fallback.json"
        if fallback_path.exists():
            print(f"  Using static fallback ({fallback_path.name})")
            with open(fallback_path) as f:
                return json.load(f)

        raise RuntimeError("All TAP endpoints failed and no static fallback available")

    return load_or_fetch(cache_path, _fetch, max_age_hours=168.0)


def fetch_nearby_stars(min_parallax_mas: float = 100.0) -> list[dict]:
    """Fetch nearby stars with TAP fallback chain."""
    request = _tap_request(_nearby_stars_query(min_parallax_mas))
    endpoints = (ESA_TAP_URL, VIZIER_TAP_URL)
    # Both old nearby generations lack query provenance; leave them untouched.
    cache_path = _gaia_query_cache_path("nearby", request, endpoints, schema=3)

    def _fetch():
        for label, url in zip(("ESA Gaia Archive", "VizieR TAP mirror"), endpoints):
            try:
                print(f"  Querying {label} for nearby stars (parallax > {min_parallax_mas} mas)...")
                stars = _parse_gaia_csv(_run_tap_request(request, url))
                if stars:
                    print(f"  Got {len(stars)} nearby stars from {label}")
                    return stars
            except (URLError, OSError) as exc:
                print(f"  {label} failed: {exc}")
                continue
        print("  Warning: Could not fetch nearby stars from any TAP endpoint")
        return []

    return load_or_fetch(cache_path, _fetch, max_age_hours=168.0)


# ── Output: stars_catalog.json ──

def build_stars_catalog(gaia_stars: list[dict], max_stars: int = 12000) -> list[list[float]]:
    """Convert Gaia rows to [ra, dec, mag, bv] tuples."""
    catalog = []
    for star in gaia_stars:
        ra = star.get("ra")
        dec = star.get("dec")
        mag = star.get("phot_g_mean_mag")
        bp_rp = star.get("bp_rp")
        if ra is None or dec is None or mag is None:
            continue
        if not math.isfinite(ra) or not math.isfinite(dec) or not math.isfinite(mag):
            continue
        bv = bp_rp_to_bv(bp_rp)
        catalog.append([
            round(ra, 4),
            round(dec, 4),
            round(mag, 2),
            round(bv, 3),
        ])
    # Sort by magnitude (brightest first)
    catalog.sort(key=lambda x: x[2])
    return catalog[:max_stars]


def write_stars_catalog(catalog: list[list[float]], output_path: Path) -> None:
    """Write stars_catalog.json in compact format."""
    with open(output_path, "w") as f:
        f.write("[\n")
        for i, entry in enumerate(catalog):
            line = json.dumps(entry)
            if i < len(catalog) - 1:
                line += ","
            f.write(line + "\n")
        f.write("]\n")
    print(f"  Wrote {len(catalog)} stars to {output_path.relative_to(PROJECT_ROOT)}")


# ── Output: nearby_star_systems_ranked_full.csv ──

def load_existing_nearby_csv(csv_path: Path) -> list[dict[str, str]]:
    """Load existing nearby systems CSV."""
    if not csv_path.exists():
        return []
    with open(csv_path, "r", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def angular_separation_arcsec(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    """Great-circle angular separation in arcseconds."""
    ra1r, dec1r = math.radians(ra1), math.radians(dec1)
    ra2r, dec2r = math.radians(ra2), math.radians(dec2)
    cos_sep = (
        math.sin(dec1r) * math.sin(dec2r)
        + math.cos(dec1r) * math.cos(dec2r) * math.cos(ra1r - ra2r)
    )
    cos_sep = max(-1.0, min(1.0, cos_sep))
    return math.degrees(math.acos(cos_sep)) * 3600.0


def cross_match_nearby(
    existing_rows: list[dict[str, str]],
    gaia_nearby: list[dict],
    match_radius_arcsec: float = 5.0,
) -> list[dict[str, str]]:
    """Cross-match existing CSV with Gaia nearby stars. Update matched, append new."""
    # Track which Gaia entries were matched
    matched_gaia_indices = set()
    updated_rows = []

    for row in existing_rows:
        ra_existing = safe_float(row.get("ra_deg"))
        dec_existing = safe_float(row.get("dec_deg"))
        if ra_existing is None or dec_existing is None:
            updated_rows.append(row)
            continue

        best_idx = None
        best_sep = match_radius_arcsec + 1.0
        for i, gstar in enumerate(gaia_nearby):
            if i in matched_gaia_indices:
                continue
            gra = gstar.get("ra")
            gdec = gstar.get("dec")
            if gra is None or gdec is None:
                continue
            sep = angular_separation_arcsec(ra_existing, dec_existing, gra, gdec)
            if sep < best_sep:
                best_sep = sep
                best_idx = i

        if best_idx is not None and best_sep < match_radius_arcsec:
            matched_gaia_indices.add(best_idx)
            gstar = gaia_nearby[best_idx]
            # Enrich with Gaia data where available
            if gstar.get("parallax") is not None:
                row["parallax_mas"] = f"{gstar['parallax']:.4f}"
                plx_arcsec = gstar["parallax"] / 1000.0
                if plx_arcsec > 0:
                    dist_pc = 1.0 / plx_arcsec
                    row["distance_pc"] = f"{dist_pc:.4f}"
                    row["distance_ly"] = f"{dist_pc * 3.26156:.4f}"
            if gstar.get("pmra") is not None:
                row["pm_ra_mas_per_yr"] = f"{gstar['pmra']:.4f}"
            if gstar.get("pmdec") is not None:
                row["pm_dec_mas_per_yr"] = f"{gstar['pmdec']:.4f}"
            if gstar.get("radial_velocity") is not None:
                row["rv_km_s"] = f"{gstar['radial_velocity']:.2f}"
            if gstar.get("phot_g_mean_mag") is not None:
                row["gmag"] = f"{gstar['phot_g_mean_mag']:.3f}"

        updated_rows.append(row)

    # Append unmatched Gaia entries as new rows
    max_rank = max((safe_int(r.get("rank"), 0) for r in existing_rows), default=0)
    max_sys_id = max((safe_int(r.get("sys_id"), 0) for r in existing_rows), default=0)
    new_count = 0

    for i, gstar in enumerate(gaia_nearby):
        if i in matched_gaia_indices:
            continue
        plx = gstar.get("parallax")
        if plx is None or plx <= 0:
            continue
        ra = gstar.get("ra")
        dec = gstar.get("dec")
        if ra is None or dec is None:
            continue

        dist_pc = 1.0 / (plx / 1000.0)
        dist_ly = dist_pc * 3.26156
        max_rank += 1
        max_sys_id += 1
        new_count += 1

        source_id = _parse_gaia_source_id(gstar.get("source_id"))
        identifier = f"Gaia DR3 {source_id}" if source_id else f"Gaia-nearby-{max_sys_id}"
        gmag = gstar.get("phot_g_mean_mag")

        new_row = {
            "rank": str(max_rank),
            "sys_id": str(max_sys_id),
            "seq": "1",
            "catalog_name": identifier,
            "identifier": identifier,
            "obj_type": "LM",
            "distance_ly": f"{dist_ly:.4f}",
            "distance_pc": f"{dist_pc:.4f}",
            "parallax_mas": f"{plx:.4f}",
            "ra_deg": f"{ra:.6f}",
            "dec_deg": f"{dec:.6f}",
            "epoch_year": "2016.0",
            "pm_ra_mas_per_yr": f"{gstar.get('pmra', 0.0):.4f}" if gstar.get("pmra") is not None else "",
            "pm_dec_mas_per_yr": f"{gstar.get('pmdec', 0.0):.4f}" if gstar.get("pmdec") is not None else "",
            "rv_km_s": f"{gstar['radial_velocity']:.2f}" if gstar.get("radial_velocity") is not None else "",
            "spectral_type": "",
            "gmag": f"{gmag:.3f}" if gmag is not None else "",
        }
        updated_rows.append(new_row)

    if new_count > 0:
        print(f"  Added {new_count} new nearby systems from Gaia DR3")
    matched_count = len(matched_gaia_indices)
    if matched_count > 0:
        print(f"  Enriched {matched_count} existing entries with Gaia parallaxes/proper motions")

    return updated_rows


CSV_FIELDNAMES = [
    "rank", "sys_id", "seq", "catalog_name", "identifier", "obj_type",
    "distance_ly", "distance_pc", "parallax_mas", "ra_deg", "dec_deg",
    "epoch_year", "pm_ra_mas_per_yr", "pm_dec_mas_per_yr", "rv_km_s",
    "spectral_type", "gmag",
]


def write_nearby_csv(rows: list[dict[str, str]], output_path: Path) -> None:
    """Write updated nearby systems CSV."""
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    print(f"  Wrote {len(rows)} systems to {output_path.relative_to(PROJECT_ROOT)}")


# ── Static fallback generation ──

def save_static_fallback(stars: list[dict], max_entries: int = 2000) -> None:
    """Save a static fallback dataset for when TAP is unavailable."""
    fallback_path = FALLBACK_DIR / "gaia_bright_stars_fallback.json"
    FALLBACK_DIR.mkdir(parents=True, exist_ok=True)
    subset = stars[:max_entries]
    with open(fallback_path, "w") as f:
        json.dump(subset, f)
    print(f"  Saved static fallback ({len(subset)} stars) to {fallback_path.relative_to(PROJECT_ROOT)}")


# ── Main ──

def main():
    parser = argparse.ArgumentParser(description="Preview Gaia DR3 catalog acquisition and conversion; may contact TAP and populate query caches. Pass --write to publish catalogs.")
    parser.add_argument("--write", action="store_true", help="publish the generated star catalog and enriched nearby systems CSV")
    parser.add_argument("--max-stars", type=int, default=12000, help="Max stars for sky catalog")
    parser.add_argument("--max-mag", type=float, default=7.5, help="Magnitude limit for bright stars")
    parser.add_argument("--min-parallax-mas", type=float, default=100.0, help="Minimum parallax for nearby systems")
    parser.add_argument("--match-radius", type=float, default=5.0, help="Cross-match radius in arcseconds")
    parser.add_argument("--save-fallback", action="store_true", help="Save static fallback dataset")
    args = parser.parse_args()

    ensure_cache_dir()

    print("=== Gaia DR3 Star Catalog Fetcher ===\n")

    # Step 1: Fetch bright stars
    print("Step 1: Fetching bright stars...")
    bright_stars = fetch_bright_stars(max_mag=args.max_mag)
    print(f"  Total bright stars available: {len(bright_stars)}")

    # Save fallback only when separately requested
    if args.save_fallback and bright_stars:
        save_static_fallback(bright_stars)

    # Step 2: Build stars_catalog.json and publish only when requested
    print("\nStep 2: Building stars_catalog.json...")
    catalog = build_stars_catalog(bright_stars, max_stars=args.max_stars)
    if args.write:
        write_stars_catalog(catalog, STARS_JSON_PATH)

    # Step 3: Fetch nearby stars
    print("\nStep 3: Fetching nearby stars...")
    nearby_stars = fetch_nearby_stars(min_parallax_mas=args.min_parallax_mas)

    # Step 4: Cross-match and enrich nearby CSV
    print("\nStep 4: Cross-matching with existing nearby systems CSV...")
    existing_rows = load_existing_nearby_csv(NEARBY_CSV_PATH)
    print(f"  Existing CSV rows: {len(existing_rows)}")

    if nearby_stars:
        final_rows = cross_match_nearby(
            existing_rows, nearby_stars, match_radius_arcsec=args.match_radius
        )
        if args.write:
            write_nearby_csv(final_rows, NEARBY_CSV_PATH)
    else:
        final_rows = existing_rows
        print("  No Gaia nearby data available; CSV unchanged")

    print("\n=== Done ===")
    print(f"  Stars catalog: {len(catalog)} entries")
    print(f"  Nearby systems: {len(final_rows)} entries")
    if not args.write:
        print("  Preview only; pass --write to publish catalogs. Query caches and explicitly requested fallback files may still be written.")


if __name__ == "__main__":
    main()
