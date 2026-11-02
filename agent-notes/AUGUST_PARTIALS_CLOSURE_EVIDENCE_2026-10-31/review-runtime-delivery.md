# Independent runtime, delivery and distribution review

Review date: 2026-10-31. Reviewer: `/root/review_runtime_delivery`.
Initial integration: `d8eae548c0e27dacf37ca29d488728f563e2767d`.
Additive changes inspected through `7938f54`, including portable packaged-notice links (`2b5ccaa`) and browser fixture timeout placement (`7938f54`). Backend/catalog/EPO ownership is assigned to a separate reviewer.

## Verdict

No important code defect found in the assigned implementation. F-006, F-009, F-022, F-023, F-025, F-028, F-030 and F-031 satisfy their scoped repair requirements on inspected code and available targeted evidence. F-001 remains **pending integration gates**, not fixed: the first integrated browser matrix contains a context-fixture timeout, its repaired rerun is not yet recorded, and the integrated backend run is not complete (one failure marker was visible). This review cannot convert those unfinished gates into a successful result.

No source was changed by the reviewer. The independent label probe wrote only its JSON evidence and this review. Its temporary Vite server on port 4386 was stopped afterward.

## Per-finding assessment

| Finding | Spec compliance | Quality assessment / closure verdict |
|---|---|---|
| F-001 | Blocking browser matrix remains configured for Chromium, Chromium tab zoom, Firefox and WebKit. Pinned Node/npm and clean install are documented. New strict TS script configuration includes maintained TS scripts; source/UI/backend checks retain their existing contracts. | **Pending**, solely because final integrated gates are unfinished. Initial browser failure was a 30-second fixture timeout before the test body, while the 90-second timeout had been set inside that body. Moving it to declaration scope preserves the intended acceptance budget; it does not establish success until rerun. Firefox/WebKit exclusions of the existing actual-app smoke file predate these repairs; do not describe UI matrix success as physical-GPU or cross-engine actual-scene certification. |
| F-006 | README now distinguishes the shipped main composition from retained libraries, declares mandatory SHA-256, Float64 source/transport versus Float32 display, 423 identities / 46 radii / 377 unknown radii / 410 lazy models, supported commands and scientific limitations. CONTRIBUTING and canonical navigation exist. | **Pass scoped review.** No dormant planner, catalog-star, moon or backend N-body interface was silently promoted into the page. Catalog numerical source accuracy is covered by the separate reviewer. |
| F-009 | Backend route opts into render-v1, defaults to complete legacy state, hashes complete arrays, preserves scalar/provenance updates, supports exact-version reuse and gzip, and rejects oversize rather than dropping scientific fields. Actual client requests this transport and reconstructs only an accepted matching version. | **Pass scoped review.** Request ownership checks occur after asynchronous reads, invalid reuse clears the version without replacing the previous accepted state, disposal and forced-request cancellation remain fenced. Actual wire evidence covers complete/reused/changed/reconnected responses with correct epochs and synthetic fallback. Limits are wire presentation limits, not compute caching or an external-provider availability claim. |
| F-022 | Dedicated controller owns worker construction, readiness/response deadlines, two lifetime restarts, linear bounded backoff, current-JD reinitialization, retirement and disposal. Replies require exact sequence/JD, schema and typed-array lengths; available nonfinite vectors trigger quarantine. | **Pass scoped review.** Retired handler closures check worker identity. Sequence numbers continue across restarts. Main uses local propagation whenever no new acceptable snapshot is applied, including silence before timeout; snapshot age checks prevent applying an out-of-date response after a seek. Browser evidence kills a real worker on its first tick, observes its retirement and a replacement issuing subsequent ticks. Unit tests cover exhausted recovery and stale callback fencing. No resource-ownership regression found. |
| F-023 | Labels use a 40 CSS-pixel sprite plane with body-radius plus pixel clearance and screen-up placement. Stars are view directions forced to far depth, with no depth writes or frustum culling. Main owns resource disposal. | **Pass**, including independent rendered glyph evidence below. The submitted browser test proves real star pixels remain present at far=0.45 and are occluded by foreground geometry. Main executes controls, clip update, labels, then render. The initial lack of rendered-label evidence is resolved by this reviewer's probe, not merely by accepting numerical helper tests. |
| F-025 | Backend and surface material use the same adopted sidereal coefficient tuple; metadata/citations distinguish empirical Doppler-feature tracking, rigid IAU/Carrington frames and decorative time. Corona/eruption scope is visible in controls and descriptors. | **Pass scoped review.** Independently opened the primary 1990 paper and checked its sidereal Doppler-feature profile and distinct tracer qualifications. Physical-radius and Parker-distance contracts remain separate; no new physical speed or observation-calibration claim was introduced. |
| F-028 | Hidden entire populations/ancestors do not propagate or publish. Last published JD stays pending until reveal, which computes current JD once. Unchanged JD avoids updates. Frontend/backend populations have explicit synthetic-candidate qualification and validated reproducible seeds. | **Pass scoped review.** The updater tests exercise renderer matrix versions and current-date reveal, not just counters. Both primary and companion visibility are considered. Existing binary propagation behavior is preserved. Separate backend physics quality remains outside population-bin resonance claims. |
| F-030 | ADR records actual owners, composition boundaries, retained modules and activation requirements; main remains explicit scene composition while worker/annotation responsibilities have concrete modules. Historical records are labeled historical. | **Pass scoped review.** The repair does not disguise cosmetic line movement as a runtime decomposition or enable dormant UI. |
| F-031 | Unresolved Deimos public bytes/acquisition entry removed, honest generated fallback retained; source-image retirement has an exact inventory. Build checks manifest cardinality, uniqueness, source match, license field, bytes/hash and unlisted files before notice publication. Original permission-required code notice remains unchanged. | **Pass scoped review.** Portable Markdown link fix inspected in `2b5ccaa`; packaged documents resolve repository links to explicit source URLs. Three.js notice is packaged, attribution manifest remains distributed with maps, and policy separates independent third-party rights from code permission. This is a provenance/distribution-boundary review, not a newly inferred legal grant. |

## Independent rendered-label probe

Evidence: `review-label-pixels.json` beside this review.

The probe extracted the actual `createLabelCanvas` and `createLabelSprite` implementations from `src/main.ts`, removing only their TypeScript parameter annotations. It used production `updateBodyLabel`, an actual Three.js Sprite/CanvasTexture, and Chromium SwiftShader WebGL readPixels. Main was suppressed in the probe page to isolate glyph output. The same Earth glyph was rendered with a 512×512 CSS viewport at camera distances 0.0001 AU and 1000 AU, far planes 0.45 and 20000 respectively, and DPR 1 and 2. Body radius supplied to the production helper was distance/20. Threshold was red >20.

| DPR | Distance AU | Lit pixels | Glyph width CSS px | Glyph height CSS px | Glyph bottom above body center CSS px |
|---|---:|---:|---:|---:|---:|
| 1 | 0.0001 | 447 | 51 | 15 | 46 |
| 1 | 1000 | 447 | 51 | 15 | 46 |
| 2 | 0.0001 | 1630 | 51 | 14 | 46.5 |
| 2 | 1000 | 1630 | 51 | 14 | 46.5 |

The projected body radius is 23.0918 CSS px in each case. Thus close/distant glyph footprint is identical within each DPR and the glyph clears the body. The 40 px policy is the transparent sprite plane height, not a claim that visible letters are 40 px tall. DPR rasterization changes glyph antialiasing slightly without changing the camera-distance contract. Main ordering was inspected at `src/main.ts:1157` onward; `updateLabels` also refreshes the camera matrix before projection.

This independently resolves rendered-label acceptance without changing production code or repeating the full suite. It is not evidence of every physical GPU or of rendering moons that the shipped page intentionally excludes.

## Primary scientific reference checked

Snodgrass & Ulrich (1990), *Rotation of Doppler Features in the Solar Photosphere*, ApJ 351:309–316, DOI 10.1086/168467:
https://articles.adsabs.harvard.edu/pdf/1990ApJ...351..309S

The abstract gives the microradian/second coefficients and identifies the sidereal Doppler-feature result; it explicitly distinguishes other rotation tracers. The implemented degree/day tuple is an approximation of that profile, accurately qualified in the new documentation. No independent plasma-speed calibration is implied.

## Evidence limits and follow-up

The integrated frontend suite log available during review reports 1725 passed, 2 skipped. The root's actual-browser run already passed the silent-worker and close-focus star cases. Solar task evidence includes native model generation and actual HTTP compressed byte measurements, not a fabricated numerical estimate. Existing focused tests and raw reports were inspected rather than blindly rerunning their full suites.

Root must finish and assess the repaired browser matrix and full native backend/source/UI/script/build gates before closing F-001 or issuing an all-findings-complete statement. Any subsequent code changes in these assigned areas require targeted review of their delta; this verdict does not preapprove future changes.

## Scoped follow-up: browser gate changes through 24802ff

Reviewed `7938f54`, `1f12d7b`, and `24802ff` against F-001 and the accepted timing policy. **No important defect or unjustified scientific acceptance weakening found.** F-001 remains pending the final repaired matrix and integrated native gates.

- `7938f54` moves the intended 90-second real-WebGL smoke budget into declaration-time configuration. The previous body-level call could not cover fixture construction, which is where the recorded 30-second failures occurred. It also applies to the lighter tests in the same file, but no prescribed application-start or scientific timing assertion is removed.
- `1f12d7b` gives the assembled asteroid-material gate the same declaration-time setup budget and adds `retireWebGlPage`. Cleanup executes after test assertions, dispatches the actual main beforeunload disposal path (which owns RAF/workers/resources), and then explicitly loses the canvas WebGL context before fixture closure. Main's shutdown path and listener disposal were inspected. This reduces cross-test resource interference; it does not hide failures by retiring the scene before acceptance. A failed cleanup is not swallowed.
- `24802ff` changes the observation window for three worker tick submissions / repeated stage failures from the generic 8-second expectation timeout to 30 seconds. The foreground-stall test still injects a 60-second timestamp gap and checks all captured stepMs values are at most 100, with finite simulation JDs. Persistent-stage failure still requires continued ticks, working camera interaction, no renderer-unavailable state, one rate-limited report and no page errors. No minimum FPS or three-frames-in-eight-seconds product requirement was found; the accepted policy explicitly permits throughput to lag wall time. The longer observation window does not relax the numerical step bound.
- Quarantine now accepts at least one and at most three terminated workers. The corrupting hook affects every replacement, so the old exact-one assertion conflicts with the now-required two-restart controller. The upper bound matches one original plus two replacements. Its single sampled browser count alone does not prove lifetime boundedness, but the dedicated controller regression exhausts timers and independently checks exactly three workers, all retired, fallback status and zero timers. Together these tests retain the intended contract.

This follow-up is a code/contract review. It does not call the first matrix successful, reinterpret the reported load-sensitive backend failures as a full-suite pass, or substitute reported hardware results for a qualified final gate run.
