# Task 4 report: F-009 / F-025

Historical implementation report, archived on 2026-11-01. Commands and results
below refer to the implementation worktree and commit stated in the report,
not final integrated acceptance. See README.md for commit mapping and scope.

Status: implementation and native verification complete; independent review is
still required from the controller's reviewer. No push or merge performed.

Worktree: `/home/nomad/ai/projects/worktrees/solar-partials-solar-20261031`  
Branch: `fix/partials-solar-20261031`  
Baseline: `8d330a07`  
Commits, in order:

- `0b40954` — F-009: bound lossless state delivery and reuse unchanged geometry.
- `97b514e` — F-025: align cited rotation profile and qualify illustrative display.

## Implemented contracts

F-009 adds opt-in `delivery=render-v1` at the actual `/solar/physics` route and
makes the first-party SolarPhysicsClient request it. Full version-2 JSON remains
the endpoint default. HTTP gzip is lossless; SHA-256 conditional reuse covers
complete corona features, PFSS lines and Parker lines. Exact hash matches omit
only those arrays; every poll still updates requested epoch, wall freshness,
scalar state and provenance. The client restores arrays only from a previously
accepted matching version. Changed geometry, reconnects and older servers get
complete state. Unknown/missing reuse fails closed, keeps the previous state,
and requests complete geometry next time. Body budgets are 512 KiB encoded and
2 MiB decoded; oversize returns structured 413 without silently truncating
geometry. The browser bounds its decompressed stream and checks a supplied
Content-Length. Tests cover both compressible decoded overflow and poorly
compressible encoded overflow.

F-025 retains the backend's adopted `(14.713, -2.396, -1.787)` deg/day sidereal
profile, binds that coefficient tuple to the actual surface shader material,
and removes the conflicting shader profile/citation. Backend response metadata
now publishes the tuple, DOI and frame; stated periods are derived from the
same function, including the corrected polar period of ~34.188 days. Synthetic
feature evolution and IAU/Carrington frame conventions remain distinct.

The glow mesh explicitly describes its four-*displayed*-Sun-radius extent as
illustrative. Particle streams describe their decorative time-lapse, and the
Sun controls explain that these meanings apply at either scale. The approved
clock, radius compression, physical Parker distances and 2026-10-31 soft alpha
map/particle/upload/bounds/disposal fixes remain intact. No `main.ts` or README
changes were made.

Ruling: choose lossless gzip plus content-addressed conditional arrays rather
than quantization or dropping scientific fields — it preserves every coordinate
and the existing consumer schema at the cost of still computing geometry on
unchanged polls. This is wire delivery work, not a compute cache or latency fix.

Ruling: adopt the existing backend Doppler-feature fit for the display's latitude
shape — the primary paper distinguishes different tracers, so agreement of this
profile does not establish plasma/spot speed calibration. Decorative time stays
explicitly separate from sidereal physical model evolution.

## Actual HTTP wire measurements

`task-4-evidence/wire-probe.py` starts a real local uvicorn process, sends TCP
HTTP requests, reads the compressed bytes with urllib, decompresses and parses
them, and records actual returned epochs/fallback. It uses native high/180 hybrid
model responses, not a generated size estimate or mocked fetch. Final commit:
`97b514e`; raw output is `wire-probe-final.json`.

| Response | Encoded bytes | Decoded bytes | Geometry included |
|---|---:|---:|---|
| Default full JSON | 671,482 | 671,482 | complete legacy state |
| First render-v1 | 262,645 | 671,719 | yes |
| Unchanged geometry | 2,904 | 9,670 | no, reuse matching arrays |
| Changed epoch (2460000.5 → 2460001.5) | 262,357 | 672,150 | yes |
| Reconnect without version | 262,642 | 671,719 | yes |

All responses retained `disabled_unvalidated` hybrid fallback and correct epochs.
At the existing default cadence two successful response bodies per minute are
bounded at 1 MiB encoded, excluding headers/TLS, separate realtime observations
and explicit forced refreshes. The observed high/180 first body is about 61%
smaller than full JSON; stable geometry polls are about 99.6% smaller. The native
HTTP test imposes a separate 16 KiB encoded acceptance budget on reused geometry.
This local measurement does not establish external-provider availability.

## Verification

Red evidence was recorded before implementation:

- Backend delivery: three tests failed on missing gzip/budgets/version validation.
- Client delivery: two tests failed on lost arrays and accepting unknown reuse.
- Legacy compatibility: complete 600 kB response failed before allowing bounded
  complete fallback up to the decoded cap.
- Rotation/display: missing material coefficient binding and scope descriptors;
  backend sample lacked the declared actual coefficient metadata.

Final verification:

- `npm test`: **1687 passed, 2 skipped** (106 passing files / 1 skipped file).
- Full `backend/tests`: **4469 passed, 13 skipped**, two existing FastAPI/Starlette
  deprecation warnings; no failed tests.
- Focused solar model/frames/region/delivery/observational acceptance/consumer:
  **124 passed**.
- `npm run typecheck:ratchet`: passed, **0 new diagnostics**.
- `npm run build`: passed; existing >500 kB chunk warning retained.
- `git diff --check`: passed; worktree clean after the two commits.

Backend command used Python 3.12.13 via the cached offline environment:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend OMP_NUM_THREADS=1 \
OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 \
uv run --offline --no-project --python 3.12.13 \
  --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -p no:cacheprovider -q backend/tests
```

Raw red/green/full/typecheck/build/wire logs are beside this report in
`task-4-evidence/`. Independent review was not replaced by an implementer review.

## Primary source and retained limits

Primary source read: Snodgrass & Ulrich (1990), ApJ 351:309–316, Table 1,
https://articles.adsabs.harvard.edu/pdf/1990ApJ...351..309S,
DOI `10.1086/168467`. Download SHA-256:
`537a2bbb9b2f3fea7169f915ccbfc9b16150e9f5a20a1e941403b7b624462d92`.
The Doppler-residual column lists `(2.972, -0.484, -0.361)` microradians/second.
Its direct conversion is approximately `(14.712456, -2.395972, -1.787078)`
degrees/day; the adopted tuple is an approximation within printed precision and
uncertainties, not a claim that the source prints those exact degree values.

AIA raw viewport tiles remain nonspatial; calibrated full-disk projected input
is not implemented here. Observed forcing stays fail-closed and the retained
GONG/WSA corpus remains qualified to its bounded epoch/features. No independent
speed/forecast/scene calibration is claimed. No new GPU image acceptance was
performed; existing native controller/lifecycle/eruption appearance tests passed.
Oversize render states intentionally fail closed with 413 and retain last good
client state; the scientific full-state endpoint remains available by default.

## Proposed README changes for the root owner

- Explain render-v1's encoded/decoded budgets, current polling cadence and
  conditional geometry reuse; avoid presenting this as a provider/compute cache.
- Cite the Doppler-feature fit and separate sidereal backend evolution,
  coordinate-frame conventions and decorative display time.
- State that the corona glow and eruption streams are illustrative at either
  scale, while realistic feature radius conversion and Parker AU distances have
  their own geometric contracts.
- Keep raw AIA tiles nonspatial and distinguish bounded retained-epoch provider
  evidence from runtime observed-input/forecast/rendering validation.
