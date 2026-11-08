"""SCN-033: `--help` on a maintenance script prints usage and does nothing else.

Each script runs exactly as a person would run it, but from a scratch copy of
the repository layout, so a script that ignored `--help` could only write into
the copy. HTTP(S) is routed to a local port this process keeps closed, so a
urllib download is refused instead of reaching JPL Horizons. A script that
bypassed the proxy environment would not be caught by that guard.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = (
    "capture_all_moon_oracle.py",
    "fetch_remediation_ephemeris.py",
    "generate_synthetic_gong_fixture.py",
    "generate_mga_reference.py",
)


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    (tmp_path / "scripts").mkdir()
    for name in SCRIPTS:
        shutil.copy2(ROOT / "scripts" / name, tmp_path / "scripts" / name)
    (tmp_path / "src/data").mkdir(parents=True)
    shutil.copy2(ROOT / "src/data/moons.json", tmp_path / "src/data/moons.json")
    # The scripts write under here; without the directory a stray write would
    # crash instead of leaving a file, and the no-write check could not fail.
    (tmp_path / "backend/tests/fixtures").mkdir(parents=True)
    return tmp_path


def files(root: Path) -> dict[str, bytes]:
    return {str(path.relative_to(root)): path.read_bytes()
            for path in sorted(root.rglob("*")) if path.is_file()}


def run(sandbox: Path, name: str, *args: str) -> subprocess.CompletedProcess[str]:
    # A bound socket that never listens refuses every connection for as long
    # as it stays open, so no other process can take the port mid-run.
    with socket.socket() as closed:
        closed.bind(("127.0.0.1", 0))
        proxy = f"http://127.0.0.1:{closed.getsockname()[1]}"
        # Only this test's PYTHON* settings reach the child: a developer's
        # PYTHONSAFEPATH would break the scripts' sibling import, and colour
        # settings would decorate argparse and tracebacks on Python 3.13+.
        env = {key: value for key, value in os.environ.items()
               if not key.startswith("PYTHON") and key != "FORCE_COLOR"}
        env.update({"http_proxy": proxy, "https_proxy": proxy, "no_proxy": "",
                    "NO_COLOR": "1", "PYTHONDONTWRITEBYTECODE": "1"})
        return subprocess.run(
            [sys.executable, str(sandbox / "scripts" / name), *args],
            cwd=sandbox, env=env, capture_output=True, text=True, timeout=120,
        )


@pytest.mark.parametrize("name", SCRIPTS)
def test_help_prints_usage_without_downloading_or_writing(sandbox: Path, name: str) -> None:
    before = files(sandbox)
    result = run(sandbox, name, "--help")
    assert result.returncode == 0, result.stderr
    assert result.stdout.startswith("usage:")
    assert files(sandbox) == before


@pytest.mark.parametrize("name", SCRIPTS)
def test_unsupported_option_is_refused_before_any_work(sandbox: Path, name: str) -> None:
    # Someone asking for a dry run must not get a real one.
    before = files(sandbox)
    result = run(sandbox, name, "--dry-run")
    assert result.returncode == 2
    assert "unrecognized arguments: --dry-run" in result.stderr
    assert files(sandbox) == before


def test_abbreviated_option_is_refused_before_any_work(sandbox: Path) -> None:
    # argparse accepts any unambiguous prefix unless told not to; --moon must not
    # quietly become --moon-elements and start the live element capture.
    before = files(sandbox)
    result = run(sandbox, "fetch_remediation_ephemeris.py", "--moon")
    assert result.returncode == 2
    assert "unrecognized arguments: --moon" in result.stderr
    assert files(sandbox) == before


def test_moon_elements_flag_selects_the_element_capture(sandbox: Path) -> None:
    # The flag replaced a sys.argv check; it must still reach capture_moon_elements,
    # which fails at the closed proxy before it can write the element fixtures.
    before = files(sandbox)
    result = run(sandbox, "fetch_remediation_ephemeris.py", "--moon-elements")
    assert result.returncode == 1
    assert "in capture_moon_elements" in result.stderr
    assert files(sandbox) == before


# A bare run must still do the real work: parse_args() now runs before main(),
# so an early exit after it would pass every --help test above.


def test_default_run_regenerates_the_gong_fixture_reproducibly(sandbox: Path) -> None:
    before = files(sandbox)
    result = run(sandbox, "generate_synthetic_gong_fixture.py")
    assert result.returncode == 0, result.stderr
    out = sandbox / "backend/tests/fixtures/gong/synthetic-v1"
    manifest = json.loads((out / "manifest.json").read_text())
    tracked = json.loads((ROOT / "backend/tests/fixtures/gong/synthetic-v1/manifest.json").read_text())
    assert set(files(sandbox)) - set(before) == {
        "backend/tests/fixtures/gong/synthetic-v1/manifest.json",
        f"backend/tests/fixtures/gong/synthetic-v1/{manifest['filename']}",
    }
    script = sandbox / "scripts/generate_synthetic_gong_fixture.py"
    assert manifest["generator_sha256"] == hashlib.sha256(script.read_bytes()).hexdigest()
    assert manifest["generator_sha256"] == tracked["generator_sha256"]
    # The expanded FITS is byte-reproducible; the gzip container depends on the
    # zlib build, so its hash is not pinned.
    assert manifest["expanded_fits_sha256"] == tracked["expanded_fits_sha256"]


def test_default_run_of_the_remediation_capture_starts_with_the_fallback_group(sandbox: Path) -> None:
    before = files(sandbox)
    result = run(sandbox, "fetch_remediation_ephemeris.py")
    assert result.returncode == 1
    assert "in capture\n" in result.stderr  # the group loop, not the element capture
    assert "in capture_moon_elements" not in result.stderr
    assert files(sandbox) == before  # a group is written only after every body succeeds


def test_default_run_of_the_oracle_capture_records_unreachable_moons(sandbox: Path) -> None:
    result = run(sandbox, "capture_all_moon_oracle.py")
    assert result.returncode == 0, result.stderr
    moons = json.loads((sandbox / "src/data/moons.json").read_text())
    artifact = json.loads((sandbox / "backend/tests/fixtures/all_moons_horizons_oracle.json").read_text())
    assert artifact["expected_catalog_count"] == len(moons)
    assert len(artifact["bodies"]) == artifact["unavailable_count"] == len(moons)
    assert {entry["status"] for entry in artifact["bodies"].values()} == {"unavailable"}
