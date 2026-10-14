#!/usr/bin/env python3
"""Explicit bounded acquisition of REAL SBDB/Horizons responses for offline builds.

Requests are sequential (JPL fair-use policy), at most 60 seconds/64 MiB each.
Raw HTTP response bodies are retained verbatim inside deterministic gzip files.
No generated artifact is read, and no scientific response is fabricated.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from catalog_sources import SOURCE_DIR, json_bytes, publish_directory, request_url
from fetch_jpl_sbdb import SBDB_API_URL, phase1_query_params
import generate_moon_ephemeris as moon


def requests():
    yield SBDB_API_URL, phase1_query_params()
    for target in moon.TARGETS:
        for start in (moon.COVERAGE_START_JD, moon.COVERAGE_START_JD + target.source_step_days / 2):
            while start <= moon.COVERAGE_END_JD:
                stop = min(start + target.source_step_days * 19_999, moon.COVERAGE_END_JD)
                yield moon.HORIZONS_API_URL, moon._query_params(target, start, stop, target.source_step_days)
                start += target.source_step_days * 20_000


def capture(directory: Path, kind: str) -> None:
    manifest_path = directory / "manifest.json"
    manifest = json.loads(manifest_path.read_bytes()) if manifest_path.exists() else {
        "schemaVersion": 1, "responses": {},
    }
    for endpoint, params in requests():
        if kind == "asteroids" and endpoint != SBDB_API_URL:
            continue
        if kind == "moons" and endpoint == SBDB_API_URL:
            continue
        url = request_url(endpoint, params)
        key = hashlib.sha256(url.encode("ascii")).hexdigest()
        if key in manifest["responses"]:
            print(f"already pinned {key}", flush=True)
            continue
        print(f"capturing {url}", flush=True)
        result = subprocess.run([
            "curl", "--fail-with-body", "--silent", "--show-error",
            "--connect-timeout", "10", "--max-time", "60", "--max-filesize", "67108864",
            "--user-agent", "solar-catalog-source-capture/1", url,
        ], capture_output=True, timeout=65, check=False)
        if result.returncode:
            raise RuntimeError(f"bounded capture failed: {result.stderr.decode()} {result.stdout[:500]!r}")
        raw = result.stdout
        payload = json.loads(raw)
        if endpoint == SBDB_API_URL:
            if payload.get("signature", {}).get("source") != "NASA/JPL SBDB (Small-Body DataBase) Query API":
                raise ValueError(f"unexpected SBDB signature: {payload.get('signature')}")
            if len(payload.get("data", [])) != int(params["limit"]):
                raise ValueError("incomplete SBDB source population")
        elif payload.get("signature", {}).get("source") != "NASA/JPL Horizons API" or "$$EOE" not in payload.get("result", ""):
            raise ValueError("incomplete Horizons source response")
        manifest["responses"][key] = {
            "url": url, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
            "capturedUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "signature": payload["signature"],
        }
        # Each response and its manifest are published together. A later failed
        # capture retains earlier REAL inputs for a bounded, resumable retry.
        publish_directory(directory, {
            f"{key}.json.gz": gzip.compress(raw, mtime=0), "manifest.json": json_bytes(manifest),
        })
        print(f"pinned {key}: {len(raw):,} bytes", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--kind", choices=("all", "asteroids", "moons"), default="all")
    args = parser.parse_args()
    capture(args.source_dir, args.kind)
