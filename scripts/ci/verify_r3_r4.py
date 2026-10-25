#!/usr/bin/env python3
"""Fail-closed, offline R3/R4 baseline and mutation verifier.

The standard library is intentionally sufficient for the runner itself.  The
manifest pins the interpreter and test dependencies used by child processes.
"""

from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
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


def _canonical_package_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def _load_manifest(repo: Path, path: Path) -> tuple[dict[str, Any], str]:
    try:
        manifest_relative = path.resolve().relative_to(repo).as_posix()
    except ValueError as exc:
        raise VerificationError("manifest must be inside the repository") from exc
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
    requirements = _object(environment.get("requirements"), "environment.requirements")
    requirements_path = _relative_path(
        repo, requirements.get("path"), "environment.requirements.path",
    ).relative_to(repo).as_posix()
    requirements_sha256 = str(requirements.get("sha256", ""))
    if not re.fullmatch(r"[0-9a-f]{64}", requirements_sha256):
        raise VerificationError("environment.requirements.sha256 must be lowercase SHA-256")
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
    input_hashes: dict[str, str] = {}
    for index, raw in enumerate(inputs):
        item = _object(raw, f"inputs[{index}]")
        resolved = _relative_path(repo, item.get("path"), f"inputs[{index}].path")
        relative = resolved.relative_to(repo).as_posix()
        if relative in input_paths:
            raise VerificationError(f"duplicate input path: {relative}")
        input_paths.add(relative)
        if not re.fullmatch(r"[0-9a-f]{64}", str(item.get("sha256", ""))):
            raise VerificationError(f"inputs[{index}].sha256 must be lowercase SHA-256")
        input_hashes[relative] = item["sha256"]
    if input_hashes.get(requirements_path) != requirements_sha256:
        raise VerificationError(
            "environment.requirements must reference a pinned input with the same SHA-256",
        )
    requirements_file = _relative_path(repo, requirements_path, "environment.requirements.path")
    if not requirements_file.is_file():
        raise VerificationError(f"pinned requirements file is missing: {requirements_path}")
    requirement_pins: dict[str, str] = {}
    for line_number, raw_line in enumerate(requirements_file.read_text().splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;]+)", line)
        if match is None:
            raise VerificationError(
                f"requirements line {line_number} must be an exact name==version pin",
            )
        name, version = _canonical_package_name(match.group(1)), match.group(2)
        if name in requirement_pins:
            raise VerificationError(f"duplicate requirements pin: {name}")
        requirement_pins[name] = version
    expected_pins = {
        _canonical_package_name(name): version for name, version in packages.items()
    }
    if requirement_pins != expected_pins:
        raise VerificationError(
            "environment.packages and the pinned requirements file must match exactly",
        )

    pytest_config = _object(manifest.get("pytest"), "pytest")
    if pytest_config.get("conftest_policy") != "disabled":
        raise VerificationError("pytest.conftest_policy must be 'disabled'")
    nodes = _strings(pytest_config.get("required_nodes"), "pytest.required_nodes")
    if any("::" not in node for node in nodes):
        raise VerificationError("every required node must be an exact pytest node ID")
    for node in nodes:
        file_portion = node.split("::", 1)[0]
        normalized = _relative_path(repo, file_portion, "required node file").relative_to(repo).as_posix()
        if file_portion != normalized:
            raise VerificationError(
                f"required node file must use a normalized repository-relative path: {file_portion}",
            )
        if normalized not in input_paths:
            raise VerificationError(f"required node file is not a pinned input: {normalized}")
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
        if not isinstance(fixed_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", fixed_commit):
            raise VerificationError(
                f"mutation {mutation_id} fixed_commit must be a full 40-hex object ID",
            )
        if not isinstance(mutation.get("oracle_class"), str) or not mutation["oracle_class"]:
            raise VerificationError(f"mutation {mutation_id} lacks oracle_class")
    return manifest, manifest_relative


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


def _require_tracked_clean(repo: Path, relative_path: str, label: str) -> None:
    tracked = _git(repo, "ls-files", "--error-unmatch", "--", relative_path)
    if tracked.returncode != 0:
        raise VerificationError(f"{label} must be tracked: {relative_path}")
    clean = _git(repo, "diff", "--quiet", "HEAD", "--", relative_path)
    if clean.returncode != 0:
        raise VerificationError(f"{label} must be tracked and clean: {relative_path}")


def _verify_repository(
    repo: Path, manifest: dict[str, Any], manifest_relative: str,
) -> tuple[str, dict[str, str]]:
    root = _git(repo, "rev-parse", "--show-toplevel")
    if root.returncode != 0 or Path(root.stdout.strip()).resolve() != repo:
        raise VerificationError("--repo must be the root of a git worktree")
    head = _git(repo, "rev-parse", "HEAD")
    if head.returncode != 0:
        raise VerificationError("repository has no committed HEAD")
    _require_tracked_clean(repo, manifest_relative, "manifest")
    for item in manifest["inputs"]:
        _require_tracked_clean(repo, item["path"], "pinned input")
        path = _relative_path(repo, item["path"], "input path")
        if not path.is_file():
            raise VerificationError(f"pinned input is missing: {item['path']}")
        actual = _sha256(path)
        if actual != item["sha256"]:
            raise VerificationError(
                f"input SHA-256 mismatch for {item['path']}: expected {item['sha256']}, got {actual}",
            )
    resolved_fixed_commits: dict[str, str] = {}
    for mutation in manifest["mutations"]:
        _require_tracked_clean(repo, mutation["patch"], "mutation patch")
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
        resolved = commit.stdout.strip()
        if resolved != mutation["fixed_commit"]:
            raise VerificationError(
                f"mutation {mutation['id']} fixed_commit did not resolve exactly: "
                f"{mutation['fixed_commit']} -> {resolved}",
            )
        resolved_fixed_commits[mutation["id"]] = resolved
    return head.stdout.strip(), resolved_fixed_commits


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
import json
import os
import sys
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

def pytest_configure(config):
    request = os.environ.get("R3_R4_MUTATION_REQUEST")
    config._r3_r4_mutation = None
    if request is None:
        return
    request = json.loads(request)
    state = {
        "schema_version": 1,
        "node": request["node"],
        "reports": [],
        "trace_intact": True,
        "hunks": [dict(hunk, executed_lines=[]) for hunk in request["hunks"]],
    }
    targets = {}
    for index, hunk in enumerate(state["hunks"]):
        filename = os.path.abspath(os.path.join(request["root"], hunk["path"]))
        lines = targets.setdefault(filename, {})
        for line in hunk["lines"]:
            lines.setdefault(line, []).append(index)
    config._r3_r4_mutation = (request, state, targets)

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_call(item):
    capture = item.config._r3_r4_mutation
    if capture is None:
        yield
        return
    request, state, targets = capture
    previous = sys.gettrace()

    def trace(frame, event, arg):
        lines = targets.get(frame.f_code.co_filename)
        if lines is None:
            return None
        if event == "line":
            for index in lines.get(frame.f_lineno, ()):
                executed = state["hunks"][index]["executed_lines"]
                if frame.f_lineno not in executed:
                    executed.append(frame.f_lineno)
        return trace

    sys.settrace(trace)
    try:
        yield
    finally:
        state["trace_intact"] = state["trace_intact"] and sys.gettrace() is trace
        sys.settrace(previous)

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    capture = item.config._r3_r4_mutation
    if capture is None:
        return
    request, state, targets = capture
    exception = call.excinfo.value if call.excinfo is not None else None
    state["reports"].append({
        "node": item.nodeid,
        "phase": call.when,
        "outcome": report.outcome,
        "exception_type": (
            type(exception).__module__ + "." + type(exception).__qualname__
            if exception is not None else None
        ),
        "is_assertion_error": isinstance(exception, AssertionError),
        "exception_message": str(exception) if exception is not None else None,
    })

def pytest_sessionfinish(session, exitstatus):
    capture = session.config._r3_r4_mutation
    if capture is None or session.config.option.collectonly:
        return
    request, state, targets = capture
    for hunk in state["hunks"]:
        hunk["executed_lines"].sort()
    with open(request["output"], "x", encoding="utf-8") as stream:
        json.dump(state, stream, indent=2, sort_keys=True)
'''


def _test_environment(
    repo: Path, manifest: dict[str, Any], guard_dir: Path,
) -> dict[str, str]:
    env = os.environ.copy()
    # Only this verifier may supply the per-mutant runtime-evidence request.
    env.pop("R3_R4_MUTATION_REQUEST", None)
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


def _prepare_artifacts(repo: Path, requested: Path | None) -> Path:
    if requested is None:
        parent = repo / "artifacts"
        parent.mkdir(parents=True, exist_ok=True)
        return Path(tempfile.mkdtemp(prefix="r3-r4-science-", dir=parent)).resolve()
    raw = requested if requested.is_absolute() else Path.cwd() / requested
    if raw.is_symlink():
        raise VerificationError("artifact directory cannot be a symlink")
    artifacts = raw.resolve()
    if artifacts.exists():
        if not artifacts.is_dir() or any(artifacts.iterdir()):
            raise VerificationError("artifact directory must be absent or empty")
    else:
        artifacts.mkdir(parents=True, mode=0o700)
    return artifacts


@contextmanager
def _detached_worktree(source_repo: Path, commit: str, label: str):
    temp_root = Path(tempfile.mkdtemp(prefix=f"r3-r4-{label}-"))
    added = False
    try:
        add = _git(source_repo, "worktree", "add", "--detach", str(temp_root), commit, timeout=60)
        if add.returncode != 0:
            raise VerificationError(f"cannot create detached {label} worktree: {add.stderr}")
        added = True
        yield temp_root
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
            "--noconftest", "--collect-only", "-q", *nodes,
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
    if junit_path.exists():
        raise VerificationError(f"refusing to replace preexisting JUnit artifact: {junit_path}")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{junit_path.name}.", suffix=".tmp", dir=junit_path.parent,
    )
    os.close(descriptor)
    temporary_path = Path(temporary_name)
    temporary_path.unlink()
    try:
        result = _run_process(
            [
                sys.executable, "-m", "pytest", "-p", "r3_r4_pytest_guard",
                "--noconftest", "-q", "-o", "xfail_strict=True",
                f"--junitxml={temporary_path}", *nodes,
            ],
            cwd=repo,
            env=env,
            timeout=manifest["pytest"]["timeout_seconds"],
            label=label,
        )
        counts = _junit_counts(temporary_path)
        os.replace(temporary_path, junit_path)
        return result, counts
    finally:
        temporary_path.unlink(missing_ok=True)


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


def _mutation_execution_hunks(
    repo: Path, mutation: dict[str, Any],
) -> list[dict[str, Any]]:
    """Derive new-side line targets from the applied diff, never stale headers.

    Every changed hunk must execute an added nonblank/noncomment line during
    the test call. Deletion-only hunks fail closed: nearby unchanged execution
    cannot establish that a removed scientific operation was exercised.
    """
    hunks: list[dict[str, Any]] = []
    header = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")
    for file_name in mutation["production_files"]:
        diff = _git(
            repo, "diff", "--no-ext-diff", "--no-color", "--no-renames",
            "--unified=3", "--", file_name,
        )
        if diff.returncode != 0:
            raise VerificationError(f"cannot inspect mutation {mutation['id']} diff: {diff.stderr}")
        current: dict[str, Any] | None = None
        new_line = 0
        file_hunks: list[dict[str, Any]] = []
        for line in diff.stdout.splitlines():
            match = header.match(line)
            if match:
                current = {"path": file_name, "lines": []}
                file_hunks.append(current)
                new_line = int(match.group(1))
            elif current is not None and line.startswith("+"):
                content = line[1:].strip()
                if content and not content.startswith("#"):
                    current["lines"].append(new_line)
                new_line += 1
            elif current is not None and line.startswith(" "):
                new_line += 1
        if not file_hunks:
            raise VerificationError(f"mutation {mutation['id']} has no production hunks in {file_name}")
        for hunk in file_hunks:
            if not hunk["lines"]:
                raise VerificationError(
                    f"mutation {mutation['id']} hunk in {file_name} has no added executable-line candidates"
                )
        hunks.extend(file_hunks)
    return hunks


def _validate_mutation_evidence(
    path: Path, mutation: dict[str, Any], hunks: list[dict[str, Any]],
) -> None:
    """Accept only a marked call AssertionError with changed-hunk execution."""
    label = f"mutation {mutation['id']}"
    try:
        evidence = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise VerificationError(f"{label} missing or invalid runtime evidence: {exc}") from exc
    if (
        not isinstance(evidence, dict)
        or evidence.get("schema_version") != 1
        or evidence.get("node") != mutation["node"]
    ):
        raise VerificationError(f"{label} runtime evidence identity mismatch")
    reports = evidence.get("reports")
    if (
        not isinstance(reports, list)
        or len(reports) != 3
        or any(not isinstance(report, dict) for report in reports)
        or [(report.get("node"), report.get("phase"), report.get("outcome")) for report in reports]
        != [(mutation["node"], phase, outcome) for phase, outcome in (
            ("setup", "passed"), ("call", "failed"), ("teardown", "passed"),
        )]
        or reports[1].get("is_assertion_error") is not True
        or not isinstance(reports[1].get("exception_type"), str)
    ):
        raise VerificationError(f"{label} requires a call-phase AssertionError with clean setup/teardown")
    message = reports[1].get("exception_message")
    if not isinstance(message, str) or not re.search(
        mutation["expected_assertion_regex"], message, re.MULTILINE,
    ):
        raise VerificationError(
            f"{label} expected assertion regex did not match the actual exception: "
            f"{mutation['expected_assertion_regex']!r}"
        )
    if evidence.get("trace_intact") is not True:
        raise VerificationError(f"{label} call-phase execution tracer was replaced")
    observed = evidence.get("hunks")
    if not isinstance(observed, list) or len(observed) != len(hunks):
        raise VerificationError(f"{label} production-hunk evidence mismatch")
    for expected, actual in zip(hunks, observed):
        if (
            not isinstance(actual, dict)
            or actual.get("path") != expected["path"]
            or actual.get("lines") != expected["lines"]
        ):
            raise VerificationError(f"{label} production-hunk evidence mismatch")
        executed = actual.get("executed_lines")
        if (
            not isinstance(executed, list)
            or not executed
            or any(type(line) is not int or line not in expected["lines"] for line in executed)
        ):
            raise VerificationError(
                f"{label} altered production hunk was not executed during the test call: "
                f"{expected['path']}:{expected['lines']}"
            )


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
        hunks = _mutation_execution_hunks(temp_root, mutation)
        evidence_path = (artifacts / f"mutant-{mutation['id']}.evidence.json").resolve()
        if evidence_path.exists():
            raise VerificationError(f"mutation runtime evidence already exists: {evidence_path}")
        env["R3_R4_MUTATION_REQUEST"] = json.dumps({
            "root": str(temp_root.resolve()), "node": node,
            "hunks": hunks, "output": str(evidence_path),
        })
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
        _validate_mutation_evidence(evidence_path, mutation, hunks)
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


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    if path.exists():
        raise VerificationError(f"refusing to replace preexisting summary: {path}")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(payload, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def run(argv: list[str] | None = None) -> int:
    args = _arguments(argv)
    repo = args.repo.resolve()
    manifest_path = args.manifest.resolve()
    manifest, manifest_relative = _load_manifest(repo, manifest_path)
    _verify_environment(manifest)
    base_commit, resolved_fixed_commits = _verify_repository(
        repo, manifest, manifest_relative,
    )
    artifacts = _prepare_artifacts(repo, args.artifacts)
    with tempfile.TemporaryDirectory(prefix="r3-r4-private-guard-") as guard_name:
        guard_dir = Path(guard_name)
        guard_dir.chmod(0o700)
        (guard_dir / "sitecustomize.py").write_text(_OFFLINE_GUARD)
        (guard_dir / "r3_r4_pytest_guard.py").write_text(_PYTEST_GUARD)
        with _detached_worktree(repo, base_commit, "baseline") as baseline_repo:
            baseline_env = _test_environment(baseline_repo, manifest, guard_dir)
            baseline = _baseline(baseline_repo, manifest, baseline_env, artifacts)
        summary: dict[str, Any] = {
            "schema_version": 1,
            "base_commit": base_commit,
            "baseline_worktree": "detached-head",
            "manifest_path": manifest_relative,
            "manifest_sha256": _sha256(manifest_path),
            "requirements": manifest["environment"]["requirements"],
            "resolved_fixed_commits": resolved_fixed_commits,
            "python_socket_guard": True,
            "baseline": baseline,
            "mutations": [],
            "scope_gaps": [
                "independent-real-GONG-PFSS-corpus",
                "playwright-and-load-lanes",
                "global-typescript-zero-error-gate",
                "multi-worker-global-coordinator-and-process-release-integration",
                "immutable-action-container-and-os-network-attestation",
                "github-required-check-and-branch-protection-configuration",
            ],
        }
        if args.mode in ("mutations", "all"):
            summary["mutations"] = [
                _mutation(repo, base_commit, mutation, manifest, guard_dir, artifacts)
                for mutation in manifest["mutations"]
            ]
    _atomic_write_json(artifacts / "summary.json", summary)
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
