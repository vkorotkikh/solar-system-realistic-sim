"""BKP029: file launch must not compose API objects in spawned physics workers.

Regression found by gstack QA, 2026-10-24. Native fixtures intercept Uvicorn
before socket binding while retaining real configuration, spawning and physics.
Flag fixtures execute only stdlib snapshots and the actual launcher helper.
"""
from pathlib import Path
import json
import os
import signal
import subprocess
import sys

import pytest

from sim.process_supervisor import HARD_MAX_TIMEOUT_SECONDS

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / "fixtures"
# Hang watchdog only, never pacing: the child normally exits by itself. It must
# outlast the worker's own supervisor cap (plus an equal allowance for boot and
# teardown) so CPU starvation surfaces as the worker's ProcessTimedOut, not as
# a harness kill, and so a loaded runner is not mistaken for a hang.
LAUNCH_WATCHDOG_SECONDS = 2 * HARD_MAX_TIMEOUT_SECONDS


def launch(entry, profile, cwd, websocket_bytes, *, include_key=True):
    command = ([sys.executable, "-m", "uvicorn", "server:app", "--app-dir", str(ROOT / "backend"),
                "--host", "127.0.0.1" if profile == "local" else "0.0.0.0", "--port", "8042",
                "--no-proxy-headers", "--ws-max-size", str(websocket_bytes)]
               if entry == "module" else [sys.executable, str(ROOT / "backend/server.py")])
    if entry == "module" and profile == "local":
        command.append("--reload")
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(("SOLAR_", "REBOUND_", "TUDAT_", "WS_SIM_")):
            env.pop(key)
    # Intentionally exclude backend: script-directory imports must survive exec
    # through the real --app-dir option, not this fixture's PYTHONPATH.
    env.update(PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=str(FIXTURE / "server_launcher_site"),
               SOLAR_SECURITY_PROFILE=profile, WS_SIM_COMMAND_MAX_BYTES=str(websocket_bytes),
               OMP_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1", MKL_NUM_THREADS="1", NUMEXPR_NUM_THREADS="1")
    if profile == "network" and include_key:
        env["SOLAR_PHYSICS_API_KEYS"] = "owned-fixture-not-a-real-credential"
    child = subprocess.Popen(command, cwd=cwd, env=env, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, stderr = child.communicate(timeout=LAUNCH_WATCHDOG_SECONDS)
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.communicate(timeout=3)
    record = {"entry": entry, "profile": profile, "cwd": str(cwd), "command": command,
              "owner_pid": child.pid, "returncode": child.returncode, "stdout": stdout, "stderr": stderr}
    print(json.dumps(record, sort_keys=True))
    return record


@pytest.mark.skipif(os.name != "posix", reason="Owned native process-group cleanup requires POSIX")
@pytest.mark.parametrize("entry,profile,location,websocket_bytes", [
    ("module", "local", "backend", 16384),
    ("file", "local", "backend", 16384),
    ("file", "local", "repository", 16384),
    ("file", "local", "foreign", 4096),
    ("module", "local", "foreign", 4096),
    ("file", "network", "repository", 16384),
    ("module", "network", "repository", 16384),
    ("file", "network", "foreign", 4096),
    ("module", "network", "foreign", 4096),
])
def test_real_entrypoint_keeps_process_identity_flags_and_spawn_isolation(
    tmp_path, entry, profile, location, websocket_bytes,
):
    cwd = {"backend": ROOT / "backend", "repository": ROOT, "foreign": tmp_path}[location]
    record = launch(entry, profile, cwd, websocket_bytes)
    assert record["returncode"] == 0
    assert record["stderr"] == ""
    lines = [line for line in record["stdout"].splitlines() if line.startswith("BKP029_RESULT=")]
    assert len(lines) == 1
    observed = json.loads(lines[0].split("=", 1)[1])
    assert observed["launch_pid"] == record["owner_pid"], "replacement must not leave an extra launcher process"
    assert observed["launch"] == {
        "app": "server:app", "host": "127.0.0.1" if profile == "local" else "0.0.0.0",
        "port": 8042, "reload": profile == "local", "proxy_headers": False, "ws_max_size": websocket_bytes,
    }
    assert observed["reload_exitcode"] == (0 if profile == "local" else None)
    assert record["stdout"].count("BKP029_WORKER_ENTERED") == 1
    final = observed["worker"]["final_snapshot"]
    assert final["closed"] and final["active_processes"] == 0 and final["in_flight"] == 0
    physics = observed["worker"]["result"]["physics"]
    assert physics["source"] == "backend" and physics["schema"] == {"name": "solar_physics_state", "version": 2}
    assert physics["epoch_jd_tdb"] == 2460400.5 and 0 <= physics["feature_count"] <= 8
    assert observed["reload"]["named_server_has_app"]
    # Accumulate both facets: the first defect must not hide the second oracle.
    failures = []
    if observed["reload"]["duplicate_apps"]:
        failures.append("duplicate API composition in serving process")
    before = observed["worker"]["result"]["before"]
    if before["main_has_app"] or before["named_server_has_app"]:
        failures.append("API application composed in solar child")
    if before["main_has_runner"] or before["main_has_compute_executor"]:
        failures.append("unused API runner/executor composed in solar child")
    assert not failures, {"failures": failures, "observed": observed}


@pytest.mark.skipif(os.name != "posix", reason="Owned native process-group cleanup requires POSIX")
@pytest.mark.parametrize("entry", ["module", "file"])
@pytest.mark.parametrize("profile,message", [
    ("network", "SOLAR_PHYSICS_API_KEYS must contain at least one key"),
    ("invalid", "SOLAR_SECURITY_PROFILE must be either 'local' or 'network'"),
])
def test_invalid_security_configuration_fails_before_any_worker(tmp_path, entry, profile, message):
    record = launch(entry, profile, tmp_path, 16384, include_key=False)
    assert record["returncode"] != 0
    assert message in record["stderr"]
    assert "BKP029_RESULT=" not in record["stdout"]
    assert "BKP029_WORKER_ENTERED" not in record["stdout"]


PROBE = FIXTURE / "server_launcher_probe.py"


CASES = [
    (["-B"], "file", ["-B"]),
    (["-O"], "file", ["-O"]),
    (["-OO"], "file", ["-OO"]),
    (["-BO"], "file", ["-BO"]),
    (["-E"], "file", ["-E"]),
    (["-I"], "file", ["-I"]),
    (["-u"], "file", ["-u"]),
    (["-P"], "file", ["-P"]),
    (["-s"], "file", ["-s"]),
    (["-W", "error::UserWarning"], "file", ["-W", "error::UserWarning"]),
    (["-X", "utf8=1"], "file", ["-X", "utf8=1"]),
    (["-X", "warn_default_encoding"], "file", ["-X", "warn_default_encoding"]),
    (["-X", "int_max_str_digits=640"], "file", ["-X", "int_max_str_digits=640"]),
    (["-W", "--"], "file", ["-W", "--"]),
    (["-X", "--"], "file", ["-X", "--"]),
    (["-BW", "--"], "file", ["-BW", "--"]),
    (["--check-hash-based-pycs", "always"], "file", ["--check-hash-based-pycs", "always"]),
    (["-BO", "--"], "file", ["-BO"]),
    (["-W", str(PROBE)], "file", ["-W", str(PROBE)]),
    (["-X", str(PROBE)], "file", ["-X", str(PROBE)]),
    (["-BO"], "module", ["-BO"]),
    ([], "bundled_module", ["-BO"]),
    ([], "bundled_command", ["-BO"]),
]


@pytest.mark.parametrize("options,kind,expected_options", CASES)
def test_real_reexec_preserves_interpreter_contract(options, kind, expected_options):
    strategy = "prefix"
    if kind == "file":
        target = [str(PROBE)]
    elif kind == "module":
        target = ["-m", "server_launcher_probe"]
    elif kind == "bundled_module":
        target = ["-BOmserver_launcher_probe"]
    else:
        target = ["-BOc", f"import runpy; runpy.run_path({str(PROBE)!r}, run_name='__main__')"]
    env = {key: value for key, value in os.environ.items() if not key.startswith("PYTHON")}
    env["PYTHONPATH"] = str(FIXTURE)
    command = [sys.executable, *options, *target, strategy, "--", "-I", "ignored-script-argument"]
    result = subprocess.run(command, cwd=FIXTURE, env=env, text=True, capture_output=True, timeout=5)
    print(json.dumps({"command": command, "returncode": result.returncode,
                      "stdout": result.stdout, "stderr": result.stderr}, sort_keys=True))
    assert result.returncode == 0
    snapshots = [json.loads(line.split("=", 1)[1]) for line in result.stdout.splitlines()
                 if line.startswith("FLAG_SNAPSHOT=")]
    assert len(snapshots) == 2
    assert snapshots[0] == snapshots[1], {"before": snapshots[0], "after": snapshots[1]}
    if strategy == "prefix":
        actual = [json.loads(line.split("=", 1)[1]) for line in result.stdout.splitlines()
                  if line.startswith("REEXEC_OPTIONS=")]
        assert actual == [expected_options]

# Selected failclosed contract: these malformed states cannot originate from a
# successful ordinary CPython CLI parse, so exercise the actual helper directly.
@pytest.mark.parametrize("original", [
    None, [], ["python", 1], ["python"], ["python", "-B"], ["python", "--"],
    ["python", "-W"], ["python", "-X"], ["python", "--check-hash-based-pycs"],
    ["python", "-m"], ["python", "-c"], ["python", "-BOm"],
])
def test_unknown_invocation_fails_before_exec(original):
    import importlib.util
    spec = importlib.util.spec_from_file_location("guarded_options", ROOT / "backend/server_launcher.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with pytest.raises(RuntimeError, match="Cannot preserve interpreter options"):
        module.original_interpreter_options(original)


def test_ignored_empty_script_argument_does_not_change_prefix():
    import importlib.util
    spec = importlib.util.spec_from_file_location("guarded_options", ROOT / "backend/server_launcher.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.original_interpreter_options(["python", "-B", "server.py", "", "-I"]) == ["-B"]


def test_no_socket_fixture_setup_failure_stops_python_startup(tmp_path):
    site = FIXTURE / "server_launcher_site/sitecustomize.py"
    (tmp_path / "sitecustomize.py").write_text(
        "import builtins, runpy\n"
        "original_import = builtins.__import__\n"
        "def owned_import(name, *args, **kwargs):\n"
        "    if name == 'uvicorn':\n"
        "        raise ImportError('owned no-socket setup failure')\n"
        "    return original_import(name, *args, **kwargs)\n"
        "builtins.__import__ = owned_import\n"
        f"runpy.run_path({str(site)!r})\n",
        encoding="utf-8",
    )
    env = {key: value for key, value in os.environ.items() if not key.startswith("PYTHON")}
    env["PYTHONPATH"] = str(tmp_path)
    result = subprocess.run(
        [sys.executable, "-c", "print('UNSAFE_STARTUP_CONTINUED')"],
        cwd=tmp_path, env=env, text=True, capture_output=True, timeout=5,
    )
    assert result.returncode != 0
    assert "Cannot initialize owned no-socket launcher fixture" in result.stderr
    assert "UNSAFE_STARTUP_CONTINUED" not in result.stdout


@pytest.mark.parametrize("option", ["-W", "-X", "--check-hash-based-pycs"])
def test_nonstring_consumed_option_operand_fails_closed(option):
    import importlib.util
    spec = importlib.util.spec_from_file_location("guarded_options", ROOT / "backend/server_launcher.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with pytest.raises(RuntimeError, match="Cannot preserve interpreter options"):
        module.original_interpreter_options(["python", option, None, "server.py"])


@pytest.mark.parametrize("option", ["-W", "-X"])
def test_empty_warning_or_xoption_operand_is_preserved(option):
    import importlib.util
    spec = importlib.util.spec_from_file_location("guarded_options", ROOT / "backend/server_launcher.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.original_interpreter_options(["python", option, "", "server.py"]) == [option, ""]


# Review found a proposed-fix regression: the new CLI must not introduce its
# UVICORN_* environment policy into the legacy programmatic file launcher.
def capture_environment(mode, environment, *, reload=False):
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("PYTHON", "UVICORN_", "SOLAR_"))
           and key not in ("WEB_CONCURRENCY", "FORWARDED_ALLOW_IPS")}
    env.update(PYTHONPATH=str(FIXTURE / "server_launcher_site"), PYTHONDONTWRITEBYTECODE="1",
               SOLAR_TEST_LAUNCH_ENV_ONLY="1", SOLAR_PHYSICS_API_KEYS="owned-synthetic-key",
               FORWARDED_ALLOW_IPS="192.0.2.17", OWNED_UNRELATED_ENVIRONMENT="preserved-value")
    env.update(environment)
    if mode == "direct-cli":
        command = [sys.executable, "-m", "uvicorn", "server:app", "--host", "0.0.0.0",
                   "--port", "8042", "--no-proxy-headers", "--ws-max-size", "16384"]
    else:
        command = [sys.executable, str(PROBE), "environment", mode, str(reload).lower()]
    result = subprocess.run(command, env=env, cwd=FIXTURE,
                            capture_output=True, text=True, timeout=5)
    print(json.dumps({"mode": mode, "fixture_env": environment, "exit": result.returncode,
                      "stdout": result.stdout, "stderr": result.stderr}, sort_keys=True))
    assert result.returncode == 0
    records = [json.loads(line.split("=", 1)[1]) for line in result.stdout.splitlines()
               if line.startswith("ENV_RESULT=")]
    assert len(records) == 1
    observed = records[0]
    assert observed["app_loaded"] is False
    assert observed["api_key_preserved"] is True
    assert observed["unrelated_value"] == "preserved-value"
    assert observed["forwarded_allow_ips"] == "192.0.2.17"
    assert observed["host"] == "0.0.0.0" and observed["port"] == 8042
    assert observed["proxy_headers"] is False and observed["ws_max_size"] == 16384
    return observed


@pytest.mark.parametrize("mode", ["old", "helper"])
@pytest.mark.parametrize("environment,expected_workers", [
    ({}, 1),
    ({"UVICORN_WORKERS": "3"}, 1),
    ({"UVICORN_ENV_FILE": str(FIXTURE / "does-not-exist.env")}, 1),
    ({"WEB_CONCURRENCY": "4"}, 4),
    ({"UVICORN_WORKERS": "3", "WEB_CONCURRENCY": "4"}, 4),
    ({"UVICORN_RELOAD": "true"}, 1),
])
def test_legacy_environment_semantics(mode, environment, expected_workers):
    observed = capture_environment(mode, environment)
    assert observed["workers_argument"] is None
    assert observed["workers_config"] == expected_workers
    assert observed["env_file"] is None
    assert observed["reload"] is False


@pytest.mark.parametrize("mode", ["old", "helper"])
def test_environment_does_not_disable_explicit_local_reload(mode):
    observed = capture_environment(mode, {"UVICORN_RELOAD": "false"}, reload=True)
    assert observed["workers_argument"] is None and observed["workers_config"] == 1
    assert observed["env_file"] is None
    assert observed["reload"] is True


def test_direct_cli_retains_its_own_environment_policy():
    observed = capture_environment("direct-cli", {"UVICORN_WORKERS": "3", "UVICORN_RELOAD": "true"})
    assert observed["workers_argument"] == 3 and observed["workers_config"] == 3
    assert observed["env_file"] is None and observed["reload"] is True


def test_environment_copy_is_exact_and_caller_is_unchanged_on_exec_failure(monkeypatch):
    import importlib.util
    spec = importlib.util.spec_from_file_location("environment_launcher", ROOT / "backend/server_launcher.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    environment = {
        "UVICORN_WORKERS": "3", "UVICORN_ENV_FILE": "owned-unused.env", "UVICORN_": "reserved",
        "WEB_CONCURRENCY": "4", "FORWARDED_ALLOW_IPS": "192.0.2.17",
        "SOLAR_PHYSICS_API_KEYS": "owned-synthetic-key", "PYTHONWARNINGS": "default",
        "OWNED_UNRELATED_ENVIRONMENT": "preserved-value", "UVICORN": "unreserved",
        "uvicorn_workers": "lowercase-unreserved", "EMPTY_VALUE": "",
    }
    before = dict(environment)
    calls = []
    error = OSError("owned exec failure")

    def failed_execve(executable, argv, replacement):
        calls.append(("execve", executable, argv, replacement))
        raise error

    def failed_execv(executable, argv):
        # Also intercept the pre-amendment path: never replace this test runner.
        calls.append(("execv", executable, argv, None))
        raise error

    monkeypatch.setattr(module.os, "environ", environment)
    monkeypatch.setattr(module.os, "execve", failed_execve)
    monkeypatch.setattr(module.os, "execv", failed_execv)
    monkeypatch.setattr(module.sys, "orig_argv", ["python", "server.py"])
    with pytest.raises(OSError) as caught:
        module.reexec_uvicorn(host="0.0.0.0", reload=False, ws_max_size=16384)
    assert caught.value is error
    assert environment == before
    assert module.os.environ is environment
    assert len(calls) == 1 and calls[0][0] == "execve"
    assert calls[0][1] == sys.executable
    replacement = calls[0][3]
    assert replacement is not environment
    assert replacement == {key: value for key, value in before.items() if not key.startswith("UVICORN_")}
