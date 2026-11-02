# Issue: PFSS057 / SOL-COLD-CACHE; exact ready reuse and compatibility.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
"""PFSS057 selected exact-ready-reuse contract, not an implementation.

Actual HTTP route, supervised submit/run/JSON validation and native worker/model/
cache machinery; the supervisor execution method does not spawn a process and
the expensive PFSS numerical solution is stubbed. No timing/science/reap claim.
All fixtures and synchronization are owned; no proposed cache helper is named.
"""
from __future__ import annotations

import asyncio
import copy
from collections import deque
import json
import math
import socket
import threading
import time
from urllib.parse import urlencode

from fastapi.testclient import TestClient
import pytest
from starlette.requests import Request

import server
from sim import process_supervisor as supervisor
from sim import solar_process_worker as worker
from sim.pfss_magnetogram import PFSSCache


EPOCH = 2451552.0
WALL = 2461000.25
BASE = dict(jd_tdb=str(EPOCH), fidelity="preview", max_features=8,
            forcing="synthetic", live_data=False)


def physical(value):
    result = copy.deepcopy(value)
    result.pop("wall_epoch_jd_tdb")
    result.pop("wall_epoch_jd")
    return result


class ControlledRunner(supervisor.SupervisedProcessRunner):
    """Use real admission/async ownership/validation, but no OS child."""

    def __init__(self):
        super().__init__(
            "sim.solar_process_worker:execute_solar_physics_job",
            max_workers=2, max_queue=0,
            max_result_bytes=server.SOLAR_PHYSICS_PROCESS_MAX_RESULT_BYTES,
            result_validator=worker.validate_solar_physics_result,
        )
        self.calls = []
        self.outputs = []
        self.failures = deque()
        self.transform = None
        self.hold = False
        self.release = threading.Event()
        self.entered = threading.Event()
        self.cancel_flags = []

    def _execute(self, job_id, payload, absolute_deadline, cancel_event):
        del job_id
        assert time.monotonic() < absolute_deadline
        self.calls.append(dict(payload))
        self.cancel_flags.append(cancel_event)
        self.entered.set()
        if self.hold and not self.release.wait(5):
            raise AssertionError("owned execution fixture was not released")
        # Deliberately permit a controlled late completion after cancellation;
        # the HTTP owner must not publish a result it no longer receives.
        if self.failures:
            raise self.failures.popleft()
        value = worker.execute_solar_physics_job(payload)
        if self.transform is not None:
            self.transform(value)
        encoded = supervisor._encode_envelope({"status": "ok", "result": value})
        result = self._decode_result(encoded, payload)
        self.outputs.append(result)
        return result


@pytest.fixture
def owned(monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("provider/process acquisition forbidden in non-spawn fixture")

    calculations = []
    clock = {"jd": WALL}

    def compute(cache, resolved, key):
        calculations.append((cache, key))
        return {"lines": [[[1.0, 0.0, 0.0], [2.0, 0.0, 0.0]]],
                "fixture_only": {"numerical_solver_stubbed": True}}

    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(PFSSCache, "_compute_solution", compute)
    monkeypatch.setattr(worker, "current_jd_tdb", lambda: clock["jd"])
    monkeypatch.setattr(server, "current_jd_tdb", lambda: clock["jd"])
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({}))
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})
    monkeypatch.setattr(server, "SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW", 120)
    monkeypatch.setattr(server.app, "middleware_stack", None)
    runners = []

    def replace():
        runner = ControlledRunner()
        # Fail closed if production unexpectedly calls the child-construction seam.
        monkeypatch.setattr(runner._context, "Process", forbidden)
        runners.append(runner)
        monkeypatch.setattr(server, "_solar_physics_runner", runner)
        return runner

    runner = replace()
    client = TestClient(server.app)
    try:
        yield dict(runner=runner, replace=replace, client=client,
                   calculations=calculations, clock=clock, monkeypatch=monkeypatch)
    finally:
        for current in runners:
            current.release.set()
        client.close()
        for current in runners:
            # Only fixture-injected no-child quarantine state is cleared.
            with current._state_lock:
                current._broken_reason = None
                current._quarantine_reason = None
            current.shutdown()
            current._executor.shutdown(wait=True)
            assert current.snapshot()["active_processes"] == 0
            assert current.snapshot()["in_flight"] == 0
            assert all(not thread.is_alive() for thread in current._executor._threads)


def get(owned, changes=None, *, headers=None):
    params = {**BASE, **(changes or {})}
    return owned["client"].get("/solar/physics", params=params, headers=headers)


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


async def direct(changes=None):
    params = {**BASE, **(changes or {})}

    async def receive():
        await asyncio.Event().wait()
        return {"type": "http.disconnect"}

    request = Request({"type": "http", "method": "GET", "path": "/solar/physics",
                       "query_string": urlencode(params).encode(), "headers": [],
                       "client": ("127.0.0.1", 51871), "scheme": "http"}, receive)
    return await server.solar_physics_state(request, **params)


async def until(predicate):
    deadline = asyncio.get_running_loop().time() + 3
    while not predicate():
        assert asyncio.get_running_loop().time() < deadline, "owned fixture did not settle"
        await asyncio.sleep(0.001)


def test_control_actual_route_worker_and_validated_scientific_envelope(owned):
    value = ok(get(owned))
    assert value["schema"] == {"name": "solar_physics_state", "version": 2}
    assert value["epoch_jd_tdb"] == value["epoch_jd"] == EPOCH
    assert value["wall_epoch_jd_tdb"] == value["wall_epoch_jd"] == WALL
    assert value["effective_forcing"] == "synthetic"
    assert value["live_data_enabled"] is False
    assert value["forcing_status"]["runtime_eligible"] is False
    assert value["pfss_field_lines"]["source"] == "synthetic"
    assert value["pfss_field_lines"]["solution_config"]["lmax"] == 9
    assert len(value["pfss_field_lines"]["solution_id"]) == 64
    assert "_solar_worker_request" not in value
    assert len(owned["runner"].calls) == len(owned["calculations"]) == 1


@pytest.mark.parametrize(("forcing", "live_data"), [
    ("synthetic", False), ("synthetic", True), ("hybrid", False), ("hybrid", True),
])
def test_completed_identical_request_reuses_actual_worker_result(owned, forcing, live_data):
    params = dict(forcing=forcing, live_data=live_data)
    first, second = ok(get(owned, params)), ok(get(owned, params))
    assert physical(first) == physical(second)
    assert first["live_data_requested"] is live_data
    assert first["forcing"] == forcing
    assert len(owned["runner"].calls) == 1
    assert len(owned["calculations"]) == 1


@pytest.mark.parametrize("change", [
    {"jd_tdb": str(math.nextafter(EPOCH, math.inf))},
    {"jd_tdb": str(math.nextafter(EPOCH, -math.inf))},
    {"fidelity": "operational"}, {"max_features": 9},
    {"forcing": "hybrid"}, {"live_data": True},
])
def test_control_each_exact_request_dimension_is_separate(owned, change):
    first, second = ok(get(owned)), ok(get(owned, change))
    assert physical(first) != physical(second)
    assert len(owned["runner"].calls) == 2
    assert len(owned["calculations"]) == 2


@pytest.mark.parametrize("params", [
    {"jd_tdb": None, "jd": str(EPOCH)},
    {"jd": str(EPOCH)},
    {"fidelity": " PREVIEW ", "forcing": " SYNTHETIC "},
])
def test_equal_aliases_and_existing_normalization_reuse(owned, params):
    first = ok(get(owned))
    query = {k: v for k, v in {**BASE, **params}.items() if v is not None}
    second = ok(owned["client"].get("/solar/physics", params=query))
    assert physical(first) == physical(second)
    assert len(owned["runner"].calls) == 1


def test_ready_delivery_changes_only_wall_aliases(owned):
    first = ok(get(owned))
    owned["clock"]["jd"] += 0.75
    second = ok(get(owned))
    assert second["wall_epoch_jd_tdb"] == second["wall_epoch_jd"] == WALL + 0.75
    assert physical(first) == physical(second)
    assert {k for k in first if first[k] != second[k]} == {"wall_epoch_jd_tdb", "wall_epoch_jd"}
    assert len(owned["runner"].calls) == 1


def test_returned_python_result_is_detached_from_future_hits(owned):
    async def sequence():
        first = await direct()
        expected = copy.deepcopy(first)
        first["pfss_field_lines"]["lines"][0][0][0] = -999
        first["forcing_status"]["requested"] = "caller mutation"
        second = await direct()
        assert second == expected
        second["geometry_frames"]["pfss"]["caller_mutation"] = True
        third = await direct()
        assert third == expected
    asyncio.run(sequence())
    assert len(owned["runner"].calls) == 1


def test_producer_result_mutation_cannot_change_stored_bytes(owned):
    first = ok(get(owned))
    owned["runner"].outputs[0]["pfss_field_lines"]["solution_config"]["lmax"] = -999
    second = ok(get(owned))
    assert second == first
    assert len(owned["runner"].calls) == 1


def test_three_entry_lru_retains_recent_and_evicts_oldest(owned):
    # A,B,C,A,D,A,C,B => B evicted by D; only five cold executions.
    for offset in (0, 1, 2, 0, 3, 0, 2, 1):
        value = ok(get(owned, {"jd_tdb": str(EPOCH + offset)}))
        assert value["epoch_jd_tdb"] == EPOCH + offset
    assert [p["epoch_jd_tdb"] for p in owned["runner"].calls] == [EPOCH, EPOCH+1, EPOCH+2, EPOCH+3, EPOCH+1]


def test_replaced_owner_has_distinct_ready_lifetime(owned):
    first = ok(get(owned))
    replacement = owned["replace"]()
    second, third = ok(get(owned)), ok(get(owned))
    assert first == second == third
    assert len(owned["runner"].calls) == 1
    assert len(replacement.calls) == 1


def test_old_cold_completion_cannot_displace_new_owner_ready_result(owned):
    old = owned["runner"]
    old.hold = True

    async def sequence():
        task = asyncio.create_task(direct())
        try:
            await until(old.entered.is_set)
            replacement = owned["replace"]()
            fresh = await direct()
            old.release.set()
            retired = await task
            assert physical(retired) == physical(fresh)
            after = await direct()
            assert after == fresh
            assert len(replacement.calls) == 1
        finally:
            old.release.set()
            await asyncio.gather(task, return_exceptions=True)
    asyncio.run(sequence())
    assert len(old.calls) == 1


@pytest.mark.parametrize(("change", "status"), [
    ({"jd": str(EPOCH+1)}, 400), ({"jd_tdb": "nan"}, 400),
    ({"jd_tdb": str(server.SOLAR_PHYSICS_JD_MAX+1)}, 400),
    ({"extra": "no"}, 400), ({"forcing": "data_driven"}, 503),
    ({"max_features": 257}, 413),
])
def test_control_warm_result_does_not_bypass_request_rejection(owned, change, status):
    ok(get(owned))
    response = get(owned, change)
    assert response.status_code == status, response.text
    assert len(owned["runner"].calls) == 1


def test_control_warm_result_still_requires_current_authentication(owned):
    ok(get(owned))
    config = server._load_solar_security_config({"SOLAR_PHYSICS_API_KEYS": "owned-fixture-key"})
    owned["monkeypatch"].setattr(server, "SOLAR_SECURITY_CONFIG", config)
    response = get(owned)
    assert response.status_code == 401, response.text
    assert response.headers["www-authenticate"] == "X-API-Key"
    assert len(owned["runner"].calls) == 1


def test_control_warm_result_still_consumes_http_rate_admission(owned):
    owned["monkeypatch"].setattr(server, "SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW", 1)
    ok(get(owned))
    response = get(owned)
    assert response.status_code == 429, response.text
    assert int(response.headers["retry-after"]) >= 1
    assert len(owned["runner"].calls) == 1


@pytest.mark.parametrize("closed", [False, True])
def test_control_ready_result_cannot_bypass_broken_owner(owned, closed):
    ok(get(owned))
    runner = owned["runner"]
    with runner._state_lock:
        runner._broken_reason = "owned fixture no-child quarantine"
        runner._closed = closed
    response = get(owned)
    assert response.status_code == 503, response.text
    assert response.json()["detail"]["code"] == "solar_compute_unavailable"
    assert server._solar_physics_runner is runner
    assert len(runner.calls) == 1


@pytest.mark.parametrize("failure", [
    supervisor.ProcessTimedOut("owned timeout"), supervisor.ProcessCancelled("owned cancellation"),
    supervisor.ProcessWorkerFailed("owned worker failure"), supervisor.ProcessCrashed(17),
    supervisor.ProcessResultRejected("owned invalid result"),
])
def test_control_failed_execution_does_not_publish(owned, failure):
    owned["runner"].failures.append(failure)
    assert get(owned).status_code == 503
    recovered = ok(get(owned))
    assert recovered["epoch_jd_tdb"] == EPOCH
    assert len(owned["runner"].calls) == 2
    assert len(owned["calculations"]) == 1


def test_control_actual_wire_limit_rejection_does_not_publish(owned):
    runner = owned["runner"]
    runner.transform = lambda value: value.update(owned_padding="x" * runner._max_result_bytes)
    response = get(owned)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "solar_compute_invalid_result"
    runner.transform = None
    value = ok(get(owned))
    assert "owned_padding" not in value
    assert len(runner.calls) == 2


def test_control_cancelled_owner_late_success_is_not_published(owned):
    runner = owned["runner"]
    runner.hold = True

    async def sequence():
        task = asyncio.create_task(direct())
        try:
            await until(runner.entered.is_set)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert runner.cancel_flags[0].is_set()
            runner.release.set()
            await until(lambda: runner.snapshot()["in_flight"] == 0)
            value = await direct()
            assert value["epoch_jd_tdb"] == EPOCH
            assert len(runner.calls) == 2
        finally:
            runner.release.set()
            await asyncio.gather(task, return_exceptions=True)
    asyncio.run(sequence())


def test_control_concurrent_cold_misses_keep_independent_execution(owned):
    runner = owned["runner"]
    runner.hold = True

    async def sequence():
        tasks = [asyncio.create_task(direct()), asyncio.create_task(direct())]
        try:
            await until(lambda: len(runner.calls) == 2)
            assert runner.snapshot()["in_flight"] == 2
            runner.release.set()
            first, second = await asyncio.gather(*tasks)
            assert physical(first) == physical(second)
            assert len(runner.calls) == 2
        finally:
            runner.release.set()
            await asyncio.gather(*tasks, return_exceptions=True)
    asyncio.run(sequence())


def test_ready_hit_does_not_enter_saturated_cold_admission(owned):
    first = ok(get(owned))
    runner = owned["runner"]
    leases = 0
    try:
        # Owned semaphore leases emulate full cold capacity, not running children.
        while runner._capacity.acquire(blocking=False):
            leases += 1
        assert leases == runner.snapshot()["capacity"] == 2
        second = ok(get(owned))
        assert second == first
        assert len(runner.calls) == 1
        assert runner.snapshot()["in_flight"] == 0
        assert not runner._capacity.acquire(blocking=False)
    finally:
        for _ in range(leases):
            runner._capacity.release()


def test_shutdown_and_normal_runner_replacement_do_not_reuse_retired_entry(owned):
    first = ok(get(owned))
    old = owned["runner"]
    server._shutdown_solar_physics_runner()
    assert old.snapshot()["closed"] is True
    assert old.snapshot()["in_flight"] == 0
    replacements = []

    def factory():
        replacement = owned["replace"]()
        replacements.append(replacement)
        return replacement

    owned["monkeypatch"].setattr(server, "_new_solar_physics_runner", factory)
    second, third = ok(get(owned)), ok(get(owned))
    assert first == second == third
    assert len(replacements) == 1
    assert len(old.calls) == 1
    assert len(replacements[0].calls) == 1

@pytest.mark.parametrize(('field_path', 'replacement'), [
    (('effective_forcing',), 'data_driven'),
    (('live_data_enabled',), True),
    (('forcing_status', 'runtime_eligible'), True),
    (('forcing_status', 'effective'), 'observed'),
    (('pfss_field_lines', 'source'), 'observed'),
])
def test_non_synthetic_eligibility_is_cold_compatible_not_ready(owned, field_path, replacement):
    def transform(value):
        target = value
        for key in field_path[:-1]:
            target = target[key]
        target[field_path[-1]] = replacement

    owned['runner'].transform = transform
    first, second = ok(get(owned)), ok(get(owned))
    target = first
    for key in field_path:
        target = target[key]
    assert target == replacement
    assert physical(first) == physical(second)
    assert len(owned['runner'].calls) == 2
    assert len(owned['calculations']) == 2


# Introduced lifecycle review gap: replacement must retire old token storage.
@pytest.mark.parametrize('alternative', [False, True])
def test_replacement_retires_storage_held_by_an_old_cold_owner(owned, alternative):
    ok(get(owned))
    retired = server._solar_physics_ready_cache
    assert retired.active is True
    assert len(retired.entries) == 1
    assert retired.stored_bytes == sum(map(len, retired.entries.values())) > 0
    if alternative:
        replacement = object()
        owned['monkeypatch'].setattr(server, '_solar_physics_runner', replacement)
    else:
        replacement = owned['replace']()
    assert server._get_solar_physics_runner() is replacement
    assert retired.active is False
    assert retired.entries == {}
    assert retired.stored_bytes == 0
    if alternative:
        assert server._solar_physics_ready_cache is None
    else:
        current = server._solar_physics_ready_cache
        assert current is not retired
        assert current.runner is replacement
        assert current.active is True


@pytest.mark.parametrize("initial_delivery", ["full", "render-v1"])
def test_ready_cache_applies_requested_delivery_without_losing_full_geometry(owned, initial_delivery):
    first = ok(get(owned, {"delivery": initial_delivery}))
    expected = physical(first)
    expected.pop("delivery", None)
    owned["clock"]["jd"] += 0.75

    response = get(owned, {"delivery": "render-v1"})
    complete = ok(response)
    assert response.headers["content-encoding"] == "gzip"
    assert int(response.headers["content-length"]) <= 512 * 1024
    assert complete["delivery"]["geometry_included"] is True
    version = complete["delivery"]["geometry_version"]
    assert len(version) == 64
    assert complete["wall_epoch_jd_tdb"] == complete["wall_epoch_jd"] == WALL + 0.75
    for key in expected:
        assert complete[key] == expected[key]

    reused = ok(get(owned, {"delivery": "render-v1", "geometry_version": version}))
    assert reused["delivery"]["geometry_version"] == version
    assert reused["delivery"]["geometry_included"] is False
    assert "features" not in reused["corona"]
    assert "lines" not in reused["pfss_field_lines"]
    assert "lines" not in reused["heliosphere"]["parker_spiral"]
    assert reused["activity_index"] == first["activity_index"]
    assert reused["epoch_jd_tdb"] == EPOCH
    assert reused["wall_epoch_jd_tdb"] == WALL + 0.75

    unknown_version = "0" * 64 if version != "0" * 64 else "1" * 64
    recovered = ok(get(owned, {"delivery": "render-v1", "geometry_version": unknown_version}))
    assert recovered == complete
    full = ok(get(owned, {"delivery": "full", "geometry_version": version}))
    assert "delivery" not in full
    assert physical(full) == expected
    assert full["wall_epoch_jd_tdb"] == WALL + 0.75
    assert len(owned["runner"].calls) == len(owned["calculations"]) == 1


@pytest.mark.parametrize("limit", ["MAX_ENCODED_BYTES", "MAX_DECODED_BYTES"])
def test_ready_render_delivery_still_enforces_response_budget(owned, limit):
    import solar_delivery

    full = ok(get(owned))
    owned["monkeypatch"].setattr(solar_delivery, limit, 1)
    response = get(owned, {"delivery": "render-v1"})
    assert response.status_code == 413, response.text
    assert response.json()["detail"]["code"] == "solar_delivery_budget_exceeded"
    assert ok(get(owned)) == full
    assert len(owned["runner"].calls) == 1
