"""SOL-QUARANTINE/P027: owned native lifecycle plus a deferred-reap proxy.

Regression for the consolidated Markdown audit; not a solar-science test.
The proxy deliberately defers terminate/kill/join while its own real spawn
child is live. This models retained lifecycle ownership deterministically;
it does not reproduce or measure an operating-system kill/reap delay.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import gc
import multiprocessing
import os
from pathlib import Path
import threading
import time

import pytest

from sim.process_supervisor import (
    ProcessReapFailed,
    ProcessSaturated,
    ProcessSubmissionFailed,
    ProcessSupervisorBroken,
    SupervisedProcessRunner,
)


def _state():
    return {
        "schema": {"name": "solar_physics_state", "version": 2},
        "source": "backend",
        "epoch_jd_tdb": 2_460_000.5,
        "value": "owned lifecycle fixture; not solar science",
    }


def _owned_worker(payload):
    """Only an owned spawn child executes this bounded, provider-free target."""
    if "ready" in payload:
        payload["ready"].set()
        if not payload["release"].wait(10.0):
            os._exit(91)
        if payload.get("exit_without_result"):
            os._exit(0)
    return _state()


def _until(predicate, seconds=4.0):
    deadline = time.monotonic() + seconds
    while not predicate():
        assert time.monotonic() < deadline, "owned lifecycle handshake timed out"
        time.sleep(0.005)


class _DeferredProcess:
    def __init__(self, native, defer, payload):
        self.native = native
        self.defer = defer
        self.payload = payload
        self.pid_at_start = None
        self.closed = False
        self.calls = []
        self.raise_join = False
        self.raise_probe = False

    @property
    def pid(self):
        return self.pid_at_start

    @property
    def exitcode(self):
        return self.native.exitcode

    def start(self):
        self.native.start()
        self.pid_at_start = self.native.pid

    def is_alive(self):
        self.calls.append("is_alive")
        if self.raise_probe:
            raise OSError("owned probe failure")
        return self.native.is_alive()

    def terminate(self):
        self.calls.append("terminate")
        if not self.defer:
            self.native.terminate()

    def kill(self):
        self.calls.append("kill")
        if not self.defer:
            self.native.kill()

    def join(self, timeout=None):
        self.calls.append("join")
        if self.raise_join:
            raise OSError("owned join failure")
        if self.defer and self.native.is_alive():
            return
        self.native.join(timeout)

    def close(self):
        self.calls.append("close")
        self.native.close()
        self.closed = True


class _Context:
    def __init__(self, deferred_count):
        self.native = multiprocessing.get_context("spawn")
        self.deferred_count = deferred_count
        self.processes = []

    def get_start_method(self):
        return "spawn"

    def Pipe(self, *args, **kwargs):
        return self.native.Pipe(*args, **kwargs)

    def Process(self, *args, **kwargs):
        process = _DeferredProcess(
            self.native.Process(*args, **kwargs),
            len(self.processes) < self.deferred_count,
            kwargs["args"][1],
        )
        self.processes.append(process)
        return process


class _ObservedRunner(SupervisedProcessRunner):
    """Wrap the actual callback solely to provide a deterministic test barrier."""
    def __init__(self, *args, **kwargs):
        self.completed_callbacks = []
        super().__init__(*args, **kwargs)

    def _release_admission(self, future):
        try:
            super()._release_admission(future)
        finally:
            self.completed_callbacks.append(future)


class _Harness:
    def __init__(self, workers=1, deferred_count=1):
        self.context = _Context(deferred_count)
        self.runner = _ObservedRunner(
            f"{Path(__file__).stem}:_owned_worker",
            max_workers=workers,
            max_queue=0,
            mp_context=self.context,
        )
        self.payloads = []

    def held_payload(self, *, exit_without_result=False):
        payload = {
            "ready": self.context.native.Event(),
            "release": self.context.native.Event(),
            "exit_without_result": exit_without_result,
        }
        self.payloads.append(payload)
        return payload

    def quarantine(self, count=1):
        payloads = [self.held_payload(exit_without_result=True) for _ in range(count)]

        async def cancel_owned_jobs():
            tasks = [asyncio.create_task(self.runner.run(p, timeout_seconds=8.0)) for p in payloads]
            try:
                deadline = time.monotonic() + 4.0
                while not all(p["ready"].is_set() for p in payloads):
                    assert time.monotonic() < deadline, "owned children did not enter target"
                    await asyncio.sleep(0.005)
                for task in tasks:
                    task.cancel()
                results = await asyncio.gather(*tasks, return_exceptions=True)
                assert all(isinstance(result, asyncio.CancelledError) for result in results)
            finally:
                for task in tasks:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

        asyncio.run(cancel_owned_jobs())
        _until(lambda: len(self.runner.completed_callbacks) == count)
        assert all(isinstance(f.exception(), ProcessReapFailed) for f in self.runner.completed_callbacks)
        state = self.runner.snapshot()
        assert state["broken"] and not state["closed"]
        assert state["quarantined_jobs"] == state["in_flight"] == state["active_processes"] == count
        assert all(p.native.is_alive() for p in self.context.processes)
        assert all("terminate" in p.calls and "kill" in p.calls for p in self.context.processes)
        return payloads

    def exit_child(self, index):
        process = self.context.processes[index]
        process.payload["release"].set()
        process.native.join(3.0)
        assert not process.native.is_alive()
        assert process.native.exitcode == 0
        assert not process.closed

    def cleanup(self):
        for payload in self.payloads:
            payload["release"].set()
        for process in self.context.processes:
            process.defer = False
            process.raise_join = process.raise_probe = False
        try:
            self.runner.shutdown()
        finally:
            # Only processes constructed and retained by this exact harness.
            for process in self.context.processes:
                if not process.closed:
                    if process.native.is_alive():
                        process.native.terminate()
                    process.native.join(3.0)
                    if process.native.is_alive():
                        process.native.kill()
                        process.native.join(3.0)
                    assert not process.native.is_alive(), "owned child did not exit"
                    process.close()
                assert process.closed
            print("OWNED_CLEANUP", [p.pid_at_start for p in self.context.processes])


@pytest.fixture
def harnesses(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).parent))
    owned = []

    def make(workers=1, deferred_count=1):
        harness = _Harness(workers, deferred_count)
        owned.append(harness)
        return harness

    yield make
    for harness in owned:
        harness.cleanup()
    # Harnesses sit in reference cycles that own spawn-context Events. Collect them
    # here: collected later, inside another test's resource-tracker call, their
    # semaphore finalizers make Python warn that a semaphore might leak.
    owned.clear()
    gc.collect()


def _idle(runner):
    _until(lambda: runner.snapshot()["in_flight"] == 0)
    state = runner.snapshot()
    assert not state["broken"] and not state["closed"]
    assert state["active_processes"] == state["quarantined_jobs"] == 0
    assert state["active_pids"] == ()
    with runner._state_lock:
        assert runner._job_futures == runner._future_job_ids == runner._cancel_events == {}


def test_control_live_quarantine_retains_lease_and_same_server_runner(harnesses, monkeypatch):
    import server

    harness = harnesses()
    harness.quarantine()
    original = harness.runner.snapshot()
    monkeypatch.setattr(server, "_solar_physics_runner", harness.runner)

    def forbidden_replacement():
        pytest.fail("live retained child must not acquire a replacement runner")

    monkeypatch.setattr(server, "_new_solar_physics_runner", forbidden_replacement)
    for _ in range(3):
        assert server._get_solar_physics_runner() is harness.runner
        with pytest.raises(ProcessSupervisorBroken):
            harness.runner.submit({}, timeout_seconds=2.0)
        assert harness.runner.snapshot() == original
    assert len(harness.context.processes) == 1


def test_exited_child_recovers_public_submit_and_exactly_one_lease(harnesses):
    harness = harnesses()
    harness.quarantine()
    old_future = harness.runner.completed_callbacks[0]
    harness.exit_child(0)
    assert harness.runner.submit({}, timeout_seconds=2.0).result(timeout=3.0) == _state()
    _idle(harness.runner)
    assert harness.context.processes[0].calls.count("close") == 1
    # A late/repeated completion must not return the recovered lease twice.
    harness.runner._release_admission(old_future)
    held = harness.held_payload()
    future = harness.runner.submit(held, timeout_seconds=8.0)
    assert held["ready"].wait(3.0)
    with pytest.raises(ProcessSaturated):
        harness.runner.submit({}, timeout_seconds=2.0)
    held["release"].set()
    assert future.result(timeout=3.0) == _state()
    _idle(harness.runner)
    assert harness.runner.snapshot()["capacity"] == 1


def test_exited_child_recovers_public_async_run(harnesses):
    harness = harnesses()
    harness.quarantine()
    harness.exit_child(0)
    assert asyncio.run(harness.runner.run({}, timeout_seconds=2.0)) == _state()
    _idle(harness.runner)


def test_exited_child_recovers_actual_http_without_runner_replacement(harnesses, monkeypatch):
    import server
    from fastapi.testclient import TestClient

    harness = harnesses()
    harness.quarantine()
    harness.exit_child(0)
    monkeypatch.setattr(server, "_solar_physics_runner", harness.runner)
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})

    def forbidden_replacement():
        pytest.fail("recovery must retain the existing runner identity")

    monkeypatch.setattr(server, "_new_solar_physics_runner", forbidden_replacement)
    response = TestClient(server.app).get("/solar/physics", params={
        "jd_tdb": 2_460_000.5,
        "fidelity": "preview",
        "max_features": 8,
        "forcing": "synthetic",
        "live_data": "false",
    })
    assert response.status_code == 200, response.text
    assert response.json() == _state()
    assert server._solar_physics_runner is harness.runner
    _idle(harness.runner)


def test_two_retained_children_recover_concurrent_admissions_only_after_both_exit(harnesses):
    harness = harnesses(workers=2, deferred_count=2)
    harness.quarantine(2)
    harness.exit_child(0)
    with pytest.raises(ProcessSupervisorBroken):
        harness.runner.submit({}, timeout_seconds=2.0)
    assert len(harness.context.processes) == 2
    assert harness.context.processes[1].native.is_alive()
    harness.exit_child(1)
    held = [harness.held_payload() for _ in range(2)]
    barrier = threading.Barrier(2, timeout=3.0)

    def admit(payload):
        barrier.wait()
        return harness.runner.submit(payload, timeout_seconds=8.0)

    with ThreadPoolExecutor(max_workers=2) as callers:
        admissions = [callers.submit(admit, payload) for payload in held]
        futures = [admission.result(timeout=4.0) for admission in admissions]
    assert all(payload["ready"].wait(3.0) for payload in held)
    with pytest.raises(ProcessSaturated):
        harness.runner.submit({}, timeout_seconds=2.0)
    assert harness.runner.snapshot()["in_flight"] == 2
    for payload in held:
        payload["release"].set()
    assert [future.result(timeout=3.0) for future in futures] == [_state(), _state()]
    _idle(harness.runner)
    assert all(process.calls.count("close") == 1 for process in harness.context.processes)


def test_control_snapshot_remains_lock_only_when_retained_child_exits(harnesses):
    harness = harnesses()
    harness.quarantine()
    harness.exit_child(0)
    process = harness.context.processes[0]
    calls = list(process.calls)
    for _ in range(3):
        state = harness.runner.snapshot()
        assert state["broken"] and state["quarantined_jobs"] == 1
    assert process.calls == calls


@pytest.mark.parametrize("failure", ["raise_probe", "raise_join"])
def test_control_unproven_reap_remains_quarantined(harnesses, failure):
    harness = harnesses()
    harness.quarantine()
    harness.exit_child(0)
    process = harness.context.processes[0]
    setattr(process, failure, True)
    with pytest.raises(ProcessSupervisorBroken):
        harness.runner.submit({}, timeout_seconds=2.0)
    state = harness.runner.snapshot()
    assert state["broken"] and state["quarantined_jobs"] == 1
    assert state["active_processes"] == state["in_flight"] == 1
    assert len(harness.context.processes) == 1 and not process.closed


def test_control_shutdown_can_already_reap_exited_child_but_never_reopens(harnesses):
    harness = harnesses()
    harness.quarantine()
    harness.exit_child(0)
    harness.runner.shutdown()
    state = harness.runner.snapshot()
    assert state["closed"]
    assert state["in_flight"] == state["active_processes"] == state["quarantined_jobs"] == 0
    with pytest.raises(ProcessSubmissionFailed):
        harness.runner.submit({}, timeout_seconds=2.0)
    assert len(harness.context.processes) == 1


def test_control_non_quarantine_accounting_fault_is_not_cleared(harnesses):
    harness = harnesses(deferred_count=0)
    with harness.runner._state_lock:
        harness.runner._broken_reason = "process supervisor admission accounting underflow"
    with pytest.raises(ProcessSupervisorBroken, match="accounting underflow"):
        harness.runner.submit({}, timeout_seconds=2.0)
    assert harness.runner.snapshot()["broken"]
    assert harness.runner.snapshot()["quarantined_jobs"] == 0
    assert harness.context.processes == []


def test_control_ordinary_native_completion_preserves_capacity(harnesses):
    harness = harnesses(deferred_count=0)
    for _ in range(2):
        assert harness.runner.submit({}, timeout_seconds=2.0).result(timeout=3.0) == _state()
        _idle(harness.runner)
    assert all(process.closed for process in harness.context.processes)


def _cancel_at_boundary(harness):
    payload = harness.held_payload(exit_without_result=True)

    async def scenario():
        task = asyncio.create_task(harness.runner.run(payload, timeout_seconds=8.0))
        try:
            deadline = time.monotonic() + 4.0
            while not payload["ready"].is_set():
                assert time.monotonic() < deadline
                await asyncio.sleep(0.005)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(scenario())


def test_done_future_recovers_before_pending_callback_without_double_credit(harnesses, monkeypatch):
    harness = harnesses()
    entered = threading.Event()
    release_callback = threading.Event()
    old_futures = []
    original = harness.runner._release_admission

    def paused_callback(future):
        if not entered.is_set():
            old_futures.append(future)
            entered.set()
            assert release_callback.wait(4.0), "owned callback release timed out"
        original(future)

    monkeypatch.setattr(harness.runner, "_release_admission", paused_callback)
    try:
        _cancel_at_boundary(harness)
        assert entered.wait(3.0)
        old_future = old_futures[0]
        assert old_future.done()
        assert isinstance(old_future.exception(), ProcessReapFailed)
        assert harness.runner.completed_callbacks == []
        harness.exit_child(0)
        new_future = harness.runner.submit({}, timeout_seconds=3.0)
        with harness.runner._state_lock:
            assert old_future not in harness.runner._future_job_ids
            assert old_future not in harness.runner._cancel_events
        assert harness.runner.snapshot()["in_flight"] == 1
        assert harness.context.processes[0].calls.count("close") == 1
        release_callback.set()
        assert new_future.result(timeout=4.0) == _state()
        _idle(harness.runner)
        assert len(harness.runner.completed_callbacks) == 2
        held = harness.held_payload()
        held_future = harness.runner.submit(held, timeout_seconds=8.0)
        assert held["ready"].wait(3.0)
        with pytest.raises(ProcessSaturated):
            harness.runner.submit({}, timeout_seconds=2.0)
        held["release"].set()
        assert held_future.result(timeout=3.0) == _state()
        _idle(harness.runner)
    finally:
        release_callback.set()


def test_control_running_future_is_not_reaped_during_owner_unwind(harnesses, monkeypatch):
    harness = harnesses()
    entered = threading.Event()
    release_owner = threading.Event()
    original = harness.runner._reap_or_quarantine

    def paused_unwind(job_id, process):
        try:
            original(job_id, process)
        except ProcessReapFailed:
            entered.set()
            assert release_owner.wait(4.0), "owned unwind release timed out"
            raise

    monkeypatch.setattr(harness.runner, "_reap_or_quarantine", paused_unwind)
    try:
        _cancel_at_boundary(harness)
        assert entered.wait(3.0)
        with harness.runner._state_lock:
            future = next(iter(harness.runner._job_futures.values()))
        assert future.running() and not future.done()
        harness.exit_child(0)
        process = harness.context.processes[0]
        calls = list(process.calls)
        with pytest.raises(ProcessSupervisorBroken):
            harness.runner.submit({}, timeout_seconds=2.0)
        assert process.calls == calls
        state = harness.runner.snapshot()
        assert state["in_flight"] == state["quarantined_jobs"] == state["active_processes"] == 1
        assert not process.closed
    finally:
        release_owner.set()
    _until(lambda: len(harness.runner.completed_callbacks) == 1)


def test_control_accounting_fault_with_exited_quarantined_child_stays_broken(harnesses):
    harness = harnesses()
    harness.quarantine()
    reason = "process supervisor admission over-credit"
    with harness.runner._state_lock:
        harness.runner._broken_reason = reason
    harness.exit_child(0)
    with pytest.raises(ProcessSupervisorBroken, match="admission over-credit"):
        harness.runner.submit({}, timeout_seconds=2.0)
    state = harness.runner.snapshot()
    assert state["broken"] and state["broken_reason"] == reason
    assert len(harness.context.processes) == 1


def test_control_live_child_retry_never_repeats_termination_or_join(harnesses, monkeypatch):
    harness = harnesses()
    harness.quarantine()
    process = harness.context.processes[0]
    attempts = []

    def forbidden_operation(*args):
        attempts.append(args)
        raise AssertionError("admission attempted a live-child cleanup operation")

    with monkeypatch.context() as scoped:
        scoped.setattr(process, "terminate", forbidden_operation)
        scoped.setattr(process, "kill", forbidden_operation)
        scoped.setattr(process, "join", forbidden_operation)
        with pytest.raises(ProcessSupervisorBroken):
            harness.runner.submit({}, timeout_seconds=2.0)
        assert attempts == []
        assert process.native.is_alive()
        assert not process.closed


def test_preclose_failure_retains_ownership_then_retry_returns_exactly_one_lease(harnesses, monkeypatch):
    # Only failure BEFORE native close is modeled; partial-close-then-raise is
    # intentionally not asserted recoverable.
    harness = harnesses()
    harness.quarantine()
    old_future = harness.runner.completed_callbacks[0]
    harness.exit_child(0)
    process = harness.context.processes[0]
    original_close = process.close
    failing = True
    attempts = []

    def fail_before_close():
        attempts.append("close")
        if failing:
            raise OSError("owned failure before native close")
        original_close()

    with monkeypatch.context() as scoped:
        scoped.setattr(process, "close", fail_before_close)
        with pytest.raises(ProcessSupervisorBroken):
            harness.runner.submit({}, timeout_seconds=2.0)
        state = harness.runner.snapshot()
        assert state["broken"] and not state["closed"]
        assert state["in_flight"] == state["active_processes"] == state["quarantined_jobs"] == 1
        assert len(harness.context.processes) == 1 and not process.closed
        with harness.runner._state_lock:
            job_id = harness.runner._future_job_ids[old_future]
            assert harness.runner._job_futures[job_id] is old_future
            assert old_future in harness.runner._cancel_events
        assert attempts == ["close"]
        failing = False
        assert harness.runner.submit({}, timeout_seconds=2.0).result(timeout=3.0) == _state()
        _idle(harness.runner)
        assert attempts == ["close", "close"]
        assert process.calls.count("close") == 1

    held = harness.held_payload()
    future = harness.runner.submit(held, timeout_seconds=8.0)
    assert held["ready"].wait(3.0)
    with pytest.raises(ProcessSaturated):
        harness.runner.submit({}, timeout_seconds=2.0)
    held["release"].set()
    assert future.result(timeout=3.0) == _state()
    _idle(harness.runner)
