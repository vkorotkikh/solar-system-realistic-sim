"""Owned no-socket process targets and isolated interpreter-settings probe."""
from functools import partial
import json
import multiprocessing
import os
import sys


def composition():
    main = sys.modules.get("__mp_main__")
    server = sys.modules.get("server")
    main_app = getattr(main, "app", None)
    server_app = getattr(server, "app", None)
    return {
        "pid": os.getpid(),
        "main_file": getattr(main, "__file__", None),
        "main_has_app": main_app is not None,
        "named_server_has_app": server_app is not None,
        "duplicate_apps": main_app is not None and server_app is not None and main_app is not server_app,
        "main_has_runner": hasattr(main, "_solar_physics_runner"),
        "main_has_compute_executor": hasattr(main, "_heavy_compute_executor"),
    }


def solar_capture(payload):
    print("BKP029_WORKER_ENTERED", flush=True)
    before = composition()
    from sim.solar_process_worker import execute_solar_physics_job, validate_solar_physics_result
    result = validate_solar_physics_result(execute_solar_physics_job(payload), payload)
    return {
        "before": before,
        "physics": {
            "schema": result["schema"], "source": result["source"],
            "epoch_jd_tdb": result["epoch_jd_tdb"],
            "feature_count": result["corona"]["feature_count"],
        },
    }


def run_worker():
    from sim.process_supervisor import HARD_MAX_TIMEOUT_SECONDS, SupervisedProcessRunner
    runner = SupervisedProcessRunner("server_launcher_probe:solar_capture", max_workers=1, max_queue=0)
    # The supervisor's deadline runs from submit(), so it includes spawn,
    # interpreter boot and imports: ~2.3 CPU-seconds, but over 10 s of wall
    # clock on a CPU-starved host (the BKP029 load flake). It is a latency
    # contract, not part of this isolation oracle, so use the supervisor's own
    # cap, as conftest's runner_independent_solar_deadline does. The future
    # always settles by that deadline, so result() adds no second guess.
    try:
        result = runner.submit({
            "epoch_jd_tdb": 2460400.5, "fidelity": "preview", "max_features": 8,
            "forcing": "synthetic", "live_data": False,
        }, timeout_seconds=HARD_MAX_TIMEOUT_SECONDS).result()
    finally:
        runner.shutdown()
    return {"result": result, "final_snapshot": runner.snapshot()}


def reload_capture(config, connection, *, sockets):
    try:
        assert sockets == []
        config.load()
        connection.send({"reload": composition(), "worker": run_worker()})
    finally:
        connection.close()


def intercept_uvicorn_run(app, **kwargs):
    from uvicorn import Config
    from uvicorn._subprocess import get_subprocess
    app_dir = kwargs.get("app_dir")
    if app_dir is not None:
        sys.path.insert(0, app_dir)
    config = Config(app, host=kwargs.get("host", "127.0.0.1"), port=kwargs.get("port", 8042),
                    reload=kwargs.get("reload", False), proxy_headers=kwargs.get("proxy_headers", True),
                    ws_max_size=kwargs.get("ws_max_size", 16384), log_level="error")
    if not config.reload:
        config.load()
        result = {"reload": composition(), "worker": run_worker(), "reload_exitcode": None}
        result["launch"] = {"app": app, "host": config.host, "port": config.port,
                            "reload": config.reload, "proxy_headers": config.proxy_headers,
                            "ws_max_size": config.ws_max_size}
        result["launch_pid"] = os.getpid()
        result["app_dir"] = app_dir
        print("BKP029_RESULT=" + json.dumps(result, sort_keys=True), flush=True)
        return
    context = multiprocessing.get_context("spawn")
    receive, send = context.Pipe(duplex=False)
    process = get_subprocess(config, partial(reload_capture, config, send), sockets=[])
    try:
        process.start()
        send.close()
        # Event-driven handshake: wake on the child's report, or on EOF if it
        # dies first (our copy of the write end is closed). No guessed duration;
        # a true hang is bounded by the test's outer launch watchdog.
        receive.poll(None)
        try:
            result = receive.recv()
        except EOFError:
            process.join()
            raise RuntimeError(f"owned Uvicorn child exited {process.exitcode} without reporting") from None
        process.join()
        if process.exitcode != 0:
            raise RuntimeError("owned Uvicorn child did not exit cleanly")
        result["launch"] = {"app": app, "host": config.host, "port": config.port,
                            "reload": config.reload, "proxy_headers": config.proxy_headers,
                            "ws_max_size": config.ws_max_size}
        result["reload_exitcode"] = process.exitcode
        result["launch_pid"] = os.getpid()
        result["app_dir"] = app_dir
        print("BKP029_RESULT=" + json.dumps(result, sort_keys=True), flush=True)
    finally:
        if process.is_alive():
            process.terminate()
            process.join(2)
        if process.is_alive():
            process.kill()
            process.join(2)
        receive.close()
        send.close()
        if process.pid is not None and not process.is_alive():
            process.close()


def environment_interceptor(original_run):
    """Capture Click/Config policy without loading the API, sockets or workers."""
    import inspect
    from uvicorn import Config
    signature = inspect.signature(original_run)

    def capture(*args, **kwargs):
        bound = signature.bind(*args, **kwargs)
        bound.apply_defaults()
        values = bound.arguments
        config = Config(
            values["app"], workers=values["workers"], env_file=values["env_file"],
            forwarded_allow_ips=values["forwarded_allow_ips"], reload=values["reload"],
            log_config=None, log_level="error",
        )
        print("ENV_RESULT=" + json.dumps({
            "pid": os.getpid(), "workers_argument": values["workers"],
            "workers_config": config.workers, "env_file": values["env_file"],
            "reload": values["reload"], "host": values["host"], "port": values["port"],
            "proxy_headers": values["proxy_headers"], "ws_max_size": values["ws_max_size"],
            "forwarded_allow_ips": config.forwarded_allow_ips,
            "api_key_preserved": os.environ.get("SOLAR_PHYSICS_API_KEYS") == "owned-synthetic-key",
            "unrelated_value": os.environ.get("OWNED_UNRELATED_ENVIRONMENT"),
            "app_loaded": config.loaded or "server" in sys.modules,
        }), flush=True)
    return capture


def run_environment_entry():
    import importlib.util
    from pathlib import Path
    reload = sys.argv[3] == "true"
    if sys.argv[2] == "old":
        import uvicorn
        uvicorn.run("server:app", host="0.0.0.0", port=8042, proxy_headers=False,
                    reload=reload, ws_max_size=16384)
    else:
        spec = importlib.util.spec_from_file_location(
            "actual_server_launcher", Path(__file__).resolve().parents[2] / "server_launcher.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.reexec_uvicorn(host="0.0.0.0", reload=reload, ws_max_size=16384)


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "environment":
    run_environment_entry()
    raise SystemExit(0)


SNAPSHOT = '''
import _imp, json, os, sys
names = ("debug", "optimize", "dont_write_bytecode", "no_user_site", "no_site", "ignore_environment", "verbose", "bytes_warning", "quiet", "isolated", "dev_mode", "utf8_mode", "warn_default_encoding", "safe_path", "int_max_str_digits")
snapshot = {"flags": {name: getattr(sys.flags, name) for name in names}, "warnings": sys.warnoptions, "xoptions": sys._xoptions, "stdout_write_through": sys.stdout.write_through, "stderr_write_through": sys.stderr.write_through, "hash_pycs": _imp.check_hash_based_pycs, "pid": os.getpid()}
print("FLAG_SNAPSHOT=" + json.dumps(snapshot, sort_keys=True), flush=True)
'''


if __name__ == "__main__":
    # Explicit-path loading works even under -I/-E; never imports the API.
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location(
        "actual_server_launcher", Path(__file__).resolve().parents[2] / "server_launcher.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    exec(SNAPSHOT)
    options = module.original_interpreter_options(sys.orig_argv)
    print("REEXEC_OPTIONS=" + json.dumps(options), flush=True)
    os.execv(sys.executable, [sys.executable, *options, "-c", SNAPSHOT])
