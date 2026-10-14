"""SCN-004: real child/process and socket reclamation, not waiter timeouts."""
import signal
import socket
import threading
import time

import pytest

from sim import solar_http_transport as http
from sim.solar_realtime_data import SolarRealtimeDataProvider, SolarRealtimeFetchError
from sim.gong_magnetogram import GONG_ARCHIVE_BASE_URL, GongTransportError, StdlibGongTransport


def open_gong(url, timeout):
    return StdlibGongTransport().open(
        url, total_timeout_s=timeout, dns_timeout_s=5, connect_timeout_s=5,
        tls_timeout_s=5, header_timeout_s=5, read_timeout_s=5, stall_timeout_s=5,
    )


@pytest.fixture
def children(monkeypatch):
    original = http.subprocess.Popen
    processes = []
    def spawn(*args, **kwargs):
        process = original(*args, **kwargs)
        processes.append(process)
        return process
    monkeypatch.setattr(http.subprocess, 'Popen', spawn)
    yield processes
    for process in processes:
        # Check both ownership and resource recovery, including successful I/O.
        assert process.poll() is not None
        assert process.stdin.closed and process.stdout.closed


@pytest.mark.parametrize('source', ['realtime', 'gong'])
def test_blocking_dns_is_killed_reaped_and_repeatable(monkeypatch, tmp_path, children, source):
    marker = tmp_path / 'entered-dns'
    worker = tmp_path / 'stalled_dns.py'
    worker.write_text(
        'import socket, time, runpy, pathlib, signal, os\n'
        # Disable the child's independent death timer to prove parent ownership.
        'signal.setitimer = lambda *args: None\n'
        'def resolve(*args, **kwargs):\n'
        f'    pathlib.Path({str(marker)!r}).write_text(str(os.getpid()))\n'
        '    time.sleep(30)\n'
        'socket.getaddrinfo = resolve\n'
        f'runpy.run_path({str(http.WORKER_PATH)!r}, run_name="__main__")\n'
    )
    monkeypatch.setattr(http, 'WORKER_PATH', worker)
    provider = SolarRealtimeDataProvider(timeout_s=.3)
    budget = .8 if source == 'gong' else .3
    for _ in range(3):
        started = time.monotonic()
        with pytest.raises((SolarRealtimeFetchError, GongTransportError), match='deadline'):
            if source == 'gong':
                open_gong(GONG_ARCHIVE_BASE_URL, budget)
            else:
                provider._fetch_binary(provider.NOAA_WIND_URL)
        assert time.monotonic() - started < budget + .5
        assert marker.read_text() == str(children[-1].pid)
        assert children[-1].returncode == -signal.SIGKILL


@pytest.fixture
def origin():
    stop = threading.Event()
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    listener.listen()
    listener.settimeout(.05)
    url = f'http://127.0.0.1:{listener.getsockname()[1]}'
    def serve():
        while not stop.is_set():
            try:
                conn, _ = listener.accept()
            except socket.timeout:
                continue
            with conn:
                conn.settimeout(.1)
                try:
                    request = b''
                    while b'\r\n\r\n' not in request:
                        request += conn.recv(4096)
                    path = request.split()[1].rsplit(b'/', 1)[-1]
                    if path == b'ok':
                        conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK')
                        continue
                    if path == b'redirect':
                        conn.sendall(b'HTTP/1.1 302 Found\r\nLocation: /ok\r\nContent-Length: 0\r\n\r\n')
                        continue
                    if path == b'malformed':
                        conn.sendall(b'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nZZ\r\n')
                        continue
                    if path == b'body':
                        conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n')
                    else:
                        conn.sendall(b'HTTP/1.1 200 OK\r\nX-Drip: ')
                    # Progress continues faster than an inactivity timeout,
                    # but can never finish within the aggregate deadline.
                    while not stop.wait(.02):
                        conn.sendall(b'x')
                except (OSError, IndexError):
                    pass
    thread = threading.Thread(target=serve)
    thread.start()
    yield url
    stop.set()
    thread.join(timeout=2)
    listener.close()
    assert not thread.is_alive()


@pytest.mark.parametrize('phase', ['headers', 'body'])
def test_slow_drip_is_cancelled_and_next_request_recovers(monkeypatch, origin, phase, children):
    provider = SolarRealtimeDataProvider(timeout_s=.3)
    # Admit this test-owned loopback server; production allowlists stay intact.
    monkeypatch.setattr(provider, '_validate_upstream_url', lambda url, **_kw: (url, frozenset({'127.0.0.1'})))
    for _ in range(2):
        started = time.monotonic()
        with pytest.raises(SolarRealtimeFetchError, match='acquisition_deadline'):
            provider._fetch_binary(f'{origin}/{phase}')
        assert time.monotonic() - started < .8
        assert children[-1].poll() is not None
        assert provider._fetch_binary(f'{origin}/ok')[0] == b'OK'
    assert provider._fetch_binary(f'{origin}/redirect')[0] == b'OK'


def test_body_byte_limit_closes_and_reaps_worker(monkeypatch, origin, children):
    provider = SolarRealtimeDataProvider(timeout_s=.3)
    monkeypatch.setattr(provider, '_validate_upstream_url', lambda url, **_kw: (url, frozenset({'127.0.0.1'})))
    with pytest.raises(SolarRealtimeFetchError, match='response_byte_limit'):
        provider._request_bytes(f'{origin}/body', max_bytes=20)
    assert children[-1].poll() is not None
    assert provider._fetch_binary(f'{origin}/ok')[0] == b'OK'


@pytest.mark.parametrize('phase', ['headers', 'body', 'malformed'])
def test_gong_public_transport_cancels_stalls_and_recovers(monkeypatch, tmp_path, origin, children, phase):
    worker = tmp_path / 'gong_local_transport.py'
    port = int(origin.rsplit(':', 1)[-1])
    worker.write_text(
        'import socket, ssl, runpy\n'
        'resolve = socket.getaddrinfo\n'
        f'socket.getaddrinfo = lambda host, port, **kw: resolve("127.0.0.1", {port}, **kw)\n'
        'class LocalContext:\n'
        '    def wrap_socket(self, sock, **kw): return sock\n'
        'ssl.create_default_context = lambda: LocalContext()\n'
        f'runpy.run_path({str(http.WORKER_PATH)!r}, run_name="__main__")\n'
    )
    monkeypatch.setattr(http, 'WORKER_PATH', worker)
    started = time.monotonic()
    response = None
    try:
        code = 'truncated_body' if phase == 'malformed' else 'total_deadline'
        with pytest.raises(GongTransportError, match=code):
            response = open_gong(GONG_ARCHIVE_BASE_URL + phase, .8)
            response.read(65536)
    finally:
        if response is not None:
            response.close()
    assert time.monotonic() - started < 1.3
    assert children[-1].poll() is not None
    recovered = open_gong(GONG_ARCHIVE_BASE_URL + 'ok', .8)
    try:
        assert recovered.read(65536) == b'OK'
    finally:
        recovered.close()


def test_interrupted_body_reader_reaps_child(monkeypatch, origin, children):
    import urllib.request
    response = SolarRealtimeDataProvider()._open_response(urllib.request.Request(origin + '/body'), timeout_s=1)
    def interrupt(*args):
        raise KeyboardInterrupt
    monkeypatch.setattr(http.select, 'select', interrupt)
    with pytest.raises(KeyboardInterrupt):
        response.read(65536)
    assert children[-1].poll() is not None
