# SCN-041/048: independent solar-wind observation overlap

## Scope and outcome

The earlier one-minute real-time capture did not overlap the retained NASA
forecast. A separate NOAA ACE SWEPAM hourly archive does. Original response bytes,
HTTP headers and provenance are retained under
[`solar-wind-overlap-2026-10-14`](solar-wind-overlap-2026-10-14/manifest.json).

This is an **external NASA model versus observations comparison**, not a test of
this application's PFSS/WSA prediction. SCN-041 remains open. Neither a successful
comparison script nor a reference-model forecast substitutes for application
accuracy, magnetic connectivity, arrival-time propagation or calibration.

## Products and comparison rules

- Forecast: NASA CCMC WSA Dashboard `AGONG`, spacecraft `ACE`, October 10-14,
  2026 query. The [provider documentation](https://ccmc.gsfc.nasa.gov/community-tools/WSA-Dashboard/)
  describes six-hour, four-day-ahead ADAPT ensemble-average forecasts. Missing
  forecast values remain missing.
- Observations: [NOAA ACE SWEPAM hourly archive](https://services.swpc.noaa.gov/json/ace/swepam/ace_swepam_1h.json),
  HTTP response dated October 14, 2026, 06:23:24 UTC. The frozen response contains
  618 rows. Admission requires `dsflag == 0` and a finite, positive numeric speed;
  499 rows are admitted before time matching.
- Pair only identical UTC tags. Reject duplicate admitted timestamps. Do not
  interpolate, optimize a lag, replace invalid observations, or fit amplitudes.
- The hourly observed quantity and six-hour forecast sampling have different
  temporal support. Exact tag matching is a transparent exploratory comparison,
  not proof that their averaging conventions or forecast issue times coincide.
- The NASA `AGONG` forecast is not the separately retained `GONG_Z` coronal map.
  No same-input claim is made between those products.

## Frozen result

| Quantity | Result |
| --- | ---: |
| Forecast rows | 17 |
| Nonmissing valid forecast rows | 13 |
| Exact valid observation matches | 11 |
| Coverage of usable forecast | 84.615% |
| Mean forecast-minus-observation bias | -171.599 km/s |
| Mean absolute error | 171.599 km/s |
| Root mean square error | 195.710 km/s |
| Application calibration passed | No; application output was not evaluated |

The two unmatched usable forecast timestamps are retained explicitly in
[`comparison.json`](solar-wind-overlap-2026-10-14/comparison.json). The result is
not presented as an accuracy pass: no new acceptance threshold is invented from
the observed residuals.

## Offline reproduction and regression evidence

```bash
python scripts/compare_wsa_observation_overlap.py
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -q scripts/test_wsa_observation_overlap.py
```

The comparator reads only frozen files, emits their SHA-256 identities, and exits
nonzero if no matching observations exist. Eight regression cases passed on
October 14, 2026: exact-time residual calculation, quality and finite-value
admission, unmatched timestamps, duplicate timestamps, wrong source identity and
the explicit non-calibration result. These are comparison-contract tests, not
eight scientific calibration successes.

## Remaining closure work

Run the application's declared prediction path with independently matched input
provenance and epochs, including its magnetic footpoint and propagation
assumptions. Apply previously declared accuracy criteria to independent dates.
Keep the failing near-surface PFSS comparison and external deployment/AIA coverage
requirements separate. This capture removes one evidence-acquisition obstacle;
it does not close those scientific or deployment requirements.
