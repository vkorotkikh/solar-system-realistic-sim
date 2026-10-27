# SCN-048/049: real AIA archive coverage and epoch rejection

## Reproduced defect

The application's Helioviewer metadata path accepted a syntactically valid
nearest-image response without checking whether the selected observation covered
the requested simulation epoch. HTTP 200 does not establish that coverage: the
[provider API](https://api.helioviewer.org/docs/v2/api/api_groups/official_clients.html)
returns the closest available image, not a guarantee of a contemporaneous image.

Twenty-five bounded live requests on October 14, 2026 covered all five configured
AIA sources (`8`, `10`, `11`, `12`, `13`) at five UTC epochs. Every response was HTTP
200 with valid metadata. Original response bytes, headers, per-request timing,
URLs and SHA-256 identities are retained in
[`aia-date-coverage-2026-10-14/manifest.json`](aia-date-coverage-2026-10-14/manifest.json).

| Requested UTC epoch | Actual returned observations | Coverage result |
| --- | --- | --- |
| 1990-01-01 00:00 | 2010-06-02, all five channels | Reject: approximately 20 years away |
| 2011-01-01 00:00 | Within 12 seconds, all five channels | Sampled coverage available |
| 2020-01-01 00:00 | Within 17 seconds, all five channels | Sampled coverage available |
| 2026-10-14 00:00 | Within 17 seconds, all five channels | Sampled coverage available |
| 2050-01-01 00:00 | 2026-10-14 around 06:00, all five channels | Reject: approximately 23 years away |

The 2050 case is particularly important: an unrelated *current* image can pass a
wall-clock freshness check. Request-relative coverage and wall-clock freshness
must remain separate conditions.

## Repair and compatibility

`SolarRealtimeDataProvider._fetch_helioviewer_closest` now rejects observations
more than six hours before or after the requested UTC instant. The limit uses
the existing AIA six-hour eligibility window rather than deriving a threshold
from these samples. Exact boundary observations are admitted. The request instant
is normalized to the same whole-second precision sent to the upstream API.

Rejected observations raise the existing typed fetch error with code
`aia_epoch_unavailable`, allowing existing source-status/fallback handling to
report unavailable data. Metadata canonicalization, image identity validation,
owned transport deadlines, and the raw-viewport spatial-use prohibition remain.
An admitted timestamp does **not** authorize using the viewport tile as a solar
surface texture or as calibrated physical forcing.

Two existing metadata-shape tests previously paired a fixed September image with
the live machine clock. Their clocks are now fixed to their declared image
epoch. A viewport-artifact test likewise requests its fixture's actual epoch.
Assertions on metadata safety, canonicalization, caching and nonspatial use were
preserved; production date validation was not weakened to accommodate stale
fixtures.

## Regression evidence

Before the production guard, the new tests had **12 failures and 17 passes**:
all ten real out-of-coverage requests and both just-outside-boundary requests
were incorrectly admitted.

After the guard and epoch-consistent fixtures, the following gate passed
**163 tests**, with no skips:

```bash
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -q \
  backend/tests/test_solar_aia_epoch_coverage.py \
  backend/tests/test_solar_realtime_data_cache.py \
  backend/tests/test_solar_realtime_recovery.py \
  backend/tests/test_solar_realtime_data_transport.py
```

The 29 new cases replay frozen provider bytes without network access and include
SHA-256 checks, valid historical coverage, both unavailable date directions,
inclusive boundary behavior and preservation of the nonspatial artifact policy.

## Limits

- The live capture uses a 12-second diagnostic per-request cap, not the production
  aggregate acquisition budget. It does not replace the sustained dev/preview
  delivery benchmark.
- Five sampled dates do not prove continuous archive availability. Missing data
  inside a nominal date range must still fail the same request-relative check.
- Metadata availability does not establish tile-byte delivery, projection,
  scientific calibration, or remote application/TLS deployment correctness.
- This repairs the date-coverage child of SCN-048/049. Those parent rows remain
  partial while their other explicit requirements are outstanding.
