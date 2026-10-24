"""Owned Linux process tree for the BKP028 integration regression.

Only the controller becomes a subreaper. All signals use identity-pinned pidfds;
all workloads, setup waits, and cleanup are finite even against unfixed code.
"""

from __future__ import annotations

import ctypes
import json
import multiprocessing
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import time

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from sim.process_supervisor import ProcessSaturated, ProcessWorkerFailed, SupervisedProcessRunner


def _publish(payload):
    Path(payload["ready"]).write_text(json.dumps({
        "pid": os.getpid(), "ppid": os.getppid(),
        "parent_pid": multiprocessing.parent_process().pid,
        "daemon": multiprocessing.current_process().daemon,
    }), encoding="ascii")


def work(payload):
    Path(payload["started"]).touch()
    if payload["case"] != "before_entry":
        _publish(payload)
    if payload["case"] in {"native", "healthy_native"}:
        # PyDLL retains the GIL: a Python watcher cannot run during this finite
        # native stand-in. No claim about a particular science library's GIL.
        sleep = ctypes.PyDLL(None).usleep
        sleep.argtypes = [ctypes.c_uint]
        sleep.restype = ctypes.c_int
        sleep(50_000 if payload["case"] == "healthy_native" else 3_000_000)
    else:
        time.sleep(0.05 if payload["case"] in {"healthy", "recovery"} else 3.0)
    return {"completed": True}


def _entry_wrapper(target, args, mode):
    payload = args[1]
    if mode == "before_entry":
        _publish(payload)
        deadline = time.monotonic() + 3.0
        while not Path(payload["release"]).exists():
            if time.monotonic() >= deadline:
                raise RuntimeError("owned entry release expired")
            time.sleep(0.005)
    elif mode == "fail_guard":
        def unavailable(*args, **kwargs):
            raise OSError("synthetic private libc failure")
        ctypes.CDLL = unavailable
    target(*args)


class _EntryContext:
    """Existing context injection wraps only entry, leaving spawn/reap real."""

    def __init__(self, case):
        self.context = multiprocessing.get_context("spawn")
        self.case = case
        self.calls = 0

    def get_start_method(self):
        return "spawn"

    def Pipe(self, *args, **kwargs):
        return self.context.Pipe(*args, **kwargs)

    def Process(self, *args, **kwargs):
        self.calls += 1
        if self.case == "before_entry" or (self.case == "recovery" and self.calls == 1):
            mode = "before_entry" if self.case == "before_entry" else "fail_guard"
            kwargs["args"] = (kwargs["target"], kwargs["args"], mode)
            kwargs["target"] = _entry_wrapper
        return self.context.Process(*args, **kwargs)


def serve(case, directory):
    root = Path(directory)
    payload = {"case": case, "ready": str(root / "ready.json"),
               "started": str(root / "started"), "release": str(root / "release")}
    runner = SupervisedProcessRunner(
        "process_parent_death_probe:work", max_workers=1, max_queue=0,
        mp_context=_EntryContext(case),
    )
    failed_cleanly = False
    try:
        if case == "recovery":
            first = runner.submit(payload, timeout_seconds=4.0)
            try:
                first.result(timeout=6.0)
            except ProcessWorkerFailed:
                failed_cleanly = not Path(payload["started"]).exists()
            assert failed_cleanly, "guard failure executed target or failed unsafely"
            # Future.result() can wake before its admission-release callback.
            deadline = time.monotonic() + 2.0
            while True:
                first_snapshot = runner.snapshot()
                if first_snapshot["in_flight"] == first_snapshot["active_processes"] == 0:
                    break
                assert time.monotonic() < deadline, "failed guard retained admission"
                time.sleep(0.005)
            assert first_snapshot["in_flight"] == first_snapshot["active_processes"] == 0
        deadline = time.monotonic() + 2.0
        while True:
            try:
                future = runner.submit(payload, timeout_seconds=4.0)
                break
            except ProcessSaturated:
                # Semaphore release follows the zero snapshot outside its lock.
                assert time.monotonic() < deadline, "worker capacity was not recovered"
                time.sleep(0.005)
        result = future.result(timeout=6.0)
    finally:
        runner.shutdown()
    print(json.dumps({"result": result, "snapshot": runner.snapshot(),
                      "guard_failure_recovered": failed_cleanly}), flush=True)


def _drain_owned_children():
    deadline = time.monotonic() + 7.0
    reaped = []
    while time.monotonic() < deadline:
        try:
            pid, status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return reaped
        if pid:
            reaped.append({"pid": pid, "exitcode": os.waitstatus_to_exitcode(status)})
        else:
            time.sleep(0.01)
    raise RuntimeError("owned descendant cleanup exceeded finite bound")


def control(case, directory):
    prctl = ctypes.CDLL(None, use_errno=True).prctl
    prctl.argtypes = [ctypes.c_int] + [ctypes.c_ulong] * 4
    prctl.restype = ctypes.c_int
    if prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER, controller only.
        print(json.dumps({"unsupported": "Linux subreaper unavailable"}))
        return
    root = Path(directory)
    parent = subprocess.Popen(
        [sys.executable, __file__, "server", case, directory],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    parent_fd = None
    worker_fd = None
    result = {}
    try:
        parent_fd = os.pidfd_open(parent.pid)
        if case in {"healthy", "healthy_native", "recovery"}:
            parent.wait(timeout=10.0)
        else:
            deadline = time.monotonic() + 3.0
            metadata = None
            while time.monotonic() < deadline:
                try:
                    metadata = json.loads((root / "ready.json").read_text(encoding="ascii"))
                    break
                except (FileNotFoundError, json.JSONDecodeError):
                    pass
                assert parent.poll() is None, "supervisor exited before readiness"
                time.sleep(0.005)
            assert metadata is not None, "worker readiness expired"
            assert metadata["ppid"] == metadata["parent_pid"] == parent.pid
            worker_fd = os.pidfd_open(metadata["pid"])
            if case != "before_entry":
                time.sleep(0.05)  # Give the finite native call time to enter.
            signal.pidfd_send_signal(parent_fd, signal.SIGKILL)
            parent.wait(timeout=2.0)
            if case == "before_entry":
                (root / "release").touch()
            exited = bool(select.select([worker_fd], [], [], 1.0)[0])
            if not exited:
                signal.pidfd_send_signal(worker_fd, signal.SIGKILL)
            assert select.select([worker_fd], [], [], 2.0)[0], "owned worker cleanup expired"
            pid, status = os.waitpid(metadata["pid"], 0)
            assert pid == metadata["pid"]
            result.update({"worker": metadata, "exited_without_cleanup": exited,
                           "cleanup_killed_worker": not exited,
                           "worker_exitcode": os.waitstatus_to_exitcode(status)})
    finally:
        if parent.poll() is None:
            if parent_fd is not None:
                signal.pidfd_send_signal(parent_fd, signal.SIGKILL)
            else:
                parent.kill()  # Popen owns this unreaped child even if pidfd setup failed.
            parent.wait(timeout=2.0)
        if worker_fd is not None:
            if not select.select([worker_fd], [], [], 0)[0]:
                signal.pidfd_send_signal(worker_fd, signal.SIGKILL)
            os.close(worker_fd)
        if parent_fd is not None:
            os.close(parent_fd)
        reaped = _drain_owned_children()
        stdout, stderr = parent.communicate(timeout=1.0)
    result.update({"parent_exitcode": parent.returncode,
                   "target_started": (root / "started").exists(),
                   "other_owned_descendants_reaped": reaped,
                   "remaining_owned_children": _drain_owned_children(),
                   "parent_stdout": stdout.decode(), "parent_stderr": stderr.decode()})
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    if sys.argv[1] == "server":
        serve(sys.argv[2], sys.argv[3])
    else:
        control(sys.argv[2], sys.argv[3])
