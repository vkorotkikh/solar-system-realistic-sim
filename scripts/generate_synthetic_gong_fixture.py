#!/usr/bin/env python3
"""Generate the compact, synthetic GONG-shaped FITS parser fixture.

This fixture proves parser mechanics only.  It contains no redistributed GONG
science pixels and is not evidence that a real GONG map is scientifically fit
for PFSS.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np
from astropy.io import fits


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend/tests/fixtures/gong/synthetic-v1"
FILENAME = "mrzqs260925t2304c2316_301.fits.gz"


def _raw_pixels() -> np.ndarray:
    count = 180 * 360
    flat = np.empty(count, dtype=np.int16)
    for index in range(count // 2):
        delta = 1 + index % 100
        flat[index] = 10 + delta
        flat[count - 1 - index] = 10 - delta
    return flat.reshape(180, 360)


def _header() -> dict[str, object]:
    return {
        "ORIGIN": "National Solar Observatory -- GONG",
        "OBS-SITE": "NSO/GONG NETWORK",
        "TELESCOP": "NSO-GONG",
        "DATE": "2026-09-25T23:04:00",
        "DATE-OBS": "2026-09-25",
        "TIME-OBS": "23:04",
        "CAR_ROT": 2316,
        "WCSNAME": "Carrington Cylin-equal-area",
        "CTYPE1": "CRLN-CEA",
        "CTYPE2": "CRLT-CEA",
        "CRPIX1": 180.5,
        "CRPIX2": 90.5,
        "CRVAL1": 121.0,
        "CRVAL2": 0.0,
        "PV2_1": 1.0,
        "CDELT1": 1.0,
        "CDELT2": 0.0111111,
        "WCSNAMEA": "Carrington-rotation Cylin-equal-area",
        "CTYPE1A": "CRN-CEA",
        "CTYPE2A": "CRLT-CEA",
        "CRPIX1A": 180.5,
        "CRPIX2A": 90.5,
        "CRVAL1A": 2315.663889,
        "CRVAL2A": 0.0,
        "PV2_1A": 1.0,
        "CDELT1A": -1.0 / 360.0,
        "CDELT2A": 0.0111111,
        "IMTYPE": "MAGNETIC",
        "LONG0": 301.0,
        "MMREL": "v3.3",
        "CARROT": 2316,
        "BUNIT": "Gauss",
        "LONGADJ": -0.3788347,
        "MAPL0": 1.0,
        "MAPEDGE": 301.0,
        "CREDGE": 2316.163889,
        "CRNOW": 2315.9982745,
        "CR60": 2315.9972222,
        "CRCENTER": 2315.6638889,
        "MAPNAME": "2316_301",
        "MAPDATE": "2026-09-25",
        "MAPTIME": "23:04",
        "FILELIST": "synthetic-no-provider-pixels",
        "BSCALE": 0.25,
        "BZERO": -2.5,
        "BLANK": -32768,
    }


def _build_expanded() -> bytes:
    hdu = fits.PrimaryHDU(_raw_pixels())
    for key, value in _header().items():
        hdu.header[key] = value
    # Astropy's writeto(checksum=True) embeds the current time in checksum-card
    # comments, changing the header and checksum on every run.  Fixed comments
    # keep both the expanded FITS and gzip container byte-reproducible.
    hdu.add_datasum(when="synthetic-v1")
    hdu.add_checksum(when="synthetic-v1", override_datasum=True)
    output = io.BytesIO()
    hdu.writeto(output)
    return output.getvalue()


def _sentinels() -> list[dict[str, float]]:
    points = [(0, 0), (58, 0), (59, 0), (359, 0), (179, 89),
              (180, 90), (0, 179), (359, 179)]
    result = []
    for x, y in points:
        mu = (y + 1.0 - 90.5) * 0.0111111
        result.append({
            "x": x,
            "y": y,
            "longitude_deg": (301.0 + x + 0.5) % 360.0,
            "latitude_deg": math.degrees(math.asin(mu)),
        })
    return result


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    expanded = _build_expanded()
    compressed = gzip.compress(expanded, compresslevel=9, mtime=0)
    (OUT / FILENAME).write_bytes(compressed)
    generator_sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    manifest = {
        "schema": "synthetic-gong-zqs-v1",
        "warning": "Synthetic parser fixture; contains no GONG science pixels.",
        "filename": FILENAME,
        "versions": {"astropy": "8.0.1"},
        "generator_sha256": generator_sha,
        "expanded_fits_sha256": hashlib.sha256(expanded).hexdigest(),
        "compressed_fits_sha256": hashlib.sha256(compressed).hexdigest(),
        "shape": [180, 360],
        "raw_pixel_rule": "paired int16 values 10+d and 10-d, d=1+(flat_index mod 100)",
        "header": _header(),
        "omitted_header_keys": ["CUNIT1", "CUNIT2", "LONPOLE", "TIMESYS"],
        "coordinate_sentinels": _sentinels(),
        "edge_sentinels": [
            {"x": -0.5, "y": 89.5, "longitude_deg": 301.0, "latitude_deg": 0.0},
            {"x": 359.5, "y": 89.5, "longitude_deg": 301.0, "latitude_deg": 0.0},
            {"x": -0.5, "y": -0.5, "longitude_deg": 301.0,
             "latitude_deg": -89.918971524797},
            {"x": -0.5, "y": 179.5, "longitude_deg": 301.0,
             "latitude_deg": 89.918971524797},
        ],
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
