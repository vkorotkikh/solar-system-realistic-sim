from __future__ import annotations

import gzip
import hashlib
import importlib
import io
import json
from pathlib import Path
from typing import Any, Callable

import numpy as np
from astropy.io import fits


FIXTURE_DIR = Path(__file__).parent / "fixtures/gong/synthetic-v1"
MANIFEST = json.loads((FIXTURE_DIR / "manifest.json").read_text())
COMPRESSED = (FIXTURE_DIR / MANIFEST["filename"]).read_bytes()
EXPANDED = gzip.decompress(COMPRESSED)


def gong_module():
    return importlib.import_module("sim.gong_magnetogram")


def context(**updates: Any):
    gong = gong_module()
    values = {
        "request_jd_tdb": 2_461_309.5,
        "source_url": (
            "https://gong.nso.edu/data/magmap/QR/zqs/202609/"
            "mrzqs260925/mrzqs260925t2304c2316_301.fits.gz"
        ),
        "filename": MANIFEST["filename"],
        "compressed_sha256": hashlib.sha256(COMPRESSED).hexdigest(),
        "retrieved_at_utc": "2026-09-26T00:00:00Z",
        "retrieval_timeout_s": 6.0,
    }
    values.update(updates)
    return gong.GongParseContext(**values)


def rewrite_fits(
    *,
    header_updates: dict[str, Any] | None = None,
    delete_keys: tuple[str, ...] = (),
    mutate_raw: Callable[[np.ndarray], None] | None = None,
    data: np.ndarray | None = None,
    extra_hdu: bool = False,
) -> bytes:
    with fits.open(
        io.BytesIO(EXPANDED),
        memmap=False,
        do_not_scale_image_data=True,
        uint=False,
    ) as hdul:
        native = np.array(hdul[0].data, copy=True) if data is None else np.array(data, copy=True)
        header = hdul[0].header.copy()
    for key in ("CHECKSUM", "DATASUM"):
        header.pop(key, None)
    if data is not None and data.dtype.kind == "f":
        for key in ("BSCALE", "BZERO", "BLANK"):
            header.pop(key, None)
    for key in delete_keys:
        header.pop(key, None)
    if header_updates:
        for key, value in header_updates.items():
            header[key] = value
    if mutate_raw is not None:
        mutate_raw(native)
    # PrimaryHDU deliberately removes inherited scaling cards when new data is
    # attached.  Reapply the native on-disk interpretation after construction
    # so header-only mutations remain scaled integer FITS images.
    scaling = {key: header[key] for key in ("BSCALE", "BZERO", "BLANK") if key in header}
    primary = fits.PrimaryHDU(native, header=header)
    for key, value in scaling.items():
        primary.header[key] = value
    hdus: list[fits.hdu.base.ExtensionHDU | fits.PrimaryHDU] = [primary]
    if extra_hdu:
        hdus.append(fits.ImageHDU(np.zeros((1, 1), dtype=np.int16)))
    output = io.BytesIO()
    fits.HDUList(hdus).writeto(output, checksum=True)
    return output.getvalue()
