"""SCN-010: a failed refresh must not hide recovery or extend sample age."""
from datetime import datetime, timedelta, timezone

import pytest

from sim.solar_realtime_data import SolarRealtimeDataProvider


@pytest.fixture
def clocked_provider(monkeypatch):
    provider = SolarRealtimeDataProvider()
    elapsed = [0.0]
    epoch = datetime(2026, 10, 14, tzinfo=timezone.utc)
    monkeypatch.setattr('sim.solar_realtime_data.time.monotonic', lambda: elapsed[0])
    monkeypatch.setattr(provider, '_utc_now', lambda: epoch + timedelta(seconds=elapsed[0]))
    return provider, elapsed, epoch


def snapshot(epoch, *, good=True, partial=False):
    tag = epoch.isoformat().replace('+00:00', 'Z')
    return {
        'source_status': {
            'swpc': {'ok': good},
            'silso': {'ok': not partial},
            'sdo_aia': {'ok': not partial},
            'gong_synoptic': {'ok': False, 'attempted': False, 'runtime_eligible': False},
        },
        'swpc': {'time_tag': tag, 'solar_wind_speed_kms': 450.0, 'activity_proxy': .2} if good else None,
        'combined_activity_proxy': .2 if good else None,
    }


@pytest.mark.parametrize('partial', [False, True])
def test_failure_or_partial_snapshot_retries_in_seconds(clocked_provider, monkeypatch, partial):
    provider, elapsed, epoch = clocked_provider
    responses = iter([snapshot(epoch, good=partial, partial=partial), snapshot(epoch)])
    calls = []
    def fetch(_jd):
        calls.append(elapsed[0])
        return next(responses)
    monkeypatch.setattr(provider, '_fetch_snapshot', fetch)
    provider.latest()
    elapsed[0] = 1
    provider.latest()
    assert len(calls) == 1  # bounded retry backoff, not a hot loop
    elapsed[0] = 6
    recovered = provider.latest()
    assert len(calls) == 2
    assert recovered['swpc']['solar_wind_speed_kms'] == 450


def test_last_good_wind_survives_failure_but_never_outlives_source_age(clocked_provider, monkeypatch):
    provider, elapsed, epoch = clocked_provider
    responses = iter([snapshot(epoch), snapshot(epoch, good=False), snapshot(epoch, good=False)])
    monkeypatch.setattr(provider, '_fetch_snapshot', lambda _jd: next(responses))
    provider.latest()
    elapsed[0] = 301
    fallback = provider.latest()
    assert fallback['swpc']['solar_wind_speed_kms'] == 450
    assert fallback['swpc']['age_s'] == 301
    assert fallback['source_status']['swpc']['acquisition'] == 'last_known_good'
    assert fallback['source_status']['swpc']['refresh_ok'] is False
    assert fallback['cache_state'] == 'partial'
    fallback['swpc']['solar_wind_speed_kms'] = 999
    elapsed[0] = 302
    assert provider.latest()['swpc']['solar_wind_speed_kms'] == 450
    elapsed[0] = 901
    expired = provider.latest()
    assert expired['swpc'] is None
    assert expired['combined_activity_proxy'] is None


def test_last_good_wind_is_usable_when_every_refresh_source_failed(clocked_provider, monkeypatch):
    provider, elapsed, epoch = clocked_provider
    responses = iter([
        snapshot(epoch, partial=True),
        snapshot(epoch, good=False, partial=True),
    ])
    monkeypatch.setattr(provider, '_fetch_snapshot', lambda _jd: next(responses))

    provider.latest()
    elapsed[0] = 6
    fallback = provider.latest()

    assert fallback['swpc']['solar_wind_speed_kms'] == 450
    assert fallback['source_status']['swpc']['ok'] is True
    assert fallback['source_status']['swpc']['acquisition'] == 'last_known_good'
    assert fallback['source_status']['swpc']['refresh_ok'] is False
    assert fallback['source_status']['silso']['ok'] is False
    assert fallback['source_status']['sdo_aia']['ok'] is False
    assert fallback['cache_state'] == 'partial'


def test_last_good_wind_cannot_cross_epoch_cache_identity(clocked_provider, monkeypatch):
    provider, _, epoch = clocked_provider
    responses = iter([snapshot(epoch), snapshot(epoch, good=False)])
    monkeypatch.setattr(provider, '_fetch_snapshot', lambda _jd: next(responses))
    provider.latest(jd_tdb=2460000)
    assert provider.latest(jd_tdb=2460001)['swpc'] is None


def test_last_good_cache_evicts_old_epochs(clocked_provider, monkeypatch):
    provider, _, epoch = clocked_provider
    provider.snapshot_cache_max_entries = 2
    good = [True]
    monkeypatch.setattr(provider, '_fetch_snapshot', lambda _jd: snapshot(epoch, good=good[0]))
    for jd in [2460000, 2460001, 2460002]:
        provider.latest(jd_tdb=jd)
    good[0] = False
    assert provider.latest(jd_tdb=2460000, force_refresh=True)['swpc'] is None
    assert provider.latest(jd_tdb=2460002, force_refresh=True)['swpc']['solar_wind_speed_kms'] == 450


def test_partial_deadline_result_retains_wind_and_retries(clocked_provider, monkeypatch):
    provider, elapsed, epoch = clocked_provider
    provider.timeout_s = 1
    def fetch(_jd):
        elapsed[0] += 1.1  # Source deadline has expired and its worker was reaped.
        return snapshot(epoch, partial=True)
    monkeypatch.setattr(provider, '_fetch_snapshot', fetch)
    delivered = provider.latest()
    assert delivered['swpc']['solar_wind_speed_kms'] == 450
    assert delivered['cache_state'] == 'partial'
    elapsed[0] += 6
    assert provider.latest()['swpc']['age_s'] > delivered['swpc']['age_s']
