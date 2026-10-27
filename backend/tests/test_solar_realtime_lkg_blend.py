"""A last-known-good SWPC restore must not replace the fresh combined activity blend (review I-2).

`_fetch_snapshot` blends the SWPC proxy (weight 0.45) with the AIA proxy (weight 0.2).
When SWPC fails and its retained sample is restored, the delivered combined proxy must be the
blend of the restored SWPC proxy with the fresh AIA proxy, not the stale SWPC proxy alone.
"""
from datetime import datetime, timedelta, timezone

import pytest

from sim.solar_realtime_data import SolarRealtimeDataProvider

SWPC_WEIGHT, AIA_WEIGHT = 0.45, 0.2


@pytest.fixture
def clocked_provider(monkeypatch):
    provider = SolarRealtimeDataProvider()
    elapsed = [0.0]
    epoch = datetime(2026, 10, 14, tzinfo=timezone.utc)
    monkeypatch.setattr('sim.solar_realtime_data.time.monotonic', lambda: elapsed[0])
    monkeypatch.setattr(provider, '_utc_now', lambda: epoch + timedelta(seconds=elapsed[0]))
    return provider, elapsed, epoch


def _snapshot(epoch, *, swpc_proxy, aia_proxy):
    """What _fetch_snapshot returns: SWPC absent means its fetch failed, AIA always fresh."""
    tag = epoch.isoformat().replace('+00:00', 'Z')
    swpc_ok = swpc_proxy is not None
    if swpc_ok:
        combined = (swpc_proxy * SWPC_WEIGHT + aia_proxy * AIA_WEIGHT) / (SWPC_WEIGHT + AIA_WEIGHT)
    else:
        combined = aia_proxy
    return {
        'source_status': {
            'swpc': {'ok': swpc_ok} if swpc_ok else {'ok': False, 'error': 'HTTP 503'},
            'silso': {'ok': True},
            'sdo_aia': {'ok': True},
            'gong_synoptic': {'ok': False, 'attempted': False, 'runtime_eligible': False},
        },
        'swpc': {'time_tag': tag, 'solar_wind_speed_kms': 450.0, 'activity_proxy': swpc_proxy} if swpc_ok else None,
        'sdo_aia': {'activity_proxy': aia_proxy},
        'combined_activity_proxy': combined,
    }


def test_restored_swpc_is_blended_with_the_fresh_aia_proxy(clocked_provider, monkeypatch):
    provider, elapsed, epoch = clocked_provider
    responses = iter([
        _snapshot(epoch, swpc_proxy=0.8, aia_proxy=0.2),
        _snapshot(epoch, swpc_proxy=None, aia_proxy=0.4),
    ])
    monkeypatch.setattr(provider, '_fetch_snapshot', lambda _jd: next(responses))
    first = provider.latest()
    assert first['combined_activity_proxy'] == pytest.approx((0.8 * SWPC_WEIGHT + 0.2 * AIA_WEIGHT) / 0.65)

    elapsed[0] = 301
    restored = provider.latest()
    assert restored['source_status']['swpc']['acquisition'] == 'last_known_good'
    assert restored['swpc']['activity_proxy'] == 0.8
    # Before the fix this was 0.8: the stale SWPC proxy alone, discarding the fresh AIA 0.4.
    assert restored['combined_activity_proxy'] == pytest.approx((0.8 * SWPC_WEIGHT + 0.4 * AIA_WEIGHT) / 0.65)


def test_restore_without_a_fresh_aia_proxy_still_uses_the_retained_swpc_proxy(clocked_provider, monkeypatch):
    provider, elapsed, epoch = clocked_provider
    failed = _snapshot(epoch, swpc_proxy=None, aia_proxy=0.4)
    failed['sdo_aia'] = None
    failed['source_status']['sdo_aia'] = {'ok': False, 'error': 'HTTP 502'}
    failed['combined_activity_proxy'] = None
    responses = iter([_snapshot(epoch, swpc_proxy=0.8, aia_proxy=0.2), failed])
    monkeypatch.setattr(provider, '_fetch_snapshot', lambda _jd: next(responses))
    provider.latest()
    elapsed[0] = 301
    assert provider.latest()['combined_activity_proxy'] == pytest.approx(0.8)
