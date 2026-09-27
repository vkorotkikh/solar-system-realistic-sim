from __future__ import annotations

from collections import deque
from datetime import datetime, timedelta, timezone
import threading
import time
from typing import Any

import pytest

import sim.solar_realtime_data as solar_realtime_data
from sim.solar_realtime_data import SolarRealtimeDataProvider, SolarRealtimeFetchError


SILSO_ROW = "2026;08;31;2026.664;  58;  8.1;  33;0\n"
SILSO_NEWER_ROW = "2026;09;30;2026.747;  71;  7.2;  29;0\n"
SILSO_LAST_MODIFIED = "Tue, 01 Sep 2026 08:19:28 GMT"
SILSO_REFERENCE_NOW = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


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
    row: str = SILSO_ROW,
    etag: str = '"silso-v1"',
    last_modified: str = SILSO_LAST_MODIFIED,
) -> _Response:
    body = row.encode("utf-8")
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


def _freeze_silso_clock(
    monkeypatch: pytest.MonkeyPatch,
    provider: SolarRealtimeDataProvider,
) -> None:
    monkeypatch.setattr(provider, "_utc_now", lambda: SILSO_REFERENCE_NOW)


def test_snapshot_force_refresh_does_not_bypass_independent_silso_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=10.0)
    _freeze_silso_clock(monkeypatch, provider)
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


def test_silso_delivery_is_deeply_detached_from_canonical_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
    _install_responses(monkeypatch, provider, [_ok_response(provider)])

    first = provider._fetch_silso()
    retained = provider._silso_cache

    assert retained is not None
    assert first is not retained.value
    assert first["schema"] is not retained.value["schema"]
    assert first["units"] is not retained.value["units"]
    assert first["provenance"] is not retained.value["provenance"]
    assert first["provenance"]["license"] is not retained.value["provenance"]["license"]

    first["schema"]["version"] = 999
    first["units"]["source_age_days"] = "corrupt"
    first["coverage"]["status"] = "corrupt"
    first["provenance"]["license"]["name"] = "corrupt"
    first["provenance"]["license"]["large_marker"] = "x" * 1_000_000

    second = provider._fetch_silso()

    assert second["schema"]["version"] == 2
    assert second["units"]["source_age_days"] == "d"
    assert second["coverage"]["status"] == "current_for_published_coverage"
    assert second["provenance"]["license"] == {
        "name": "CC BY-NC 4.0",
        "url": "https://creativecommons.org/licenses/by-nc/4.0/",
    }
    assert retained.value["schema"]["version"] == 2
    assert retained.value["units"]["source_age_days"] == "d"
    assert retained.value["coverage"]["status"] == "current_for_published_coverage"
    assert retained.value["provenance"]["license"] == {
        "name": "CC BY-NC 4.0",
        "url": "https://creativecommons.org/licenses/by-nc/4.0/",
    }


def test_silso_revalidates_with_bounded_conditional_headers_and_304(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
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


def test_silso_does_not_accept_304_without_a_sent_conditional_validator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
    monotonic_now = [100.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    body = SILSO_ROW.encode("utf-8")
    initial = _Response(
        body,
        url=provider.SILSO_DAILY_URL,
        headers={
            "Content-Length": str(len(body)),
            "Content-Type": "text/csv",
        },
    )
    unsolicited = _Response(
        b"",
        url=provider.SILSO_DAILY_URL,
        status=304,
        headers={"ETag": '"unsolicited"'},
    )
    headers = _install_responses(monkeypatch, provider, [initial, unsolicited])

    provider._fetch_silso()
    retained_before = provider._silso_cache
    monotonic_now[0] += provider.SILSO_REVALIDATE_INTERVAL_S + 1.0
    result = provider._fetch_silso()

    assert result["acquisition"]["cache_status"] == "stale_lkg"
    assert result["acquisition"]["failure_code"] == "http_status"
    assert "if-none-match" not in headers[1]
    assert "if-modified-since" not in headers[1]
    assert provider._silso_cache is retained_before
    assert provider._silso_cache is not None
    assert provider._silso_cache.etag is None
    assert provider._silso_cache.last_modified is None
    assert provider._silso_cache.validated_monotonic == 100.0


def test_silso_rejects_partial_content_without_retaining_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
    body = SILSO_ROW.encode("utf-8")
    partial = _Response(
        body,
        url=provider.SILSO_DAILY_URL,
        status=206,
        headers={
            "Content-Length": str(len(body)),
            "Content-Type": "text/csv",
        },
    )
    _install_responses(monkeypatch, provider, [partial])

    with pytest.raises(SolarRealtimeFetchError) as exc_info:
        provider._fetch_silso()

    assert exc_info.value.code == "http_status"
    assert partial.closed is True
    assert provider._silso_cache is None


def test_silso_rejects_implausibly_future_last_modified_without_retaining_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
    future_last_modified = (
        SILSO_REFERENCE_NOW + timedelta(minutes=6)
    ).strftime("%a, %d %b %Y %H:%M:%S GMT")
    response = _ok_response(provider, last_modified=future_last_modified)
    _install_responses(monkeypatch, provider, [response])

    with pytest.raises(SolarRealtimeFetchError) as exc_info:
        provider._fetch_silso()

    assert exc_info.value.code == "invalid_response_validator"
    assert response.closed is True
    assert provider._silso_cache is None


def test_silso_replays_last_modified_within_clock_skew_tolerance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
    monotonic_now = [100.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    near_future_last_modified = (
        SILSO_REFERENCE_NOW + timedelta(minutes=4)
    ).strftime("%a, %d %b %Y %H:%M:%S GMT")
    body = SILSO_ROW.encode("utf-8")
    response = _Response(
        body,
        url=provider.SILSO_DAILY_URL,
        headers={
            "Content-Length": str(len(body)),
            "Content-Type": "text/csv",
            "Last-Modified": near_future_last_modified,
        },
    )
    not_modified = _Response(
        b"",
        url=provider.SILSO_DAILY_URL,
        status=304,
    )
    headers = _install_responses(monkeypatch, provider, [response, not_modified])

    first = provider._fetch_silso()
    monotonic_now[0] += provider.SILSO_REVALIDATE_INTERVAL_S + 1.0
    second = provider._fetch_silso()

    assert first["acquisition"]["cache_status"] == "refreshed"
    assert second["acquisition"]["cache_status"] == "revalidated"
    assert "if-none-match" not in headers[1]
    assert headers[1]["if-modified-since"] == near_future_last_modified
    assert provider._silso_cache is not None
    assert provider._silso_cache.last_modified == near_future_last_modified


def test_silso_rejects_oversized_response_validator_without_retaining_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
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
    _freeze_silso_clock(monkeypatch, provider)
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
    assert results[0] is not results[1]
    assert results[0]["schema"] is not results[1]["schema"]
    assert results[0]["provenance"] is not results[1]["provenance"]
    assert results[0]["provenance"]["license"] is not results[1]["provenance"]["license"]

    results[0]["schema"]["version"] = 999
    results[0]["provenance"]["license"]["large_marker"] = "x" * 1_000_000

    assert results[1]["schema"]["version"] == 2
    assert "large_marker" not in results[1]["provenance"]["license"]
    assert provider._silso_cache is not None
    assert provider._silso_cache.value["schema"]["version"] == 2
    assert "large_marker" not in provider._silso_cache.value["provenance"]["license"]


def test_silso_singleflight_waiters_share_response_reference_date(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    before_midnight = datetime(2026, 11, 1, 23, 59, 59, tzinfo=timezone.utc)
    after_midnight = datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)
    clock_reads: list[datetime] = []
    clock_lock = threading.Lock()

    def crossing_midnight() -> datetime:
        with clock_lock:
            value = before_midnight if len(clock_reads) < 5 else after_midnight
            clock_reads.append(value)
            return value

    monkeypatch.setattr(provider, "_utc_now", crossing_midnight)
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
    assert {result["source_age_days"] for result in results} == {62}
    assert {result["acquisition"]["cache_status"] for result in results} == {
        "refreshed"
    }
    assert results[0] is not results[1]
    assert results[0]["coverage"] is not results[1]["coverage"]
    assert clock_reads == [before_midnight] * 4


def test_silso_failure_backoff_serves_lkg_only_within_bounded_age(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
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


def test_silso_parser_rejects_invalid_calendar_and_current_month_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
    text = "\n".join(
        (
            "2026;07;31;2026.579;  41;  7.0;  20;1",
            "2026;08;31;2026.664;  58;  8.1;  33;0",
            "2026;02;30;2026.164; 999;  1.0;  99;1",
            "2026;09;01;2026.667; 888;  1.0;  99;0",
        )
    )

    result = provider._parse_silso_document(text)

    assert result["date"] == "2026-08-31"
    assert result["daily_sunspot_number"] == 58.0


@pytest.mark.parametrize(
    "row",
    (
        "2026;02;30;2026.164; 58; 8.1; 33;0",
        "2026;09;01;2026.667; 58; 8.1; 33;0",
        "2026;05;31;2026.414; 58; 8.1; 33;0",
        "2026;08;31;2026.001; 58; 8.1; 33;0",
        "2026;08;31;2026.664; 58; 8.1; 33;9",
    ),
)
def test_silso_parser_fails_closed_without_a_temporally_valid_row(
    monkeypatch: pytest.MonkeyPatch,
    row: str,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)

    with pytest.raises(RuntimeError, match="no valid sunspot rows"):
        provider._parse_silso_document(row)


def test_silso_discloses_monthly_coverage_age_units_and_official_provenance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)

    result = provider._parse_silso_document(SILSO_ROW)

    assert result["source_age_days"] == 26
    assert result["coverage"] == {
        "policy": "through_last_elapsed_month",
        "latest_expected_date": "2026-08-31",
        "status": "current_for_published_coverage",
    }
    assert result["observation_cadence"] == "P1D"
    assert result["publication_cadence"] == "P1M"
    assert result["quality_status"] == "provisional"
    assert result["realtime_eligible"] is False
    assert result["activity_proxy"] is None
    assert result["units"] == {
        "daily_sunspot_number": "1 (dimensionless relative index)",
        "stdev": "1 (sunspot-number standard deviation)",
        "observation_count": "count",
        "source_age_days": "d",
    }
    assert result["provenance"] == {
        "provider": "WDC-SILSO, Royal Observatory of Belgium, Brussels",
        "dataset": "Daily total sunspot number, version 2.0",
        "endpoint": provider.SILSO_DAILY_URL,
        "doi": "https://doi.org/10.24414/qnza-ac80",
        "license": {
            "name": "CC BY-NC 4.0",
            "url": "https://creativecommons.org/licenses/by-nc/4.0/",
        },
    }
    capability = provider.capabilities()["sources"]["silso"]
    assert capability["coverage_policy"] == "through_last_elapsed_month"
    assert capability["maximum_source_age_days"] == 62
    assert capability["realtime_eligible"] is False
    assert capability["provenance"] == result["provenance"]


def test_silso_cached_record_recomputes_source_age_and_monthly_coverage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    utc_now = [datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc)]
    monkeypatch.setattr(provider, "_utc_now", lambda: utc_now[0])
    _install_responses(monkeypatch, provider, [_ok_response(provider)])

    september = provider._fetch_silso()
    utc_now[0] = datetime(2026, 10, 1, 0, 1, tzinfo=timezone.utc)
    october = provider._fetch_silso()

    assert september["source_age_days"] == 30
    assert september["coverage"]["latest_expected_date"] == "2026-08-31"
    assert september["coverage"]["status"] == "current_for_published_coverage"
    assert october["source_age_days"] == 31
    assert october["coverage"]["latest_expected_date"] == "2026-09-30"
    assert october["coverage"]["status"] == "lagging_within_age_bound"
    assert october["acquisition"]["cache_status"] == "fresh"


def test_transport_fresh_silso_refreshes_after_scientific_age_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    utc_now = [datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)]
    monotonic_now = [100.0]
    monkeypatch.setattr(provider, "_utc_now", lambda: utc_now[0])
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
            _ok_response(provider, row=SILSO_NEWER_ROW, etag='"silso-v2"'),
        ],
    )

    boundary = provider._fetch_silso()
    utc_now[0] = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)
    monotonic_now[0] += 1.0
    refreshed = provider._fetch_silso()

    assert boundary["source_age_days"] == 62
    assert refreshed["date"] == "2026-09-30"
    assert refreshed["source_age_days"] == 33
    assert refreshed["daily_sunspot_number"] == 71.0
    assert refreshed["acquisition"]["cache_status"] == "refreshed"
    assert len(opened) == 2


def test_transport_fresh_silso_uses_one_reference_date_at_midnight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    before_midnight = datetime(2026, 11, 1, 23, 59, 59, tzinfo=timezone.utc)
    after_midnight = datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(provider, "_utc_now", lambda: before_midnight)
    opened = _install_responses(monkeypatch, provider, [_ok_response(provider)])

    provider._fetch_silso()
    clock_values = deque((before_midnight, after_midnight))
    clock_reads: list[datetime] = []

    def crossing_midnight() -> datetime:
        value = clock_values.popleft()
        clock_reads.append(value)
        return value

    monkeypatch.setattr(provider, "_utc_now", crossing_midnight)

    cached = provider._fetch_silso()

    assert cached["source_age_days"] == 62
    assert cached["acquisition"]["cache_status"] == "fresh"
    assert len(opened) == 1
    assert clock_reads == [before_midnight]


def test_scientifically_expired_silso_is_not_lkg_after_refresh_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    utc_now = [datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)]
    monotonic_now = [100.0]
    monkeypatch.setattr(provider, "_utc_now", lambda: utc_now[0])
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    opened = _install_responses(
        monkeypatch,
        provider,
        [_ok_response(provider), TimeoutError("secret timeout detail")],
    )

    provider._fetch_silso()
    retained = provider._silso_cache
    assert retained is not None
    utc_now[0] = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)
    monotonic_now[0] += 1.0

    with pytest.raises(RuntimeError, match="^SILSO acquisition unavailable$"):
        provider._fetch_silso()
    with pytest.raises(RuntimeError, match="^SILSO acquisition unavailable$"):
        provider._fetch_silso()

    assert len(opened) == 2
    assert provider._silso_cache is retained
    assert provider._silso_cache.validated_monotonic == 100.0
    failure = provider._silso_failure
    assert failure is not None
    assert not isinstance(failure, BaseException)
    assert failure.code == "upstream_timeout"
    assert failure.detail == "Solar realtime upstream acquisition timed out"
    assert "secret" not in failure.detail
    assert failure.expires_monotonic == 401.0


def test_silso_timeout_waiters_use_failure_date_for_lkg_at_midnight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    before_midnight = datetime(2026, 11, 1, 23, 59, 59, tzinfo=timezone.utc)
    after_midnight = datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)
    monotonic_now = [100.0]
    monkeypatch.setattr(provider, "_utc_now", lambda: before_midnight)
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    _install_responses(monkeypatch, provider, [_ok_response(provider)])
    provider._fetch_silso()
    retained = provider._silso_cache
    assert retained is not None

    monotonic_now[0] += provider.SILSO_REVALIDATE_INTERVAL_S + 1.0
    clock_reads: list[datetime] = []
    clock_lock = threading.Lock()

    def crossing_midnight() -> datetime:
        with clock_lock:
            value = before_midnight if len(clock_reads) < 2 else after_midnight
            clock_reads.append(value)
            return value

    monkeypatch.setattr(provider, "_utc_now", crossing_midnight)
    entered = threading.Event()
    release = threading.Event()
    request_count = 0

    def timeout_response(_request, *, timeout_s: float):
        nonlocal request_count
        assert timeout_s > 0.0
        request_count += 1
        entered.set()
        assert release.wait(timeout=2.0)
        raise TimeoutError("secret midnight timeout")

    monkeypatch.setattr(provider, "_open_response", timeout_response)
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

    assert results == []
    assert len(failures) == 2
    assert all(
        isinstance(failure, RuntimeError)
        and str(failure) == "SILSO acquisition unavailable"
        for failure in failures
    )
    assert request_count == 1
    assert clock_reads == [
        before_midnight,
        before_midnight,
        after_midnight,
        after_midnight,
    ]
    assert provider._silso_cache is retained
    assert provider._silso_cache.validated_monotonic == 100.0
    assert provider._silso_failure is not None
    assert provider._silso_failure.code == "upstream_timeout"

    monkeypatch.setattr(provider, "_utc_now", lambda: after_midnight)
    with pytest.raises(RuntimeError, match="^SILSO acquisition unavailable$"):
        provider._fetch_silso()
    assert request_count == 1


def test_scientifically_expired_silso_304_is_not_published_or_retried(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    utc_now = [datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)]
    monotonic_now = [100.0]
    monkeypatch.setattr(provider, "_utc_now", lambda: utc_now[0])
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
    opened = _install_responses(
        monkeypatch,
        provider,
        [_ok_response(provider), not_modified],
    )

    provider._fetch_silso()
    retained = provider._silso_cache
    assert retained is not None
    utc_now[0] = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)
    monotonic_now[0] += 1.0

    with pytest.raises(RuntimeError, match="^SILSO acquisition unavailable$"):
        provider._fetch_silso()

    assert len(opened) == 2
    assert provider._silso_cache is retained
    assert provider._silso_cache.validated_monotonic == 100.0
    assert provider._silso_cache.expires_monotonic == 21_700.0
    failure = provider._silso_failure
    assert failure is not None
    assert not isinstance(failure, BaseException)
    assert failure.code == "upstream_failure"
    assert failure.detail == "Solar realtime upstream acquisition failed"
    assert failure.expires_monotonic == 401.0

    with pytest.raises(RuntimeError, match="^SILSO acquisition unavailable$"):
        provider._fetch_silso()
    assert len(opened) == 2


def test_rejected_silso_304_uses_failure_date_for_lkg_at_midnight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    before_midnight = datetime(2026, 11, 1, 23, 59, 59, tzinfo=timezone.utc)
    after_midnight = datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)
    monotonic_now = [100.0]
    monkeypatch.setattr(provider, "_utc_now", lambda: before_midnight)
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
    opened = _install_responses(
        monkeypatch,
        provider,
        [_ok_response(provider), not_modified],
    )

    provider._fetch_silso()
    retained = provider._silso_cache
    assert retained is not None
    monotonic_now[0] += provider.SILSO_REVALIDATE_INTERVAL_S + 1.0
    clock_values = deque(
        (before_midnight, before_midnight, after_midnight, after_midnight)
    )
    clock_reads: list[datetime] = []

    def crossing_midnight() -> datetime:
        value = clock_values.popleft()
        clock_reads.append(value)
        return value

    monkeypatch.setattr(provider, "_utc_now", crossing_midnight)

    with pytest.raises(RuntimeError, match="^SILSO acquisition unavailable$"):
        provider._fetch_silso()

    assert len(opened) == 2
    assert clock_reads == [
        before_midnight,
        before_midnight,
        after_midnight,
        after_midnight,
    ]
    assert provider._silso_cache is retained
    assert provider._silso_cache.validated_monotonic == 100.0
    assert provider._silso_failure is not None
    assert provider._silso_failure.code == "upstream_failure"

    monkeypatch.setattr(provider, "_utc_now", lambda: after_midnight)
    with pytest.raises(RuntimeError, match="^SILSO acquisition unavailable$"):
        provider._fetch_silso()
    assert len(opened) == 2


def test_silso_304_uses_one_response_reference_date_at_midnight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    before_midnight = datetime(2026, 11, 1, 23, 59, 59, tzinfo=timezone.utc)
    after_midnight = datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)
    monotonic_now = [100.0]
    monkeypatch.setattr(provider, "_utc_now", lambda: before_midnight)
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
    opened = _install_responses(
        monkeypatch,
        provider,
        [_ok_response(provider), not_modified],
    )

    provider._fetch_silso()
    retained = provider._silso_cache
    assert retained is not None
    monotonic_now[0] += provider.SILSO_REVALIDATE_INTERVAL_S + 1.0
    clock_values = deque(
        (before_midnight, before_midnight, before_midnight, after_midnight)
    )
    clock_reads: list[datetime] = []

    def crossing_midnight() -> datetime:
        value = clock_values.popleft()
        clock_reads.append(value)
        return value

    monkeypatch.setattr(provider, "_utc_now", crossing_midnight)

    revalidated = provider._fetch_silso()

    assert revalidated["source_age_days"] == 62
    assert revalidated["acquisition"]["cache_status"] == "revalidated"
    assert len(opened) == 2
    assert provider._silso_cache is not retained
    assert provider._silso_cache is not None
    assert provider._silso_cache.validated_monotonic == 21_701.0
    assert provider._silso_failure is None
    assert clock_reads == [before_midnight, before_midnight, before_midnight]


def test_lagged_silso_is_excluded_from_realtime_activity_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    _freeze_silso_clock(monkeypatch, provider)
    silso = provider._parse_silso_document(SILSO_ROW)
    monkeypatch.setattr(
        provider,
        "_fetch_silso",
        lambda: silso,
    )
    monkeypatch.setattr(
        provider,
        "_fetch_sdo_aia",
        lambda _jd: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    monkeypatch.setattr(
        provider,
        "_fetch_swpc",
        lambda: {"time_tag": "2026-09-26T12:00:00Z", "activity_proxy": 0.2},
    )

    with_swpc = provider._fetch_snapshot(None)
    assert with_swpc["combined_activity_proxy"] == pytest.approx(0.2)
    assert with_swpc["source_status"]["silso"]["realtime_eligible"] is False

    monkeypatch.setattr(
        provider,
        "_fetch_swpc",
        lambda: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    without_swpc = provider._fetch_snapshot(None)
    assert without_swpc["combined_activity_proxy"] is None
