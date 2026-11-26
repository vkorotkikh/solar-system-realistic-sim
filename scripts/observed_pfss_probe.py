#!/usr/bin/env python3
"""Fetch the newest NSO/GONG synoptic map, solve its potential field and write the observed-PFSS sidecar.

Stage A1 of "Today's Sun" (ADR 0009). The backend route GET /solar/observed/pfss
serves the file this writes. No server and no browser are needed to run it.
"""
from __future__ import annotations

import argparse
import functools
import gzip
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import TextIO

# Ahead of the backend imports, so the script runs from the repository root with no PYTHONPATH.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sim import gong_magnetogram as gong  # noqa: E402
from sim import observed_pfss_sidecar as sidecar  # noqa: E402
from sim.solar_time import current_jd_tdb  # noqa: E402
from solar_delivery import MAX_DECODED_BYTES, MAX_ENCODED_BYTES  # noqa: E402

PROGRAM = "observed_pfss_probe"
SIDECAR_VARIABLE = "SOLAR_OBSERVED_PFSS_SIDECAR"
FRONTEND_FLAG = "VITE_SOLAR_OBSERVED_PFSS"

EXIT_WRITTEN = 0
EXIT_UNEXPECTED = 1
EXIT_USAGE = 2
EXIT_FRAME_CHECK_FAILED = 3
EXIT_ARCHIVE_NOT_REACHED = 4
EXIT_MAP_REFUSED = 5
EXIT_LOCAL_PROBLEM = 6

# The archive could not be reached in time: running again is safe and may succeed.
# Every other code the provider or the parser raises is a refusal of this map (status 5).
# The provider raises both kinds as one exception class, so the code decides, not the class.
ARCHIVE_NOT_REACHED_CODES = frozenset({
    "http_status", "truncated_body", "content_length_mismatch", "read_error", "total_deadline",
    "dns_timeout", "connect_timeout", "tls_timeout", "header_timeout", "read_timeout", "socket_stall_timeout",
    "dns_error", "connect_error", "tls_error", "header_error",
    "gzip_integrity", "gzip_truncated", "gzip_concatenated",
})

EXIT_STATUS_HELP = """\
exit statuses:
  0  sidecar written and frame check passed
  1  unexpected error (Python's traceback is on stderr)
  2  usage error
  3  sidecar written, but the frame check failed, so the app will not draw it
  4  nothing written: the archive could not be reached in time; safe to run again
  5  nothing written: the map was refused (flux imbalance above the cap, malformed,
     or none within the provider's 36 h lookback); running again on the same map will not help
  6  nothing written: a local problem (file over the size limits, solver contract, write failure)

examples:
  SOLAR_OBSERVED_PFSS_SIDECAR="$HOME/observed-pfss.json" python scripts/observed_pfss_probe.py
  # hourly, appending to a log; flock stops overlapping runs and timeout stops a slow one:
  7 * * * * cd /path/to/checkout && SOLAR_OBSERVED_PFSS_SIDECAR="$HOME/observed-pfss.json" flock -n "$HOME/.observed-pfss.lock" timeout 300 python scripts/observed_pfss_probe.py >> "$HOME/observed-pfss.log" 2>&1
"""


def acquire_snapshot(request_jd_tdb: float, *, transport: gong.GongTransport | None = None) -> gong.MagnetogramSnapshot:
    """The newest map at or before the requested time, admitted under WSA method 2.

    A fresh provider per call, so nothing parsed under another policy is reused.
    The provider never falls back to an earlier map.
    """
    provider = gong.GongArchiveProvider(
        transport if transport is not None else gong.StdlibGongTransport(),
        parser=functools.partial(gong.parse_gong_fits, flux_policy=gong.FLUX_POLICY_WSA_METHOD_2),
    )
    return provider.acquire(request_jd_tdb)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROGRAM,
        description=__doc__.strip().splitlines()[0],
        epilog=EXIT_STATUS_HELP,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--out", metavar="PATH", help=f"where to write the sidecar (default: ${SIDECAR_VARIABLE})")
    parser.add_argument("--at", metavar="UTC_TIME", help="use the newest map at or before this UTC time, such as "
                        "2026-11-07T05:14Z (default: now)")
    parser.add_argument("--degree", type=int, default=sidecar.DEFAULT_DEGREE,
                        help=f"spherical-harmonic degree of the solve that is written (default: {sidecar.DEFAULT_DEGREE})")
    parser.add_argument("--line-count", type=int, default=sidecar.DEFAULT_LINE_COUNT,
                        help=f"field lines to trace, at most {sidecar.MAX_LINE_COUNT} (default: {sidecar.DEFAULT_LINE_COUNT})")
    parser.add_argument("--compare-degrees", metavar="LIST", help="also print fit time, solve time and file size for "
                        "each of these degrees, such as 80,85,90 (default: none)")
    return parser


def _parse_utc(text: str) -> datetime:
    moment = datetime.fromisoformat(text.strip().replace("Z", "+00:00"))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _sizes(raw: bytes) -> tuple[int, int]:
    return len(raw), len(gzip.compress(raw, compresslevel=6, mtime=0))


def main(
    argv: list[str] | None = None,
    *,
    transport: gong.GongTransport | None = None,
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
    environ: dict[str, str] | None = None,
) -> int:
    stdout = sys.stdout if stdout is None else stdout
    stderr = sys.stderr if stderr is None else stderr
    environ = dict(os.environ) if environ is None else environ
    parser = _parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exit_request:  # argparse has already printed its message
        return int(exit_request.code or 0)

    def usage(message: str) -> int:
        print(f"{PROGRAM}: usage: {message}", file=stderr)
        return EXIT_USAGE

    out_text = args.out or environ.get(SIDECAR_VARIABLE, "")
    if not out_text:
        return usage(f"give --out PATH or set {SIDECAR_VARIABLE}.")
    out = Path(out_text).expanduser().resolve()
    try:
        requested = _parse_utc(args.at) if args.at else datetime.now(timezone.utc)
    except ValueError:
        return usage(f"--at {args.at!r} is not a UTC time such as 2026-11-07T05:14Z.")
    try:
        compare = [int(item) for item in args.compare_degrees.split(",")] if args.compare_degrees else []
    except ValueError:
        return usage(f"--compare-degrees {args.compare_degrees!r} is not a list of whole numbers such as 80,85,90.")
    if args.degree < 1 or any(degree < 1 for degree in compare):
        return usage("a degree must be a positive whole number.")
    if not 1 <= args.line_count <= sidecar.MAX_LINE_COUNT:
        return usage(f"--line-count must be from 1 to {sidecar.MAX_LINE_COUNT}.")
    requested_text = requested.strftime("%Y-%m-%d %H:%M UTC")

    def fail(status: int, code: str, happened: str, next_step: str) -> int:
        print(f"{PROGRAM}: {code}: {happened}. {next_step}.", file=stderr)
        print(f"{PROGRAM}: context: generator {sidecar.GENERATOR_VERSION}, degree {args.degree}, "
              f"output {out}, requested {requested_text}", file=stderr)
        return status

    try:
        started = time.perf_counter()
        try:
            snapshot = acquire_snapshot(current_jd_tdb(requested), transport=transport)
        except gong.GongArchiveError as error:
            if error.code in ARCHIVE_NOT_REACHED_CODES:
                return fail(EXIT_ARCHIVE_NOT_REACHED, error.code, f"the GONG archive was not reached ({error.detail})",
                            "Nothing was written; run the probe again")
            return fail(EXIT_MAP_REFUSED, error.code, f"the archive has no usable map for that time ({error.detail})",
                        "Nothing was written; wait for the next hourly map, or pass --at with an earlier time")
        except gong.GongFitsError as error:
            return fail(EXIT_MAP_REFUSED, error.code, f"the newest map was refused ({error.detail})",
                        "Nothing was written; wait for the next hourly map, or pass --at with an earlier time")
        acquire_seconds = time.perf_counter() - started

        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for degree in compare:
            timings: dict[str, float] = {}
            try:
                trial = sidecar.build_sidecar(snapshot, generated_at_utc=generated_at, degree=degree,
                                              line_count=args.line_count, timings=timings)
            except (sidecar.SidecarError, ValueError) as error:
                print(f"{PROGRAM}: compare: degree {degree}: solve failed ({error})", file=stderr)
                continue
            raw_bytes, gzip_bytes = _sizes(sidecar.serialize_sidecar(trial))
            print(f"{PROGRAM}: compare: degree {degree}: fit {timings['fit_seconds']:.2f} s, "
                  f"solve {timings['solve_seconds']:.2f} s, {raw_bytes} bytes raw, {gzip_bytes} bytes gzip", file=stderr)

        timings = {}
        try:
            payload = sidecar.build_sidecar(snapshot, generated_at_utc=generated_at, degree=args.degree,
                                            line_count=args.line_count, timings=timings)
        except (sidecar.SidecarError, ValueError) as error:
            return fail(EXIT_LOCAL_PROBLEM, "solve_failed", f"the solve gave no drawable field lines ({error})",
                        "Nothing was written; try another --degree, or report this map")
        raw = sidecar.serialize_sidecar(payload)
        raw_bytes, gzip_bytes = _sizes(raw)
        if raw_bytes > MAX_DECODED_BYTES or gzip_bytes > MAX_ENCODED_BYTES:
            return fail(EXIT_LOCAL_PROBLEM, "sidecar_too_large",
                        f"the file would be {raw_bytes} bytes raw and {gzip_bytes} bytes gzip, above the route's "
                        f"limits of {MAX_DECODED_BYTES} and {MAX_ENCODED_BYTES}",
                        "Nothing was written; run the probe with a lower --line-count")
        try:
            sidecar.write_sidecar(raw, out)
        except OSError as error:
            return fail(EXIT_LOCAL_PROBLEM, "write_failed", f"the sidecar could not be written ({error})",
                        "Nothing was written; check that the directory exists and is writable")

        check = payload["carrington_check"]
        print(json.dumps({
            "sidecar": str(out),
            "map_reference_utc": payload["map_reference_utc"],
            "valid_from_jd_tdb": payload["valid_from_jd_tdb"],
            "valid_until_jd_tdb": payload["valid_until_jd_tdb"],
            "degree": payload["degree"],
            "q": payload["flux_correction"]["q"],
            "frame_delta_deg": check["delta_deg"],
            "frame_check_passed": check["pass"],
            "raw_bytes": raw_bytes,
            "gzip_bytes": gzip_bytes,
            "acquire_seconds": round(acquire_seconds, 3),
            "fit_seconds": round(timings["fit_seconds"], 3),
            "solve_seconds": round(timings["solve_seconds"], 3),
        }, allow_nan=False), file=stdout)
        if not check["pass"]:
            return fail(EXIT_FRAME_CHECK_FAILED, "frame_check_failed",
                        f"the map's central meridian {check['provider_central_meridian_deg']:.3f} deg differs from the "
                        f"ephemeris {check['iau_sun_sub_earth_deg']:.3f} deg by {check['delta_deg']:+.3f} deg "
                        f"(tolerance {check['tolerance_deg']:g})",
                        "The file was written with the check failed, so the app will not draw it; report this map")
        print(f"{PROGRAM}: wrote {out}. Start the app with:\n"
              f"  {SIDECAR_VARIABLE}={out} {FRONTEND_FLAG}=1 npm run dev:full", file=stderr)
        return EXIT_WRITTEN
    except Exception:  # noqa: BLE001 - the last resort: status 1 with the traceback
        traceback.print_exc(file=stderr)
        return EXIT_UNEXPECTED


if __name__ == "__main__":
    sys.exit(main())
