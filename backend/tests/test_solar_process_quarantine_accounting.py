"""Read-only supplementary state/order controls; no process or executor job starts."""
from concurrent.futures import Future
import threading

import pytest

from sim.process_supervisor import (
    ProcessReapFailed, ProcessSupervisorBroken, SupervisedProcessRunner,
)


def never_called(_payload):
    raise AssertionError('supplementary metadata controls must not start a job')


@pytest.fixture
def runner():
    value = SupervisedProcessRunner(f'{__name__}:never_called', max_workers=1, max_queue=0)
    try:
        yield value
    finally:
        # These are deliberately manufactured metadata faults, not native jobs.
        # No submit/executor task is used. Avoid giving fake process objects to
        # native shutdown while still closing the actual unused executor.
        assert value._executor._threads == set()
        with value._state_lock:
            value._active_processes.clear()
            value._quarantined_jobs.clear()
            value._job_futures.clear()
            value._future_job_ids.clear()
            value._cancel_events.clear()
            value._in_flight = 0
        value.shutdown()
        assert value.snapshot()['closed']


def tracked(runner, *, consume=True, exception=None):
    future = Future()
    if exception is None:
        future.set_result(None)
    else:
        future.set_exception(exception)
    if consume:
        assert runner._capacity.acquire(blocking=False)
    runner._in_flight = 1
    runner._job_futures[1] = future
    runner._future_job_ids[future] = 1
    runner._cancel_events[future] = threading.Event()
    return future


def test_retired_or_unknown_callback_cannot_debit_another_tracked_job(runner):
    current = tracked(runner)
    old = Future()
    old.set_result(None)
    runner._release_admission(old)
    assert runner._in_flight == 1 and runner._capacity._value == 0
    assert runner._future_job_ids == {current: 1}
    assert runner._broken_reason is None
    runner._release_admission(current)
    assert runner._in_flight == 0 and runner._capacity._value == 1
    assert runner._future_job_ids == {}
    runner._release_admission(current)
    assert runner._in_flight == 0 and runner._capacity._value == 1
    assert runner._broken_reason is None


def test_tracked_callback_underflow_is_still_a_broken_fault(runner):
    current = tracked(runner)
    runner._in_flight = 0
    runner._release_admission(current)
    assert runner._broken_reason == 'process supervisor admission underflow'
    assert runner._capacity._value == 0
    with pytest.raises(ProcessSupervisorBroken, match='underflow'):
        runner.submit({}, timeout_seconds=1)


def test_tracked_callback_overcredit_is_still_a_broken_fault(runner):
    current = tracked(runner, consume=False)
    runner._release_admission(current)
    assert runner._broken_reason == 'process supervisor admission over-credit'
    assert runner._in_flight == 0 and runner._capacity._value == 1
    with pytest.raises(ProcessSupervisorBroken, match='over-credit'):
        runner.submit({}, timeout_seconds=1)


class DeadProcess:
    def __init__(self, runner, exitcode):
        self.runner = runner
        self.code = exitcode
        self.calls = []

    def is_alive(self):
        self.calls.append('dead')
        return False

    def join(self, timeout):
        assert timeout == 0, 'new recovery must never block in join'
        self.calls.append(('join', timeout))

    @property
    def exitcode(self):
        self.calls.append('exitcode')
        return self.code

    def close(self):
        self.calls.append('close')
        assert self.runner._active_processes[1] is self
        assert 1 in self.runner._quarantined_jobs
        assert self.runner._in_flight == 1


def quarantine(runner, *, consume=True, exitcode=0):
    current = tracked(runner, consume=consume, exception=ProcessReapFailed('owned fault'))
    process = DeadProcess(runner, exitcode)
    runner._active_processes[1] = process
    runner._quarantined_jobs.add(1)
    runner._broken_reason = runner._quarantine_reason = 'worker lifecycle control failed: owned fault'
    return current, process


@pytest.mark.parametrize('exitcode', [None, 0])
def test_recovery_join_zero_exit_proof_and_close_before_retirement(runner, exitcode):
    current, process = quarantine(runner, exitcode=exitcode)
    with runner._state_lock:
        runner._recover_exited_quarantine()
    assert process.calls == ['dead', ('join', 0), 'dead', 'exitcode'] + ([] if exitcode is None else ['close'])
    if exitcode is None:
        assert runner._active_processes == {1: process}
        assert runner._future_job_ids == {current: 1}
        assert runner._in_flight == 1 and runner._capacity._value == 0
        assert runner._broken_reason == runner._quarantine_reason
    else:
        assert not runner._active_processes and not runner._future_job_ids
        assert not runner._job_futures and not runner._cancel_events
        assert not runner._quarantined_jobs
        assert runner._in_flight == 0 and runner._capacity._value == 1
        assert runner._broken_reason is None and runner._quarantine_reason is None
        runner._release_admission(current)
        assert runner._in_flight == 0 and runner._capacity._value == 1


def test_recovery_overcredit_cannot_be_cleared_with_empty_quarantine(runner):
    _, process = quarantine(runner, consume=False)
    with runner._state_lock:
        runner._recover_exited_quarantine()
    assert process.calls[-1] == 'close'
    assert not runner._quarantined_jobs
    assert runner._broken_reason == 'process supervisor admission over-credit'
    assert runner._broken_reason != runner._quarantine_reason
    with pytest.raises(ProcessSupervisorBroken, match='over-credit'):
        runner.submit({}, timeout_seconds=1)


def test_inconsistent_reverse_mapping_retains_ownership_without_process_probe(runner):
    current, process = quarantine(runner)
    runner._future_job_ids[current] = 2
    with runner._state_lock:
        runner._recover_exited_quarantine()
    assert process.calls == []
    assert runner._active_processes == {1: process}
    assert runner._quarantined_jobs == {1}
    assert runner._in_flight == 1 and runner._capacity._value == 0
    assert runner._broken_reason == runner._quarantine_reason
