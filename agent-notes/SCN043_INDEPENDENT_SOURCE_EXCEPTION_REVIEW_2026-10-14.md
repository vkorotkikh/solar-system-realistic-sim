# SCN043 independent source-exception review

## Findings first

### F1 - High: erased Daphnis handoffs are accepted and produce out-of-budget states

Owner: Herschel / parent. Reproduction:
`src/sim/moonSourceExceptionIndependentReview.test.ts:120`.
Production boundary: `parseMoonEphemerisArtifact` in `src/sim/moonEphemeris.ts`;
the resulting blend is performed by `propagateCartesianEphemeris` at line 661.

Starting with the shipped artifact, remove the body's `sourceDiscontinuities` and
set `validation.boundaryContinuity.runtimeStateContinuous` to true. Leave the
two native-jump evidence records, legacy source domain, coefficients, measured
validation statistics, and accuracy limits unchanged. The parser accepts this
internally contradictory artifact and the runtime blends across the provider
handoff instead of selecting the original right-hand state.

At JDTDB 2455197.5, comparison with a fresh direct SPKPVN evaluation of the original
right-hand SAT393 descriptor gives **322.4903539181378 km** position error and
**45.52755995897258 m/s** velocity error. The original limits remain **136.5 km**
and **10 m/s**. The artifact's still-passing old summary statistics do not describe
the trajectory the accepted metadata now instructs the runtime to evaluate.

Suggested bounded repair, not implemented here: reject contradictions between
handoff declarations, native boundary evidence, source domain, and continuity
claims. A source exception must not silently revert to the continuous default.

### F2 - Medium: exception identity and legacy qualification are not fail-closed

Owner: Herschel / parent. Reproduction:
`src/sim/moonSourceExceptionIndependentReview.test.ts:103` and line 116.
Production boundary: `parseMoonEphemerisArtifact` provenance validation.

The parser independently accepts each of these mutations:

- S2023_S38 provenance target changes from 65273 to 65272 while its body identity
  remains S2023_S38 / 65273.
- S2023_S38 provenance center changes from Saturn 699 to Jupiter 599 while its
  source query and body remain Saturn-relative.
- Daphnis's entire dated `sourceDomain` qualification is deleted.

Nonempty strings and a compatible frame/time scale are not sufficient to bind
these exceptional models to their body/center or require the promised source
qualification. The unmodified artifacts do contain the correct identities and
legacy dates; this finding is a missing rejection contract, not evidence that
the currently shipped coordinates were computed for the wrong body.

### F3 - Medium: the runtime parser ignores post-selection audit certification

Owner: Herschel / parent. Reproduction:
`src/sim/moonSourceExceptionIndependentReview.test.ts:107` and line 116.
Production boundary: `parseMoonEphemerisArtifact` validation checks.

Changing only S2023_S38's fresh-audit maximum position error to **501 km**, above
the unchanged **500 km** cap, is accepted. Independently changing
`postSelectionCrossValidation.usedForFitOrSubdivision` to true is also accepted.
The ordinary selection-validation summary remains untouched in both cases.
Consequently the parser does not enforce the additional certification that
justifies calling this model independently post-selection audited.

The current generator did correctly reject a deliberately failed audit; see the
positive control below. The defect is at the runtime artifact acceptance boundary,
not proof of current audit leakage into the actual fit.

### F4 - Medium: offline vector pin validation accepts contradictory provenance

Owner: Herschel / parent. Reproduction:
`scripts/test_moon_source_exception_independent_review.py:273` and line 294.
Production boundary: `scripts/generate_s2023_s38_ephemeris.py:145` (`inputs`).

Four independent mutations of a temporary manifest were accepted while all
original compressed inputs and normalized vector bytes remained unchanged:

- Retained provider header names Jupiter 599, contradicting the Saturn request.
- Request `START_TIME` is changed to JD2451546.0625; its encoded query and cache
  key are recomputed consistently, but its pinned row epochs are not changed.
- `rawResponseSha256` is replaced by `not-a-sha256`.
- Manifest `schemaVersion` becomes 999.

The existing loader verifies compressed/normalized row digests and query/key
self-consistency, but does not validate these retained source qualifications,
the request's time grid against the chunk, or the manifest schema. The capture
parser's stricter header checks are not replayed by offline `inputs()`.
Suggested bounded repair: validate the manifest version/encoding, header/query
identity, request epoch grid, and provenance field shapes before fitting. Do not
weaken the current numerical gates or replace source vectors with model output.

## Scope, revision, and ownership

- Reviewed integration: `4b55dff10c556572ed06393b9739adcd6c3c07eb`.
- Reviewed implementation: `acc9cebb51f6e9f9bc787d6cc98373c6861bd568`.
- Reviewed handoff: `e6c75ce55a111063139a1fbd4d34da6a20b749e4`.
- Isolated worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-moon-source-review`.
- Branch: `remediation/20261014-moon-source-review`.
- Only new review tests and this report/evidence package were added. No existing
  runtime, generator, artifact, loader, tolerance, tracker, or other owner's file
  was modified. No browser was launched and no external source was acquired.
- No direct agent-messaging tool is exposed in this review session. Findings are
  addressed to Herschel / parent for relay and ownership, not claimed as delivered
  through an unavailable agent channel.

## Positive independent evidence

### Daphnis: original bytes, right-hand states, and qualification

The original embedded SPK is 9,216 bytes, SHA-256
`8b21b3b68e5603006b67cb02197d789afa2e04925c3495363ac16fe180be2e08`.
An independent test opened those bytes with SpiceyPy 8.3.0/CSPICE and inspected
the three native target-635, center-699, frame-1, type-17 descriptors. It evaluated
the descriptors directly rather than reusing the fitting predictor or the existing
generated runtime-oracle fixture.

The new oracle has **212 states**: **192 deterministic fresh random epochs**
within the three native arcs plus exact endpoints and handoff probes, including
the adjacent representable JDs on either side of each handoff. At exact shared
epochs the last eligible native descriptor supplies the reference right-hand state.
The random epochs were checked against the fitting-grid epochs.

Actual TypeScript runtime comparison against these states passed unchanged limits:

| Measure | Maximum | Limit |
| --- | --- | --- |
| Position error | 7.471213046084918 km | 136.5 km |
| Velocity error | 0.9216652697405276 m/s | 10 m/s |

Direct left/right native evaluations reproduce both declared provider jumps:
647.5196515539692 km / 79.7746497162883 m/s and
168.444650880279 km / 20.760364651107984 m/s. These are source fit changes, not
physical impulses. The original kernel comments corroborate the 2016-10-11
creation and observations through 2016 July 16. The declared model coverage lies
inside the native descriptor coverage. This is agreement with a qualified legacy
Cassini fit, not a new observational validation of future dates.

The unmodified Daphnis body rebuilt byte-identically offline, without creating a
candidate cache. Its shipped artifact SHA-256 is
`d7709853c059884f20763ace6aacd50a34c38e26b924e20c9f5a6b943f02a7c8`.

### S2023_S38: real normalized provider vectors and actual runtime

All seven compressed pin sets and their normalized float64 row digests were
checked independently. All **115** retained requests were checked against their
normalized chunk hashes, target/center headers, encoded query/cache key, and exact
requested epoch grids. The artifact's manifest digest matched the actual pin.

Actual TypeScript runtime versus **all 6,891 post-selection audit vectors**:

| Measure | Maximum | Limit |
| --- | --- | --- |
| Position error | 42.041700680744654 km | 500 km |
| Velocity error | 3.442211291536285 m/s | 10 m/s |

Three additional source states, the hyperbolic probe and two coverage endpoints,
passed: maximum 2.5229512958838156 km / 0.3385856076707202 m/s.
At JDTDB 2451805.125 the original vector has specific energy
0.023333231964077328 km^2/s^2 and eccentricity 1.0013962854620226. The runtime
state also retains positive energy, 0.023333170260883662 km^2/s^2. These checks
exercise the actual Cartesian propagator, not an ellipse reconstruction, and do
not assert permanent escape in the perturbed N-body trajectory.

Both bodies also reject dates outside model coverage and non-finite dates without
changing either caller output vector.

### Post-selection independence: what was and was not established

All 6,891 unique audit epochs are disjoint from source, dense source, ordinary and
dense selection-validation grids, endpoints, hyperbolic probe, and seven-date
oracle epochs. Held-out and seven-date oracle errors do participate in adaptive
interval selection; they are not the untouched final holdout. The separately
pinned audit is the post-selection check.

The unmodified S2023_S38 model rebuilt byte-identically offline in **9** fitting
iterations, artifact SHA-256
`b3410184508f68eff0add063f4f7eb4f9a5ac349a61ecec8c6f324c39f06e1e8`.
A negative control changed only one audit position by 100,000,000 km. Generation
then rejected the audit after exactly the same **9 interval-edge hash sequences**,
with no additional subdivision/refit. This demonstrates that current code does
not adapt to a failed audit. The negative control is not a provider observation
or an additional scientific accuracy pass.

This establishes present-code numerical holdout separation, not independently
observed celestial truth or a preregistered historical selection process. The
manifest records audit capture after the base/dense captures, but no pre-audit
selected-model commitment was available in this bounded review.

The S2023_S38 pins are explicitly normalized provider values, not original HTTP
bytes. **0 of 115** named cache envelopes were present in this review worktree's
shared cache at inspection. Their raw-envelope SHA-256 claims therefore could
not be independently rehashed here; this does not assert the envelopes are absent
from every other owner's environment. No external reacquisition was attempted.

## Exact targeted execution results

All commands ran from the isolated review worktree. Python used 3.12.13, the
repository's pinned backend requirements, and cached SpiceyPy 8.3.0 with `uv
--offline`. BLAS/OpenMP thread settings were all 1. Socket connection and provider
fetch entry points were blocked by the tests during generation.

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 \
uv run --offline --python 3.12.13 \
  --with-requirements ci/backend-test-requirements.txt --with spiceypy==8.3.0 \
  python -m pytest scripts/test_moon_source_exception_independent_review.py \
  -q --tb=short --junitxml=artifacts/moon-source-independent-review/python-results.xml

node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js \
  test -- src/sim/moonSourceExceptionIndependentReview.test.ts \
  --reporter=default --reporter=json \
  --outputFile=artifacts/moon-source-independent-review/runtime-results.json

node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
  --target ES2022 --module ESNext --moduleResolution bundler --types node \
  src/sim/moonSourceExceptionIndependentReview.test.ts
```

Run Python before TypeScript: the first test creates the independent native oracle
from the original kernel. This is an explicit review harness prerequisite, not a
network fallback. The TypeScript test does not substitute the shipped oracle.

| Targeted command | Result |
| --- | --- |
| Python independent review | **7 passed, 4 failed, 0 skipped**, exit 1; 10.35 s |
| Actual TypeScript runtime and parser review | **5 passed, 6 failed, 0 skipped**, exit 1; 294 ms Vitest duration |
| Targeted strict TypeScript check for the new test/runtime dependency | Exit 0, no diagnostics |

The **10 failures are live rejection regressions**, not expected-failure labels,
skips, or infrastructure errors. Do not cherry-pick the tests into a green lane
without also resolving the corresponding owner defects or explicitly preserving
their failing status. No full suite was duplicated.

Test host: AMD Ryzen 9 9950X3D, shared with other agents. The captured interval was
2026-10-14T23:41:46.838Z through 23:42:26.250Z; one-minute load average changed
2.55 -> 1.77. An earlier inspection observed load about 11.47. No exclusive CPU
window or performance-gate result is claimed. Peirce's browser window was untouched.

## Evidence and closure status

`SCN043-independent-source-review-2026-10-14/evidence.tar.gz` contains test logs,
JUnit/JSON results, exit statuses, original-SPK-derived oracle states, measured
runtime errors, offline rebuild/selection hashes, and host context.
The adjacent `summary.json` is a compact machine-readable ledger.

This review validates the unchanged shipped numerical samples while finding
fail-closed integrity gaps. It does not close SCN043, all-424 promotion, SCN005
startup/delivery, deployment, licensing, assistive-device, or GPU gates. Owners
must repair and rerun these targeted rejection tests on their final integrated
revision; this report makes no claim about commits after `4b55dff`.
