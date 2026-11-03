"""Import-safe subprocess targets used by supervisor integration tests."""

from __future__ import annotations

import atexit
import os
from pathlib import Path
import time
from typing import Any


def _slow_exit(delay: float, marker: str | None) -> None:
    if marker:
        Path(marker).write_text(str(os.getpid()), encoding="ascii")
    time.sleep(delay)


def execute(payload: dict[str, Any]) -> Any:
    operation = payload["operation"]
    if path := payload.get("started_path"):
        Path(path).write_text(str(os.getpid()), encoding="ascii")

    if operation == "echo":
        return payload["result"]
    if operation == "sleep_then_echo":
        time.sleep(float(payload["sleep_seconds"]))
        return payload["result"]
    if operation == "echo_then_slow_exit":
        # Runs during interpreter shutdown, after the result is on the pipe:
        # the same window a loaded host spends tearing down numpy/astropy.
        atexit.register(_slow_exit, float(payload["exit_delay_seconds"]), payload.get("exit_started_path"))
        return payload["result"]
    if operation == "crash":
        os._exit(int(payload.get("exit_code", 17)))
    if operation == "non_finite":
        return {"value": float("inf")}
    if operation == "oversized":
        return {"value": "x" * int(payload["size"])}
    raise ValueError(f"unknown operation: {operation}")
