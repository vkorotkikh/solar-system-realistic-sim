from __future__ import annotations

import asyncio
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

import pytest


FIXTURE_MODULE_DIR = Path(__file__).parent / "fixtures"
if str(FIXTURE_MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(FIXTURE_MODULE_DIR))

TARGET = "process_worker_targets:execute"


def _result(value: Any = "ok") -> dict[str, Any]:
    return {
        "schema": {"name": "solar_physics_state", "version": 2},
        "source": "backend",
        "value": value,
    }


def _wait_for_pid(path: Path, timeout_seconds: float = 3.0) -> int:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if path.exists() and path.read_text(encoding="ascii").strip():
            return int(path.read_text(encoding="ascii"))
        time.sleep(0.01)
    raise AssertionError("child process did not publish its PID")


def _pid_exists(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def test_supervisor_module_exists() -> None:
    assert importlib.util.find_spec("sim.process_supervisor") is not None


def test_worker_and_queue_limits_have_compile_time_ceilings() -> None:
    from sim.process_supervisor import SupervisedProcessRunner

    with pytest.raises(ValueError, match="workers"):
        SupervisedProcessRunner(TARGET, max_workers=3, max_queue=0)
    with pytest.raises(ValueError, match="queue"):
        SupervisedProcessRunner(TARGET, max_workers=1, max_queue=5)


def test_admission_is_bounded_by_running_plus_queued_work(tmp_path: Path) -> None:
    from sim.process_supervisor import ProcessSaturated, SupervisedProcessRunner

    runner = SupervisedProcessRunner(TARGET, max_workers=1, max_queue=1)
    first_started = tmp_path / "first.pid"
    try:
        first = runner.submit(
            {
                "operation": "sleep_then_echo",
                "sleep_seconds": 0.35,
                "started_path": str(first_started),
                "result": _result("first"),
            },
            timeout_seconds=2.0,
        )
        _wait_for_pid(first_started)
        second = runner.submit(
            {
                "operation": "sleep_then_echo",
                "sleep_seconds": 0.05,
                "result": _result("second"),
            },
            timeout_seconds=2.0,
        )

        with pytest.raises(ProcessSaturated):
            runner.submit(
                {"operation": "echo", "result": _result("third")},
                timeout_seconds=2.0,
            )

        assert first.result(timeout=3.0)["value"] == "first"
        assert second.result(timeout=3.0)["value"] == "second"
    finally:
        runner.shutdown()


def test_queued_deadline_starts_at_admission_and_expiry_spawns_no_child(
    tmp_path: Path,
) -> None:
    from sim.process_supervisor import ProcessTimedOut, SupervisedProcessRunner

    runner = SupervisedProcessRunner(TARGET, max_workers=1, max_queue=1)
    first_started = tmp_path / "first.pid"
    expired_started = tmp_path / "expired.pid"
    try:
        first = runner.submit(
            {
                "operation": "sleep_then_echo",
                "sleep_seconds": 0.35,
                "started_path": str(first_started),
                "result": _result("first"),
            },
            timeout_seconds=2.0,
        )
        _wait_for_pid(first_started)
        expired = runner.submit(
            {
                "operation": "sleep_then_echo",
                "sleep_seconds": 0.05,
                "started_path": str(expired_started),
                "result": _result("expired"),
            },
            timeout_seconds=0.1,
        )

        assert first.result(timeout=3.0)["value"] == "first"
        with pytest.raises(ProcessTimedOut):
            expired.result(timeout=3.0)
        assert not expired_started.exists()
        assert runner.snapshot()["in_flight"] == 0
    finally:
        runner.shutdown()


def test_hard_timeout_kills_reaps_and_recovers_capacity(tmp_path: Path) -> None:
    from sim.process_supervisor import ProcessTimedOut, SupervisedProcessRunner

    runner = SupervisedProcessRunner(TARGET, max_workers=1, max_queue=0)
    started = tmp_path / "timed-out.pid"
    try:
        timed_out = runner.submit(
            {
                "operation": "sleep_then_echo",
                "sleep_seconds": 10.0,
                "started_path": str(started),
                "result": _result(),
            },
            timeout_seconds=0.15,
        )
        child_pid = _wait_for_pid(started)

        with pytest.raises(ProcessTimedOut):
            timed_out.result(timeout=3.0)

        assert not _pid_exists(child_pid)
        assert runner.snapshot()["active_processes"] == 0
        assert runner.snapshot()["in_flight"] == 0
        recovered = runner.submit(
            {"operation": "echo", "result": _result("recovered")},
            timeout_seconds=2.0,
        )
        assert recovered.result(timeout=3.0)["value"] == "recovered"
    finally:
        runner.shutdown()


def test_child_crash_reaps_and_recovers_without_permit_overcredit() -> None:
    from sim.process_supervisor import ProcessCrashed, SupervisedProcessRunner

    runner = SupervisedProcessRunner(TARGET, max_workers=1, max_queue=0)
    try:
        crashed = runner.submit(
            {"operation": "crash", "exit_code": 23},
            timeout_seconds=2.0,
        )
        with pytest.raises(ProcessCrashed) as raised:
            crashed.result(timeout=3.0)
        assert raised.value.exit_code == 23

        for index in range(3):
            completed = runner.submit(
                {"operation": "echo", "result": _result(index)},
                timeout_seconds=2.0,
            )
            assert completed.result(timeout=3.0)["value"] == index
            assert runner.snapshot()["in_flight"] == 0
    finally:
        runner.shutdown()


@pytest.mark.parametrize("operation", ["non_finite", "oversized"])
def test_invalid_or_oversized_child_output_is_rejected(operation: str) -> None:
    from sim.process_supervisor import ProcessResultRejected, SupervisedProcessRunner
    from sim.solar_process_worker import validate_solar_physics_result

    runner = SupervisedProcessRunner(
        TARGET,
        max_workers=1,
        max_queue=0,
        max_result_bytes=2_048,
        result_validator=validate_solar_physics_result,
    )
    payload = {"operation": operation, "size": 8_192}
    try:
        future = runner.submit(payload, timeout_seconds=2.0)
        with pytest.raises(ProcessResultRejected):
            future.result(timeout=3.0)
        assert runner.snapshot()["in_flight"] == 0
    finally:
        runner.shutdown()


def test_wrong_result_schema_is_rejected_before_return() -> None:
    from sim.process_supervisor import ProcessResultRejected, SupervisedProcessRunner
    from sim.solar_process_worker import validate_solar_physics_result

    runner = SupervisedProcessRunner(
        TARGET,
        max_workers=1,
        max_queue=0,
        result_validator=validate_solar_physics_result,
    )
    try:
        future = runner.submit(
            {"operation": "echo", "result": {"source": "backend"}},
            timeout_seconds=2.0,
        )
        with pytest.raises(ProcessResultRejected, match="schema"):
            future.result(timeout=3.0)
    finally:
        runner.shutdown()


def test_solar_result_validator_binds_result_to_exact_submitted_generation() -> None:
    from sim.solar_process_worker import validate_solar_physics_result

    request = {
        "epoch_jd_tdb": 2_460_000.5,
        "fidelity": "high",
        "max_features": 180,
        "forcing": "synthetic",
        "live_data": False,
    }
    result = {
        "schema": {"name": "solar_physics_state", "version": 2},
        "source": "backend",
        "epoch_jd_tdb": 2_460_000.5,
        "epoch_jd": 2_460_000.5,
        "fidelity": "high",
        "forcing": "synthetic",
        "live_data_requested": False,
        "corona": {"feature_count": 180},
        "_solar_worker_request": dict(request),
    }

    validated = validate_solar_physics_result(result, request)

    assert validated["epoch_jd_tdb"] == request["epoch_jd_tdb"]
    assert "_solar_worker_request" not in validated


@pytest.mark.parametrize(
    ("path", "wrong_value"),
    [
        (("epoch_jd_tdb",), 2_460_001.5),
        (("epoch_jd",), 2_460_001.5),
        (("fidelity",), "preview"),
        (("forcing",), "hybrid"),
        (("live_data_requested",), True),
        (("corona", "feature_count"), 181),
        (("_solar_worker_request", "max_features"), 179),
    ],
)
def test_solar_result_validator_rejects_wrong_generation(
    path: tuple[str, ...],
    wrong_value: object,
) -> None:
    from sim.process_supervisor import ProcessResultRejected
    from sim.solar_process_worker import validate_solar_physics_result

    request = {
        "epoch_jd_tdb": 2_460_000.5,
        "fidelity": "high",
        "max_features": 180,
        "forcing": "synthetic",
        "live_data": False,
    }
    result = {
        "schema": {"name": "solar_physics_state", "version": 2},
        "source": "backend",
        "epoch_jd_tdb": 2_460_000.5,
        "epoch_jd": 2_460_000.5,
        "fidelity": "high",
        "forcing": "synthetic",
        "live_data_requested": False,
        "corona": {"feature_count": 180},
        "_solar_worker_request": dict(request),
    }
    target: dict[str, Any] = result
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = wrong_value

    with pytest.raises(ProcessResultRejected):
        validate_solar_physics_result(result, request)


def test_executor_submit_failure_releases_exactly_one_capacity_slot(monkeypatch) -> None:
    from sim.process_supervisor import ProcessSubmissionFailed, SupervisedProcessRunner

    runner = SupervisedProcessRunner(TARGET, max_workers=1, max_queue=0)
    original_submit = runner._executor.submit

    def fail_submit(*_args, **_kwargs):
        raise RuntimeError("injected submit failure")

    monkeypatch.setattr(runner._executor, "submit", fail_submit)
    with pytest.raises(ProcessSubmissionFailed):
        runner.submit(
            {"operation": "echo", "result": _result()},
            timeout_seconds=2.0,
        )
    assert runner.snapshot()["in_flight"] == 0

    monkeypatch.setattr(runner._executor, "submit", original_submit)
    try:
        future = runner.submit(
            {"operation": "echo", "result": _result("recovered")},
            timeout_seconds=2.0,
        )
        assert future.result(timeout=3.0)["value"] == "recovered"
    finally:
        runner.shutdown()


def test_child_start_failure_releases_capacity_and_next_submit_recovers() -> None:
    import multiprocessing

    from sim.process_supervisor import ProcessSubmissionFailed, SupervisedProcessRunner

    spawn_context = multiprocessing.get_context("spawn")

    class StartFailure:
        daemon = False

        def start(self) -> None:
            raise OSError("injected child start failure")

    class FailFirstStartContext:
        def __init__(self) -> None:
            self.process_calls = 0

        def get_start_method(self) -> str:
            return "spawn"

        def Pipe(self, *args, **kwargs):
            return spawn_context.Pipe(*args, **kwargs)

        def Process(self, *args, **kwargs):
            self.process_calls += 1
            if self.process_calls == 1:
                return StartFailure()
            return spawn_context.Process(*args, **kwargs)

    runner = SupervisedProcessRunner(
        TARGET,
        max_workers=1,
        max_queue=0,
        mp_context=FailFirstStartContext(),
    )
    try:
        failed = runner.submit(
            {"operation": "echo", "result": _result("first")},
            timeout_seconds=2.0,
        )
        with pytest.raises(ProcessSubmissionFailed):
            failed.result(timeout=3.0)
        assert runner.snapshot()["in_flight"] == 0

        recovered = runner.submit(
            {"operation": "echo", "result": _result("second")},
            timeout_seconds=2.0,
        )
        assert recovered.result(timeout=3.0)["value"] == "second"
    finally:
        runner.shutdown()


def test_unreapable_child_quarantines_runner_without_releasing_capacity() -> None:
    import multiprocessing

    from sim.process_supervisor import (
        ProcessReapFailed,
        ProcessSupervisorBroken,
        SupervisedProcessRunner,
    )

    spawn_context = multiprocessing.get_context("spawn")

    class UnkillableProcess:
        daemon = False
        pid = 424_242
        exitcode = None

        def __init__(self) -> None:
            self.terminate_calls = 0
            self.kill_calls = 0
            self.join_calls = 0
            self.close_calls = 0

        def start(self) -> None:
            return None

        def is_alive(self) -> bool:
            return True

        def terminate(self) -> None:
            self.terminate_calls += 1

        def kill(self) -> None:
            self.kill_calls += 1

        def join(self, _timeout: float | None = None) -> None:
            self.join_calls += 1

        def close(self) -> None:
            self.close_calls += 1

    process = UnkillableProcess()

    class UnkillableContext:
        def get_start_method(self) -> str:
            return "spawn"

        def Pipe(self, *args, **kwargs):
            return spawn_context.Pipe(*args, **kwargs)

        def Process(self, *args, **kwargs):
            del args, kwargs
            return process

    runner = SupervisedProcessRunner(
        TARGET,
        max_workers=1,
        max_queue=0,
        mp_context=UnkillableContext(),
    )
    failed = runner.submit(
        {"operation": "echo", "result": _result("never-delivered")},
        timeout_seconds=0.05,
    )

    with pytest.raises(ProcessReapFailed):
        failed.result(timeout=3.0)

    snapshot = runner.snapshot()
    assert snapshot["broken"] is True
    assert snapshot["in_flight"] == snapshot["capacity"] == 1
    assert snapshot["active_processes"] == 1
    assert snapshot["active_pids"] == (424_242,)
    with pytest.raises(ProcessSupervisorBroken):
        runner.submit(
            {"operation": "echo", "result": _result("must-not-run")},
            timeout_seconds=1.0,
        )

    first_terminate_calls = process.terminate_calls
    first_kill_calls = process.kill_calls
    with pytest.raises(ProcessReapFailed):
        runner.shutdown()
    assert process.terminate_calls > first_terminate_calls
    assert process.kill_calls > first_kill_calls
    assert process.close_calls == 0
    assert runner.snapshot()["in_flight"] == 1
    assert runner.snapshot()["active_processes"] == 1


def test_async_cancellation_terminates_child_and_capacity_recovers(tmp_path: Path) -> None:
    from sim.process_supervisor import ProcessSaturated, SupervisedProcessRunner

    async def scenario() -> None:
        runner = SupervisedProcessRunner(TARGET, max_workers=1, max_queue=0)
        started = tmp_path / "cancelled.pid"
        try:
            task = asyncio.create_task(
                runner.run(
                    {
                        "operation": "sleep_then_echo",
                        "sleep_seconds": 10.0,
                        "started_path": str(started),
                        "result": _result(),
                    },
                    timeout_seconds=5.0,
                )
            )
            child_pid = await asyncio.to_thread(_wait_for_pid, started)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

            with pytest.raises(ProcessSaturated):
                runner.submit(
                    {"operation": "echo", "result": _result("too-early")},
                    timeout_seconds=2.0,
                )

            deadline = time.monotonic() + 3.0
            while runner.snapshot()["in_flight"] and time.monotonic() < deadline:
                await asyncio.sleep(0.01)
            assert not _pid_exists(child_pid)
            recovered = await runner.run(
                {"operation": "echo", "result": _result("recovered")},
                timeout_seconds=2.0,
            )
            assert recovered["value"] == "recovered"
        finally:
            runner.shutdown()

    asyncio.run(scenario())


def test_queued_owner_cancellation_releases_without_waiting_for_running_job(
    tmp_path: Path,
) -> None:
    from sim.process_supervisor import SupervisedProcessRunner

    async def scenario() -> None:
        runner = SupervisedProcessRunner(TARGET, max_workers=1, max_queue=1)
        running_started = tmp_path / "running.pid"
        cancelled_started = tmp_path / "cancelled-queued.pid"
        try:
            running = runner.submit(
                {
                    "operation": "sleep_then_echo",
                    "sleep_seconds": 0.5,
                    "started_path": str(running_started),
                    "result": _result("running"),
                },
                timeout_seconds=2.0,
            )
            await asyncio.to_thread(_wait_for_pid, running_started)
            queued_task = asyncio.create_task(
                runner.run(
                    {
                        "operation": "sleep_then_echo",
                        "sleep_seconds": 0.05,
                        "started_path": str(cancelled_started),
                        "result": _result("cancelled"),
                    },
                    timeout_seconds=2.0,
                )
            )
            deadline = time.monotonic() + 1.0
            while runner.snapshot()["in_flight"] != 2 and time.monotonic() < deadline:
                await asyncio.sleep(0.005)
            assert runner.snapshot()["in_flight"] == 2

            queued_task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await queued_task

            release_deadline = time.monotonic() + 0.2
            while runner.snapshot()["in_flight"] != 1 and time.monotonic() < release_deadline:
                await asyncio.sleep(0.005)
            assert runner.snapshot()["in_flight"] == 1
            assert not cancelled_started.exists()

            replacement = runner.submit(
                {"operation": "echo", "result": _result("replacement")},
                timeout_seconds=2.0,
            )
            assert running.result(timeout=3.0)["value"] == "running"
            assert replacement.result(timeout=3.0)["value"] == "replacement"
        finally:
            runner.shutdown()

    asyncio.run(scenario())


def test_normal_interpreter_exit_is_bounded_by_job_deadline(tmp_path: Path) -> None:
    """ThreadPool shutdown may wait, but the owned deadline still kills the child."""

    child_pid_path = tmp_path / "interpreter-exit-child.pid"
    code = f"""
import time
from pathlib import Path
from sim.process_supervisor import SupervisedProcessRunner

runner = SupervisedProcessRunner(
    'process_worker_targets:execute',
    max_workers=1,
    max_queue=0,
)
runner.submit(
    {{
        'operation': 'sleep_then_echo',
        'sleep_seconds': 10.0,
        'started_path': {str(child_pid_path)!r},
        'result': {{'value': 'never'}},
    }},
    timeout_seconds=0.25,
)
deadline = time.monotonic() + 2.0
while not Path({str(child_pid_path)!r}).exists() and time.monotonic() < deadline:
    time.sleep(0.01)
if not Path({str(child_pid_path)!r}).exists():
    raise SystemExit('child did not start')
# Intentionally omit runner.shutdown(); normal interpreter exit is the case.
"""
    environment = dict(os.environ)
    backend_dir = Path(__file__).parents[1]
    fixture_dir = Path(__file__).parent / "fixtures"
    inherited_pythonpath = environment.get("PYTHONPATH", "")
    environment["PYTHONPATH"] = os.pathsep.join(
        part
        for part in (str(backend_dir), str(fixture_dir), inherited_pythonpath)
        if part
    )

    started = time.monotonic()
    completed = subprocess.run(
        [sys.executable, "-c", code],
        cwd=backend_dir.parent,
        env=environment,
        capture_output=True,
        text=True,
        timeout=5.0,
        check=False,
    )
    elapsed = time.monotonic() - started

    assert completed.returncode == 0, completed.stderr
    assert elapsed < 3.0
    child_pid = int(child_pid_path.read_text(encoding="ascii"))
    assert not _pid_exists(child_pid)
