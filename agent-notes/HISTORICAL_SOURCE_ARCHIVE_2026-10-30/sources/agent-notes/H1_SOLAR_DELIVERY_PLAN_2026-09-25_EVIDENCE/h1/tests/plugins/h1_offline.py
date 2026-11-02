"""pytest plugin: block non-loopback outbound sockets and record attempts.

Load with: PYTHONPATH=<this dir> pytest -p h1_offline
Env H1_OFFLINE_MODE=record  -> allow connections but log them (to measure network dependence)
Env H1_OFFLINE_MODE=block   -> raise OSError on non-loopback connects (default)
"""
from __future__ import annotations

import os
import socket
import threading

_ATTEMPTS: list[tuple[str, str]] = []
_LOCK = threading.Lock()
_orig_connect = socket.socket.connect
_orig_getaddrinfo = socket.getaddrinfo
_current_test = {"id": "<collection>"}


def _is_loopback(host: str) -> bool:
    return host in {"127.0.0.1", "::1", "localhost"} or host.startswith("127.")


def _guarded_getaddrinfo(host, *args, **kwargs):
    mode = os.environ.get("H1_OFFLINE_MODE", "block")
    if host is not None and not _is_loopback(str(host)):
        with _LOCK:
            _ATTEMPTS.append((_current_test["id"], f"dns:{host}"))
        if mode == "block":
            raise socket.gaierror(f"h1_offline: DNS for {host} blocked")
    return _orig_getaddrinfo(host, *args, **kwargs)


def _guarded_connect(self, address):
    mode = os.environ.get("H1_OFFLINE_MODE", "block")
    host = address[0] if isinstance(address, tuple) else str(address)
    if not _is_loopback(str(host)):
        with _LOCK:
            _ATTEMPTS.append((_current_test["id"], f"connect:{address}"))
        if mode == "block":
            raise OSError(f"h1_offline: connect to {address} blocked")
    return _orig_connect(self, address)


socket.getaddrinfo = _guarded_getaddrinfo
socket.socket.connect = _guarded_connect


def pytest_runtest_setup(item):
    _current_test["id"] = item.nodeid


def pytest_terminal_summary(terminalreporter):
    by_test: dict[str, list[str]] = {}
    for test_id, what in _ATTEMPTS:
        by_test.setdefault(test_id, []).append(what)
    terminalreporter.write_line(f"h1_offline: mode={os.environ.get('H1_OFFLINE_MODE', 'block')} outbound attempts={len(_ATTEMPTS)}")
    for test_id, items in by_test.items():
        uniq = sorted(set(items))
        terminalreporter.write_line(f"  {test_id}: {len(items)} attempts; e.g. {uniq[:4]}")
