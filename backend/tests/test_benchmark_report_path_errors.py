"""PEER-g/P013: real HTTP + native report writer in an owned temporary tree."""
# Regression: PEER-g / P013 — invalid native report output paths returned 500.
# Found by /qa on 2026-10-24.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
from __future__ import annotations

import errno
import json
import os
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import benchmark.accuracy as accuracy
import server


ROUTE = "/benchmark/accuracy/report"
SENTINEL = "# owned original report\n"
KEY = "test-key-peer-g-owned-synthetic"


class Admission:
    def __init__(self):
        self.raw = threading.BoundedSemaphore(1)
        self.acquired = 0

    def acquire(self, *args, **kwargs):
        accepted = self.raw.acquire(*args, **kwargs)
        if accepted:
            self.acquired += 1
        return accepted

    def release(self):
        self.raw.release()


@pytest.fixture
def owned(monkeypatch, tmp_path):
    # All native filesystem operations, including deliberately invalid targets,
    # are beneath this owned directory. No repository report fixture is written.
    with tempfile.TemporaryDirectory(prefix="peer-g-", dir=tmp_path) as name:
        root = Path(name)
        reports = root / "reports"
        reports.mkdir()
        scenarios = root / "owned-scenarios.json"
        fixed = root / "owned-fixed.json"
        scenarios.write_text("[]", encoding="utf-8")
        fixed.write_text("[]", encoding="utf-8")
        f = SimpleNamespace(root=root, reports=reports, scenarios=scenarios, fixed=fixed,
                            calls=[], failures=[], after_benchmark=None, guard=Admission())
        native_benchmark = accuracy.benchmark_against_references
        native_writer = accuracy.generate_accuracy_report

        def bounded_benchmark(bodies, **kwargs):
            f.calls.append("benchmark")
            kwargs["scenarios_path"] = f.scenarios
            kwargs["fixed_state_path"] = f.fixed
            result = native_benchmark(bodies, **kwargs)
            if f.after_benchmark:
                f.after_benchmark()
            return result

        def observed_writer(*args, **kwargs):
            f.calls.append("writer")
            try:
                return native_writer(*args, **kwargs)
            except OSError as exc:
                f.failures.append({"type": type(exc).__name__, "errno": exc.errno})
                raise

        monkeypatch.setattr(server.app, "middleware_stack", None)
        monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
            "SOLAR_SECURITY_PROFILE": "local"}))
        monkeypatch.setattr(server, "BENCHMARK_REPORTS_DIR", reports)
        monkeypatch.setattr(server, "_benchmark_concurrent_guard", f.guard)
        monkeypatch.setattr(accuracy, "benchmark_against_references", bounded_benchmark)
        monkeypatch.setattr(server, "generate_accuracy_report", observed_writer)
        with ThreadPoolExecutor(max_workers=1) as executor:
            monkeypatch.setattr(server, "_heavy_compute_executor", executor)
            client = TestClient(server.app, base_url="http://localhost",
                                client=("127.0.0.1", 32123), raise_server_exceptions=False)
            f.client = client
            try:
                yield f
            finally:
                client.close()


def post(f, path=None, *, overwrite=False, headers=None):
    payload = {"ephemeris_provider": "kepler", "allow_overwrite": overwrite}
    if path is not None:
        payload["output_path"] = path
    response = f.client.post(ROUTE, json=payload, headers=headers or {})
    print(json.dumps({"path_kind": "default" if path is None else "supplied",
                      "characters": None if path is None else len(path),
                      "encoded_bytes": None if path is None else len(os.fsencode(path)),
                      "overwrite": overwrite, "status": response.status_code,
                      "detail": response.json().get("detail"),
                      "phases": f.calls, "native_failures": f.failures,
                      "admissions": f.guard.acquired}, ensure_ascii=True))
    assert str(f.root) not in response.text
    deadline = time.monotonic() + 1
    while not f.guard.raw.acquire(blocking=False):
        assert time.monotonic() < deadline, "owned report permit did not return"
        time.sleep(.001)
    f.guard.raw.release()
    return response


def error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["retryable"] is False


@pytest.mark.parametrize("kind,overwrite", [
    ("long-ascii", False), ("long-ascii", True),
    ("long-utf8", False), ("long-utf8", True),
    ("long-parent", False), ("long-parent", True),
    ("directory", True),
])
def test_invalid_native_output_target_is_a_client_error(owned, kind, overwrite):
    f = owned
    if kind == "long-ascii":
        path = "x" * 260 + ".md"
    elif kind == "long-utf8":
        path = "é" * 130 + ".md"
    elif kind == "long-parent":
        path = "x" * 260 + "/result.md"
    elif kind == "directory":
        path = "target.md"
        (f.reports / path).mkdir()
        (f.reports / path / "sentinel").write_text(SENTINEL, encoding="utf-8")
    response = post(f, path, overwrite=overwrite)
    error(response, 400, "invalid_report_path")
    if kind == "directory":
        assert (f.reports / path / "sentinel").read_text(encoding="utf-8") == SENTINEL
    else:
        assert list(f.reports.iterdir()) == []


@pytest.mark.parametrize("name", ["nested/fresh.md", None, "x" * 252 + ".md", "é" * 126 + ".md"])
def test_control_native_writer_keeps_valid_paths_and_actual_markdown(owned, name):
    response = post(owned, name)
    assert response.status_code == 200, response.text
    logical = Path(response.json()["reportPath"])
    assert not logical.is_absolute() and logical.parts[0] == "reports"
    target = owned.reports.joinpath(*logical.parts[1:])
    assert target.read_text(encoding="utf-8").startswith("# Trajectory Accuracy Benchmark Report")
    assert owned.calls == ["writer", "benchmark"]
    assert response.json()["summary"]["referenceFile"] == owned.scenarios.name


@pytest.mark.parametrize("overwrite", [False, True])
def test_control_existing_file_keeps_explicit_overwrite_policy(owned, overwrite):
    target = owned.reports / "existing.md"
    target.write_text(SENTINEL, encoding="utf-8")
    response = post(owned, target.name, overwrite=overwrite)
    if overwrite:
        assert response.status_code == 200
        assert target.read_text(encoding="utf-8").startswith("# Trajectory Accuracy Benchmark Report")
        assert owned.calls == ["writer", "benchmark"]
    else:
        error(response, 409, "benchmark_report_exists")
        assert target.read_text(encoding="utf-8") == SENTINEL
        assert "benchmark" not in owned.calls


def test_control_existing_directory_default_remains_exclusive_conflict(owned):
    target = owned.reports / "existing.md"
    target.mkdir()
    response = post(owned, target.name)
    error(response, 409, "benchmark_report_exists")
    assert target.is_dir() and list(target.iterdir()) == []
    assert "benchmark" not in owned.calls


def test_control_native_exclusive_create_still_wins_a_post_benchmark_race(owned):
    target = owned.reports / "raced.md"
    owned.after_benchmark = lambda: target.write_text(SENTINEL, encoding="utf-8")
    response = post(owned, target.name)
    error(response, 409, "benchmark_report_exists")
    assert owned.calls == ["writer", "benchmark"]
    assert target.read_text(encoding="utf-8") == SENTINEL


@pytest.mark.parametrize("path,status,code", [
    ("bad\x00.md", 422, "trajectory_request_validation_error"),
    ("bad\n.md", 422, "trajectory_request_validation_error"),
    ("../escape.md", 400, "invalid_report_path"),
    ("wrong.txt", 400, "invalid_report_path"),
])
def test_control_existing_path_guards_reject_before_native_work(owned, path, status, code):
    response = post(owned, path)
    error(response, status, code)
    assert owned.calls == [] and owned.guard.acquired == 0
    assert list(owned.reports.iterdir()) == []


@pytest.mark.parametrize("key", [None, "wrong-owned-key"])
def test_control_authentication_precedes_invalid_output_target(owned, monkeypatch, key):
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": KEY}))
    response = post(owned, "x" * 260 + ".md", headers={} if key is None else {"x-api-key": key})
    assert response.status_code == 401
    assert owned.calls == [] and owned.guard.acquired == 0
    assert list(owned.reports.iterdir()) == []


def test_control_authenticated_native_write_keeps_private_cache_policy(owned, monkeypatch):
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": KEY}))
    response = post(owned, "authenticated.md", headers={"x-api-key": KEY})
    assert response.status_code == 200
    assert "private" in response.headers["cache-control"]
    assert "no-store" in response.headers["cache-control"]
    assert (owned.reports / "authenticated.md").is_file()


@pytest.mark.parametrize("code", [errno.EACCES, errno.ENOSPC, errno.EIO])
def test_control_operational_output_io_errors_remain_sanitized_server_errors(owned, monkeypatch, code):
    target = owned.reports / "operational.md"
    native_open = Path.open
    def controlled_open(path, mode="r", *args, **kwargs):
        if path == target and mode == "x":
            raise OSError(code, "owned operational output failure", str(path))
        return native_open(path, mode, *args, **kwargs)
    monkeypatch.setattr(Path, "open", controlled_open)
    response = post(owned, target.name)
    error(response, 500, "benchmark_report_failed")
    assert owned.calls == ["writer", "benchmark"] and not target.exists()


@pytest.mark.parametrize("kind", ["long-source", "directory-source"])
def test_control_native_reference_path_errors_are_not_misclassified_as_output_input(owned, kind):
    if kind == "long-source":
        owned.scenarios = owned.root / ("s" * 260 + ".json")
    else:
        owned.scenarios = owned.root / "source-directory.json"
        owned.scenarios.mkdir()
    response = post(owned, "valid-output.md")
    error(response, 500, "benchmark_report_failed")
    assert owned.calls == ["writer", "benchmark"]
    assert not (owned.reports / "valid-output.md").exists()


def test_control_bounded_depth_remains_accepted_without_new_policy(owned):
    # Bounded characterization, not an exhaustion attempt or proposed depth cap.
    name = "/".join(["d"] * 12 + ["result.md"])
    response = post(owned, name)
    assert response.status_code == 200
    assert (owned.reports / name).is_file()


# Append-only implementation-contract supplement. The preceding 28-case source
# is immutable. These tests select the proposed typed-error boundary, not 18 new
# observed product bugs. They run the native writer before checking its new type.
_PUBLIC_OUTPUT_PATH_MESSAGE = "The report output path is invalid."


class _WriteFailure:
    def __init__(self, handle, failure):
        self.handle = handle
        self.failure = failure

    def __enter__(self):
        self.handle.__enter__()
        return self

    def __exit__(self, *args):
        return self.handle.__exit__(*args)

    def write(self, _text):
        raise self.failure


def _fail_output_operation(monkeypatch, target, phase, failure):
    """Inject one owned output-operation fault; native benchmark stays active."""
    if phase in ("exists", "is_symlink"):
        original = getattr(Path, phase)
        def check(path, *args, **kwargs):
            if path == target:
                raise failure
            return original(path, *args, **kwargs)
        monkeypatch.setattr(Path, phase, check)
    elif phase == "mkdir":
        original = Path.mkdir
        def mkdir(path, *args, **kwargs):
            if path == target.parent:
                raise failure
            return original(path, *args, **kwargs)
        monkeypatch.setattr(Path, "mkdir", mkdir)
    else:
        original = Path.open
        expected_mode = "w" if phase.endswith("_w") else "x"
        def open_file(path, mode="r", *args, **kwargs):
            if path == target and mode == expected_mode:
                if phase.startswith("open_"):
                    raise failure
                return _WriteFailure(original(path, mode, *args, **kwargs), failure)
            return original(path, mode, *args, **kwargs)
        monkeypatch.setattr(Path, "open", open_file)


def _direct_native_report(owned, target, overwrite=False):
    return accuracy.generate_accuracy_report(
        [], output_path=target, ephemeris_provider="kepler",
        allow_overwrite=overwrite,
    )


@pytest.mark.parametrize("phase,code", [
    ("exists", errno.ENAMETOOLONG),
    ("is_symlink", errno.ENAMETOOLONG),
    ("mkdir", errno.ENAMETOOLONG),
    ("open_x", errno.EISDIR),
    ("write_x", errno.EISDIR),
    ("open_w", errno.EISDIR),
    ("write_w", errno.EISDIR),
])
def test_selected_output_boundary_preserves_original_cause_and_safe_type(
    owned, monkeypatch, phase, code
):
    target = owned.reports / "selected-contract.md"
    original = OSError(code, "owned private output diagnostic", str(target))
    _fail_output_operation(monkeypatch, target, phase, original)
    with pytest.raises(Exception) as caught:
        _direct_native_report(owned, target, overwrite=phase.endswith("_w"))

    # All operations actually execute first even before the proposed class exists.
    error_type = getattr(accuracy, "InvalidReportOutputPathError", None)
    assert error_type is not None, "selected typed output error has not been implemented"
    import benchmark
    assert getattr(benchmark, "InvalidReportOutputPathError", None) is error_type
    assert type(caught.value) is error_type
    assert caught.value.__cause__ is original
    assert str(caught.value) == _PUBLIC_OUTPUT_PATH_MESSAGE
    assert str(target) not in str(caught.value)
    assert "owned private output diagnostic" not in str(caught.value)
    assert owned.calls == ([] if phase in ("exists", "is_symlink") else ["benchmark"])
    # Before open/write no new output exists. Mid-write failure is NOT an
    # atomic-output guarantee: current native open has already created the file.
    if phase in ("exists", "is_symlink", "mkdir", "open_x", "open_w"):
        assert list(owned.reports.iterdir()) == []
    else:
        assert target.read_text(encoding="utf-8") == ""


@pytest.mark.parametrize("code", [errno.ENAMETOOLONG, errno.EISDIR])
def test_selected_public_output_error_has_one_fixed_safe_message(owned, monkeypatch, code):
    target = owned.reports / "public-contract.md"
    original = OSError(code, "private selected diagnostic " + str(target), str(target))
    _fail_output_operation(monkeypatch, target, "open_x", original)
    response = post(owned, target.name)
    error(response, 400, "invalid_report_path")
    assert response.json()["detail"]["message"] == _PUBLIC_OUTPUT_PATH_MESSAGE
    assert response.json()["detail"]["context"] == {}
    assert "private selected diagnostic" not in response.text
    assert list(owned.reports.iterdir()) == []


@pytest.mark.parametrize("phase,code", [
    ("exists", errno.EACCES),
    ("mkdir", errno.ENOSPC),
    ("write_x", errno.EIO),
])
def test_control_unmatched_output_oserror_preserves_identity(owned, monkeypatch, phase, code):
    target = owned.reports / "unmatched-contract.md"
    original = OSError(code, "owned operational diagnostic", str(target))
    _fail_output_operation(monkeypatch, target, phase, original)
    with pytest.raises(OSError) as caught:
        _direct_native_report(owned, target)
    assert caught.value is original
    assert caught.value.__cause__ is None
    assert owned.calls == ([] if phase == "exists" else ["benchmark"])
    if phase != "write_x":
        assert list(owned.reports.iterdir()) == []
    else:
        assert target.read_text(encoding="utf-8") == ""


@pytest.mark.parametrize("phase,code", [
    ("reference", errno.ENAMETOOLONG),
    ("reference", errno.EISDIR),
    ("render", errno.ENAMETOOLONG),
    ("render", errno.EISDIR),
])
def test_control_reference_and_render_oserrors_remain_original_server_failures(
    owned, monkeypatch, phase, code
):
    target = owned.reports / "valid-reference-contract.md"
    original = OSError(code, "owned non-output diagnostic", str(owned.scenarios))
    if phase == "reference":
        native_open = Path.open
        def source_open(path, mode="r", *args, **kwargs):
            if path == owned.scenarios and mode == "rb":
                raise original
            return native_open(path, mode, *args, **kwargs)
        monkeypatch.setattr(Path, "open", source_open)
    else:
        def render(_summary):
            raise original
        monkeypatch.setattr(accuracy, "render_accuracy_report_markdown", render)
    with pytest.raises(OSError) as caught:
        _direct_native_report(owned, target)
    assert caught.value is original and caught.value.__cause__ is None
    assert owned.calls == ["benchmark"]
    assert list(owned.reports.iterdir()) == []
    response = post(owned, target.name)
    error(response, 500, "benchmark_report_failed")
    assert "owned non-output diagnostic" not in response.text
    assert list(owned.reports.iterdir()) == []


@pytest.mark.parametrize("overwrite", [False, True])
def test_control_file_as_parent_remains_existing_409_characterization(owned, overwrite):
    ancestor = owned.reports / "ancestor"
    ancestor.write_text(SENTINEL, encoding="utf-8")
    response = post(owned, "ancestor/result.md", overwrite=overwrite)
    error(response, 409, "benchmark_report_exists")
    assert ancestor.read_text(encoding="utf-8") == SENTINEL
    assert owned.calls == ["writer", "benchmark"]
