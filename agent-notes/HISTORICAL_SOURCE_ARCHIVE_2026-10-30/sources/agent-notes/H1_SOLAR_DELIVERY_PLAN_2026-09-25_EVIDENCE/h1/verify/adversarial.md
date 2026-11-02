# adversarial-code ship-with-fixes
Branch fix/solar-data-status-notice @ 728d21c (4 commits on bd48a7d). No blockers. The request logic holds up: every race I tried behaves correctly in production paths. A superseded request's probe result never overwrites a newer outcome. The timeout bounds a stalled body or error-detail read, and our own abort is never misclassified. The probe runs only after a TypeError, and the chip cannot sit on "connecting" for more than 4.6 s. Strict tsc adds 0 errors, the full suite passes (162/162) and the production build succeeds.

One major problem: the chip is a polite, atomic live region whose text contains volatile details (the "updated HH:MM" clock, the image loading state, the failure kind). A screen reader therefore re-reads the whole sentence far too often. Measured with the real controller and the real captured payload:
- 10 announcements in 10 minutes on a healthy backend where only the clock changes.
- 20 in 120 s when the AIA image keeps failing.
- 20 announcements plus 20 console.warn in 120 s when failures alternate between timeout and 503 busy. This happens today under contention, for example with two tabs, or after a reload while the old page's aborted computes still hold both server slots.

Minor problems:
- While a replacement image loads, the text drops the AIA image even though the old image is still drawn.
- dispose() during the probe or during a body read records a failure. This is latent: nothing calls dispose() in production. A validated 3-line fix is in suggested_client_fix.diff.
- A CORS-refused origin shows up as "did not answer within 2.6 s", because Starlette runs the full 8-10 s compute before the browser can refuse the reply.

Nits:
- 'server-timeout' can never appear with a 2.6 s client timeout against the server's 12 s budget.
- A JSON array is accepted as a valid payload.
- The chip says "AIA 094" where the dropdown says "94 Å".
- consecutiveFailures and atMs are never read.

Not measured: Firefox and WebKit (only Chromium is installed), and the probe against a live backend (not in this area).

$SP below = /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad. Throw-away tests were run in $SP/wt-notice-adv and then removed (copies are in $SP/h1/verify/code/tests/). Both worktrees are clean at 728d21c. The only ignored files in wt-notice are backend/__pycache__ dirs dated 23:31 yesterday, which are not mine.

## scenarios
- PASS Full vitest suite | Test Files 13 passed (13); Tests 162 passed (162); solarDataStatus.test.ts 14, solarPhysicsClient.test.ts 12
- PASS Strict tsc adds 0 errors | 246 errors both; comm -13 (added) empty; comm -23 (removed) empty; no errors in solarPhysicsClient.ts/solarDataStatus.ts
- PASS Production build | built in 1.72s, exit 0; dist/index.html contains id="status-solar" (1 match); only the pre-existing >500 kB chunk warning
- FAIL ADV-1 dispose() while the no-cors probe runs | [ADV-1] probe aborted by dispose: false | lastFailure: "blocked" | consecutiveFailures: 1
- FAIL ADV-2 dispose() while the 200 body is read | lastFailure {kind:'invalid-response', message:'Solar physics response was not valid JSON (AbortError: This operation was aborted)'}
- FAIL ADV-3 dispose() while a 503 error body is read | lastFailure kind 'busy', message 'Solar physics request failed (503)'
- PASS HOLD-1 stalled error-detail / 200 body bounded by timeout | not settled at 2599 ms, settled at 2600 ms; 503 case kind=busy (the status arrived, the detail did not), 200 case kind=timeout
- PASS HOLD-2 timeout fires while the probe runs | settled after 4000 ms, kind unreachable (the TypeError preceded the timeout)
- PASS HOLD-3 forced refresh supersedes a request mid-probe | lastFailure null (or rate-limited, consecutiveFailures 1); inFlight false; abortController null; latest {activity_index:0.6}; the old probe signal was NOT aborted, so it still sends one extra /health request
- PASS HOLD-4 own abort never misclassified | timeout in all 3 cases (timedOut is checked before the error type); a TypeError-shaped supersede abort starts 1 probe but its result is dropped
- PASS HOLD-5 probe only after TypeError | 0 /health calls in all 5 cases; kinds timeout, busy, rate-limited, http, invalid-response
- FAIL ADV-4 JSON array payload | [ADV-4] [] accepted: true | latest: []
- FAIL ADV-5 CORS-refused origin with 8-10 s compute | [ADV-5] disallowed origin + 9 s compute -> timeout
- FAIL ADV-6 server compute-budget 503 | [ADV-6] server compute budget exhausted -> timeout
- FAIL HOLD-6 no supersede re-check after json() | [HOLD-6] superseded request returned true latest = {"activity_index":0.99,"stale":true}
- PASS C0 construction order / TDZ | published.length 1, state connecting
- FAIL C1 image rotation while the old image is drawn | before: '...blended 41%; AIA 304 image) · updated 14:00 UTC' / while loading: '...blended 41%) · updated 14:00 UTC' / after: '...; AIA 304 image)...'
- FAIL C2 persistently failing AIA image | [C2] 20 live-region updates in 120 s, 10 image attempts (alternating '...41%)' and '...41%; AIA 304 image failed to load)')
- FAIL C3 healthy steady state | [C3] 10 live-region updates in 10 min: '... · updated 14:01 UTC', '14:02', '14:03', ...
- FAIL C4 alternating timeout / 503 busy | [C4] 21 requests (every 6000 ms), 20 live-region updates, 20 console.warn in 120 s
- FAIL C5 channel B fails while channel A is drawn | 'Sun: backend solar model (hybrid forcing, observations blended 41%; AIA 171 image failed to load) · updated 14:00 UTC'
- PASS C6 transitions | connecting, error (HTTP 429), backend, backend+image, stale ('backend state from 14:00 UTC (refresh failing: solar server busy, HTTP 503)'), backend; 2 console.warn
- PASS Real-Chromium fetch semantics | no-cors to closed port: TypeError 'Failed to fetch' in 5 ms plus console 'Failed to load resource: net::ERR_CONNECTION_REFUSED'; no-cors to reachable 500: resolved opaque status 0; abort(): DOMException AbortError 'signal is aborted without reason'; AbortSignal.timeout: DOMException TimeoutError. Sa
- PASS Backend /health cost for the probe | 0.9 / 0.4 / 0.3 ms; sync def (threadpool); not rate-limited
- PASS Suggested client fix validated | Tests 2 failed | 31 passed (33); the 2 failures are ADV-5/ADV-6 (design and configuration limits, not addressed by this diff)
- PASS Worktree hygiene | wt-notice-adv: clean (my tests and __pycache__ removed); wt-notice: clean except backend/__pycache__ (ignored, mtime 2026-09-24 23:31, predates this run)

## findings
- [major] Status chip re-announces its whole sentence on every volatile detail (clock tick, image load, failure-kind flip) @ src/frontend/features/solar/solarDataStatus.ts:109 (timestamp in text), :82-87 (image suffix); src/sunController.ts:185-190 (dedupe on full text); index.html:397-402 (role=status aria-live=polite aria-atomic=true)
  EVIDENCE: FACT, measured with the real createSunController, the real captured payload and fake timers ($SP/h1/verify/code/tests/h1v-adv-controller.test.ts; output adv_all_final.txt / adv_controller_run2.txt): C3 healthy, only the clock changes: 10 announcements in 10 min ('... · updated 14:01 UTC', '14:02', ...). C2 AIA image keeps failing: 20 announcements in 120 s (text alternates with and without 'AIA 304 image failed to load' on every 12 s retry, sunController.ts:296/303/324). C4 alternating timeout / 503 busy: 20 announcements in 120 s, one per 6 s attempt. Because aria-atomic=true, each is the full ~100-character sentence. MDN Live regions: polite is for updates 'important for the user to receive, but not so rapid as to be annoying'; aria-atomic=true 'ensures that each time the live region is updated, the entirety of the content is announced in full'; clocks belong in role=timer / aria-live=off. MDN status role: implicit aria-live polite and aria-atomic true. INFERENCE about when it bites: C4 happens today whenever both server compute slots are held (two tabs, or a reload while the old page's aborted computes still run: server.py:466-503 releases the guard only when the work finishes). C2/C3 are the steady state once H-1's latency is fixed.
  FIX: Separate the announcement from the display. Remove role/aria-live/aria-atomic from #status-solar, so the visible chip keeps the full text and title. Add a sibling <span class="visually-hidden" role="status"> (the class exists at style.css:119) and write to it only a short sentence built from state plus failure family, e.g. 'Sun data: live backend model' / 'Sun data: backend busy or slow, showing procedural model'. Write it only when state or family changes, and only after a new failure kind has persisted for 2 consecutive attempts (consecutiveFailures is already tracked). Keep 'updated HH:MM', blend % and image details out of the live text.
- [minor] Image state conflates the pending load with the image actually drawn @ src/sunController.ts:303-304, 322-325; src/frontend/features/solar/solarDataStatus.ts:82-87
  EVIDENCE: FACT (C1): 'before: ...blended 41%; AIA 304 image) · updated 14:00 UTC' -> 'while replacement loads: ...blended 41%) · updated 14:00 UTC' -> 'after: ...; AIA 304 image)'. The old texture stays bound the whole time (the error and loading paths never touch solarObservationTexture), so the middle text is wrong and each rotation costs 2 announcements. FACT (C5): after AIA 304 loaded and an override to aia_171 failed, the text is '...; AIA 171 image failed to load)' with no mention that 304 is still drawn.
  FIX: Describe the displayed image from solarObservationTextureChannel, which is set only on a successful load. Report a pending or failed channel only as a secondary clause, e.g. 'AIA 304 image; AIA 171 failed to load'. Do not change the text when a load merely starts.
- [minor] console.warn fires on every text change, and each failed probe adds a browser console error @ src/sunController.ts:187-189; src/frontend/features/solar/solarPhysicsClient.ts:300-315
  EVIDENCE: FACT (C4): 20 console.warn in 120 s with alternating timeout / 503. FACT (Chromium 1243, fetch_semantics_chromium.json): a no-cors probe to a closed port logs 'Failed to load resource: net::ERR_CONNECTION_REFUSED'. So an unreachable server produces 2 red errors per 6 s attempt instead of 1, plus the warn on change.
  FIX: Warn once per state transition and once per failure kind per few minutes (a Map of kind to lastWarnMs). Optionally skip the probe while the previous verdict was 'unreachable' and less than about 60 s old.
- [minor] dispose() during the probe or during a body read is recorded as a server failure @ src/frontend/features/solar/solarPhysicsClient.ts:255
  EVIDENCE: FACT: ADV-1 gives 'probe aborted by dispose: false | lastFailure: "blocked" | consecutiveFailures: 1'. ADV-2 gives kind 'invalid-response' ('not valid JSON (AbortError...)'). ADV-3 gives kind 'busy'. Cause: the guard only skips errors that are not SolarPhysicsRequestError, but the probe, the inner json catch and readErrorDetail all wrap the abort into one. The branch's own test covers dispose only during fetch. Latent: grep finds no production caller of SolarPhysicsClient.dispose().
  FIX: Replace line 255 with `if (controller.signal.aborted && !timedOut) return false;`. Optionally let dispose() also abort an in-flight probe controller. Validated: with $SP/h1/verify/code/suggested_client_fix.diff, all 12 branch client tests plus ADV-1..4 and HOLD-6 pass (fixed_client_run.txt).
- [minor] 'blocked' (CORS) is not diagnosed while compute is slower than the 2.6 s timeout; a disallowed origin shows up as a timeout @ src/frontend/features/solar/solarPhysicsClient.ts:291-298; src/sunController.ts:166; backend/server.py:113-119
  EVIDENCE: FACT: starlette 1.7.0 CORSMiddleware.simple_response always runs `await self.app(...)` and only omits ACAO for a disallowed origin. cache:'no-store' adds Pragma/Cache-Control only in HTTP-network-or-cache fetch (Fetch spec), so the GET stays simple with no preflight, and the full ~8-10 s compute runs. ADV-5 (TypeError arriving at 9 s): '[ADV-5] disallowed origin + 9 s compute -> timeout'. INFERENCE: fast 429/503 replies from a disallowed origin do give 'blocked', so under contention the chip flip-flops between timeout and blocked. The 'blocked' text also cannot tell 'origin not allowed' from 'unhandled 500'.
  FIX: After a TypeError or a timeout, also send a CORS-mode GET /health (0.3-0.9 ms server-side, not rate-limited). CORS /health fails and no-cors /health succeeds: origin not allowed, a definite 'blocked'. CORS /health succeeds but physics failed with TypeError: server error without CORS headers ('http'). Both fail: 'unreachable'.
- [nit] 'server-timeout' can never be observed with the current client timeout @ src/frontend/features/solar/solarPhysicsClient.ts:73; src/sunController.ts:166; backend/server.py:178-182, 1050-1066
  EVIDENCE: FACT: the client aborts at 2.6 s, but the server sends 503 'Solar physics generation timed out.' only after its 12.0 s asyncio.wait_for. ADV-6: '[ADV-6] server compute budget exhausted -> timeout'. Half of 728d21c's stated purpose cannot fire; no user-visible harm.
  FIX: Keep it for when timeoutMs exceeds the server budget, but say so in the classifyHttpFailure comment and in the 728d21c message, or drop the branch until H-1 raises the client timeout.
- [nit] A JSON array passes the payload shape check @ src/frontend/features/solar/solarPhysicsClient.ts:241
  EVIDENCE: FACT (ADV-4): body [] gives '[] accepted: true | latest: []'. The chip would then say 'backend solar model (synthetic forcing, no observations)'.
  FIX: `if (!payload || typeof payload !== 'object' || Array.isArray(payload))` (included in suggested_client_fix.diff).
- [nit] No supersede re-check after `await response.json()` @ src/frontend/features/solar/solarPhysicsClient.ts:233-251
  EVIDENCE: FACT (mock-only, HOLD-6): a superseded request whose body ignores abort returns true and overwrites latest ({"activity_index":0.99,"stale":true}), clearing lastFailure. INFERENCE: not reachable in conforming browsers, because a forced refresh aborts the old controller and the Fetch spec then errors the readable body ('If response's body is non-null and is readable, then error response's body with error'). The controller also never supersedes (sunController.ts:539).
  FIX: Add `if (this._reqId !== currentReqId) return false;` after the json await, as defense in depth (in the diff).
- [nit] Channel label 'AIA 094' does not match the dropdown's '94 Å' and the payload's 'AIA 94' @ src/frontend/features/solar/solarDataStatus.ts:83
  EVIDENCE: FACT: .replace(/^aia_/i, '') on 'aia_094' gives 'AIA 094'. index.html:144 labels it '94 Å · Flare plasma'; the payload channel name is 'AIA 94'.
  FIX: .replace(/^aia_0*/i, '') gives 'AIA 94'.
- [nit] State that is written but never read, and a duplicated helper @ src/frontend/features/solar/solarPhysicsClient.ts:264, 266, 66; src/frontend/features/solar/solarDataStatus.ts:40
  EVIDENCE: FACT (grep over non-test src): consecutiveFailures and lastFailure.atMs are never read outside the client. SolarPhysicsFailureKind, SolarPhysicsClientStatus and SolarDataSourceState are exported but not imported by any non-test module. formatSeconds is defined identically in both files.
  FIX: Use consecutiveFailures for the flip-flop debounce in the major finding, or drop it. Share one formatSeconds, e.g. export it from solarPhysicsClient.ts.

## artifacts
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/tests/h1v-adv-client.test.ts
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/tests/h1v-adv-controller.test.ts
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/tests/h1v-fixed-client.ts
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/tests/h1v-code-fetchsem.mjs
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/suggested_client_fix.diff
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/adv_all_final.txt
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/adv_controller_run2.txt
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/fixed_client_run.txt
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/fetch_semantics_chromium.json
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/vitest_full.txt
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/tsc_strict.txt
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/tsc_head_norm.txt
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/vite_build.txt
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/dist
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/verify/code/refs/fetch_spec.html
- /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/pw/h1v-code-fetchsem.mjs
