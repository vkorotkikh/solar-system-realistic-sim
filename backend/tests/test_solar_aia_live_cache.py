"""AIA request coverage and live cache age, using retained provider metadata."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from astropy.time import Time
import pytest

from sim import solar_realtime_data as module


CAPTURE = Path(__file__).resolve().parents[2] / "agent-notes/aia-date-coverage-2026-10-14"


@pytest.fixture
def live_aia(monkeypatch):
    provider = module.SolarRealtimeDataProvider()
    clock = {"utc": datetime(2020, 1, 1, 5, 59, 45, tzinfo=timezone.utc), "monotonic": 0.0}
    calls = []
    metadata = {sid: json.loads((CAPTURE / f"2020-01-01_{sid}.json").read_bytes())
                for sid in provider.AIA_SOURCE_IDS.values()}

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock["utc"].astimezone(tz) if tz is not None else clock["utc"].replace(tzinfo=None)

    def fetch_json(url):
        query = parse_qs(urlsplit(url).query)
        calls.append(query)
        return deepcopy(metadata[int(query["sourceId"][0])])

    monkeypatch.setattr(module, "datetime", Clock)
    monkeypatch.setattr(module.time, "monotonic", lambda: clock["monotonic"])
    monkeypatch.setattr(provider, "_fetch_json", fetch_json)
    monkeypatch.setattr(provider, "_fetch_swpc", lambda: {
        "time_tag": clock["utc"].isoformat(), "activity_proxy": 0.2,
    })
    monkeypatch.setattr(provider, "_fetch_silso", lambda: {"date": "2019-12-31"})
    return provider, clock, calls, metadata


def test_live_cache_expires_at_oldest_channel_coverage_boundary(live_aia):
    provider, clock, calls, _ = live_aia
    assert provider.latest()["source_status"]["sdo_aia"]["ok"] is True
    assert len(calls) == 5
    clock["utc"] += timedelta(seconds=100)
    clock["monotonic"] = 100.0
    result = provider.latest()
    assert result["sdo_aia"] is None
    assert result["source_status"]["sdo_aia"]["ok"] is False
    assert "aia_epoch_unavailable" in result["source_status"]["sdo_aia"]["error"]
    assert len(calls) == 6  # Expired metadata is refreshed, then rejected by the guard.


def test_wall_clock_jump_rechecks_all_channels_on_a_live_cache_hit(live_aia):
    provider, clock, calls, _ = live_aia
    provider.latest()
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]
    clock["utc"] += timedelta(seconds=2)
    clock["monotonic"] = 0.5
    result = provider.latest()
    # AIA 211 is now 21601 s old; the freshest channel is still inside the window.
    assert result["sdo_aia"] is None
    assert result["source_status"]["sdo_aia"]["reason"] == "aia_epoch_unavailable"
    assert result["cache_state"] == "partial"
    assert len(calls) == 5
    assert retained["sdo_aia"] is not None  # A detached delivery, not shared mutation.


def test_cached_live_freshness_advances_without_refetch(live_aia):
    provider, clock, calls, _ = live_aia
    clock["utc"] = datetime(2020, 1, 1, 0, 10, tzinfo=timezone.utc)
    before = provider.latest()
    clock["utc"] += timedelta(seconds=100)
    clock["monotonic"] = 100.0
    after = provider.latest()
    assert after["sdo_aia"]["freshness_s"] == before["sdo_aia"]["freshness_s"] + 100
    assert after["sdo_aia"]["freshness_proxy"] < before["sdo_aia"]["freshness_proxy"]
    assert after["source_status"]["sdo_aia"]["delivered_at_utc"] == "2020-01-01T00:11:40Z"
    assert all(row["spatial_use"]["eligible"] is False for row in after["sdo_aia"]["channels"].values())
    assert len(calls) == 5


def test_historical_cache_keeps_dated_coverage_but_updates_live_wall_freshness(live_aia):
    provider, clock, calls, _ = live_aia
    clock["utc"] = datetime(2026, 10, 14, tzinfo=timezone.utc)
    jd = float(Time("2020-01-01T00:00:00", scale="utc").tdb.jd)
    before = provider.latest(jd_tdb=jd)
    clock["utc"] += timedelta(seconds=100)
    clock["monotonic"] = 100.0
    after = provider.latest(jd_tdb=jd)
    assert after["source_status"]["sdo_aia"]["ok"] is True
    assert after["sdo_aia"]["freshness_s"] == before["sdo_aia"]["freshness_s"] + 100
    assert after["sdo_aia"]["freshness_proxy"] == 0
    assert after["sdo_aia"]["activity_proxy"] is None
    assert len(calls) == 5


@pytest.mark.parametrize("age_seconds", [-21601, -21600, 21600, 21601])
def test_cached_delivery_preserves_the_symmetric_inclusive_epoch_window(live_aia, age_seconds):
    provider, clock, calls, metadata = live_aia
    observed = datetime(2020, 1, 1, tzinfo=timezone.utc)
    clock["utc"] = observed
    for row in metadata.values():
        row["date"] = "2020-01-01 00:00:00"  # Boundary-only fixture timestamps.
    provider.latest()
    clock["utc"] = observed + timedelta(seconds=age_seconds)
    clock["monotonic"] = 0.5
    result = provider.latest()
    assert result["source_status"]["sdo_aia"]["ok"] is (abs(age_seconds) <= 21600)
    assert (result["sdo_aia"] is not None) is (abs(age_seconds) <= 21600)
    assert len(calls) == 5


@pytest.mark.parametrize("damage", ["absent", "missing-channel", "missing-date", "invalid-date"])
def test_corrupt_cached_aia_dates_fail_closed_without_binary_acquisition(live_aia, monkeypatch, damage):
    provider, _, calls, _ = live_aia
    provider.latest()
    retained = provider._snapshot_cache[("snapshot", "latest", None)][1]
    if damage == "absent":
        retained["sdo_aia"] = None
    elif damage == "missing-channel":
        del retained["sdo_aia"]["channels"]["aia_211"]
    elif damage == "missing-date":
        del retained["sdo_aia"]["channels"]["aia_211"]["image_date"]
    else:
        retained["sdo_aia"]["channels"]["aia_211"]["image_date"] = "invalid"
    def forbid_binary(*_args, **_kwargs):
        pytest.fail("invalid cached dates reached the binary cache")
    monkeypatch.setattr(provider, "_fetch_aia_png_cached", forbid_binary)
    with pytest.raises(RuntimeError, match="snapshot unavailable"):
        provider.latest_aia_tile()
    result = provider.latest()
    assert result["sdo_aia"] is None
    assert result["source_status"]["sdo_aia"]["reason"] == "invalid_aia_metadata"
    assert len(calls) == 5


def test_stale_cached_aia_never_reaches_tile_cache(live_aia, monkeypatch):
    provider, clock, _, _ = live_aia
    provider.latest()
    clock["utc"] += timedelta(seconds=100)
    clock["monotonic"] = 0.5
    def forbid_binary(*_args, **_kwargs):
        pytest.fail("stale AIA reached the binary cache")
    monkeypatch.setattr(provider, "_fetch_aia_png_cached", forbid_binary)
    with pytest.raises(RuntimeError, match="snapshot unavailable"):
        provider.latest_aia_tile()


def test_malformed_acquisition_fails_closed_without_retry_hot_loop(live_aia, monkeypatch):
    provider, clock, _, _ = live_aia
    acquisitions = []

    def malformed_snapshot(_jd):
        acquisitions.append(clock["monotonic"])
        return {"source_status": {"sdo_aia": {"ok": True}}, "sdo_aia": {}}

    monkeypatch.setattr(provider, "_fetch_snapshot", malformed_snapshot)
    first = provider.latest()
    assert first["sdo_aia"] is None
    assert first["source_status"]["sdo_aia"]["reason"] == "invalid_aia_metadata"
    clock["utc"] += timedelta(seconds=1)
    clock["monotonic"] = 1.0
    assert provider.latest()["sdo_aia"] is None
    assert acquisitions == [0.0]
    clock["utc"] += timedelta(seconds=6)
    clock["monotonic"] = 7.0
    assert provider.latest()["sdo_aia"] is None
    assert acquisitions == [0.0, 7.0]
