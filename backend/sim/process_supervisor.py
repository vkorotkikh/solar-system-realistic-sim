"""Bounded, spawn-only subprocess supervision for CPU-bound API work.

This module deliberately does not use :class:`ProcessPoolExecutor`.  A request
owns one observable child process until that child exits and is joined.  Hard
timeouts and caller cancellation therefore terminate real computation instead
of merely cancelling an in-process waiter.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping
from concurrent.futures import Future, ThreadPoolExecutor
import importlib
import json
import math
import multiprocessing
from multiprocessing.connection import Connection
import threading
import time
from typing import Any


HARD_MAX_PROCESS_WORKERS = 2
HARD_MAX_PROCESS_QUEUE = 4
HARD_MAX_RESULT_BYTES = 8 * 1024 * 1024
HARD_MAX_TIMEOUT_SECONDS = 60.0
# Real gates cover high/180 and every fidelity at max_features=256. The largest
# current result is ~1.15 MiB, so 2 MiB is the supported floor with growth
# margin, not merely a tunable default.
MIN_SUPPORTED_SOLAR_RESULT_BYTES = 2 * 1024 * 1024
DEFAULT_MAX_RESULT_BYTES = MIN_SUPPORTED_SOLAR_RESULT_BYTES
_MAX_JSON_NODES = 250_000
_MAX_JSON_DEPTH = 64
_POLL_SECONDS = 0.01
_REAP_GRACE_SECONDS = 0.25


class ProcessSupervisorError(RuntimeError):
    """Base class for bounded subprocess failures."""


class ProcessSaturated(ProcessSupervisorError):
    """No running or queued admission slot is available."""


class ProcessSubmissionFailed(ProcessSupervisorError):
    """The supervisor could not accept or start an admitted job."""


class ProcessSupervisorBroken(ProcessSubmissionFailed):
    """The supervisor is quarantined after losing lifecycle control."""


class ProcessReapFailed(ProcessSupervisorBroken):
    """A child remained alive after terminate/kill/join attempts."""


class ProcessTimedOut(ProcessSupervisorError):
    """The child exceeded its absolute execution deadline."""


class ProcessCancelled(ProcessSupervisorError):
    """The request owner cancelled the child."""


class ProcessCrashed(ProcessSupervisorError):
    """The child exited without a valid result envelope."""

    def __init__(self, exit_code: int | None) -> None:
        self.exit_code = exit_code
        super().__init__(f"worker process exited without a result (exit code {exit_code})")


class ProcessWorkerFailed(ProcessSupervisorError):
    """The target raised inside an otherwise healthy child process."""


class ProcessResultRejected(ProcessSupervisorError):
    """The child result violated the bounded wire or result contract."""


def _resolve_target(target_spec: str) -> Callable[[Any], Any]:
    module_name, separator, attribute_name = target_spec.partition(":")
    if not separator or not module_name or not attribute_name:
        raise ValueError("worker target must use the form 'module:function'")
    target = getattr(importlib.import_module(module_name), attribute_name)
    if not callable(target):
        raise TypeError("worker target is not callable")
    return target


def _error_envelope(code: str) -> dict[str, str]:
    return {"status": "error", "code": code}


def _encode_envelope(envelope: Mapping[str, Any]) -> bytes:
    return json.dumps(
        envelope,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _child_entry(
    target_spec: str,
    payload: Any,
    send_connection: Connection,
    max_result_bytes: int,
) -> None:
    """Import and execute one target, returning only bounded JSON bytes."""

    try:
        try:
            target = _resolve_target(target_spec)
            result = target(payload)
            try:
                encoded = _encode_envelope({"status": "ok", "result": result})
            except (TypeError, ValueError, OverflowError, RecursionError):
                encoded = _encode_envelope(_error_envelope("invalid_result"))
            if len(encoded) > max_result_bytes:
                encoded = _encode_envelope(_error_envelope("result_too_large"))
        except BaseException:
            # Child exceptions and tracebacks are not reflected over the API
            # boundary. The stable error class is sufficient for operators.
            encoded = _encode_envelope(_error_envelope("worker_exception"))

        send_connection.send_bytes(encoded)
    except BaseException:
        # A broken pipe means the owner has already cancelled and reaped us.
        pass
    finally:
        send_connection.close()


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON constant {value!r}")


def _validate_json_tree(value: Any) -> None:
    """Reject non-finite, excessively deep, or node-amplified JSON values."""

    pending: list[tuple[Any, int]] = [(value, 0)]
    visited = 0
    while pending:
        node, depth = pending.pop()
        visited += 1
        if visited > _MAX_JSON_NODES:
            raise ProcessResultRejected("worker result contains too many JSON nodes")
        if depth > _MAX_JSON_DEPTH:
            raise ProcessResultRejected("worker result exceeds the JSON depth limit")
        if node is None or isinstance(node, (str, bool, int)):
            continue
        if isinstance(node, float):
            if not math.isfinite(node):
                raise ProcessResultRejected("worker result contains a non-finite number")
            continue
        if isinstance(node, list):
            pending.extend((item, depth + 1) for item in node)
            continue
        if isinstance(node, dict):
            if any(not isinstance(key, str) for key in node):
                raise ProcessResultRejected("worker result contains a non-string key")
            pending.extend((item, depth + 1) for item in node.values())
            continue
        raise ProcessResultRejected("worker result contains a non-JSON value")


class SupervisedProcessRunner:
    """Run bounded CPU jobs in individually killable ``spawn`` children.

    ``max_workers`` is K (simultaneously running children) and ``max_queue`` is
    Q (admitted jobs waiting for a supervisor thread). Both have compile-time
    ceilings. Admission is non-blocking and capacity is returned only after the
    child has exited and been joined.
    """

    def __init__(
        self,
        target_spec: str,
        *,
        max_workers: int,
        max_queue: int,
        max_result_bytes: int = DEFAULT_MAX_RESULT_BYTES,
        result_validator: Callable[[Any, Any], Any] | None = None,
        mp_context: Any | None = None,
    ) -> None:
        if not 1 <= int(max_workers) <= HARD_MAX_PROCESS_WORKERS:
            raise ValueError(
                f"max_workers must be between 1 and {HARD_MAX_PROCESS_WORKERS}"
            )
        if not 0 <= int(max_queue) <= HARD_MAX_PROCESS_QUEUE:
            raise ValueError(
                f"max_queue must be between 0 and {HARD_MAX_PROCESS_QUEUE}"
            )
        if not 1_024 <= int(max_result_bytes) <= HARD_MAX_RESULT_BYTES:
            raise ValueError(
                f"max_result_bytes must be between 1024 and {HARD_MAX_RESULT_BYTES}"
            )
        _resolve_target(target_spec)

        context = mp_context or multiprocessing.get_context("spawn")
        if context.get_start_method() != "spawn":
            raise ValueError("SupervisedProcessRunner requires spawn semantics")

        self._target_spec = target_spec
        self._max_workers = int(max_workers)
        self._max_queue = int(max_queue)
        self._max_result_bytes = int(max_result_bytes)
        self._result_validator = result_validator
        self._context = context
        self._capacity = threading.BoundedSemaphore(self._max_workers + self._max_queue)
        self._executor = ThreadPoolExecutor(
            max_workers=self._max_workers,
            thread_name_prefix="solar-process-supervisor",
        )
        self._state_lock = threading.Lock()
        self._shutdown_lock = threading.Lock()
        self._closed = False
        self._executor_shutdown = False
        self._broken_reason: str | None = None
        self._next_job_id = 1
        self._in_flight = 0
        self._active_processes: dict[int, Any] = {}
        self._cancel_events: dict[Future[Any], threading.Event] = {}
        self._future_job_ids: dict[Future[Any], int] = {}
        self._job_futures: dict[int, Future[Any]] = {}
        self._quarantined_jobs: set[int] = set()

    def snapshot(self) -> dict[str, Any]:
        """Return lock-only diagnostics; never contact or wait for a child."""

        with self._state_lock:
            return {
                "start_method": "spawn",
                "max_workers": self._max_workers,
                "max_queue": self._max_queue,
                "capacity": self._max_workers + self._max_queue,
                "in_flight": self._in_flight,
                "active_processes": len(self._active_processes),
                "active_pids": tuple(
                    process.pid
                    for process in self._active_processes.values()
                    if process.pid is not None
                ),
                "closed": self._closed,
                "broken": self._broken_reason is not None,
                "broken_reason": self._broken_reason,
                "quarantined_jobs": len(self._quarantined_jobs),
            }

    def submit(self, payload: Any, *, timeout_seconds: float) -> Future[Any]:
        timeout = float(timeout_seconds)
        if not math.isfinite(timeout) or not 0 < timeout <= HARD_MAX_TIMEOUT_SECONDS:
            raise ValueError(
                f"timeout_seconds must be finite and in (0, {HARD_MAX_TIMEOUT_SECONDS}]"
            )

        cancel_event = threading.Event()
        absolute_deadline = time.monotonic() + timeout
        with self._state_lock:
            if self._broken_reason is not None:
                raise ProcessSupervisorBroken(self._broken_reason)
            if self._closed:
                raise ProcessSubmissionFailed("process supervisor is closed")
            if not self._capacity.acquire(blocking=False):
                raise ProcessSaturated("process supervisor capacity is exhausted")
            self._in_flight += 1
            job_id = self._next_job_id
            self._next_job_id += 1
            try:
                future = self._executor.submit(
                    self._execute,
                    job_id,
                    payload,
                    absolute_deadline,
                    cancel_event,
                )
            except BaseException as exc:
                self._in_flight -= 1
                self._capacity.release()
                raise ProcessSubmissionFailed("process supervisor submit failed") from exc
            self._cancel_events[future] = cancel_event
            self._future_job_ids[future] = job_id
            self._job_futures[job_id] = future

        future.add_done_callback(self._release_admission)
        return future

    async def run(self, payload: Any, *, timeout_seconds: float) -> Any:
        future = self.submit(payload, timeout_seconds=timeout_seconds)
        wrapped = asyncio.wrap_future(future)
        try:
            return await asyncio.shield(wrapped)
        except asyncio.CancelledError:
            with self._state_lock:
                cancel_event = self._cancel_events.get(future)
            # A queued concurrent Future can be cancelled before any
            # supervisor thread owns it, returning its admission immediately.
            # If it raced into RUNNING, the event is the process-aware fallback.
            future.cancel()
            if cancel_event is not None:
                cancel_event.set()
            raise

    def shutdown(self) -> None:
        """Cancel owned jobs, retry quarantined reaps, and report failures."""

        with self._shutdown_lock:
            with self._state_lock:
                self._closed = True
                cancel_events = tuple(self._cancel_events.values())
                executor_shutdown = self._executor_shutdown
                self._executor_shutdown = True
            for cancel_event in cancel_events:
                cancel_event.set()
            if not executor_shutdown:
                self._executor.shutdown(wait=True, cancel_futures=True)

            with self._state_lock:
                retained = tuple(self._active_processes.items())
            failures: list[ProcessReapFailed] = []
            for job_id, process in retained:
                try:
                    self._terminate_and_reap(process)
                except ProcessReapFailed as exc:
                    self._quarantine_job(job_id, exc)
                    failures.append(exc)
                    continue

                try:
                    process.close()
                except BaseException:
                    pass
                release_capacity = False
                with self._state_lock:
                    self._active_processes.pop(job_id, None)
                    self._quarantined_jobs.discard(job_id)
                    future = self._job_futures.pop(job_id, None)
                    if future is not None:
                        self._future_job_ids.pop(future, None)
                        self._cancel_events.pop(future, None)
                    if self._in_flight > 0:
                        self._in_flight -= 1
                        release_capacity = True
                if release_capacity:
                    self._capacity.release()

            if failures:
                raise ProcessReapFailed(
                    f"{len(failures)} worker process(es) remain alive after shutdown"
                ) from failures[0]

    def _release_admission(self, future: Future[Any]) -> None:
        exception: BaseException | None = None
        try:
            if not future.cancelled():
                exception = future.exception()
        except BaseException as exc:
            exception = exc

        release_capacity = False
        with self._state_lock:
            job_id = self._future_job_ids.get(future)
            if isinstance(exception, ProcessReapFailed) or (
                job_id is not None and job_id in self._quarantined_jobs
            ):
                # Ownership is deliberately retained until a later shutdown
                # retry proves the child has exited and has been joined.
                return

            self._cancel_events.pop(future, None)
            self._future_job_ids.pop(future, None)
            if job_id is not None:
                self._job_futures.pop(job_id, None)
            if self._in_flight <= 0:
                self._broken_reason = "process supervisor admission underflow"
                return
            self._in_flight -= 1
            release_capacity = True
        if release_capacity:
            try:
                self._capacity.release()
            except ValueError:
                with self._state_lock:
                    self._broken_reason = "process supervisor admission over-credit"

    def _execute(
        self,
        job_id: int,
        payload: Any,
        absolute_deadline: float,
        cancel_event: threading.Event,
    ) -> Any:
        if cancel_event.is_set():
            raise ProcessCancelled("process job cancelled before start")
        if time.monotonic() >= absolute_deadline:
            raise ProcessTimedOut("worker deadline expired while queued")

        receive_connection, send_connection = self._context.Pipe(duplex=False)
        process = self._context.Process(
            target=_child_entry,
            args=(
                self._target_spec,
                payload,
                send_connection,
                self._max_result_bytes,
            ),
            name=f"solar-physics-{job_id}",
            daemon=True,
        )
        started = False
        try:
            with self._state_lock:
                if self._closed or cancel_event.is_set():
                    raise ProcessCancelled("process job cancelled before start")
                if time.monotonic() >= absolute_deadline:
                    raise ProcessTimedOut("worker deadline expired while queued")
                try:
                    process.start()
                except BaseException as exc:
                    raise ProcessSubmissionFailed("worker process failed to start") from exc
                started = True
                self._active_processes[job_id] = process
            send_connection.close()

            while True:
                if cancel_event.is_set():
                    self._reap_or_quarantine(job_id, process)
                    raise ProcessCancelled("process job cancelled by its owner")

                remaining = absolute_deadline - time.monotonic()
                if remaining <= 0:
                    self._reap_or_quarantine(job_id, process)
                    raise ProcessTimedOut("worker process exceeded its hard deadline")

                if receive_connection.poll(min(_POLL_SECONDS, remaining)):
                    try:
                        encoded = receive_connection.recv_bytes(
                            maxlength=self._max_result_bytes
                        )
                    except (EOFError, OSError) as exc:
                        self._reap_or_quarantine(job_id, process)
                        if process.exitcode not in (None, 0):
                            raise ProcessCrashed(process.exitcode) from exc
                        raise ProcessResultRejected(
                            "worker result exceeded or broke the wire contract"
                        ) from exc

                    exit_remaining = max(0.0, absolute_deadline - time.monotonic())
                    process.join(min(_REAP_GRACE_SECONDS, exit_remaining))
                    if process.is_alive():
                        self._reap_or_quarantine(job_id, process)
                        raise ProcessTimedOut(
                            "worker sent a result but did not exit before its deadline"
                        )
                    if process.exitcode != 0:
                        raise ProcessCrashed(process.exitcode)
                    return self._decode_result(encoded, payload)

                if not process.is_alive():
                    process.join()
                    # Poll once more after exit to avoid racing a flushed pipe.
                    if receive_connection.poll(0):
                        continue
                    raise ProcessCrashed(process.exitcode)
        finally:
            receive_connection.close()
            if not started:
                send_connection.close()
            if started:
                with self._state_lock:
                    quarantined = job_id in self._quarantined_jobs
                if not quarantined:
                    self._reap_or_quarantine(job_id, process)
                    with self._state_lock:
                        self._active_processes.pop(job_id, None)
                    process.close()

    def _decode_result(self, encoded: bytes, submitted_payload: Any) -> Any:
        if len(encoded) > self._max_result_bytes:
            raise ProcessResultRejected("worker result exceeds the byte limit")
        try:
            envelope = json.loads(
                encoded.decode("utf-8"),
                parse_constant=_reject_json_constant,
            )
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, RecursionError) as exc:
            raise ProcessResultRejected("worker returned invalid bounded JSON") from exc
        _validate_json_tree(envelope)
        if not isinstance(envelope, dict):
            raise ProcessResultRejected("worker envelope must be an object")
        if envelope.get("status") == "error":
            code = envelope.get("code")
            if code in {"invalid_result", "result_too_large"}:
                raise ProcessResultRejected(f"worker rejected its result: {code}")
            raise ProcessWorkerFailed("worker target failed")
        if envelope.get("status") != "ok" or "result" not in envelope:
            raise ProcessResultRejected("worker envelope has an invalid status")

        result = envelope["result"]
        if self._result_validator is not None:
            try:
                validated = self._result_validator(result, submitted_payload)
            except ProcessResultRejected:
                raise
            except (TypeError, ValueError, KeyError) as exc:
                raise ProcessResultRejected("worker result failed validation") from exc
            if validated is not None:
                result = validated
        return result

    def _quarantine_job(self, job_id: int, exc: BaseException) -> None:
        with self._state_lock:
            self._quarantined_jobs.add(job_id)
            if self._broken_reason is None:
                self._broken_reason = f"worker lifecycle control failed: {exc}"

    def _reap_or_quarantine(self, job_id: int, process: Any) -> None:
        try:
            self._terminate_and_reap(process)
        except ProcessReapFailed as exc:
            self._quarantine_job(job_id, exc)
            raise

    @staticmethod
    def _terminate_and_reap(process: Any) -> None:
        try:
            if process.is_alive():
                try:
                    process.terminate()
                except BaseException:
                    pass
                process.join(_REAP_GRACE_SECONDS)
            if process.is_alive():
                try:
                    process.kill()
                except BaseException:
                    pass
                process.join(_REAP_GRACE_SECONDS)
            if process.is_alive():
                raise ProcessReapFailed("worker process could not be reaped")
            process.join()
        except ProcessReapFailed:
            raise
        except BaseException as exc:
            raise ProcessReapFailed("worker process reap operation failed") from exc
