"""Owned no-socket boundary; injected only by the native launcher tests."""
import importlib
from pathlib import Path
import sys

try:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from server_launcher_probe import intercept_uvicorn_run
    import uvicorn

    import os
    if os.environ.get("SOLAR_TEST_LAUNCH_ENV_ONLY") == "1":
        from server_launcher_probe import environment_interceptor
        intercept_uvicorn_run = environment_interceptor(uvicorn.run)

    uvicorn.run = intercept_uvicorn_run
    importlib.import_module("uvicorn.main").run = intercept_uvicorn_run
except Exception as exc:
    # Python logs ordinary sitecustomize errors and continues. Never let a
    # broken no-socket fixture fall through to the real Uvicorn serving loop.
    raise SystemExit("Cannot initialize owned no-socket launcher fixture") from exc
