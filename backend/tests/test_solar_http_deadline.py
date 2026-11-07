"""SCN-004: real child/process and socket reclamation, not waiter timeouts."""
import signal
import socket
import threading
import time

import pytest

from sim import solar_http_transport as http
from sim.solar_realtime_data import SolarRealtimeDataProvider, SolarRealtimeFetchError
from sim.gong_magnetogram import GONG_ARCHIVE_BASE_URL, GongTransportError, StdlibGongTransport

# A cold worker reaches the network in about 0.03 s (realtime) or 0.26 s (GONG) on an
# idle host, and in five times that when it has to share a core. A deadline close to
# those times kills the worker before it reaches the phase under test, and a busy host
# then fails these tests with no defect present.
REALTIME_DEADLINE_S = 1.0
GONG_DEADLINE_S = 2.5
REAP_MARGIN_S = .5


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
    budget = GONG_DEADLINE_S if source == 'gong' else REALTIME_DEADLINE_S
    provider = SolarRealtimeDataProvider(timeout_s=budget)
    for _ in range(3):
        started = time.monotonic()
        with pytest.raises((SolarRealtimeFetchError, GongTransportError), match='deadline'):
            if source == 'gong':
                open_gong(GONG_ARCHIVE_BASE_URL, budget)
            else:
                provider._fetch_binary(provider.NOAA_WIND_URL)
        assert time.monotonic() - started < budget + REAP_MARGIN_S
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
                conn.settimeout(1)
                try:
                    request = b''
                    while b'\r\n\r\n' not in request:
                        chunk = conn.recv(4096)
                        if not chunk:
                            raise ConnectionError('client left before finishing its request')
                        request += chunk
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
    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    yield url
    stop.set()
    thread.join(timeout=2)
    listener.close()
    assert not thread.is_alive()


def test_origin_serves_the_next_client_after_one_leaves_before_its_request(origin):
    # What a worker killed right after connecting does. The serial server must not spin on EOF.
    host, port = origin.removeprefix('http://').split(':')
    socket.create_connection((host, int(port))).close()
    with socket.create_connection((host, int(port)), timeout=5) as client:
        client.sendall(b'GET /ok HTTP/1.1\r\n\r\n')
        assert client.makefile('rb').read().endswith(b'OK')


@pytest.mark.parametrize('phase', ['headers', 'body'])
def test_slow_drip_is_cancelled_and_next_request_recovers(monkeypatch, origin, phase, children):
    provider = SolarRealtimeDataProvider(timeout_s=REALTIME_DEADLINE_S)
    # Admit this test-owned loopback server; production allowlists stay intact.
    monkeypatch.setattr(provider, '_validate_upstream_url', lambda url, **_kw: (url, frozenset({'127.0.0.1'})))
    for _ in range(2):
        started = time.monotonic()
        with pytest.raises(SolarRealtimeFetchError, match='acquisition_deadline'):
            provider._fetch_binary(f'{origin}/{phase}')
        assert time.monotonic() - started < REALTIME_DEADLINE_S + REAP_MARGIN_S
        assert children[-1].poll() is not None
        assert provider._fetch_binary(f'{origin}/ok')[0] == b'OK'
    assert provider._fetch_binary(f'{origin}/redirect')[0] == b'OK'


def test_body_byte_limit_closes_and_reaps_worker(monkeypatch, origin, children):
    provider = SolarRealtimeDataProvider(timeout_s=REALTIME_DEADLINE_S)
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
            response = open_gong(GONG_ARCHIVE_BASE_URL + phase, GONG_DEADLINE_S)
            response.read(65536)
    finally:
        if response is not None:
            response.close()
    assert time.monotonic() - started < GONG_DEADLINE_S + REAP_MARGIN_S
    assert children[-1].poll() is not None
    recovered = open_gong(GONG_ARCHIVE_BASE_URL + 'ok', GONG_DEADLINE_S)
    try:
        assert recovered.read(65536) == b'OK'
    finally:
        recovered.close()


def test_interrupted_body_reader_reaps_child(monkeypatch, origin, children):
    import urllib.request
    response = SolarRealtimeDataProvider()._open_response(urllib.request.Request(origin + '/body'), timeout_s=1)
    def interrupt(*args):
        raise KeyboardInterrupt
    monkeypatch.setattr(http, '_wait_readable', interrupt)
    with pytest.raises(KeyboardInterrupt):
        response.read(65536)
    assert children[-1].poll() is not None
