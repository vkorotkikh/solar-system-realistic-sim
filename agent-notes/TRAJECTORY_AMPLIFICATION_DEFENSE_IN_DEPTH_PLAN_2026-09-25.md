# Trajectory Amplification Defense-in-Depth Plan

**Date:** 2026-09-25

**Branch:** `fix/trajectory-amplification-defense-in-depth`

**Base commit:** `bd48a7def2d83bce886147d1de5f40a0b343cf74`

**Status:** implementation plan; no production behavior changed yet

## 1. Objective

Make every trajectory-planning operation bounded, cancellable, deterministic, scientifically explicit, and incapable of multiplying one request into an uncontrolled number of remote ephemeris calls.

The repair covers the complete path:

    HTTP request
      -> validation and admission
      -> route and TOF search
      -> Lambert evaluations
      -> ephemeris state requests
      -> optional remote transport
      -> response and browser fallback

It is complete only when the same limits cannot be bypassed through mission planning, porkchop scans, direct Python calls, or the browser's local fallback.

## 2. Revised decisions

The earlier outline had the right direction, but the current-code audit changes several choices.

| Area | Earlier outline | Revised decision |
|---|---|---|
| `auto` provider | Change one fallback chain | Define `auto` as local-only, then resolve and pin one provider for the entire operation |
| Explicit Horizons MGA | Permit under a request budget | Reject initially; enable only after local-shortlist/remote-finalist verification exists |
| Beam width | 24 | Start at 12 because flyby root refinement shares the 2,000-leg budget |
| Flyby feasibility | Test discrete TOF samples | Solve the outgoing TOF continuity residual with bounded bracketed refinement |
| Search status | One `complete` boolean | Report strategy, truncation, termination, configured-frontier completion, exhaustiveness, and optimality separately |
| Endpoint repair | Server semaphore and timeout | Also fix client deadlines, explicit disconnect monitoring, and silent local fallback |
| Ephemeris safety | Cache and circuit breaker | Enforce origin/frame/time/unit/target compatibility; current providers are not interchangeable |
| Scope | `/trajectory/plan` | Enforce the context in core code and propagate it through plan, Lambert, porkchop, mission, and benchmark callers |

Central invariants:

1. Network I/O is forbidden inside a combinatorial search loop.
2. `auto` never authorizes network access.
3. One planning operation uses one resolved provider and state-vector contract.
4. Every expensive operation reserves budget before it starts.
5. Cancellation, deadlines, and limits are enforced below the HTTP layer.
6. A provider failure is never reported as physical trajectory infeasibility.
7. A bounded heuristic result is never described as globally optimal or exhaustive.
8. No rollback path may restore the original unbounded implementation.

## 3. Current approach and verified failure path

### 3.1 Route amplification

`backend/trajectory/mga.py::_generate_assist_routes()` eagerly materializes every ordered, non-repeating assist permutation:

    R(p, a) = sum(P(p, k), k = 0..a)

For 39 entries and three assists:

    1 + 39 + 39*38 + 39*38*37 = 56,356 route skeletons

The list is allocated before physical screening. Each skeleton owns an independent beam, so `PRUNE_PER_DEPTH = 18` is not a global work bound.

`MAX_COMPLETED = 48` limits successful completions only. Infeasible and late-failing routes do not increment it.

### 3.2 TOF and fallback amplification

Each leg creates up to 15 TOF candidates. Every partial/candidate pair performs another Lambert solve and state sampling.

The optimizer already evaluates direct routes, but `plan_interplanetary_route()` performs an additional eight-TOF direct fallback when MGA finds nothing. This duplicates unbudgeted work and labels a direct result with a flyby constraint mode.

### 3.3 Provider amplification

The current `auto` chain runs independently for every state:

    SPICE -> Horizons -> Kepler

The positive cache is provider-specific. A cached Kepler result is inspected only after failed SPICE and Horizons attempts are repeated. Repeating the same state can therefore repeat both failed providers.

SPICE initialization has no attempted-state latch or lock. Unavailable tooling or failed kernel loading is retried per sample.

Horizons performs one sequential HTTP request per `(body, JD)` with a ten-second socket timeout, no request-wide circuit, no batching, and no negative cache.

### 3.4 Endpoint and browser amplification

`/trajectory/plan` and `/trajectory/lambert` are synchronous handlers in the shared FastAPI/AnyIO worker pool. They have no endpoint admission guard, internal deadline, outer watchdog, cooperative cancellation, or explicit disconnect monitor.

The browser aborts both after 2.5 seconds. It then catches every plan error—including 413/422/503/504 and explicit-provider failure—and silently starts the eager local planner. That can hide the refusal reason and duplicate work while the backend continues.

### 3.5 Provider compatibility is unsafe

The providers do not expose or enforce a shared scientific contract:

- SPICE requests `J2000` while the trajectory model is ecliptic-oriented.
- Horizons explicitly requests the ecliptic plane.
- Catalog Kepler elements are propagated in an ecliptic-J2000-like frame.
- Per-state fallback can mix incompatible axes inside one Lambert leg.
- Runtime Horizons uses planet-center identifiers while approximate element products are often system-barycenter based.
- Unsupported Horizons targets fall back to a display name with parenthetical numbers removed. `Europa (52)` can become ambiguous with Jupiter's moon.
- Runtime parsing validates neither target, center, frame, units, time scale, epoch, nor complete rows.
- Orbitless Kepler targets return an all-zero state instead of failing preflight.

Provider pinning is necessary but insufficient without pinning origin, axes, time scale, units, corrections, and physical target definition.

### 3.6 Measured workload and result quality

The committed fan-out harness reports successful Kepler computations for Earth-to-Jupiter:

| `max_assists` | unique successful Kepler computations |
|---:|---:|
| 0 | 16 |
| 1 | 380 |
| 2 | 1,312 |
| 3 | 1,341 |

Separate instrumentation observed approximately 17,000 failed-provider attempts for the same class of request. Phase 0 must establish canonical definitions for logical state queries, provider attempts, unique computations, and real HTTP requests.

Core MGA instrumentation at JD 2460500.5, Kepler, and `max_assists=3` found:

| Case | Lambert calls | flyby checks | returned class |
|---|---:|---:|---|
| Earth to Mars | 8,170 | 6,815 | direct only |
| Earth to Jupiter | 8,280 | 7,113 | direct only |
| Earth to Psyche | 17,920 | 15,105 | direct only |

Every examined flyby failed `vinf_magnitude_mismatch`. The minimum mismatches remained several times larger than the approximately 0.001 km/s tolerance. Independent five-day TOF samples are not an effective way to satisfy continuous unpowered-flyby velocity continuity.

Containment must therefore be paired with a viable bounded flyby search. Returning the same direct-only answer more cheaply is not sufficient scientific closure.

## 4. Threat and failure model

The design must tolerate:

- accidental or hostile assist-pool cardinality;
- maximum-depth requests;
- all routes failing at their last flyby;
- no Lambert solutions;
- unique epochs that defeat exact-key caching;
- repeated identical epochs;
- unavailable SPICE;
- unsupported provider/body combinations;
- timeout, DNS failure, HTTP error, rate limiting, malformed JSON/vectors, and incomplete batches;
- client timeout or disconnect;
- concurrent plan requests;
- mission orchestration invoking several nested searches;
- Python callers bypassing HTTP validation;
- unsafe environment overrides;
- mixed-provider/frame/target results;
- beam pruning a route that later becomes best.

The system promises a physically checked, deterministic, bounded search over a published domain. It does not promise exhaustive global optimization over continuous encounter dates.

## 5. Target architecture

    HTTP/API validation
      -> ValidatedTrajectoryPlan
      -> admission guard and optional client rate policy
      -> PlanningContext
           absolute monotonic deadline
           cancellation event
           atomic limits and counters
      -> EphemerisSession
           provider resolved once
           required-body coverage preflight
           one scientific state contract
           request memo and circuit state
      -> bounded trajectory engine
           global frontier
           continuous flyby residual refinement
           direct candidates integrated once
      -> optional remote finalist verifier
           deduplicated/batched prefetch
           no network inside optimizer
      -> typed response/error mapping
      -> frontend displays source, truncation, and failure honestly

Shared process infrastructure is separately bounded:

    SPICE initialization latch
    Horizons concurrency guard
    short global outage circuit
    bounded immutable success LRU
    same-key single-flight registry

## 6. Layer A: pure preflight and request bounds

Add `backend/trajectory/contracts.py`:

    @dataclass(frozen=True)
    class ValidatedTrajectoryPlan:
        from_id: str
        to_id: str
        departure_jd: float
        objective: str
        max_assists: int
        requested_assist_pool: tuple[str, ...] | None
        effective_assist_pool: tuple[str, ...]
        estimated_route_count: int

    def estimate_route_count(pool_size: int, max_assists: int) -> int: ...
    def validate_plan_request(...) -> ValidatedTrajectoryPlan: ...

Run it at the HTTP boundary before admission and again inside `plan_interplanetary_route()`.

Rules:

- `assist_pool is None` selects the documented default.
- `assist_pool == []` means no assists. Replace `assist_pool or DEFAULT_ASSIST_POOL`.
- Maximum submitted entries: eight.
- Reject duplicates instead of silently rewriting them.
- Bound body-ID string length.
- Reject unknown/non-planner IDs.
- An assist needs an orbit, finite positive mass, and finite positive radius.
- Sun and orbitless entries are not assists.
- Remove departure/destination deterministically and report the effective pool.
- Sort effective IDs so caller ordering cannot bias budget use.
- Maximum assists remains three.
- Compute exact topology count before constructing ephemeris state.
- Maximum topology estimate: 401.
- Apply an initial 32 KiB raw-body limit before JSON decoding where the deployment stack permits.

An eight-body pool at depth three has at most 401 topologies.

Pydantic bounds remain useful, but they execute after JSON decoding and do not replace a raw-body limit.

## 7. Layer B: PlanningContext and typed termination

Add `backend/trajectory/budget.py`.

### 7.1 Types

    @dataclass(frozen=True)
    class PlanningLimits:
        max_route_prefixes: int
        max_leg_evaluations: int
        max_local_state_computations: int
        max_remote_state_samples: int
        max_upstream_requests: int

    @dataclass
    class PlanningStats:
        logical_state_queries: int = 0
        request_cache_hits: int = 0
        shared_cache_hits: int = 0
        negative_cache_hits: int = 0
        unique_local_computations: int = 0
        route_prefixes: int = 0
        leg_requests: int = 0
        leg_evaluations: int = 0
        remote_state_samples: int = 0
        upstream_requests: int = 0
        provider_failures: int = 0

    class PlanningContext:
        deadline_monotonic: float
        cancel_event: threading.Event
        limits: PlanningLimits
        stats: PlanningStats

        def checkpoint(self, stage: str) -> None: ...
        def reserve(self, counter: str, amount: int = 1) -> None: ...
        def remaining_seconds(self) -> float: ...
        def snapshot(self) -> dict[str, object]: ...

Reservations are atomic and happen before work starts. Failed expensive operations still consume their reservation.

Track logical requests separately from actual work:

- Cache hits increment logical queries and cache-hit counters, not remote calls.
- Lambert cache hits increment leg requests but not leg evaluations.
- An actual outbound call reserves immediately before dispatch.
- A remote batch reserves its state count before dispatch.

### 7.2 Exceptions

Trajectory:

    TrajectoryCancelled
    TrajectoryDeadlineExceeded
    TrajectoryBudgetExceeded
    TrajectoryRequestRejected

Ephemeris:

    EphemerisError
      EphemerisProviderUnavailable
      EphemerisUpstreamTimeout
      EphemerisUpstreamRateLimited
      EphemerisProtocolError
      EphemerisTargetUnsupported
      EphemerisBudgetExceeded
      EphemerisCancelled
      EphemerisContractMismatch

`None` may mean only “no certified Lambert solution.” It cannot represent provider, budget, protocol, or cancellation failure.

Do not use broad `except ValueError` around worker execution; an internal programming error must remain a 500.

### 7.3 Initial limits

These are provisional defaults with hard upper clamps:

| Limit | Initial value |
|---|---:|
| Assist pool | 8 |
| Assists | 3 |
| Route topology estimate | 401 |
| Global beam | 12 |
| Partials per route prefix | 2 |
| Route-prefix expansions | 256 |
| Assist TOF seeds | 8 |
| Refined roots per edge | 2 |
| Root iterations | 20 |
| Lambert cache-miss evaluations | 2,000 |
| Retained completed routes | 48 |
| Returned alternatives | 5 |
| Plan internal deadline | 7 s |
| Plan outer watchdog | 8 s |
| Concurrent plans/process | 1 |
| Lambert internal deadline | 5 s |
| Lambert outer watchdog | 6 s |
| Concurrent Lambert requests/process | 2 |
| Horizons call timeout | 2.5 s |
| Remote state samples | 128 |
| Remote HTTP requests | 16 |
| Epochs per batch | 32 |
| Response bytes | 2 MiB |

Configuration may lower these values. It must not disable or arbitrarily increase the safety boundary.

## 8. Layer C: endpoint ownership and disconnects

Convert plan and Lambert handlers to asynchronous wrappers around the existing owned-worker executor.

Lifecycle:

    parse bounded body
      -> validate request/provider policy
      -> acquire endpoint semaphore non-blocking
      -> create PlanningContext
      -> start explicit Request.is_disconnected() watcher
      -> submit owned worker
      -> await under outer watchdog
      -> worker callback releases semaphore at actual exit

Requirements:

- Validate before admission.
- Keep permits until workers actually exit.
- Set cancellation on watchdog timeout, coroutine cancellation, or confirmed disconnect.
- Do not release capacity when the HTTP coroutine merely stops awaiting.
- Poll `Request.is_disconnected()` explicitly.
- If disconnect and worker completion race, prefer a completed result.
- Cancel and await the watcher in `finally`.
- Use an internal deadline shorter than the outer watchdog so cooperative work returns structured partial telemetry.
- Treat the watchdog as a fail-safe for code that ignored its context.

The shared heavy executor has finite workers but an unbounded submission queue. Add shared heavy-work admission or prove that the sum of endpoint guards cannot create unbounded queued work.

If reachable beyond loopback, add configurable per-client trajectory rate limiting. Concurrency bounds active work; rate limiting bounds reconnect/rejection pressure.

## 9. Layer D: provider resolution and state contracts

### 9.1 Resolve once

Create a request-scoped `EphemerisSession` with requested provider, operation, required-body set, planning context, provider policy, and state contract.

Resolve before search. Never switch providers after sampling starts.

Initial policy:

| Operation | `auto` | explicit Kepler | explicit SPICE | explicit Horizons |
|---|---|---|---|---|
| Direct Lambert | Kepler | strict | strict | strict two-state fetch |
| MGA plan | Kepler | strict | strict | reject until finalist verification |
| Porkchop | Kepler | strict | strict | reject until bounded remote workflow |
| Mission | one shared Kepler session | strict | strict | reject until shared verification |
| Benchmark | Kepler | strict | strict | strict aggregate remote budget |

Later, `auto` may select SPICE only when initialization, complete target coverage, canonical-frame conversion, and committed parity tests all pass. It never selects Horizons.

### 9.2 Immutable scientific contract

Each sample carries or references:

    frame_id             heliocentric_ecliptic_j2000_geometric
    origin               sun_center
    orientation          ecliptic_j2000
    jd_time_scale        TDB
    position_unit        AU
    velocity_unit        AU/day
    corrections          NONE
    target_definition    planet_center | system_barycenter | small_body_center
    provider
    provider_revision

Use immutable vector tuples in caches.

Lambert asserts exact compatibility before solving. Matching provider names or units alone is insufficient.

### 9.3 SPICE

- Add thread-safe `unattempted/loading/ready/failed` initialization.
- Do not retry permanent import/kernel failure per sample.
- Request `ECLIPJ2000` or explicitly transform/test equatorial J2000.
- Preflight the complete body set.
- Explicit SPICE fails closed for unsupported bodies.
- Exclude SPICE from `auto` until frame and target-definition parity gates pass.

### 9.4 Kepler

- Reject orbitless bodies before search.
- Declare catalog/frame identity.
- Keep caching request-local unless a catalog fingerprint is part of a shared key.
- Preserve deterministic results through containment commits.

### 9.5 Horizons identity

- Remove display-name fallback.
- Use explicit commands and expected resolved target IDs.
- Decide planet-center versus system-barycenter targets to match the trajectory model.
- Reuse strong validation patterns from `scripts/fetch_jpl_nbody_ephemeris.py`.
- Fail unsupported targets before search or network.

## 10. Layer E: Horizons transport, cache, circuit, and single-flight

Add a separately testable `HorizonsTransport`. The optimizer never calls it directly.

### 10.1 Request/response contract

Explicitly fix discrete JD input, TDB, ecliptic reference plane, ICRF/J2000 system, geometric/no-correction vectors, AU/AU-day, and Sun-centered origin.

Validate:

- provider signature;
- numeric target and center identity;
- frame/system;
- units/corrections;
- returned JD tolerance;
- finite components;
- exactly one row per requested epoch;
- no duplicate/unexpected rows;
- bounded response size.

Map by returned JD, not row order.

### 10.2 Batching

- Deduplicate epochs by target.
- Batch multiple epochs for one target.
- Bound epoch count and encoded request size.
- Start at 32 epochs only after protocol tests pass.
- Clip socket timeout to remaining deadline.
- Use zero automatic retries initially.
- Do not sleep on upstream `Retry-After` while holding a planning slot.

### 10.3 Request-local behavior

- Memoize successes and classified failures.
- Open the request circuit after the first provider-wide transport failure.
- Distinguish provider-wide failure from unsupported target.
- Do not cache cancellation/budget failure.
- No later state request bypasses an open circuit.

### 10.4 Process-shared behavior

- Remote concurrency one initially.
- Global outage cooldown 30–60 seconds.
- One half-open probe.
- Immutable success LRU, initially 4,096 entries.
- Full key: provider revision, command, epoch tick, frame, center, time scale, corrections, units, target definition.
- Same-key single-flight with independent follower deadlines/cancellation.
- Always clear in-flight state.
- Store classified failure data, not exception objects.

## 11. Layer F: bounded global MGA

Replace full route generation and per-route beams with one global frontier.

### 11.1 Partial state

    body_route
    current_body
    current_jd
    legs
    validated_flybys
    pending_incoming_leg
    used_assist_ids
    departure_delta_v
    accumulated_path_metric
    elapsed_days
    validated_assist_deflection
    tof_sequence

A partial at an assist has a known incoming leg. Its encounter becomes certified only after an outgoing leg exists.

### 11.2 Expansion

    frontier = [departure]

    for assist_depth in 0..max_assists:
        try destination from each frontier state
        record physically certified completions

        if assist_depth == max_assists:
            stop

        extend states to unused eligible assists
        certify flyby at current body
        retain one bounded next frontier

Invariants:

- Destination is attempted at every depth, including zero.
- Destination is terminal.
- No repeated assist.
- An interior flyby is checked once.
- No full route list.
- All Lambert successes/failures are budgeted.
- Check cancellation/deadline before every prefix, leg, and refinement iteration.

Use deterministic round-robin work across `(partial, next_body)` so lexical ordering cannot consume an entire depth budget.

Initial depth reservations:

    depth 0: 128
    depth 1: 640
    depth 2: 640
    depth 3: 592
    total:   2,000

Unused budget moves only by a documented deterministic rule.

### 11.3 Frontier selection

1. Deduplicate by route prefix, rounded arrival JD, and TOF sequence.
2. Keep at most two states per prefix.
3. Reserve the best state ending at each distinct body.
4. Fill remaining slots by objective priority.
5. Cap at 12.
6. Tie by rounded priority, depth, route tuple, rounded arrival JD, and rounded TOFs.

Heuristic priorities are not admissible bounds and cannot prove global optimality.

### 11.4 Leg memo

Key successful and failed local solves by provider/session contract, bodies, departure tick, TOF tick, path sense, and solver version/options.

Count leg requests separately from cache-miss evaluations.

## 12. Layer G: solve flyby continuity

For an outgoing leg from an assist:

    f(t) = |v_inf_out(t)| - |v_inf_in|

For each next body:

1. Evaluate eight deterministic TOF seeds.
2. Accept a seed only inside the existing continuity tolerance.
3. Detect sign-changing intervals.
4. Refine with safeguarded secant/bisection.
5. Retain at most two certified roots per edge.
6. Allow at most 20 iterations per root.
7. Optionally inspect a bounded near-tangential minimum under a documented threshold.
8. Reject unbracketed/out-of-tolerance solutions explicitly.
9. Apply turn-angle/periapsis after magnitude continuity.
10. Charge every probe as a Lambert evaluation.

Do not weaken physics tolerances to accommodate a coarse grid.

Every assisted route must have aligned body/leg/assist counts, finite body parameters, certified continuity, feasible turn, minimum altitude, only endpoint propulsive delta-v, and retained Lambert TOF residuals.

## 13. Layer H: direct routes and honest labels

Direct destination expansion occurs at depth zero. Remove the planner's out-of-band fallback.

Direct result:

    routeClass: direct
    solver: lambert_direct
    flybyConstraintMode: not_applicable

Assisted result:

    routeClass: gravity_assist
    solver: lambert_mga_bounded
    flybyConstraintMode: unpowered_vinf_continuity_and_turn_limit
    feasibilityCertified: true

Return direct and assisted solution counts separately.

## 14. Layer I: remote finalist verification

Until this stage ships, explicit Horizons is rejected for plan, porkchop, and mission before work.

Workflow:

    bounded local candidate generation
      -> retain 6-12 diverse finalists
      -> derive/deduplicate all target/JD states
      -> batch remote fetch
      -> construct immutable prefetched table
      -> re-solve fixed finalists
      -> recheck Lambert residuals and flybys
      -> rank only fully remote-verified routes

Network completes before re-evaluation. A table miss is a protocol/implementation failure, not permission for network I/O inside the loop.

Never return a local result labeled Horizons. Disclose requested, candidate-generation, and verification providers and that this verifies a local shortlist rather than exhaustively searching remote ephemerides.

## 15. Search completeness and termination

Return:

    {
      "search": {
        "strategy": "bounded_global_beam_v1",
        "configuredFrontierCompleted": true,
        "searchSpaceExhaustive": false,
        "optimalityGuaranteed": false,
        "truncated": false,
        "terminationReason": "configured_frontier_completed",
        "routePrefixesExpanded": 52,
        "partialsPrunedByBeam": 123,
        "budget": {
          "legEvaluationsUsed": 812,
          "legEvaluationsLimit": 2000
        }
      }
    }

Reasons:

    configured_frontier_completed
    leg_budget_exhausted
    prefix_budget_exhausted
    deadline_exceeded
    cancelled
    ephemeris_unavailable
    remote_verification_incomplete

If a limit occurs after a verified result, return best-so-far with truncation. Without a result, report resource/inconclusive outcome—not physical infeasibility. “No feasible route” means only no route in the published configured domain.

## 16. HTTP contract

Structured error:

    {
      "detail": {
        "code": "trajectory_saturated",
        "message": "Trajectory planning capacity is occupied.",
        "retryable": true,
        "context": {}
      }
    }

| Condition | Status/behavior |
|---|---:|
| shape/type error | 422 |
| same bodies/reversed dates | 400 |
| unknown departure/destination | 404 |
| invalid/duplicate/unsupported assist | 422 |
| pool/topology violation | 422 |
| raw body too large | 413 |
| admission saturated | 503 + bounded `Retry-After` |
| internal limit with verified result | 200 + truncated metadata |
| budget exhausted without result | 503 `trajectory_compute_budget_exhausted` |
| configured domain finishes without route | 422 `trajectory_no_feasible_route_in_configured_domain` |
| outer watchdog | 504 |
| provider unavailable/circuit | 503 |
| upstream timeout | 504 |
| upstream rate limit | 503 + bounded `Retry-After` |
| incompatible upstream payload | 502 |
| unsupported provider/target/operation | 422 |
| disconnect | cancel internally; no synthetic response |

An alternative v2 contract could use HTTP 200 for all completed domain outcomes, including `best: null`. Decide before implementation and migrate frontend tests atomically.

Keep current success fields initially, then add schema version, provider resolution, state contract, effective pool, search domain, limits/counters, truncation, result class, and direct/assisted counts.

## 17. Capabilities

Upgrade `/trajectory/capabilities` additively with:

- schema v2;
- real pool/topology/evaluation/deadline/concurrency limits;
- local-only `auto` semantics;
- operation-level provider support;
- assist IDs separate from departure/destination IDs;
- provider target coverage;
- canonical frame/time/unit contract;
- bounded-beam and zero-revolution limitations;
- TOF domain;
- remote-verification availability.

## 18. Frontend closure

In `src/frontend/features/trajectory/index.ts`:

- Replace 2.5 seconds with endpoint-specific/capability-derived deadlines.
- Add typed `TrajectoryApiError` with status, code, retryability, retry-after, and context.
- Parse error bodies.
- Never fall back locally for a completed HTTP error.
- Never substitute explicit SPICE/Horizons.
- Permit offline fallback only for genuine connection failure with `auto`.
- Apply the same topology bounds to the local planner.
- Label fallback `source: local`, `degraded: true`, and provide `fallbackReason`.

In `plannerController.ts`, distinguish validation, saturation, deadline, provider outage, configured-domain no-route, partial result, and offline fallback.

## 19. Indirect callers

### Mission

Use one parent context, absolute deadline, aggregate budget, ephemeris session/cache/circuit, and cancellation event across outbound and all return searches. Child quotas cannot exceed the parent.

### Porkchop

Charge every grid leg/state, observe context during sampling, use local-only `auto`, and reject explicit Horizons until a dedicated batch path exists.

### Benchmark

Use aggregate budgets. Network checks are explicit manual/nightly jobs, never ordinary `auto` or CI behavior.

### Python callers

Core functions create safe default contexts when none are supplied. Omitting HTTP cannot produce an unbounded path.

## 20. Telemetry

Expose/log bounded deterministic counters:

    routePrefixesExpanded
    partialsGenerated / retained / pruned
    legRequests / legEvaluations / lambertFailures
    flybyChecks / rejection reasons
    vinfRootBrackets / certified roots / refinement evaluations
    completed / direct / assisted routes
    logicalStateQueries
    request/shared/negative cache hits
    uniqueLocalComputations
    remoteStateSamples / upstreamRequests
    providerFailures / circuitOpenRejections
    cancellationChecks
    elapsedMs

Document counter definitions. Log one summary per request; do not create unbounded high-cardinality labels.

## 21. Tests

No CI test contacts live JPL.

### Preflight

- `[]` stays empty.
- Nine assists rejected before planner construction.
- Duplicates, unknown, orbitless, and incomplete bodies rejected.
- Eight valid assists accepted.
- 39-body input rejected before ephemeris.
- Route estimator correct for depth zero through three.
- Oversized JSON rejected before full parsing where supported.

### Endpoint ownership

- First plan occupies the slot; second gets immediate 503.
- Timeout/cancel sets the event.
- Capacity remains unavailable until actual worker exit.
- Disconnect does not release early.
- Worker/disconnect race deterministic.
- Submission failure releases once.
- Deadline starts at admission.
- Partial verified result survives budget end.
- Budget exhaustion differs from no-route.
- Unexpected exceptions remain 500.

### Provider/frame

- Default operations make zero network calls.
- Provider resolves once.
- SPICE failure latches.
- Unsupported bodies fail before network/search.
- Provider never changes mid-operation.
- Mixed frame/origin/time/unit/target is rejected.
- SPICE ecliptic parity passes before joining `auto`.

### Remote amplification

- One failed transport followed by 1,276 logical requests makes at most one request-local outbound attempt.
- Cached local fallback never reprobes failed providers.
- Pre-cancel makes zero calls.
- Deadline prevents new batches.
- Atomic counters never exceed limits.
- Explicit direct Horizons never substitutes local data.

### Cache/single-flight

- Full key isolation and LRU eviction.
- Twenty identical concurrent fetches make one call.
- Followers time out independently.
- Failure wakes followers and clears in-flight state.
- Cancellation/budget failure not cached.
- One half-open probe.

### Horizons parser

- Shuffled rows map by JD.
- Requested duplicates dedupe.
- Missing/duplicate/extra/wrong-JD/wrong-target/wrong-center/wrong-frame/wrong-unit/nonfinite/oversized payloads fail closed.
- Ambiguous names cannot select a different body.
- Chunking respects epoch and request-size limits.

### MGA

- No repeat assists; destination terminal and tried at depth zero.
- Encounter checked once.
- Late failure and no-completion stay below all limits.
- Frontier <=12; prefixes <=256; per-prefix <=2.
- Diversity before global fill.
- Shuffled assist input gives identical output/counters.
- Pre-cancel makes zero Lambert calls.
- Mid-root cancellation stops next iteration.
- Success/failure leg memo works.
- Depth quotas preserve deeper work.

### Flyby roots

Fake residual cases: exact root, bracketed root, two roots, no root, tangential minimum, outside-domain root, iteration exhaustion, inside/outside tolerance, and turn-infeasible after magnitude match.

### Physics/quality

- Independently revalidate every returned assist.
- Counts align and missing parameters fail closed.
- No hidden interior burn.
- TOF residuals retained.
- Direct/assisted labels correct.
- Small exhaustive oracle: pool <=3, assists <=2, same finite domain.
- If oracle finds a route, bounded search finds one.
- Initial score gap <=5% or documented fixture waiver.
- Ten runs yield identical results/counters.
- Commit known feasible one- and two-assist synthetic fixtures plus infeasible controls.
- Add an independently sourced real flyby reference before claiming real-world MGA validation.

### Frontend/load

- 422/413/503/504 never causes local fallback.
- Explicit provider never falls back.
- Genuine `auto` connection failure can return visibly degraded bounded local output.
- Error code/retry-after retained.
- 100 concurrent plans start at most one worker.
- Health remains responsive.
- Default planning makes exactly zero HTTP requests.
- All registries/frontiers/queues remain bounded.

## 22. Acceptance gates

Mandatory safety:

- Zero outbound HTTP for default planning at every assist depth.
- Pool <=8; topology <=401; prefixes <=256; frontier <=12.
- Lambert cache-miss evaluations <=2,000.
- Retained completions <=48; alternatives <=5.
- Explicit remote search unreachable until verified workflow ships.
- Failed strict remote request fails fast within its transport budget.
- No provider failure reported as no-route.
- No mixed state contracts.

Mandatory behavior:

- Existing direct Kepler cases remain solvable.
- No unexplained direct delta-v regression >2%.
- Existing Lambert TOF residual certification remains.
- At least one known-feasible assist is returned before bounded MGA becomes default.
- Every assisted result passes independent continuity/turn checks.
- Direct-only output says so.

Secondary reference-hardware gates:

- Median local plan below two seconds.
- Worst accepted local plan below seven-second internal deadline.
- Cancellation exits within one active Lambert/refinement operation.
- Remote unwind bounded by one short socket timeout, never ten seconds times queued states.

## 23. Commit sequence

### Phase 0: characterize

1. `test(trajectory): capture amplification and result-class baseline`
2. `test(ephemeris): capture frame target and fallback failures`

### Phase 1: emergency containment

3. `fix(trajectory): preflight assist topology and preserve empty pools`
4. `fix(ephemeris): make auto local-only and pin provider policy`
5. `fix(trajectory): add context budgets counters and cancellation`
6. `fix(api): isolate plan and Lambert workers`
7. `fix(client): align deadlines and remove silent fallback`

Steps 3–7 are the minimum safe release unit. Otherwise a sibling/client path still bypasses containment.

### Phase 2: bounded scientific search

8. `refactor(mga): replace route lists with bounded global frontier`
9. `fix(mga): solve unpowered flyby continuity over TOF`
10. `fix(trajectory): integrate direct candidates and result classes`
11. `test(mga): add exhaustive oracle and scientific gates`

### Phase 3: provider hardening

12. `fix(ephemeris): add immutable state contracts and typed failures`
13. `fix(ephemeris): correct SPICE frame and latch initialization`
14. `fix(horizons): harden targets requests and response validation`
15. `fix(horizons): add bounded cache circuit and single-flight`
16. `feat(horizons): batch direct remote state sampling`

### Phase 4: remote verification and caller closure

17. `feat(trajectory): verify bounded MGA finalists remotely`
18. `fix(mission): share trajectory context and ephemeris session`
19. `fix(porkchop): enforce provider and work budgets`
20. `fix(benchmark): make remote use explicit and aggregate-bounded`
21. `docs(trajectory): publish search and provider contracts`

## 24. Rollout and rollback

- Use a server-side development strategy flag during qualification.
- Every strategy behind it shares hard budgets.
- Never expose an uncapped legacy strategy to the API.
- Compare engines offline, not by dual-running user requests.
- Disable remote MGA verification until its capability gate passes.
- Canary preflight rejects, saturation, evaluation counts, truncation, remote attempts, circuit state, cancellation lag, and browser fallback.
- Rollback goes to a capped lazy legacy engine, never the eager unbounded engine.
- Remove the runtime strategy selector after one stable release; retain a small oracle only in tests.

## 25. Known limitations

Disclose but do not hide inside this repair:

- zero-revolution Lambert only;
- 45–2,000-day per-leg domain may exclude outer-system transfers;
- current `pathLengthAu` is not true flown path length;
- `assistGainKmS` is velocity deflection, not propulsive delta-v;
- center and system-barycenter states remain different targets after frame normalization;
- patched-conic continuity is not an overall mission-accuracy claim;
- a bounded beam can discard a later-optimal route.

## 26. Definition of done

1. `auto` causes zero network access across default trajectory-search paths.
2. A maximum accepted request is bounded at ingress, admission, search, solver, state sampling, remote transport, deadline, and response retention.
3. Explicit remote search is either rejected before work or passes bounded finalist verification.
4. Network cannot originate inside a combinatorial optimizer.
5. Client timeout/disconnect cancels work and cannot trigger an unsafe duplicate fallback.
6. Mission, porkchop, benchmark, and Python callers cannot reset/bypass the core budget.
7. Provider/frame/target failures cannot become false physical infeasibility.
8. Truncation, heuristic optimality, provider resolution, and route class are visible in API/UI.
9. At least one known-feasible assisted route is found and independently revalidated.
10. Count-based adversarial gates pass without live network access.
