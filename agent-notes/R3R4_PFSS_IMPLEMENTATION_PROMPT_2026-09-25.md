# R3/R4 PFSS Release-Blocker Implementation Prompt — 2026-09-25

Use this document as the implementation prompt for the next engineering run. It is intentionally
self-contained. The assignee must implement, verify, and commit the work phase by phase; producing
another plan without code does not satisfy the assignment.

## Implementation prompt

You are the staff-level owner for closing R3 and the R4 gates required to release it in
`solar-system-realistic-sim`.

Make the PFSS/solar pipeline scientifically defensible, operationally isolated, secure against
caller-triggered resource exhaustion, and reliably consumable by the first-party UI. Build numerical
and behavioral gates that independently prove those properties. The historical starting solver had
wrong basis functions and input-grid interpretation; preserve their corrected implementation and
gates, and do not optimize or expose the remaining unvalidated provider/oracle path.

Do not stop after analysis. Implement the work, keep the repository reviewable with bounded commits,
run the required verification, update the status document with evidence, and leave the integration
branch ready for review. Do not push or merge to `main` unless explicitly instructed.

### 1. Starting state and authority

At prompt creation:

- planning checkout: `fix/trajectory-amplification-defense-in-depth @ 3b2eaf7`;
- audited production source tip: `7cab690`;
- local main: `d834dbe`;
- local `sun-focus`: `13ca9ec`;
- merge base: `ec7ad33a503da3a4c6bfd87e4c498e8a53be6984`;
- canonical status/sequence:
  `agent-notes/SUNFOCUS_REGRESSION_STATUS_AND_FIX_PLAN_2026-09-25.md`;
- the untracked September 24 audit and evidence directory are user-owned evidence. Preserve them.

Execution update (2026-09-26):

- isolated implementation branch: `fix/r3-r4-pfss-remediation`;
- implementation base: `fix/trajectory-amplification-defense-in-depth @ d175e4b`;
- task decomposition: `d13b633`;
- scientific-core implementation through review round 1: `3747521`;
- the prompt-creation refs above remain historical audit pins; they are not a claim that the
  implementation branch is still at `7cab690`;
- the user-owned September 24 audit/evidence files in the primary checkout remain untouched.

Before changing branch state, verify these refs still mean what this prompt says. If any moved, stop
and re-audit the delta rather than silently using a mutable tip. Work from a clean worktree, create
safety refs, and stage only intentional files.

Evidence precedence:

1. fresh tests and measurements against the exact implementation tip;
2. committed analytic/independent-oracle fixtures with checksums;
3. `CODEBASE_AUDIT_2026-09-24.md` and its `bd48a7d` addendum;
4. the consolidated status plan above;
5. older reports as historical provenance only.

#### 1.1 Baseline defects and current disposition

The original red mechanisms were re-executed before coding. The recurrence wording in the initial
prompt was imprecise: the three paths were duplicated implementations of the same incorrect
mixed-normalization recurrence, not three numerically divergent recurrences.

| Mechanism | Status at `3747521` | Evidence / remaining boundary |
|---|---|---|
| Associated-Legendre recurrence | **FIXED in scientific tranche** | `1a6fcaa`, `2379c10`; one shared `schmidt-quasi-normalized-no-cs-v1` basis, immutable SciPy-generated fixture, value/orthogonality/derivative/pole/scalar-batch gates. |
| Grid and real-mode normalization | **FIXED for explicit/synthetic grids; observed ingestion contained** | `70af7c8`; explicit equal-area geometry, area weighting, stable least squares, and no second `m>0` multiplier. The ambiguous legacy observed array is rejected in favor of an explicitly reasoned synthetic fallback until the provider tranche. |
| FITS/WCS and acquisition | **OPEN / release-blocking** | The partial reader, archive selection, resource bounds, immutable provider fixture, and source metadata have not yet been replaced. No observed GONG payload is currently advertised as validated. |
| Carrington/time/unit semantics | **PARTIAL** | Rotation arithmetic remains usable, but `27.2753 d` is still mislabeled sidereal and provider coverage/time-scale/unit provenance remains absent. |
| PFSS boundary and analytic field | **FIXED for the implemented mathematical core** | The numerical source-surface code already enforced `Btheta=Bphi=0`; the false `Br=0` documentation was corrected in `99b3231`. Analytic radial-factor, reconstruction, divergence, and curl gates now pass. |
| Tracing and WSA-inspired mapping | **FIXED for local semantics; independent corpus/convergence still OPEN** | `487a0ef`, `cca44bc`, `ea41dda`, `8fd45d5`, `3747521`; exact three-state intersections, radial expansion, bounded lookup, nullable availability, and honest `wsa_inspired_v1`/fallback provenance. A stratified independent real-map/tracer-convergence corpus remains R4 work. |
| Cache and execution | **PARTIAL, unchanged by this tranche** | Exact request identity, bounded LRU, single-flight, and permit ownership until thread completion remain preserved. Ready hits are still behind admission; solar still shares a non-killable in-process executor. |
| Browser delivery | **PARTIAL, unchanged by this tranche** | One-flight, last-known-good, and error backoff remain. The shipped 900 ms cadence, short timeout, cancellation waste, and AIA/PFSS coupling remain open. |
| Security/admission | **OPEN, unchanged by this tranche** | Unconditional XFF trust, fail-open unconfigured auth, anonymous cold GET work, and unbounded identity maps remain. |
| R4 release gates | **PARTIAL** | Analytic/oracle/property coverage and retained red-before-green evidence are materially stronger. The independent GONG/PFSS corpus, hermetic provider fixture, mutation runner, pinned CI, Playwright, load, and global TypeScript work remain open. |

If re-audit disproves a mechanism, record the exact commit/test evidence and remove only that item;
do not weaken the remaining work because a symptom has moved.

#### 1.2 Scientific-core execution evidence — 2026-09-26

Commits, in dependency order:

```text
d13b633  decompose scientific remediation work
1a6fcaa  shared normalized harmonic basis and independent fixture
2379c10  absolute derivative and identity gates
70af7c8  explicit sine-latitude grid and decomposition
99b3231  analytic PFSS boundary certification
487a0ef  three-state exact tracing
cca44bc  outer-boundary tangent termination
ea41dda  scale-aware boundary roundoff handling
8fd45d5  radial WSA-inspired availability and honest Parker provenance
3747521  spherical boundary geometry and strict WSA-map validation
```

The harmonic fixture file SHA-256 is
`f969b908369b259370a34663e86fec55ee03b6773a781e452bb9764166f8d504`; its
recorded payload SHA-256 is
`662247d28f75e3795743c21c744c53c6de826132e83d744b65853814b5a344c3`.
The independent generator SHA-256 is
`1dfced4438d610a87bbbffd282d904ffba662fc2e20d263cff46a07f3af6d787`.

Fresh integrated evidence at `3747521`:

- five scientific PFSS/WSA files together: `976 passed in 11.04s`;
- full backend: `1405 passed, 4` pre-existing optional-dependency skips;
- frontend Vitest: `164 passed`;
- production build: passed, with the pre-existing large-chunk warning;
- global strict TypeScript: still red with `240` errors;
- Task 5 independent re-review: clean after three Important findings were fixed; `99` focused tests
  plus independent polar-edge and malformed-input probes passed.

This evidence closes only the implemented scientific-core mechanisms. It is not evidence for live
GONG ingestion, real-map fidelity, process isolation, security, browser delivery, or R3/R4 release.

### 2. Scope

R3 includes all of the following; none may be silently deferred while declaring R3 closed:

- associated-Legendre normalization, recurrence, derivatives, and scalar/batch agreement;
- spherical-harmonic decomposition and PFSS boundary mathematics;
- GONG product selection, FITS/WCS interpretation, coordinate orientation, exact source selection,
  provenance, bounded acquisition, and flux-balance policy;
- independent PFSS comparison and WSA/WSA-inspired semantics;
- snapshot/artifact identities, cache correctness, bounded storage, and single-flight;
- CPU/process isolation, hard deadlines, worker crash recovery, global capacity, and cache-hit
  availability under cold saturation;
- API schemas, status/error semantics, authentication, trusted proxies, rate identities, bounds,
  CORS, and deployment profiles;
- browser delivery, last-known-good behavior, independent AIA delivery, source/staleness disclosure,
  retry, pending, overload, and unavailable states;
- metrics, rollout, rollback, and operations documentation.

R4 in this assignment is the numerical/behavioral release system needed to prove R3:

- oracle taxonomy and conventions;
- immutable fixtures and independent reference generation;
- analytic, invariant, reference, state-machine, mutation, integration, browser, and load gates;
- deterministic offline CI and locked runtime/test/oracle toolchains;
- red-before-green proof that tests detect the original mechanisms.

Out of scope unless required to preserve or exercise R3:

- trajectory algorithm redesign, mission economics, moon catalog expansion, asteroid taxonomy,
  SMBH models, and unrelated UI features;
- broad solar-model claims outside the promoted PFSS/WSA/input/delivery scope;
- silently burning down unrelated TypeScript errors under an R3 commit. Handle the global strict
  backlog explicitly as described below; do not hide it or call it green.

### 3. Non-negotiable engineering rules

1. Do not merge `sun-focus` into mainline wholesale. Preserve mainline’s exact PFSS cache, WebSocket
   ownership, Lambert, MGA, asteroid provenance, fitted moon, time-scale, and UI fixes. Port only
   validated `sun-focus` deltas.
2. Add the failing scientific or behavioral gate before each fix. Record the red result as a CI/PR
   artifact; do not commit large run logs.
3. Never derive an expected scientific value through production code or a copied implementation.
4. Never weaken a reviewed tolerance merely because the implementation misses it. If a budget is
   genuinely wrong, write an ADR with independent evidence before changing it.
5. Blocking tests are offline and order-independent. Live GONG/AIA checks are scheduled provider
   smoke tests, never the numerical release oracle.
6. Do not use sleeps as concurrency proof. Use injected clocks, events, barriers, exact counters,
   and watchdog sleeps only to prevent a hung test.
7. Drive the injected production service or public route; do not test a copied semaphore/cache.
8. Request cancellation is not worker cancellation. Capacity remains owned until work completes or
   its process is terminated and reaped.
9. Never place a ready snapshot/cache hit behind cold-work admission.
10. Never trust `X-Forwarded-For` unless the immediate peer is a configured trusted proxy.
11. Never ship a durable server API key in browser JavaScript.
12. Byte determinism proves a contract, not scientific validity.
13. A missing required dependency must fail the lane, not create a skip/xfail.
14. Use small commits with one rollback boundary. Do not combine reconciliation, math, process
    isolation, client redesign, and CI in one commit.

### 4. Required architecture

Write short ADRs before implementation, then implement against these boundaries. Equivalent naming
is acceptable; collapsing the responsibilities back into `backend/server.py` is not.

#### 4.1 Scientific core

Create a shared harmonic module used by decomposition and scalar/vector field evaluation. Select this
convention unless independent evidence justifies another in the ADR:

```text
Schmidt quasi-normalized associated Legendre functions
no Condon–Shortley phase
Pbar_l^m(x) = sqrt((2-delta_m0) (l-m)!/(l+m)!) P_l^m(x)
```

This gives `Pbar_1^1 = sin(theta)`, leaves zonal modes as ordinary Legendre polynomials, and gives
each real sine/cosine mode surface norm `4*pi/(2*l+1)`. Coefficient normalization, recurrence,
derivatives, fixtures, and public convention version must use the same definition.

Eliminate three independent formulas. `_associated_legendre`, `_legendre_at_point`, and
`_legendre_batch` must delegate to the same coefficients, normalization, derivative, and pole policy.

#### 4.2 Source-resolved magnetogram snapshots

Replace a raw `ndarray | None` with an immutable `MagnetogramSnapshot` carrying at least:

- provider/source kind and exact product;
- final allowlisted source URL and filename;
- requested simulation time, provider reference/generation time in native UTC, longitudinal coverage
  interval, and any separately derived TDB value;
- Carrington rotation, current/left-edge longitude, and coverage/weight metadata;
- original relevant FITS/WCS fields;
- native and canonical grid shape/convention;
- physical quantity, `BUNIT`, Gauss conversion, radial-field assumption, polar-fill and zero-point
  correction status;
- compressed-byte and normalized-content SHA-256;
- retrieval timestamp;
- flux-balance transform/version;
- quality flags and fallback reason.

Adopt a source product deliberately. Prefer the zero-point-corrected GONG `zqs` product unless the
ADR selects and validates a different product. A requested JD is not a magnetogram identity.
GONG synoptic maps accumulate longitude-dependent observations across much of a rotation; never
present the entire surface as an instantaneous observation. Define maximum age, nearest-at-or-before
versus nearest selection, future-observation policy, archive boundaries, and month/year/CR rollover.
Current live observations must never blend into an arbitrary historical/future simulation epoch.

Use `astropy.io.fits`/WCS as pinned runtime dependencies instead of expanding the partial hand-written
FITS parser. Keep SciPy, SunPy, and `sunkit-magex` in the oracle environment unless runtime use is
explicitly justified.

#### 4.3 Identity model

Use separate identities:

`IntentKey` for admission/single-flight:

- schema/model version;
- exact or explicitly canonicalized effective epoch;
- forcing/source policy;
- fidelity and effective `n_lines`, `lmax`, `max_features`;
- activity/data policy and deterministic seed.

`MagnetogramSnapshotId` after source resolution:

- source/product/revision/content hash;
- provider reference time, coverage interval, CR, left edge;
- canonical-grid/transform and flux-balance versions.

`PFSSSolutionKey`:

- snapshot ID;
- solver/harmonic-convention version;
- source-surface radius and `lmax`;
- seeding/tracing version and effective line count;
- WSA version and effective boundary-grid resolution.

`SolarArtifactKey` for the whole response:

- PFSS solution identity;
- forcing mode, feature limit, realtime observation/product IDs;
- every effective wall/simulation epoch input and algorithm version.

Acquisition timeout is attempt metadata, not scientific identity. Observed and synthetic artifacts
never share a key. A timeout-derived synthetic fallback cannot overwrite an observed artifact.
Quantization is allowed only under a named policy with an external error budget; responses expose
the canonical effective values.

Cache reuse is layer-specific. A `PFSSSolutionKey` may be reused across requests with different
display/simulation epochs when they resolve to the same immutable magnetogram snapshot and identical
solver/tracer inputs. A complete `SolarArtifactKey` may be reused only when every effective epoch and
realtime input is identical, or when a separately named canonicalization policy has a measured error
budget and the response discloses the canonical values. Never describe PFSS-layer reuse as reuse of
the entire response artifact.

#### 4.4 Snapshot coordinator and worker supervisor

Implement one authority for snapshots. Do not add another per-request `ThreadPoolExecutor` or hide a
`ProcessPoolExecutor` behind every API worker.

Suggested modules:

- `backend/solar/contracts.py` — strict V2 request/envelope/pending/error schemas;
- `backend/solar/identity.py` — canonical JSON and SHA-256 identities;
- `backend/solar/snapshot_store.py` — memory LRU plus content-addressed LKG storage;
- `backend/solar/snapshot_manager.py` — lookup, single-flight, stale-while-revalidate, admission;
- `backend/solar/worker_supervisor.py` — supervised spawn-context subprocesses;
- `backend/solar/worker_entrypoint.py` — pure CPU artifact construction;
- `backend/solar/magnetogram_provider.py` — bounded, validated source acquisition.

Manager state machine:

```text
ABSENT -> QUEUED -> ACQUIRING -> RUNNING -> VALIDATING -> READY
                   \-> FAILED / cooldown
```

Resolve order:

1. authentication, strict cheap validation, and read-rate check;
2. ready artifact lookup;
3. scientifically compatible last-known-good lookup;
4. existing-flight lookup;
5. cold-job admission.

Only an authorized refresh POST or the bounded scheduler may execute step 5. GET resolution stops
after step 4 and is side-effect free for every role.

“Compatible” means the same effective scientific identity. Never serve a nearest JD/source unless a
separately named error-bounded policy permits it and discloses the offset.

The coordinator owns a bounded memory LRU. A content-addressed persistent LKG store is mandatory in
external/release mode and optional only in unit/local mode. It has a versioned namespace, disk-byte
quota and GC, backward-readable metadata, and single-writer fencing. Commit only finite,
schema-valid, bounded artifacts using write-temp, file fsync, atomic rename, directory fsync, then
metadata commit. Never expose paths.

Network acquisition has a separate bounded owner. DNS/connect/read/total deadlines and cancellation
do not release its slot until the operation actually exits. Run decompression, FITS parsing, WCS,
canonical regridding, and any library code without a reliable hard deadline in a supervised killable
process or equivalently hard-isolated service with its own `K_io/Q_io`, generation fencing,
kill/reap/restart, RSS/FD/temp/output caps, and circuit breaker. A timed-out socket/parser cannot
remain alive while capacity is credited back. The compute child receives immutable validated
inputs plus hashes and performs no network access. It builds the entire CPU-heavy
`SolarCoronaPhysicsModel.sample_state` artifact—including PFSS, feature scoring, arcs, and Parker
assembly—so Python loops cannot starve the API event loop.

Use spawn-context supervised subprocesses, one active job at a time per long-lived child. Set BLAS/
OpenMP thread counts to one before NumPy import. Begin with worker capacity `K=1`; raise it only after
a CPU-quota benchmark. Use a bounded queue `Q <= 2K`, monotonic queue TTL/deadlines, generation
fencing, process-group kill/reap/replacement, crash circuit breaker, and recycle after a configured
job count or RSS watermark. A late result from a killed generation never commits. UTC is for
provenance timestamps only.

Admission is fair across authorized principals and reserves bounded queue opportunity for the
canonical freshness scheduler. With `K=1`, use priority aging plus a cap on consecutive ad-hoc jobs;
do not pretend a second worker is reserved. Prove that sustained permitted ad-hoc traffic cannot
starve a required-profile refresh.

Process count alone is not host isolation. Reserve API control-plane CPU and enforce child CPU,
address-space/RSS, PID, file-descriptor, temporary-disk, and output-size limits through the pinned
container/cgroup or documented OS equivalent. Use bounded framed IPC or size-check artifact files
before deserialization. Keep FITS parsing/WCS/decompression off the event loop and include it in the
health-isolation load case.

Supported topology:

- local/development: embedded coordinator, exactly one API worker, loopback binding;
- network/deployment: stateless API workers use one external coordinator over UDS or private
  authenticated transport; global cache/single-flight/K/Q live there.

Embedded mode holds an interprocess singleton lock or exclusive UDS for coordinator lifetime; a
second real `uvicorn --workers` child must fail startup. Network mode fails startup when coordinator,
authentication, or trusted-origin configuration is missing. `trusted_proxies=none` is a valid safe
direct-deployment policy; forwarded headers enabled without exact CIDRs must fail. Do not simulate
global limits with process-local maps.

`/health` is a cheap process-liveness endpoint and never probes PFSS/upstreams. `/ready` is read-plane
readiness only: API control plane, coordinator connectivity, and compatible store/LKG readability.
A busy/full compute queue, open compute circuit, or unavailable worker must not remove replicas that
can still serve validated artifacts. Publish `compute_ready`, acquisition/compute queue/circuit, and
snapshot-profile freshness separately. Snapshot freshness is keyed by a configured deployment-
required profile set and maximum serve-stale age; readiness never guesses an arbitrary JD identity.

Protect the internal coordinator boundary: UDS ownership/mode and peer credentials on one host, or
mTLS/service audience/role/replay controls plus network policy in a cluster. Direct unauthorized
coordinator access is a release-gated denial case.

#### 4.5 V2 route contract

Keep `GET /solar/physics` as a resource resolver during migration. Use orthogonal dimensions:

```text
state = ready | pending | unavailable
freshness = fresh | stale                 # only when ready
requested_policy = observed_only | hybrid_allowed | synthetic_only
components.<name>.actual_source = provider/product/revision | procedural/version | unavailable
components.<name>.fallback_reason = null | explicit reason
components.<name>.confidence = documented quality tier
components.<name>.provider_reference_utc/coverage = source-specific values
```

A ready envelope exposes schema/model versions, normalized request, artifact/snapshot ID, requested
simulation TDB epoch, generation/fresh/serve-stale timestamps, per-component actual source/product/
content hash/reference UTC/coverage/source age/fallback/confidence, artifact-cache age, harmonic/PFSS/
WSA versions, fidelity, preprocessing/removed monopole, quality flags, and data. Do not invent one
global “effective observation epoch,” source, or confidence for a longitudinally accumulated,
multi-source response.
Generate the frontend V2 types from the authoritative schema (or verify a checked-in generated
artifact); add a producer/consumer contract test so server and client cannot drift independently.

HTTP semantics:

- `200` fresh or acceptable stale artifact;
- `304` matching ETag;
- `202` no compatible artifact and a canonical job already exists; include opaque job ID, `Location`,
  and `Retry-After`, and return under 100 ms. GET never accepts a new job;
- `422` unknown/invalid parameter or unsupported scientific input;
- `401` missing/invalid authentication, `403` insufficient role;
- `413` body/resource declaration too large, `415` unsupported media type;
- `429` principal budget exhausted;
- `503` queue full, circuit open, coordinator unavailable, or no safe artifact; include
  `Retry-After`;
- provider failures never leak as raw `500`.

Remove all fetch/compute side effects from GET for every role. Add protected idempotency-key-aware
`POST /solar/physics/refresh` for compute/operator roles with an 8 KiB body cap; it returns 202 for
an accepted/existing canonical job, then clients poll GET. Apply the same resource contract to
realtime/AIA: cold or expired GET is cache/status-only, while protected POST or the bounded scheduler
performs upstream refresh. A viewer GET may read an allowed artifact but never creates work. The
first-party browser either uses its compute-authorized same-origin session to POST deliberately, or
operates read-only against scheduler-prepared snapshots; test both deployments.

Authenticated responses use `Cache-Control: private, no-cache`, consistent validators on 304, and
`Vary` for the actual authorization/origin dimensions. A public immutable-artifact/CDN policy is a
separate reviewed mode with byte/egress limits. Bound refresh idempotency state by principal plus
canonical request, TTL, count, and bytes.

Version the public contract through an explicit endpoint or negotiated media type. Use client-first
dual-read migration, sticky cohorts, versioned ETag/cache namespaces, and rollback tests in which the
previous safe client/binary reads retained prior-format artifacts. Define a minimum safe rollback
build and an allowlisted artifact manifest containing solver/convention/source/schema versions plus
validation status. Quarantine/purge pre-fix PFSS entries and pin the allowlisted rollback set against
quota GC. Never randomly traffic-split incompatible response shapes or roll back to known-bad math.

#### 4.6 Browser contract

Replace 900 ms exact-JD high-fidelity polling with snapshot-aware refresh:

- one in-flight resolve;
- refresh on effective epoch/profile/source-policy change or `fresh_until`;
- use an explicit protected POST to request cold work only when the session has compute role;
  otherwise remain a read-only viewer of scheduler-prepared snapshots;
- debounce seeks by 250–500 ms;
- honor ETag/304, 202, `Retry-After`, 429, and 503;
- use exponential full-jitter backoff;
- preserve last-known-good state;
- abort obsolete responses without assuming server work is cancelled;
- keep AIA delivery independent of PFSS success;
- show requested policy plus per-component actual source/reference/coverage/freshness/age/fallback,
  pending, degraded, and unavailable states;
- never perform a silent fallback.

Remote first-party authentication uses a same-origin session or short-lived token, not a durable key
in the bundle. Network mode requires TLS. Session cookies are Secure, HttpOnly, and deliberately
SameSite; compute-triggering POSTs enforce CSRF and Origin. Tokens validate issuer, audience, expiry,
and role; static-key fallback uses constant-time digest comparison and rotation.

#### 4.7 Security and admission

- Local profile binds `127.0.0.1`; reload is allowed only there.
- Network profile fails closed for empty auth, reload, wildcard CORS, missing coordinator, or missing
  proxy/origin policy.
- The R3 network profile exposes an explicit route allowlist. Deny unrelated trajectory, mission,
  benchmark/write, and simulation-WebSocket routes at the gateway unless they are separately placed
  behind centralized authentication, body limits, and global admission. A secure solar route in an
  otherwise open shared process does not make the deployment profile secure.
- Authentication/body limiting runs in gateway/ASGI middleware before body buffering, model
  construction, cache lookup, or worker admission. Reject bodies on GET; cap general JSON at 64 KiB
  and refresh at 8 KiB.
- Enforce request-line, query, aggregate/per-header, header-count, connection, keepalive, header/body
  idle, and total-body limits at the server/gateway. Reject ambiguous `Content-Length` plus
  `Transfer-Encoding`, oversized/slow chunked bodies, and unsupported compressed request bodies
  before application buffering. Test slow-header/body and connection-exhaustion cases.
- Disable implicit proxy-header trust. If the immediate peer is configured, validate a bounded chain
  and walk right-to-left to the first untrusted address. Otherwise use peer address. Credential
  subject wins as rate identity.
- Replace both physics and AIA timestamp-deque maps with bounded TTL/LRU token buckets. Separate
  read, cold-enqueue, force-refresh, and AIA budgets.
- Enforce anonymous read limits at a shared gateway/coordinator across API replicas, or expose only a
  deliberately public immutable CDN artifact with bounded response/egress. Per-process read limits
  are not global protection.
- Apply JD and effective feature/fidelity bounds before lookup/admission.
- Bound directory listings, compressed/expanded input, FITS header, pixels, redirects, connect/read/
  total time, and gzip ratio.
- Use allowlisted HTTPS hosts/basenames. Reject cross-host redirects, traversal, absolute paths,
  unsupported schemes, malformed FITS, and conflicting metadata.
- Authenticate/authorize detailed status, profiling, and metrics endpoints; expose only bounded
  low-cardinality liveness publicly where the deployment requires it.

### 5. Oracle taxonomy for R4

Update and port `src/sim/TESTING_NUMERICS.md` with these classes:

| Class | What it may prove | R3 use |
|---|---|---|
| A — exact analytic | correctness for the analytic case | closed-form `P_l^m`, derivatives, pure PFSS modes |
| B — independent computational | accuracy within a declared tolerance | frozen `sunkit-magex`/SciPy PFSS reference |
| C — physical/property invariant | necessary property, not full validity | orthogonality, reconstruction, boundary, divergence/curl |
| D — contract/golden | schema and compatibility only | canonical payloads, compatibility output |
| E — behavioral/state machine | ownership, admission, availability | single-flight, timeout, hit path, proxy/rate bounds |
| F — performance/SLO | operational claim on a pinned runner | load isolation and browser delivery |
| G — live-provider smoke | upstream compatibility only | scheduled GONG/AIA check, non-blocking for PRs |

Every fixture manifest records source, oracle class, coordinates, units, normalization/phase, grid,
`lmax`, source-surface radius, exact tool/locked version, generator source hash/container digest, per-file
SHA-256, tolerances/rationale, creation command, and date. Current broken output is never an oracle.

Canonical fixture serialization is a versioned projection, not “whatever fields happen to compare.”
It fixes metadata key order, UTF-8 encoding, float dtype/endianness, array order, NaN policy, and
scientific field order. Only retrieval/generation/cache-attempt timing, opaque request/job IDs, and
runtime metrics may be excluded from byte-determinism comparisons. Public scientific values,
quality flags, effective epochs, source/artifact IDs, and algorithm versions may not be dropped.

#### 5.1 Numerical metric definitions

Freeze the exact formulas and sampling sets in the fixture manifest before implementation:

- use nonzero unit-amplitude analytic coefficients in the declared Gauss convention;
- `RMS(v) = sqrt(sum(w_i*v_i^2)/sum(w_i))` with declared surface/volume weights;
- relative RMS error is `RMS(test-reference)/max(RMS(reference), floor)`, where `floor` is a
  documented machine-precision multiple derived from the injected analytic amplitude—not a hidden
  one-gauss constant;
- maximum normalized error uses the same reference scale and fixed sample set;
- coefficient leakage is the L2 norm of all off-target coefficients divided by the absolute injected
  target coefficient;
- neutral-line mask is exactly `abs(Br_reference) < 0.01*RMS(Br_reference)` on the declared grid;
- divergence/curl residual is dimensionless `Rsun*RMS(residual)/max(RMS(B),floor)`, evaluated on a
  fixed interior stencil with declared step and a step-halving convergence check;
- condition number is the 2-norm condition number of the weighted design matrix;
- deterministic angles/mixed coefficients are listed in the fixture or generated with NumPy
  `PCG64(20260925)` and a recorded NumPy version;
- pole tests assert exact `m=0` values, `m>0` limits, derivative limits, and Cartesian continuity from
  several longitudes—not mere finiteness;
- NPZ provenance includes a canonical scientific-content hash over normalized dtype, shape, byte
  order, C-contiguous array bytes, and metadata JSON; ZIP container bytes alone are not authoritative.

Do not use the word “normalized” in a gate without pointing to one of these definitions.

### 6. Ordered implementation plan

Use multiple subagents for bounded non-overlapping work, but the primary owner reads the relevant
code, owns conflicts, reviews every change, and runs integrated verification.

Critical path:

```text
P0 reconcile/contain
  -> P1 contracts, locks, seam, fixtures
  -> P2 red gates
  -> P3 harmonics/decomposition
  -> P4 source acquisition/WCS
  -> P5 independent oracle, WSA, identities/cache
  -> P6 coordinator/process/API
  -> P7 security/topology
  -> P8 browser delivery
  -> P9 release evidence/canary/cleanup
```

After P1, fixture licensing/provenance research, deterministic worker test-harness construction, and
frontend V2 type design may proceed in parallel because they own disjoint files. At `3747521`, the
analytic/explicit-grid subset of P3 and the local tracing/WSA-semantics portion of P5 are complete;
P3 remains partial until its separate oracle-regeneration lane and observed-ingestion proof exist.
P4 plus the independent P5 corpus, convergence, and scientific-cache work also block production-
worker promotion. Operational isolation does not substitute for those scientific gates. Land each
phase as one or more reviewable commits; never squash away red-before-green evidence before review.

#### Phase 0 — pin, reconcile, preserve, contain

1. Verify exact refs and working-tree ownership. Create safety refs.
2. Create `fix/sunfocus-reconcile-2026-09-25` from exact `13ca9ec`.
3. Merge exact `d834dbe` with `--no-commit`.
4. Resolve conflicts using current mainline PFSS cache, resource ownership, fitted moon/native-frame
   code, time-scale handling, MGA/Lambert/asteroid fixes, and current UI.
5. Port `e356422`, `3b2eaf7`, and this prompt commit explicitly; they are not in local main.
6. Preserve the `sun-focus` JD range, identity soft cap, valid tests, rate-free orbit compatibility
   invariant, and `TESTING_NUMERICS.md`. Reject its coarse PFSS cache and old moon implementation.
7. Run the full preservation suite before new code. Never weaken a gate to make the merge pass.
8. Land a separate containment commit before non-loopback use: loopback default, no anonymous cold
   compute, protected forced refresh, strict JD/query bounds, and local origins including `:4173`.

Exit:

- every manual conflict decision is documented;
- mainline-only files/tests remain;
- preservation gates pass;
- `sun-focus` can later fast-forward to the reviewed branch;
- anonymous cold PFSS work is unreachable in non-local profile.

#### Phase 1 — ADRs, locks, seams, and fixtures

1. Write ADRs for harmonic convention, coordinates/grid, source-surface boundary, GONG product,
   flux balance, WSA naming/formula, identities, API, process topology, and security profiles.
2. Introduce `create_app(settings, snapshot_backend=...)` or equivalent. Route tests inject an event/
   barrier fake implementing the production interface; stop relying on mutated globals.
3. Add `.python-version` for the proven Python `3.12.13` and `.nvmrc`/`engines` for the proven Node
   `22.23.2`; change either only through an explicit toolchain update.
4. Split and hash-lock runtime, CI, and oracle Python dependencies. Include `httpx` in CI, Astropy in
   runtime, SciPy/SunPy/`sunkit-magex` in oracle, and REBOUND 5.1.1 explicitly. Install each Python
   lock with `pip --require-hashes`; record the lock compiler and version; fail CI on lock drift.
   Assert exact Python and Node patch versions and use `npm ci` from the committed lockfile.
5. Add an immutable PFSS manifest and offline reference generator that cannot import production PFSS.
6. Record redistribution/data-policy approval for a small stratified GONG corpus: quiet, active/
   complex, polarity/topology-diverse, and polar or missing-data edge conditions. The blocking real-
   product gate requires either legally vendored fixtures or a content-addressed immutable mirror
   with an explicit retention/access guarantee. A transient upload is insufficient. If the mirror
   is used, add a pre-offline bootstrap command that verifies license metadata, manifest, and hashes
   into a local fixture cache before network-denied lanes. If neither form is available, keep the
   real-product/general-fidelity gate explicitly blocked and use a synthetic parser fixture only for
   parser mechanics; do not claim that it validates GONG metadata.
7. Add a red-before-green evidence manifest and `scripts/verify_r3_red_green.py`. In isolated
   worktrees it checks out the recorded pre-fix production SHA, applies only the recorded test/seam
   commit, runs the exact node IDs and confirms their named assertion failures, then reruns them at
   the fixed commit. Import, collection, timeout, or unrelated failures do not count as red evidence.

Suggested artifacts:

```text
backend/tests/fixtures/pfss/v1/manifest.json
backend/tests/fixtures/pfss/v1/maps/<fixture-id>/input_map.npz
backend/tests/fixtures/pfss/v1/maps/<fixture-id>/reference_field.npz
scripts/generate_pfss_reference.py
scripts/verify_pfss_reference.py
backend/tests/red_green/r3/manifest.json
scripts/verify_r3_red_green.py
```

Exit: conventions are explicit/versioned, locks install cleanly from scratch in the pinned
toolchains, hashes validate, the oracle environment has exact immutable versions rather than a
mutable “current” dependency, and the seam exercises production orchestration.

#### Phase 2 — make every known R3 mechanism red

Suggested test files:

```text
backend/tests/test_pfss_harmonics.py
backend/tests/test_pfss_analytic_fields.py
backend/tests/test_gong_magnetogram.py
backend/tests/test_pfss_reference.py
backend/tests/test_wsa_semantics.py
backend/tests/test_pfss_execution_contract.py
backend/tests/test_solar_physics_route_contract.py
backend/tests/test_solar_identity_policy.py
backend/tests/test_solar_physics_load_contract.py
src/frontend/features/solar/solarPhysicsClient.test.ts
tests/e2e/solar-delivery.spec.ts
```

Demonstrate red behavior for the old Legendre recurrence, uniform-theta grid interpretation, wrong
orientation/longitude, arbitrary GONG fallback, unbounded acquisition, coarse scientific identity,
observed/synthetic collision, permit release on timeout, hit-after-admission, crash recovery failure,
GET-triggered cold work, acquisition/parser timeout leakage, trace failure misclassified as closed,
nearest-endpoint/default-speed substitution, unconditional XFF trust, unbounded rate stores, exposed
non-solar compute routes in the R3 network profile, first-party timeout/poll mismatch, unsafe rollback
artifact eligibility, and silent fallback.

Include targeted numerical mutants for the extra `epsilon_m=2`/double normalization of `m>0`, an
accepted `l=0` monopole or unbounded flux correction, corrupted source-surface radial factors, use of
the wrong WSA endpoint/component, and a tracer that accepts its nearest step instead of interpolating
the exact boundary crossing.

Record exact node IDs and expected assertion failures. Collection/import/dependency errors, grep, or
a copied local algorithm do not count.

#### Phase 3 — shared harmonics, decomposition, and PFSS field

Execution status (2026-09-26): **analytic/explicit-grid subset complete; phase partial** on the
remediation branch in `1a6fcaa..99b3231`. The separate oracle-regeneration lane and observed-map
ingestion proof remain open and cross into Phases 4–5. The implemented requirements below remain the
preservation contract; later provider, oracle, or performance work must continue to pass them.

Required blocking gates:

1. At `x=0.5`, `P2=-0.125`, `P3=-0.4375`, `P4=-0.2890625`; absolute error `<=1e-14`.
2. Every `(l,m)` through `l=15` at `x={-0.9,-0.5,0,0.5,0.9}` versus immutable values generated by
   the exact locked oracle environment from `scipy.special.lpmv`, independently normalized with the
   Condon–Shortley phase removed: `error <= 5e-13 * max(1,abs(reference))`. Blocking tests read the
   hashed values without importing SciPy; a separate required oracle-regeneration lane recreates and
   byte/metric-compares them.
3. At least 64-point Gauss–Legendre orthogonality: normalized off-diagonal and diagonal-relative
   errors each `<=2e-12`.
4. Scalar/batch maximum normalized difference `<=1e-13`.
5. Derivative/reference normalized error `<=1e-8` away from poles; exact pole/derivative limits and
   Cartesian continuity from multiple longitudes pass at both poles and on approach.
6. Every supported isolated real sine/cosine `(l,m)` mode through `l=15` on the production
   sine-latitude grid: target coefficient relative error, maximum leakage, and reconstruction RMS
   each `<=1e-10`.
7. Mixed band-limited field through `l=15`: reconstruction RMS `<=1e-9`.
8. Source surface: the area-weighted tangential RMS and maximum each satisfy their declared relative
   and absolute budgets using the §5.1 reference scale/floor; initial relative target `<=1e-11`.
   Preserve the corrected boundary statement: `Btheta=Bphi=0` while `Br` is generally nonzero.
9. For every supported `l=1..15` and representative `m`, analytic `Br`, `Btheta`, and `Bphi` plus
   radial attenuation agree to relative error `<=1e-8` at the photosphere, source surface, and at
   least three interior radii. Exercise both sine/cosine branches and both boundary limits.
10. Normalized divergence and curl `<=1e-6` away from poles/boundaries.
11. The area-weighted signed-flux residual satisfies separately declared relative and absolute
    budgets using the §5.1 field scale/floor (initial relative target `<=1e-12`), `l=0` handling is
    explicit, and the decomposition condition number is below the ADR threshold (initial target
    `1e6`); fail closed when unstable.

Integrate/fit the equal-area sine-latitude grid on actual `mu=sin(latitude)=cos(theta)` centers. Do
not apply uniform-theta `sin(theta)` weights. An area-weighted QR operator keyed by grid geometry,
convention, and `lmax` is acceptable.

Apply the Schmidt normalization exactly once. There is no additional real-mode `epsilon_m=2`
multiplier after the normalization already incorporates `(2-delta_m0)`. Synthetic snapshots must
either originate on the same canonical `mu` cell centers or carry explicit native coordinates and
pass through the production resampler. Prove pure-mode recovery independently through observed-map
and synthetic-map ingestion paths so one cannot silently retain the old uniform-theta geometry.

Exit: all analytic/property gates pass and all old Legendre paths delegate to the shared core.

#### Phase 4 — bounded GONG provider and provenance

Requirements:

- traverse the real archive hierarchy, including daily directories where required;
- select the exact declared product with metadata-consistent CR/coverage, then select its timestamp
  according to the declared temporal policy; never relabel an arbitrary monthly file;
- validate filename against FITS metadata;
- preserve/interpret `BSCALE`, `BZERO`, `BLANK`, NaN, dimensions, `CTYPE`, `CUNIT`, `CRPIX`,
  `CRVAL`, and `CDELT`;
- enforce the selected product’s physical contract: expected `BUNIT`, conversion to Gauss, radial
  photospheric-flux-density semantics, approximately-radial line-of-sight assumption, polar-fill
  status, and zero-point correction. Reject an unknown or conflicting quantity rather than guessing;
- transform pixel centers through WCS before canonical roll/regrid;
- validate orientation, longitude direction, and left-edge longitude;
- apply the ADR’s deterministic temporal selection: nearest-at-or-before unless another mode is
  explicitly requested, no future observation by default, maximum age, coverage interval, and
  archive miss behavior across day/month/year/Carrington-rotation boundaries;
- define maximum missing-pixel/area coverage and a deterministic reject-or-fill method. Record
  pre-correction signed flux, unsigned flux, removed monopole, post-correction residual, and quality
  class. Bound the removable monopole; never let mean subtraction make a corrupt map appear valid;
- synthetic mode performs zero network calls;
- data-driven mode fails explicitly without valid observation;
- only hybrid may fall back, with explicit mode/reason/confidence/effective inputs.

Initial resource caps to validate against the fixture:

```text
listing <= 1 MiB
compressed FITS <= 8 MiB
expanded FITS <= 32 MiB
pixels <= 2,000,000
gzip expansion ratio <= 100x
redirect count and connect/read/total deadlines explicitly bounded
```

Gates cover exact discovery, past/future/too-old selection, archive rollovers, miss-without-fallback,
redirect/traversal, oversized content, decompression bomb, CRC/truncation, dimensions, units/quantity,
missing coverage, bounded monopole correction, WCS, conflicting metadata, north/south sentinel,
longitude roll, and provenance. The independent orientation oracle is a committed set of hand-derived
pixel-center-to-heliographic-coordinate sentinel pairs, including left-edge and pole-adjacent points,
from the pinned FITS/WCS/product definitions. Astropy/SunPy agreement within `1e-9` radians remains a
compatibility/integration check, not an independent oracle because both share Astropy WCS machinery.

Canonical roll/regrid gates compare before and after area-weighted signed flux, unsigned flux, RMS,
polarity convention, and values across the longitude seam. Initial release budgets are signed-flux
delta `<=1e-6` of input unsigned flux, unsigned-flux and RMS relative deltas each `<=0.5%`, and
polarity agreement `>=99.5%` outside the §5.1 neutral mask; the seam obeys the same interpolation-
error budget as interior cell boundaries. Freeze exact sampling and absolute weak-field floors in the
manifest before implementing the resampler; coordinate correctness alone does not prove magnetic
data preservation.

Correct Carrington semantics explicitly: `27.2753 d` is the synodic period, not sidereal; the
sidereal period is approximately `25.38 d`. Preserve the reference epoch’s actual time scale (the
`2398167.4` epoch is JD TT), and never silently mix TT, UTC, or TDB. Validate Carrington rotation
number and longitude against a pinned independent ephemeris at ordinary dates and immediately around
rotation plus month/year boundaries.

Exit: every artifact is source-reproducible; invalid observations fail closed and never cache.

#### Phase 5 — independent reference, WSA, and scientific cache

Execution status (2026-09-26): **partial**. Commits `487a0ef..3747521` close the local tracing,
exact-boundary expansion, unavailable-state, bounded-map, validation, and honest
`wsa_inspired_v1` semantics. The independent real-map corpus, tracer/grid convergence, published
calibration validation, and artifact-level cache identity in this phase remain release-blocking.

Use the exact `sunkit-magex`, SunPy, Astropy, SciPy, NumPy, and Python versions selected and
hash-locked in Phase 1; record package versions, source commit where available, and generator hash in
the manifest. Do not use a mutable `current`, `latest`, or `/stable/` reference as oracle identity.
Blocking CI consumes hashed fixtures without oracle packages; a separate required oracle lane
regenerates and compares them. Regeneration is deliberate review work.

Independent reference gates:

- coefficient normalized RMS `<=1e-8`, max normalized error `<=1e-6`;
- for identical `lmax=15` band-limited boundary:
  - source-surface `Br` RMS difference `<=2%`;
  - unsigned open-flux difference `<=2%`;
  - polarity agreement `>=99%` outside a `1%`-RMS neutral mask.

The band-limited case proves solver agreement but not production truncation adequacy. Across the
stratified immutable GONG corpus, compare each advertised production `lmax` (`9`, `12`, `15`, or the
actual supported set) with a pinned reference of at least `lmax=30`; use `45` when the conditioned
fixture/resource budget permits. Every corpus member must meet initial targets: source-surface `Br`
relative RMS `<=5%`, unsigned-open-flux difference `<=5%`, topology agreement `>=97%` outside the
predeclared exclusion mask, `fs` relative-error median `<=5%` and p95 `<=15%`, and derived-speed
median `<=10 km/s` and p95 `<=30 km/s`. Construct the exclusion mask only from reference neutral
cells plus a two-target-cell dilation of the reference separatrix; it may exclude at most `5%` of
surface area and its area is always reported. Changes to these initial budgets require the ADR and
independent evidence before observing implementation results. Do not advertise a fidelity whose
entire corpus gate does not pass; if only one map is licensed, restrict the claim to that fixture and
keep general fidelity explicitly unvalidated.

For the empirical wind mapping, pin the exact equation, coefficient set, angle units, input-map
resolution, and output radius from the selected publication/calibration. Arge–Pizzo 2000 alone is
not sufficient provenance for a later two-parameter `fs`/coronal-hole-boundary calibration; if using
that form, pin the selected later source such as McGregor et al. 2008 and reproduce its stated
configuration. Unless the Schatten current-sheet and heliospheric propagation stages are actually
modeled, call the output `wsa_inspired_v1`, not full WSA. Interpolate each field line to the exact
source-surface crossing. If radial convention is selected, use:

```text
fs = (Rsun/Rss)^2 * abs(Br(Rsun)) / abs(Br(Rss))
```

Treat invalid denominators as quality failures. Prove formula pairs to `1e-12`, monotonic behavior,
endpoint error `<=1e-6 Rsun`, rotation invariance, and 2x-grid convergence: median speed
`<=10 km/s`, p95 `<=30 km/s`, open-area difference `<=2` points. An analytic radial-tube `fs=1`
case is a standalone formula unit test only; it is not a globally valid flux-balanced PFSS field.
Use a flux-balanced analytic mode for the end-to-end PFSS test. Closed points stay unavailable/NaN.

Add field-line integration convergence at step sizes `h`, `h/2`, and `h/4` for source-surface
endpoint angle, photospheric footpoint, open/closed classification, `fs`, and boundary distance.
Outside the predeclared mask, `h/2` versus `h/4` endpoint and footpoint angular p95 are `<=0.1 deg`
and maximum `<=0.5 deg`; topology agrees `>=99%`; `fs` relative-error median is `<=1%` and p95
`<=5%`; boundary-distance p95 is `<=0.25 deg`. Compare topology with the independent solver and use
the same bounded mask construction above. A grid-only WSA convergence test cannot substitute for
this tracer convergence gate.

Trace termination has three scientific states: `open`, `closed`, and `indeterminate`. Interpolate
and evaluate crossings at exactly `Rsun` and `Rss`; evaluate the numerator of `fs` at exactly
`Rsun`. Assert inner/outer residual `<=1e-6 Rsun`. Nulls, non-finite values, stalled integration,
step limits, and solver failures are `indeterminate`, not closed; exclude them from coronal-hole
boundaries and velocity, expose their fraction/quality, and fail a fidelity when that fraction
exceeds its predeclared budget.

Gate the actual source-surface field consumed downstream, not only the photospheric seed grid. Map
`fs`, boundary distance, and velocity to a fixed target grid with at least `99%` coverage of reference
open cells outside the mask and a maximum accepted interpolation distance of two target-cell
diagonals. Compare mapped-cell values to the independent reference using the corpus budgets above;
uncovered/indeterminate cells remain explicitly unavailable and never become a hard-coded default
speed. A downstream Parker-assembly test proves that the calibration’s reference radius, units, and
propagation assumptions are preserved.

Exercise the complete published calibration domain and immediately adjacent out-of-domain values.
Any `fs` floor, speed clamp, or extrapolation must be required by the pinned calibration or versioned
as a repository-specific modification. Define explicit quality/error behavior for all-open,
all-closed, no-boundary, neutral-field, zero-denominator, and out-of-domain inputs.

Cache gates:

- identical `PFSSSolutionKey` reuses across request JDs/timeouts that resolve to the same snapshot;
- a whole `SolarArtifactKey` does not reuse across differing effective epochs/realtime inputs unless
  the named canonicalization/error-budget policy makes those effective values equal;
- changed same-CR content hash recomputes;
- observed/synthetic never reuse;
- same documented synthetic bucket reuses and exposes equal effective values; adjacent bucket does
  not;
- solver/convention/Rss/`lmax`/tracing/WSA version changes invalidate;
- 32 identical concurrent misses compute once;
- leader error reaches all followers, commits nothing, clears in-flight, and permits retry;
- entry and byte LRU bounds hold;
- two fresh processes yield byte-identical canonical public scientific projections, excluding only
  the exact non-scientific fields listed in §5.

Exit: independent budgets pass, WSA is accurately named/versioned, and identity represents artifacts
rather than request timing.

#### Phase 6 — coordinator, supervised subprocesses, and V2 API

Implement feature modes `disabled|shadow|embedded|external`.

`shadow` is sampled or scheduler-driven validation against the same global `K/Q` budget. It never
runs once per caller miss, delays or alters the served response, writes the production artifact
namespace, or makes a scientifically invalid result eligible to serve. Record shadow comparisons in
bounded metrics/artifacts only. `embedded` and `external` are mutually exclusive compute authorities.

Deterministic spawn-context gates:

- GET miss performs zero acquisition/compute admission; authorized idempotent POST or scheduler is
  the only cold-job creator, and GET returns 202 only for an existing canonical job;
- 100 same-key idempotent authorized POST submissions produce one compute and snapshot ID;
- `K=2` never exceeds two active CPU children;
- `K=2,Q=4`, forty unique cold resolves run at most two, queue four, and shed the remainder with the
  declared fast outcome;
- ready hit succeeds while all cold capacity is occupied;
- submit failure releases once;
- caller timeout cannot admit extra work;
- hard timeout/SIGKILL leaves no orphan, replacement serves next job, LKG survives;
- acquisition/DNS/read/parser/decompression timeout or crash retains capacity until kill/reap and
  then recovers; saturation of `K_io/Q_io` does not block ready reads or leak processes/files;
- corrupt/non-finite/oversized/wrong-generation/wrong-schema output never commits;
- restart loads only checksummed compatible LKG;
- multiple API workers through one coordinator still create one global job/budget.
- sustained permitted ad-hoc submissions cannot starve the required-profile scheduler, and an
  accepted cold job reaches validated `READY` with the expected artifact/freshness transition.

Expose low-cardinality resolve/job/source counters; latency/staleness histograms; queue, worker,
in-flight, cache, LKG-age, child-RSS, and circuit gauges. Never label with raw JD/principal/full IDs.

Exit: GET never awaits CPU work, ready/LKG reads bypass admission, timeout/crash restores capacity,
and V2 status codes/schemas pass through the public app factory.

#### Phase 7 — security and deployment topology

Required gates:

- 5,000 spoofed XFF values from an untrusted peer remain one identity;
- forwarding works only through configured CIDRs and bounded valid chains;
- credential subject cannot be overridden;
- request 37 of 36 is deterministic 429 with `Retry-After`;
- physics and AIA stores remain within count/byte/TTL bounds;
- auth/JD/unknown/feature/body rejection makes zero store/worker calls;
- GET bodies are rejected;
- network profile rejects missing auth, wildcard CORS, reload, missing proxy policy/coordinator, and
  embedded per-worker pools;
- network profile route allowlist denies every undeclared compute/write/WebSocket route before its
  handler; a full-app profile applies centralized auth/body/global admission to those routes;
- request-line/query/header/count/connection/keepalive/slow-header/slow-body/chunked/ambiguous-
  framing limits shed adversarial connections without application allocation;
- refresh roles/idempotency are enforced before allocation;
- provider redirect/size/decompression controls apply before parsing;
- metrics/detailed status require the declared monitoring role and never expose principal IDs.

Exit: a non-local anonymous caller cannot create work, spoof identity, allocate unbounded state, or
multiply compute by adding API workers.

#### Phase 8 — UI and AIA delivery

Add fake-clock/fetch Vitest coverage for 200, 304, 202 polling, Retry-After, 429, 503, stale LKG,
unavailable, seek debounce, deduplication, disposal, and obsolete response suppression.

Add network-free Playwright projects using a real backend route with offline PFSS/AIA fixtures for
both dev and preview origins. Use separate deterministic fresh, existing-pending, stale/degraded,
unavailable, and compute-authorized POST scenarios; one scenario need not display contradictory
states simultaneously.

Five-minute gate for each origin:

- `>=95%` scheduled reads after warmup are 200/304;
- at least 20 resolve cycles and three effective-epoch/profile transitions execute using a shortened
  fixture freshness policy; report exact attempted/status counts rather than only percentages;
- pending/retry is exercised;
- at least one AIA tile renders independently;
- source/effective epoch/freshness/age/fallback/unavailable are visible;
- age stays inside serve-stale policy;
- zero silent fallback and uncaught console errors.

Exit: the shipped browser reliably consumes the actual V2 contract.

#### Phase 9 — CI, mutation, load, rollout, and cleanup

Mutation manifest includes at least old Legendre recurrence, extra `epsilon_m` normalization,
uniform-theta grid, accepted monopole/unbounded flux correction, corrupted source-surface factors,
wrong WSA endpoint/component, trace-failure-as-closed, default speed for uncovered cells, omitted
source hash, GET cold enqueue, release-on-timeout, hit-after-admission, compute-coupled read readiness,
unconditional XFF, unbounded rate map, pre-fix rollback eligibility, and silent fallback. Record patch
SHA-256, production files,
exact node IDs, expected assertion, fixed commit, and oracle class. Run in isolated temporary
worktrees; syntax/import/collection failure does not kill a mutant. Run both
`scripts/verify_r3_red_green.py` and the mutant matrix as blocking lanes—the first proves the original
defects were observable before the fixes, while mutation proves the final gates remain sensitive.
Each red/green case pins container/toolchain/lock/fixture hashes, proves a behavior-preserving green
control at the pre-fix SHA, records the test-only seam commit, expected assertion ID/regex and exact
node counts, then proves fixed green. The mutation runner first proves an unmodified baseline green;
patch-not-applied, timeout, skip/xfail, missing node, unrelated assertion, import, or collection
failure is invalid evidence—not a killed mutant.

Required CI lanes:

1. separate immutable-container lanes for runtime lock/install plus app startup smoke, CI lock/install
   plus tests, and oracle lock/install plus generator. Production imports are unavailable to the
   oracle generator and CI fails if it crosses that boundary;
2. frontend scoped strict typecheck, Vitest, verifiers, build;
3. backend unit/science/reference plus a separate hash-locked oracle-regeneration comparison;
4. R3 spawn/process/route/security integration;
5. red-before-green evidence and mutant matrix;
6. offline Playwright dev and preview projects with pinned `@playwright/test`, browser revision/image
   digest, base URLs, startup profiles, and environment;
7. hermetic staging state-machine verification for feature modes, alerts, circuit breaking, schema
   migration, abort, safe rollback, and acquisition/compute recovery;
8. dedicated resource-pinned performance release;
9. optional scheduled live-provider smoke.

All required-node manifests are machine-checked. Emit JUnit (or a documented equivalent) for Pytest,
Vitest, and Playwright, and fail when any required R3/R4 node is skipped, xfailed, not collected, or
has a count mismatch. Missing dependencies are failures. Every blocking lane attests its immutable
container digest; none relies on the ambient developer shell.

The prompt baseline recorded 246 global strict TypeScript errors. A fresh strict run at `3747521`
reports 240; the gate is still red. Do not hide it or call a failing job green. For R3/R4:

- add a zero-error strict project covering every touched solar/R3 frontend file;
- add a reproducible no-new-global-errors ratchet while separate S14 remains open;
- report the global gate as unresolved until truly zero;
- if scope expands to repository release closure, burn down all errors and remove the ratchet in
  separate commits.

Pinned performance gate:

- commit `ci/r3-performance-runner.json` with the immutable OS/container image digest, CPU model,
  Python/Node/browser revisions, server command/profile/environment, base URL, exact request corpus,
  seed, and limits; initial release runner uses 2 vCPU and 4 GiB with a documented API CPU reserve;
- force `TZ=UTC`, UTF-8 locale, `PYTHONHASHSEED=0`, and BLAS/OpenMP thread counts of one before
  process import/startup; deny network in blocking science, integration, browser, and load lanes;
- collect a 60-second warmup, five-minute idle baseline, and three five-minute loaded trials using the
  same seeded schedule. Before each trial restart the coordinator and use a fresh content-addressed
  test namespace, empty memory/LKG/rate state, or a manifest-proven disjoint cold corpus. Record the
  chosen method; do not let trial 1 warm trials 2–3 or discard a trial after observing it;
- set rate budget `>=100/min`, prove at least one cold high-fidelity job reaches `RUNNING`, and hold
  `K` cold jobs active while the exact `K/Q` outcomes are asserted;
- at least 100 `/health` samples per trial: p95 `<50 ms`, p99 `<100 ms`; at least 40 ready reads per
  trial: all 200/304, p95 `<100 ms`, p99 `<200 ms`; cold 202/429/503 admission decisions: p95
  `<100 ms`, p99 `<200 ms`;
- fixed light trajectory and mission controls: p95 `<250 ms` and no greater than
  `max(1.25 * idle_p95, idle_p95 + 25 ms)`;
- at least 30 non-injected cold jobs across the trials complete and validate; success `>=99%`, queue-
  wait p95 `<2 s`, compute p95 `<30 s`, end-to-READY p95 `<35 s`, and hard deadline `<45 s`. Each
  result becomes the expected artifact and advances the declared freshness; injected crash jobs are
  reported separately;
- use nearest-rank percentiles and require every trial to pass. Sample RSS/event-loop lag once per
  second; fit RSS slope by ordinary least squares after warmup against the per-trial starting RSS;
  treat timeout/missing samples as failure, not exclusion;
- event-loop lag p99 `<50 ms`, maximum `<250 ms`; API RSS final increase `<128 MiB` and fitted slope
  `<10 MiB/min`; children, FDs, temp bytes, queued/in-flight work stay inside configured caps;
- after a deliberately killed child, capacity returns and the next accepted job begins within five
  seconds; abort/fail on any ready-read 503, queue-full condition sustained over 60 seconds, more than
three child restarts in five minutes, invariant failure, or cap breach.

The load harness verifies—not merely reads—the actual image digest, CPU/cgroup/memory quota,
toolchain, environment, server command, corpus hashes, and seed against the runner manifest before
sampling.

Shared-host timings are informational. Upload JUnit, reference JSON, mutant matrix, load JSON/log/
metrics, and Playwright failure traces as CI artifacts; do not commit run logs.

Roll out sampled shadow -> embedded release candidate -> external API/client cohorts at 10/50/100%.
All external cohorts talk to one coordinator version and one fenced store writer; they are client/API
canaries, not competing compute authorities. Continuous-SLO rollout uses a warmed standby, leader
lease/fencing token, and atomic handoff while the read-only LKG plane remains available. A Recreate/
exclusive-lock upgrade is allowed only in a declared maintenance window excluded from availability
SLOs; never present it as zero-impact or run old/new unfenced writers against one namespace. Abort on
science invariant, checksum, health/hot-read SLO, sustained
queue saturation, restart loop, or stale-age breach. Rollback serves a schema-compatible validated
LKG from the pinned minimum-safe-build allowlist/versioned namespace or an explicit unavailable UI;
pre-fix solver artifacts are quarantined and never eligible. It never reopens legacy anonymous cold
compute or silently serves known-bad PFSS. Delete the legacy thread path only after deployed canary
acceptance.

### 7. Release-candidate definition of done

The implementation run may report **R3/R4 release-candidate code complete** only when every item in
this section is true. It may not report R3 production-closed until the separately authorized deployed
rollout closure in §7.1 is also true. Lack of deployment credentials/authority does not excuse or
waive a code gate; it leaves the rollout state explicitly pending.

#### Branch and preservation

- [ ] The reconciled branch contains required mainline fixes and only validated `sun-focus` deltas;
      conflict decisions are recorded.
- [ ] R1/R2, N-body, Lambert, MGA, asteroid, moon, worker, unrelated UI, frontend/backend tests, and
      previously closed invariants retain prior behavior/budgets; solar delivery intentionally moves
      to the reviewed V2 contract.
- [ ] User-owned untracked evidence and unrelated changes remain untouched.

#### Scientific PFSS/WSA correctness

- [ ] Harmonic convention, coordinates, boundary, flux balance, and versions are explicit in ADRs,
      code, schema, and fixture manifest.
- [ ] One shared harmonic implementation passes all value, orthogonality, derivative, pole,
      scalar/batch, decomposition, reconstruction, boundary, attenuation, divergence, and curl gates.
- [ ] No path treats GONG sine-latitude pixels as uniform theta.
- [ ] A real immutable GONG snapshot is selected exactly and transformed via validated WCS; no
      arbitrary substitution/relabel exists.
- [ ] PFSS meets independent coefficient/source-surface budgets without post-hoc tolerance widening.
- [ ] Every supported harmonic mode/radial factor, the stratified real-map truncation corpus, and the
      bounded separatrix/topology budgets pass.
- [ ] Traces converge at three step sizes, terminate as open/closed/indeterminate at exact radial
      boundaries, and the delivered source-surface `fs`/boundary-distance/velocity grid meets
      coverage, interpolation-distance, and downstream Parker-consumption gates.
- [ ] WSA matches the selected prescription/convergence gates or is consistently labelled
      `wsa_inspired_v1`/approximate.

#### Provenance, identity, and cache

- [ ] Source hashes/revision, effective time/coordinates, preprocessing, algorithms, parameters, and
      quality reproduce each artifact.
- [ ] Requested policy is separate from per-component actual source, fallback, provider UTC/
      longitudinal coverage, observation age, simulation TDB epoch, and artifact-cache freshness.
- [ ] Observed and synthetic inputs have distinct identities/public semantics; hybrid is a requested
      policy, never falsely reported as the physical source.
- [ ] Reuse occurs only inside a documented equivalence/error budget; effective inputs are returned.
- [ ] Content/solver/convention/source-surface/tracing/WSA/schema changes invalidate correctly.
- [ ] Single-flight, failure/retry, LRU count/bytes, LKG checksum, and restart gates pass.

#### Operational isolation and delivery

- [ ] Handlers never execute or await CPU-heavy solar construction.
- [ ] Ready/LKG reads work while cold capacity/queue are saturated.
- [ ] CPU work uses bounded supervised spawn children with hard kill/reap/restart and no leaked
      capacity after timeout/crash.
- [ ] Embedded and external topologies are enforced/tested with one global K/Q authority.
- [ ] Acquisition and compute each have bounded hard-recoverable ownership; neither can leak a slot,
      process, file, or RSS after timeout/crash, and fair admission prevents scheduler starvation.
- [ ] Health, ready-read, admission, trajectory, and mission SLOs pass on pinned runner.
- [ ] Side-effect-free GET, protected POST/scheduler admission, successful cold-to-READY completion,
      and read-plane readiness under compute failure are proven through public routes.
- [ ] V2 status/schema/ETag/Retry-After/stale/error contract is documented and tested.
- [ ] Frontend V2 types are generated/verified from the authoritative schema and the producer/
      consumer contract gate passes.

#### Security

- [ ] Network profile fails closed and anonymous viewers cannot create work.
- [ ] The deployment route allowlist denies unrelated unsecured compute/write/WebSocket surfaces, or
      the full-app profile protects them with centralized auth/body/global admission.
- [ ] Auth and size enforcement occur before parsing/allocation; refresh authorization precedes
      admission.
- [ ] Proxy parsing, credential identity, both bounded rate stores, request/upstream limits, and CORS
      profiles pass adversarial tests.
- [ ] Transport framing, header/query/connection/slow-body limits and protected metrics/status pass
      gateway-level adversarial tests before application allocation.
- [ ] No token, path, full principal/rate identity, or sensitive high-cardinality value leaks to
      payload/log/metrics. Public artifact/snapshot/source IDs required for reproducibility remain.

#### First-party product

- [ ] Dev and preview meet the five-minute success/staleness/AIA/console gates.
- [ ] UI distinguishes state, cache freshness, requested policy, and each component’s actual source/
      coverage/age/fallback without silent fallback.
- [ ] Refresh is snapshot-aware, deduplicated, retry-aware, and preserves LKG.

#### R4 verification system

- [ ] Blocking science tests use analytic/independent immutable oracles; behavior tests drive
      production interfaces; live upstream is not a blocking oracle.
- [ ] The isolated red-before-green runner proves the named pre-fix mechanisms fail for the intended
      assertions and pass at the fixed commits.
- [ ] Every listed mutant is killed by its mapped assertion, not an import/collection failure.
- [ ] No required R3/R4 skip/xfail; missing dependencies fail.
- [ ] Required-node/JUnit validators reject skip/xfail/not-collected/count drift across Pytest,
      Vitest, and Playwright.
- [ ] Isolated runtime, CI, and oracle dependencies plus every blocking runner/container/BLAS setting
      are pinned and attested; oracle generation cannot import production code.
- [ ] Scoped typecheck, tests, verifier, integration, mutation, E2E, build, and dedicated load pass;
      separate global TypeScript status is honest.
- [ ] CI retains reproducible artifacts, while repo keeps fixtures/manifests rather than run logs.

#### Operations and cleanup

- [ ] Metrics, alerts, circuit breaker, runbook, feature modes, version migration, canary/abort, and
      rollback are documented and pass the named hermetic staging state-machine gate.
- [ ] Legacy request-coupled PFSS compute is disabled outside an explicit local rollback switch; its
      final deletion is gated by deployed canary acceptance.
- [ ] The canonical status plan records commits, commands, counts, SLOs, residual risks, and status.
- [ ] Remaining out-of-scope limitations are explicitly labelled and linked.

#### 7.1 Deployed rollout closure

These items require the authorized target environment. Until they pass, report “release candidate
complete; R3 production rollout pending,” not “R3 closed”:

- [ ] The persistent LKG namespace, coordinator fencing, identity provider, trusted proxy/origin
      policy, resource quotas, TLS, and alerts are validated in the actual deployment profile.
- [ ] Sampled shadow comparison passes without altering served responses or exceeding global `K/Q`.
- [ ] The 10% and 50% stages each run at least 24 hours; 100% runs at least 72 hours. Each stage sees
      at least 10,000 eligible ready reads, 30 cold jobs, one real scheduled source refresh, one
      worker recycle, and one controlled failure/recovery (authorized synthetic canary traffic may
      supply volume, but not replace the real refresh).
- [ ] Every 10/50/100% cohort has zero scientific invariant/checksum failures, ready-read availability
      `>=99.9%`, cold-job success `>=99%`, zero stale-age policy breaches/silent fallbacks, and stays
      inside the pinned resource/browser SLOs while using one coordinator authority/version.
- [ ] A fenced atomic coordinator upgrade (or explicitly SLO-excluded maintenance Recreate) and
      schema-compatible rollback are exercised; prior safe clients read only allowlisted post-fix
      prior-format LKG or receive an explicit unavailable state.
- [ ] Abort criteria and operator runbook are exercised, evidence is retained, and no fallback can
      reopen anonymous cold compute or serve invalid PFSS as valid.
- [ ] After the acceptance window, the legacy request-coupled compute path and temporary migration
      switch are deleted in a dedicated rollback-aware commit.

### 8. Verification commands and artifacts

Add stable wrappers so CI/developers never share dependency environments or depend on host-specific
paths. `ci/r3-lanes.lock.json` records an immutable image digest, exact toolchain, lock hash, fixture
hashes, network policy, and command for every lane. `scripts/ci/run_pinned_lane.sh` verifies the
actual image/cgroup/environment, emits an attestation, and refuses a tag-only or mismatched runner.

Minimum final command set:

```bash
# Only this bootstrap may use the network. Omit it for legally vendored fixtures.
scripts/ci/bootstrap_pfss_fixtures.sh \
  --manifest backend/tests/fixtures/pfss/v1/manifest.json \
  --cache artifacts/fixture-cache

scripts/ci/run_pinned_lane.sh runtime-smoke
scripts/ci/run_pinned_lane.sh ci-unit
scripts/ci/run_pinned_lane.sh oracle-regenerate
scripts/ci/run_pinned_lane.sh r3-integration
scripts/ci/run_pinned_lane.sh r3-red-green
scripts/ci/run_pinned_lane.sh r3-mutants
scripts/ci/run_pinned_lane.sh r3-staging
scripts/ci/run_pinned_lane.sh browser-dev
scripts/ci/run_pinned_lane.sh browser-preview
scripts/ci/run_pinned_lane.sh r3-performance

scripts/validate_r3_results.py \
  --required-nodes ci/r3-required-nodes.json \
  --artifacts artifacts \
  --output artifacts/r3-verification-summary.json
```

Each lane runs in a fresh immutable container/environment:

- `runtime-smoke` installs only `requirements-runtime.lock` with `pip --require-hashes`, runs
  `pip check`, imports/starts the production app under the network profile, and proves no CI/oracle
  package masks a runtime dependency;
- `ci-unit` installs only `requirements-ci.lock`, validates the lock-compiler version/drift and exact
  Python `3.12.13`/Node `22.23.2`, runs `npm ci --offline`, scoped typecheck, Vitest, existing numeric
  verifiers, build, and Pytest excluding integration/performance/live with `--disable-socket`;
- `oracle-regenerate` installs only `requirements-oracle.lock`, denies production-module imports,
  regenerates the corpus into a temporary directory, and compares scientific-content hashes and
  metrics with the committed manifest;
- `r3-integration`, `r3-red-green`, `r3-mutants`, and `r3-staging` execute their named manifests/
  state machines with outbound network disabled and retain JUnit plus structured evidence;
- both browser lanes use the locally locked package and preinstalled browser via
  `npm exec --offline -- playwright`, start their own declared backend/origin, block non-loopback
  traffic, and cannot download a browser or attach to an arbitrary existing server;
- `r3-performance` runs `verify_r3_load.py` with `ci/r3-performance-runner.json`, a 60-second warmup,
  300-second baseline, three 300-second reset trials, the exact cold/warm corpus, and at least 100
  health samples plus 40 ready reads per trial.

All lane environments set `TZ=UTC`, UTF-8 locale, `PYTHONHASHSEED=0`, and BLAS/OpenMP thread counts
to one before process import. Blocking lanes prove outbound network denial. The result validator
fails on missing artifacts, required-node count drift, skip/xfail/not-collected nodes, absent JUnit,
container/lock/fixture attestation mismatch, or a nonpassing scientific/SLO gate.

Required final handoff:

```text
Branch and exact HEAD:
Commits by phase:
Files/contracts added:
Red-before-green evidence by defect:
Scientific oracle results:
Unit/integration/mutation/E2E results:
Load host/config and SLO table:
Security/adversarial results:
Rollout/rollback evidence:
Definition-of-done checklist:
Residual risks and out-of-scope blockers:
Working-tree status and intentionally untracked files:
```

If any release-candidate item is unmet, report the implementation as partial and identify the exact
failed gate. If all release-candidate items pass but §7.1 is unmet, report “release candidate
complete; production rollout pending” and keep production R3 open. Shedding every request, passing
only unit tests, or serving an unlabelled procedural fallback is not completion.

### 9. Scientific references to pin in ADRs

Use maintained/primary sources and record exact version, document revision, immutable archive/content
hash, and retrieval date. Replace all `/stable/`, `latest`, or moving-branch references in the ADR
with the exact release/commit selected by the oracle lock:

- `sunkit-magex` PFSS API and GONG example for the exact locked release, plus that release artifact’s
  SHA-256. The maintained docs entry point may be used to locate it, but is not the pinned oracle;
- PFSS package/model background: `https://doi.org/10.21105/joss.02732`;
- FITS standard: `https://fits.gsfc.nasa.gov/fits_standard.html`;
- GONG archive/product documentation: `https://gong.nso.edu/data/magmap/` and
  `https://magmap.nso.edu/`;
- Carrington/synodic terminology and independent ephemeris algorithm source selected in the ADR;
- Arge–Pizzo model context: `https://doi.org/10.1029/1999JA000262`;
- the exact later boundary-distance calibration if used, e.g. McGregor et al. 2008:
  `https://doi.org/10.1029/2007JA012330`.

Do not cite a maintained library as proof that this repository agrees with it; the immutable fixture
and comparison gates provide that evidence.
