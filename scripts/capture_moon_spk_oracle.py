"""Capture/check seven independent S/2025 U 1 states without a 2 GB download.

Only original DAF metadata, type-2 directories and the records needed for the
declared epochs are retained. CSPICE evaluates an ephemeral sparse file; that
file is NOT a complete kernel and must never be published/reused as one.
Format references: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/daf.html
and https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html (type 2).
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import tempfile
import urllib.request

import numpy as np
import spiceypy as spice

URL = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/ura184_part-2.bsp"
JDS = [2451545.0, 2451575.0, 2451725.0, 2451910.25, 2453371.25, 2460676.5, 2461327.5]
TARGET, CENTER = 75052, 799
AU_KM = 149597870.7
BYTE_BUDGET = 1024 * 1024


def capture() -> dict:
    ranges: dict[tuple[int, int], dict] = {}
    total_size = None
    modified = None

    def fetch(offset: int, count: int) -> bytes:
        nonlocal total_size, modified
        if (offset, count) in ranges:
            return base64.b64decode(ranges[offset, count]["base64"])
        if offset < 0 or count <= 0 or sum(x[1] for x in ranges) + count > BYTE_BUDGET:
            raise ValueError("SPK byte-range budget exceeded")
        req = urllib.request.Request(URL, headers={"Range": f"bytes={offset}-{offset+count-1}",
                                                  "Accept-Encoding": "identity"})
        with urllib.request.urlopen(req, timeout=10) as response:
            expected = f"bytes {offset}-{offset+count-1}/"
            content_range = response.headers.get("Content-Range", "")
            if response.status != 206 or not content_range.startswith(expected):
                raise ValueError("provider did not honor the exact byte range")
            size = int(content_range[len(expected):])
            last_modified = response.headers.get("Last-Modified")
            if total_size is not None and (size != total_size or last_modified != modified):
                raise ValueError("SPK source changed during acquisition")
            total_size, modified = size, last_modified
            data = response.read(count + 1)
            if len(data) != count:
                raise ValueError("truncated or oversized SPK range")
        ranges[offset, count] = {"offset": offset, "length": count,
                                "sha256": hashlib.sha256(data).hexdigest(),
                                "base64": base64.b64encode(data).decode("ascii")}
        return data

    header = fetch(0, 1024)
    if header[:8] != b"DAF/SPK " or header[88:96] != b"LTL-IEEE":
        raise ValueError("unsupported SPK byte order or identification")
    if struct.unpack_from("<ii", header, 8) != (2, 6):
        raise ValueError("unexpected SPK summary layout")
    record = struct.unpack_from("<i", header, 76)[0]
    visited = set()
    segments = []
    while record:
        if record in visited or len(visited) >= 100:
            raise ValueError("invalid/cyclic DAF summary chain")
        visited.add(record)
        raw = fetch((record - 1) * 1024, 2048)  # summary and its name record
        following, previous, count = struct.unpack_from("<ddd", raw)
        if count != int(count) or not 0 <= count <= 25:
            raise ValueError("invalid DAF summary count")
        for index in range(int(count)):
            values = struct.unpack_from("<ddiiiiii", raw, 24 + index * 40)
            start, end, target, center, frame, kind, first, last = values
            if target not in (TARGET, CENTER):
                continue
            if center != 7 or frame != 1 or kind != 2:
                raise ValueError("unexpected target center/frame/SPK type")
            relevant = [(jd - 2451545.0) * 86400 for jd in JDS if start <= (jd - 2451545.0) * 86400 <= end]
            if not relevant:
                continue
            initial, interval, record_size, number = struct.unpack("<dddd", fetch((last - 4) * 8, 32))
            if interval <= 0 or record_size != int(record_size) or number != int(number):
                raise ValueError("invalid type-2 directory")
            record_size, number = int(record_size), int(number)
            if number <= 0 or record_size < 5 or (record_size-2) % 3 or last-first+1 != record_size*number+4:
                raise ValueError("type-2 directory disagrees with segment bounds")
            for epoch in relevant:
                index = min(number - 1, max(0, math.floor((epoch - initial) / interval)))
                payload = fetch((first - 1 + index * record_size) * 8, record_size * 8)
                midpoint, radius = struct.unpack_from("<dd", payload)
                if not radius > 0 or not midpoint-radius <= epoch <= midpoint+radius:
                    raise ValueError("requested epoch not covered by captured coefficient record")
            segments.append({"target": target, "center": center, "frame": frame, "type": kind,
                             "startEt": start, "endEt": end, "firstWord": first, "lastWord": last})
        record = int(following)
    for target in (TARGET, CENTER):
        for jd in JDS:
            et = (jd - 2451545.0) * 86400
            if not any(s["target"] == target and s["startEt"] <= et <= s["endEt"] for s in segments):
                raise ValueError(f"missing independent segment for {target} at {jd}")
    return {"schema": "bounded_spk_samples_v1", "capturedAtUtc": datetime.now(timezone.utc).isoformat(),
            "kernel": {"url": URL, "byteLength": total_size, "lastModified": modified,
                       "completeKernelDownloaded": False},
            "target": TARGET, "center": CENTER, "frame": "ECLIPJ2000", "corrections": "NONE",
            "timeScale": "TDB", "positionUnits": "AU", "velocityUnits": "AU/day",
            "jds": JDS, "segments": segments, "ranges": list(ranges.values()),
            "downloadedBytes": sum(x[1] for x in ranges), "byteBudget": BYTE_BUDGET}


def evaluate(captured: dict) -> list[dict]:
    if captured["target"] != TARGET or captured["center"] != CENTER or captured["jds"] != JDS:
        raise ValueError("this sparse capture may only evaluate its declared target/epochs")
    with tempfile.TemporaryDirectory(prefix="solar-spk-samples-") as temporary:
        kernel = Path(temporary) / "INCOMPLETE_DO_NOT_REUSE.bsp"
        with kernel.open("wb") as handle:
            handle.truncate(captured["kernel"]["byteLength"])
            for entry in captured["ranges"]:
                data = base64.b64decode(entry["base64"], validate=True)
                if len(data) != entry["length"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                    raise ValueError("captured original SPK bytes failed integrity check")
                handle.seek(entry["offset"])
                handle.write(data)
        # Evaluate only the explicitly captured segments. SPKGEO is not safe on
        # this incomplete file: its automatic center-chain search can select
        # uncaptured planetary-barycenter records even when both desired
        # vectors have the same known center (7).
        kernel_handle = spice.dafopr(str(kernel))
        try:
            rows = []
            for jd in JDS:
                et = (jd - 2451545.0) * 86400
                states = []
                for target in (TARGET, CENTER):
                    segment = next(s for s in reversed(captured["segments"])
                                   if s["target"] == target and s["startEt"] <= et <= s["endEt"])
                    descriptor = spice.dafps(2, 6,
                        [segment["startEt"], segment["endEt"]],
                        [target, segment["center"], segment["frame"], segment["type"],
                         segment["firstWord"], segment["lastWord"]])
                    frame, vector, center = spice.spkpvn(kernel_handle, descriptor[:5], et)
                    if frame != 1 or center != 7:
                        raise ValueError("CSPICE returned an unexpected frame or center")
                    states.append(vector)
                state = spice.sxform("J2000", "ECLIPJ2000", et) @ (states[0] - states[1])
                rows.append({"jdTdb": jd, "positionAu": (state[:3] / AU_KM).tolist(),
                             "velocityAuDay": (state[3:] * 86400 / AU_KM).tolist()})
            return rows
        finally:
            spice.dafcls(kernel_handle)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", action="store_true")
    parser.add_argument("--fixture", type=Path, default=Path(__file__).resolve().parents[1] / "backend/tests/fixtures/uranus_75052_spk_capture.json")
    args = parser.parse_args()
    if args.capture:
        data = capture()
        data["software"] = {"spiceypy": spice.__version__, "cspice": spice.tkvrsn("TOOLKIT")}
        data["states"] = evaluate(data)
        with args.fixture.open("x", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
            handle.write("\n")
    else:
        data = json.loads(args.fixture.read_text(encoding="utf-8"))
        actual = evaluate(data)
        for expected, result in zip(data["states"], actual, strict=True):
            assert expected["jdTdb"] == result["jdTdb"]
            np.testing.assert_allclose(result["positionAu"], expected["positionAu"], rtol=1e-13, atol=1e-15)
            np.testing.assert_allclose(result["velocityAuDay"], expected["velocityAuDay"], rtol=1e-13, atol=1e-15)
    print(json.dumps({"passed": True, "target": TARGET, "center": CENTER,
                      "samples": len(data["states"]), "downloadedBytes": data["downloadedBytes"],
                      "completeKernelDownloaded": False}))


if __name__ == "__main__":
    main()
