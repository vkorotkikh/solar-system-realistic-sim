"""Real nearest-image responses must not imply coverage of an unrelated epoch."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from astropy.time import Time

from backend.sim import solar_realtime_data as module
from backend.sim.solar_realtime_data import (
    SolarRealtimeDataProvider,
    SolarRealtimeFetchError,
)


CAPTURE = Path(__file__).resolve().parents[2] / "agent-notes/aia-date-coverage-2026-10-14"
MANIFEST = json.loads((CAPTURE / "manifest.json").read_text())
CASES = MANIFEST["requests"]


@pytest.mark.parametrize("case", CASES, ids=lambda row: f'{row["requestedUtc"]}-{row["sourceId"]}')
def test_real_aia_archive_coverage_is_relative_to_requested_epoch(monkeypatch, case):
    raw = (CAPTURE / case["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == case["sha256"]
    assert hashlib.sha256((CAPTURE / case["headerFile"]).read_bytes()).hexdigest() == case["headersSha256"]
    assert case["httpStatus"] == 200 and case["curlExit"] == 0
    provider = SolarRealtimeDataProvider()
    def fetch_json(url):
        actual, retained = urlsplit(url), urlsplit(case["url"])
        assert (actual.scheme, actual.netloc, actual.path) == (retained.scheme, retained.netloc, retained.path)
        assert parse_qs(actual.query) == parse_qs(retained.query)
        return json.loads(raw)
    monkeypatch.setattr(provider, "_fetch_json", fetch_json)
    requested = datetime.fromisoformat(case["requestedUtc"].replace("Z", "+00:00"))

    # Both pre-mission and future requests returned valid but unrelated images.
    if requested.year in (1990, 2050):
        with pytest.raises(SolarRealtimeFetchError, match="requested epoch"):
            provider._fetch_helioviewer_closest(case["sourceId"], requested)
    else:
        result = provider._fetch_helioviewer_closest(case["sourceId"], requested)
        observed = datetime.fromisoformat(result["image_date"].replace("Z", "+00:00"))
        assert abs((observed - requested).total_seconds()) <= 21_600
        assert result["image_id"] == str(json.loads(raw)["id"])
        # Valid time coverage does not validate a viewport tile as a surface map.
        assert result["spatial_use"]["eligible"] is False


@pytest.mark.parametrize("offset_seconds", [-21_601, -21_600, 21_600, 21_601])
def test_aia_epoch_window_is_symmetric_and_inclusive(monkeypatch, offset_seconds):
    requested = datetime(2020, 1, 1, tzinfo=timezone.utc)
    observed = requested + timedelta(seconds=offset_seconds)
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(provider, "_fetch_json", lambda _url: {
        "id": "123", "date": observed.strftime("%Y-%m-%d %H:%M:%S"),
        "name": "AIA 193", "scale": 0.6, "width": 4096, "height": 4096,
    })
    if abs(offset_seconds) > 21_600:
        with pytest.raises(SolarRealtimeFetchError, match="requested epoch"):
            provider._fetch_helioviewer_closest(11, requested)
    else:
        result = provider._fetch_helioviewer_closest(11, requested)
        assert result["image_date"] == observed.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_aia_guard_uses_the_normalized_whole_second_request(monkeypatch):
    provider = SolarRealtimeDataProvider()
    requested = datetime(2020, 1, 1, 5, 30, 0, 999999,
                         tzinfo=timezone(timedelta(hours=5, minutes=30)))
    def fetch_json(url):
        assert parse_qs(urlsplit(url).query)["date"] == ["2020-01-01T00:00:00Z"]
        return {"id": "123", "date": "2019-12-31 18:00:00", "name": "AIA 193"}
    monkeypatch.setattr(provider, "_fetch_json", fetch_json)
    assert provider._fetch_helioviewer_closest(11, requested)["image_date"] == "2019-12-31T18:00:00Z"


@pytest.fixture
def isolated_aia_provider(monkeypatch):
    provider = SolarRealtimeDataProvider()
    elapsed = [0.0]
    monkeypatch.setattr(module.time, "monotonic", lambda: elapsed[0])
    def unavailable():
        raise RuntimeError("Other providers are outside this AIA regression")
    monkeypatch.setattr(provider, "_fetch_swpc", unavailable)
    monkeypatch.setattr(provider, "_fetch_silso", unavailable)
    return provider, elapsed


def retained_metadata(source_id, request_date):
    return json.loads((CAPTURE / f"{request_date}_{source_id}.json").read_bytes())


def test_dated_aia_cache_does_not_leak_valid_images_into_an_uncovered_epoch(isolated_aia_provider, monkeypatch):
    provider, _ = isolated_aia_provider
    queries = []
    def fetch_json(url):
        query = parse_qs(urlsplit(url).query)
        queries.append(query)
        date = "1990-01-01" if query["date"][0].startswith("1990") else "2020-01-01"
        return retained_metadata(int(query["sourceId"][0]), date)
    monkeypatch.setattr(provider, "_fetch_json", fetch_json)
    covered_jd = float(Time("2020-01-01T00:00:00", scale="utc").tdb.jd)
    # Midnight rounds into a leap second in the separate solar_time adapter.
    # Use noon to reach the AIA guard; that conversion defect is a parent handoff.
    uncovered_jd = float(Time("1990-01-01T12:00:00", scale="utc").tdb.jd)
    valid = provider.latest(jd_tdb=covered_jd)
    assert valid["source_status"]["sdo_aia"]["ok"] is True
    unavailable = provider.latest(jd_tdb=uncovered_jd)
    assert unavailable["sdo_aia"] is None
    assert unavailable["source_status"]["sdo_aia"]["ok"] is False
    assert "aia_epoch_unavailable" in unavailable["source_status"]["sdo_aia"]["error"]
    cached = provider.latest(jd_tdb=covered_jd)["sdo_aia"]
    assert cached["channels"] == valid["sdo_aia"]["channels"]
    assert cached["request_date_utc"] == valid["sdo_aia"]["request_date_utc"]
    assert cached["freshness_s"] >= valid["sdo_aia"]["freshness_s"]
    assert len(queries) == 6
    assert valid["sdo_aia"]["freshness_s"] > 21_600  # Historical coverage is not live freshness.
    assert all(row["spatial_use"]["eligible"] is False for row in valid["sdo_aia"]["channels"].values())


def test_invalid_refresh_is_not_served_as_last_good_aia_and_recovers_after_backoff(isolated_aia_provider, monkeypatch):
    provider, elapsed = isolated_aia_provider
    wrong_epoch = [False]
    queries = []
    def fetch_json(url):
        query = parse_qs(urlsplit(url).query)
        queries.append(query)
        return retained_metadata(int(query["sourceId"][0]), "1990-01-01" if wrong_epoch[0] else "2020-01-01")
    monkeypatch.setattr(provider, "_fetch_json", fetch_json)
    jd = float(Time("2020-01-01T00:00:00", scale="utc").tdb.jd)
    assert provider.latest(jd_tdb=jd)["source_status"]["sdo_aia"]["ok"] is True
    wrong_epoch[0] = True
    failed = provider.latest(jd_tdb=jd, force_refresh=True)
    assert failed["sdo_aia"] is None
    assert "aia_epoch_unavailable" in failed["source_status"]["sdo_aia"]["error"]
    elapsed[0] = 1.0
    assert provider.latest(jd_tdb=jd)["sdo_aia"] is None
    assert len(queries) == 6
    wrong_epoch[0] = False
    elapsed[0] = provider.singleflight_error_backoff_s + 1.0
    recovered = provider.latest(jd_tdb=jd)
    assert recovered["source_status"]["sdo_aia"]["ok"] is True
    assert recovered["sdo_aia"]["channels"]["aia_193"]["image_id"] == "82703440"
    assert len(queries) == 11


def test_uncovered_epoch_cannot_reach_the_binary_tile_cache(isolated_aia_provider, monkeypatch):
    provider, _ = isolated_aia_provider
    monkeypatch.setattr(provider, "_fetch_json", lambda _url: retained_metadata(8, "1990-01-01"))
    def forbid_binary(*_args, **_kwargs):
        raise AssertionError("uncovered metadata reached tile acquisition")
    monkeypatch.setattr(provider, "_fetch_aia_png_cached", forbid_binary)
    jd = float(Time("1990-01-01T12:00:00", scale="utc").tdb.jd)
    with pytest.raises(RuntimeError, match="snapshot unavailable"):
        provider.latest_aia_tile(jd_tdb=jd)
    assert "aia_epoch_unavailable" in provider.latest(jd_tdb=jd)["source_status"]["sdo_aia"]["error"]
