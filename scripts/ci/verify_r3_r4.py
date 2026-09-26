#!/usr/bin/env python3
"""Fail-closed, offline R3/R4 baseline and mutation verifier.

The standard library is intentionally sufficient for the runner itself.  The
manifest pins the interpreter and test dependencies used by child processes.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any
import xml.etree.ElementTree as ET


class VerificationError(RuntimeError):
    """A release gate could not produce valid evidence."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise VerificationError(f"{label} must be an object")
    return value


def _strings(value: Any, label: str, *, nonempty: bool = True) -> list[str]:
    if not isinstance(value, list) or (nonempty and not value):
        raise VerificationError(f"{label} must be a{' nonempty' if nonempty else ''} list")
    if not all(isinstance(item, str) and item for item in value):
        raise VerificationError(f"{label} must contain nonempty strings")
    if len(value) != len(set(value)):
        raise VerificationError(f"{label} contains duplicates")
    return value


def _relative_path(repo: Path, value: Any, label: str) -> Path:
    if not isinstance(value, str) or not value:
        raise VerificationError(f"{label} must be a nonempty repository-relative path")
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise VerificationError(f"{label} must stay inside the repository")
    resolved = (repo / candidate).resolve()
    try:
        resolved.relative_to(repo)
    except ValueError as exc:
        raise VerificationError(f"{label} escapes the repository") from exc
    return resolved


def _load_manifest(repo: Path, path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise VerificationError(f"cannot read manifest {path}: {exc}") from exc
    manifest = _object(manifest, "manifest")
    if manifest.get("schema_version") != 1:
        raise VerificationError("manifest schema_version must equal 1")

    environment = _object(manifest.get("environment"), "environment")
    if not isinstance(environment.get("python"), str):
        raise VerificationError("environment.python must be an exact version")
    packages = _object(environment.get("packages"), "environment.packages")
    if not packages or not all(
        isinstance(name, str) and name and isinstance(version, str) and version
        for name, version in packages.items()
    ):
        raise VerificationError("environment.packages must pin at least one exact version")
    variables = _object(environment.get("variables"), "environment.variables")
    required_variables = {
        "PYTHONHASHSEED": "0",
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
    }
    for name, expected in required_variables.items():
        if variables.get(name) != expected:
            raise VerificationError(f"environment.variables must set {name}={expected}")
    if not all(isinstance(k, str) and isinstance(v, str) for k, v in variables.items()):
        raise VerificationError("environment.variables keys and values must be strings")

    inputs = manifest.get("inputs")
    if not isinstance(inputs, list) or not inputs:
        raise VerificationError("inputs must be a nonempty list")
    input_paths: set[str] = set()
    for index, raw in enumerate(inputs):
        item = _object(raw, f"inputs[{index}]")
        resolved = _relative_path(repo, item.get("path"), f"inputs[{index}].path")
        relative = resolved.relative_to(repo).as_posix()
        if relative in input_paths:
            raise VerificationError(f"duplicate input path: {relative}")
        input_paths.add(relative)
        if not re.fullmatch(r"[0-9a-f]{64}", str(item.get("sha256", ""))):
            raise VerificationError(f"inputs[{index}].sha256 must be lowercase SHA-256")

    pytest_config = _object(manifest.get("pytest"), "pytest")
    nodes = _strings(pytest_config.get("required_nodes"), "pytest.required_nodes")
    if any("::" not in node for node in nodes):
        raise VerificationError("every required node must be an exact pytest node ID")
    pythonpath = _strings(pytest_config.get("pythonpath", []), "pytest.pythonpath", nonempty=False)
    for index, value in enumerate(pythonpath):
        _relative_path(repo, value, f"pytest.pythonpath[{index}]")
    timeout = pytest_config.get("timeout_seconds")
    if isinstance(timeout, bool) or not isinstance(timeout, int) or not 1 <= timeout <= 900:
        raise VerificationError("pytest.timeout_seconds must be an integer in [1, 900]")

    mutations = manifest.get("mutations")
    if not isinstance(mutations, list) or not mutations:
        raise VerificationError("mutations must be a nonempty list")
    mutation_ids: set[str] = set()
    for index, raw in enumerate(mutations):
        mutation = _object(raw, f"mutations[{index}]")
        mutation_id = mutation.get("id")
        if not isinstance(mutation_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", mutation_id):
            raise VerificationError(f"mutations[{index}].id is invalid")
        if mutation_id in mutation_ids:
            raise VerificationError(f"duplicate mutation id: {mutation_id}")
        mutation_ids.add(mutation_id)
        _relative_path(repo, mutation.get("patch"), f"mutations[{index}].patch")
        if not re.fullmatch(r"[0-9a-f]{64}", str(mutation.get("patch_sha256", ""))):
            raise VerificationError(f"mutation {mutation_id} has invalid patch_sha256")
        production_files = _strings(
            mutation.get("production_files"), f"mutation {mutation_id} production_files",
        )
        for file_name in production_files:
            _relative_path(repo, file_name, f"mutation {mutation_id} production file")
            if file_name not in input_paths:
                raise VerificationError(
                    f"mutation {mutation_id} production file is not a pinned input: {file_name}",
                )
        node = mutation.get("node")
        if node not in nodes:
            raise VerificationError(f"mutation {mutation_id} node is not baseline-required")
        regex = mutation.get("expected_assertion_regex")
        if not isinstance(regex, str) or not regex:
            raise VerificationError(f"mutation {mutation_id} lacks expected_assertion_regex")
        try:
            re.compile(regex)
        except re.error as exc:
            raise VerificationError(f"mutation {mutation_id} assertion regex is invalid: {exc}") from exc
        fixed_commit = mutation.get("fixed_commit")
        if not isinstance(fixed_commit, str) or not re.fullmatch(r"[0-9a-f]{7,64}", fixed_commit):
            raise VerificationError(f"mutation {mutation_id} fixed_commit must be a hexadecimal object ID")
        if not isinstance(mutation.get("oracle_class"), str) or not mutation["oracle_class"]:
            raise VerificationError(f"mutation {mutation_id} lacks oracle_class")
    return manifest


def _verify_environment(manifest: dict[str, Any]) -> None:
    expected_python = manifest["environment"]["python"]
    actual_python = ".".join(str(part) for part in sys.version_info[:3])
    mismatches = []
    if actual_python != expected_python:
        mismatches.append(f"python expected {expected_python}, got {actual_python}")
    for package, expected in manifest["environment"]["packages"].items():
        try:
            actual = metadata.version(package)
        except metadata.PackageNotFoundError:
            actual = "<missing>"
        if actual != expected:
            mismatches.append(f"{package} expected {expected}, got {actual}")
    if mismatches:
        raise VerificationError("environment mismatch: " + "; ".join(mismatches))


def _git(repo: Path, *args: str, timeout: int = 30) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["git", "-C", str(repo), *args], text=True, capture_output=True,
            timeout=timeout, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise VerificationError(f"git {' '.join(args)} failed: {exc}") from exc


def _verify_repository(repo: Path, manifest: dict[str, Any]) -> str:
    root = _git(repo, "rev-parse", "--show-toplevel")
    if root.returncode != 0 or Path(root.stdout.strip()).resolve() != repo:
        raise VerificationError("--repo must be the root of a git worktree")
    head = _git(repo, "rev-parse", "HEAD")
    if head.returncode != 0:
        raise VerificationError("repository has no committed HEAD")
    pinned_paths = []
    for item in manifest["inputs"]:
        path = _relative_path(repo, item["path"], "input path")
        if not path.is_file():
            raise VerificationError(f"pinned input is missing: {item['path']}")
        actual = _sha256(path)
        if actual != item["sha256"]:
            raise VerificationError(
                f"input SHA-256 mismatch for {item['path']}: expected {item['sha256']}, got {actual}",
            )
        pinned_paths.append(item["path"])
    clean = _git(repo, "diff", "--quiet", "HEAD", "--", *pinned_paths)
    if clean.returncode != 0:
        raise VerificationError("pinned inputs differ from committed HEAD")
    for mutation in manifest["mutations"]:
        patch = _relative_path(repo, mutation["patch"], "mutation patch")
        if not patch.is_file():
            raise VerificationError(f"mutation patch is missing: {mutation['patch']}")
        actual = _sha256(patch)
        if actual != mutation["patch_sha256"]:
            raise VerificationError(
                f"patch SHA-256 mismatch for {mutation['id']}: expected "
                f"{mutation['patch_sha256']}, got {actual}",
            )
        commit = _git(repo, "rev-parse", "--verify", f"{mutation['fixed_commit']}^{{commit}}")
        if commit.returncode != 0:
            raise VerificationError(
                f"mutation {mutation['id']} fixed_commit does not resolve: {mutation['fixed_commit']}",
            )
        ancestor = _git(repo, "merge-base", "--is-ancestor", commit.stdout.strip(), head.stdout.strip())
        if ancestor.returncode != 0:
            raise VerificationError(
                f"mutation {mutation['id']} fixed_commit is not an ancestor of HEAD: "
                f"{mutation['fixed_commit']}",
            )
    return head.stdout.strip()


_OFFLINE_GUARD = '''"""Injected by the R3/R4 verifier: reject outbound Python sockets."""
import socket

_original_connect = socket.socket.connect
_original_connect_ex = socket.socket.connect_ex
_original_sendto = socket.socket.sendto

def _is_local_unix(sock):
    return getattr(sock, "family", None) == getattr(socket, "AF_UNIX", object())

def _connect(sock, address):
    if _is_local_unix(sock):
        return _original_connect(sock, address)
    raise OSError("R3/R4 verification is offline: outbound socket denied")

def _connect_ex(sock, address):
    if _is_local_unix(sock):
        return _original_connect_ex(sock, address)
    raise OSError("R3/R4 verification is offline: outbound socket denied")

def _sendto(sock, data, *args):
    if _is_local_unix(sock):
        return _original_sendto(sock, data, *args)
    raise OSError("R3/R4 verification is offline: outbound socket denied")

def _create_connection(*args, **kwargs):
    raise OSError("R3/R4 verification is offline: outbound socket denied")

socket.socket.connect = _connect
socket.socket.connect_ex = _connect_ex
socket.socket.sendto = _sendto
socket.create_connection = _create_connection
'''


_PYTEST_GUARD = '''"""Reject non-evidence outcomes on required R3/R4 nodes."""
import pytest

def pytest_collection_modifyitems(items):
    forbidden = {"skip", "skipif", "xfail"}
    for item in items:
        markers = sorted({marker.name for marker in item.iter_markers()} & forbidden)
        if markers:
            joined = ",".join(markers)
            raise pytest.UsageError(
                f"R3/R4 skip/xfail marker forbidden on required node {item.nodeid}: {joined}"
            )
'''


def _test_environment(
    repo: Path, manifest: dict[str, Any], guard_dir: Path,
) -> dict[str, str]:
    env = os.environ.copy()
    env.update(manifest["environment"]["variables"])
    env.update({
        "TZ": "UTC",
        "LC_ALL": "C.UTF-8",
        "LANG": "C.UTF-8",
        "PYTEST_ADDOPTS": "",
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        "PYTEST_PLUGINS": "",
    })
    paths = [str(guard_dir)]
    paths.extend(
        str(_relative_path(repo, entry, "pytest.pythonpath"))
        for entry in manifest["pytest"]["pythonpath"]
    )
    env["PYTHONPATH"] = os.pathsep.join(paths)
    return env


def _run_process(
    command: list[str], *, cwd: Path, env: dict[str, str], timeout: int, label: str,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command, cwd=cwd, env=env, text=True, capture_output=True,
            timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise VerificationError(f"{label} timed out after {timeout}s") from exc
    except OSError as exc:
        raise VerificationError(f"{label} could not start: {exc}") from exc


def _collected_nodes(output: str) -> list[str]:
    return [
        line.strip() for line in output.splitlines()
        if "::" in line and not line.startswith((" ", "=", "<"))
    ]


def _collect_exact(
    repo: Path,
    nodes: list[str],
    manifest: dict[str, Any],
    env: dict[str, str],
    *,
    label: str,
) -> None:
    result = _run_process(
        [
            sys.executable, "-m", "pytest", "-p", "r3_r4_pytest_guard",
            "--collect-only", "-q", *nodes,
        ],
        cwd=repo,
        env=env,
        timeout=manifest["pytest"]["timeout_seconds"],
        label=f"{label} collection",
    )
    actual = _collected_nodes(result.stdout)
    if result.returncode != 0 or Counter(actual) != Counter(nodes) or len(actual) != len(nodes):
        details = (result.stdout + result.stderr)[-4000:]
        raise VerificationError(
            f"{label} collection failed: expected exactly {nodes!r}, got {actual!r}\n{details}",
        )


def _junit_counts(path: Path) -> dict[str, int]:
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError) as exc:
        raise VerificationError(f"missing or invalid JUnit artifact {path}: {exc}") from exc
    cases = list(root.iter("testcase"))
    failures = sum(case.find("failure") is not None for case in cases)
    errors = sum(case.find("error") is not None for case in cases)
    skipped = sum(case.find("skipped") is not None for case in cases)
    return {
        "tests": len(cases),
        "failures": failures,
        "errors": errors,
        "skipped": skipped,
        "passed": len(cases) - failures - errors - skipped,
    }


def _run_pytest(
    repo: Path,
    nodes: list[str],
    manifest: dict[str, Any],
    env: dict[str, str],
    junit_path: Path,
    *,
    label: str,
) -> tuple[subprocess.CompletedProcess[str], dict[str, int]]:
    junit_path.parent.mkdir(parents=True, exist_ok=True)
    result = _run_process(
        [
            sys.executable, "-m", "pytest", "-p", "r3_r4_pytest_guard",
            "-q", "-o", "xfail_strict=True",
            f"--junitxml={junit_path}", *nodes,
        ],
        cwd=repo,
        env=env,
        timeout=manifest["pytest"]["timeout_seconds"],
        label=label,
    )
    return result, _junit_counts(junit_path)


def _baseline(
    repo: Path, manifest: dict[str, Any], env: dict[str, str], artifacts: Path,
) -> dict[str, int]:
    nodes = manifest["pytest"]["required_nodes"]
    _collect_exact(repo, nodes, manifest, env, label="required-node")
    result, counts = _run_pytest(
        repo, nodes, manifest, env, artifacts / "baseline.xml", label="baseline",
    )
    if counts["skipped"]:
        raise VerificationError("baseline contains skip/xfail evidence, which is forbidden")
    if result.returncode != 0 or counts != {
        "tests": len(nodes), "failures": 0, "errors": 0, "skipped": 0, "passed": len(nodes),
    }:
        details = (result.stdout + result.stderr)[-4000:]
        raise VerificationError(f"baseline is not green: {counts}\n{details}")
    return {"collected": len(nodes), "passed": counts["passed"]}


def _mutation(
    source_repo: Path,
    base_commit: str,
    mutation: dict[str, Any],
    manifest: dict[str, Any],
    guard_dir: Path,
    artifacts: Path,
) -> dict[str, str]:
    source_hashes = {
        file_name: _sha256(_relative_path(source_repo, file_name, "mutation production file"))
        for file_name in mutation["production_files"]
    }
    temp_root = Path(tempfile.mkdtemp(prefix=f"r3-r4-mutant-{mutation['id']}-"))
    added = False
    try:
        add = _git(source_repo, "worktree", "add", "--detach", str(temp_root), base_commit, timeout=60)
        if add.returncode != 0:
            raise VerificationError(f"cannot create mutant worktree {mutation['id']}: {add.stderr}")
        added = True
        relative_patch = Path(mutation["patch"])
        patch = source_repo / relative_patch
        check = _git(temp_root, "apply", "--check", str(patch))
        if check.returncode != 0:
            raise VerificationError(f"mutation {mutation['id']} patch-not-applied: {check.stderr}")
        applied = _git(temp_root, "apply", str(patch))
        if applied.returncode != 0:
            raise VerificationError(f"mutation {mutation['id']} patch-not-applied: {applied.stderr}")
        changed = _git(temp_root, "diff", "--name-only")
        actual_files = {line for line in changed.stdout.splitlines() if line}
        expected_files = set(mutation["production_files"])
        if changed.returncode != 0 or actual_files != expected_files:
            raise VerificationError(
                f"mutation {mutation['id']} changed {sorted(actual_files)}, expected {sorted(expected_files)}",
            )
        whitespace = _git(temp_root, "diff", "--check")
        if whitespace.returncode != 0:
            raise VerificationError(f"mutation {mutation['id']} has an invalid patch: {whitespace.stdout}")

        env = _test_environment(temp_root, manifest, guard_dir)
        node = mutation["node"]
        try:
            _collect_exact(temp_root, [node], manifest, env, label="mutant")
        except VerificationError as exc:
            raise VerificationError(f"mutant collection failed for {mutation['id']}: {exc}") from exc
        result, counts = _run_pytest(
            temp_root,
            [node],
            manifest,
            env,
            artifacts / f"mutant-{mutation['id']}.xml",
            label=f"mutant {mutation['id']}",
        )
        if counts["skipped"]:
            raise VerificationError(f"mutation {mutation['id']} produced skip/xfail evidence")
        if result.returncode != 1 or counts != {
            "tests": 1, "failures": 1, "errors": 0, "skipped": 0, "passed": 0,
        }:
            details = (result.stdout + result.stderr)[-4000:]
            raise VerificationError(
                f"mutation {mutation['id']} was not killed by one test assertion: {counts}\n{details}",
            )
        evidence = result.stdout + result.stderr
        junit_text = (artifacts / f"mutant-{mutation['id']}.xml").read_text()
        if not re.search(mutation["expected_assertion_regex"], evidence + junit_text, re.MULTILINE):
            raise VerificationError(
                f"mutation {mutation['id']} expected assertion regex did not match: "
                f"{mutation['expected_assertion_regex']!r}",
            )
        return {"id": mutation["id"], "status": "killed", "node": node}
    finally:
        if added:
            remove = _git(source_repo, "worktree", "remove", "--force", str(temp_root), timeout=60)
            if remove.returncode != 0:
                shutil.rmtree(temp_root, ignore_errors=True)
                _git(source_repo, "worktree", "prune", timeout=30)
            else:
                shutil.rmtree(temp_root, ignore_errors=True)
        else:
            shutil.rmtree(temp_root, ignore_errors=True)
        drifted = [
            file_name for file_name, expected in source_hashes.items()
            if _sha256(_relative_path(source_repo, file_name, "mutation production file")) != expected
        ]
        if drifted:
            raise VerificationError(
                f"source worktree changed while running mutation {mutation['id']}: {drifted}",
            )


def _arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path)
    parser.add_argument("mode", choices=("baseline", "mutations", "all"))
    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> int:
    args = _arguments(argv)
    repo = args.repo.resolve()
    manifest_path = args.manifest.resolve()
    artifacts = (args.artifacts or (repo / "artifacts/r3-r4-science")).resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    guard_dir = artifacts / "offline-python"
    guard_dir.mkdir(parents=True, exist_ok=True)
    (guard_dir / "sitecustomize.py").write_text(_OFFLINE_GUARD)
    (guard_dir / "r3_r4_pytest_guard.py").write_text(_PYTEST_GUARD)

    manifest = _load_manifest(repo, manifest_path)
    _verify_environment(manifest)
    base_commit = _verify_repository(repo, manifest)
    env = _test_environment(repo, manifest, guard_dir)
    summary: dict[str, Any] = {
        "schema_version": 1,
        "base_commit": base_commit,
        "manifest_sha256": _sha256(manifest_path),
        "python_socket_guard": True,
        "baseline": _baseline(repo, manifest, env, artifacts),
        "mutations": [],
        "scope_gaps": [
            "independent-real-GONG-PFSS-corpus",
            "playwright-and-load-lanes",
            "global-typescript-zero-error-gate",
            "multi-worker-global-coordinator-and-process-release-integration",
            "immutable-container-attestation",
        ],
    }
    if args.mode in ("mutations", "all"):
        summary["mutations"] = [
            _mutation(repo, base_commit, mutation, manifest, guard_dir, artifacts)
            for mutation in manifest["mutations"]
        ]
    (artifacts / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def main() -> int:
    try:
        return run()
    except VerificationError as exc:
        print(f"R3/R4 verification failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
