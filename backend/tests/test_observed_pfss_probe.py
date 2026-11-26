"""scripts/observed_pfss_probe.py: the command line that writes the observed-PFSS sidecar."""
from __future__ import annotations

import gzip
import importlib.util
import io
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits

import solar_observational_acceptance as acceptance
from sim import gong_magnetogram as gong
from sim import observed_pfss_sidecar as sidecar
from sim.solar_time import current_jd_tdb

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/observed_pfss_probe.py"
_spec = importlib.util.spec_from_file_location("observed_pfss_probe", SCRIPT)
probe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(probe)

DAY_URL = f"{gong.GONG_ARCHIVE_BASE_URL}202610/mrzqs261012/"
FILE_URL = DAY_URL + acceptance.PROVIDER_FILENAME
AT = "2026-10-12T17:50Z"
FAST = ["--degree", "12", "--line-count", "24"]


class _Response:
    def __init__(self, body: bytes) -> None:
        self.body, self.offset = body, 0
        self.status, self.headers, self.header_items, self.url = 200, {}, (), None

    def read(self, size: int) -> bytes:
        chunk = self.body[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk

    def close(self) -> None:
        pass


class _Archive:
    """A GONG archive holding the retained 2026-10-12 map, or whatever ``file_bytes`` says."""

    def __init__(self, *, file_bytes: bytes | None = None, error: Exception | None = None, hrefs: tuple[str, ...] | None = None):
        self.file_bytes = acceptance.pinned_observation_bytes()[0] if file_bytes is None else file_bytes
        self.error = error
        self.hrefs = (acceptance.PROVIDER_FILENAME,) if hrefs is None else hrefs
        self.calls: list[str] = []

    def open(self, url: str, **_timeouts: float) -> _Response:
        self.calls.append(url)
        if self.error is not None:
            raise self.error
        if url == FILE_URL:
            response = _Response(self.file_bytes)
        elif url.startswith(gong.GONG_ARCHIVE_BASE_URL) and url.endswith("/"):
            links = self.hrefs if url == DAY_URL else ()
            response = _Response("".join(f'<a href="{href}">{href}</a>' for href in links).encode())
        else:
            raise AssertionError(f"unexpected request: {url}")
        response.url = url
        return response


def _variant(target_q: float) -> bytes:
    """The retained map with its positive pixels scaled until signed/unsigned flux is target_q."""
    _, expanded = acceptance.pinned_observation_bytes()
    with fits.open(io.BytesIO(expanded), memmap=False) as hdul:
        header, stored = hdul[0].header.copy(), hdul[0].data
        field = np.asarray(stored, dtype=np.float64)
    positive, negative = math.fsum(field[field > 0.0]), -math.fsum(field[field < 0.0])
    factor = (1.0 + target_q) / (1.0 - target_q) * negative / positive
    buffer = io.BytesIO()
    fits.PrimaryHDU(data=np.where(field > 0.0, field * factor, field).astype(stored.dtype), header=header).writeto(buffer)
    return buffer.getvalue()


def _run(args: list[str], *, transport=None, environ: dict[str, str] | None = None) -> tuple[int, str, str]:
    stdout, stderr = io.StringIO(), io.StringIO()
    status = probe.main(args, transport=transport if transport is not None else _Archive(),
                        stdout=stdout, stderr=stderr, environ={} if environ is None else environ)
    return status, stdout.getvalue(), stderr.getvalue()


def _only_file(directory: Path) -> list[str]:
    return sorted(entry.name for entry in directory.iterdir())


# ── the path that works ───────────────────────────────────────────────────────

def test_the_probe_writes_a_valid_sidecar_and_says_how_to_start_the_app(tmp_path: Path) -> None:
    out = tmp_path / "observed-pfss.json"

    status, stdout, stderr = _run(["--out", str(out), "--at", AT, *FAST])

    assert status == 0, stderr
    payload = sidecar.load_sidecar(out.read_bytes())
    assert payload["map_reference_utc"] == "2026-10-12T17:44:00Z"
    assert payload["flux_correction"]["policy_version"] == "wsa-method-2-polarity-scale-v1"
    assert (payload["degree"], payload["line_count"]) == (12, 24)
    assert _only_file(tmp_path) == ["observed-pfss.json"]
    lines = stdout.splitlines()
    assert len(lines) == 1
    summary = json.loads(lines[0])
    assert set(summary) == {
        "sidecar", "map_reference_utc", "valid_from_jd_tdb", "valid_until_jd_tdb", "degree", "q",
        "frame_delta_deg", "frame_check_passed", "raw_bytes", "gzip_bytes",
        "acquire_seconds", "fit_seconds", "solve_seconds",
    }
    assert summary["sidecar"] == str(out) and summary["frame_check_passed"] is True
    assert summary["raw_bytes"] == out.stat().st_size and 0 < summary["gzip_bytes"] < summary["raw_bytes"]
    assert summary["valid_until_jd_tdb"] - summary["valid_from_jd_tdb"] == pytest.approx(2 * 27.2753, abs=1e-6)
    assert f"SOLAR_OBSERVED_PFSS_SIDECAR={out} VITE_SOLAR_OBSERVED_PFSS=1 npm run dev:full" in stderr


def test_the_requested_time_reaches_the_provider_as_a_tdb_julian_date(tmp_path: Path, monkeypatch) -> None:
    seen: list[float] = []
    real = probe.acquire_snapshot

    def recording(request_jd_tdb: float, **kwargs):
        seen.append(request_jd_tdb)
        return real(request_jd_tdb, **kwargs)

    monkeypatch.setattr(probe, "acquire_snapshot", recording)
    status, _, stderr = _run(["--out", str(tmp_path / "s.json"), "--at", AT, *FAST])
    assert status == 0, stderr
    assert seen == [current_jd_tdb(datetime(2026, 10, 12, 17, 50, tzinfo=timezone.utc))]


def test_the_provider_is_built_with_the_method_2_parser_and_never_reused() -> None:
    first = probe.acquire_snapshot(acceptance.REQUEST_JD_TDB, transport=_Archive())
    assert first.snapshot_id.flux_balance_policy_version == "wsa-method-2-polarity-scale-v1"
    transport = _Archive()
    probe.acquire_snapshot(acceptance.REQUEST_JD_TDB, transport=transport)
    probe.acquire_snapshot(acceptance.REQUEST_JD_TDB, transport=transport)
    assert transport.calls.count(FILE_URL) == 2  # a fresh provider each time: nothing cached is trusted


def test_out_falls_back_to_the_backend_variable(tmp_path: Path) -> None:
    out = tmp_path / "from-env.json"
    status, _, stderr = _run(["--at", AT, *FAST], environ={"SOLAR_OBSERVED_PFSS_SIDECAR": str(out)})
    assert status == 0, stderr
    assert out.exists()


def test_compare_degrees_prints_one_line_per_degree(tmp_path: Path) -> None:
    status, stdout, stderr = _run(["--out", str(tmp_path / "s.json"), "--at", AT, *FAST, "--compare-degrees", "9,12"])
    assert status == 0, stderr
    compared = re.findall(r"compare: degree (\d+): fit [\d.]+ s, solve [\d.]+ s, \d+ bytes raw, \d+ bytes gzip", stderr)
    assert compared == ["9", "12"]
    assert len(stdout.splitlines()) == 1


# ── usage ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("args", [
    ["--at", AT],                                             # no --out and no variable
    ["--out", "x.json", "--at", "last tuesday"],
    ["--out", "x.json", "--line-count", "0"],
    ["--out", "x.json", "--line-count", "501"],
    ["--out", "x.json", "--degree", "0"],
    ["--out", "x.json", "--compare-degrees", "80,ninety"],
    ["--out", "x.json", "--no-such-flag"],
])
def test_a_usage_error_exits_2_and_fetches_nothing(args: list[str], tmp_path: Path, monkeypatch, capsys) -> None:
    monkeypatch.chdir(tmp_path)
    transport = _Archive()
    status, _, stderr = _run(args, transport=transport)
    assert status == 2
    assert transport.calls == [] and _only_file(tmp_path) == []
    assert "usage" in (stderr + capsys.readouterr().err).lower()


def test_help_lists_the_flags_the_exit_statuses_and_a_cron_line(capsys) -> None:
    status, _, _ = _run(["--help"])
    text = capsys.readouterr().out
    assert status == 0
    for flag in ("--out", "--at", "--degree", "--line-count", "--compare-degrees"):
        assert flag in text
    for number in range(7):
        assert re.search(rf"^\s+{number}\s", text, re.MULTILINE), number
    assert "flock -n" in text and "timeout 300" in text and "7 * * * *" in text
    assert "(default: 90)" in text and "(default: 200)" in text


def test_the_script_runs_from_the_repository_root_with_no_pythonpath() -> None:
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    result = subprocess.run([sys.executable, "scripts/observed_pfss_probe.py", "--help"], cwd=ROOT,
                            env=environment, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr
    assert "exit statuses" in result.stdout


# ── failures: nothing written, one code, one next step ────────────────────────

def _failure(tmp_path: Path, **run_kwargs) -> tuple[int, str, str, Path]:
    out = tmp_path / "observed-pfss.json"
    out.write_bytes(b"the earlier sidecar")
    status, stdout, stderr = _run(["--out", str(out), "--at", AT, *FAST], **run_kwargs)
    assert stdout == ""
    assert out.read_bytes() == b"the earlier sidecar"
    assert _only_file(tmp_path) == ["observed-pfss.json"]
    return status, stdout, stderr, out


def _assert_failure_lines(stderr: str, code: str, out: Path) -> None:
    first, second = stderr.splitlines()[:2]
    assert re.fullmatch(rf"observed_pfss_probe: {code}: .+\. .+\.", first), first
    assert second == (f"observed_pfss_probe: context: generator observed-pfss-probe-v1, degree 12, "
                      f"output {out}, requested 2026-10-12 17:50 UTC")


def test_an_unreachable_archive_exits_4_and_says_to_run_again(tmp_path: Path) -> None:
    error = gong.GongTransportError("connect_timeout", "no connection within 5.0 s")
    status, _, stderr, out = _failure(tmp_path, transport=_Archive(error=error))
    assert status == 4
    _assert_failure_lines(stderr, "connect_timeout", out)
    assert "run the probe again" in stderr


def test_no_map_in_the_lookback_exits_5(tmp_path: Path) -> None:
    status, _, stderr, out = _failure(tmp_path, transport=_Archive(hrefs=()))
    assert status == 5
    code = stderr.split(": ")[1]
    assert code in {"archive_miss", "too_old"}
    _assert_failure_lines(stderr, code, out)
    assert "--at" in stderr


def test_a_map_above_the_cap_exits_5_with_the_parser_code(tmp_path: Path) -> None:
    status, _, stderr, out = _failure(tmp_path, transport=_Archive(file_bytes=gzip.compress(_variant(0.12))))
    assert status == 5
    _assert_failure_lines(stderr, "flux_unbalanced", out)
    assert "+0.12" in stderr and "0.10" in stderr and "--at" in stderr


def test_a_file_over_the_route_limits_exits_6(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(probe, "MAX_ENCODED_BYTES", 100)
    status, _, stderr, out = _failure(tmp_path)
    assert status == 6
    _assert_failure_lines(stderr, "sidecar_too_large", out)
    assert "--line-count" in stderr


def test_a_solution_without_lines_exits_6(tmp_path: Path, monkeypatch) -> None:
    def no_lines(*_args, **_kwargs):
        raise sidecar.SidecarError("no_drawable_line", "the solution has no open or closed field line")

    monkeypatch.setattr(sidecar, "build_sidecar", no_lines)
    status, _, stderr, out = _failure(tmp_path)
    assert status == 6
    _assert_failure_lines(stderr, "solve_failed", out)


def test_a_failed_write_exits_6_and_leaves_no_temporary_file(tmp_path: Path, monkeypatch) -> None:
    def refuse(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", refuse)
    status, _, stderr, out = _failure(tmp_path)
    assert status == 6
    _assert_failure_lines(stderr, "write_failed", out)


def test_an_unexpected_error_exits_1_with_the_traceback(tmp_path: Path, monkeypatch) -> None:
    def explode(*_args, **_kwargs):
        raise RuntimeError("not planned for")

    monkeypatch.setattr(sidecar, "build_sidecar", explode)
    status, _, stderr, _ = _failure(tmp_path)
    assert status == 1
    assert "Traceback (most recent call last)" in stderr and "RuntimeError: not planned for" in stderr


def test_a_failed_frame_check_still_writes_the_file_and_exits_3(tmp_path: Path, monkeypatch) -> None:
    real = sidecar.carrington_frame_check
    monkeypatch.setattr(sidecar, "carrington_frame_check",
                        lambda jd, meridian: real(jd, (meridian + 30.0) % 360.0))
    out = tmp_path / "observed-pfss.json"

    status, stdout, stderr = _run(["--out", str(out), "--at", AT, *FAST])

    assert status == 3
    assert sidecar.load_sidecar(out.read_bytes())["carrington_check"]["pass"] is False
    assert json.loads(stdout)["frame_check_passed"] is False
    _assert_failure_lines(stderr, "frame_check_failed", out)
    assert "npm run dev:full" not in stderr


# ── every code the provider or the parser can raise has a status ──────────────

_SOURCE = (ROOT / "backend/sim/gong_magnetogram.py").read_text(encoding="utf-8")
ARCHIVE_CODES = sorted(set(re.findall(r'Gong(?:Archive|Transport)Error\(\s*"([a-z_]+)"', _SOURCE))
                       | set(re.findall(r'limit_code="([a-z_]+)"', _SOURCE)))
PARSER_CODES = sorted(set(re.findall(r'_reject\(\s*"([a-z_]+)"', _SOURCE)))
# Refusals: running again on the same map, or the same archive listing, will not help.
REFUSED_ARCHIVE_CODES = {
    "aggregate_limit", "ambiguous_candidate", "ambiguous_framing", "archive_miss", "compressed_limit",
    "duplicate_content_length", "expanded_limit", "future_only", "invalid_content_length", "listing_limit",
    "malformed_filename", "malformed_listing", "malformed_redirect", "redirect_loop", "redirect_overflow",
    "too_old", "unsafe_url", "unsupported_content_encoding", "unsupported_transfer_encoding", "wrong_product",
}


def test_every_archive_code_is_classified() -> None:
    assert len(ARCHIVE_CODES) >= 30 and len(PARSER_CODES) >= 12
    assert probe.ARCHIVE_NOT_REACHED_CODES <= set(ARCHIVE_CODES)
    unclassified = set(ARCHIVE_CODES) - probe.ARCHIVE_NOT_REACHED_CODES - REFUSED_ARCHIVE_CODES
    assert unclassified == set(), f"give these a status in the probe and in this test: {sorted(unclassified)}"
    assert probe.ARCHIVE_NOT_REACHED_CODES.isdisjoint(REFUSED_ARCHIVE_CODES)


@pytest.mark.parametrize("code", ARCHIVE_CODES)
def test_an_archive_code_exits_4_when_transient_and_5_when_a_refusal(code: str, tmp_path: Path) -> None:
    status, _, stderr, out = _failure(tmp_path, transport=_Archive(error=gong.GongArchiveError(code, "detail")))
    assert status == (4 if code in probe.ARCHIVE_NOT_REACHED_CODES else 5)
    _assert_failure_lines(stderr, code, out)


@pytest.mark.parametrize("code", PARSER_CODES)
def test_every_parser_refusal_exits_5(code: str, tmp_path: Path, monkeypatch) -> None:
    def refuse(*_args, **_kwargs):
        raise gong.GongFitsError(code, "detail")

    monkeypatch.setattr(probe, "acquire_snapshot", refuse)
    status, _, stderr, out = _failure(tmp_path)
    assert status == 5
    _assert_failure_lines(stderr, code, out)
