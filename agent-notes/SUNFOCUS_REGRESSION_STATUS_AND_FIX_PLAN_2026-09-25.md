# Sun-Focus Regression Status and Reconciliation Plan — 2026-09-25

**Status:** active replacement plan

**Working checkout audited:** `fix/trajectory-amplification-defense-in-depth @ 7cab690`

**Current local main:** `main @ d834dbe`

**Integration target audited:** `sun-focus @ 13ca9ec`

**Merge base:** `ec7ad33a503da3a4c6bfd87e4c498e8a53be6984`

**Remote parity:** not asserted; every revision above is a local ref.

This file supersedes:

- `SUNFOCUS_REGRESSION_FIX_PLAN_2026-08-23.md`
- `R3R4_VERIFICATION_REPORT_2026-08-25.md`
- `R3R4_VERIFICATION_LOG_2026-08-25.md`

It consolidates the useful conclusions from those files, the four retained major-issue reports, the
September audits, current tests and fixtures, and a fresh comparison of both branch tips. It is an
execution plan, not a raw evidence archive. Historical report bodies remain useful provenance, but
their branch pins and headline counts are not current.

## 1. Decision

Do **not** merge `sun-focus @ 13ca9ec` into `main` as-is and do **not** replay the four old topic
branches wholesale.

The two branches diverged after `ec7ad33`: the working/main-derived side has 30 unique commits and
`sun-focus` has 17. `sun-focus` contains the R1–R4 topic history, but it is missing newer mainline
fixes and in two important areas contains weaker implementations:

- its PFSS cache aliases scientifically distinct inputs;
- its moon path lacks the fitted ephemerides, native-frame propagation, fail-closed coverage
  contract, and UTC/TDB correction now on mainline.

Reconcile **mainline into `sun-focus` on a dedicated integration branch**, resolve sensitive files
semantically, and then finish the remaining R3/R4 work. A clean textual merge is not evidence of a
correct scientific merge.

### Current headline

| Original track | Current/main-derived checkout | `sun-focus` | Canonical status |
|---|---|---|---|
| R1 — Kuiper velocity units | fixed and physically gated | same fixed code | **CLOSED** |
| R2 — planetary mean-anomaly advance | fixed; strong multi-epoch oracle | same production behavior; redundant old test remains | **CLOSED for position; velocity follow-up OPEN** |
| R3 — PFSS denial/correctness/delivery | partially hardened; exact cache; still unsafe and numerically wrong | partially hardened; cache regression; still unsafe and numerically wrong | **OPEN / release-blocking** |
| R4 — numerical regression gates | materially stronger, but incomplete | conventions document and some useful tests, but weaker overall | **PARTIAL / blocks R3 release** |
| Branch convergence | mainline fixes absent from `sun-focus` | sun-only bounds/policy absent from mainline | **OPEN / first dependency** |

Status meanings in this document:

- **CLOSED** — implementation and a behavioral or external-oracle gate exist on both audited tips.
- **PARTIAL** — useful mitigation exists, but its objective or release gate is not met.
- **OPEN** — defect is present or the branch lacks required protection.
- **SUPERSEDED** — an old claim, acceptance number, or implementation was replaced by stronger
  evidence and must not be copied forward.

## 2. Evidence precedence and known stale material

Use evidence in this order:

1. fresh execution against the pinned tips above;
2. `CODEBASE_AUDIT_2026-09-24.md` plus its `bd48a7d` addendum and evidence directory;
3. current behavioral/oracle tests and committed fixtures;
4. September 6–7 audits;
5. August reports as historical evidence only.

Do not reuse these stale numbers or claims:

- The active/partial totals in the retained Report C overlays predate the latest branch tips and use
  a different taxonomy. This plan uses deduplicated epics instead of pretending those counts remain
  comparable.
- The September 24 addendum says “20 moons × 4 epochs”; the committed fixture has seven epochs.
- The old R2 `< 3.6 million km` single-date criterion is superseded. The fixed implementation is
  about 3.894 million km at that date and is now governed by the six-epoch drift and aggregate gate.
- “R2 commits are absent, therefore R2 is unfixed” is false for mainline. Mainline independently
  landed the equivalent and newer production behavior in `68aff6b`.
- “R3 Layers 1–2 are done” is false as an objective-level statement. The semaphore works, but the
  anonymous CPU denial, cache-hit lockout, numerical PFSS defect, and client/server mismatch remain.
- The September 24 audit/evidence tree is currently untracked and pinned to `9418652`; it is evidence,
  not branch content. Its manual absolute imports and two filename references must be cleaned before
  any future commit, without rewriting the measured results.

## 3. Branch convergence matrix

### 3.1 Mainline behavior that `sun-focus` must preserve

| Change | Why it must win during reconciliation |
|---|---|
| `90f4134` WebSocket resource ownership | bounds connections/engines and preserves origin/seek controls |
| `a40005a` exact PFSS cache | keys exact effective inputs, validates them, provides bounded LRU and stronger single-flight tests |
| `3f3b787` unpowered-flyby continuity | rejects physically invalid `|v∞|` discontinuities |
| `84ddcd1` asteroid provenance fail-closed behavior | prevents self-authorized or unverifiable catalogs from silently becoming authoritative |
| `ea54bea` Lambert exhausted-bracket refusal | prevents a bracketed non-root from being returned as a solution |
| `bd48a7d` moon ephemeris/native-frame/TDB work | replaces known-bad positional fallback for required moons and fails closed outside coverage |
| `9418652` and preceding UI fixes | preserve responsive layout, focus restoration, canvas labelling, and CSS animation-reduction behavior already corrected |

### 3.2 `sun-focus` behavior worth adapting

| Change | Landing rule |
|---|---|
| Solar request JD range | port the J2000 ±200-year rejection before expensive work |
| Rate-identity map bound | preserve the existing soft cap during convergence; replace it with bounded TTL/LRU storage when proxy trust is fixed |
| `TESTING_NUMERICS.md` | preserve and update as the repository’s numerical-test policy |
| Solar request/determinism tests | port only behavioral assertions that still exercise the production path |
| Rate-free orbital invariant | move the useful invariant into the current `orbitMath.test.ts`; then remove the redundant old accuracy test |

### 3.3 Conflict decisions that are not negotiable

| File family | Required base | Required adaptation |
|---|---|---|
| `backend/sim/pfss_magnetogram.py` | mainline exact-key implementation | fix the Legendre mathematics; do not restore the Carrington/activity-bucket key |
| `backend/server.py` | mainline resource/permit implementation | add the JD bound, bounded identity storage, trusted-proxy policy, isolated PFSS execution, and cached fast path |
| `src/sim/orbitMath.ts` | mainline fitted/native-frame implementation | retain `dM/dt = Ldot - dϖ/dt` and add a velocity-oracle gate |
| moon catalog/worker/render paths | mainline `bd48a7d` behavior | preserve fail-closed propagation and explicit quality metadata |
| PFSS tests | mainline `test_pfss_cache.py` | add analytic harmonics and end-to-end load/route tests |
| numerical test policy | `sun-focus` document | port to the reconciled branch and enforce it in CI |

## 4. R1 — Kuiper velocity units

**Status: CLOSED on both branches. Do not reopen without new contradictory evidence.**

The relevant implementation and tests are byte-identical at both audited tips:

- producers declare their velocity units;
- `activate` normalizes accepted unit spellings and converts AU/day to the simulation’s AU/year;
- the server refuses to guess when a producer omits units;
- Jupiter, Saturn, and Neptune must be on plausible bound orbits before particles are admitted;
- a `KuiperActivationError` produces a structured error without latching the simulation runtime error;
- a valid retry succeeds after a rejected activation.

Fresh execution with REBOUND 5.1.1 passed all 14 R1 tests. A real handler run produced bound Jupiter,
Saturn, and Neptune states and confirmed reject-then-reactivate behavior.

Required preservation work:

```text
backend/tests/test_kuiper_velocity_units.py
```

Keep those 14 tests and add a handler-level behavioral test for the structured error, unchanged
`_runtime_error`/pause state, and successful retry. The latter is currently manual evidence, not an
automated gate. CI must install the pinned REBOUND dependency; skipping the physics gate is not an
acceptable release signal.

## 5. R2 — planetary secular-rate mean anomaly

**Status: CLOSED for planet positions on both branches. Velocity correctness remains a separate P1.**

Both tips now:

- supply JPL mean-longitude rates for all eight planets;
- advance mean anomaly using `dM/dt = dL/dt - dϖ/dt`;
- do not derive phase advance from the secularly drifted semimajor axis;
- preserve the legacy path for plain generic Kepler orbits that have no secular rates, fitted
  ephemeris, or native source-frame basis.

The shared external-oracle gate covers eight planets at six epochs, with per-planet, drift, and
aggregate budgets. It passes on both tips and fails 44 of 66 assertions when overlaid on the pre-fix
implementation. This is the authority; the old four-epoch `orbitMath.accuracy.test.ts` is redundant
and contains a disproved budget claim.

### Remaining R2-adjacent work

1. Move the useful “no rates means unchanged output” invariant into `orbitMath.test.ts` before
   deleting the redundant test on `sun-focus`. Scope it to a plain generic Kepler orbit; fitted and
   native-frame moons deliberately dispatch through other models.
2. Activate the committed fixture velocities as a multi-epoch external-oracle gate.
3. Make reported velocity the derivative of the propagated position, including secular `a`, `e`,
   `i`, `Ω`, and `ω` terms, or label it explicitly approximate. Current probes show a Horizons
   velocity-vector error up to 33.3 m/s and position-derivative mismatch up to 8.18 m/s.
4. Keep broader mean-element accuracy separate from the fixed regression. The model remains an
   approximation; current six-epoch errors reach millions of kilometres for the outer planets. The
   source elements are documented for 1800–2050, so the gate's 2100 row is an extrapolation sentinel,
   not evidence of in-domain scientific validity.

## 6. R3 — PFSS correctness, availability, and abuse resistance

**Status: OPEN and release-blocking on both branches.** The two tips have complementary partial
fixes; neither meets the objective.

### R3.1 PFSS harmonic, input-grid, and WSA mathematics — P0

The same `_associated_legendre` recurrence is wrong on both branches for `l >= 2`. Fresh execution
at `x = 0.5` produced:

| term | implementation | analytic value |
|---|---:|---:|
| `P2` | -0.63391 | -0.12500 |
| `P3` | -1.13422 | -0.43750 |
| `P4` | -0.48746 | -0.28906 |

The resulting basis is not orthogonal, a pure dipole leaks strongly into higher degrees, and the
photospheric reconstruction and source-surface ratios are wrong. This makes current PFSS payloads
scientifically invalid even when delivery succeeds.

Fix requirements:

1. Select and document one associated-Legendre normalization and Condon–Shortley convention.
2. Implement the standard stable recurrences for `P_m^m`, `P_(m+1)^m`, and `P_l^m` through the
   supported `lmax`.
3. Make `_associated_legendre`, scalar `_legendre_at_point`, vectorized `_legendre_batch`,
   decomposition, reconstruction, and field evaluation use that same convention. Gate scalar/batch
   agreement, `dP/dθ`, normalization, and pole behavior.
4. Add closed-form checks, Gauss–Legendre orthogonality checks, pure dipole/quadrupole isolation,
   photospheric reconstruction, and analytic source-surface radial-ratio checks.
5. Correct the documentation: 27.2753 days is the **synodic** Carrington period, and the source-
   surface boundary is `Bθ = Bφ = 0`, not `Br = 0`. Gate the tangential boundary condition.
6. Preserve and interpret GONG FITS metadata. `bqs` data are sine-latitude, south-first maps with a
   longitude origin; they cannot be treated as north-first uniform-colatitude arrays with `LONG0`
   discarded.
7. Require an exact requested Carrington rotation or label a substitute as such. A monthly fallback
   file must never be relabelled as the requested rotation.
8. Bound directory/FITS reads, gzip expansion, image dimensions, and coefficient allocation. Commit
   a small checksummed FITS fixture for WCS/orientation/longitude and round-trip tests.
9. Gate WSA expansion against an analytic/reference case. The current path uses footpoint `|B|`
   where the claimed Arge-style expansion requires radial-field semantics; fix it or label it as an
   explicit approximation.
10. Cross-check at least one committed map against an independent implementation before claiming
    scientific fidelity.

### R3.2 Cache identity and single-flight — branch regression, P0

Mainline’s cache prevents request-scalar aliasing with this effective identity:

```text
(Carrington rotation, exact JD, exact activity, effective line count,
 effective lmax, GONG timeout)
```

It also validates finite inputs, bounds the LRU, and has behavioral single-flight tests.

`sun-focus` instead keys `(rotation, line count, lmax, 5%-activity bucket)`. It omits exact JD and
GONG timeout, aliases different synthetic epochs, and no longer contains the stronger cache test
suite. That implementation must not win the merge.

That mainline key is stronger, but it is not a complete scientific source identity: network
availability and upstream GONG contents can make the same request produce an observed or synthetic
result after eviction/restart. It is also operationally ineffective for a UI that advances JD every
poll. Improve reuse by defining the *actual computed snapshot* explicitly, not by silently aliasing
inputs:

- observed source: exact rotation and FITS metadata + product revision/content hash + fidelity
  parameters;
- synthetic source: documented epoch/activity equivalence relation, measured error budget, and
  fallback TTL/retry policy;
- whole-response identity: forcing mode, feature limit, realtime observation/product IDs, and every
  effective wall/simulation epoch input—or cache only the PFSS component and state that boundary;
- response: return canonical effective inputs, source identity, and staleness so approximation is
  visible.

### R3.3 CPU isolation and admission — P0

The owned-permit helper is fixed on both branches: submit failure releases the permit and timeout
does not release it while the worker still runs. That closes the over-admission bug, not the denial
objective.

Fresh measurements on the current checkout:

| request | cold synthetic compute |
|---|---:|
| preview | 1.454 s |
| operational | 2.835 s |
| high | 5.325 s |
| ultra | 7.100 s |
| warm cache hit | about 7–9 µs |

Two distinct concurrent high computations took 17.210 and 18.135 seconds. Both HTTP requests timed
out at about 12 seconds with 503 while the work continued; `/health` reached 73.2 ms p95 and 366.2 ms
maximum. The GIL-bound worker shares a process and executor with other heavy endpoints. The semaphore
therefore turns a compute storm into permit lockout and cross-endpoint contention.

Required design:

1. Move PFSS into a dedicated bounded process worker or a background snapshot/precompute service.
2. Give it an independent queue and capacity budget; never share its executor with trajectory or
   mission work.
3. Keep ownership until actual completion and recycle/terminate work that exceeds its hard budget.
4. Put the cache lookup and ready-snapshot path before cold-work admission, so cached responses stay
   available while workers are saturated.
5. Expose queue depth, active work, cache hit/miss, effective snapshot, completion latency, and
   cancellation/timeout counters.
6. Gate worker crash, hard timeout, restart, queue recovery, and cache integrity. Cancelling a future
   is not proof that a running process stopped.
7. Either enforce capacity/rate limits globally across workers/replicas or declare and test a
   single-API-process deployment topology; process-local semaphores and maps do not provide a global
   limit.

### R3.4 First-party delivery contract — P0

The shipped client polls high fidelity every 900 ms with a 2.6-second timeout. A cold high solve takes
about 5.3 seconds, the default backend rate is 36/minute while a fast client can request 66.7/minute,
and preview origin `:4173` is not in the default CORS set. The September browser audit observed zero
successful physics deliveries. Cache-safe science alone does not fix that product path.

Required contract:

- serve a precomputed/last-known-good snapshot quickly and refresh it asynchronously;
- align poll cadence, timeout, server rate budget, and `Retry-After` behavior;
- add explicit loading, stale, unavailable, and retry UI states;
- include all first-party dev/preview origins deliberately, without wildcarding production;
- cancel obsolete client work and deduplicate refreshes by snapshot identity;
- test the real browser-to-route path, including AIA tile delivery.

Browser acceptance is a defined five-minute scripted run: at least 95% of scheduled physics reads
must succeed, at least one AIA tile must render, snapshot staleness must remain within its declared
TTL, effective source/staleness must be visible, and there must be zero silent fallbacks.

### R3.5 Request and identity controls — P0 before non-loopback exposure

| Control | Current/main-derived | `sun-focus` | Required end state |
|---|---|---|---|
| JD range | absent | J2000 ±200 years | reject before admission on reconciled branch |
| physics/AIA identity-map size | both unbounded | physics has 4,096 soft cap; AIA unbounded | both bounded TTL/LRU with metrics |
| `X-Forwarded-For` | trusted from anyone | trusted from anyone | honor only from configured trusted proxies |
| authentication | disabled when key set is empty | same | explicit development profile; fail closed outside it |
| cached response under saturation | rejected behind guard | rejected behind guard | cache/read path remains serviceable |

A fresh reproduction retained 5,000 identities from 5,000 spoofed headers; one peer rotating 100
headers received 100/100 admissions. Cardinality bounds alone do not fix identity spoofing. Body
limits and authentication that must act before request parsing belong in a gateway/ASGI middleware,
and WebSocket authorization must happen before acceptance; handler-only checks are too late.

## 7. R4 — numerical regression and release gates

**Status: PARTIAL.** Current/main-derived tests are stronger overall, while `sun-focus` contains a
policy file and one useful invariant that must be preserved.

### Gates that already bite

- R1 uses bound-orbit physics rather than checking a conversion implementation detail.
- Planet positions use a provenanced DE441 fixture at six epochs with drift and aggregate budgets.
- Current moon tests exercise fitted position/velocity/plane/drift behavior across seven epochs.
- Current PFSS cache tests distinguish dates in one Carrington rotation and exercise true
  single-flight behavior.
- The compute-budget test calls the production owned-worker helper rather than a copied local pattern.
- Lambert bracket and MGA flyby invariants now fail invalid physical solutions.

### Gaps to close

1. Port and enforce `TESTING_NUMERICS.md`, updated to recognize closed-form analytic results and
   standards-derived invariants as independent oracles. Label captured rate-free output honestly as
   a compatibility golden, not a scientific oracle.
2. Preserve the rate-free orbit invariant in the current test suite.
3. Add analytic and independent-oracle PFSS tests described in R3.1.
4. Add public-route saturation tests for health latency, cached availability, proxy spoofing, JD
   rejection, timeout ownership, submit failure, and cross-endpoint isolation.
5. Run R1 in a REBOUND-enabled CI lane; a skip is not a pass.
6. Add CI that runs strict type checking, frontend tests, backend tests, numerical verifiers, and a
   production build. The current fresh strict check reports 246 errors, so this needs an explicit
   burn-down rather than a pretend-green gate.
7. Require red-before-green evidence for each numerical defect and mutation-test controls where a
   copied formula could pass by construction.
8. Keep fixtures immutable and provenanced: source, query, frame, origin, units, time scale, epoch,
   retrieval date, and checksum.
9. Make solar tests network- and order-independent with committed upstream fixtures and explicit
   reset of global caches/rate maps.
10. Lock production and test dependencies first; `httpx` is required by `TestClient` but absent from
    `backend/requirements.txt`, and range-only dependencies cannot establish a reproducible CI gate.

## 8. Consolidated issue register beyond R1–R4

This is the deduplicated handoff from the retained reports and September audits. It prevents the new
R1–R4 plan from falsely implying that fixing PFSS makes the application release-ready. Detailed raw
evidence remains in the source reports; this table is the planning authority.

| ID | Priority | Epic | Current/main-derived | `sun-focus` | Next decision or gate |
|---|---|---|---|---|---|
| S0 | P0 | Semantic branch convergence | open | open | execute Section 9 Phase 0 |
| S1 | P0 | PFSS mathematics and solar delivery | open | open/worse cache | satisfy every R3 acceptance gate |
| S2 | P0 | Trajectory request amplification/starvation | plan only | open | implement the separate defense-in-depth plan; bound total work before provider calls |
| S3 | P0 | Accuracy benchmark truth coverage | open: zero comparable scenarios | same | install reproducible external references or report “not validated,” never `passRate: 0.0` as coverage |
| S4 | P0 | Licence and asset provenance | open | open | owner/licensing decision before redistribution; add root licence and complete manifest |
| S5 | P0 | README/product truth | open | open | align claims with reachable UI and measured capability |
| S6 | P1 | Moon model/catalog coverage | partial: required fits and fail-closed path exist | active: lacks mainline model | preserve mainline, expand strict rendered-set gates before enabling moons |
| S7 | P1 | Time/origin semantics | UTC→TDB fixed; Earth=EMB remains | UTC/TDB and EMB open | port mainline time fix; model Earth/Moon barycentric split or label EMB |
| S7a | P1 | Pluto secular propagation | open: no secular rates | same | add a source-backed model and multi-epoch external-oracle gate |
| S8 | P1 | Asteroid numerics/catalog science | provenance fixed; float32 clock/taxonomy/period issues open | provenance and science open | relative/compensated GPU time; independent population/taxonomy authority |
| S9 | P1 | MGA search/accounting | `|v∞|` continuity fixed; search/accounting open | continuity also open | preserve `3f3b787`; replace inert combinatorial grid with coupled feasible optimizer |
| S10 | P1 | API/security posture | open/partial | open/partial | loopback defaults, auth before work, body limits, redaction, trusted proxies |
| S11 | P1 | WebSocket lifecycle/time delivery | resource cap fixed; global lockout and time-step issues open | resource cap also missing | preserve mainline ownership; add auth/isolation and wall-clock accumulator gates |
| S12 | P1 | Solar semantics/upstreams | open | open | beyond promoted PFSS/WSA gates: axes, rotation, Hathaway, AIA/SWPC, provider validation, bounded reads |
| S13 | P1 | Mission mass ledger/risk/verifier | open | open | one conserved mass/economic ledger; deterministic infeasibility before Monte Carlo |
| S14 | P1 | Release/type/CI gate | open: 246 strict errors, no CI | open | burn down and make gates mandatory |
| S15 | P1 | Reproducibility/toolchain/scripts | open | open | immutable inputs, locks/dev deps, repaired validators and maintenance scripts |
| S16 | P2 | Frontend scientific isolation/degraded modes | partial | partial | separate hypothetical state, stop paused uploads, add WebGL fallback and keyboard operation, and make reduced-motion affect simulation motion |
| S17 | P2 | Capability/latent physics backlog | partial | partial/worse | multi-rev Lambert, hyperbolic bounds, worker watchdog, binaries, scale, SMBH; revalidate before prioritizing |

This table intentionally does not reproduce old per-report issue counts. Several report IDs describe
the same mechanism, and several old findings are now closed or branch-specific.

## 9. Execution plan

### Phase 0 — converge without regression

1. Commit or deliberately shelve the intended local artifacts, require a clean worktree, create
   safety refs for all three tips, and assert `sun-focus = 13ca9ec`, `main = d834dbe`, and the audited
   working tip before changing branch state.
2. Create `fix/sunfocus-reconcile-2026-09-25` from exact commit `13ca9ec`.
3. Merge exact commit `d834dbe` with `--no-commit` so conflicts can be resolved as one reviewed unit.
4. Port the trajectory plan commit `e356422` and this replacement-plan commit explicitly; neither is
   part of `main @ d834dbe`.
5. Apply the conflict decisions in Section 3.3; record every manual scientific resolution in the
   merge commit message or a short companion ledger.
6. Restore mainline-only tests/files that a textual resolution would delete.
7. Preserve the existing sun-only JD bound and identity soft cap without redesigning them in this
   convergence change. Port the valid determinism tests, rate-free invariant, and numerical policy.
8. Run the preservation suite before adding new fixes. A failing previously closed gate blocks the
   merge; do not weaken its budget to make the merge green.
9. Before any non-loopback use, land a separate containment commit that disables caller-triggered
   cold PFSS work or requires authentication and applies gateway/middleware limits. Do not wait for
   the solver redesign to contain a confirmed anonymous CPU-denial path.

Exit: one reconciled branch contains the union of valid behavior, no known mainline regression, and
`sun-focus` can fast-forward to it after review.

### Phase 1 — make the remaining R3 defects red

Land tests/evidence first:

- analytic Legendre values and orthogonality;
- scalar/batch/derivative/pole consistency;
- pure harmonic decomposition/reconstruction and PFSS radial/tangential boundary ratios;
- committed GONG FITS orientation/WCS/LONG0/exact-rotation and bounded-decompression cases;
- analytic/reference WSA expansion behavior;
- same-rotation/different-synthetic-epoch cache identity;
- recorded UI polling trace and cache-hit ratio;
- 40-request load barrier with health/cross-endpoint probes;
- cache-hit availability during cold-work saturation;
- trusted/untrusted proxy identity cases;
- browser physics + AIA success, stale, retry, and unavailable states.

Exit: every active R3 mechanism has a failing behavioral test against the reconciled pre-fix code.

### Phase 2 — correct PFSS before optimizing it

1. Fix the harmonics convention and decomposition/reconstruction chain.
2. Fix the input-grid/WCS path and exact source provenance.
3. Fix or accurately relabel WSA expansion semantics.
4. Cross-check the solver against analytic fields and an independent reference.
5. Define observed and synthetic snapshot identities explicitly.
6. Change cache canonicalization only after the scientific-equivalence tests exist.

Exit: numerical gates pass; no distinct computed state aliases silently.

### Phase 3 — isolate work and repair the delivery contract

1. Put PFSS in its own bounded process/snapshot service.
2. Serve cached/last-known-good snapshots without cold-work admission.
3. Precompute supported fidelity snapshots and refresh asynchronously.
4. Align client cadence, timeout, server rate, retries, CORS, and UI state.
5. Add hard termination, worker recycling/restart, metrics, and deterministic overload responses.
6. Declare and test the supported worker/replica topology or add shared global enforcement.

Exit: the real browser receives useful solar data and load cannot starve health, trajectory, or
mission control paths.

### Phase 4 — close exposure and release gates

1. Replace the preserved identity soft cap with bounded TTL/LRU storage and instrument it; retain the
   already-preserved JD rejection.
2. Implement trusted-proxy configuration and credential-based identity.
3. Make authentication fail closed outside an explicit local-development profile.
4. Add CI lanes for REBOUND, numerical oracles, strict TypeScript, tests, and build.
5. Fix the R2 velocity derivative/gate and remaining documentation truth gaps.

Exit: the PFSS/R3 hardening scope can close only if every promoted input, mathematics, provenance,
WSA, load, and delivery gate passes. Broader solar-model semantics in S12 remain explicitly open.

### Phase 5 — execute the broader register by dependency

1. Trajectory amplification and request-body/auth controls.
2. Benchmark oracle, licensing, and README truth.
3. Moon rendered-set coverage, EMB semantics, and asteroid GPU precision.
4. MGA/mission ledger and deterministic risk.
5. Remaining toolchain, performance, accessibility, and latent capability backlog.

Do not combine these into one mega-merge. Each scientific change lands with its oracle and rollback
boundary.

## 10. Release acceptance gates

| Gate | Required result |
|---|---|
| Branch preservation | every mainline-only fix in Section 3.1 remains present and its regression test passes |
| R1 | all 14 existing unit/physical tests plus a new handler non-brick/retry test pass with REBOUND installed; no skip |
| R2 position | shared six-epoch planet oracle, drift, and aggregate budgets pass unchanged |
| R2 invariant | a plain generic rate-free Kepler orbit reproduces its captured path; mutation fails the test |
| R2 velocity | external-oracle budgets are documented per planet/epoch and position/velocity derivative consistency is gated |
| PFSS basis | all scalar/vectorized implementations agree through `lmax=15`; analytic values, normalization, derivatives, poles, and quadrature orthogonality pass |
| PFSS fields | pure dipole/quadrupole isolation, photospheric reconstruction, tangential source-surface boundary, and radial ratios pass |
| PFSS input/WSA | committed FITS WCS/orientation/LONG0/exact-CR and bounded-expansion gates pass; WSA passes a reference case or is relabelled approximate |
| Cache science | reuse occurs only within a declared equivalence relation and error budget; canonical inputs/source identity are returned; single-flight performs one compute |
| Deterministic load CI | with rate budget ≥100/min, concurrency 2, and no queue, 40 unique cold jobs start exactly 2 computes and return the declared overload outcome for the other 38; no rejection is counted as completed work |
| Reference load benchmark | while two cold high jobs really execute, at least 100 `/health` samples have p95 <50 ms; fixed trajectory/mission controls remain <250 ms p95 and within 1.25× their recorded idle p95 on the documented host |
| Admission/recovery | active work never exceeds capacity; timed-out work is terminated/completed before release; crash/restart/queue recovery and supported replica topology pass |
| Cached availability | 40/40 warm snapshot reads return 200 during cold saturation with p95 <100 ms on the reference host |
| Browser delivery | dev and preview each achieve ≥95% scheduled physics success over five minutes, render ≥1 AIA tile, stay within declared staleness, expose source/state, and have zero silent fallback |
| Abuse controls | spoofed forwarded headers from untrusted peers create no identities; both physics/AIA stores remain bounded; trusted-proxy cases pass |
| Authentication | middleware/gateway rejects unauthenticated non-development body-bearing work before parsing/allocation; WebSockets reject before accept |
| CI | locked production/test dependencies, strict typecheck, frontend/backend tests, verifiers, and production build are mandatory and green |

## 11. Closed findings to preserve

Do not spend another cycle rediscovering these unless a gate regresses:

- asteroid belt transform order;
- REBOUND 5 IAS15 compatibility and Cartesian N-body seeding;
- R1 Kuiper velocity normalization and bound-orbit guard;
- R2 planet mean-anomaly advance and its position oracle;
- worker Float64 payload and filtering contract;
- heavy-worker permit lifetime;
- realtime full-input cache identity and single-flight behavior (not exact-JD key shape as a permanent contract);
- basic Lambert TOF certificate and exhausted-bracket refusal on mainline;
- unpowered flyby `|v∞|` continuity on mainline;
- asteroid SHA/provenance fail-closed behavior on mainline;
- report path containment/overwrite protection;
- fitted/native-frame required-moon path and UTC/TDB handling on mainline;
- recent responsive layout, focus restoration, canvas labelling, and CSS animation-reduction fixes
  on mainline. WebGL fallback, keyboard operation, and simulation-level reduced motion remain open.

“Closed” here means preserve the behavior and gate. It does not imply that the containing subsystem
is operationally or scientifically complete.

## 12. Immediate next action

Start Phase 0. The first implementation PR should contain only semantic branch convergence and
preservation tests. If any deployment is non-loopback, land the containment commit immediately next.
The first new scientific fix after that should be R3.1, because optimizing or exposing a PFSS solver
whose basis functions are wrong only makes invalid output faster and more available.

The implementation-ready work order, scientific budgets, test matrix, operational architecture, and
definition of done are in
[`R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md`](R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md).
