from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

import sim.solar_realtime_data as solar_realtime_data
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


def test_singleflight_failure_backoff_is_bounded_and_uses_lru_eviction() -> None:
    provider = SolarRealtimeDataProvider(singleflight_failure_max_entries=2)
    provider.singleflight_error_backoff_s = 60.0
    attempts: list[str] = []

    def fail(name: str) -> None:
        attempts.append(name)
        raise RuntimeError(f"failed-{name}")

    for name in ("a", "b"):
        with pytest.raises(RuntimeError, match=f"failed-{name}"):
            provider._singleflight_fetch(name, lambda name=name: fail(name))

    # A cached read makes ``a`` the most-recently used failure without
    # executing the replacement callable.
    with pytest.raises(RuntimeError, match="failed-a"):
        provider._singleflight_fetch(
            "a",
            lambda: pytest.fail("cached failure unexpectedly refetched"),
        )

    with pytest.raises(RuntimeError, match="failed-c"):
        provider._singleflight_fetch("c", lambda: fail("c"))

    assert provider._singleflight_fetch("b", lambda: "recovered-b") == "recovered-b"
    with pytest.raises(RuntimeError, match="failed-a"):
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
        with pytest.raises(RuntimeError, match=name):
            provider._singleflight_fetch(
                name,
                lambda name=name: (_ for _ in ()).throw(RuntimeError(name)),
            )

    monotonic_now[0] = 105.0
    with pytest.raises(RuntimeError, match="current"):
        provider._singleflight_fetch(
            "current",
            lambda: (_ for _ in ()).throw(RuntimeError("current")),
        )

    assert list(provider._inflight_failures) == ["current"]


def test_binary_cache_enforces_byte_budget_with_lru_eviction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(binary_cache_max_bytes=6)
    fetches: list[str] = []

    def fetch_binary(url: str) -> tuple[bytes, str]:
        fetches.append(url)
        return url.encode("ascii") * 3, "image/png"

    monkeypatch.setattr(provider, "_fetch_binary", fetch_binary)

    assert provider._fetch_binary_cached("a")[0] == b"aaa"
    assert provider._fetch_binary_cached("b")[0] == b"bbb"
    assert provider._fetch_binary_cached("a")[0] == b"aaa"  # LRU touch.
    assert provider._fetch_binary_cached("c")[0] == b"ccc"  # Evicts b.
    assert provider._fetch_binary_cached("b")[0] == b"bbb"

    assert fetches == ["a", "b", "c", "b"]
    assert provider._binary_cache_bytes <= 6
    assert sum(len(entry[1]) for entry in provider._binary_cache.values()) <= 6


def test_binary_payload_larger_than_cache_budget_is_never_retained(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(binary_cache_max_bytes=3)
    fetch_count = 0

    def fetch_binary(_url: str) -> tuple[bytes, str]:
        nonlocal fetch_count
        fetch_count += 1
        return b"four", "image/png"

    monkeypatch.setattr(provider, "_fetch_binary", fetch_binary)

    assert provider._fetch_binary_cached("oversized")[0] == b"four"
    assert provider._fetch_binary_cached("oversized")[0] == b"four"

    assert fetch_count == 2
    assert provider._binary_cache_bytes == 0
    assert len(provider._binary_cache) == 0


def test_binary_cache_replacement_subtracts_expired_payload_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider(binary_cache_max_bytes=5)
    monotonic_now = [100.0]
    payloads = iter((b"aa", b"bbbb"))
    monkeypatch.setattr(
        solar_realtime_data.time,
        "monotonic",
        lambda: monotonic_now[0],
    )
    monkeypatch.setattr(
        provider,
        "_fetch_binary",
        lambda _url: (next(payloads), "image/png"),
    )

    assert provider._fetch_binary_cached("same", ttl_s=5.0)[0] == b"aa"
    monotonic_now[0] = 106.0
    assert provider._fetch_binary_cached("same", ttl_s=5.0)[0] == b"bbbb"

    assert provider._binary_cache_bytes == 4
    assert len(provider._binary_cache) == 1


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

    channel = provider._fetch_helioviewer_closest(11, datetime.now(timezone.utc))

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

    monkeypatch.setattr(provider, "_fetch_binary_cached", forbidden_binary_read)

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
        "_fetch_binary_cached",
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
                        "image_id": "image-b",
                        "image_date": "2026-01-01T00:00:00Z",
                    }
                }
            }
        },
    )
    binary_fetches: list[str] = []
    monkeypatch.setattr(
        provider,
        "_fetch_binary_cached",
        lambda url, **_kwargs: (binary_fetches.append(url), (b"wrong", "image/png"))[1],
    )

    with pytest.raises(
        RuntimeError,
        match=r"requested image-a.*available image-b",
    ):
        provider.latest_aia_tile(channel="aia_193", image_id="image-a")

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
                        "image_id": "image-a",
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

    monkeypatch.setattr(provider, "_fetch_binary_cached", fetch_binary)

    tile = provider.latest_aia_tile(channel="aia_193", image_id="image-a")

    assert fetched_urls == [tile_url]
    assert tile["image_id"] == "image-a"
    assert tile["content"] == b"exact-image-a"
    assert tile["artifact"]["delivery"] == "raw_on_demand"
    assert tile["spatial_use"]["eligible"] is False
