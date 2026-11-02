# Independent F-029 retained API review

Reviewed `/home/nomad/ai/projects/worktrees/solar-partials-apis-20261031` at
`93e5064440323787c3326a0bd0eb2ed3e9e92d81`, diff from `40a98302`.
Read the task brief, original F-029 finding, complete four-commit source diff,
affected runtime consumers and tests. The implementer report was not yet present
when this initial review ran. No implementation edits, merges, subagents, network
source refreshes, or dormant UI activation were performed.

## Initial verdict: F-029 closure not yet justified

Mixed-record iteration, short orbital-period interpolation spans, direct display
epoch fallback, explicit DOM capability grouping, and the added client APIs are
substantive improvements. The default composition remains unchanged. Three
important retained-API boundary failures remain below; the first is introduced
by the new callback ordering, while the other two are adjacent pre-existing
weaknesses exposed by independent end-to-end/adversarial checks of the repaired
contracts. None implies a live default-UI regression because these features
remain dormant.

## P2 — Reentrant JD observer restores state invalidated by its own seek

Location: `src/frontend/app/simulationClient.ts:325-338`.

The incoming state handler calls `onJulianDate` before publishing `latestState`
and Kuiper caches. A legitimate observer can call the newly added
`setJulianDate(newJd)`, which sends the seek and clears caches. When the observer
returns, the same message handler reinstalls the old state and Kuiper snapshot.
The socket-identity guard cannot detect this because a seek retains the socket.

Independent probe transpiled and executed the production `SimulationClient`
class with a native-timer WebSocket stub:

```js
client.connect(); socket.open();
socket.message({type:'connected', protocol_version:1, jd_time_scale:'TDB'});
client.onJulianDate = () => client.setJulianDate(2460000.5);
socket.message({type:'state_update', jd:2451545, jd_time_scale:'TDB',
  bodies:{earth:{pos:[1,2,3]}}, kuiper:[[4,5,6]]});
```

Observed: the socket sent `{type:'set_julian_date', jd:2460000.5,
jd_time_scale:'TDB'}`, but after the handler returns `latestState.jd === 2451545`
and `latestKuiper` is again `[[4,5,6]]`. This contradicts the new seek method's
cache invalidation contract and lets a synchronization observer reuse stale
positions. Publish the complete incoming state before notifying its epoch, or
guard continuation with an operation generation that changes on seeks. Verify
same-socket observer seeks as well as the already tested socket replacement.

## P2 — Unnamed TLEs still lose distinct identities across feeds

Locations: `src/frontend/features/planetary/satelliteSystem.ts:260-261` and
`:658-664` (new parser record naming at approximately `:283`).

Each TLE feed numbers unnamed rows starting at `Satellite 1`; the element parser
derives identity from that display name. Initialization then deduplicates those
IDs across all feeds. Consequently two distinct complete unnamed TLEs in the
normal Earth `stations` and `geo` sources collide and one disappears even though
the repaired parser retained both individually.

Independent end-to-end probe bundled the production module in memory, mocked
only source fetches, and called actual `initialize()` with these literal rows:

```text
1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9990
2 25544  51.6400 120.0000 0005000  80.0000  40.0000 15.50000000123450
```

The other feed used catalog ID `99999` in both lines and mean motion
`01.00000000` instead of `15.50000000`, making it eligible for the existing GEO
selection. With `tleSources:{stations:'stations', geo:'geo'}`, the actual final
catalog contains only `{id:'sat-satellite-1', name:'Satellite 1', category:'leo',
meanMotionRevDay:15.5}`. The distinct GEO source row is silently lost.

Use the TLE catalog identity, validate matching line-1/line-2 IDs, and keep display
names separate. Add an initialization-level multi-feed test; parser-only length
assertions cannot catch this data loss. Duplicate records for the same source
identity should still deduplicate intentionally.

## P2 — Invalid worker coordinates are accepted and suppress exact fallback

Location: `src/frontend/features/planetary/satelliteSystem.ts:933-950`; incoming
snapshot handling around `:707-731` checks lengths but not finite values.

The new bounded-span gate accepts a matching count/J2/epoch snapshot containing
NaN coordinates. `applyWorkerSnapshot()` returns true and writes NaN into the
display buffer, so `update()` does not run its exact display-JD fallback.

Independent production-bundle probe used a physically valid circular satellite
at 7000 km, `useJ2:false`, and this snapshot:

```js
value.workerSnapshot = {
  jd0:2451545, jd1:2451545.0001, applyJ2:false, count:1,
  positions0:new Float32Array([NaN,0,0]),
  positions1:new Float32Array([NaN,0,0]),
};
value.applyWorkerSnapshot(2451545); // true
Array.from(value.currentPositionsAu); // [NaN, 0, 0]
```

These payload lengths also pass the actual worker message handler. Validate all
endpoint values and complete buffer lengths before any marker mutation, reject
nonfinite requested epochs, and return false for invalid snapshots so the exact
fallback remains available. A multi-satellite test should corrupt the final
record and prove earlier markers are not partially committed before rejection.

## Verification and positive findings

- Ran focused existing/new tests for `simulationClient.test.ts`,
  `uiBindings.capabilities.test.ts`, `satelliteSystem.tle.test.ts`, and
  `satelliteSystem.interpolation.test.ts`: **4 files, 36 tests passed**.
- The tests exercise literal final unnamed pairs, mixed record consumption,
  circular analytic interpolation error below 0.55 km, forward/backward period
  bounds, stale/J2 snapshot fallback, DOM capability preflight before controller
  effects, finite TDB seek construction, malformed numeric orbital element
  rejection, and replaced-socket isolation.
- Source review confirms the period cap no longer depends on absolute JD and
  `update()` propagates at requested display JD when a valid covering snapshot
  is unavailable. The documented 0.527 km example is explicitly circular and
  is not a universal eccentric-orbit or observational accuracy claim.
- The propagation model remains mean Kepler elements plus optional secular J2;
  no SGP4 implementation or accuracy claim was introduced.
- DOM feature toggles are independently optional; the remote connect/backend/
  status group is all-or-none. Both binder entry points preflight before listener
  installation; the higher-level composition preflights before invoking time
  or planner controller binding. No important new defect found in this portion.
- Orbital-elements finite field checks align with the backend's AU/degree/day
  payload. Unsupported explicit epoch scales are rejected. Auxiliary caches
  clear on socket replacement, disconnect, and stale timeout.
- No default composition-root changes appear in the four commits; retained
  modules remain opt-in. Root-owned module status/ownership documentation was
  outside this source diff and must accompany final closure.
- `git diff 40a9830..93e5064 --check` passed; implementation tree was clean at
  the reviewed commit. No browser reactivation or full-suite duplication ran.

Awaiting scoped repairs and independent rereview of the three findings above.

## Scoped rereview of three repairs — `b9ebcc0`

Read the full `93e5064..b9ebcc0` repair diff and independently replayed all
three original production-code probes.

- **Reentrant state-update seek: ADDRESSED.** A separate epoch-operation
  generation fences continuation after observer-triggered seeks. Original
  callback now sends the seek while leaving state/Kuiper caches null. A later
  real state message at the target JD is accepted. The last confirmed JD remains
  the old server JD until that message, as intended.
- **Cross-feed unnamed TLE identity: ADDRESSED.** The exact original stations/GEO
  input now produces both `sat-norad-25544` and `sat-norad-99999` through actual
  initialization. Names no longer determine TLE physical identity; matching
  line-1/line-2 catalog identifiers are required. No important new issue found
  in the identity repair diff.
- **Malformed worker coordinates: ADDRESSED.** A corrupt later record now causes
  `applyWorkerSnapshot()` to return false before changing any display coordinate.
  The independent two-record sentinel-buffer probe remained `[1,2,3,4,5,6]`
  after rejection; actual `update()` then populated finite circular-orbit
  coordinates for both records via direct propagation. Both complete Float32
  lengths and finite endpoint values are checked before the marker loop.

The related handshake callback ordering observation remains outstanding at this
head: when a `connected` message includes a finite JD, `onJulianDate` still runs
before `serverReady=true`, and an initial seek from that observer returns false.
This is distinct from the now-fixed state-update reentrancy. The implementer was
actively adding its red regression during this review; the scoped test run
therefore observed **38 passed / 1 failed**, with only that new handshake test
failing. This was an evolving worktree, not a claim about the clean b9ebcc0 test
inventory. Awaiting the additional handshake commit before final exact-head
validation. No new important issue found in the three reviewed repair diffs.

## Final exact-head review — `8b4d320` (2026-11-01)

**Verdict: APPROVED for the scoped F-029 retained-API repairs.** Reviewed the
integration worktree `/home/nomad/ai/projects/worktrees/solar-close-partials-20261031`
at exact HEAD `8b4d3207a33a8e5cdcb0276183ec93e7e66ddaf8`, including the full
`7abcce1..8b4d320` handshake repair diff and surrounding transport lifecycle.
No important defect remains in the reviewed changes. The three repairs approved
above are preserved; the additional handshake callback readiness issue is now
addressed. This verdict is based on direct source inspection and independent
execution; no final Task 5 implementer report was available.

The incoming-message handler now commits initial server readiness, negotiated
Kuiper capabilities, incoming caches, and the confirmed epoch before notifying
status or epoch observers. A handshake observer can therefore seek immediately.
Observer-triggered seeks keep position/element caches invalidated, and the
confirmed JD remains the last server epoch until a subsequent server message.
Socket-identity checks stop old handshake continuations after disconnect or
session replacement. The epoch-operation guard also suppresses an obsolete JD
notification when the status observer has already sought.

Independent validation at this exact head:

- Pinned Node **v22.23.2** executed Vitest **v5.0.4** against
  `simulationClient.test.ts`, `simulationClient.kuiper.test.ts`,
  `simulationClient.subscription.test.ts`,
  `simulationClient.lifecycleReview.test.ts`,
  `uiBindings.capabilities.test.ts`, `satelliteSystem.tle.test.ts`, and
  `satelliteSystem.interpolation.test.ts`: **7 files, 86 tests passed**.
  The initially missing `/tmp` dependency target was restored by the parent
  before this successful run.
- A separate native-Node probe imported the production TypeScript class
  directly, used native timers plus an instrumented WebSocket stub, and passed
  **12 reentrancy scenarios**: each of the connected-status, Julian-date,
  protocol-warning, and server-ready observers performed either a seek,
  session reset via `connect('kepler')`, or disconnect.
- The probe asserted that confirmed JD was visible inside each callback; every
  callback seek succeeded; cache invalidation survived handler return; a target
  epoch state was accepted; readiness fired once per session; duplicate
  handshakes did not repeat readiness; queued Kuiper activation replayed once
  on the owning ready session; a retired handler could not restore caches or
  epoch; and disconnect left **zero owned timers**. All assertions passed.
- `git diff 7abcce1..8b4d320 --check` passed. No implementation edits, commits,
  subagents, live source refreshes, full suites, browser runs, or backend jobs
  were performed by this final reviewer.

Scope and limits: this approval covers the retained client protocol/observer
boundaries, TLE record identity, worker-snapshot validity and display-epoch
fallback, and DOM capability grouping exercised above. It does not activate
dormant modules, establish browser/backend end-to-end behavior, or extend the
satellite model beyond mean Kepler elements plus optional secular J2. The
earlier circular interpolation example remains a bounded analytic example,
not an SGP4 or universal observational-accuracy claim. Final integration-wide
checks and module status/ownership documentation remain the parent task's
responsibility.
