from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from sim.solar_realtime_data import SolarRealtimeDataProvider


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

    assert current is current_again
    assert current["requested_jd"] is None
    assert historical["requested_jd"] == 2_460_000.5
    assert requests == [None, 2_460_000.5]


def test_provider_accepts_equal_legacy_jd_alias_and_reuses_canonical_cache() -> None:
    provider, requests = _recording_provider()

    legacy = provider.latest(jd=2_460_000.5)
    both = provider.latest(jd_tdb=2_460_000.5, jd=2_460_000.5)

    assert legacy is both
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

    assert cached is first
    assert refreshed["fetch_number"] == 2
    assert requests == [2_460_000.5, 2_460_000.5]


def test_snapshot_cache_is_bounded_and_uses_lru_eviction() -> None:
    provider, requests = _recording_provider(max_entries=2)

    provider.latest(jd_tdb=1.0)
    provider.latest(jd_tdb=2.0)
    provider.latest(jd_tdb=1.0)  # Make JD 1 the most-recently used entry.
    provider.latest(jd_tdb=3.0)  # Evicts JD 2.
    provider.latest(jd_tdb=2.0)

    assert requests == [1.0, 2.0, 3.0, 2.0]
    assert len(provider._snapshot_cache) == 2


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
        "_fetch_binary_cached",
        lambda *_args, **_kwargs: (b"png", "image/png"),
    )

    tile = provider.latest_aia_tile(
        jd_tdb=2_460_000.5,
        jd=2_460_000.5,
    )

    assert tile["content"] == b"png"
    assert latest_calls == [{"jd_tdb": 2_460_000.5, "force_refresh": False}]
