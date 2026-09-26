from __future__ import annotations

import asyncio
import importlib.util
import os
from pathlib import Path
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


def test_async_cancellation_terminates_child_and_capacity_recovers(tmp_path: Path) -> None:
    from sim.process_supervisor import SupervisedProcessRunner

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
