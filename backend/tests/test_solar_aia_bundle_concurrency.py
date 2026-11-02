"""SOL-AIA-FANOUT common acquisition must not cache caller pin mismatches.

Owned fixture body is byte-copied from immutable36; actual provider acquisition,
normalization, cache and single-flight execute. No network or observed image.
These are pre-implementation compatibility controls, not new incident REDs.
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


def test_pin_mismatch_does_not_poison_following_valid_epoch_request(rig):
    provider, events, state = rig
    with pytest.raises(AiaImageIdentityMismatch) as caught:
        provider.latest_aia_tile(jd_tdb=JD, image_id="99999")
    assert caught.value.requested_image_id == "99999"
    assert caught.value.available_image_id == "1011"
    assert events["binary"] == []
    assert provider._inflight_failures == {}
    metadata_before = list(events["metadata"])
    assert_tile(provider.latest_aia_tile(jd_tdb=JD, image_id="1011"), "1011")
    assert events["metadata"] == metadata_before
    assert Counter(sid for sid, _ in events["metadata"]) == Counter(provider.AIA_SOURCE_IDS.values())
    assert events["binary"] == ["1011"]
    assert provider._inflight_fetches == {}
    assert provider._inflight_failures == {}


def test_different_pin_and_channel_followers_share_metadata_not_identity_errors(rig, monkeypatch):
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
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="owned-aia-pin-flight") as executor:
        first = executor.submit(provider.latest_aia_tile, jd_tdb=JD, channel="aia_193", image_id="99999")
        second = None
        try:
            assert metadata_entered.wait(2), "mismatching caller entered native metadata acquisition"
            with provider._lock:
                assert len(provider._inflight_fetches) == 1
                event = next(iter(provider._inflight_fetches.values()))["event"]
            native_wait = event.wait

            def waiting(timeout=None):
                follower_waiting.set()
                return native_wait(timeout)

            monkeypatch.setattr(event, "wait", waiting)
            second = executor.submit(provider.latest_aia_tile, jd_tdb=JD, channel="aia_171", image_id="1010")
            assert follower_waiting.wait(2), "valid other-channel caller entered actual shared follower wait"
            assert not first.done() and not second.done()
            release_metadata.set()
            with pytest.raises(AiaImageIdentityMismatch) as caught:
                first.result(timeout=2)
            assert caught.value.requested_image_id == "99999"
            assert caught.value.available_image_id == "1011"
            assert_tile(second.result(timeout=2), "1010", "aia_171")
        finally:
            release_metadata.set()
            # Wait for ownership retirement without re-raising the deliberately
            # mismatching leader result or masking a failure in the try body.
            first.exception(timeout=5)
            if second is not None:
                second.exception(timeout=5)
    assert Counter(sid for sid, _ in events["metadata"]) == Counter(provider.AIA_SOURCE_IDS.values())
    assert events["binary"] == ["1010"]
    assert provider._inflight_fetches == {}
    assert provider._inflight_failures == {}
    assert not any(thread.name.startswith("owned-aia-pin-flight") for thread in threading.enumerate())


def test_late_singleflight_leader_rechecks_bundle_published_after_its_cache_miss(rig, monkeypatch):
    provider, events, state = rig
    provider.timeout_s = 5.0
    missed_cache = threading.Event()
    release_first = threading.Event()
    native_singleflight = provider._singleflight_fetch

    def gate_before_native_singleflight(key, fetch_fn, **kwargs):
        if (threading.current_thread().name.startswith("owned-aia-missed-cache")
                and isinstance(key, tuple) and key[1:] == ("jd_tdb", JD)
                and not missed_cache.is_set()):
            missed_cache.set()
            assert release_first.wait(4), "owned cache-miss gate deadline"
        return native_singleflight(key=key, fetch_fn=fetch_fn, **kwargs)

    monkeypatch.setattr(provider, "_singleflight_fetch", gate_before_native_singleflight)
    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="owned-aia-missed-cache") as executor:
        first = executor.submit(provider.latest_aia_tile, jd_tdb=JD)
        try:
            assert missed_cache.wait(2), "first public call missed before joining native single-flight"
            assert not first.done()
            assert_tile(provider.latest_aia_tile(jd_tdb=JD), "1011")
            assert provider._inflight_fetches == {}  # The actual intervening leader retired.
            assert len(events["metadata"]) == 5
            release_first.set()
            assert_tile(first.result(timeout=2), "1011")
        finally:
            release_first.set()
            first.exception(timeout=5)
    assert Counter(sid for sid, _ in events["metadata"]) == Counter(provider.AIA_SOURCE_IDS.values())
    assert events["binary"] == ["1011"]
    assert provider._inflight_fetches == {}
    assert not any(thread.name.startswith("owned-aia-missed-cache") for thread in threading.enumerate())


def test_wrong_pin_uses_valid_full_identity_after_dedicated_refresh_failure(rig):
    provider, events, state = rig
    provider.latest(jd_tdb=JD)
    state["ids"][11] = "2002"
    provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)
    state["broken_source"] = 12
    with pytest.raises(RuntimeError):
        provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)
    metadata_before = list(events["metadata"])
    binary_before = list(events["binary"])
    with pytest.raises(AiaImageIdentityMismatch) as caught:
        provider.latest_aia_tile(jd_tdb=JD, image_id="99999")
    assert caught.value.requested_image_id == "99999"
    assert caught.value.available_image_id == "1011"
    assert events["metadata"] == metadata_before
    assert events["binary"] == binary_before


def test_forced_follower_cannot_reuse_cache_only_leader_recheck(rig, monkeypatch):
    provider, events, state = rig
    provider.timeout_s = 6.0
    first_missed = threading.Event()
    allow_recheck = threading.Event()
    rechecked = threading.Event()
    release_result = threading.Event()
    forced_progress = threading.Event()
    roles = {}
    native_singleflight = provider._singleflight_fetch
    native_metadata = provider._fetch_json

    def gated_singleflight(key, fetch_fn, **kwargs):
        if (threading.get_ident() == roles.get("first") and isinstance(key, tuple)
                and key[1:] == ("jd_tdb", JD) and not first_missed.is_set()):
            first_missed.set()
            assert allow_recheck.wait(4), "owned initial cache-miss deadline"

            def held_result():
                result = fetch_fn()
                rechecked.set()
                assert release_result.wait(4), "owned cache-only result deadline"
                return result

            return native_singleflight(key=key, fetch_fn=held_result, **kwargs)
        return native_singleflight(key=key, fetch_fn=fetch_fn, **kwargs)

    def observe_forced_metadata(url, **kwargs):
        if threading.get_ident() == roles.get("force"):
            forced_progress.set()
        return native_metadata(url, **kwargs)

    def first_call():
        roles["first"] = threading.get_ident()
        return provider.latest_aia_tile(jd_tdb=JD)

    def forced_call():
        roles["force"] = threading.get_ident()
        return provider.latest_aia_tile(jd_tdb=JD, force_refresh=True)

    monkeypatch.setattr(provider, "_singleflight_fetch", gated_singleflight)
    monkeypatch.setattr(provider, "_fetch_json", observe_forced_metadata)
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="owned-aia-force-recheck") as executor:
        first = executor.submit(first_call)
        forced = None
        try:
            assert first_missed.wait(2)
            assert_tile(provider.latest_aia_tile(jd_tdb=JD), "1011")
            state["ids"][11] = "2002"
            allow_recheck.set()
            assert rechecked.wait(2)
            with provider._lock:
                assert len(provider._inflight_fetches) == 1
                event = next(iter(provider._inflight_fetches.values()))["event"]
            native_wait = event.wait

            def observe_wait(timeout=None):
                if threading.get_ident() == roles.get("force"):
                    forced_progress.set()
                return native_wait(timeout)

            monkeypatch.setattr(event, "wait", observe_wait)
            forced = executor.submit(forced_call)
            assert forced_progress.wait(2), "force caller joined native wait or began fresh metadata"
            assert not first.done()
            release_result.set()
            assert_tile(first.result(timeout=2), "1011")
            assert_tile(forced.result(timeout=2), "2002")
        finally:
            allow_recheck.set()
            release_result.set()
            first.exception(timeout=5)
            if forced is not None:
                forced.exception(timeout=5)
    assert len(events["metadata"]) == 10
    assert events["binary"] == ["1011", "2002"]
    assert provider._inflight_fetches == {}
    assert not any(thread.name.startswith("owned-aia-force-recheck") for thread in threading.enumerate())
