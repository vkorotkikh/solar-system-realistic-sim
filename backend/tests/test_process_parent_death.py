"""Regression: BKP028, worker containment after loss of its owning server.

Found by /qa on 2026-10-24. Linux-only kernel containment; not spawn-bootstrap,
descendant-process, credential-change, or non-Linux hard-kill coverage.
"""

from __future__ import annotations

import ctypes
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
from types import SimpleNamespace

import pytest

import sim.process_supervisor as supervisor


_LINUX = pytest.mark.skipif(sys.platform != "linux", reason="Linux parent-death contract")
_PIDFD = pytest.mark.skipif(
    not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"),
    reason="owned Linux process cleanup requires pidfds",
)


def _native_case(case, tmp_path):
    completed = subprocess.run(
        [sys.executable, str(Path(__file__).parent / "fixtures" / "process_parent_death_probe.py"),
         "controller", case, str(tmp_path)],
        capture_output=True, text=True, timeout=22.0,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert completed.stderr == ""
    result = json.loads(completed.stdout)
    if "unsupported" in result:
        pytest.skip(result["unsupported"])
    assert result["remaining_owned_children"] == []
    assert result["parent_stderr"] == ""
    return result


@_LINUX
@_PIDFD
@pytest.mark.parametrize("case", ["sleep", "native"])
def test_armed_worker_exits_when_owning_server_is_killed(case, tmp_path):
    result = _native_case(case, tmp_path)
    assert result["target_started"] and result["worker"]["daemon"]
    assert result["parent_exitcode"] == -signal.SIGKILL
    assert result["exited_without_cleanup"], result
    assert result["worker_exitcode"] == -signal.SIGKILL


@_LINUX
@_PIDFD
def test_owner_dead_before_entry_cannot_start_target(tmp_path):
    result = _native_case("before_entry", tmp_path)
    assert result["parent_exitcode"] == -signal.SIGKILL
    assert result["exited_without_cleanup"], result
    assert not result["target_started"]
    assert result["worker_exitcode"] == 125


@_LINUX
@_PIDFD
@pytest.mark.parametrize("case", ["healthy", "healthy_native", "recovery"])
def test_live_owner_completes_reaps_and_recovers_admission(case, tmp_path):
    result = _native_case(case, tmp_path)
    assert result["parent_exitcode"] == 0, result
    report = json.loads(result["parent_stdout"])
    assert report["result"] == {"completed": True}
    assert report["snapshot"]["in_flight"] == report["snapshot"]["active_processes"] == 0
    assert not report["snapshot"]["broken"]
    assert report["guard_failure_recovered"] == (case == "recovery")


class _Connection:
    def __init__(self):
        self.sent = []
        self.closed = False

    def send_bytes(self, value):
        self.sent.append(value)

    def close(self):
        self.closed = True


def _entry(monkeypatch):
    resolved = []
    monkeypatch.setattr(supervisor, "_resolve_target", lambda target: (
        resolved.append(target) or (lambda payload: {"ok": True})
    ))
    connection = _Connection()
    supervisor._child_entry("synthetic:target", {}, connection, 1024)
    assert connection.closed
    return connection.sent, resolved


def _trap_exit(monkeypatch):
    exits = []

    def trapped(code):
        exits.append(code)
        raise SystemExit(code)

    monkeypatch.setattr(os, "_exit", trapped)
    return exits


@_LINUX
@pytest.mark.parametrize("parent", [None, SimpleNamespace(pid=None), SimpleNamespace(pid=True),
                                     SimpleNamespace(pid=0), SimpleNamespace(pid=-1),
                                     SimpleNamespace(pid=123)])
def test_direct_entry_without_original_parent_fails_closed_without_exiting(monkeypatch, parent):
    # A direct owning-process call must never arm PDEATHSIG or exit pytest.
    monkeypatch.setattr(supervisor.multiprocessing, "parent_process", lambda: parent)
    calls = []
    monkeypatch.setattr(ctypes, "CDLL", lambda *args, **kwargs: calls.append(args))
    exits = _trap_exit(monkeypatch)
    sent, resolved = _entry(monkeypatch)
    assert sent == [b'{"status":"error","code":"worker_exception"}']
    assert resolved == [] and calls == [] and exits == []


@_LINUX
@pytest.mark.parametrize("when,identity", [("before", "pid"), ("before", "sentinel"),
                                          ("during", "pid"), ("during", "sentinel")])
def test_original_parent_death_checks_surround_registration(monkeypatch, when, identity):
    registered = []

    def gone():
        return when == "before" or bool(registered)

    monkeypatch.setattr(supervisor.multiprocessing, "parent_process", lambda: SimpleNamespace(
        pid=123, is_alive=lambda: not (identity == "sentinel" and gone()),
    ))
    monkeypatch.setattr(os, "getppid", lambda: 456 if identity == "pid" and gone() else 123)

    def prctl(*args):
        registered.append(args)
        return 0

    monkeypatch.setattr(ctypes, "CDLL", lambda *args, **kwargs: SimpleNamespace(prctl=prctl))
    exits = _trap_exit(monkeypatch)
    sent, resolved = _entry(monkeypatch)
    assert resolved == [] and exits == [125]
    assert sent == [b'{"status":"error","code":"worker_exception"}']
    assert bool(registered) == (when == "during")


@_LINUX
@pytest.mark.parametrize("failure", ["load", "missing", "errno"])
def test_guard_registration_failure_is_sanitized_and_never_resolves_target(monkeypatch, failure):
    monkeypatch.setattr(supervisor.multiprocessing, "parent_process", lambda: SimpleNamespace(
        pid=123, is_alive=lambda: True,
    ))
    monkeypatch.setattr(os, "getppid", lambda: 123)

    def library(*args, **kwargs):
        if failure == "load":
            raise OSError("synthetic private loader path")
        if failure == "missing":
            return SimpleNamespace()
        def prctl(*args):
            ctypes.set_errno(1)
            return -1
        return SimpleNamespace(prctl=prctl)

    monkeypatch.setattr(ctypes, "CDLL", library)
    exits = _trap_exit(monkeypatch)
    sent, resolved = _entry(monkeypatch)
    assert sent == [b'{"status":"error","code":"worker_exception"}']
    assert resolved == [] and exits == []


def test_non_linux_entry_preserves_existing_execution(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    exits = _trap_exit(monkeypatch)
    calls = []
    monkeypatch.setattr(supervisor.multiprocessing, "parent_process", lambda: calls.append("parent"))
    monkeypatch.setattr(ctypes, "CDLL", lambda *args, **kwargs: calls.append("libc"))
    sent, resolved = _entry(monkeypatch)
    assert sent == [b'{"status":"ok","result":{"ok":true}}']
    assert resolved == ["synthetic:target"] and calls == [] and exits == []
