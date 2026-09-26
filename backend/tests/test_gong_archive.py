from __future__ import annotations

import gzip
import hashlib
import socket
from collections import deque
from datetime import datetime, timedelta, timezone

import pytest
from astropy.time import Time

from gong_fixture_helpers import COMPRESSED, EXPANDED, MANIFEST, gong_module


BASE = "https://gong.nso.edu/data/magmap/QR/zqs/"


def jd_tdb(utc: str) -> float:
    return float(Time(utc, scale="utc").tdb.jd)


def day_url(day: str) -> str:
    return f"{BASE}{day[:6]}/mrzqs{day[2:]}/"


def file_url(filename: str) -> str:
    day = "20" + filename[5:11]
    return day_url(day) + filename


def listing(*hrefs: str, padding: int = 0) -> bytes:
    links = "".join(f'<a href="{href}">{href}</a>' for href in hrefs)
    return (links + (" " * padding)).encode()


class Clock:
    def __init__(self) -> None:
        self.value = 100.0

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class Response:
    def __init__(
        self,
        body: bytes = b"",
        *,
        status: int = 200,
        headers: dict[str, str] | None = None,
        url: str | None = None,
        clock: Clock | None = None,
        read_seconds: float = 0.0,
        read_error: Exception | None = None,
        header_items: tuple[tuple[str, str], ...] | None = None,
    ) -> None:
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.header_items = header_items or tuple(self.headers.items())
        self.url = url
        self.clock = clock
        self.read_seconds = read_seconds
        self.read_error = read_error
        self.offset = 0
        self.closed = False

    def read(self, size: int) -> bytes:
        if self.clock is not None:
            self.clock.advance(self.read_seconds)
            self.read_seconds = 0.0
        if self.read_error is not None:
            raise self.read_error
        chunk = self.body[self.offset : self.offset + size]
        self.offset += len(chunk)
        return chunk

    def close(self) -> None:
        self.closed = True


class Transport:
    def __init__(self, routes: dict[str, object], *, clock: Clock | None = None) -> None:
        self.routes = {key: deque(value if isinstance(value, list) else [value]) for key, value in routes.items()}
        self.calls: list[str] = []
        self.timeout_calls: list[dict[str, float]] = []
        self.clock = clock

    def open(
        self,
        url: str,
        *,
        connect_timeout_s: float,
        stall_timeout_s: float,
        **stage_timeouts: float,
    ):
        self.calls.append(url)
        self.timeout_calls.append(
            {
                "connect_timeout_s": connect_timeout_s,
                "stall_timeout_s": stall_timeout_s,
                **stage_timeouts,
            }
        )
        if url not in self.routes or not self.routes[url]:
            raise AssertionError(f"unexpected transport request: {url}")
        item = self.routes[url].popleft()
        if callable(item):
            item = item()
        if isinstance(item, Exception):
            raise item
        assert all(hasattr(item, name) for name in ("status", "headers", "read", "close"))
        if item.url is None:
            item.url = url
        return item


def provider_for(
    request_utc: str,
    filenames: tuple[str, ...],
    *,
    payload: bytes = b"fits",
    parser=None,
):
    gong = gong_module()
    request_day = request_utc[:10].replace("-", "")
    selected = max(filenames)
    compressed = gzip.compress(payload)
    routes = {
        day_url(request_day): Response(listing(*filenames)),
        file_url(selected): Response(compressed),
    }
    transport = Transport(routes)
    seen = []

    def record(expanded, *, context, limits):
        seen.append((expanded, context, limits))
        return context.filename

    instance = gong.GongArchiveProvider(transport, parser=parser or record)
    return instance, transport, seen, jd_tdb(request_utc)


@pytest.mark.parametrize(
    ("request_utc", "current", "older", "expected"),
    [
        ("2026-09-26T00:01:00", "mrzqs260926t0002c2316_302.fits.gz", "mrzqs260925t2359c2316_301.fits.gz", "mrzqs260925t2359c2316_301.fits.gz"),
        ("2026-10-01T00:01:00", "mrzqs261001t0002c2316_302.fits.gz", "mrzqs260930t2359c2316_301.fits.gz", "mrzqs260930t2359c2316_301.fits.gz"),
        ("2027-01-01T00:01:00", "mrzqs270101t0002c2320_302.fits.gz", "mrzqs261231t2359c2320_301.fits.gz", "mrzqs261231t2359c2320_301.fits.gz"),
    ],
)
def test_latest_at_or_before_crosses_calendar_boundaries(request_utc, current, older, expected):
    gong = gong_module()
    request_day = request_utc[:10].replace("-", "")
    previous_day = "20" + older[5:11]
    compressed = gzip.compress(b"fits")
    transport = Transport(
        {
            day_url(request_day): Response(listing(current)),
            day_url(previous_day): Response(listing(older)),
            file_url(expected): Response(compressed),
        }
    )
    selected = gong.GongArchiveProvider(
        transport, parser=lambda _, *, context, limits: context.filename
    ).acquire(jd_tdb(request_utc))
    assert selected == expected


def test_selection_uses_filename_time_not_local_carrington_rotation():
    gong = gong_module()
    older = "mrzqs210317t2114c2242_301.fits.gz"
    latest = "mrzqs210317t2214c2242_300.fits.gz"
    provider, _, _, request = provider_for("2021-03-17T22:15:00", (older, latest))
    before = gong.provider_carrington_state_from_crnow(2241.9967070)
    after = gong.provider_carrington_state_from_crnow(2242.0012631)
    assert older[16:21] == latest[16:21] == "c2242"
    assert (before.rotation_number, after.rotation_number) == (2241, 2242)
    assert provider.acquire(request) == latest


@pytest.mark.parametrize(
    ("hrefs", "request_utc", "code"),
    [
        (("mrzqs260925t2305c2316_301.fits.gz",), "2026-09-25T23:04:00", "future_only"),
        (("mrzqs260924t1000c2316_301.fits.gz",), "2026-09-26T00:00:00", "too_old"),
        (("mrzqs260925t2304c2316_300.fits.gz", "mrzqs260925t2304c2317_301.fits.gz"), "2026-09-25T23:05:00", "ambiguous_candidate"),
        (("mrzqa260925t2304c2316_301.fits.gz",), "2026-09-25T23:05:00", "wrong_product"),
        (("mrzqs260925-bad.fits.gz",), "2026-09-25T23:05:00", "malformed_filename"),
        ((), "2026-09-25T23:05:00", "archive_miss"),
    ],
)
def test_discovery_failures_have_stable_codes(hrefs, request_utc, code):
    gong = gong_module()
    requested = datetime.fromisoformat(request_utc).replace(tzinfo=timezone.utc)
    first = requested.date()
    last = (requested - timedelta(hours=36)).date()
    routes = {}
    day = first
    while day >= last:
        token = day.strftime("%Y%m%d")
        matching = tuple(href for href in hrefs if href[5:11] == token[2:])
        routes[day_url(token)] = Response(listing(*matching))
        day -= timedelta(days=1)
    transport = Transport(routes)
    with pytest.raises(gong.GongArchiveError) as caught:
        gong.GongArchiveProvider(transport, parser=lambda *a, **k: None).acquire(jd_tdb(request_utc))
    assert caught.value.code == code
    assert str(caught.value).startswith(code + ":")


@pytest.mark.parametrize(
    "unsafe",
    [
        "../mrzqs260925t2304c2316_301.fits.gz",
        "%2e%2e/mrzqs260925t2304c2316_301.fits.gz",
        "mrzqs260925t2304c2316_301.fits.gz?x=1",
        "mrzqs260925t2304c2316_301.fits.gz#x",
        "https://user@gong.nso.edu/data/magmap/QR/zqs/mrzqs260925t2304c2316_301.fits.gz",
        "http://gong.nso.edu/data/magmap/QR/zqs/mrzqs260925t2304c2316_301.fits.gz",
        "https://evil.example/data/magmap/QR/zqs/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/other/mrzqs260925t2304c2316_301.fits.gz",
    ],
)
def test_unsafe_listing_target_is_rejected_before_fetch(unsafe):
    gong = gong_module()
    directory = day_url("20260925")
    transport = Transport({directory: Response(listing(unsafe))})
    with pytest.raises(gong.GongArchiveError) as caught:
        gong.GongArchiveProvider(transport, parser=lambda *a, **k: None).acquire(
            jd_tdb("2026-09-25T23:05:00")
        )
    assert caught.value.code == "unsafe_url"
    assert transport.calls == [directory]


def test_safe_relative_redirect_and_final_url_are_manually_validated():
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    provider, transport, _, request = provider_for("2026-09-25T23:05:00", (filename,))
    target = file_url(filename)
    redirected = day_url("20260925") + "download.fits.gz"
    transport.routes[target] = deque(
        [Response(status=302, headers={"Location": "download.fits.gz"})]
    )
    transport.routes[redirected] = deque([Response(gzip.compress(b"fits"))])
    assert provider.acquire(request) == filename
    assert transport.calls[-2:] == [target, redirected]


@pytest.mark.parametrize("count, code", [(1, "redirect_loop"), (4, "redirect_overflow")])
def test_redirect_loop_and_overflow_are_bounded(count, code):
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    target = file_url(filename)
    hops = [f"{target}.r{i}" for i in range(count)]
    redirects = {target: Response(status=302, headers={"Location": hops[0] if hops else target})}
    for index, hop in enumerate(hops):
        next_url = target if count == 1 else (hops[index + 1] if index + 1 < len(hops) else target)
        redirects[hop] = Response(status=302, headers={"Location": next_url})
    transport = Transport({day_url("20260925"): Response(listing(filename)), **redirects})
    with pytest.raises(gong.GongArchiveError) as caught:
        gong.GongArchiveProvider(transport, parser=lambda *a, **k: None).acquire(
            jd_tdb("2026-09-25T23:05:00")
        )
    assert caught.value.code == code


def test_exactly_three_redirects_are_allowed():
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    target = file_url(filename)
    hops = [day_url("20260925") + f"mirror-{index}.fits.gz" for index in range(3)]
    transport = Transport(
        {
            day_url("20260925"): Response(listing(filename)),
            target: Response(status=302, headers={"Location": "mirror-0.fits.gz"}),
            hops[0]: Response(status=302, headers={"Location": "mirror-1.fits.gz"}),
            hops[1]: Response(status=302, headers={"Location": "mirror-2.fits.gz"}),
            hops[2]: Response(gzip.compress(b"fits")),
        }
    )
    result = gong.GongArchiveProvider(
        transport, parser=lambda expanded, *, context, limits: expanded
    ).acquire(jd_tdb("2026-09-25T23:05:00"))
    assert result == b"fits"


@pytest.mark.parametrize(
    ("minute", "expected"), [("1200", None), ("1159", "too_old")]
)
def test_lookback_window_passes_at_36_hours_and_rejects_one_minute_more(minute, expected):
    gong = gong_module()
    filename = f"mrzqs260924t{minute}c2316_301.fits.gz"
    compressed = gzip.compress(b"fits")
    transport = Transport(
        {
            day_url("20260926"): Response(b""),
            day_url("20260925"): Response(b""),
            day_url("20260924"): Response(listing(filename)),
            file_url(filename): Response(compressed),
        }
    )
    provider = gong.GongArchiveProvider(
        transport, parser=lambda _, *, context, limits: context.filename
    )
    if expected is None:
        assert provider.acquire(jd_tdb("2026-09-26T00:00:00")) == filename
    else:
        with pytest.raises(gong.GongArchiveError) as caught:
            provider.acquire(jd_tdb("2026-09-26T00:00:00"))
        assert caught.value.code == expected


def test_missing_symbols_define_the_archive_contract():
    gong = gong_module()
    assert gong.GONG_ARCHIVE_BASE_URL == BASE
    assert gong.GongArchiveLimits().max_lookback_hours == 36
    assert gong.GongArchiveLimits().max_redirects == 3


def test_normal_apache_navigation_links_are_ignored():
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    directory = day_url("20260925")
    transport = Transport(
        {
            directory: Response(listing("../", "/", "?C=N;O=D", "?C=M;O=A", filename)),
            file_url(filename): Response(gzip.compress(b"fits")),
        }
    )
    result = gong.GongArchiveProvider(
        transport, parser=lambda _, *, context, limits: context.filename
    ).acquire(jd_tdb("2026-09-25T23:05:00"))
    assert result == filename


@pytest.mark.parametrize("control", ["\x00", "\x01", "\x1f", "\x7f"])
def test_all_url_control_characters_are_rejected(control):
    gong = gong_module()
    filename = f"mrzqs260925t2304c2316_301{control}.fits.gz"
    directory = day_url("20260925")
    transport = Transport({directory: Response(listing(filename))})
    with pytest.raises(gong.GongArchiveError) as caught:
        gong.GongArchiveProvider(transport, parser=lambda *a, **k: None).acquire(
            jd_tdb("2026-09-25T23:05:00")
        )
    assert caught.value.code == "unsafe_url"


def acquire_payload(
    payload: bytes,
    *,
    limits=None,
    listing_body: bytes | None = None,
    compressed: bytes | None = None,
    clock: Clock | None = None,
    download_response: Response | None = None,
    parser=None,
):
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    compressed = gzip.compress(payload) if compressed is None else compressed
    directory = day_url("20260925")
    archive = listing(filename) if listing_body is None else listing_body
    response = download_response or Response(compressed)
    transport = Transport(
        {directory: Response(archive), file_url(filename): response}, clock=clock
    )
    parse = parser or (lambda expanded, *, context, limits: expanded)
    provider = gong.GongArchiveProvider(
        transport,
        clock=clock or Clock(),
        limits=limits,
        parser=parse,
        utc_now=lambda: datetime(2026, 9, 26, tzinfo=timezone.utc),
    )
    return provider, transport, jd_tdb("2026-09-25T23:05:00"), archive, compressed


@pytest.mark.parametrize(
    ("kind", "delta", "expected"),
    [
        ("listing", 0, None),
        ("listing", -1, "listing_limit"),
        ("compressed", 0, None),
        ("compressed", -1, "compressed_limit"),
        ("expanded", 0, None),
        ("expanded", -1, "expanded_limit"),
        ("aggregate", 0, None),
        ("aggregate", -1, "aggregate_limit"),
    ],
)
def test_streaming_byte_limits_pass_exactly_and_reject_one_more(kind, delta, expected):
    gong = gong_module()
    payload = bytes(range(256)) * 4
    archive = listing("mrzqs260925t2304c2316_301.fits.gz")
    compressed = gzip.compress(payload)
    values = {
        "max_listing_bytes": len(archive) + (delta if kind == "listing" else 0),
        "max_compressed_bytes": len(compressed) + (delta if kind == "compressed" else 0),
        "max_expanded_fits_bytes": len(payload) + (delta if kind == "expanded" else 0),
        "max_aggregate_bytes": len(archive) + len(compressed) + (delta if kind == "aggregate" else 0),
        "max_gzip_ratio": 1_000.0,
    }
    provider, _, request, _, _ = acquire_payload(
        payload,
        limits=gong.GongArchiveLimits(**values),
        listing_body=archive,
        compressed=compressed,
    )
    if expected is None:
        assert provider.acquire(request) == payload
    else:
        with pytest.raises(gong.GongArchiveError) as caught:
            provider.acquire(request)
        assert caught.value.code == expected
        assert provider.cache_size == 0


@pytest.mark.parametrize("truncated_part", ["listing", "file"])
def test_declared_content_length_rejects_truncated_listing_and_file(truncated_part):
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    directory = day_url("20260925")
    archive = listing(filename)
    compressed = gzip.compress(b"fits")
    listing_headers = {"Content-Length": str(len(archive) + 1)} if truncated_part == "listing" else {}
    file_headers = {"Content-Length": str(len(compressed) + 1)} if truncated_part == "file" else {}
    transport = Transport(
        {
            directory: Response(archive, headers=listing_headers),
            file_url(filename): Response(compressed, headers=file_headers),
        }
    )
    provider = gong.GongArchiveProvider(
        transport, parser=lambda expanded, *, context, limits: expanded
    )
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"))
    assert caught.value.code == "content_length_mismatch"
    assert provider.cache_size == 0


@pytest.mark.parametrize(
    ("header_items", "code"),
    [
        ((("Content-Length", "1"), ("Content-Length", "2")), "conflicting_content_length"),
        ((("Content-Length", "+1"),), "invalid_content_length"),
        ((("Content-Length", "01"),), "invalid_content_length"),
        ((("Content-Length", "١"),), "invalid_content_length"),
        ((("Transfer-Encoding", "chunked"), ("Content-Length", "1")), "ambiguous_framing"),
        ((("Transfer-Encoding", "gzip"),), "unsupported_transfer_encoding"),
        ((("Content-Encoding", "gzip"),), "unsupported_content_encoding"),
    ],
)
def test_http_framing_rejects_ambiguous_or_noncanonical_headers(header_items, code):
    gong = gong_module()
    directory = day_url("20260925")
    transport = Transport(
        {
            directory: Response(
                b"x",
                header_items=header_items,
                headers=dict(header_items),
            )
        }
    )
    with pytest.raises(gong.GongArchiveError) as caught:
        gong.GongArchiveProvider(transport, parser=lambda *a, **k: None).acquire(
            jd_tdb("2026-09-25T23:05:00")
        )
    assert caught.value.code == code


@pytest.mark.parametrize("truncated_part", ["listing", "file"])
@pytest.mark.parametrize("wrapped_response", [False, True])
def test_truncated_chunked_listing_and_file_fail_closed(truncated_part, wrapped_response):
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    directory = day_url("20260925")
    archive = listing(filename)
    compressed = gzip.compress(b"fits")
    truncated = gong.http.client.IncompleteRead(b"partial", 10)
    listing_response = (
        Response(
            headers={"Transfer-Encoding": "chunked"},
            read_error=truncated,
        )
        if truncated_part == "listing"
        else Response(archive)
    )
    file_response = (
        Response(
            headers={"Transfer-Encoding": "chunked"},
            read_error=truncated,
        )
        if truncated_part == "file"
        else Response(compressed)
    )
    if wrapped_response:
        listing_response = gong._BoundedHttpResponse(
            listing_response,
            clock=Clock(),
            read_timeout_s=2.0,
            stall_timeout_s=2.0,
            url=directory,
        )
        file_response = gong._BoundedHttpResponse(
            file_response,
            clock=Clock(),
            read_timeout_s=2.0,
            stall_timeout_s=2.0,
            url=file_url(filename),
        )
    transport = Transport(
        {directory: listing_response, file_url(filename): file_response}
    )
    provider = gong.GongArchiveProvider(transport, parser=lambda *a, **k: None)
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"))
    assert caught.value.code == "truncated_body"
    assert provider.cache_size == 0


def test_gzip_ratio_passes_at_exact_output_budget_and_rejects_one_more_byte():
    gong = gong_module()
    match = None
    for size in range(100, 10_000):
        payload = b"x" * size
        compressed = gzip.compress(payload)
        if size % len(compressed) == 0:
            match = payload, compressed, size // len(compressed)
            break
    assert match is not None
    payload, compressed, ratio = match
    common = dict(
        max_listing_bytes=1_024,
        max_aggregate_bytes=20_000,
        max_compressed_bytes=len(compressed),
        max_expanded_fits_bytes=len(payload) + 1,
    )
    provider, _, request, _, _ = acquire_payload(
        payload,
        compressed=compressed,
        limits=gong.GongArchiveLimits(max_gzip_ratio=ratio, **common),
    )
    assert provider.acquire(request) == payload
    provider, _, request, _, _ = acquire_payload(
        payload + b"x",
        limits=gong.GongArchiveLimits(max_gzip_ratio=ratio, **common),
    )
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(request)
    assert caught.value.code == "gzip_ratio_limit"


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda member: member[:-1] + bytes([member[-1] ^ 1]), "gzip_integrity"),
        (lambda member: member[:-4], "gzip_truncated"),
        (lambda member: member + gzip.compress(b"second"), "gzip_concatenated"),
    ],
)
def test_gzip_integrity_attacks_fail_closed(mutate, code):
    gong = gong_module()
    payload = b"bounded gzip payload"
    attacked = mutate(gzip.compress(payload))
    provider, _, request, _, _ = acquire_payload(payload, compressed=attacked)
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(request)
    assert caught.value.code == code
    assert provider.cache_size == 0


@pytest.mark.parametrize(
    "code",
    [
        "dns_timeout",
        "connect_timeout",
        "tls_timeout",
        "header_timeout",
        "read_timeout",
        "socket_stall_timeout",
    ],
)
def test_injected_transport_expiry_preserves_stable_code(code):
    gong = gong_module()
    directory = day_url("20260925")
    error = gong.GongTransportError(code, "injected")
    item = Response(read_error=error) if code in ("read_timeout", "socket_stall_timeout") else error
    transport = Transport({directory: item})
    provider = gong.GongArchiveProvider(transport, parser=lambda *a, **k: None)
    with pytest.raises(gong.GongTransportError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"))
    assert caught.value.code == code
    assert provider.cache_size == 0


@pytest.mark.parametrize(("elapsed", "code"), [(2.0, None), (2.000001, "total_deadline")])
def test_cooperative_total_deadline_passes_exactly_and_fails_after(elapsed, code):
    gong = gong_module()
    clock = Clock()
    payload = b"fits"
    compressed = gzip.compress(payload)
    response = Response(compressed, clock=clock, read_seconds=elapsed)
    provider, _, request, _, _ = acquire_payload(
        payload, clock=clock, compressed=compressed, download_response=response
    )
    if code is None:
        assert provider.acquire(request, total_timeout_s=2.0) == payload
    else:
        with pytest.raises(gong.GongArchiveError) as caught:
            provider.acquire(request, total_timeout_s=2.0)
        assert caught.value.code == code


def test_total_deadline_takes_precedence_over_transport_stage_error():
    gong = gong_module()
    clock = Clock()
    directory = day_url("20260925")

    def expire_then_fail():
        clock.advance(2.1)
        return gong.GongTransportError("dns_timeout", "injected after deadline")

    transport = Transport({directory: expire_then_fail}, clock=clock)
    provider = gong.GongArchiveProvider(transport, clock=clock, parser=lambda *a, **k: None)
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"), total_timeout_s=2.0)
    assert caught.value.code == "total_deadline"


def test_redirect_chain_consumes_the_same_deadline():
    gong = gong_module()
    clock = Clock()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    target = file_url(filename)
    redirect = day_url("20260925") + "mirror.fits.gz"

    def slow_redirect():
        clock.advance(2.1)
        return Response(status=302, headers={"Location": "mirror.fits.gz"})

    transport = Transport(
        {
            day_url("20260925"): Response(listing(filename)),
            target: slow_redirect,
            redirect: Response(gzip.compress(b"fits")),
        }
    )
    provider = gong.GongArchiveProvider(transport, clock=clock, parser=lambda *a, **k: None)
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"), total_timeout_s=2.0)
    assert caught.value.code == "total_deadline"
    assert redirect not in transport.calls


def test_each_transport_stage_receives_only_the_remaining_total_budget():
    gong = gong_module()
    clock = Clock()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    directory = day_url("20260925")
    transport = Transport(
        {
            directory: Response(listing(filename), clock=clock, read_seconds=3.0),
            file_url(filename): Response(gzip.compress(b"fits")),
        }
    )
    limits = gong.GongArchiveLimits(
        dns_timeout_s=20.0,
        connect_timeout_s=20.0,
        tls_timeout_s=20.0,
        header_timeout_s=20.0,
        read_timeout_s=20.0,
        stall_timeout_s=20.0,
    )
    provider = gong.GongArchiveProvider(
        transport,
        clock=clock,
        limits=limits,
        parser=lambda expanded, *, context, limits: expanded,
    )
    assert provider.acquire(jd_tdb("2026-09-25T23:05:00"), total_timeout_s=10.0) == b"fits"
    assert transport.timeout_calls[0] == {
        "total_timeout_s": 10.0,
        "dns_timeout_s": 10.0,
        "connect_timeout_s": 10.0,
        "tls_timeout_s": 10.0,
        "header_timeout_s": 10.0,
        "read_timeout_s": 10.0,
        "stall_timeout_s": 10.0,
    }
    assert transport.timeout_calls[1] == {
        "total_timeout_s": pytest.approx(7.0),
        "dns_timeout_s": pytest.approx(7.0),
        "connect_timeout_s": pytest.approx(7.0),
        "tls_timeout_s": pytest.approx(7.0),
        "header_timeout_s": pytest.approx(7.0),
        "read_timeout_s": pytest.approx(7.0),
        "stall_timeout_s": pytest.approx(7.0),
    }


@pytest.mark.parametrize(
    "location",
    [
        "../escaped.fits.gz",
        "./escaped.fits.gz",
        "sub/../escaped.fits.gz",
        "space name.fits.gz",
        "unicodé.fits.gz",
        "http://gong.nso.edu/data/magmap/QR/zqs/x",
        "https://evil.example/data/magmap/QR/zqs/x",
        "https://gong.nso.edu/outside/x",
        "%2e%2e/x",
        "x?query=1",
        "x#fragment",
    ],
)
def test_unsafe_redirect_is_rejected_before_target_fetch(location):
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    target = file_url(filename)
    transport = Transport(
        {
            day_url("20260925"): Response(listing(filename)),
            target: Response(status=302, headers={"Location": location}),
        }
    )
    provider = gong.GongArchiveProvider(transport, parser=lambda *a, **k: None)
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"))
    assert caught.value.code == "unsafe_url"
    assert transport.calls == [day_url("20260925"), target]


def test_transport_reported_final_url_is_validated():
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    target = file_url(filename)
    transport = Transport(
        {
            day_url("20260925"): Response(listing(filename)),
            target: Response(
                gzip.compress(b"fits"),
                url="https://evil.example/data/magmap/QR/zqs/stolen.fits.gz",
            ),
        }
    )
    with pytest.raises(gong.GongArchiveError) as caught:
        gong.GongArchiveProvider(transport, parser=lambda *a, **k: None).acquire(
            jd_tdb("2026-09-25T23:05:00")
        )
    assert caught.value.code == "unsafe_url"
    assert transport.calls == [day_url("20260925"), target]


@pytest.mark.parametrize(
    ("limit_update", "expected"),
    [
        ({"max_expanded_fits_bytes": len(EXPANDED)}, None),
        ({"max_expanded_fits_bytes": len(EXPANDED) - 1}, "expanded_limit"),
        ({"max_header_bytes": 5_760}, None),
        ({"max_header_bytes": 5_759}, "header_limit"),
        ({"max_pixels": 64_800}, None),
        ({"max_pixels": 64_799}, "pixel_limit"),
    ],
)
def test_archive_integrates_real_parser_limits_at_exact_and_plus_one(limit_update, expected):
    gong = gong_module()
    defaults = dict(
        max_listing_bytes=1_024,
        max_aggregate_bytes=len(COMPRESSED) + 1_024,
        max_compressed_bytes=len(COMPRESSED),
        max_expanded_fits_bytes=len(EXPANDED),
        max_header_bytes=5_760,
        max_pixels=64_800,
        max_gzip_ratio=1_000.0,
    )
    defaults.update(limit_update)
    provider, _, request, _, _ = acquire_payload(
        EXPANDED,
        compressed=COMPRESSED,
        limits=gong.GongArchiveLimits(**defaults),
        parser=gong.parse_gong_fits,
    )
    if expected is None:
        snapshot = provider.acquire(request)
        assert snapshot.provenance.filename == MANIFEST["filename"]
        assert snapshot.provenance.compressed_sha256 == hashlib.sha256(COMPRESSED).hexdigest()
        assert provider.cache_size == 1
    else:
        error_type = gong.GongArchiveError if expected == "expanded_limit" else gong.GongFitsError
        with pytest.raises(error_type) as caught:
            provider.acquire(request)
        assert caught.value.code == expected
        assert provider.cache_size == 0


def test_cache_commit_occurs_only_after_valid_parse_and_is_reused_after_fresh_discovery():
    gong = gong_module()
    filename = MANIFEST["filename"]
    directory = day_url("20260925")
    calls = 0

    def parser(expanded, *, context, limits):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise gong.GongFitsError("invalid_observation", "injected invalid FITS")
        return context.filename

    transport = Transport(
        {
            directory: [Response(listing(filename)), Response(listing(filename)), Response(listing(filename))],
            file_url(filename): [Response(COMPRESSED), Response(COMPRESSED), Response(COMPRESSED)],
        }
    )
    provider = gong.GongArchiveProvider(transport, parser=parser)
    request = jd_tdb("2026-09-25T23:05:00")
    with pytest.raises(gong.GongFitsError):
        provider.acquire(request)
    assert provider.cache_size == 0
    assert provider.acquire(request) == filename
    assert provider.cache_size == 1
    assert provider.acquire(request) == filename
    assert calls == 2
    assert transport.calls.count(directory) == 3
    assert transport.calls.count(file_url(filename)) == 3


def test_same_url_changed_content_is_revalidated_instead_of_returning_stale_cache():
    gong = gong_module()
    filename = "mrzqs260925t2304c2316_301.fits.gz"
    directory = day_url("20260925")
    first = gzip.compress(b"first content")
    second = gzip.compress(b"changed content")
    transport = Transport(
        {
            directory: [Response(listing(filename)), Response(listing(filename))],
            file_url(filename): [Response(first), Response(second)],
        }
    )
    provider = gong.GongArchiveProvider(
        transport, parser=lambda expanded, *, context, limits: expanded
    )
    request = jd_tdb("2026-09-25T23:05:00")
    assert provider.acquire(request) == b"first content"
    assert provider.acquire(request) == b"changed content"
    assert provider.cache_size == 2


def test_identical_validated_fits_reuses_science_with_current_attempt_provenance():
    gong = gong_module()
    filename = MANIFEST["filename"]
    directory = day_url("20260925")
    transport = Transport(
        {
            directory: [Response(listing(filename)), Response(listing(filename))],
            file_url(filename): [Response(COMPRESSED), Response(COMPRESSED)],
        }
    )
    retrieved_times = iter(
        [
            datetime(2026, 9, 26, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 9, 26, 0, 1, tzinfo=timezone.utc),
        ]
    )
    provider = gong.GongArchiveProvider(
        transport,
        parser=gong.parse_gong_fits,
        utc_now=lambda: next(retrieved_times),
    )
    first_request = jd_tdb("2026-09-25T23:05:00")
    second_request = jd_tdb("2026-09-25T23:06:00")
    first = provider.acquire(first_request, total_timeout_s=5.0)
    second = provider.acquire(second_request, total_timeout_s=9.0)
    assert second is not first
    assert second.snapshot_id is first.snapshot_id
    assert second.field_gauss is first.field_gauss
    assert second.grid is first.grid
    assert first.provenance.request_jd_tdb == first_request
    assert first.provenance.retrieved_at_utc == "2026-09-26T00:00:00Z"
    assert first.provenance.retrieval_timeout_s == 5.0
    assert second.provenance.request_jd_tdb == second_request
    assert second.provenance.retrieved_at_utc == "2026-09-26T00:01:00Z"
    assert second.provenance.retrieval_timeout_s == 9.0
    assert provider.cache_size == 1
    assert transport.calls.count(directory) == 2
    assert transport.calls.count(file_url(filename)) == 2


class AdapterRawResponse:
    def __init__(
        self,
        *,
        clock: Clock,
        elapsed: float,
        body: bytes | None = None,
        header_elapsed: float = 0.0,
        header_error: Exception | None = None,
    ) -> None:
        self.status = 200
        self.headers = {}
        self._clock = clock
        self._elapsed = elapsed
        self._body = body
        self._header_elapsed = header_elapsed
        self._header_error = header_error

    def begin(self) -> None:
        self._clock.advance(self._header_elapsed)
        if self._header_error is not None:
            raise self._header_error

    def geturl(self) -> str:
        return BASE

    def read(self, size: int) -> bytes:
        self._clock.advance(self._elapsed)
        if self._body is not None:
            return self._body[:size]
        raise TimeoutError("injected socket timeout")

    def close(self) -> None:
        pass


class AdapterSocket:
    def __init__(
        self,
        *,
        clock: Clock,
        connect_elapsed: float = 0.0,
        connect_error: Exception | None = None,
    ) -> None:
        self.clock = clock
        self.connect_elapsed = connect_elapsed
        self.connect_error = connect_error
        self.timeouts: list[float] = []
        self.closed = False

    def settimeout(self, timeout: float) -> None:
        self.timeouts.append(timeout)

    def connect(self, address) -> None:
        self.clock.advance(self.connect_elapsed)
        if self.connect_error is not None:
            raise self.connect_error

    def sendall(self, payload: bytes) -> None:
        pass

    def close(self) -> None:
        self.closed = True


class AdapterTlsContext:
    def __init__(
        self,
        *,
        clock: Clock | None = None,
        elapsed: float = 0.0,
        error: Exception | None = None,
    ) -> None:
        self.clock = clock
        self.elapsed = elapsed
        self.error = error

    def wrap_socket(self, sock, *, server_hostname: str):
        if self.clock is not None:
            self.clock.advance(self.elapsed)
        if self.error is not None:
            raise self.error
        return sock


ADDRESSES = [(2, 1, 6, "", ("127.0.0.1", 443))]


def configure_adapter(
    transport,
    sock: AdapterSocket,
    raw: AdapterRawResponse,
    *,
    tls_context: AdapterTlsContext | None = None,
) -> None:
    transport._socket_factory = lambda *args: sock
    transport._ssl_context_factory = lambda: tls_context or AdapterTlsContext()
    transport._response_factory = lambda *args, **kwargs: raw


@pytest.mark.parametrize(
    ("read_timeout", "stall_timeout", "expected"),
    [(1.0, 5.0, "read_timeout"), (5.0, 1.0, "socket_stall_timeout")],
)
def test_production_transport_distinguishes_read_deadline_from_socket_stall(
    monkeypatch, read_timeout, stall_timeout, expected
):
    gong = gong_module()
    clock = Clock()
    raw = AdapterRawResponse(clock=clock, elapsed=1.1)
    transport = gong.UrllibGongTransport(clock=clock)
    configure_adapter(transport, AdapterSocket(clock=clock), raw)
    monkeypatch.setattr(gong.socket, "getaddrinfo", lambda *args, **kwargs: ADDRESSES)
    response = transport.open(
        BASE,
        total_timeout_s=10.0,
        dns_timeout_s=2.0,
        connect_timeout_s=2.0,
        tls_timeout_s=2.0,
        header_timeout_s=2.0,
        read_timeout_s=read_timeout,
        stall_timeout_s=stall_timeout,
    )
    with pytest.raises(gong.GongTransportError) as caught:
        response.read(1)
    assert caught.value.code == expected


def test_successful_delayed_read_still_reports_socket_stall_without_private_socket():
    gong = gong_module()
    clock = Clock()
    raw = AdapterRawResponse(clock=clock, elapsed=1.1, body=b"x")
    response = gong._BoundedHttpResponse(
        raw,
        clock=clock,
        read_timeout_s=5.0,
        stall_timeout_s=1.0,
    )
    with pytest.raises(gong.GongTransportError) as caught:
        response.read(1)
    assert caught.value.code == "socket_stall_timeout"


def test_production_transport_classifies_dns_and_connect_expiry(monkeypatch):
    gong = gong_module()
    clock = Clock()
    transport = gong.UrllibGongTransport(clock=clock)
    monkeypatch.setattr(
        gong.socket,
        "getaddrinfo",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            gong.socket.gaierror(gong.socket.EAI_NONAME, "injected permanent failure")
        ),
    )
    with pytest.raises(gong.GongTransportError) as dns:
        transport.open(
            BASE,
            total_timeout_s=10.0,
            dns_timeout_s=1.0,
            connect_timeout_s=2.0,
            tls_timeout_s=2.0,
            header_timeout_s=2.0,
            read_timeout_s=3.0,
            stall_timeout_s=4.0,
        )
    assert dns.value.code == "dns_error"

    monkeypatch.setattr(gong.socket, "getaddrinfo", lambda *args, **kwargs: ADDRESSES)
    raw = AdapterRawResponse(clock=clock, elapsed=0.0)
    configure_adapter(
        transport,
        AdapterSocket(clock=clock, connect_error=TimeoutError("injected")),
        raw,
    )
    with pytest.raises(gong.GongTransportError) as connect:
        transport.open(
            BASE,
            total_timeout_s=10.0,
            dns_timeout_s=1.0,
            connect_timeout_s=2.0,
            tls_timeout_s=2.0,
            header_timeout_s=2.0,
            read_timeout_s=3.0,
            stall_timeout_s=4.0,
        )
    assert connect.value.code == "connect_timeout"


@pytest.mark.parametrize(
    ("stage", "elapsed", "expected"),
    [
        ("dns", 1.0, None),
        ("dns", 1.000001, "dns_timeout"),
        ("connect", 1.0, None),
        ("connect", 1.000001, "connect_timeout"),
    ],
)
def test_production_dns_and_connect_budgets_pass_exactly_and_fail_after(
    monkeypatch, stage, elapsed, expected
):
    gong = gong_module()
    clock = Clock()
    raw = AdapterRawResponse(clock=clock, elapsed=0.0)
    transport = gong.UrllibGongTransport(clock=clock)

    def resolve(*args, **kwargs):
        if stage == "dns":
            clock.advance(elapsed)
        return ADDRESSES

    monkeypatch.setattr(gong.socket, "getaddrinfo", resolve)
    configure_adapter(
        transport,
        AdapterSocket(clock=clock, connect_elapsed=elapsed if stage == "connect" else 0.0),
        raw,
    )
    if expected is None:
        response = transport.open(
            BASE,
            total_timeout_s=10.0,
            dns_timeout_s=1.0,
            connect_timeout_s=1.0,
            tls_timeout_s=1.0,
            header_timeout_s=1.0,
            read_timeout_s=2.0,
            stall_timeout_s=2.0,
        )
        response.close()
    else:
        with pytest.raises(gong.GongTransportError) as caught:
            transport.open(
                BASE,
                total_timeout_s=10.0,
                dns_timeout_s=1.0,
                connect_timeout_s=1.0,
                tls_timeout_s=1.0,
                header_timeout_s=1.0,
                read_timeout_s=2.0,
                stall_timeout_s=2.0,
            )
        assert caught.value.code == expected


def test_production_transport_reduces_later_stages_by_time_already_spent(monkeypatch):
    gong = gong_module()
    clock = Clock()
    raw = AdapterRawResponse(clock=clock, elapsed=0.0)
    transport = gong.UrllibGongTransport(clock=clock)

    def resolve(*args, **kwargs):
        clock.advance(2.0)
        return ADDRESSES

    monkeypatch.setattr(gong.socket, "getaddrinfo", resolve)
    sock = AdapterSocket(clock=clock, connect_elapsed=1.1)
    configure_adapter(transport, sock, raw)
    with pytest.raises(gong.GongTransportError) as caught:
        transport.open(
            BASE,
            total_timeout_s=3.0,
            dns_timeout_s=5.0,
            connect_timeout_s=5.0,
            tls_timeout_s=5.0,
            header_timeout_s=5.0,
            read_timeout_s=5.0,
            stall_timeout_s=5.0,
        )
    assert caught.value.code == "connect_timeout"
    assert sock.timeouts == [pytest.approx(1.0)]


@pytest.mark.parametrize(
    ("elapsed", "error", "expected"),
    [
        (1.0, None, None),
        (1.000001, None, "header_timeout"),
        (0.0, TimeoutError("injected header stall"), "header_timeout"),
    ],
)
def test_production_header_budget_is_distinct_from_connect(
    monkeypatch, elapsed, error, expected
):
    gong = gong_module()
    clock = Clock()
    raw = AdapterRawResponse(
        clock=clock,
        elapsed=0.0,
        header_elapsed=elapsed,
        header_error=error,
    )
    transport = gong.UrllibGongTransport(clock=clock)
    configure_adapter(transport, AdapterSocket(clock=clock), raw)
    monkeypatch.setattr(gong.socket, "getaddrinfo", lambda *args, **kwargs: ADDRESSES)
    arguments = dict(
        total_timeout_s=10.0,
        dns_timeout_s=2.0,
        connect_timeout_s=2.0,
        tls_timeout_s=2.0,
        header_timeout_s=1.0,
        read_timeout_s=2.0,
        stall_timeout_s=2.0,
    )
    if expected is None:
        transport.open(BASE, **arguments).close()
    else:
        with pytest.raises(gong.GongTransportError) as caught:
            transport.open(BASE, **arguments)
        assert caught.value.code == expected


@pytest.mark.parametrize(
    ("dns_errno", "expected"),
    [(socket.EAI_AGAIN, "dns_timeout"), (socket.EAI_NONAME, "dns_error")],
)
def test_production_dns_temporary_and_permanent_failures_are_distinct(
    monkeypatch, dns_errno, expected
):
    gong = gong_module()
    transport = gong.UrllibGongTransport()
    monkeypatch.setattr(
        gong.socket,
        "getaddrinfo",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            gong.socket.gaierror(dns_errno, "injected")
        ),
    )
    with pytest.raises(gong.GongTransportError) as caught:
        transport.open(
            BASE,
            total_timeout_s=10.0,
            dns_timeout_s=1.0,
            connect_timeout_s=1.0,
            tls_timeout_s=1.0,
            header_timeout_s=1.0,
            read_timeout_s=1.0,
            stall_timeout_s=1.0,
        )
    assert caught.value.code == expected


@pytest.mark.parametrize(
    ("elapsed", "error", "expected"),
    [
        (1.0, None, None),
        (1.000001, None, "tls_timeout"),
        (0.0, OSError("injected TLS failure"), "tls_error"),
    ],
)
def test_production_tls_budget_is_distinct_from_tcp(
    monkeypatch, elapsed, error, expected
):
    gong = gong_module()
    clock = Clock()
    raw = AdapterRawResponse(clock=clock, elapsed=0.0)
    sock = AdapterSocket(clock=clock)
    tls = AdapterTlsContext(clock=clock, elapsed=elapsed, error=error)
    transport = gong.UrllibGongTransport(clock=clock)
    configure_adapter(transport, sock, raw, tls_context=tls)
    monkeypatch.setattr(gong.socket, "getaddrinfo", lambda *args, **kwargs: ADDRESSES)
    arguments = dict(
        total_timeout_s=10.0,
        dns_timeout_s=2.0,
        connect_timeout_s=2.0,
        tls_timeout_s=1.0,
        header_timeout_s=2.0,
        read_timeout_s=2.0,
        stall_timeout_s=2.0,
    )
    if expected is None:
        transport.open(BASE, **arguments).close()
    else:
        with pytest.raises(gong.GongTransportError) as caught:
            transport.open(BASE, **arguments)
        assert caught.value.code == expected
        assert sock.closed is True


def test_delayed_permanent_dns_and_bad_status_line_use_elapsed_timeout(monkeypatch):
    gong = gong_module()
    clock = Clock()
    transport = gong.UrllibGongTransport(clock=clock)

    def delayed_dns(*args, **kwargs):
        clock.advance(1.1)
        raise gong.socket.gaierror(gong.socket.EAI_NONAME, "delayed permanent failure")

    monkeypatch.setattr(gong.socket, "getaddrinfo", delayed_dns)
    with pytest.raises(gong.GongTransportError) as dns:
        transport.open(
            BASE,
            total_timeout_s=10.0,
            dns_timeout_s=1.0,
            connect_timeout_s=2.0,
            tls_timeout_s=2.0,
            header_timeout_s=2.0,
            read_timeout_s=2.0,
            stall_timeout_s=2.0,
        )
    assert dns.value.code == "dns_timeout"

    clock = Clock()
    sock = AdapterSocket(clock=clock)
    raw = AdapterRawResponse(
        clock=clock,
        elapsed=0.0,
        header_elapsed=1.1,
        header_error=gong.http.client.BadStatusLine("bad"),
    )
    transport = gong.UrllibGongTransport(clock=clock)
    configure_adapter(transport, sock, raw)
    monkeypatch.setattr(gong.socket, "getaddrinfo", lambda *args, **kwargs: ADDRESSES)
    with pytest.raises(gong.GongTransportError) as header:
        transport.open(
            BASE,
            total_timeout_s=10.0,
            dns_timeout_s=2.0,
            connect_timeout_s=2.0,
            tls_timeout_s=2.0,
            header_timeout_s=1.0,
            read_timeout_s=2.0,
            stall_timeout_s=2.0,
        )
    assert header.value.code == "header_timeout"
    assert sock.closed is True


def test_request_construction_failure_is_typed_and_closes_tls_socket(monkeypatch):
    gong = gong_module()
    clock = Clock()
    sock = AdapterSocket(clock=clock)
    raw = AdapterRawResponse(clock=clock, elapsed=0.0)
    transport = gong.UrllibGongTransport(clock=clock)
    configure_adapter(transport, sock, raw)
    transport._response_factory = lambda *args, **kwargs: (_ for _ in ()).throw(
        ValueError("injected request construction failure")
    )
    monkeypatch.setattr(gong.socket, "getaddrinfo", lambda *args, **kwargs: ADDRESSES)
    with pytest.raises(gong.GongTransportError) as caught:
        transport.open(
            BASE,
            total_timeout_s=10.0,
            dns_timeout_s=2.0,
            connect_timeout_s=2.0,
            tls_timeout_s=2.0,
            header_timeout_s=2.0,
            read_timeout_s=2.0,
            stall_timeout_s=2.0,
        )
    assert caught.value.code == "header_error"
    assert sock.closed is True


@pytest.mark.parametrize("unsafe_path", ["space name", "unicodé", "control\x00name"])
def test_production_transport_rejects_unsafe_path_before_dns(monkeypatch, unsafe_path):
    gong = gong_module()
    transport = gong.UrllibGongTransport()
    dns_called = False

    def resolve(*args, **kwargs):
        nonlocal dns_called
        dns_called = True
        return ADDRESSES

    monkeypatch.setattr(gong.socket, "getaddrinfo", resolve)
    with pytest.raises(gong.GongArchiveError) as caught:
        transport.open(
            BASE + unsafe_path,
            total_timeout_s=10.0,
            dns_timeout_s=2.0,
            connect_timeout_s=2.0,
            tls_timeout_s=2.0,
            header_timeout_s=2.0,
            read_timeout_s=2.0,
            stall_timeout_s=2.0,
        )
    assert caught.value.code == "unsafe_url"
    assert dns_called is False


@pytest.mark.parametrize("stage", ["dns", "connect", "tls", "header"])
def test_total_deadline_overrides_delayed_production_stage_exception(monkeypatch, stage):
    gong = gong_module()
    clock = Clock()
    sock = AdapterSocket(
        clock=clock,
        connect_elapsed=1.1 if stage == "connect" else 0.0,
        connect_error=OSError("delayed connect failure") if stage == "connect" else None,
    )
    tls = AdapterTlsContext(
        clock=clock,
        elapsed=1.1 if stage == "tls" else 0.0,
        error=OSError("delayed TLS failure") if stage == "tls" else None,
    )
    raw = AdapterRawResponse(
        clock=clock,
        elapsed=0.0,
        header_elapsed=1.1 if stage == "header" else 0.0,
        header_error=(
            gong.http.client.BadStatusLine("delayed bad status")
            if stage == "header"
            else None
        ),
    )
    transport = gong.UrllibGongTransport(clock=clock)
    configure_adapter(transport, sock, raw, tls_context=tls)

    def resolve(*args, **kwargs):
        if stage == "dns":
            clock.advance(1.1)
            raise gong.socket.gaierror(gong.socket.EAI_NONAME, "delayed DNS failure")
        return ADDRESSES

    monkeypatch.setattr(gong.socket, "getaddrinfo", resolve)
    provider = gong.GongArchiveProvider(transport, clock=clock, parser=lambda *a, **k: None)
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"), total_timeout_s=1.0)
    assert caught.value.code == "total_deadline"


def test_total_deadline_overrides_delayed_http_framing_error():
    gong = gong_module()
    clock = Clock()
    directory = day_url("20260925")
    response = Response(
        headers={"Transfer-Encoding": "chunked"},
        clock=clock,
        read_seconds=1.1,
        read_error=gong.http.client.IncompleteRead(b"partial", 1),
    )
    provider = gong.GongArchiveProvider(
        Transport({directory: response}),
        clock=clock,
        parser=lambda *a, **k: None,
    )
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(jd_tdb("2026-09-25T23:05:00"), total_timeout_s=1.0)
    assert caught.value.code == "total_deadline"


def test_bounded_response_classifies_real_http_incomplete_read():
    gong = gong_module()
    clock = Clock()
    raw = AdapterRawResponse(clock=clock, elapsed=0.0)
    raw._body = None
    raw.read = lambda size: (_ for _ in ()).throw(
        gong.http.client.IncompleteRead(b"partial", 1)
    )
    response = gong._BoundedHttpResponse(
        raw,
        clock=clock,
        read_timeout_s=2.0,
        stall_timeout_s=2.0,
    )
    with pytest.raises(gong.GongTransportError) as caught:
        response.read(10)
    assert caught.value.code == "truncated_body"


def test_deadline_after_parser_does_not_commit_cache():
    gong = gong_module()
    clock = Clock()

    def slow_parser(expanded, *, context, limits):
        clock.advance(2.1)
        return context.filename

    provider, _, request, _, _ = acquire_payload(b"fits", clock=clock, parser=slow_parser)
    with pytest.raises(gong.GongArchiveError) as caught:
        provider.acquire(request, total_timeout_s=2.0)
    assert caught.value.code == "total_deadline"
    assert provider.cache_size == 0
