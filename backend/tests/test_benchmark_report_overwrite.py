"""The report writer must never silently destroy an existing file.

`POST /benchmark/accuracy/report` is unauthenticated and writes into a
directory of hand-written notes, so overwriting is opt-in only.
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import benchmark.accuracy as benchmark_accuracy
import server
from benchmark import generate_accuracy_report
from data.bodies import ALL_BODIES
from server import app

client = TestClient(app)

SENTINEL = "# hand-written note\n\nDo not destroy me.\n"


def _explode(*_args, **_kwargs):  # pragma: no cover - only reached on regression
    raise AssertionError("benchmark ran before the overwrite guard rejected the call")


@pytest.fixture()
def report_dir() -> Path:
    """A throwaway subdirectory of the real reports directory."""
    path = server.BENCHMARK_REPORTS_DIR / f"pytest-overwrite-{uuid.uuid4().hex}"
    path.mkdir(parents=True, exist_ok=True)
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def test_generate_report_refuses_existing_file_before_benchmarking(monkeypatch, tmp_path) -> None:
    target = tmp_path / "existing.md"
    target.write_text(SENTINEL, encoding="utf-8")
    monkeypatch.setattr(benchmark_accuracy, "benchmark_against_references", _explode)

    with pytest.raises(FileExistsError):
        generate_accuracy_report(ALL_BODIES, output_path=target, ephemeris_provider="kepler")

    assert target.read_text(encoding="utf-8") == SENTINEL


def test_generate_report_refuses_dangling_symlink(monkeypatch, tmp_path) -> None:
    victim = tmp_path / "victim.md"
    link = tmp_path / "link.md"
    link.symlink_to(victim)
    monkeypatch.setattr(benchmark_accuracy, "benchmark_against_references", _explode)

    with pytest.raises(FileExistsError):
        generate_accuracy_report(ALL_BODIES, output_path=link, ephemeris_provider="kepler")

    assert not victim.exists()


def test_generate_report_writes_new_file(tmp_path) -> None:
    target = tmp_path / "nested" / "fresh.md"

    result = generate_accuracy_report(ALL_BODIES, output_path=target, ephemeris_provider="kepler")

    assert result["reportPath"] == str(target)
    assert target.read_text(encoding="utf-8").startswith("# Trajectory Accuracy Benchmark Report")


def test_generate_report_replaces_when_allowed(tmp_path) -> None:
    target = tmp_path / "existing.md"
    target.write_text(SENTINEL, encoding="utf-8")

    generate_accuracy_report(
        ALL_BODIES,
        output_path=target,
        ephemeris_provider="kepler",
        allow_overwrite=True,
    )

    assert target.read_text(encoding="utf-8") != SENTINEL


def test_report_endpoint_returns_409_and_keeps_file(monkeypatch, report_dir: Path) -> None:
    target = report_dir / "note.md"
    target.write_text(SENTINEL, encoding="utf-8")
    monkeypatch.setattr(benchmark_accuracy, "benchmark_against_references", _explode)

    response = client.post(
        "/benchmark/accuracy/report",
        json={
            "ephemeris_provider": "kepler",
            "output_path": f"{report_dir.name}/note.md",
        },
    )

    assert response.status_code == 409
    assert "allow_overwrite" in response.text
    assert target.read_text(encoding="utf-8") == SENTINEL


def test_report_endpoint_overwrites_when_requested(report_dir: Path) -> None:
    target = report_dir / "note.md"
    target.write_text(SENTINEL, encoding="utf-8")

    response = client.post(
        "/benchmark/accuracy/report",
        json={
            "ephemeris_provider": "kepler",
            "output_path": f"{report_dir.name}/note.md",
            "allow_overwrite": True,
        },
    )

    assert response.status_code == 200
    assert target.read_text(encoding="utf-8") != SENTINEL


def test_report_endpoint_rejects_non_boolean_allow_overwrite(report_dir: Path) -> None:
    response = client.post(
        "/benchmark/accuracy/report",
        json={
            "ephemeris_provider": "kepler",
            "output_path": f"{report_dir.name}/note.md",
            "allow_overwrite": "true",
        },
    )

    assert response.status_code == 422
    assert "allow_overwrite" in response.text
