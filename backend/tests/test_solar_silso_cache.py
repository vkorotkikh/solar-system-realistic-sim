from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import threading
import time
from typing import Any

import pytest

import sim.solar_realtime_data as solar_realtime_data
from sim.solar_realtime_data import SolarRealtimeDataProvider, SolarRealtimeFetchError


SILSO_ROW = "2026;08;31;2026.664;  58;  8.1;  33;0\n"
SILSO_LAST_MODIFIED = "Tue, 01 Sep 2026 08:19:28 GMT"


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
        self.closed = False

    def read1(self, size: int = -1) -> bytes:
        if size < 0:
            size = len(self._body) - self._offset
        chunk = self._body[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk

    def read(self, size: int = -1) -> bytes:
        return self.read1(size)

    def geturl(self) -> str:
        return self._url

    def getcode(self) -> int:
        return self.status

    def close(self) -> None:
        self.closed = True


def _install_responses(
    monkeypatch: pytest.MonkeyPatch,
    provider: SolarRealtimeDataProvider,
    responses: list[_Response | BaseException],
) -> list[dict[str, str]]:
    pending = deque(responses)
    request_headers: list[dict[str, str]] = []

    def open_response(request, *, timeout_s: float):
        assert timeout_s > 0.0
        request_headers.append(
            {name.lower(): value for name, value in request.header_items()}
        )
        response = pending.popleft()
        if isinstance(response, BaseException):
            raise response
        return response

    monkeypatch.setattr(provider, "_open_response", open_response)
    return request_headers


def _ok_response(
    provider: SolarRealtimeDataProvider,
    *,
    etag: str = '"silso-v1"',
    last_modified: str = SILSO_LAST_MODIFIED,
) -> _Response:
    body = SILSO_ROW.encode("utf-8")
    return _Response(
        body,
        url=provider.SILSO_DAILY_URL,
        headers={
            "Content-Length": str(len(body)),
            "Content-Type": "text/csv",
            "ETag": etag,
            "Last-Modified": last_modified,
        },
    )


def test_snapshot_force_refresh_does_not_bypass_independent_silso_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=10.0)
    opened = _install_responses(monkeypatch, provider, [_ok_response(provider)])
    monkeypatch.setattr(
        provider,
        "_fetch_swpc",
        lambda: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    monkeypatch.setattr(
        provider,
        "_fetch_sdo_aia",
        lambda _jd: (_ for _ in ()).throw(RuntimeError("offline")),
    )

    first = provider.latest(force_refresh=True)
    second = provider.latest(force_refresh=True)

    assert len(opened) == 1
    assert first["silso"]["daily_sunspot_number"] == 58.0
    assert second["silso"]["daily_sunspot_number"] == 58.0
    assert first["silso"]["acquisition"]["cache_status"] == "refreshed"
    assert second["silso"]["acquisition"]["cache_status"] == "fresh"


def test_silso_revalidates_with_bounded_conditional_headers_and_304(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monotonic_now = [100.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    not_modified = _Response(
        b"",
        url=provider.SILSO_DAILY_URL,
        status=304,
        headers={"ETag": '"silso-v1"', "Last-Modified": SILSO_LAST_MODIFIED},
    )
    headers = _install_responses(
        monkeypatch,
        provider,
        [_ok_response(provider), not_modified],
    )

    first = provider._fetch_silso()
    monotonic_now[0] += 6 * 60 * 60 + 1
    second = provider._fetch_silso()

    assert first["daily_sunspot_number"] == second["daily_sunspot_number"] == 58.0
    assert first["acquisition"]["cache_status"] == "refreshed"
    assert second["acquisition"]["cache_status"] == "revalidated"
    assert "if-none-match" not in headers[0]
    assert "if-modified-since" not in headers[0]
    assert headers[1]["if-none-match"] == '"silso-v1"'
    assert headers[1]["if-modified-since"] == SILSO_LAST_MODIFIED
    assert not_modified.closed is True


def test_silso_rejects_oversized_response_validator_without_retaining_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    response = _ok_response(provider, etag='"' + ("x" * 4_096) + '"')
    _install_responses(monkeypatch, provider, [response])

    with pytest.raises(SolarRealtimeFetchError, match="validator.*byte limit"):
        provider._fetch_silso()

    assert response.closed is True
    assert provider._silso_cache is None


def test_silso_cold_fetch_is_singleflight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    entered = threading.Event()
    release = threading.Event()
    fetch_count = 0

    def open_response(_request, *, timeout_s: float):
        nonlocal fetch_count
        assert timeout_s > 0.0
        fetch_count += 1
        entered.set()
        assert release.wait(timeout=2.0)
        return _ok_response(provider)

    monkeypatch.setattr(provider, "_open_response", open_response)
    results: list[dict[str, Any]] = []
    failures: list[BaseException] = []

    def fetch() -> None:
        try:
            results.append(provider._fetch_silso())
        except BaseException as exc:  # pragma: no cover - diagnostic collection
            failures.append(exc)

    first = threading.Thread(target=fetch)
    second = threading.Thread(target=fetch)
    first.start()
    assert entered.wait(timeout=1.0)
    second.start()
    time.sleep(0.05)
    release.set()
    first.join(timeout=2.0)
    second.join(timeout=2.0)

    assert failures == []
    assert len(results) == 2
    assert fetch_count == 1
    assert {result["daily_sunspot_number"] for result in results} == {58.0}


def test_silso_failure_backoff_serves_lkg_only_within_bounded_age(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monotonic_now = [100.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    opened = _install_responses(
        monkeypatch,
        provider,
        [
            _ok_response(provider),
            TimeoutError("first outage"),
            TimeoutError("outage beyond LKG bound"),
        ],
    )

    provider._fetch_silso()
    monotonic_now[0] += 6 * 60 * 60 + 1
    stale = provider._fetch_silso()
    repeated = provider._fetch_silso()

    assert stale["acquisition"]["cache_status"] == "stale_lkg"
    assert repeated["acquisition"]["cache_status"] == "stale_lkg"
    assert len(opened) == 2

    monotonic_now[0] = 100.0 + 48 * 60 * 60 + 1
    with pytest.raises(RuntimeError, match="SILSO acquisition unavailable"):
        provider._fetch_silso()

    assert len(opened) == 3
    with pytest.raises(RuntimeError, match="SILSO acquisition unavailable"):
        provider._fetch_silso()
    assert len(opened) == 3
