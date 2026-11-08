"""SCN-033: `--help` on a maintenance script prints usage and does nothing else.

Each script runs exactly as a person would run it, but from a scratch copy of
the repository layout, so a script that ignored `--help` could only write into
the copy. HTTP(S) goes to a closed local port, so an accidental download fails
at once instead of reaching JPL Horizons.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = (
    "capture_all_moon_oracle.py",
    "fetch_remediation_ephemeris.py",
    "generate_synthetic_gong_fixture.py",
)


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    (tmp_path / "scripts").mkdir()
    for name in SCRIPTS:
        shutil.copy2(ROOT / "scripts" / name, tmp_path / "scripts" / name)
    (tmp_path / "src/data").mkdir(parents=True)
    shutil.copy2(ROOT / "src/data/moons.json", tmp_path / "src/data/moons.json")
    return tmp_path


def files(root: Path) -> dict[str, bytes]:
    return {str(path.relative_to(root)): path.read_bytes()
            for path in sorted(root.rglob("*")) if path.is_file()}


def run(sandbox: Path, name: str, *args: str) -> subprocess.CompletedProcess[str]:
    closed = "http://127.0.0.1:9"
    env = {**os.environ, "http_proxy": closed, "https_proxy": closed, "no_proxy": "",
           "PYTHONDONTWRITEBYTECODE": "1"}
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
    assert "Connection refused" in result.stderr
    assert files(sandbox) == before
