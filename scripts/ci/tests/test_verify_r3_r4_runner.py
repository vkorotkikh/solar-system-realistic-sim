"""End-to-end contracts for the fail-closed R3/R4 science runner."""

from __future__ import annotations

import hashlib
import json
from importlib import metadata
from pathlib import Path
import subprocess
import sys


RUNNER = Path(__file__).parents[1] / "verify_r3_r4.py"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(RUNNER), *args],
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args], cwd=repo, text=True, capture_output=True, check=True,
    )


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _patch(before: str, after: str) -> str:
    return (
        "diff --git a/science.py b/science.py\n"
        "--- a/science.py\n"
        "+++ b/science.py\n"
        "@@ -1 +1 @@\n"
        f"-{before}\n"
        f"+{after}\n"
    )


def _fixture(
    tmp_path: Path,
    *,
    test_body: str = "def test_invariant():\n    assert science.VALUE == 2, 'SCIENCE-001 expected calibrated value'\n",
    mutation_after: str = "VALUE = 3",
    required_node: str = "test_science.py::test_invariant",
    expected_regex: str = "SCIENCE-001",
    package_versions: dict[str, str] | None = None,
) -> tuple[Path, Path]:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "science.py").write_text("VALUE = 2\n")
    (repo / "test_science.py").write_text("import science\n" + test_body)
    patch_dir = repo / "mutations"
    patch_dir.mkdir()
    patch_path = patch_dir / "change-value.patch"
    patch_path.write_text(_patch("VALUE = 2", mutation_after))
    manifest = {
        "schema_version": 1,
        "environment": {
            "python": ".".join(str(part) for part in sys.version_info[:3]),
            "packages": package_versions
            if package_versions is not None
            else {"pytest": metadata.version("pytest")},
            "variables": {
                "PYTHONHASHSEED": "0",
                "OMP_NUM_THREADS": "1",
                "OPENBLAS_NUM_THREADS": "1",
            },
        },
        "inputs": [
            {"path": "science.py", "sha256": _sha(repo / "science.py")},
            {"path": "test_science.py", "sha256": _sha(repo / "test_science.py")},
        ],
        "pytest": {
            "pythonpath": ["."],
            "timeout_seconds": 20,
            "required_nodes": [required_node],
        },
        "mutations": [
            {
                "id": "wrong-calibration",
                "patch": "mutations/change-value.patch",
                "patch_sha256": _sha(patch_path),
                "production_files": ["science.py"],
                "node": required_node,
                "expected_assertion_regex": expected_regex,
                "fixed_commit": "deadbeef",
                "oracle_class": "analytic",
            }
        ],
    }
    manifest_path = repo / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    _git(repo, "init", "-q")
    _git(repo, "add", ".")
    _git(
        repo,
        "-c",
        "user.name=R4 Test",
        "-c",
        "user.email=r4@example.invalid",
        "commit",
        "-qm",
        "fixture",
    )
    return repo, manifest_path


def test_all_mode_proves_baseline_and_mutant_without_touching_source(tmp_path):
    repo, manifest = _fixture(tmp_path)
    before = (repo / "science.py").read_bytes()

    result = _run(
        "--repo", str(repo), "--manifest", str(manifest),
        "--artifacts", str(repo / "artifacts"), "all",
    )

    assert result.returncode == 0, result.stdout + result.stderr
    summary = json.loads((repo / "artifacts/summary.json").read_text())
    assert summary["baseline"] == {"collected": 1, "passed": 1}
    assert summary["mutations"] == [
        {
            "id": "wrong-calibration",
            "status": "killed",
            "node": "test_science.py::test_invariant",
        }
    ]
    assert (repo / "science.py").read_bytes() == before
    assert not list(repo.parent.glob("r3-r4-mutant-*"))


def test_missing_required_node_fails_closed(tmp_path):
    repo, manifest = _fixture(tmp_path, required_node="test_science.py::test_missing")

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode != 0
    assert "required-node collection failed" in result.stderr


def test_skip_or_xfail_is_not_a_green_baseline(tmp_path):
    body = (
        "import pytest\n"
        "@pytest.mark.xfail(reason='known bad')\n"
        "def test_invariant():\n"
        "    assert science.VALUE == 3\n"
    )
    repo, manifest = _fixture(tmp_path, test_body=body)

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode != 0
    assert "skip/xfail" in result.stderr


def test_missing_or_wrong_dependency_version_fails_before_collection(tmp_path):
    repo, manifest = _fixture(
        tmp_path, package_versions={"pytest": "0.0-not-installed-version"},
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode != 0
    assert "environment mismatch" in result.stderr
    assert "pytest" in result.stderr


def test_mutant_collection_error_is_invalid_evidence(tmp_path):
    repo, manifest = _fixture(tmp_path, mutation_after="VALUE = (")

    result = _run("--repo", str(repo), "--manifest", str(manifest), "mutations")

    assert result.returncode != 0
    assert "mutant collection failed" in result.stderr


def test_unrelated_failure_does_not_kill_mutant(tmp_path):
    repo, manifest = _fixture(tmp_path, expected_regex="SCIENCE-999")

    result = _run("--repo", str(repo), "--manifest", str(manifest), "mutations")

    assert result.returncode != 0
    assert "expected assertion regex did not match" in result.stderr


def test_manifest_or_patch_hash_drift_fails_closed(tmp_path):
    repo, manifest = _fixture(tmp_path)
    (repo / "mutations/change-value.patch").write_text(
        _patch("VALUE = 2", "VALUE = 4"),
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest), "mutations")

    assert result.returncode != 0
    assert "patch SHA-256 mismatch" in result.stderr
