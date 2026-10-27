"""End-to-end contracts for the fail-closed R3/R4 science runner."""

from __future__ import annotations

import hashlib
import difflib
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
    return "diff --git a/science.py b/science.py\n" + "".join(
        difflib.unified_diff(
            before.splitlines(keepends=True), after.splitlines(keepends=True),
            fromfile="a/science.py", tofile="b/science.py",
        )
    )


def _fixture(
    tmp_path: Path,
    *,
    test_body: str = "def test_invariant():\n    assert science.calibrated_value() == 2, 'SCIENCE-001 expected calibrated value'\n",
    mutation_after: str = "return 3",
    production_body: str = "def calibrated_value():\n    return 2\n",
    mutation_source: str | None = None,
    required_node: str = "test_science.py::test_invariant",
    expected_regex: str = "SCIENCE-001",
    package_versions: dict[str, str] | None = None,
) -> tuple[Path, Path]:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "science.py").write_text(production_body)
    (repo / "test_science.py").write_text("import science\n" + test_body)
    patch_dir = repo / "mutations"
    patch_dir.mkdir()
    patch_path = patch_dir / "change-value.patch"
    patch_path.write_text(_patch(
        production_body,
        mutation_source if mutation_source is not None
        else production_body.replace("return 2", mutation_after, 1),
    ))
    effective_packages = (
        package_versions if package_versions is not None
        else {"pytest": metadata.version("pytest")}
    )
    requirements_path = repo / "requirements.txt"
    requirements_path.write_text(
        "".join(f"{name}=={version}\n" for name, version in effective_packages.items())
    )
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
        "fixture inputs",
    )
    fixed_commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo, text=True,
        capture_output=True, check=True,
    ).stdout.strip()
    manifest = {
        "schema_version": 1,
        "environment": {
            "python": ".".join(str(part) for part in sys.version_info[:3]),
            "requirements": {
                "path": "requirements.txt",
                "sha256": _sha(requirements_path),
            },
            "packages": effective_packages,
            "variables": {
                "PYTHONHASHSEED": "0",
                "OMP_NUM_THREADS": "1",
                "OPENBLAS_NUM_THREADS": "1",
            },
        },
        "inputs": [
            {"path": "science.py", "sha256": _sha(repo / "science.py")},
            {"path": "test_science.py", "sha256": _sha(repo / "test_science.py")},
            {"path": "requirements.txt", "sha256": _sha(requirements_path)},
        ],
        "pytest": {
            "conftest_policy": "disabled",
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
                "fixed_commit": fixed_commit,
                "oracle_class": "analytic",
            }
        ],
    }
    manifest_path = repo / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    _git(repo, "add", "manifest.json")
    _git(
        repo,
        "-c",
        "user.name=R4 Test",
        "-c",
        "user.email=r4@example.invalid",
        "commit",
        "-qm",
        "fixture manifest",
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
    assert summary["baseline_worktree"] == "detached-head"
    assert summary["resolved_fixed_commits"]["wrong-calibration"] == (
        json.loads(manifest.read_text())["mutations"][0]["fixed_commit"]
    )
    assert summary["mutations"] == [
        {
            "id": "wrong-calibration",
            "status": "killed",
            "node": "test_science.py::test_invariant",
        }
    ]
    assert (repo / "science.py").read_bytes() == before
    assert not (repo / "artifacts/offline-python").exists()
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
        "    assert science.calibrated_value() == 3\n"
    )
    repo, manifest = _fixture(tmp_path, test_body=body)

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode != 0
    assert "skip/xfail" in result.stderr


def test_non_strict_xpass_is_not_a_green_baseline(tmp_path):
    body = (
        "import pytest\n"
        "@pytest.mark.xfail(reason='stale expected failure')\n"
        "def test_invariant():\n"
        "    assert science.calibrated_value() == 2\n"
    )
    repo, manifest = _fixture(tmp_path, test_body=body)

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode != 0
    assert "skip/xfail marker forbidden" in result.stderr


def test_missing_or_wrong_dependency_version_fails_before_collection(tmp_path):
    repo, manifest = _fixture(
        tmp_path, package_versions={"pytest": "0.0-not-installed-version"},
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode != 0
    assert "environment mismatch" in result.stderr
    assert "pytest" in result.stderr


def test_mutant_collection_error_is_invalid_evidence(tmp_path):
    repo, manifest = _fixture(tmp_path, mutation_after="return (")

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
        _patch("def calibrated_value():\n    return 2\n", "def calibrated_value():\n    return 4\n"),
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest), "mutations")

    assert result.returncode != 0
    assert "patch must be tracked and clean" in result.stderr


def test_fixed_commit_must_resolve_to_an_ancestor(tmp_path):
    repo, manifest_path = _fixture(tmp_path)
    manifest = json.loads(manifest_path.read_text())
    manifest["mutations"][0]["fixed_commit"] = "f" * 40
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    _git(repo, "add", "manifest.json")
    _git(
        repo, "-c", "user.name=R4 Test", "-c", "user.email=r4@example.invalid",
        "commit", "-qm", "set unknown fix id",
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest_path), "mutations")

    assert result.returncode != 0
    assert "fixed_commit does not resolve" in result.stderr


def test_resolved_fixed_commit_must_be_an_ancestor_of_head(tmp_path):
    repo, manifest_path = _fixture(tmp_path)
    tree = subprocess.run(
        ["git", "rev-parse", "HEAD^{tree}"], cwd=repo, text=True,
        capture_output=True, check=True,
    ).stdout.strip()
    unrelated = subprocess.run(
        [
            "git", "-c", "user.name=R4 Test", "-c", "user.email=r4@example.invalid",
            "commit-tree", tree, "-m", "unrelated root",
        ],
        cwd=repo, text=True, capture_output=True, check=True,
    ).stdout.strip()
    manifest = json.loads(manifest_path.read_text())
    manifest["mutations"][0]["fixed_commit"] = unrelated
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    _git(repo, "add", "manifest.json")
    _git(
        repo, "-c", "user.name=R4 Test", "-c", "user.email=r4@example.invalid",
        "commit", "-qm", "set unrelated fix id",
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest_path), "baseline")

    assert result.returncode != 0
    assert "fixed_commit is not an ancestor of HEAD" in result.stderr


def test_external_manifest_is_rejected_even_when_contents_are_identical(tmp_path):
    repo, manifest = _fixture(tmp_path)
    external = tmp_path / "external-manifest.json"
    external.write_bytes(manifest.read_bytes())

    result = _run("--repo", str(repo), "--manifest", str(external), "baseline")

    assert result.returncode != 0
    assert "manifest must be inside the repository" in result.stderr


def test_dirty_tracked_manifest_is_rejected(tmp_path):
    repo, manifest = _fixture(tmp_path)
    manifest.write_text(manifest.read_text() + "\n")

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode != 0
    assert "manifest must be tracked and clean" in result.stderr


def test_required_node_file_must_be_a_pinned_input(tmp_path):
    repo, manifest_path = _fixture(tmp_path)
    manifest = json.loads(manifest_path.read_text())
    manifest["inputs"] = [
        item for item in manifest["inputs"] if item["path"] != "test_science.py"
    ]
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    _git(repo, "add", "manifest.json")
    _git(
        repo, "-c", "user.name=R4 Test", "-c", "user.email=r4@example.invalid",
        "commit", "-qm", "remove test pin",
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest_path), "baseline")

    assert result.returncode != 0
    assert "required node file is not a pinned input" in result.stderr


def test_required_node_file_must_be_normalized_repo_relative(tmp_path):
    repo, manifest_path = _fixture(tmp_path)
    manifest = json.loads(manifest_path.read_text())
    node = manifest["pytest"]["required_nodes"][0]
    malformed = "./" + node
    manifest["pytest"]["required_nodes"] = [malformed]
    manifest["mutations"][0]["node"] = malformed
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    _git(repo, "add", "manifest.json")
    _git(
        repo, "-c", "user.name=R4 Test", "-c", "user.email=r4@example.invalid",
        "commit", "-qm", "malform test node",
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest_path), "baseline")

    assert result.returncode != 0
    assert "normalized repository-relative path" in result.stderr


def test_preexisting_artifacts_and_python_modules_are_rejected(tmp_path):
    repo, manifest = _fixture(tmp_path)
    artifacts = repo / "artifacts"
    poison = artifacts / "offline-python"
    poison.mkdir(parents=True)
    (poison / "r3_r4_pytest_guard.py").write_text(
        "def pytest_collection_modifyitems(items):\n    items.clear()\n",
    )
    stale = artifacts / "summary.json"
    stale.write_text('{"baseline":{"passed":999}}\n')

    result = _run(
        "--repo", str(repo), "--manifest", str(manifest),
        "--artifacts", str(artifacts), "all",
    )

    assert result.returncode != 0
    assert "artifact directory must be absent or empty" in result.stderr
    assert json.loads(stale.read_text())["baseline"]["passed"] == 999


def test_baseline_executes_from_detached_head(tmp_path):
    body = (
        "from pathlib import Path\n"
        "import subprocess\n"
        "def test_invariant():\n"
        "    assert Path('.git').is_file(), 'R4-BASELINE-NOT-WORKTREE'\n"
        "    attached = subprocess.run(\n"
        "        ['git', 'symbolic-ref', '-q', 'HEAD'], capture_output=True\n"
        "    )\n"
        "    assert attached.returncode == 1, 'R4-BASELINE-NOT-DETACHED'\n"
        "    assert science.calibrated_value() == 2\n"
    )
    repo, manifest = _fixture(tmp_path, test_body=body)

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode == 0, result.stdout + result.stderr


def test_abbreviated_fixed_commit_is_rejected(tmp_path):
    repo, manifest_path = _fixture(tmp_path)
    manifest = json.loads(manifest_path.read_text())
    manifest["mutations"][0]["fixed_commit"] = manifest["mutations"][0]["fixed_commit"][:7]
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    _git(repo, "add", "manifest.json")
    _git(
        repo, "-c", "user.name=R4 Test", "-c", "user.email=r4@example.invalid",
        "commit", "-qm", "abbreviate fix id",
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest_path), "baseline")

    assert result.returncode != 0
    assert "full 40-hex object ID" in result.stderr


def test_unpinned_conftest_cannot_poison_collection(tmp_path):
    repo, manifest = _fixture(tmp_path)
    (repo / "conftest.py").write_text("raise RuntimeError('CONFTST-POISON')\n")
    _git(repo, "add", "conftest.py")
    _git(
        repo, "-c", "user.name=R4 Test", "-c", "user.email=r4@example.invalid",
        "commit", "-qm", "poison ambient conftest",
    )

    result = _run("--repo", str(repo), "--manifest", str(manifest), "baseline")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "CONFTST-POISON" not in result.stdout + result.stderr
