from __future__ import annotations

from collections import deque
from typing import Any
import urllib.request

import pytest

from sim.solar_realtime_data import SolarRealtimeDataProvider


class _Response:
    def __init__(
        self,
        body: bytes,
        *,
        url: str,
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self._body = body
        self._offset = 0
        self._url = url
        self.status = status
        self.headers = headers or {}
        self.read_sizes: list[int] = []
        self.closed = False

    def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if size < 0:
            size = len(self._body) - self._offset
        chunk = self._body[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk

    def geturl(self) -> str:
        return self._url

    def close(self) -> None:
        self.closed = True

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *_args: Any) -> None:
        self.close()


class _Opener:
    def __init__(self, open_request) -> None:
        self._open_request = open_request

    def open(self, request, *, timeout: float):
        return self._open_request(request, timeout=timeout)


def _install_routes(
    monkeypatch: pytest.MonkeyPatch,
    routes: dict[str, list[_Response]],
) -> list[str]:
    pending = {url: deque(responses) for url, responses in routes.items()}
    opened: list[str] = []

    def open_request(request, *, timeout: float):
        assert timeout > 0.0
        url = request.full_url
        opened.append(url)
        if url not in pending or not pending[url]:
            raise AssertionError(f"unexpected network request: {url}")
        return pending[url].popleft()

    monkeypatch.setattr(urllib.request, "urlopen", open_request)
    monkeypatch.setattr(
        urllib.request,
        "build_opener",
        lambda *_handlers: _Opener(open_request),
    )
    return opened


@pytest.mark.parametrize(
    ("fetch_name", "url", "redirect_body"),
    (
        (
            "_fetch_json",
            SolarRealtimeDataProvider.NOAA_PLASMA_URL,
            b"{}",
        ),
        (
            "_fetch_text",
            SolarRealtimeDataProvider.SILSO_DAILY_URL,
            b"redirect",
        ),
        (
            "_fetch_binary",
            SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL,
            b"redirect",
        ),
    ),
)
def test_fetch_modes_reject_redirects_outside_their_explicit_host_allowlist(
    monkeypatch: pytest.MonkeyPatch,
    fetch_name: str,
    url: str,
    redirect_body: bytes,
) -> None:
    provider = SolarRealtimeDataProvider()
    redirect = _Response(
        redirect_body,
        url=url,
        status=302,
        headers={"Location": "https://127.0.0.1/internal"},
    )
    opened = _install_routes(monkeypatch, {url: [redirect]})

    with pytest.raises(RuntimeError, match="redirect.*allowlist"):
        getattr(provider, fetch_name)(url)

    assert opened == [url]
    assert redirect.closed is True


@pytest.mark.parametrize(
    ("fetch_name", "body"),
    (
        ("_fetch_json", b"{}"),
        ("_fetch_text", b"text"),
        ("_fetch_binary", b"binary"),
    ),
)
def test_fetch_modes_validate_transport_reported_final_url(
    monkeypatch: pytest.MonkeyPatch,
    fetch_name: str,
    body: bytes,
) -> None:
    provider = SolarRealtimeDataProvider()
    requested_url = SolarRealtimeDataProvider.HELIOVIEWER_CLOSEST_URL
    response = _Response(
        body,
        url="https://169.254.169.254/latest/meta-data/",
    )
    _install_routes(monkeypatch, {requested_url: [response]})

    with pytest.raises(RuntimeError, match="final URL.*allowlist"):
        getattr(provider, fetch_name)(requested_url)

    assert response.closed is True


@pytest.mark.parametrize(
    ("fetch_name", "url", "body"),
    (
        (
            "_fetch_json",
            SolarRealtimeDataProvider.NOAA_PLASMA_URL,
            b'{"padding":"' + (b"x" * (1024 * 1024)) + b'"}',
        ),
        (
            "_fetch_text",
            SolarRealtimeDataProvider.SILSO_DAILY_URL,
            b"x" * (8 * 1024 * 1024 + 1),
        ),
        (
            "_fetch_binary",
            SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL,
            b"x" * (4 * 1024 * 1024 + 1),
        ),
    ),
    ids=("json", "text", "binary"),
)
def test_fetch_modes_stream_with_a_hard_byte_limit(
    monkeypatch: pytest.MonkeyPatch,
    fetch_name: str,
    url: str,
    body: bytes,
) -> None:
    provider = SolarRealtimeDataProvider()
    response = _Response(body, url=url)
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(RuntimeError, match="byte limit"):
        getattr(provider, fetch_name)(url)

    assert response.read_sizes
    assert -1 not in response.read_sizes
    assert max(response.read_sizes) <= 64 * 1024
    assert response.closed is True


def test_fetch_binary_stops_at_cap_when_content_length_understates_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    url = SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL
    response = _Response(
        b"x" * (4 * 1024 * 1024 + 1),
        url=url,
        headers={"Content-Length": "1"},
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(RuntimeError, match="byte limit"):
        provider._fetch_binary(url)

    assert response.read_sizes
    assert sum(size for size in response.read_sizes if size > 0) <= 4 * 1024 * 1024 + 1
    assert response.closed is True


def test_fetch_binary_follows_bounded_relative_redirect_on_allowed_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    initial_url = SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL
    redirected_url = "https://api.helioviewer.org/v2/getTile/?id=123"
    redirect = _Response(
        b"not-a-tile",
        url=initial_url,
        status=302,
        headers={"Location": "/v2/getTile/?id=123"},
    )
    payload = _Response(
        b"tile-bytes",
        url=redirected_url,
        headers={"Content-Type": "image/png", "Content-Length": "10"},
    )
    opened = _install_routes(
        monkeypatch,
        {initial_url: [redirect], redirected_url: [payload]},
    )

    content, content_type = provider._fetch_binary(initial_url)

    assert content == b"tile-bytes"
    assert content_type == "image/png"
    assert opened == [initial_url, redirected_url]
    assert redirect.closed is True
    assert payload.closed is True


@pytest.mark.parametrize(
    ("fetch_name", "body"),
    (
        ("_fetch_json", b"{}"),
        ("_fetch_text", b"text"),
        ("_fetch_binary", b"binary"),
    ),
)
def test_fetch_modes_reject_unapproved_initial_origin_before_network(
    monkeypatch: pytest.MonkeyPatch,
    fetch_name: str,
    body: bytes,
) -> None:
    provider = SolarRealtimeDataProvider()
    unsafe_url = "https://example.invalid/realtime"
    opened = _install_routes(
        monkeypatch,
        {unsafe_url: [_Response(body, url=unsafe_url)]},
    )

    with pytest.raises(RuntimeError, match="upstream allowlist"):
        getattr(provider, fetch_name)(unsafe_url)

    assert opened == []
