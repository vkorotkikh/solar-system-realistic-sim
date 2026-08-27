from __future__ import annotations

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

    first = provider.latest(jd=2_460_000.5)
    second = provider.latest(jd=2_460_001.5)

    assert first["requested_jd"] == 2_460_000.5
    assert second["requested_jd"] == 2_460_001.5
    assert requests == [2_460_000.5, 2_460_001.5]


def test_latest_and_explicit_epoch_have_distinct_cache_identities() -> None:
    provider, requests = _recording_provider()

    current = provider.latest()
    historical = provider.latest(jd=2_460_000.5)
    current_again = provider.latest()

    assert current is current_again
    assert current["requested_jd"] is None
    assert historical["requested_jd"] == 2_460_000.5
    assert requests == [None, 2_460_000.5]


def test_same_epoch_reuses_snapshot_until_refresh() -> None:
    provider, requests = _recording_provider()

    first = provider.latest(jd=2_460_000.5)
    cached = provider.latest(jd=2_460_000.5)
    refreshed = provider.latest(jd=2_460_000.5, force_refresh=True)

    assert cached is first
    assert refreshed["fetch_number"] == 2
    assert requests == [2_460_000.5, 2_460_000.5]


def test_snapshot_cache_is_bounded_and_uses_lru_eviction() -> None:
    provider, requests = _recording_provider(max_entries=2)

    provider.latest(jd=1.0)
    provider.latest(jd=2.0)
    provider.latest(jd=1.0)  # Make JD 1 the most-recently used entry.
    provider.latest(jd=3.0)  # Evicts JD 2.
    provider.latest(jd=2.0)

    assert requests == [1.0, 2.0, 3.0, 2.0]
    assert len(provider._snapshot_cache) == 2


@pytest.mark.parametrize("jd", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_julian_date_is_rejected_before_fetch(jd: float) -> None:
    provider, requests = _recording_provider()

    with pytest.raises(ValueError, match="finite Julian date"):
        provider.latest(jd=jd)

    assert requests == []
