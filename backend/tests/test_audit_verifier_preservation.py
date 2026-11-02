"""TOOL108: rejected verification preserves retained evidence; owned Git fixtures only."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/verify_artifacts.py"


def owned_environment():
    return {**{key: value for key, value in os.environ.items() if not key.startswith("GIT_")},
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "PYTHONDONTWRITEBYTECODE": "1"}


def git(root, *args):
    result = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=5,
                            env=owned_environment())
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def fixture(tmp_path, existing):
    root = tmp_path / "owned-repository"
    root.mkdir()
    git(root, "init", "--quiet")
    source = root / "source.txt"
    source.write_bytes(b"OWNED SYNTHETIC SOURCE\n")
    git(root, "add", "--", "source.txt")
    git(root, "-c", "user.name=Owned Fixture", "-c", "user.email=fixture@example.invalid",
        "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "owned fixture")
    revision = git(root, "rev-parse", "HEAD")
    snapshot = tmp_path / "owned-snapshot"
    snapshot.mkdir()
    (snapshot / "source.txt").write_bytes(source.read_bytes())
    evidence = root / "agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE"
    evidence.mkdir(parents=True)
    script = evidence / "verify_artifacts.py"
    script.write_bytes(SCRIPT.read_bytes())
    branches = {"workspace_head": revision, "snapshots": [{"label": "owned", "commit": revision,
                "tree": git(root, "rev-parse", "HEAD^{tree}"), "path": str(snapshot)}]}
    (evidence / "branches.json").write_text(json.dumps(branches))
    report = evidence.parent / "CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md"
    report.write_text("\n".join([f"| SCN-{i:03} · {'RESOLVED:' if i <= 10 else 'open'} |" for i in range(1, 50)]
                                 + [f"### SCN-{i:03} · owned" for i in range(50, 65)]) + "\n")
    (evidence / "README.md").write_text("Owned synthetic fixture, not historical audit evidence.\n")
    if existing:
        (evidence / "inventory.json").write_bytes(b"PRESERVE OWNED OLD INVENTORY\n")
        (evidence / "MANIFEST.sha256").write_bytes(b"PRESERVE OWNED OLD MANIFEST\n")
    return root, evidence, snapshot, report, branches


def retained(evidence):
    result = {}
    for name in ("inventory.json", "MANIFEST.sha256"):
        path = evidence / name
        result[name] = (path.read_bytes(), path.stat().st_mtime_ns, path.stat().st_ino) if path.exists() else None
    return result


def execute(root, evidence):
    result = subprocess.run([sys.executable, str(evidence / "verify_artifacts.py")], cwd=root,
                            capture_output=True, text=True, timeout=10,
                            env=owned_environment())
    assert "Traceback" not in result.stdout
    return result


@pytest.mark.parametrize("existing", [False, True])
@pytest.mark.parametrize("violation", ["link", "head", "unstaged", "staged", "snapshot_changed", "snapshot_missing"])
def test_rejected_verification_preserves_retained_outputs(tmp_path, existing, violation):
    root, evidence, snapshot, report, branches = fixture(tmp_path, existing)
    if violation == "link":
        report.write_text(report.read_text() + "\n[missing owned link](absent-owned-target)\n")
    elif violation == "head":
        branches["workspace_head"] = "0" * 40
        (evidence / "branches.json").write_text(json.dumps(branches))
    elif violation in ("unstaged", "staged"):
        (root / "source.txt").write_bytes(b"OWNED CHANGE\n")
        if violation == "staged":
            git(root, "add", "--", "source.txt")
    elif violation == "snapshot_changed":
        (snapshot / "source.txt").write_bytes(b"OWNED SNAPSHOT CHANGE\n")
    elif violation == "snapshot_missing":
        # Rename, do not delete: this fresh fixture remains recoverable.
        (snapshot / "source.txt").rename(snapshot / "saved-source.txt")
    before = retained(evidence)
    result = execute(root, evidence)
    assert result.returncode != 0
    assert "AssertionError" in result.stderr
    assert '"verification": "passed"' not in result.stdout
    assert retained(evidence) == before, f"rejected {violation} verification modified retained evidence"


@pytest.mark.parametrize("existing", [False, True])
def test_control_valid_verification_publishes_inventory_and_matching_manifest(tmp_path, existing):
    root, evidence, _, _, _ = fixture(tmp_path, existing)
    result = execute(root, evidence)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["verification"] == "passed"
    inventory = json.loads((evidence / "inventory.json").read_text())
    assert inventory["workspace_head_unchanged"] is True
    assert inventory["branches"][0]["tracked_blobs"] == 1
    assert inventory["branches"][0]["changed_snapshot_tracked_files"] == []
    assert inventory["branches"][0]["missing_snapshot_tracked_files"] == []
    manifest = dict(line.split("  ", 1)[::-1] for line in (evidence / "MANIFEST.sha256").read_text().splitlines())
    assert "inventory.json" in manifest
    assert "MANIFEST.sha256" not in manifest
    for name, digest in manifest.items():
        assert hashlib.sha256((evidence / name).read_bytes()).hexdigest() == digest


def test_control_early_tracker_failure_already_preserves_outputs(tmp_path):
    root, evidence, _, report, _ = fixture(tmp_path, True)
    report.write_text("Owned invalid tracker\n")
    before = retained(evidence)
    result = execute(root, evidence)
    assert result.returncode != 0
    assert "AssertionError" in result.stderr
    assert retained(evidence) == before
