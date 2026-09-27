from __future__ import annotations

from collections import deque
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any
import urllib.request

import pytest

import sim.solar_realtime_data as solar_realtime_data
from sim.solar_realtime_data import SolarRealtimeDataProvider, SolarRealtimeFetchError


class _Headers:
    """Small ordered header bag that preserves physical duplicate fields."""

    def __init__(self, fields: list[tuple[str, str]]) -> None:
        self._fields = fields

    def get_all(self, name: str) -> list[str]:
        lowered = name.lower()
        return [value for key, value in self._fields if key.lower() == lowered]

    def items(self) -> list[tuple[str, str]]:
        return list(self._fields)


class _Response:
    def __init__(
        self,
        body: bytes,
        *,
        url: str,
        status: int = 200,
        headers: Any | None = None,
    ) -> None:
        self._body = body
        self._offset = 0
        self._url = url
        self.status = status
        self.headers = {} if headers is None else headers
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


@pytest.mark.parametrize(
    "declared_type",
    (
        "image/png",
        "Image/PNG",
        'Image/PNG; profile="aia;viewport"; mode=tile',
        'image/png; note="escaped \\"quote\\" and comma, accepted"',
    ),
)
def test_aia_png_media_type_is_strictly_parsed_and_canonicalized(
    monkeypatch: pytest.MonkeyPatch,
    declared_type: str,
    aia_png_header: Callable[..., bytes],
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        aia_png_header(),
        url=url,
        headers=_Headers([("Content-Type", declared_type)]),
    )
    _install_routes(monkeypatch, {url: [response]})

    payload, content_type = provider._fetch_aia_png(url)

    assert payload == aia_png_header()
    assert content_type == "image/png"


@pytest.mark.parametrize(
    "body",
    (
        b"",
        b"<html>not an image</html>",
        b"\x89PNG\r\n\x1aX" + (b"x" * 25),
    ),
    ids=("empty", "html", "bad-signature"),
)
def test_aia_png_rejects_invalid_signature(
    monkeypatch: pytest.MonkeyPatch,
    body: bytes,
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        body,
        url=url,
        headers=_Headers([("Content-Type", "image/png")]),
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(url)

    assert raised.value.code == "invalid_aia_png_signature"


@pytest.mark.parametrize(
    "case",
    (
        "signature-only",
        "short-header",
        "wrong-ihdr-length",
        "wrong-first-chunk-type",
        "bad-ihdr-crc",
    ),
)
def test_aia_png_rejects_invalid_ihdr_structure(
    monkeypatch: pytest.MonkeyPatch,
    case: str,
    aia_png_header: Callable[..., bytes],
) -> None:
    bodies = {
        "signature-only": b"\x89PNG\r\n\x1a\n",
        "short-header": b"\x89PNG\r\n\x1a\n" + (b"x" * 24),
        "wrong-ihdr-length": aia_png_header(chunk_length=14),
        "wrong-first-chunk-type": aia_png_header(chunk_type=b"IDAT"),
        "bad-ihdr-crc": aia_png_header(crc=0),
    }
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        bodies[case],
        url=url,
        headers=_Headers([("Content-Type", "image/png")]),
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(url)

    assert raised.value.code == "invalid_aia_png_header"


@pytest.mark.parametrize(
    ("width", "height"),
    (
        (1, 1),
        (512, 1024),
        (0xFFFFFFFF, 0xFFFFFFFF),
    ),
    ids=("one-pixel", "wrong-height", "huge-encoded-dimensions"),
)
def test_aia_png_requires_exact_viewport_dimensions(
    monkeypatch: pytest.MonkeyPatch,
    width: int,
    height: int,
    aia_png_header: Callable[..., bytes],
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        aia_png_header(width=width, height=height),
        url=url,
        headers=_Headers([("Content-Type", "image/png")]),
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(url)

    assert raised.value.code == "invalid_aia_png_dimensions"


@pytest.mark.parametrize("status", (201, 204, 206))
def test_aia_png_requires_exact_http_200_without_reading_body(
    monkeypatch: pytest.MonkeyPatch,
    status: int,
    aia_png_header: Callable[..., bytes],
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        aia_png_header(),
        url=url,
        status=status,
        headers=_Headers([("Content-Type", "image/png")]),
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(url)

    assert raised.value.code == "http_status"
    assert response.read_sizes == []
    assert response.closed is True


def test_generic_binary_transport_preserves_unrelated_2xx_behavior(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        b"partial generic body",
        url=url,
        status=206,
        headers=_Headers([("Content-Type", "application/octet-stream")]),
    )
    _install_routes(monkeypatch, {url: [response]})

    assert provider._fetch_binary(url) == (
        b"partial generic body",
        "application/octet-stream",
    )


def test_aia_http_status_precedes_media_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        b"secret body",
        url=url,
        status=206,
        headers=_Headers([]),
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(url)

    assert raised.value.code == "http_status"
    assert response.read_sizes == []


@pytest.mark.parametrize(
    "fields",
    (
        [],
        [("Content-Type", "")],
        [("Content-Type", "image/png"), ("Content-Type", "image/png")],
        [("Content-Type", "image/png, image/png")],
        [("Content-Type", " image/png")],
        [("Content-Type", "image/png ")],
        [("Content-Type", "image/png;")],
        [("Content-Type", "image/png; profile")],
        [("Content-Type", "image/png; profile=")],
        [("Content-Type", 'image/png; profile="unterminated')],
        [("Content-Type", 'image/png; profile="bad\\\x1fescape"')],
        [("Content-Type", "image/png; bad name=tile")],
        [("Content-Type", "image/png; profile=a; profile=b")],
        [("Content-Type", "image/png; PROFILE=a; profile=b")],
        [("Content-Type", "image/png\x7f")],
        [("Content-Type", "image/pn\N{LATIN SMALL LETTER G WITH ACUTE}")],
        [("Content-Type", "image/png; profile=" + ("x" * 240))],
    ),
    ids=(
        "missing",
        "empty",
        "duplicate-fields",
        "comma-joined",
        "leading-whitespace",
        "trailing-whitespace",
        "empty-parameter",
        "missing-equals",
        "missing-value",
        "unterminated-quote",
        "invalid-escape",
        "invalid-parameter-name",
        "duplicate-parameter-name",
        "mixed-case-duplicate-parameter-name",
        "control",
        "non-ascii",
        "overlong",
    ),
)
def test_aia_png_rejects_invalid_media_declarations_before_reading_body(
    monkeypatch: pytest.MonkeyPatch,
    fields: list[tuple[str, str]],
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        b"secret-upstream-body",
        url=url,
        headers=_Headers(fields),
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(url)

    assert raised.value.code == "invalid_aia_media_type"
    assert response.read_sizes == []
    assert response.closed is True


def test_aia_png_rejects_well_formed_non_png_media_before_reading_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    url = provider.HELIOVIEWER_TILE_URL
    response = _Response(
        b"<html>secret detail</html>",
        url=url,
        headers=_Headers([("Content-Type", "text/html; charset=utf-8")]),
    )
    _install_routes(monkeypatch, {url: [response]})

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(url)

    assert raised.value.code == "unsupported_aia_media_type"
    assert response.read_sizes == []
    assert response.closed is True


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


@pytest.mark.parametrize(
    ("fetch_name", "base_url", "body"),
    (
        ("_fetch_json", SolarRealtimeDataProvider.NOAA_PLASMA_URL, b"{}"),
        ("_fetch_text", SolarRealtimeDataProvider.SILSO_DAILY_URL, b"text"),
        ("_fetch_binary", SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL, b"binary"),
    ),
)
def test_fetch_modes_reject_megabyte_url_before_network(
    monkeypatch: pytest.MonkeyPatch,
    fetch_name: str,
    base_url: str,
    body: bytes,
) -> None:
    provider = SolarRealtimeDataProvider()
    oversized_url = base_url + "?padding=" + ("1" * 1_000_000)
    opened: list[str] = []

    def open_request(request, *, timeout: float):
        assert timeout > 0.0
        opened.append(request.full_url)
        return _Response(body, url=request.full_url)

    monkeypatch.setattr(
        urllib.request,
        "build_opener",
        lambda *_handlers: _Opener(open_request),
    )

    with pytest.raises(RuntimeError, match="URL.*byte limit"):
        getattr(provider, fetch_name)(oversized_url)

    assert opened == []


def test_redirect_chain_shares_one_absolute_acquisition_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monotonic_now = [100.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    provider = SolarRealtimeDataProvider(timeout_s=1.0)
    initial_url = provider.HELIOVIEWER_TILE_URL
    redirected_url = "https://api.helioviewer.org/v2/getTile/?id=123"
    redirect = _Response(
        b"",
        url=initial_url,
        status=302,
        headers={"Location": "/v2/getTile/?id=123"},
    )
    final = _Response(b"tile", url=redirected_url)
    pending = deque((redirect, final))
    open_timeouts: list[float] = []

    def open_request(_request, *, timeout: float):
        open_timeouts.append(timeout)
        monotonic_now[0] += 0.6
        return pending.popleft()

    monkeypatch.setattr(
        urllib.request,
        "build_opener",
        lambda *_handlers: _Opener(open_request),
    )

    with pytest.raises(RuntimeError, match="acquisition deadline"):
        provider._fetch_binary(initial_url)

    assert open_timeouts == pytest.approx([1.0, 0.4])
    assert redirect.closed is True
    assert final.closed is True


def test_slow_drip_reads_receive_remaining_budget_and_stop_at_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monotonic_now = [200.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    provider = SolarRealtimeDataProvider(timeout_s=1.0)
    url = provider.HELIOVIEWER_TILE_URL

    class RecordingSocket:
        def __init__(self) -> None:
            self.timeouts: list[float] = []

        def settimeout(self, timeout: float) -> None:
            self.timeouts.append(timeout)

    socket = RecordingSocket()

    class SlowResponse(_Response):
        def __init__(self) -> None:
            super().__init__(b"abcdefghij", url=url)
            raw = type("Raw", (), {"_sock": socket})()
            self.fp = type("Fp", (), {"raw": raw})()

        def read(self, size: int = -1) -> bytes:
            raise AssertionError(
                "buffer-filling read permits a slow peer to reset the socket timeout"
            )

        def read1(self, size: int = -1) -> bytes:
            self.read_sizes.append(size)
            monotonic_now[0] += 0.3
            if self._offset >= len(self._body):
                return b""
            chunk = self._body[self._offset : self._offset + 1]
            self._offset += 1
            return chunk

    response = SlowResponse()

    def open_request(_request, *, timeout: float):
        assert timeout == pytest.approx(1.0)
        return response

    monkeypatch.setattr(
        urllib.request,
        "build_opener",
        lambda *_handlers: _Opener(open_request),
    )

    with pytest.raises(RuntimeError, match="acquisition deadline"):
        provider._fetch_binary(url)

    assert socket.timeouts == pytest.approx([1.0, 0.7, 0.4, 0.1])
    assert len(response.read_sizes) == 4
    assert response.closed is True


def test_sequential_swpc_requests_receive_only_shared_remaining_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monotonic_now = [100.0]
    provider = SolarRealtimeDataProvider(timeout_s=1.0)
    observed_timeouts: list[float] = []
    observed_urls: list[str] = []
    wind_response = _Response(
        b'[{"active":true,"overall_quality":0,"source":"DSCOVR",'
        b'"time_tag":"2026-09-27T12:00:00Z","proton_density":5.0,'
        b'"proton_speed":450.0,"proton_temperature":100000.0}]',
        url=provider.NOAA_WIND_URL,
    )
    mag_response = _Response(
        b'[{"active":true,"overall_quality":0,"source":"DSCOVR",'
        b'"time_tag":"2026-09-27T12:00:00Z","bt":5.0,"bz_gsm":-2.0}]',
        url=provider.NOAA_MAG_URL,
    )
    responses = {
        provider.NOAA_WIND_URL: wind_response,
        provider.NOAA_MAG_URL: mag_response,
    }
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    monkeypatch.setattr(
        provider,
        "_utc_now",
        lambda: datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc),
    )

    def open_request(request, *, timeout: float):
        observed_urls.append(request.full_url)
        observed_timeouts.append(timeout)
        monotonic_now[0] += 0.35
        return responses[request.full_url]

    monkeypatch.setattr(
        urllib.request,
        "build_opener",
        lambda *_handlers: _Opener(open_request),
    )

    result = provider._fetch_swpc()

    assert result["solar_wind_speed_kms"] == 450.0
    assert observed_urls == [provider.NOAA_WIND_URL, provider.NOAA_MAG_URL]
    assert observed_timeouts == pytest.approx([1.0, 0.65])
    assert wind_response.closed is True
    assert mag_response.closed is True
