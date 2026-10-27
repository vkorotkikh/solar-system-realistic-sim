"""The owned HTTP transport must work when its pipe descriptors are numbered >= 1024 (review I-3).

`select.select()` raises ValueError("filedescriptor out of range in select()") for any
descriptor at or above FD_SETSIZE. A uvicorn worker holding many sockets reaches that, and the
ValueError is not a SolarHttpError, so it escaped typed classification. The read loop uses
poll() now; this test pins it by pushing the child's pipe descriptors past 1024.
"""
import os
import resource
import socket
import threading
import urllib.request

import pytest

from sim import solar_http_transport as http

REQUIRED_DESCRIPTORS = 1300


@pytest.fixture
def origin():
    stop = threading.Event()
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    listener.listen()
    listener.settimeout(.05)
    url = f'http://127.0.0.1:{listener.getsockname()[1]}/ok'

    def serve():
        while not stop.is_set():
            try:
                conn, _ = listener.accept()
            except socket.timeout:
                continue
            with conn:
                conn.settimeout(1)
                try:
                    buffer = b''
                    while b'\r\n\r\n' not in buffer:
                        buffer += conn.recv(4096)
                    conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK')
                except OSError:
                    pass

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    yield url
    stop.set()
    thread.join(1)
    listener.close()


@pytest.fixture
def high_descriptors():
    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    if hard != resource.RLIM_INFINITY and hard < REQUIRED_DESCRIPTORS + 100:
        pytest.skip(f'hard RLIMIT_NOFILE {hard} is too low to place a pipe above FD_SETSIZE')
    raised = min(hard, 8192) if hard != resource.RLIM_INFINITY else 8192
    resource.setrlimit(resource.RLIMIT_NOFILE, (max(soft, raised), hard))
    holders = [os.open('/dev/null', os.O_RDONLY) for _ in range(REQUIRED_DESCRIPTORS)]
    assert max(holders) >= 1024
    yield holders
    for descriptor in holders:
        os.close(descriptor)
    resource.setrlimit(resource.RLIMIT_NOFILE, (soft, hard))


def test_transport_reads_through_descriptors_above_fd_setsize(origin, high_descriptors, monkeypatch):
    original = http.subprocess.Popen
    children = []

    def spawn(*args, **kwargs):
        process = original(*args, **kwargs)
        children.append(process)
        return process

    monkeypatch.setattr(http.subprocess, 'Popen', spawn)
    response = http.DeadlineHttpResponse(urllib.request.Request(origin), 5.0)
    try:
        assert children[-1].stdout.fileno() >= 1024
        assert response.status == 200
        assert response.read(10) == b'OK'
    finally:
        response.close()
    assert children[-1].poll() is not None
    assert children[-1].stdin.closed and children[-1].stdout.closed
