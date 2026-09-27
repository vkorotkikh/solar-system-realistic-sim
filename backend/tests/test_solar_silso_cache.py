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
