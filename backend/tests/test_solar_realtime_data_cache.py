from __future__ import annotations

from datetime import datetime, timedelta, timezone
import gc
from collections.abc import Callable
from types import SimpleNamespace
from typing import Any
import weakref

import pytest

import sim.solar_realtime_data as solar_realtime_data
from sim.solar_realtime_data import SolarRealtimeDataProvider, SolarRealtimeFetchError


def _recording_provider(
    *, max_entries: int = 16
) -> tuple[SolarRealtimeDataProvider, list[float | None]]:
    provider = SolarRealtimeDataProvider(snapshot_cache_max_entries=max_entries)
    requests: list[float | None] = []

    def fetch_snapshot(jd: float | None) -> dict[str, Any]:
        requests.append(jd)
        return {"requested_jd": jd, "fetch_number": len(requests)}

    provider._fetch_snapshot = fetch_snapshot  # type: ignore[method-assign]
    return provider, requests


def test_snapshot_cache_isolated_by_requested_julian_date() -> None:
    provider, requests = _recording_provider()

    first = provider.latest(jd_tdb=2_460_000.5)
    second = provider.latest(jd_tdb=2_460_001.5)

    assert first["requested_jd"] == 2_460_000.5
    assert second["requested_jd"] == 2_460_001.5
    assert requests == [2_460_000.5, 2_460_001.5]


def test_latest_and_explicit_epoch_have_distinct_cache_identities() -> None:
    provider, requests = _recording_provider()

    current = provider.latest()
    historical = provider.latest(jd_tdb=2_460_000.5)
    current_again = provider.latest()

    assert current == current_again
    assert current is not current_again
    assert current["requested_jd"] is None
    assert historical["requested_jd"] == 2_460_000.5
    assert requests == [None, 2_460_000.5]


def test_provider_accepts_equal_legacy_jd_alias_and_reuses_canonical_cache() -> None:
    provider, requests = _recording_provider()

    legacy = provider.latest(jd=2_460_000.5)
    both = provider.latest(jd_tdb=2_460_000.5, jd=2_460_000.5)

    assert legacy == both
    assert legacy is not both
    assert requests == [2_460_000.5]


def test_provider_rejects_conflicting_epoch_aliases_before_fetch() -> None:
    provider, requests = _recording_provider()

    with pytest.raises(ValueError, match="same JDTDB epoch"):
        provider.latest(jd_tdb=2_460_000.5, jd=2_460_001.5)

    assert requests == []


def test_same_epoch_reuses_snapshot_until_refresh() -> None:
    provider, requests = _recording_provider()

    first = provider.latest(jd_tdb=2_460_000.5)
    cached = provider.latest(jd_tdb=2_460_000.5)
    refreshed = provider.latest(jd_tdb=2_460_000.5, force_refresh=True)

    assert cached == first
    assert cached is not first
    assert refreshed["fetch_number"] == 2
    assert requests == [2_460_000.5, 2_460_000.5]


def test_snapshot_cache_deliveries_are_deeply_detached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    fetches = 0
    monkeypatch.setattr(
        provider,
        "_utc_now",
        lambda: datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc),
    )

    def fetch_snapshot(_jd: float | None) -> dict[str, Any]:
        nonlocal fetches
        fetches += 1
        return {
            "schema": {"name": "solar_realtime_snapshot", "version": 1},
            "source_status": {
                "silso": {
                    "ok": True,
                    "coverage": {"status": "current_for_published_coverage"},
                },
            },
            "silso": {
                "date": "2026-08-31",
                "units": {"source_age_days": "d"},
                "provenance": {
                    "license": {"name": "CC BY-NC 4.0"},
                },
            },
        }

    monkeypatch.setattr(provider, "_fetch_snapshot", fetch_snapshot)

    first = provider.latest()
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]

    assert first is not retained
    assert first["silso"] is not retained["silso"]
    assert first["silso"]["provenance"] is not retained["silso"]["provenance"]

    first["schema"]["version"] = 999
    first["source_status"]["silso"]["coverage"]["status"] = "corrupt"
    first["silso"]["units"]["source_age_days"] = "corrupt"
    first["silso"]["provenance"]["license"]["name"] = "corrupt"
    first["silso"]["provenance"]["license"]["large_marker"] = "x" * 1_000_000

    second = provider.latest()

    assert fetches == 1
    assert second["schema"]["version"] == 1
    assert (
        second["source_status"]["silso"]["coverage"]["status"]
        == "current_for_published_coverage"
    )
    assert second["silso"]["units"]["source_age_days"] == "d"
    assert second["silso"]["provenance"]["license"] == {
        "name": "CC BY-NC 4.0",
    }
    assert retained["schema"]["version"] == 1
    assert (
        retained["source_status"]["silso"]["coverage"]["status"]
        == "current_for_published_coverage"
    )
    assert retained["silso"]["units"]["source_age_days"] == "d"
    assert retained["silso"]["provenance"]["license"] == {
        "name": "CC BY-NC 4.0",
    }


def test_cached_silso_delivery_recomputes_wall_utc_metadata_without_swpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=300.0)
    wall_now = [datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc)]
    fetches = 0
    monkeypatch.setattr(provider, "_utc_now", lambda: wall_now[0])

    def fetch_snapshot(jd_tdb: float | None) -> dict[str, Any]:
        nonlocal fetches
        fetches += 1
        return {
            "requested_jd_tdb": jd_tdb,
            "source_status": {
                "swpc": {"ok": False, "error": "offline"},
                "silso": {"ok": True, "updated": "2026-08-31"},
            },
            "swpc": None,
            "silso": {
                "date": "2026-08-31",
                "source_age_days": 999,
                "coverage": {"status": "stale-at-fetch"},
            },
        }

    monkeypatch.setattr(provider, "_fetch_snapshot", fetch_snapshot)

    september = provider.latest(jd_tdb=2_400_000.5)
    retained = provider._snapshot_cache[("snapshot", "jd_tdb", 2_400_000.5)][1]
    wall_now[0] = datetime(2026, 10, 1, 0, 1, tzinfo=timezone.utc)
    october = provider.latest(jd_tdb=2_400_000.5)

    assert september["silso"]["source_age_days"] == 30
    assert september["silso"]["coverage"] == {
        "policy": "through_last_elapsed_month",
        "latest_expected_date": "2026-08-31",
        "status": "current_for_published_coverage",
    }
    assert october["silso"]["source_age_days"] == 31
    assert october["silso"]["coverage"] == {
        "policy": "through_last_elapsed_month",
        "latest_expected_date": "2026-09-30",
        "status": "lagging_within_age_bound",
    }
    assert october["requested_jd_tdb"] == 2_400_000.5
    assert fetches == 1
    assert retained["silso"]["source_age_days"] == 999
    assert retained["silso"]["coverage"] == {"status": "stale-at-fetch"}


def test_silso_delivery_synchronizes_source_status_and_delivery_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=300.0)
    wall_now = [datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc)]
    fetches = 0
    monkeypatch.setattr(provider, "_utc_now", lambda: wall_now[0])

    def fetch_snapshot(_jd_tdb: float | None) -> dict[str, Any]:
        nonlocal fetches
        fetches += 1
        return {
            "source_status": {
                "swpc": {"ok": False, "error": "offline"},
                "silso": {
                    "ok": True,
                    "updated": "2026-08-31",
                    "source_age_days": 999,
                    "coverage": {"status": "stale-at-fetch"},
                },
            },
            "swpc": None,
            "silso": {"date": "2026-08-31"},
        }

    monkeypatch.setattr(provider, "_fetch_snapshot", fetch_snapshot)

    first = provider.latest()
    wall_now[0] = datetime(2026, 10, 1, 0, 1, tzinfo=timezone.utc)
    second = provider.latest()

    assert first["source_status"]["silso"]["updated"] == "2026-08-31"
    assert first["source_status"]["silso"]["source_age_days"] == 30
    assert first["source_status"]["silso"]["coverage"] == first["silso"]["coverage"]
    assert (
        first["source_status"]["silso"]["delivered_at_utc"]
        == "2026-09-30T23:59:00Z"
    )
    assert second["source_status"]["silso"]["updated"] == "2026-08-31"
    assert second["source_status"]["silso"]["source_age_days"] == 31
    assert second["source_status"]["silso"]["coverage"] == second["silso"]["coverage"]
    assert (
        second["source_status"]["silso"]["delivered_at_utc"]
        == "2026-10-01T00:01:00Z"
    )
    assert fetches == 1


def test_silso_delivery_fails_closed_after_62_days_without_refetch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=300.0)
    wall_now = [datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)]
    fetches = 0
    monkeypatch.setattr(provider, "_utc_now", lambda: wall_now[0])

    def fetch_snapshot(_jd_tdb: float | None) -> dict[str, Any]:
        nonlocal fetches
        fetches += 1
        return {
            "source_status": {
                "swpc": {"ok": False, "error": "offline"},
                "silso": {"ok": True, "updated": "2026-08-31"},
            },
            "swpc": None,
            "silso": {"date": "2026-08-31", "source_age_days": 62},
        }

    monkeypatch.setattr(provider, "_fetch_snapshot", fetch_snapshot)

    boundary = provider.latest()
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]
    wall_now[0] = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)
    expired = provider.latest()

    assert boundary["silso"]["source_age_days"] == 62
    assert expired["silso"] is None
    assert expired["source_status"]["silso"] == {
        "ok": False,
        "updated": "2026-08-31",
        "reason": "outside_source_age_bound",
        "source_age_days": 63,
        "coverage": {
            "policy": "through_last_elapsed_month",
            "latest_expected_date": "2026-10-31",
            "status": "outside_age_bound",
        },
        "delivered_at_utc": "2026-11-02T12:00:00Z",
    }
    assert fetches == 1
    assert retained["silso"] == {"date": "2026-08-31", "source_age_days": 62}
    assert retained["source_status"]["silso"] == {
        "ok": True,
        "updated": "2026-08-31",
    }


@pytest.mark.parametrize(
    ("silso", "reason", "expected_age"),
    (
        ({}, "invalid_delivery_date", None),
        ({"date": 20260831}, "invalid_delivery_date", None),
        ({"date": "not-a-date"}, "invalid_delivery_date", None),
        ({"date": "20260831"}, "invalid_delivery_date", None),
        ({"date": "2026-W36-1"}, "invalid_delivery_date", None),
        ({"date": "2026-09-01"}, "outside_published_coverage", 25),
        ({"date": "2026-10-01"}, "outside_published_coverage", None),
    ),
)
def test_silso_delivery_fails_closed_for_invalid_or_unpublished_dates(
    monkeypatch: pytest.MonkeyPatch,
    silso: dict[str, Any],
    reason: str,
    expected_age: int | None,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=300.0)
    delivered_at = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)
    fetches = 0
    monkeypatch.setattr(provider, "_utc_now", lambda: delivered_at)

    def fetch_snapshot(_jd_tdb: float | None) -> dict[str, Any]:
        nonlocal fetches
        fetches += 1
        return {
            "source_status": {
                "swpc": {"ok": False, "error": "offline"},
                "silso": {"ok": True, "updated": silso.get("date")},
            },
            "swpc": None,
            "silso": silso,
        }

    monkeypatch.setattr(provider, "_fetch_snapshot", fetch_snapshot)

    delivered = provider.latest()
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]

    assert delivered["silso"] is None
    assert delivered["source_status"]["silso"]["ok"] is False
    assert delivered["source_status"]["silso"]["reason"] == reason
    assert (
        delivered["source_status"]["silso"]["delivered_at_utc"]
        == "2026-09-26T12:00:00Z"
    )
    if expected_age is None:
        assert "source_age_days" not in delivered["source_status"]["silso"]
    else:
        assert delivered["source_status"]["silso"]["source_age_days"] == expected_age
        assert delivered["source_status"]["silso"]["coverage"] == {
            "policy": "through_last_elapsed_month",
            "latest_expected_date": "2026-08-31",
            "status": "outside_published_coverage",
        }
    assert fetches == 1
    assert retained["silso"] == silso


@pytest.mark.parametrize(
    ("include_silso", "silso_value"),
    (
        (False, None),
        (True, None),
        (True, "not-a-record"),
        (True, ["not", "a", "record"]),
    ),
)
def test_silso_delivery_normalizes_absent_payload_that_claims_success(
    monkeypatch: pytest.MonkeyPatch,
    include_silso: bool,
    silso_value: Any,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=300.0)
    delivered_at = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(provider, "_utc_now", lambda: delivered_at)

    def fetch_snapshot(_jd_tdb: float | None) -> dict[str, Any]:
        snapshot: dict[str, Any] = {
            "source_status": {
                "swpc": {"ok": False, "error": "offline"},
                "silso": {
                    "ok": True,
                    "updated": "2026-08-31",
                    "endpoint": provider.SILSO_DAILY_URL,
                    "source_age_days": 26,
                    "coverage": {"status": "current_for_published_coverage"},
                },
            },
            "swpc": None,
        }
        if include_silso:
            snapshot["silso"] = silso_value
        return snapshot

    monkeypatch.setattr(provider, "_fetch_snapshot", fetch_snapshot)

    delivered = provider.latest()
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]

    assert delivered["silso"] is None
    assert delivered["source_status"]["silso"] == {
        "ok": False,
        "updated": None,
        "endpoint": provider.SILSO_DAILY_URL,
        "reason": "invalid_delivery_date",
        "delivered_at_utc": "2026-09-26T12:00:00Z",
    }
    assert retained["source_status"]["silso"]["ok"] is True
    assert retained["source_status"]["silso"]["source_age_days"] == 26
    if include_silso:
        assert retained["silso"] == silso_value
    else:
        assert "silso" not in retained


def test_silso_delivery_preserves_legitimate_unavailable_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=300.0)
    monkeypatch.setattr(
        provider,
        "_utc_now",
        lambda: datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc),
    )
    diagnostic = {
        "ok": False,
        "updated": "2026-08-31",
        "reason": "outside_source_age_bound",
        "source_age_days": 63,
        "coverage": {
            "policy": "through_last_elapsed_month",
            "latest_expected_date": "2026-10-31",
            "status": "outside_age_bound",
        },
        "delivered_at_utc": "2026-11-02T11:59:00Z",
    }
    monkeypatch.setattr(
        provider,
        "_fetch_snapshot",
        lambda _jd_tdb: {
            "source_status": {
                "swpc": {"ok": False, "error": "offline"},
                "silso": diagnostic,
            },
            "swpc": None,
            "silso": None,
        },
    )

    delivered = provider.latest()
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]

    assert delivered["silso"] is None
    assert delivered["source_status"]["silso"] == diagnostic
    assert retained["source_status"]["silso"] == diagnostic


def test_snapshot_cache_updates_swpc_age_and_expires_at_source_freshness(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(cache_ttl_s=300.0)
    monotonic_now = [100.0]
    wall_now = [datetime(2026, 9, 26, 23, 0, tzinfo=timezone.utc)]
    fetches = 0
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    monkeypatch.setattr(provider, "_utc_now", lambda: wall_now[0])

    def fetch_snapshot(_jd: float | None) -> dict[str, Any]:
        nonlocal fetches
        fetches += 1
        sample_time = wall_now[0] - timedelta(seconds=800)
        time_tag = sample_time.isoformat().replace("+00:00", "Z")
        return {
            "fetched_at_utc": wall_now[0].isoformat().replace("+00:00", "Z"),
            "source_status": {
                "swpc": {"ok": True, "updated": time_tag},
            },
            "swpc": {
                "time_tag": time_tag,
                "wind_time_tag": time_tag,
                "mag_time_tag": time_tag,
                "retrieved_at_utc": wall_now[0].isoformat().replace("+00:00", "Z"),
                "age_s": 800.0,
                "wind_age_s": 800.0,
                "mag_age_s": 800.0,
                "activity_proxy": 0.2,
            },
            "combined_activity_proxy": 0.2,
            "fetch_number": fetches,
        }

    monkeypatch.setattr(provider, "_fetch_snapshot", fetch_snapshot)

    initial = provider.latest()
    monotonic_now[0] += 99.0
    wall_now[0] += timedelta(seconds=99)
    cached = provider.latest()
    monotonic_now[0] += 2.0
    wall_now[0] += timedelta(seconds=2)
    refreshed = provider.latest()

    assert initial["swpc"]["age_s"] == 800.0
    assert cached["swpc"]["age_s"] == 899.0
    assert cached["source_status"]["swpc"]["age_s"] == 899.0
    assert cached["swpc"]["delivered_at_utc"] == "2026-09-26T23:01:39Z"
    assert refreshed["fetch_number"] == 2
    assert refreshed["swpc"]["age_s"] == 800.0
    assert fetches == 2


def test_snapshot_delivery_fails_closed_for_unparseable_claimed_current_swpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(
        provider,
        "_utc_now",
        lambda: datetime(2026, 9, 26, 23, 0, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(
        provider,
        "_fetch_snapshot",
        lambda _jd: {
            "source_status": {"swpc": {"ok": True, "updated": "not-a-time"}},
            "swpc": {
                "time_tag": "not-a-time",
                "activity_proxy": 0.7,
            },
            "combined_activity_proxy": 0.7,
        },
    )

    delivered = provider.latest()

    assert delivered["swpc"] is None
    assert delivered["combined_activity_proxy"] is None
    assert delivered["source_status"]["swpc"]["ok"] is False
    assert delivered["source_status"]["swpc"]["error"] == (
        "NOAA SWPC RTSW component timestamps are invalid at delivery"
    )
    assert provider._snapshot_cache == {}


def test_snapshot_cache_is_bounded_and_uses_lru_eviction() -> None:
    provider, requests = _recording_provider(max_entries=2)

    provider.latest(jd_tdb=1.0)
    provider.latest(jd_tdb=2.0)
    provider.latest(jd_tdb=1.0)  # Make JD 1 the most-recently used entry.
    provider.latest(jd_tdb=3.0)  # Evicts JD 2.
    provider.latest(jd_tdb=2.0)

    assert requests == [1.0, 2.0, 3.0, 2.0]
    assert len(provider._snapshot_cache) == 2


def test_singleflight_failure_backoff_is_bounded_and_uses_lru_eviction() -> None:
    provider = SolarRealtimeDataProvider(singleflight_failure_max_entries=2)
    provider.singleflight_error_backoff_s = 60.0
    attempts: list[str] = []

    def fail(name: str) -> None:
        attempts.append(name)
        raise RuntimeError(f"failed-{name}")

    for name in ("a", "b"):
        with pytest.raises(RuntimeError, match="upstream acquisition failed"):
            provider._singleflight_fetch(name, lambda name=name: fail(name))

    # A cached read makes ``a`` the most-recently used failure without
    # executing the replacement callable.
    with pytest.raises(RuntimeError, match="upstream acquisition failed"):
        provider._singleflight_fetch(
            "a",
            lambda: pytest.fail("cached failure unexpectedly refetched"),
        )

    with pytest.raises(RuntimeError, match="upstream acquisition failed"):
        provider._singleflight_fetch("c", lambda: fail("c"))

    assert provider._singleflight_fetch("b", lambda: "recovered-b") == "recovered-b"
    with pytest.raises(RuntimeError, match="upstream acquisition failed"):
        provider._singleflight_fetch(
            "a",
            lambda: pytest.fail("LRU failure unexpectedly evicted"),
        )
    assert attempts == ["a", "b", "c"]
    assert len(provider._inflight_failures) == 2


def test_singleflight_failure_backoff_prunes_expired_entries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(singleflight_failure_max_entries=8)
    provider.singleflight_error_backoff_s = 4.5
    monotonic_now = [100.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )

    for name in ("expired-a", "expired-b"):
        with pytest.raises(RuntimeError, match="upstream acquisition failed"):
            provider._singleflight_fetch(
                name,
                lambda name=name: (_ for _ in ()).throw(RuntimeError(name)),
            )

    monotonic_now[0] = 105.0
    with pytest.raises(RuntimeError, match="upstream acquisition failed"):
        provider._singleflight_fetch(
            "current",
            lambda: (_ for _ in ()).throw(RuntimeError("current")),
        )

    assert list(provider._inflight_failures) == ["current"]


def test_singleflight_failure_backoff_drops_exception_graph_and_raises_fresh_error() -> None:
    class RetainedBody:
        pass

    provider = SolarRealtimeDataProvider()
    provider.singleflight_error_backoff_s = 60.0
    retained_body = RetainedBody()
    retained_body_ref = weakref.ref(retained_body)

    def fail_with_body() -> None:
        error = RuntimeError("secret upstream body must not be cached")
        error.retained_body = retained_body  # type: ignore[attr-defined]
        raise error

    with pytest.raises(
        RuntimeError,
        match="^Solar realtime upstream acquisition failed$",
    ) as first_failure:
        provider._singleflight_fetch("sensitive", fail_with_body)

    del retained_body
    gc.collect()

    assert retained_body_ref() is None
    cached = provider._inflight_failures["sensitive"]
    assert not isinstance(cached, BaseException)

    with pytest.raises(
        RuntimeError,
        match="^Solar realtime upstream acquisition failed$",
    ) as second_failure:
        provider._singleflight_fetch(
            "sensitive",
            lambda: pytest.fail("cached failure unexpectedly refetched"),
        )

    assert second_failure.value is not first_failure.value
    assert "secret upstream body" not in str(second_failure.value)


def test_singleflight_known_fetch_failure_keeps_only_sanitized_code() -> None:
    provider = SolarRealtimeDataProvider()
    provider.singleflight_error_backoff_s = 60.0

    def fail() -> None:
        raise SolarRealtimeFetchError(
            "response_byte_limit",
            "Solar realtime response exceeds its byte limit: secret-body",
        )

    with pytest.raises(SolarRealtimeFetchError) as first_failure:
        provider._singleflight_fetch("known", fail)
    with pytest.raises(SolarRealtimeFetchError) as second_failure:
        provider._singleflight_fetch(
            "known",
            lambda: pytest.fail("cached failure unexpectedly refetched"),
        )

    assert first_failure.value is not second_failure.value
    assert first_failure.value.code == second_failure.value.code == "response_byte_limit"
    assert first_failure.value.detail == second_failure.value.detail == (
        "Solar realtime response exceeds its byte limit"
    )
    assert "secret-body" not in str(first_failure.value)


def test_aia_png_cache_enforces_byte_budget_with_lru_eviction(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
) -> None:
    fetches: list[str] = []
    urls = [
        f"{SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL}?id={image_id}"
        for image_id in (1, 2, 3)
    ]
    payload = aia_png_header()
    budget = sum(
        SolarRealtimeDataProvider._binary_cache_entry_size(url, payload)
        for url in urls[:2]
    )
    provider = SolarRealtimeDataProvider(binary_cache_max_bytes=budget)

    def fetch_aia_png(url: str) -> tuple[bytes, str]:
        fetches.append(url)
        return payload, "image/png"

    monkeypatch.setattr(provider, "_fetch_aia_png", fetch_aia_png)

    assert provider._fetch_aia_png_cached(urls[0])[0] == payload
    assert provider._fetch_aia_png_cached(urls[1])[0] == payload
    assert provider._fetch_aia_png_cached(urls[0])[0] == payload  # LRU touch.
    assert provider._fetch_aia_png_cached(urls[2])[0] == payload  # Evicts id=2.
    assert provider._fetch_aia_png_cached(urls[1])[0] == payload

    assert fetches == [urls[0], urls[1], urls[2], urls[1]]
    assert provider._binary_cache_bytes <= budget
    assert provider._binary_cache_bytes == sum(
        provider._binary_cache_entry_size(url, entry[1])
        for url, entry in provider._binary_cache.items()
    )


def test_aia_png_entry_larger_than_cache_budget_is_never_retained(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
) -> None:
    fetch_count = 0
    url = f"{SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL}?id=1"
    payload = aia_png_header()
    entry_size = SolarRealtimeDataProvider._binary_cache_entry_size(url, payload)
    provider = SolarRealtimeDataProvider(binary_cache_max_bytes=entry_size - 1)

    def fetch_aia_png(_url: str) -> tuple[bytes, str]:
        nonlocal fetch_count
        fetch_count += 1
        return payload, "image/png"

    monkeypatch.setattr(provider, "_fetch_aia_png", fetch_aia_png)

    assert provider._fetch_aia_png_cached(url)[0] == payload
    assert provider._fetch_aia_png_cached(url)[0] == payload

    assert fetch_count == 2
    assert provider._binary_cache_bytes == 0
    assert len(provider._binary_cache) == 0


def test_aia_png_cache_replacement_subtracts_expired_payload_bytes(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
) -> None:
    monotonic_now = [100.0]
    payloads = iter((aia_png_header(), aia_png_header() + b"trailing"))
    url = f"{SolarRealtimeDataProvider.HELIOVIEWER_TILE_URL}?id=1"
    replacement_size = SolarRealtimeDataProvider._binary_cache_entry_size(
        url,
        aia_png_header() + b"trailing",
    )
    provider = SolarRealtimeDataProvider(binary_cache_max_bytes=replacement_size)
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    monkeypatch.setattr(
        provider,
        "_fetch_aia_png",
        lambda _url: (next(payloads), "image/png"),
    )

    assert provider._fetch_aia_png_cached(url, ttl_s=5.0)[0] == aia_png_header()
    monotonic_now[0] = 106.0
    assert provider._fetch_aia_png_cached(url, ttl_s=5.0)[0] == (
        aia_png_header() + b"trailing"
    )

    assert provider._binary_cache_bytes == replacement_size
    assert len(provider._binary_cache) == 1


def test_aia_png_cache_rejects_megabyte_url_before_cache_or_fetch(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
) -> None:
    provider = SolarRealtimeDataProvider()
    fetches = 0

    def forbidden_fetch(_url: str) -> tuple[bytes, str]:
        nonlocal fetches
        fetches += 1
        return aia_png_header(), "image/png"

    monkeypatch.setattr(provider, "_fetch_aia_png", forbidden_fetch)
    oversized_url = provider.HELIOVIEWER_TILE_URL + "?id=" + ("1" * 1_000_000)

    with pytest.raises(SolarRealtimeFetchError, match="URL.*byte limit"):
        provider._fetch_aia_png_cached(oversized_url)

    assert fetches == 0
    assert provider._binary_cache == {}
    assert provider._binary_cache_bytes == 0
    assert provider._inflight_fetches == {}
    assert provider._inflight_failures == {}


def test_aia_png_cache_revalidates_and_atomically_evicts_corrupt_live_entry(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
) -> None:
    provider = SolarRealtimeDataProvider()
    monotonic_now = [100.0]
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    corrupt_url = f"{provider.HELIOVIEWER_TILE_URL}?id=corrupt"
    retained_url = f"{provider.HELIOVIEWER_TILE_URL}?id=retained"
    corrupt_payload = b"not-a-png"
    retained_payload = aia_png_header()
    corrupt_size = provider._binary_cache_entry_size(corrupt_url, corrupt_payload)
    retained_size = provider._binary_cache_entry_size(retained_url, retained_payload)
    provider._binary_cache[corrupt_url] = (200.0, corrupt_payload, corrupt_size)
    provider._binary_cache[retained_url] = (200.0, retained_payload, retained_size)
    provider._binary_cache_bytes = corrupt_size + retained_size

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png_cached(corrupt_url)

    assert raised.value.code == "invalid_aia_png_signature"
    assert list(provider._binary_cache) == [retained_url]
    assert provider._binary_cache_bytes == retained_size


def test_aia_png_cache_validates_fetched_bytes_before_accounting_or_publish(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    url = f"{provider.HELIOVIEWER_TILE_URL}?id=invalid"
    monkeypatch.setattr(
        provider,
        "_fetch_aia_png",
        lambda _url: (b"not-a-png", "image/png"),
    )

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png_cached(url)

    assert raised.value.code == "invalid_aia_png_signature"
    assert provider._binary_cache == {}
    assert provider._binary_cache_bytes == 0


def test_aia_png_fetch_rejects_non_string_equality_spoofed_media_contract(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
    aia_png_equality_spoof: object,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(
        provider,
        "_request_bounded_http_payload",
        lambda *_args, **_kwargs: SimpleNamespace(
            payload=aia_png_header(),
            content_type=aia_png_equality_spoof,
        ),
    )

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png(provider.HELIOVIEWER_TILE_URL)

    assert raised.value.code == "invalid_aia_provider_contract"


def test_aia_png_cache_rejects_non_string_equality_spoof_before_publish(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
    aia_png_equality_spoof: object,
) -> None:
    provider = SolarRealtimeDataProvider()
    url = f"{provider.HELIOVIEWER_TILE_URL}?id=spoof"
    monkeypatch.setattr(
        provider,
        "_fetch_aia_png",
        lambda _url: (aia_png_header(), aia_png_equality_spoof),
    )

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_aia_png_cached(url)

    assert raised.value.code == "invalid_aia_provider_contract"
    assert provider._binary_cache == {}
    assert provider._binary_cache_bytes == 0


def test_aia_png_cache_reuses_one_valid_fetch_and_stores_no_media_metadata(
    monkeypatch: pytest.MonkeyPatch,
    aia_png_header: Callable[..., bytes],
) -> None:
    provider = SolarRealtimeDataProvider()
    url = f"{provider.HELIOVIEWER_TILE_URL}?id=valid"
    payload = aia_png_header()
    fetches = 0

    def fetch_aia_png(_url: str) -> tuple[bytes, str]:
        nonlocal fetches
        fetches += 1
        return payload, "image/png"

    monkeypatch.setattr(provider, "_fetch_aia_png", fetch_aia_png)

    first = provider._fetch_aia_png_cached(url)
    second = provider._fetch_aia_png_cached(url)

    assert first == second == (payload, "image/png")
    assert fetches == 1
    assert len(provider._binary_cache[url]) == 3


@pytest.mark.parametrize(
    ("code", "safe_detail"),
    (
        (
            "invalid_aia_media_type",
            "AIA tile upstream Content-Type is invalid.",
        ),
        (
            "unsupported_aia_media_type",
            "AIA tile upstream media type is unsupported.",
        ),
        (
            "invalid_aia_png_signature",
            "AIA tile PNG signature is invalid.",
        ),
        (
            "invalid_aia_png_header",
            "AIA tile PNG header is invalid.",
        ),
        (
            "invalid_aia_png_dimensions",
            "AIA tile PNG dimensions are invalid.",
        ),
    ),
)
def test_aia_validation_failure_replay_preserves_sanitized_code_without_graph(
    monkeypatch: pytest.MonkeyPatch,
    code: str,
    safe_detail: str,
) -> None:
    class RetainedPayload:
        pass

    provider = SolarRealtimeDataProvider()
    provider.singleflight_error_backoff_s = 60.0
    url = f"{provider.HELIOVIEWER_TILE_URL}?id={code}"
    retained_payload = RetainedPayload()
    retained_ref = weakref.ref(retained_payload)
    attempts = 0

    def fail_fetch(_url: str) -> tuple[bytes, str]:
        nonlocal attempts
        attempts += 1
        error = SolarRealtimeFetchError(code, "secret injected upstream detail")
        error.retained_payload = retained_payload  # type: ignore[attr-defined]
        raise error

    monkeypatch.setattr(provider, "_fetch_aia_png", fail_fetch)

    with pytest.raises(SolarRealtimeFetchError) as leader:
        provider._fetch_aia_png_cached(url)
    del retained_payload
    gc.collect()
    with pytest.raises(SolarRealtimeFetchError) as replay:
        provider._fetch_aia_png_cached(url)

    assert attempts == 1
    assert leader.value is not replay.value
    assert leader.value.code == replay.value.code == code
    assert leader.value.detail == replay.value.detail == safe_detail
    assert "secret" not in str(leader.value)
    assert "secret" not in str(replay.value)
    assert retained_ref() is None
    descriptor = provider._inflight_failures[("aia_png", url)]
    assert not isinstance(descriptor, BaseException)
    assert descriptor.kind == "fetch"
    assert descriptor.code == code
    assert descriptor.detail == safe_detail
    assert provider._binary_cache == {}
    assert provider._binary_cache_bytes == 0


@pytest.mark.parametrize("jd", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_julian_date_is_rejected_before_fetch(jd: float) -> None:
    provider, requests = _recording_provider()

    with pytest.raises(ValueError, match="finite Julian date"):
        provider.latest(jd_tdb=jd)

    assert requests == []


def test_realtime_gong_status_is_disabled_without_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(provider, "_fetch_swpc", lambda: {})
    monkeypatch.setattr(provider, "_fetch_silso", lambda: {})
    monkeypatch.setattr(provider, "_fetch_sdo_aia", lambda _jd_tdb: {})

    gong_attempts = 0

    def forbidden_gong_fetch(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        nonlocal gong_attempts
        gong_attempts += 1
        raise AssertionError("unvalidated GONG runtime fetch must remain unreachable")

    monkeypatch.setattr(
        provider,
        "_fetch_gong_synoptic",
        forbidden_gong_fetch,
        raising=False,
    )

    snapshot = provider._fetch_snapshot(2_459_291.4394237916)

    assert gong_attempts == 0
    assert snapshot["gong_synoptic"] is None
    expected_status = {
        "product": "zqs",
        "ok": False,
        "attempted": False,
        "runtime_eligible": False,
        "status": "disabled_unvalidated",
        "reason": "disabled_unvalidated",
    }
    assert snapshot["source_status"]["gong_synoptic"] == expected_status
    assert provider.capabilities()["sources"]["gong_synoptic"] == expected_status


def test_aia_provider_converts_jdtdb_to_utc_before_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    request_dates: list[datetime] = []

    def record_closest(source_id: int, date_utc: datetime) -> dict[str, Any]:
        request_dates.append(date_utc)
        return {
            "source_id": source_id,
            "image_id": None,
            "image_date": None,
            "tile_url": None,
        }

    monkeypatch.setattr(provider, "_fetch_helioviewer_closest", record_closest)

    result = provider._fetch_sdo_aia(2_459_291.4394237916)
    expected_utc = datetime(2021, 3, 17, 22, 31, 37, 30_000, tzinfo=timezone.utc)

    assert len(request_dates) == len(provider.AIA_SOURCE_IDS)
    assert all(abs((value - expected_utc).total_seconds()) < 50e-6 for value in request_dates)
    encoded_request_date = datetime.fromisoformat(
        result["request_date_utc"].replace("Z", "+00:00")
    )
    assert abs((encoded_request_date - expected_utc).total_seconds()) < 50e-6


def test_snapshot_stops_starting_sources_after_aggregate_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(timeout_s=1.0)
    monotonic_now = [100.0]
    calls: list[str] = []
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )

    def fetch_swpc() -> dict[str, Any]:
        calls.append("swpc")
        monotonic_now[0] += 0.5
        return {}

    def fetch_silso() -> dict[str, Any]:
        calls.append("silso")
        monotonic_now[0] += 0.5
        return {}

    def fetch_aia(_jd_tdb: float | None) -> dict[str, Any]:
        calls.append("aia")
        return {}

    monkeypatch.setattr(provider, "_fetch_swpc", fetch_swpc)
    monkeypatch.setattr(provider, "_fetch_silso", fetch_silso)
    monkeypatch.setattr(provider, "_fetch_sdo_aia", fetch_aia)

    snapshot = provider._fetch_snapshot(None)

    assert calls == ["swpc", "silso"]
    assert snapshot["source_status"]["sdo_aia"]["ok"] is False
    assert "acquisition deadline" in snapshot["source_status"]["sdo_aia"][
        "error"
    ]


def test_aia_metadata_loop_stops_when_shared_deadline_is_exhausted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(timeout_s=1.0)
    monotonic_now = [200.0]
    requested_sources: list[int] = []
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )

    def fetch_closest(source_id: int, _date_utc: datetime) -> dict[str, Any]:
        requested_sources.append(source_id)
        monotonic_now[0] += 0.5
        return {
            "source_id": source_id,
            "image_id": None,
            "image_date": None,
            "tile_url": None,
        }

    monkeypatch.setattr(provider, "_fetch_helioviewer_closest", fetch_closest)

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider._fetch_sdo_aia(None)

    assert raised.value.code == "acquisition_deadline"
    assert requested_sources == list(provider.AIA_SOURCE_IDS.values())[:2]


def test_aia_tile_reuses_snapshot_deadline_before_binary_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(timeout_s=1.0)
    monotonic_now = [300.0]
    work: list[str] = []
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )

    def latest(**_kwargs: Any) -> dict[str, Any]:
        work.append("metadata")
        monotonic_now[0] += 1.0
        return {
            "sdo_aia": {
                "channels": {
                    "aia_193": {
                        "image_id": "1",
                        "image_date": "2026-09-27T12:00:00Z",
                        "tile_url": provider.HELIOVIEWER_TILE_URL,
                    }
                }
            }
        }

    def fetch_tile(*_args: Any, **_kwargs: Any) -> tuple[bytes, str]:
        work.append("tile")
        return b"png", "image/png"

    monkeypatch.setattr(provider, "latest", latest)
    monkeypatch.setattr(provider, "_fetch_aia_png_cached", fetch_tile)

    with pytest.raises(SolarRealtimeFetchError) as raised:
        provider.latest_aia_tile()

    assert raised.value.code == "acquisition_deadline"
    assert work == ["metadata"]


def _freeze_aia_metadata_epoch(monkeypatch: pytest.MonkeyPatch) -> None:
    # Metadata-shape tests use one fixed observing epoch, not an increasingly
    # stale image paired with the machine's live clock.
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz: Any = None) -> datetime:
            instant = datetime(2026, 9, 27, 12, 34, 56, tzinfo=timezone.utc)
            return instant.astimezone(tz) if tz is not None else instant.replace(tzinfo=None)

    monkeypatch.setattr(solar_realtime_data, "datetime", FixedDatetime)


def test_aia_metadata_is_canonicalized_before_snapshot_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _freeze_aia_metadata_epoch(monkeypatch)
    provider = SolarRealtimeDataProvider()

    def unavailable() -> dict[str, Any]:
        raise RuntimeError("offline")

    monkeypatch.setattr(provider, "_fetch_swpc", unavailable)
    monkeypatch.setattr(provider, "_fetch_silso", unavailable)
    monkeypatch.setattr(
        provider,
        "_fetch_json",
        lambda _url: {
            "id": 184733789,
            "date": "2026-09-27 12:34:56",
            "name": "AIA 193 Angstrom",
            "scale": 0.6,
            "width": 4096,
            "height": 4096,
            "rsun": 1585.0,
            "rotation": 0.0,
        },
    )

    delivered = provider.latest(force_refresh=True)
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]

    for snapshot in (delivered, retained):
        channels = snapshot["sdo_aia"]["channels"]
        assert channels
        assert all(
            channel["image_date"] == "2026-09-27T12:34:56Z"
            for channel in channels.values()
        )
        assert all(
            channel["name"] == "AIA 193 Angstrom"
            for channel in channels.values()
        )
        assert snapshot["sdo_aia"]["latest_image_date_utc"] == (
            "2026-09-27T12:34:56Z"
        )


@pytest.mark.parametrize(
    ("field", "unsafe_value"),
    (
        ("name", "unsafe\r\nname"),
        ("name", "non-ascii-\u2603"),
        ("name", "x" * 129),
        ("date", "2026-09-27 12:34:56\r\nX-Injected: yes"),
        ("date", "2026-09-27 12:34:\u2603"),
        ("date", "x" * 129),
    ),
    ids=(
        "name-control",
        "name-non-ascii",
        "name-overlong",
        "date-control",
        "date-non-ascii",
        "date-overlong",
    ),
)
def test_unsafe_aia_metadata_is_rejected_before_snapshot_cache(
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    unsafe_value: str,
) -> None:
    _freeze_aia_metadata_epoch(monkeypatch)
    provider = SolarRealtimeDataProvider()

    def unavailable() -> dict[str, Any]:
        raise RuntimeError("offline")

    payload: dict[str, Any] = {
        "id": 184733789,
        "date": "2026-09-27 12:34:56",
        "name": "AIA 193 Angstrom",
        "scale": 0.6,
        "width": 4096,
        "height": 4096,
        "rsun": 1585.0,
        "rotation": 0.0,
    }
    payload[field] = unsafe_value
    monkeypatch.setattr(provider, "_fetch_swpc", unavailable)
    monkeypatch.setattr(provider, "_fetch_silso", unavailable)
    monkeypatch.setattr(provider, "_fetch_json", lambda _url: payload)

    provider.latest(force_refresh=True)
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]

    assert retained["sdo_aia"] is None
    assert retained["source_status"]["sdo_aia"]["ok"] is False
    assert "invalid_aia_metadata" in retained["source_status"]["sdo_aia"][
        "error"
    ]
    assert unsafe_value not in retained["source_status"]["sdo_aia"]["error"]


def test_aia_channel_declares_viewport_artifact_as_nonspatial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(
        provider,
        "_fetch_json",
        lambda _url: {
            "id": 184733789,
            "date": "2026-09-26 14:59:00",
            "scale": 0.6,
            "width": 4096,
            "height": 4096,
            "rsun": 1585.0,
            "rotation": 0.0,
        },
    )

    channel = provider._fetch_helioviewer_closest(
        11, datetime(2026, 9, 26, 14, 59, tzinfo=timezone.utc)
    )

    assert channel["artifact"] == {
        "schema": {"name": "helioviewer_viewport_tile", "version": 1},
        "delivery": "raw_on_demand",
        "media_type": "image/png",
        "viewport": {
            "tile_x": -1,
            "tile_y": -1,
            "width_px": 512,
            "height_px": 512,
            "image_scale_arcsec_per_pixel": 0.6,
        },
    }
    assert channel["spatial_use"] == {
        "eligible": False,
        "reason": "viewport_tile_has_no_validated_solar_surface_projection",
        "contract": None,
    }
    assert provider.capabilities()["sources"]["sdo_aia"]["artifacts"] == {
        "raw_viewport_tile": True,
        "spatial_surface_texture": False,
        "scientific_pixel_inference": False,
        "reason": "viewport_tile_has_no_validated_solar_surface_projection",
    }


@pytest.mark.parametrize(
    "image_id",
    (
        "1" * 1_000_000,
        "not-numeric",
        True,
        0,
        -1,
        1.5,
    ),
    ids=("megabyte", "nonnumeric", "boolean", "zero", "negative", "float"),
)
def test_aia_rejects_unbounded_or_nonnumeric_upstream_image_identity(
    monkeypatch: pytest.MonkeyPatch,
    image_id: object,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(
        provider,
        "_fetch_json",
        lambda _url: {
            "id": image_id,
            "date": "2026-09-26 14:59:00",
            "scale": 0.6,
            "width": 4096,
            "height": 4096,
            "rsun": 1585.0,
            "rotation": 0.0,
        },
    )

    with pytest.raises(SolarRealtimeFetchError, match="image identity"):
        provider._fetch_helioviewer_closest(11, datetime.now(timezone.utc))


def test_aia_rejects_megabyte_requested_image_identity_before_snapshot_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    latest_calls = 0

    def forbidden_latest(**_kwargs: Any) -> dict[str, Any]:
        nonlocal latest_calls
        latest_calls += 1
        return {}

    monkeypatch.setattr(provider, "latest", forbidden_latest)

    with pytest.raises(SolarRealtimeFetchError, match="image identity"):
        provider.latest_aia_tile(image_id="1" * 1_000_000)

    assert latest_calls == 0


def test_aia_snapshot_never_reads_viewport_pixels_or_derives_science(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()

    def closest(source_id: int, _date_utc: datetime) -> dict[str, Any]:
        return {
            "source_id": source_id,
            "image_id": f"image-{source_id}",
            "image_date": "2026-09-26 14:59:00",
            "tile_url": f"https://example.invalid/{source_id}.png",
            "artifact": {
                "schema": {"name": "helioviewer_viewport_tile", "version": 1},
                "delivery": "raw_on_demand",
            },
            "spatial_use": {
                "eligible": False,
                "reason": provider.AIA_SPATIAL_USE_DISABLED_REASON,
                "contract": None,
            },
        }

    monkeypatch.setattr(provider, "_fetch_helioviewer_closest", closest)

    binary_reads: list[str] = []

    def forbidden_binary_read(url: str, **_kwargs: Any) -> tuple[bytes, str]:
        binary_reads.append(url)
        raise AssertionError("snapshot generation must remain metadata-only")

    monkeypatch.setattr(provider, "_fetch_aia_png_cached", forbidden_binary_read)

    snapshot = provider._fetch_sdo_aia(2_459_291.4394237916)

    assert binary_reads == []
    assert snapshot["channel_activity_proxy"] is None
    assert snapshot["activity_proxy"] is None
    assert snapshot["coronal_holes"] is None
    assert snapshot["scientific_inference"] == {
        "status": "disabled",
        "reason": "viewport_tile_has_no_validated_solar_surface_projection",
        "activity_proxy": None,
        "coronal_holes": None,
    }
    assert all("analysis" not in channel for channel in snapshot["channels"].values())
    assert (
        provider.capabilities()["sources"]["sdo_aia"][
            "supports_imagery_activity_proxy"
        ]
        is False
    )


def test_aia_provider_accepts_equal_legacy_epoch_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    latest_calls: list[dict[str, Any]] = []

    def fake_latest(**kwargs: Any) -> dict[str, Any]:
        latest_calls.append(kwargs)
        return {
            "sdo_aia": {
                "channels": {
                    "aia_193": {
                        "tile_url": "https://example.invalid/aia.png",
                        "image_id": "1",
                        "image_date": "2026-01-01T00:00:00Z",
                    }
                }
            }
        }

    monkeypatch.setattr(provider, "latest", fake_latest)
    monkeypatch.setattr(
        provider,
        "_fetch_aia_png_cached",
        lambda *_args, **_kwargs: (b"png", "image/png"),
    )

    tile = provider.latest_aia_tile(
        jd_tdb=2_460_000.5,
        jd=2_460_000.5,
    )

    assert tile["content"] == b"png"
    assert latest_calls == [{"jd_tdb": 2_460_000.5, "force_refresh": False}]


def test_aia_tile_rejects_changed_snapshot_identity_before_binary_fetch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(
        provider,
        "latest",
        lambda **_kwargs: {
            "sdo_aia": {
                "channels": {
                    "aia_193": {
                        "tile_url": "https://example.invalid/image-b.png",
                        "image_id": "200",
                        "image_date": "2026-01-01T00:00:00Z",
                    }
                }
            }
        },
    )
    binary_fetches: list[str] = []
    monkeypatch.setattr(
        provider,
        "_fetch_aia_png_cached",
        lambda url, **_kwargs: (binary_fetches.append(url), (b"wrong", "image/png"))[1],
    )

    with pytest.raises(
        RuntimeError,
        match=r"requested 100.*available 200",
    ):
        provider.latest_aia_tile(channel="aia_193", image_id="100")

    assert binary_fetches == []


def test_aia_tile_serves_the_exact_requested_snapshot_artifact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    tile_url = "https://example.invalid/image-a.png"
    monkeypatch.setattr(
        provider,
        "latest",
        lambda **_kwargs: {
            "sdo_aia": {
                "channels": {
                    "aia_193": {
                        "tile_url": tile_url,
                        "image_id": "100",
                        "image_date": "2026-01-01T00:00:00Z",
                        "artifact": {
                            "schema": {
                                "name": "helioviewer_viewport_tile",
                                "version": 1,
                            },
                            "delivery": "raw_on_demand",
                        },
                        "spatial_use": {
                            "eligible": False,
                            "reason": (
                                "viewport_tile_has_no_validated_solar_surface_projection"
                            ),
                            "contract": None,
                        },
                    }
                }
            }
        },
    )
    fetched_urls: list[str] = []

    def fetch_binary(url: str, **_kwargs: Any) -> tuple[bytes, str]:
        fetched_urls.append(url)
        return b"exact-image-a", "image/png"

    monkeypatch.setattr(provider, "_fetch_aia_png_cached", fetch_binary)

    tile = provider.latest_aia_tile(channel="aia_193", image_id="100")

    assert fetched_urls == [tile_url]
    assert tile["image_id"] == "100"
    assert tile["content"] == b"exact-image-a"
    assert tile["artifact"]["delivery"] == "raw_on_demand"
    assert tile["spatial_use"]["eligible"] is False


def test_aia_tile_provider_does_not_relabel_missing_content_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(
        provider,
        "latest",
        lambda **_kwargs: {
            "sdo_aia": {
                "channels": {
                    "aia_193": {
                        "tile_url": "https://example.invalid/aia.png",
                        "image_id": "1",
                        "image_date": "2026-01-01T00:00:00Z",
                    }
                }
            }
        },
    )
    monkeypatch.setattr(
        provider,
        "_fetch_aia_png_cached",
        lambda *_args, **_kwargs: (b"png", None),
    )

    tile = provider.latest_aia_tile()

    assert tile["content_type"] is None
