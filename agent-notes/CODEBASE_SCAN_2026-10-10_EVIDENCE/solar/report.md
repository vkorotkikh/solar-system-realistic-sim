# Solar/PFSS/provider audit evidence — 2026-10-10

Read-only source sweep and independent offline probes against the selected immutable extractions. No product code was changed. This report does not claim all defects were found or that observed solar science is production ready.

| Branch label | Exact commit | Applicability |
|---|---|---|
| main | `e7de6cc20ea0880da230432ea0c44f8f6ae93829` | Main evidence below |
| ci (`fix/ci-red-on-main`) | `0523a5bc94360f281f5c8c692b16a4fbc6dd60bc` | Same Git tree as main, `7feafab6cfd67455cc4bea8c47cba08e95bbeab6`; all main source findings apply |
| trajectory | `e40fc8cff85a8c7cf5dd24d0a135552faf424a20` | Older solar implementation; separate evidence |

Source paths below are branch-qualified relative paths under `/tmp/solar-sweep-2026-10-10-j1gnowo_/`. Line references are for those immutable snapshots, not the working checkout. Main and trajectory were executed using their separately installed Python 3.12 environments; reported NumPy versions are 2.5.2 and 2.5.3 respectively. Generic suites and process/load execution are owned by the parent audit and are not duplicated here.

## Confirmed findings

### SOL-01: negative snapshots hide recovery for the full successful-data TTL (SCN-010)

- **Priority/state:** P1 / observed. **Branches:** main and ci reproduced; trajectory same retained mechanism by source review.
- **Source:** `main/backend/sim/solar_realtime_data.py:388` returns `cache_ttl_s` when SWPC status is not OK; `:630–645` publishes the returned snapshot anyway; `:620–627` returns it until expiry. `_fetch_snapshot_with_deadline` at `:2574–2638` converts individual provider exceptions into ordinary returned snapshots. Trajectory counterpart `backend/sim/solar_realtime_data.py:118–170`, provider exception collection `:825` onward.
- **Root cause:** the short 4.5-second singleflight exception backoff is bypassed when a provider failure is represented in an ordinary snapshot. Failure snapshots get the normal 300-second lifetime. Expired good aggregate snapshots are removed; the separately improved SILSO last-known-good policy does not repair SWPC/AIA aggregate recovery.
- **Observed:** with a controlled monotonic clock and actual `latest()`/snapshot/cache code, SWPC fails at t=0 and becomes available at t=5. Calls at t=5 and t=299 return the original failed status without invoking SWPC. Only t=301 retries and recovers. SWPC acquisition log is `[100, 401]`, statuses at offsets `[0,5,299,301]` are `[false,false,false,true]`. Companion sources were safely replaced with deterministic failures; no remote service was used.
- **Expected:** a failed source should become eligible for refresh after its explicitly defined failure backoff; successful/stale source data and failure retry lifetimes must be distinct. A client can manually force refresh, but ordinary polling should recover without waiting five minutes after a transient failure.
- **Evidence:** [probe-main.json](probe-main.json), `outage_cache`; [probe_solar.py](probe_solar.py). **Confidence:** high for main/ci runtime mechanism; trajectory source-confirmed, not separately clock-probed.
- **Acceptance:** outage → recovery before normal TTL, with both fully failed and partially failed snapshots; assert bounded provider retries after backoff, truthful per-source age/state, and preservation of the established singleflight and SILSO last-known-good behavior.

### SOL-02: realtime header parsing/DNS can retain worker permits past the acquisition deadline (SCN-004 residual)

- **Priority/state:** P1 / observed. **Branches:** main and ci; trajectory has the older unrestricted urllib mechanism but was not separately subjected to this new socket probe.
- **Source:** `main/backend/sim/solar_realtime_data.py:1027–1035` calls synchronous `urllib` `opener.open(timeout=remaining)`; `:1194–1199` cannot check its absolute deadline until open returns. Runtime server calls use the dedicated thread executor at `main/backend/server.py:3013–3042`, rather than the killable physics process runner.
- **Root cause:** urllib's socket inactivity timeout does not implement an absolute header deadline, and does not impose an absolute DNS resolver deadline. The new body `read1` loop correctly addresses body-drip behavior; it starts only after the blocking opener has completed headers. Application response timeout does not stop that thread or recover its owned permit.
- **Observed:** actual urllib/http.client header parsing with local `socketpair` sockets and HTTPS connection attachment replaced to avoid the network. A 50 ms budget, with a header byte arriving every 20 ms, returns only after approximately 0.404 s and then reports `acquisition_deadline`. A resolver stub that blocks for 0.20 s returns `URLError` after approximately 0.201 s despite the same 50 ms budget. The resolver case establishes lack of interruption, not the frequency of real DNS stalls. All sockets/threads finish in the probe.
- **Expected:** source acquisition should cease and release resources within the declared deadline plus bounded cleanup, including DNS and response headers. Remote failure should not permanently occupy the small live-data pool.
- **Evidence:** [probe-main.json](probe-main.json), `realtime_drip_headers` and `realtime_delayed_dns`; [probe_solar.py](probe_solar.py). **Confidence:** high for mechanism. API-wide saturation duration/load is not measured here.
- **Acceptance:** repeat delayed DNS, byte-drip headers, byte-drip bodies, cancellation and recovery through the actual endpoint/runner. Require bounded completion or kill/reap and permit recovery, not only a timely HTTP timeout response.
- **Related offline GONG limitation, not another shipped-runtime incident:** `main/backend/sim/gong_magnetogram.py:1003` retains `HTTPResponse.read(n)`. Same 50 ms body budget with 20 bytes dripped every 20 ms blocks ~0.40 s before `read_timeout`; `:1120` also uses blocking `response.begin()`. GONG's direct resolver limitation is documented at `:1031–1038`. Main explicitly disables observed runtime acquisition, so this is an additional enabling gate, not evidence that current physics requests call that transport.

### SOL-03: Hathaway “normalized” envelope uses the wrong peak and clips a 15-month plateau (SCN-042 split)

- **Priority/state:** P2 / observed. **Branches:** all three.
- **Source:** `main/backend/sim/solar_physics.py:125–143`; `trajectory/backend/sim/solar_physics.py:123–141`. Main `_activity_index` consumes this envelope at `:408–414`; trajectory equivalent consumes the same normalization.
- **Root cause:** the claimed analytic peak `b*sqrt(3/2)` applies only when `c=0`. The actual implemented function is `x^3/(exp(x^2)-c)`, whose nonzero peak satisfies `(3-2*x^2)*exp(x^2)=3*c`. The shipped parameters are `b=54`, `c=.71`; dividing by the value at the wrong peak then clamping hides the error as a plateau.
- **Observed:** independent scalar bisection of that differentiated equation yields peak month **58.3897591257**, while the denominator uses **66.1362230551**. Actual peak/denominator ratio is **1.03433097105**. Sampling the real normalization at 0.01-month spacing gives exactly 1.0 throughout approximately **51.03–66.13 months**. Both branches produce identical observations.
- **Expected:** normalize by the maximum of the actual chosen function for the actual `c`, or explicitly document and name an intentionally clipped visualization envelope. The current analytic-peak comment is mathematically incorrect.
- **Evidence:** `hathaway` in [probe-main.json](probe-main.json) and [probe-trajectory.json](probe-trajectory.json). This is an internal mathematical consistency check, not comparison against observed solar-cycle data. **Confidence:** high.
- **Acceptance:** independent derivative-zero check for the configured parameters, peak normalization, and absence of a broad artificial plateau; preserve determinism. If clipping is intended, expose that policy and stop describing the current denominator as the analytic maximum.

### SOL-04: PFSS revalidation rejects a snapshot accepted by its own FITS parser

- **Priority/state:** P2 / observed, latent/offline capability. **Branches:** main and ci; code absent from trajectory.
- **Source:** `main/backend/sim/gong_magnetogram.py:688–711` subtracts the admissible roundoff monopole; `main/backend/sim/pfss_magnetogram.py:1805–1822` tries to invert that transformation to raw FITS bytes; `:1644–1647` requires exact agreement with the original expanded-file SHA256.
- **Root cause:** lossy floating-point arithmetic is treated as byte-reversible. Adding the removed mean cannot restore every original float64 pixel after subtraction, especially pixels much smaller than the admitted roundoff mean. The source artifact hash is an appropriate identity, but reconstructed science values are not a lossless copy of the original artifact.
- **Observed:** build a valid checksummed 180×360 BITPIX=-64 fixture using the existing frozen GONG header and alternating `+1/-1 + 1e-13` G science values, with first two pixels `1e-30,0`. `parse_gong_fits` accepts it and removes only **9.997249770134203e-14 G**, within its declared roundoff gate. Passing this immutable parser result to the actual PFSS validator raises `ValueError: snapshot native header fields are inconsistent`. The tiny original pixel is lost when subtracting the mean, so reconstructed bytes cannot match their source SHA.
- **Expected:** every documented/admitted parser representation should survive the solver's contract, or the parser must explicitly reject unsupported storage representations. Preserve original admitted raw artifact information for byte-integrity checks, or validate the canonical science representation without pretending normalization is lossless.
- **Evidence:** [probe-main.json](probe-main.json), `accepted_float_snapshot_rejected_by_pfss`. **Confidence:** high for this accepted input. No actual GONG file with these pixels was fetched, and observed scientific runtime is currently disabled.
- **Acceptance:** parser → solver admission round trips for supported BITPIX/scaling/unit combinations including tiny float64 pixels and allowed monopole correction, while retaining all tampered-header/pixel rejection gates. Avoid weakening provenance checks globally.

## Old issue reconciliation within solar scope

| Old ID | main / ci | trajectory |
|---|---|---|
| SCN-001 | Corrected in examined basis/evaluation paths. Fresh P2=-.125, P3=-.4375 at mu=.5; P0/P2 overlap 1.28e-14; independent quadrupole recovered to 2e-15. Preserve broader committed harmonic/pole gates. | OPEN / OBS: P2=-.6339110705, P3=-1.1342198219, overlap=-.9450735288, fresh probe. |
| SCN-002 | Original NumPy dtype crash removed. Frozen valid 180×360 FITS fixture parses, pixel .25 G and immutable output. New float64 solver-admission issue is SOL-04, not the original parser crash. | OPEN / OBS: independent 12×12 BITPIX=-32 fixture raises `AttributeError` on `np.float32.newbyteorder`. |
| SCN-003 | Explicit equal-area grid, WCS/provenance, exact area weights and weighted decomposition replace bare-array orientation assumptions. Fresh valid fixture is south→north and area sum 4π; analytic l=2,m=1 map is recovered. Observed runtime remains disabled; no live observed-map accuracy claim. | OPEN / CODE: sine-latitude acquisition remains connected to uniform-theta decomposition at `pfss_magnetogram.py:131–136,316–364`. |
| SCN-004 | Substantially improved byte/redirect/framing/gzip controls, source identity and body read loop. Absolute acquisition boundary remains OPEN / OBS as SOL-02; GONG residual is offline. | OPEN / CODE: wrong-rotation fallback and unbounded read/decompression remain at `pfss_magnetogram.py:167–197`, realtime urllib reads `:207–224,322–328`. |
| SCN-005 | CPU ownership materially changed to spawn/process kill/reap with dedicated admission. Client delivery, timings and warm availability are parent/frontend audit scope; no closure from source-only supervisor inspection. | Old synchronous scientific path remains; parent/frontend timing gates own current status. |
| SCN-006/007/008 | Parent owns HTTP origin/identity/epoch route verification. Do not carry old failures automatically: main has new ingress and bounded epoch code. | Parent owns fresh route verification. |
| SCN-009 | Demonstrated old forcing bug removed from active computation: same stale input returns .8 unchanged, `applied=false`, `blend_weight=0`, `disabled_unvalidated`. Hybrid is explicitly synthetic; data_driven raises unavailable. This is safe disabling, not validated assimilation capability. | OPEN / OBS: stale 2000 input still changes .8→.625 with confidence0, weight.25 and applied=true. |
| SCN-010 | OPEN / OBS residual, SOL-01. SILSO source cache and delivery-age updates materially improve part of old claim; do not say all caches lack last-known-good handling. | OPEN / CODE same aggregate failure cache behavior; no fresh clock probe on this branch. |
| SCN-011 | Backend now canonicalizes AIA UTC dates at `solar_realtime_data.py:2311–2346`; frontend owns timezone end-to-end closure. | Old raw date return remains; frontend owns fresh TZ probe. |
| SCN-041 | Original magnitude/1.005-radius expansion complaint is superseded: WSA now evaluates radial fields at exact r=1/rss boundaries (`pfss_magnetogram.py:803–840`) and labels output `wsa_inspired_v1`, with nullable unavailable speeds/quality/coverage. Scientific calibration remains VERIFY. | VERIFY remains; old magnitude formula present but no independent new WSA oracle on trajectory. |
| SCN-042 | Split confirmed normalization error SOL-03. Main time scales/Carrington hints are now explicit and observed assimilation/AIA scientific inference disabled. Remaining coordinate/rotation/projection correctness is VERIFY, not blanket closure. | Split confirmed SOL-03; stale forcing already SCN-009. Remaining broad solar semantics VERIFY. |
| SCN-047 | No live/browser/GPU or sustained cross-endpoint acceptance run in this sub-audit. Parent tests may narrow this gate. | Same limitation. |
| SCN-048 | Main NOAA endpoints migrated to RTSW 1-minute products with active/quality/skew/age checks; no live status measured by this sub-audit. Do not carry the old one-day-feed statement to main. | Old one-day endpoints remain in constants; current provider HTTP status unmeasured here. |

## Coverage inventory and limits

| Area | Work performed | Limits |
|---|---|---|
| Harmonics/grid/field | Main recurrence and pole helper source review; exact low-degree/orthogonality probe; explicit grid and weighted least-squares review; analytic quadrupole decomposition and photosphere/source-surface checks; trajectory old recurrence reproduced | Parent owns full committed harmonic fixture suite; no new observed magnetogram oracle |
| Tracing/WSA | Shared batch/scalar RK4 and shell intersection review; five analytic dipole classifications agree, max endpoint residual 2.22e-16; radial expansion/boundary-distance/coverage/nullable-speed and Parker fallback review | No full parameter sweep or independently calibrated WSA speed map; no new tracing defect asserted |
| GONG/FITS | Header/WCS/time/source identity, raw hashing, flux admission, snapshot contract, archive selection, byte/framing/redirect/gzip constraints, direct transport review; valid fixture parse, float64 admission mismatch and body-drip probes | Frozen fixtures are synthetic; no real-provider pixels downloaded; no claim observed runtime enabled |
| Solar model/time | Forcing disable contract, epoch determinism, activity envelope, Parker use of WSA, UTC/TDB and mean/provider Carrington distinction reviewed; stale-forcing and normalization probes | Broad astrophysical validity, rotational frames and visualization correspondence remain verification work |
| Realtime sources/cache | SWPC quality/age/skew/numeric selection; SILSO parser/source cache/revalidation/LKG; AIA identity/date/spatial-disable boundary; snapshot/binary/singleflight lifetime/transport review; outage, headers and DNS probes | No live provider availability capture; no browser texture result; no production proxy/DNS configuration inspected |
| Process supervisor | Admission, cancellation, absolute queue/execution deadlines, child JSON bounds, result discriminator, reap/quarantine and shutdown source reviewed | Parent owns actual process gates/load suite. No additional supervisor defect confirmed by this sub-audit |
| Cross-branch | Main and ci identical-tree applicability; trajectory independent basis/FITS/assimilation/normalization probes and legacy source reconciliation | This is broad source review plus targeted probes, not every-line formal verification |

A suspected PFSS-versus-Parker axis mismatch was checked and **not promoted**: both backend implementations currently emit Z-up coordinates (`solar_physics._vector_from_lat_lon` puts latitude in z). Frontend direct copying alone is not proof of a defect. No historical count was reused as a current measurement.

## Reproduction

From original repository root:

```bash
/tmp/solar-sweep-2026-10-10-j1gnowo_/venv-main/bin/python agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/probe_solar.py /tmp/solar-sweep-2026-10-10-j1gnowo_/main
/tmp/solar-sweep-2026-10-10-j1gnowo_/venv-trajectory/bin/python agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/probe_solar.py /tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory
```

Probe exit 0 means the observations were captured, not that all invariants passed. The scripts make no external requests; the timing probe uses local socketpairs and an injected resolver failure, with finite completion and explicit cleanup. Artifact paths do not match product-test collection names. All new files are confined to this evidence directory.
