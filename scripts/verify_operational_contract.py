#!/usr/bin/env python3
"""Local two-worker authenticated WS/HTTP soak; not a deployed-URL acceptance gate.

The generated ASGI wrapper exposes test-only ownership probes. Production server
code, simulation engines, transport and authentication remain unchanged. Run with
ci/backend-test-requirements.txt; --artifacts must name a new directory.
"""
from __future__ import annotations

import argparse
import asyncio
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import time

import httpx
from websockets.asyncio.client import connect


PROBE_APP = '''import asyncio, gc, hmac, json, os, threading
from urllib.parse import parse_qs
import server

unhandled = []
sessions = set()
configured = False

async def app(scope, receive, send):
    global configured
    if not configured:
        asyncio.get_running_loop().set_exception_handler(lambda loop, context: unhandled.append({
            "message": context.get("message"),
            "exception_type": type(context.get("exception")).__name__,
        }))
        configured = True
    if scope["type"] == "http" and scope["path"] == "/__operational_probe":
        headers = dict(scope.get("headers", []))
        if not hmac.compare_digest(headers.get(b"x-api-key", b""), os.environ["SOLAR_PHYSICS_API_KEYS"].encode()):
            await send({"type": "http.response.start", "status": 401, "headers": []})
            await send({"type": "http.response.body", "body": b"unauthorized"})
            return
        gc.collect()
        runners = [thread for thread in threading.enumerate()
                   if isinstance(getattr(getattr(thread, "_target", None), "__self__", None), server.SimulationRunner)]
        with server._ws_sim_connection_lock:
            leases = len(server._ws_sim_active_leases)
            active = server._ws_sim_active_connections
            subjects = sum(server._ws_sim_active_connections_by_subject.values())
        payload = {"pid": os.getpid(), "sessions": sorted(sessions), "runners": len(runners),
                   "leases": leases, "active": active, "subjects": subjects,
                   "tasks": len(asyncio.all_tasks()), "threads": len(threading.enumerate()),
                   "fds": len(os.listdir("/proc/self/fd")), "unhandled": unhandled,
                   "benchmark_permits": server._benchmark_concurrent_guard._value,
                   "compute_queue": server._heavy_compute_executor._work_queue.qsize()}
        await send({"type": "http.response.start", "status": 200,
                    "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": json.dumps(payload).encode()})
        return
    session = None
    if scope["type"] == "websocket":
        session = parse_qs(scope.get("query_string", b"").decode()).get("operational_session", [""])[0]
        sessions.add(session)
    try:
        await server.app(scope, receive, send)
    finally:
        if session is not None:
            sessions.discard(session)
'''


def unused_port():
    with closing(socket.socket()) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def exercise(port, token, artifacts, duration, cycles, report):
    base = f"http://127.0.0.1:{port}"
    wsbase = f"ws://127.0.0.1:{port}/ws/sim?engine=rebound&fps=20&stream_hz=10"
    auth = {"x-api-key": token}
    limits = httpx.Limits(max_keepalive_connections=0, max_connections=16)
    from contextlib import AsyncExitStack
    async with AsyncExitStack() as stack:
        http = await stack.enter_async_context(httpx.AsyncClient(base_url=base, timeout=5, limits=limits))
        pinned = {}
        async def probes():
            # Retain one authenticated TCP connection per observed worker. The
            # shared listener has no round-robin fairness contract; repeated new
            # connections are not a reliable per-worker cleanup measurement.
            for _ in range(30):
                if len(pinned) == 2:
                    found = {}
                    for expected_pid, transport in pinned.items():
                        reply = await transport.get("/__operational_probe", headers=auth)
                        reply.raise_for_status()
                        value = reply.json()
                        assert value["pid"] == expected_pid, "worker-affined probe connection changed owner"
                        found[expected_pid] = value
                    return found
                candidates = [await stack.enter_async_context(httpx.AsyncClient(
                    base_url=base, timeout=5,
                    limits=httpx.Limits(max_keepalive_connections=1, max_connections=1, keepalive_expiry=None),
                )) for _ in range(8)]
                replies = await asyncio.gather(*[
                    transport.get("/__operational_probe", headers=auth) for transport in candidates
                ])
                for transport, reply in zip(candidates, replies):
                    reply.raise_for_status()
                    pid = reply.json()["pid"]
                    if pid not in pinned:
                        pinned[pid] = transport
                    else:
                        await transport.aclose()
                await asyncio.sleep(0.05)
            raise AssertionError("could not establish authenticated probes to two workers")

        deadline = time.monotonic() + 30
        while True:
            try:
                if (await http.get("/health/live")).status_code == 200:
                    break
            except httpx.TransportError:
                pass
            assert time.monotonic() < deadline, "server startup exceeded 30 seconds"
            await asyncio.sleep(0.1)
        assert (await http.get("/info")).status_code == 401
        assert (await http.get("/info", headers={"x-api-key": "invalid"})).status_code == 401

        async def open_session(label):
            ws = await connect(wsbase + "&operational_session=" + label, additional_headers=auth,
                               open_timeout=5, close_timeout=3, max_size=2 * 1024 * 1024)
            try:
                hello = json.loads(await asyncio.wait_for(ws.recv(), 5))
                assert hello["type"] == "connected", hello
                assert hello["engine"] == "rebound", hello
                return ws
            except BaseException:
                await ws.close()
                raise

        # Warm real engines and the compute pool before measuring idle cleanup.
        for index in range(4):
            warm = await open_session(f"warm-{index}")
            await warm.close()
        for _ in range(4):
            reply = await http.get("/benchmark/accuracy?ephemeris_provider=kepler", headers=auth)
            assert reply.status_code == 200, reply.text
        await asyncio.sleep(0.3)
        report["baseline"] = await probes()
        assert all(value["runners"] == value["active"] == value["leases"] == 0
                   for value in report["baseline"].values())

        # Exercise actual network-profile report writes in an owned subdirectory.
        logical = f"operational-soak-{artifacts.name}/report.md"
        path = Path(__file__).resolve().parents[1] / "my-notes" / logical
        created_report = False
        try:
            body = {"output_path": logical, "ephemeris_provider": "kepler"}
            assert (await http.post("/benchmark/accuracy/report", json=body)).status_code == 401
            made = await http.post("/benchmark/accuracy/report", headers=auth, json=body)
            assert made.status_code == 200, made.text
            created_report = True
            assert not Path(made.json()["reportPath"]).is_absolute()
            original = path.read_bytes()
            conflict = await http.post("/benchmark/accuracy/report", headers=auth, json=body)
            assert conflict.status_code == 409
            assert conflict.json()["detail"]["code"] == "benchmark_report_exists"
            assert path.read_bytes() == original
            bad = await http.post("/benchmark/accuracy/report", headers=auth, json={"output_path": "bad\x00.md"})
            assert bad.status_code == 422
            report["report_writer"] = {"unauthenticated": 401, "create": 200, "overwrite_guard": 409,
                                       "nul": 422, "report_sha256": hashlib.sha256(original).hexdigest()}
        finally:
            if created_report:
                path.unlink()
                path.parent.rmdir()

        sockets = []
        readers = []
        counts = [0, 0]
        last_jd = [None, None]
        captured = asyncio.Event()
        async def consume(index, ws):
            async for raw in ws:
                value = json.loads(raw)
                assert value.get("type") != "error", value
                if value.get("type") != "state_update":
                    continue
                counts[index] += 1
                last_jd[index] = value["jd"]
                kuiper = value.get("kuiper")
                if kuiper is not None and not captured.is_set():
                    assert isinstance(kuiper, dict)
                    assert len(kuiper["positions"]) == len(kuiper["velocities"]) > 0
                    assert all(len(row) == 3 for row in kuiper["positions"])
                    capture = artifacts / "kuiper-wire.json"
                    capture.write_text(raw, encoding="utf-8")
                    report["kuiper"] = {"keys": sorted(kuiper), "positions": len(kuiper["positions"]),
                                        "velocities": len(kuiper["velocities"]), "binary_pairs": len(kuiper["binary_pairs"]),
                                        "position_units": kuiper["position_units"], "velocity_units": kuiper["velocity_units"],
                                        "sha256": hashlib.sha256(raw.encode()).hexdigest()}
                    captured.set()

        try:
            # Pin the persistent pair empirically to distinct worker PIDs.
            first = await open_session("persistent-0")
            sockets.append(first)
            first_samples = await probes()
            first_pid = next(pid for pid, value in first_samples.items() if "persistent-0" in value["sessions"])
            readers.append(asyncio.create_task(consume(0, first)))
            for attempt in range(30):
                label = f"persistent-1-{attempt}"
                second = await open_session(label)
                samples = await probes()
                second_pid = next(pid for pid, value in samples.items() if label in value["sessions"])
                if second_pid != first_pid:
                    sockets.append(second)
                    readers.append(asyncio.create_task(consume(1, second)))
                    break
                await second.close()
                await asyncio.sleep(0.05)
            assert len(sockets) == 2, "persistent sessions did not reach two distinct workers"
            report["persistent_worker_pids"] = [first_pid, second_pid]
            await first.send(json.dumps({"type": "activate_kuiper", "center": [42, 0, 0], "spread": 2}))
            await asyncio.wait_for(captured.wait(), 10)
            await first.send(json.dumps({"type": "deactivate_kuiper"}))
            started = time.monotonic()
            churn = 0
            latencies = []
            samples_over_time = []
            # Churn includes both graceful close and transport abort. Persistent
            # sessions continue receiving real native-engine frames throughout.
            while time.monotonic() - started < duration:
                for reader in readers:
                    if reader.done():
                        await reader
                        raise AssertionError("persistent reader ended before soak deadline")
                before = time.monotonic()
                reply = await http.get("/info", headers=auth)
                latencies.append(time.monotonic() - before)
                assert reply.status_code == 200
                if churn < cycles:
                    transient = await open_session(f"churn-{churn}")
                    if churn % 2:
                        transient.transport.abort()
                        await transient.wait_closed()
                    else:
                        await transient.close()
                    churn += 1
                snapshots = await probes()
                for value in snapshots.values():
                    assert value["active"] == value["leases"] == value["subjects"]
                    assert value["active"] <= 4 and value["runners"] <= 4
                    assert not value["unhandled"], value["unhandled"]
                samples_over_time.append(snapshots)
                await asyncio.sleep(0.25)
            report["soak"] = {"elapsed_seconds": time.monotonic() - started, "requested_seconds": duration,
                              "frames": counts, "last_jd": last_jd, "churn_cycles": churn,
                              "http_requests": len(latencies), "max_http_seconds": max(latencies),
                              "samples": len(samples_over_time)}
            (artifacts / "ownership-samples.json").write_text(json.dumps(samples_over_time), encoding="utf-8")
            assert churn == cycles
            assert min(counts) >= max(1, int(duration))
        finally:
            for ws in sockets:
                await ws.close()
            for reader in readers:
                if not reader.done():
                    reader.cancel()
            await asyncio.gather(*readers, return_exceptions=True)

        cleanup_deadline = time.monotonic() + 5
        while True:
            final = await probes()
            clean = all(value["runners"] == value["leases"] == value["active"] == value["subjects"] == 0
                        and not value["sessions"] and not value["unhandled"]
                        and value["benchmark_permits"] == 1 and value["compute_queue"] == 0
                        for value in final.values())
            if clean:
                break
            assert time.monotonic() < cleanup_deadline, final
            await asyncio.sleep(0.1)
        report["final"] = final
        for pid, value in final.items():
            baseline = report["baseline"][pid]
            assert value["tasks"] <= baseline["tasks"]
            # At most two lazy compute workers may have been created after
            # warmup. Runner count must still be exactly zero, not a tolerance.
            assert value["threads"] <= baseline["threads"] + 2
            assert value["fds"] <= baseline["fds"] + 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--duration", type=float, default=300)
    parser.add_argument("--cycles", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.duration <= 900 or not 1 <= args.cycles <= 1000:
        parser.error("duration must be 1..900 seconds and cycles 1..1000")
    args.artifacts.mkdir(parents=True, exist_ok=False)
    artifacts = args.artifacts.resolve()
    (artifacts / "operational_probe_app.py").write_text(PROBE_APP, encoding="utf-8")
    root = Path(__file__).resolve().parents[1]
    token = secrets.token_urlsafe(32)
    port = unused_port()
    environment = {**os.environ, "SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": token,
                   "PYTHONPATH": os.pathsep.join([str(artifacts), str(root / "backend")]),
                   "WS_SIM_CONNECTION_LIMIT": "4", "WS_SIM_PER_SUBJECT_CONNECTION_LIMIT": "2",
                   "TRAJECTORY_RATE_LIMIT_PER_WINDOW": "120",
                   "PYTHONHASHSEED": "0", "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1",
                   "MKL_NUM_THREADS": "1", "NUMEXPR_NUM_THREADS": "1", "TZ": "UTC"}
    report = {"scope": "local real two-worker network profile; no remote deployment claim", "passed": False}
    log_path = artifacts / "uvicorn.log"
    process = None
    try:
        with log_path.open("w", encoding="utf-8") as log:
            process = subprocess.Popen([
                sys.executable, "-m", "uvicorn", "operational_probe_app:app", "--host", "127.0.0.1",
                "--port", str(port), "--workers", "2", "--no-proxy-headers", "--ws-max-size", "16384",
                "--timeout-keep-alive", "600",
            ], cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            asyncio.run(asyncio.wait_for(exercise(port, token, artifacts, args.duration, args.cycles, report),
                                        timeout=args.duration + 90))
            report["passed"] = True
    except Exception as exc:
        report["failure"] = {"type": type(exc).__name__, "message": str(exc).replace(token, "[REDACTED]")[:2000]}
    finally:
        if process is not None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
                report["passed"] = False
                report["forced_shutdown"] = True
            report["process_returncode"] = process.returncode
            if process.returncode != 0:
                report["passed"] = False
        if log_path.exists():
            log = log_path.read_text(encoding="utf-8")
            forbidden = ["Task exception was never retrieved", "Future exception was never retrieved",
                         "Task was destroyed but it is pending", "Exception in ASGI application", "Traceback (most recent call last)"]
            report["log_errors"] = [text for text in forbidden if text in log]
            if report["log_errors"] or token in log:
                report["passed"] = False
            if token in log:
                log_path.write_text(log.replace(token, "[REDACTED]"), encoding="utf-8")
        (artifacts / "result.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
