Independent review of WSA overlap commit 892d049 and AIA epoch guard commit
938bca0, on evidence-review base f1bb9eb38da9de0a8c03422cc66be3ea1f918ba7.

No Critical defect was reproduced. One Important comparator defect is repaired;
two Important integration findings remain for the parent because they require
changes outside the assigned comparator and AIA dated-helper write scope.

1. Important, fixed: invalid quality/time schemas could acquire valid product labels.

The comparator admitted JSON false and 0.0 as the integer dsflag=0. Python's
ISO parser also padded date-only and incomplete timestamps into apparent midnight
observations. Matching off-hour forecasts/observations were reported as hourly
ACE observations against six-hour forecasts. These are admission/schema defects,
not evidence that the retained provider samples themselves are invalid.

Commit 9e57b5626fbae20ef8068933c2f2b5697f8ae3a3 requires an integer-zero quality
flag, complete ISO timestamps, and the declared UTC sampling grids. Explicit
timezone offsets are normalized before grid and duplicate checks. No timestamp
rounding, interpolation, lag fitting, speed-error threshold, or calibration pass
was introduced. The old unmatched-minute fixture is now an unmatched valid hour;
the exact former minute timestamp has a separate regression requiring rejection.

The expanded comparator tests produce 13 failures and 13 passes against the
original 892d049 module, and 26 passes against the repair. Both the function and
CLI reproduce the entire frozen comparison.json exactly: 11 pairs, 499 accepted
observations, 13 usable forecasts, bias -171.59854818678875 km/s, MAE
171.59854818678875 km/s, and RMSE 195.70960543857925 km/s.

The original response bodies match their manifest SHA-256 identities. The
retained observation headers also match their hash and identify the NOAA ACE
SWEPAM hourly endpoint, not the separate minute-cadence RTSW capture. The NASA
payload declares ACE/AGONG and ensemble-average Vp in km/s; the retained request
and HTTP headers identify the WSA Dashboard endpoint. The separate GONG_Z FITS
product is not substituted. applicationCalibrationPassed remains false.

2. Important, parent handoff: live AIA cache hits bypass the new epoch guard.

The guard correctly rejects out-of-window metadata on acquisition. However,
SolarRealtimeDataProvider._latest shares one cache key for latest(), while
_snapshot_for_delivery does not recheck AIA dates or update AIA freshness. A
five-minute cache hit can therefore return observations older than the same
21,600-second live request window, with source_status.sdo_aia.ok=true.

Actual reproduction uses all five unmodified 2020 captured responses. At wall
time 2020-01-01T05:59:45Z they all satisfy the guard. Advance the clock 100 seconds
without expiring the 300-second cache: only five metadata requests have occurred;
channel ages are [21686, 21676, 21668, 21699, 21692] seconds, but the returned
freshness_s remains 21568 and the source is still marked ok. At 301 seconds,
refresh reaches the guard and correctly returns aia_epoch_unavailable.

This is an existing cache/delivery interaction exposed by the guard review, not
a reason to weaken the acquisition window. Repair belongs in the generic live
snapshot cache/delivery path, outside the assigned dated helper. Dated requests
must retain their separate request-relative coverage and wall-clock freshness.
The reproduction stubs the two unrelated providers only to isolate AIA; all
AIA parsing, epoch checks, snapshot caching, and delivery code are real.

Run from the repository root:

```bash
PYTHONPATH=backend uv run --python 3.12.13 \
  --with-requirements ci/backend-test-requirements.txt python - <<'PY'
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from backend.sim import solar_realtime_data as module

initial = datetime(2020, 1, 1, 5, 59, 45, tzinfo=timezone.utc)
elapsed = [0.0]
class Clock(datetime):
    @classmethod
    def now(cls, tz=None):
        stamp = initial + timedelta(seconds=elapsed[0])
        return stamp.astimezone(tz) if tz else stamp.replace(tzinfo=None)

provider = module.SolarRealtimeDataProvider()
folder = Path('agent-notes/aia-date-coverage-2026-10-14')
metadata = {
    sid: json.loads((folder / f'2020-01-01_{sid}.json').read_bytes())
    for sid in provider.AIA_SOURCE_IDS.values()
}
queries = []
def fetch_json(url):
    query = module.urllib.parse.parse_qs(module.urllib.parse.urlsplit(url).query)
    queries.append(query)
    return metadata[int(query['sourceId'][0])]

with patch.object(module, 'datetime', Clock), \
     patch.object(module.time, 'monotonic', lambda: elapsed[0]), \
     patch.object(provider, '_fetch_json', fetch_json), \
     patch.object(provider, '_fetch_swpc', return_value={
         'time_tag': initial.isoformat(), 'activity_proxy': 0.2}), \
     patch.object(provider, '_fetch_silso', return_value={'date': '2019-12-31'}):
    provider.latest()
    elapsed[0] = 100.0
    result = provider.latest()
    ages = [(Clock.now(timezone.utc) - datetime.fromisoformat(row['image_date']))
            .total_seconds() for row in result['sdo_aia']['channels'].values()]
    print('ok:', result['source_status']['sdo_aia']['ok'], 'actual ages:', ages,
          'reported freshness:', result['sdo_aia']['freshness_s'],
          'metadata requests:', len(queries))
    # This assertion fails on the reviewed parent code and remains a handoff.
    assert result['source_status']['sdo_aia']['ok'] is False or max(ages) <= 21600
PY
```

3. Important, parent handoff: scalar JDTDB round trips can fail at leap-second midnight.

The new public-path cache test exposed a pre-existing solar_time.py conversion
failure before AIA metadata acquisition. Collapsing Astropy's two-part time to
the application's scalar JDTDB can round an ordinary UTC midnight a few
microseconds into the preceding leap second. jd_tdb_to_utc_datetime then raises
ValueError because datetime cannot represent that instant. Reproduced dates
include 1990-01-01, 2012-07-01, 2015-07-01, and 2017-01-01. The last three are
within the AIA mission era; this is not merely an unavailable pre-mission image.

For example, 2017-01-01T00:00:00 UTC becomes JDTDB 2457754.50080074 and raises
instead of reaching the dated acquisition helper. A fix requires an explicit
precision/leap-second policy in solar_time.py. Silently changing the AIA window
or calling a scientific coverage test a pass would not address that cause.

```bash
PYTHONPATH=backend uv run --python 3.12.13 \
  --with-requirements ci/backend-test-requirements.txt python - <<'PY'
from astropy.time import Time
from backend.sim.solar_time import jd_tdb_to_utc_datetime
jd = float(Time('2017-01-01T00:00:00', scale='utc').tdb.jd)
print(jd)
print(jd_tdb_to_utc_datetime(jd))  # Raises ValueError on the reviewed code.
PY
```

The added dated-cache isolation tests request 1990 noon so that they actually
reach the AIA guard. The original 25 captured request epochs, including 1990
midnight, remain unchanged in the direct-helper tests. That separation preserves
the original real-evidence claim and records the public-path limitation honestly.

Validation completed in the assigned evidence-review worktree:

```bash
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -q -ra \
  scripts/test_wsa_observation_overlap.py \
  backend/tests/test_solar_aia_epoch_coverage.py \
  backend/tests/test_solar_realtime_data_cache.py \
  backend/tests/test_solar_realtime_data_transport.py \
  backend/tests/test_solar_realtime_recovery.py \
  backend/tests/test_solar_security.py
```

Result: 243 passed, zero skips, two upstream dependency deprecation warnings.
This passing targeted gate does not include a fix for either parent handoff.
No full backend or native suite was rerun for this unrelated review.

All 25 AIA body/header hashes match the frozen manifest. The replay now checks
the actual outgoing source/date query against its captured request. Additional
passing cases cover offset-aware whole-second requests, separate dated cache
identities, typed epoch errors in source status, failure backoff and recovery,
rejection of last-good AIA after an invalid refresh, and prevention of tile
cache access when epoch coverage fails. Spatial eligibility remains false.

No production AIA helper change was needed within the assigned scope. Frozen
captures, scientific thresholds, other providers, solar_physics, controllers,
Moon artifacts, and the canonical master register were not modified.

## Follow-up: live AIA cache handoff resolved

The live-cache handoff above is now implemented in the evidence-review worktree.
Every successful AIA delivery revalidates all five channel timestamps, including
cache hits and tile requests. A live cache entry expires at the oldest channel's
six-hour coverage limit. A wall-clock jump cannot bypass the delivery guard, and
malformed channel collections fail closed without reaching binary acquisition.
Malformed acquisitions retain bounded retry backoff rather than creating a hot
loop. Acquisition errors are preserved rather than replaced by delivery errors.

The symmetric, inclusive +/-21600-second request window and whole-second request
normalization are unchanged. Explicit dated requests retain their own epoch
coverage regardless of today's date; their wall-clock freshness is recomputed on
every delivery. Historical data is not reclassified as live, spatial eligibility
remains false, and AIA metadata still supplies no activity/calibration inference.
Delivery changes are made on a deep copy, not on retained cache payloads.

Validation:

- New `backend/tests/test_solar_aia_live_cache.py`: 14 passing cases. Running the
  same suite against the pre-fix `6b443d7` provider module gives 12 failures and
  two passes, with no skips. This baseline execution was in-memory only.
- Combined AIA live-cache/epoch, realtime cache/transport/recovery, and security
  suites: **231 passed, zero skipped**, two existing dependency deprecations.
- The dated-cache identity assertion now compares channels and request epoch,
  while explicitly requiring freshness to advance rather than remain frozen.
- No other providers, solar physics, controller, main, or moon files changed.

The scalar-JD leap-boundary handoff remains open pending the explicitly requested
precision-policy decision; this cache fix does not alter `solar_time.py`.
