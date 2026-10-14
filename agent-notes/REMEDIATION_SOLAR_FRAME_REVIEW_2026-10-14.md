# Independent solar frame/controller review

Assigned worktree: `solar-remediation-20261014-solar-frame-review`.
Base: `53057f9ffb02741f8717248fd6d02b3d8a1f8e8f`.
Scope: controller, geometry admission, dedicated CPU tests. No backend,
`main.ts`, parent GPU harness, canonical tracker, or other agent's files changed.

## Reproduced and repaired

The new dedicated test file initially produced **13 failures, 1 pass**:

- Snapshot interpolation still used `Date.now()` while the merged decorative
  clock froze. During pause, reverse, and reduced motion the blend advanced from
  0.015648021134989584 to 1 over 60 wall seconds. All blend evaluations, starts,
  refresh materialization, initialization and scale-change evaluation now use
  the existing capped decorative clock. Transport, observation freshness and
  polling still use wall time. The existing event clock and physical JD frame
  orientation are unchanged.
- An admitted replacement PFSS solution at the same epoch retained the old
  geometry because the cache signature only summarized epoch/activity/features.
  Every newly admitted PFSS snapshot now rebuilds the geometry and disposes its
  predecessor. This does not assume an optional solution ID is a content hash;
  it also honors snapshots without IDs. Poll cadence remains unchanged.
- Explicit malformed `rendering_eligible` values (null, numbers, strings,
  objects) bypassed the false-only check. An absent flag remains valid for the
  established backend contract; if supplied it must be boolean true.
- Coronal holes with nested observed/unknown/null source were admitted under a
  synthetic top-level tag. Nested source must now be synthetic, matching the
  existing PFSS source check. Other independently valid layers remain admitted.

## Passing evidence

From this worktree with the assigned Node toolchain:

```sh
node node_modules/vitest/vitest.mjs run src/sunController.frameReview.test.ts src/sunController.events.test.ts src/sunController.test.ts src/frontend/features/solar/solarFrame.test.ts src/frontend/features/solar/solarGeometryContract.test.ts src/frontend/features/solar/solarFeatureBlending.test.ts src/frontend/features/solar/solarPhysicsClient.test.ts
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run test:types:ui
```

- **114 tests passed, 7 files, zero skips.** The new file contributes 14 cases.
- Strict UI TypeScript check passed with no diagnostics.
- Actual controller geometry replacement is checked against the independent
  checked-in CSPICE frozen-frame matrix (unchanged 2e-9 AU position budget).
- Existing six frame/epoch CSPICE cases, actual graph parentage and surface
  transforms, CME sign conventions, observation admission/lifecycle and the
  merged decorative event clock remain passing. No solar-frame matrix change
  was necessary; no double-orientation finding is asserted for these CPU paths.

## Real remaining failure handed to the parent

An additional temporary CPU probe of the out-of-scope
`src/frontend/features/solar/sunVisuals.ts:1379` failed: **1 failed, 0 passed**.
The expression `clampUnit(Number(blendView?.blendAlpha) || 1)` maps exactly zero
to one. With the same feature ID, source arc `[[1,0,0],[1,1,0]]`, target arc
`[[0,1,0],[1,1,0]]`, blend start/now both zero and duration 1000, the blender
correctly produces alpha zero but the actual loop geometry uses the target.
First-point distance from the source at `SOLAR_RADIUS_AU` was
**0.0065828041928929605 AU**, failing the 1e-9 AU assertion. This can show a target
flash at blend start, including while frozen before the first forward tick.

The reproduction called `normalizeSolarFeatureSetFromState` on those two
one-feature states, `buildSolarFeatureBlendView` with the clocks above, then
`updateSunCoronalLoopsFromBlendView(new Group(), blend, SOLAR_RADIUS_AU)` and read
the first child's position attribute. The parent was notified to use a finite
numeric fallback rather than a truthiness fallback. That source file was not
edited. The temporary failing probe was removed after retaining its inputs and
failure here; it is NOT counted as a pass or skip and the remaining defect is
not declared resolved by this commit.

## Limits

- No new solar headful/GPU claim. Parent owns the actual-main pixel/frame gate.
- Snapshot epoch and frame agreement is enforced at admission. A frozen-frame
  snapshot may intentionally be displayed at another JD; this patch does not
  introduce an unapproved staleness cutoff or claim a new physical evolution
  model between snapshots. Synthetic geometry remains explicitly uncalibrated.
- These tests do not certify observed-native PFSS geometry, all drivers, or
  full-scene shader behavior. Backend PFSS and main lifecycle remain other
  agents' write sets.

## Full configured Vitest run

`node node_modules/vitest/vitest.mjs run` exited 0: **645 passed, 415 skipped**;
62 files passed, 1 file skipped. Skipped coverage is not counted as passing.
This configured-suite result does not erase the separately reproduced
out-of-scope zero-alpha failure above.
