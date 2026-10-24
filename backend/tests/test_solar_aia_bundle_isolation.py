"""SOL-AIA-FANOUT first-stage AIA-bundle isolation; owned offline fixtures.

Actual public provider, metadata normalization/date validation, delivery logic,
binary cache/envelope and HTTP admission execute. Only transport/source inputs
are replaced; the 33-byte synthetic PNG envelope is not a decodable image or
observed science. Five-channel coverage remains intentional, not a fixed facet.
"""
from __future__ import annotations

from collections import Counter, OrderedDict
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import threading
from urllib.parse import parse_qs, urlsplit
import zlib

from astropy.time import Time
import pytest

from sim import solar_realtime_data as module
from sim.solar_realtime_data import (
    AiaImageIdentityMismatch, SolarRealtimeDataProvider, SolarRealtimeFetchError,
)


NOW = datetime(2020, 1, 1, 12, tzinfo=timezone.utc)
JD = float(Time(NOW, scale="utc").tdb.jd)
IHDR = b"IHDR" + (512).to_bytes(4, "big") * 2 + b"\x08\x06\x00\x00\x00"
PNG = b"\x89PNG\r\n\x1a\n" + (13).to_bytes(4, "big") + IHDR + (zlib.crc32(IHDR) & 0xffffffff).to_bytes(4, "big")
KEY = "owned-aia-bundle-isolation-synthetic-key"


@pytest.fixture
def rig(monkeypatch):
    provider = SolarRealtimeDataProvider(cache_ttl_s=30, snapshot_cache_max_entries=1)
    events = {"unrelated": [], "metadata": [], "binary": []}
    state = {"utc": NOW, "ids": {sid: str(1000 + sid) for sid in provider.AIA_SOURCE_IDS.values()},
             "offset": 0, "date": None, "broken_source": None, "png": PNG,
             "media": "image/png", "after_metadata": lambda: None}

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return state["utc"].astimezone(tz) if tz is not None else state["utc"].replace(tzinfo=None)

    def unrelated(name):
        events["unrelated"].append(name)
        raise RuntimeError("owned unrelated source unavailable; never a live request")

    def metadata(url, **_kwargs):
        split = urlsplit(url)
        assert (split.scheme, split.netloc, split.path) == ("https", "api.helioviewer.org", "/v2/getClosestImage/")
        query = parse_qs(split.query)
        assert set(query) == {"date", "sourceId", "verbose"}
        assert query["verbose"] == ["true"]
        sid = int(query["sourceId"][0])
        assert sid in provider.AIA_SOURCE_IDS.values()
        events["metadata"].append((sid, query["date"][0]))
        if sid == state["broken_source"]:
            raise SolarRealtimeFetchError("invalid_aia_metadata", "owned bad AIA metadata")
        date = datetime.fromisoformat(query["date"][0].replace("Z", "+00:00")) + timedelta(seconds=state["offset"])
        state["after_metadata"]()
        return {"id": state["ids"][sid], "date": state["date"] or date.strftime("%Y-%m-%d %H:%M:%S"),
                "name": "Owned synthetic AIA metadata", "scale": 0.6, "width": 4096, "height": 4096}

    def binary(url):
        split = urlsplit(url)
        assert (split.scheme, split.netloc, split.path) == ("https", "api.helioviewer.org", "/v2/getTile/")
        query = parse_qs(split.query)
        assert set(query) == {"id", "x", "y", "imageScale"}
        assert query["x"] == ["-1"] and query["y"] == ["-1"]
        events["binary"].append(query["id"][0])
        return state["png"], state["media"]

    def no_network(*_args, **_kwargs):
        pytest.fail("No provider network is authorized in this candidate")

    monkeypatch.setattr(module, "datetime", Clock)
    monkeypatch.setattr(provider, "_fetch_swpc", lambda: unrelated("swpc"))
    monkeypatch.setattr(provider, "_fetch_silso", lambda: unrelated("silso"))
    monkeypatch.setattr(provider, "_fetch_json", metadata)
    monkeypatch.setattr(provider, "_fetch_aia_png", binary)
    monkeypatch.setattr(provider, "_request_bytes", no_network)
    monkeypatch.setattr(provider, "_request_bounded_http_payload", no_network)
    return provider, events, state


def assert_tile(tile, image_id, channel="aia_193"):
    assert tile["channel"] == channel
    assert tile["image_id"] == image_id
    assert tile["content"] == PNG
    assert tile["content_type"] == "image/png"
    assert tile["artifact"]["schema"] == {"name": "helioviewer_viewport_tile", "version": 1}
    assert tile["artifact"]["delivery"] == "raw_on_demand"
    assert tile["spatial_use"] == {"eligible": False,
        "reason": "viewport_tile_has_no_validated_solar_surface_projection", "contract": None}


@pytest.mark.parametrize("channel", list(SolarRealtimeDataProvider.AIA_SOURCE_IDS))
def test_cold_tile_acquires_only_aia_bundle_and_one_binary(rig, channel):
    provider, events, state = rig
    image_id = state["ids"][provider.AIA_SOURCE_IDS[channel]]
    tile = provider.latest_aia_tile(channel=channel, jd_tdb=JD, image_id=image_id)
    assert_tile(tile, image_id, channel)
    assert Counter(sid for sid, _ in events["metadata"]) == Counter(provider.AIA_SOURCE_IDS.values())
    assert events["binary"] == [image_id]
    assert events["unrelated"] == [], events


def test_tile_does_not_mutate_or_evict_realtime_snapshot_lru(rig):
    provider, events, state = rig
    provider.latest(jd_tdb=JD)
    before = deepcopy(provider._snapshot_cache)
    events["unrelated"].clear()
    result = provider.latest_aia_tile(jd_tdb=JD + 1)
    assert_tile(result, state["ids"][11])
    assert provider._snapshot_cache == before
    assert events["unrelated"] == []


def test_forced_tile_refresh_only_refreshes_aia_metadata_not_binary_or_other_feeds(rig):
    provider, events, state = rig
    provider.latest_aia_tile(jd_tdb=JD)
    for entries in events.values():
        entries.clear()
    result = provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)
    assert_tile(result, state["ids"][11])
    assert Counter(sid for sid, _ in events["metadata"]) == Counter(provider.AIA_SOURCE_IDS.values())
    assert events["binary"] == []  # Existing force_refresh never bypasses immutable binary cache.
    assert events["unrelated"] == []


def test_control_repeated_tile_and_equal_legacy_alias_reuse_metadata_and_binary(rig):
    provider, events, state = rig
    first = provider.latest_aia_tile(jd=JD)
    before = deepcopy(events)
    second = provider.latest_aia_tile(jd_tdb=JD, jd=JD)
    assert_tile(first, state["ids"][11])
    assert second == first
    assert events == before


def test_control_existing_snapshot_pin_is_used_even_if_upstream_has_advanced(rig):
    provider, events, state = rig
    snapshot = provider.latest(jd_tdb=JD)
    image_id = snapshot["sdo_aia"]["channels"]["aia_193"]["image_id"]
    metadata_before = list(events["metadata"])
    state["ids"][11] = "888888"
    tile = provider.latest_aia_tile(jd_tdb=JD, image_id=image_id)
    assert_tile(tile, image_id)
    assert events["metadata"] == metadata_before
    assert events["binary"] == [image_id]


def test_control_identity_mismatch_never_fetches_binary(rig):
    provider, events, _ = rig
    with pytest.raises(AiaImageIdentityMismatch) as caught:
        provider.latest_aia_tile(jd_tdb=JD, image_id="99999")
    assert caught.value.requested_image_id == "99999"
    assert caught.value.available_image_id == "1011"
    assert events["binary"] == []


def test_control_full_realtime_snapshot_still_acquires_all_sources(rig):
    provider, events, _ = rig
    snapshot = provider.latest(jd_tdb=JD)
    assert snapshot["source_status"]["sdo_aia"]["ok"] is True
    assert events["unrelated"] == ["swpc", "silso"]
    assert Counter(sid for sid, _ in events["metadata"]) == Counter(provider.AIA_SOURCE_IDS.values())
    assert events["binary"] == []


def test_control_bad_unselected_aia_channel_still_blocks_bundle_and_binary(rig):
    provider, events, state = rig
    state["broken_source"] = 12  # 211, not requested 193: preserve current bundle policy.
    with pytest.raises(RuntimeError):
        provider.latest_aia_tile(channel="aia_193", jd_tdb=JD)
    assert 12 in [sid for sid, _ in events["metadata"]]
    assert events["binary"] == []


@pytest.mark.parametrize("offset", [-21601, -21600, 21600, 21601])
def test_control_epoch_window_is_symmetric_inclusive_and_pre_binary(rig, offset):
    provider, events, state = rig
    state["offset"] = offset
    if abs(offset) <= 21600:
        assert_tile(provider.latest_aia_tile(jd_tdb=JD), state["ids"][11])
    else:
        with pytest.raises(RuntimeError):
            provider.latest_aia_tile(jd_tdb=JD)
        assert events["binary"] == []


def test_control_cached_latest_bundle_rechecks_wall_clock_coverage_before_binary(rig):
    provider, events, state = rig
    provider.latest_aia_tile()
    binary_before = list(events["binary"])
    state["utc"] += timedelta(hours=7)
    with pytest.raises(RuntimeError):
        provider.latest_aia_tile()
    assert events["binary"] == binary_before


def test_control_one_deadline_is_shared_by_metadata_and_binary(rig, monkeypatch):
    provider, events, state = rig
    clock = [100.0]
    monkeypatch.setattr(module.time, "monotonic", lambda: clock[0])
    state["after_metadata"] = lambda: clock.__setitem__(0, clock[0] + provider.timeout_s)
    with pytest.raises(RuntimeError):
        provider.latest_aia_tile(jd_tdb=JD)
    assert len(events["metadata"]) == 1
    assert events["binary"] == []
    assert not hasattr(provider._acquisition_state, "deadline_monotonic")


@pytest.mark.parametrize(("kwargs", "exception"), [
    ({"image_id": "01"}, SolarRealtimeFetchError),
    ({"jd_tdb": JD, "jd": JD + 1}, ValueError),
])
def test_control_invalid_identity_or_alias_has_no_acquisition(rig, kwargs, exception):
    provider, events, _ = rig
    with pytest.raises(exception):
        provider.latest_aia_tile(**kwargs)
    assert events == {"unrelated": [], "metadata": [], "binary": []}


@pytest.mark.parametrize(("field", "value", "code"), [
    ("png", b"not a PNG", "invalid_aia_png_signature"),
    ("media", "text/html", "invalid_aia_provider_contract"),
])
def test_control_binary_validation_remains_native_and_not_cached_on_failure(rig, field, value, code):
    provider, events, state = rig
    state[field] = value
    with pytest.raises(SolarRealtimeFetchError) as caught:
        provider.latest_aia_tile(jd_tdb=JD)
    assert caught.value.code == code
    assert events["binary"] == [state["ids"][11]]
    assert provider._binary_cache_bytes == 0
    assert not provider._binary_cache


@pytest.fixture
def http(monkeypatch, rig):
    import server
    from fastapi.testclient import TestClient
    provider, events, state = rig
    monkeypatch.setattr(server.app, "middleware_stack", None)
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": KEY,
    }))
    monkeypatch.setattr(server, "SOLAR_REALTIME_DATA", provider)
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", OrderedDict())
    semaphore = threading.BoundedSemaphore(1)
    monkeypatch.setattr(server, "_solar_aia_tile_concurrent_guard", semaphore)
    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="owned-aia-isolation") as executor:
        monkeypatch.setattr(server, "_aia_tile_executor", executor)
        client = TestClient(server.app, base_url="http://localhost", client=("127.0.0.1", 12345))
        try:
            yield client, provider, events, state
        finally:
            client.close()
    assert semaphore.acquire(blocking=False), "real native completion returns the owned permit"
    semaphore.release()


def test_http_tile_preserves_headers_bytes_and_avoids_unrelated_acquisition(http):
    client, _, events, state = http
    image_id = state["ids"][11]
    response = client.get("/solar/realtime/aia-tile", params={"jd_tdb": JD, "image_id": image_id}, headers={"X-API-Key": KEY})
    assert response.status_code == 200, response.text
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-solar-aia-image-id"] == image_id
    assert response.headers["x-solar-aia-artifact"] == "helioviewer_viewport_tile/v1"
    assert response.headers["x-solar-aia-spatial-use"] == "disabled"
    assert response.headers["cache-control"] == "private, max-age=30, no-store"
    assert response.headers["vary"] == "Authorization, X-API-Key"
    assert events["unrelated"] == [], events


@pytest.mark.parametrize(("params", "headers", "status"), [
    ({}, {}, 401),
    ({"force_refresh": "true"}, {"X-API-Key": KEY}, 400),
    ({"image_id": "01"}, {"X-API-Key": KEY}, 400),
])
def test_control_http_security_and_identity_reject_before_provider(http, params, headers, status):
    client, _, events, _ = http
    response = client.get("/solar/realtime/aia-tile", params=params, headers=headers)
    assert response.status_code == status, response.text
    assert events == {"unrelated": [], "metadata": [], "binary": []}


def test_control_http_identity_drift_remains_409_without_binary(http):
    client, _, events, _ = http
    response = client.get("/solar/realtime/aia-tile", params={"jd_tdb": JD, "image_id": "99999"}, headers={"X-API-Key": KEY})
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "aia_image_identity_mismatch"
    assert events["binary"] == []


# Append-only root-selected dual-cache contract. The original27 prefix is intact.
def test_precedence_unpinned_refresh_uses_new_bundle_without_mutating_full_snapshot(rig):
    provider, events, state = rig
    provider.latest(jd_tdb=JD)
    retained = deepcopy(provider._snapshot_cache)
    state["ids"][11] = "2002"
    assert_tile(provider.latest_aia_tile(jd_tdb=JD, force_refresh=True), "2002")
    metadata_before = list(events["metadata"])
    assert_tile(provider.latest_aia_tile(jd_tdb=JD), "2002")
    assert events["metadata"] == metadata_before
    assert provider._snapshot_cache == retained


def test_precedence_explicit_pin_can_use_old_full_snapshot_after_new_tile_refresh(rig):
    provider, events, state = rig
    provider.latest(jd_tdb=JD)
    state["ids"][11] = "2002"
    assert_tile(provider.latest_aia_tile(jd_tdb=JD, force_refresh=True), "2002")
    metadata_before = list(events["metadata"])
    assert_tile(provider.latest_aia_tile(jd_tdb=JD, image_id="1011"), "1011")
    assert_tile(provider.latest_aia_tile(jd_tdb=JD, image_id="2002"), "2002")
    assert events["metadata"] == metadata_before


def test_precedence_later_realtime_refresh_changes_pin_source_not_unpinned_tile_priority(rig):
    provider, events, state = rig
    provider.latest(jd_tdb=JD)
    state["ids"][11] = "2002"
    provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)
    state["ids"][11] = "3003"
    snapshot = provider.latest(jd_tdb=JD, force_refresh=True)
    assert snapshot["sdo_aia"]["channels"]["aia_193"]["image_id"] == "3003"
    metadata_before = list(events["metadata"])
    assert_tile(provider.latest_aia_tile(jd_tdb=JD), "2002")
    assert_tile(provider.latest_aia_tile(jd_tdb=JD, image_id="3003"), "3003")
    assert events["metadata"] == metadata_before


def test_precedence_force_with_pin_bypasses_both_metadata_caches_without_wrong_binary(rig):
    provider, events, state = rig
    provider.latest(jd_tdb=JD)
    retained = deepcopy(provider._snapshot_cache)
    state["ids"][11] = "2002"
    provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)
    state["ids"][11] = "3003"
    binary_before = list(events["binary"])
    with pytest.raises(AiaImageIdentityMismatch) as caught:
        provider.latest_aia_tile(jd_tdb=JD, image_id="1011", force_refresh=True)
    assert caught.value.available_image_id == "3003"
    assert events["binary"] == binary_before
    assert provider._snapshot_cache == retained


def test_precedence_tile_lru_cap_is_separate_and_retains_full_snapshot(rig):
    provider, events, _ = rig
    provider.latest(jd_tdb=JD)
    retained = deepcopy(provider._snapshot_cache)
    events["metadata"].clear()
    for epoch in (JD + 1, JD + 2, JD + 1):
        provider.latest_aia_tile(jd_tdb=epoch)
    # Configured capacity1 means the first dated bundle must be reacquired.
    assert len(events["metadata"]) == 15
    assert provider._snapshot_cache == retained


def test_precedence_expired_tile_bundle_refreshes_metadata_but_respects_binary_cache(rig, monkeypatch):
    provider, events, state = rig
    clock = [100.0]
    monkeypatch.setattr(module.time, "monotonic", lambda: clock[0])
    provider.latest_aia_tile(jd_tdb=JD)
    events["metadata"].clear()
    clock[0] += provider.cache_ttl_s + 1
    state["ids"][11] = "2002"
    assert_tile(provider.latest_aia_tile(jd_tdb=JD), "2002")
    assert len(events["metadata"]) == 5
    assert events["binary"] == ["1011", "2002"]


def test_precedence_failed_tile_refresh_blocks_unpinned_but_valid_full_pin_still_works(rig, monkeypatch):
    provider, events, state = rig
    clock = [100.0]
    monkeypatch.setattr(module.time, "monotonic", lambda: clock[0])
    provider.latest(jd_tdb=JD)
    state["ids"][11] = "2002"
    provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)
    state["broken_source"] = 12
    with pytest.raises(RuntimeError):
        provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)
    metadata_before = list(events["metadata"])
    clock[0] += 0.5
    with pytest.raises(RuntimeError):
        provider.latest_aia_tile(jd_tdb=JD)
    assert events["metadata"] == metadata_before  # Negative/backoff entry, no hot-loop refetch.
    assert_tile(provider.latest_aia_tile(jd_tdb=JD, image_id="1011"), "1011")
    assert events["metadata"] == metadata_before


def test_precedence_returned_tile_metadata_is_detached_from_cache(rig):
    provider, _, state = rig
    first = provider.latest_aia_tile(jd_tdb=JD)
    first["artifact"]["delivery"] = "owned corruption"
    first["spatial_use"]["eligible"] = True
    assert_tile(provider.latest_aia_tile(jd_tdb=JD), state["ids"][11])


def test_precedence_concurrent_same_epoch_joins_actual_singleflight_before_publication(rig, monkeypatch):
    provider, events, state = rig
    provider.timeout_s = 5.0
    metadata_entered = threading.Event()
    release_metadata = threading.Event()
    follower_waiting = threading.Event()
    native_metadata = provider._fetch_json

    def gated_metadata(url, **kwargs):
        if not metadata_entered.is_set():
            metadata_entered.set()
            assert release_metadata.wait(4), "owned metadata leader deadline"
        return native_metadata(url, **kwargs)

    monkeypatch.setattr(provider, "_fetch_json", gated_metadata)
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="owned-aia-singleflight") as executor:
        first = executor.submit(provider.latest_aia_tile, jd_tdb=JD)
        second = None
        try:
            assert metadata_entered.wait(2), "leader entered native metadata path"
            with provider._lock:
                assert len(provider._inflight_fetches) == 1
                event = next(iter(provider._inflight_fetches.values()))["event"]
            native_wait = event.wait

            def waiting(timeout=None):
                follower_waiting.set()
                return native_wait(timeout)

            monkeypatch.setattr(event, "wait", waiting)
            second = executor.submit(provider.latest_aia_tile, jd_tdb=JD)
            assert follower_waiting.wait(2), "second public call entered actual same-key follower wait"
            assert not first.done() and not second.done()
            release_metadata.set()
            assert_tile(first.result(timeout=2), state["ids"][11])
            assert_tile(second.result(timeout=2), state["ids"][11])
        finally:
            release_metadata.set()
            first.result(timeout=5)
            if second is not None:
                second.result(timeout=5)
    assert Counter(sid for sid, _ in events["metadata"]) == Counter(provider.AIA_SOURCE_IDS.values())
    assert events["binary"] == [state["ids"][11]]
    assert provider._inflight_fetches == {}
