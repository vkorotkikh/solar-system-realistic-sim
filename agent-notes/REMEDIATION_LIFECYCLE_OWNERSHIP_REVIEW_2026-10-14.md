# Independent lifecycle ownership review

Assigned worktree: `solar-remediation-20261014-lifecycle-review`.
Branch: `remediation/20261014-lifecycle-review`.
Base: `ec4e0bbb7b05e29f20987473a5a059ce5bbb6882`.

Only `frameLifecycle.ts`, `simulationClient.ts`, two dedicated CPU test files
and this evidence note changed. No main, panel controller, backend, producer
fixture, parent harness, canonical tracker or other agent's files changed.

## Reproduced defects and bounded corrections

Baseline: the three existing lifecycle/client test files passed all 42 tests.
The two new files initially produced **14 failures, 1 pass**.

1. A canceled RAF callback delivered after hide/resume or stop/start could run
   stages and schedule a second chain. Recovery that stopped/restarted inside
   an error observer also let the old frame continue its remaining stages.
   Scheduling and stage dispatch now carry a lifecycle generation invalidated
   by cancellation. The delayed-callback cases are injected ownership tests,
   not a claim that a particular browser routinely violates RAF cancellation.
2. Throwing status, disconnect, warning and ready observers interrupted socket
   construction, reconnect scheduling, transport cleanup and queued Kuiper
   replay. Observer exceptions are contained and reported through a separate
   console diagnostic, without recursively calling the warning observer.
3. Reentrant observer actions could create an orphan socket after disconnect,
   restore state after disconnect, leave a stale timeout, reconnect over a
   replacement socket, close a replacement after an old transport error, or
   deliver ready for a replaced session. Generation/socket identity checks
   now protect those boundaries. Freshness work is installed before observer
   notification so a disconnect can revoke it. Existing retry/backoff and
   stale deadlines are unchanged.
4. A real-shaped in-flight Kuiper delivery repopulated rendering caches after
   explicit deactivation. A revocation flag now suppresses those caches until
   activation. Ordinary body updates still progress. Legacy unsolicited
   snapshots remain accepted until explicit revocation, preserving established
   compatibility. Raw `latestState` remains the admitted wire message; the
   dedicated `latestKuiper`/`latestKuiperSnapshot` rendering caches honor revoke.

## Scientific admission review

- The active main worker receiver validates schema, sequence, epoch, typed-array
  types/lengths and binary availability values before calling
  `hasFiniteAvailableBodyState`. That helper checks all six coordinates of every
  available record while permitting unavailable NaN placeholders. No bypass was
  found in that actual call path; the helper and scientific contract are unchanged.
- Real fixture: `src/frontend/app/fixtures/kuiper-runner-state.json`, captured
  from `SimulationRunner._loop -> KuiperBeltEngine.get_state`, 32 generated
  particles plus companions, 36 positions, four binary pairs. Tests retain the
  actual positions, velocities and binary metadata, including `AU/yr` velocity
  units and `osculating_initial_state_only_massless_no_mutual_gravity`.
- The four intervening state frames omit Kuiper and retain the exact accepted
  snapshot object. Existing malformed-coordinate/unit/pair rejection, empty
  snapshots, null clearing, stale cleanup and disconnect tests remain passing.
- No unit conversion, scientific threshold, model label, worker availability
  policy, frame delta cap or backend fifth-frame cadence changed.

## Validation

Commands used the assigned Node toolchain, from this worktree:

```sh
node node_modules/vitest/vitest.mjs run src/frontend/app/frameLifecycle.test.ts src/frontend/app/frameLifecycle.ownershipReview.test.ts src/frontend/app/simulationClient.test.ts src/frontend/app/simulationClient.kuiper.test.ts src/frontend/app/simulationClient.lifecycleReview.test.ts
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run test:types:ui
node node_modules/vitest/vitest.mjs run
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run typecheck
git diff --check
```

- Focused: **57 passed**, five files, zero skips.
- Full configured Vitest: **696 passed, 415 skipped**, 67 files passed and one
  skipped. Skips are not passes or newly obtained evidence.
- Strict UI-test TypeScript and strict production TypeScript both passed.
- Diff whitespace check passed before commit.
- No remaining failure in these executed gates. No browser/server was started;
  no fresh backend capture, backend suite, hardware or deployed-session claim.

## Residual scope and risks

- The active main loop uses `frameLifecycle`; the source search finds the
  SimulationClient rendering consumer in the separate `animationLoop` module,
  not a new live-client wiring change in main. Client fault-injection results
  are API-level evidence, not a claim of an observed deployed UI incident.
- The wire has no subscription generation token. A delayed old snapshot arriving
  after a new activation cannot be distinguished from the new subscription by
  this client alone. Adding such a protocol field is outside this bounded patch.
- Omitted Kuiper data retains the previous snapshot while the overall stream is
  fresh, as required by the producer cadence. No unapproved per-Kuiper expiry
  policy was introduced.
- Frame-stage containment retries synchronous stages and allows independent
  later stages to run. It does not roll back a stage's partial mutations or turn
  asynchronous work into awaited stages; no such new behavior is claimed.
