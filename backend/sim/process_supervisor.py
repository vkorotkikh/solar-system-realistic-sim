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
DEFAULT_MAX_RESULT_BYTES = 2 * 1024 * 1024
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
        self._closed = False
        self._next_job_id = 1
        self._in_flight = 0
        self._active_processes: dict[int, Any] = {}
        self._cancel_events: dict[Future[Any], threading.Event] = {}

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
            if cancel_event is not None:
                cancel_event.set()
            raise

    def shutdown(self) -> None:
        """Cancel all owned jobs and wait until every child is reaped."""

        with self._state_lock:
            if self._closed:
                return
            self._closed = True
            cancel_events = tuple(self._cancel_events.values())
        for cancel_event in cancel_events:
            cancel_event.set()
        self._executor.shutdown(wait=True, cancel_futures=True)

    def _release_admission(self, future: Future[Any]) -> None:
        try:
            if not future.cancelled():
                future.exception()
        except BaseException:
            pass
        finally:
            with self._state_lock:
                self._cancel_events.pop(future, None)
                if self._in_flight <= 0:
                    raise RuntimeError("process supervisor admission underflow")
                self._in_flight -= 1
            self._capacity.release()

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
                    self._terminate_and_reap(process)
                    raise ProcessCancelled("process job cancelled by its owner")

                remaining = absolute_deadline - time.monotonic()
                if remaining <= 0:
                    self._terminate_and_reap(process)
                    raise ProcessTimedOut("worker process exceeded its hard deadline")

                if receive_connection.poll(min(_POLL_SECONDS, remaining)):
                    try:
                        encoded = receive_connection.recv_bytes(
                            maxlength=self._max_result_bytes
                        )
                    except (EOFError, OSError) as exc:
                        self._terminate_and_reap(process)
                        if process.exitcode not in (None, 0):
                            raise ProcessCrashed(process.exitcode) from exc
                        raise ProcessResultRejected(
                            "worker result exceeded or broke the wire contract"
                        ) from exc

                    exit_remaining = max(0.0, absolute_deadline - time.monotonic())
                    process.join(min(_REAP_GRACE_SECONDS, exit_remaining))
                    if process.is_alive():
                        self._terminate_and_reap(process)
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
                if process.is_alive():
                    self._terminate_and_reap(process)
                else:
                    process.join()
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

    @staticmethod
    def _terminate_and_reap(process: Any) -> None:
        if process.is_alive():
            process.terminate()
            process.join(_REAP_GRACE_SECONDS)
        if process.is_alive():
            process.kill()
            process.join(_REAP_GRACE_SECONDS)
        if process.is_alive():
            raise RuntimeError("worker process could not be reaped")
        process.join()
