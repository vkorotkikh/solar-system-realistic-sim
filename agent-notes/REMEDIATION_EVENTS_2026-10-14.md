# Events remediation, 2026-10-14

Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-events`.
Scope: AGN/event engines, display isolation, KBO paused work, source directions and jet consistency.
No subagents, push, merge, master-tracker edits, backend edits, planet quadtree edits, or solar source/PFSS edits.

Latest follow-up: both `agnShockwaveEngine.ts` and `smbhPropagation.ts` have zero strict diagnostics. The separate SCN-025 follow-up below was verified with the pinned Node 22.23.2/npm 10.9.8 toolchain and 51 passing focused tests. Initial event remediation is commit `32da51b`.

## Issue status

| Requirement | Status and evidence | Fixed files |
| --- | --- | --- |
| SCN-023 | Fixed in code and focused tests. The legacy `applyMetricKinematics` API now returns independent display offsets instead of mutating any state vector. Both local and worker paths publish canonical orbital state. Scene offsets rebuild from canonical positions, subtract inherited offsets for moons, and reset without cumulative drift. Tests compare all canonical positions/velocities/availability and samples at forward and reversed dates, render with the experiment on/off repeatedly, and compare actual worker payload arrays with/without legacy metric input. | `src/sim/solarSystemModel.ts`, `src/workers/modelWorker.ts`, `src/workers/modelWorkerContract.ts`, `src/frontend/features/superluminal-modeling/metricDisplay.ts`, `src/main.ts` |
| SCN-024 | Fixed in code and CPU/buffer instrumentation tests. The updater propagates only when finite JD changes; each renderer buffer independently skips matrix writes and upload requests for unchanged Float32 positions. A 600-frame unchanged-JD test proves zero additional primary/companion propagation, matrix writes, and requested uploads. Forward date change updates positions; reversing to the original JD restores the original matrices. | `src/frontend/features/asteroids/kuiperBeltUpdater.ts`, Kuiper-only portion of `src/frontend/features/asteroids/beltRenderer.ts`, `src/main.ts` |
| SCN-038 | Decision implemented and tested: scientific state uses simulation JD; procedural solar shimmer/flares and compressed AGN event timelines use decorative, elapsed wall time. That clock advances only while JD advances, playback is positive, pause is off, and reduced motion is off. Pause/reverse/reduced motion freeze it; resuming discards catch-up. The first frame starts at zero and per-frame progress is capped at 0.1 s, avoiding epoch-sized float uniforms. Contract is stated in the experiment UI. | `src/sunController.ts`, event/solar animation wiring in `src/main.ts`, experiment introduction in `index.html` |
| SCN-065 | Fixed and tested. The controller updates the engine independently of foreground-event activity. Continuous flaring keeps the quiet tail of each 120-second window and carries overshoot into subsequent windows. Injectable randomness permits deterministic schedules. A 240-second batch and 2,400 updates of 0.1 s both emit 102 expected bursts with constant U=0.5 and no foreground event. Empty windows, repeated enable, disabled scheduling and non-finite deltas are covered. Controller integration produces a background flare without an active event. | `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts`, `src/frontend/features/superluminal-modeling/smbhPropagation.ts`, `src/sunController.ts` |
| SCN-066 | Fixed and tested at dispatch boundary. Presets own source and propagation model, so the H29 preset actually dispatches Sgr A* H29 even with stale source/model controls. Selecting a source or model explicitly returns to Custom. UI status derives from the same resolver and states hypothetical/illustrative jet assumptions. The no-op observer-projection control and controller wiring are removed; the deprecated engine compatibility method remains for existing front-invariance callers. Zero observer angle is preserved. | `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts`, `src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts`, `src/sunController.ts`, event-only `src/main.ts`/`index.html` edits |
| SCN-067 | Fixed and lifecycle tested. Both grids start hidden, skip animation while hidden, expose reset paths, and are reset at event replacement/end/reset/disposal. Warp visibility follows H29 state. Event cleanup is synchronous with the event clock, replacing the unmanaged wall timer. Disposal hides and detaches meshes. The warp front's extra factor of 180 was removed so its distance conversion agrees with the engine. SCN-042 plane geometry remains outside scope. | `src/frontend/features/solar/gravitationalWaves.ts`, `src/frontend/features/superluminal-modeling/warpSlipstreamVisuals.ts`, `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts`, `src/sunController.ts` |
| SCN-068 | Fixed and directly tested. `metricFrameDragPeak(1, 1e54)` no longer throws and equals the explicit Sgr A* mass invocation. Missing `SGR_A` import/TS2304 removed. | `src/frontend/features/superluminal-modeling/smbhPropagation.ts` |
| SCN-069 | Fixed with cited catalog inputs and explicit model assumptions. A single coordinate table supplies both catalog and engine directions in the canonical mean-ecliptic J2000 frame. Independent inverse-rotation tests recover all four cited RA/Dec values. M87 intrinsic beta is derived from an explicitly illustrative 6.3 c apparent speed and assumed 15-degree inclination, not claimed as a measured bulk speed. Cen A intrinsic knot speeds are derived consistently from its cited apparent speeds at an assumed 15 degrees. Sgr A* and Maffei jet parameters remain hypothetical. | `src/frontend/features/superluminal-modeling/sourceCoordinates.ts`, `src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts`, `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts`, event status in `src/main.ts` |
| SCN-025, events contribution | Both owned modules are now strict-clean. Initial engine cleanup removed 50 diagnostics; the separate follow-up removes the 79 propagation diagnostics still present after `32da51b` (which had already removed two of the original 81). Shared source, discriminated channel, scenario, H29 metadata, metric peak, stochastic flare and complete timeline interfaces replace implicit types. No added `any`, suppression, excludes or compiler relaxation. Full repository strict-zero still requires integration with the other owners. | `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts`, `src/frontend/features/superluminal-modeling/smbhPropagation.ts`, `src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts`, `src/frontend/features/superluminal-modeling/smbhTypes.ts` |

## Motion and scientific-state decisions

- Canonical orbital positions and velocities remain in their existing AU/AU-per-day, mean-ecliptic J2000, simulation-JD contract. Legacy worker metric input is accepted only for compatibility and ignored.
- H29 is a speculative display experiment. A fixed one-display-second exposure converts its shift estimate to a separate exaggerated node offset; this is not a physical integrator or an empirically validated metric solution. Repeated rendering does not integrate or accumulate displacement.
- Decorative motion freezes during reverse playback instead of attempting to reverse stochastic events or CME lifecycles. Physical orbits, rotations and JD-dependent activity still follow the simulation date. Provider polling retains its existing wall-clock delivery behavior.
- Source direction means the line from the Sun toward the source, not the jet orientation. Source ICRS coordinates are rotated into the same fixed ecliptic axes as canonical positions. No observer parallax, aberration, of-date precession, or source proper-motion correction is claimed.
- Removing the observer-frame switch preserves the already integrated radial-front timing fix. Transverse apparent speed does not rescale a radial front's arrival at the observer.

## Initial remediation reproduction and validation (32da51b)

The initial focused run, before production repairs, failed all 19 tests for the intended defects: mutated canonical/worker coordinates, repeated buffer dirties, ineffective presets, missing default mass import, lost stochastic-window time, initially visible grids, timer-dependent cleanup, wrong source directions, inconsistent beta and wall-clock motion during pause. The controller background-flare test emitted zero flares before the fix.

Initial red command (exit 1, 19 failed / 4 files):

```sh
npm test -- src/frontend/features/superluminal-modeling/eventsRemediation.test.ts src/workers/modelWorker.events.test.ts src/frontend/features/asteroids/kuiperPaused.test.ts src/sunController.events.test.ts
```

Final focused command (exit 0, 47 passed / 9 files, 1.39 seconds):

```sh
npm test -- src/frontend/features/superluminal-modeling src/frontend/features/asteroids/kuiperPaused.test.ts src/sunController.events.test.ts src/sunController.test.ts src/sim/solarSystemModel.test.ts src/workers/modelWorker.events.test.ts src/workers/modelWorkerContract.test.ts
```

Breakdown:

| Test file | Passing tests |
| --- | ---: |
| `src/frontend/features/superluminal-modeling/eventsRemediation.test.ts` | 15 |
| `src/frontend/features/superluminal-modeling/metricDisplay.test.ts` | 1 |
| `src/frontend/features/superluminal-modeling/smbhPhysics.test.ts` | 5 |
| `src/frontend/features/asteroids/kuiperPaused.test.ts` | 3 |
| `src/sunController.events.test.ts` | 3 |
| `src/sunController.test.ts` | 11 |
| `src/sim/solarSystemModel.test.ts` | 2 |
| `src/workers/modelWorker.events.test.ts` | 1 |
| `src/workers/modelWorkerContract.test.ts` | 6 |

Additional checks:

```sh
npm run typecheck:ratchet
# exit 0: 163/226 legacy diagnostics; no bucket exceeded its baseline.
npm run build
# exit 0: 50 modules transformed, built in 1.88 s.
git diff --check
# exit 0, no whitespace errors.
```

`npm run typecheck` remains nonzero because of repository-wide legacy debt. The pre-repair run after adding the red tests had 222 diagnostics, including 50 in the engine; the final ratchet reports 163 total. The build retains Vite's greater-than-500-kB bundle warning (main JS about 940.29 kB uncompressed). No backend suite or full integration gate was run; the controller owns those gates.

The root-repository dependency directory lacked `.bin/vitest`; the initial test invocation exited 127. The attempted symlink was removed and dependencies were installed only in this worktree with `npm ci --ignore-scripts --no-audit --no-fund` (61 packages, exit 0). The installed runner is Vitest 3.2.4. Runtime was Node v24.21.0/npm 11.19.0; npm warned that the repository pins Node 22.23.2/npm 10.9.8. No root dependency installation or lockfile edit was performed.

## Scientific provenance

Sources consulted 2026-10-14. Values below are catalog inputs or explicitly labeled model assumptions, not new observational evidence.

| Source/input | Adopted value | Precise reference |
| --- | --- | --- |
| Sgr A* ICRS, epoch J2000 | RA 17h45m40.03599s, Dec -29d00m28.1699s | [CDS SIMBAD Sgr A*](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Sagittarius+A%2A), coordinate bibcode `2011AJ....142...35P` |
| Cen A ICRS, epoch J2000 | RA 13h25m27.61521044s, Dec -43d01m08.8050291s | [CDS SIMBAD NGC 5128](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=NGC5128), coordinate bibcode `2020A&A...644A.159C` |
| M87 ICRS, epoch J2000 | RA 12h30m49.42338414s, Dec +12d23m28.0436859s | [CDS SIMBAD M87](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M87), coordinate bibcode `2020A&A...644A.159C` |
| Maffei 1 J2000 | RA 02h36m35.5s, Dec +59d39m18.6s | [NASA/IPAC NED-1D](https://ned.ipac.caltech.edu/level5/NED1D/ned1d.html), Maffei 1 rows. Coordinates were available from the indexed primary-source table; the direct browser fetch exceeded its content limit. This is the host-galaxy direction, not a measured SMBH astrometric solution. |
| Fixed ecliptic conversion | IAU76/80 obliquity 84381.448 arcsec; x unchanged, y'=y cos(eps)+z sin(eps), z'=z cos(eps)-y sin(eps) | [JPL Horizons manual, reference frames](https://ssd.jpl.nasa.gov/horizons/manual.html#frames), [JPL astrodynamic parameters](https://ssd.jpl.nasa.gov/astro_par.html) |
| Apparent speed equation and Cen A observations | beta_app = beta sin(theta)/(1-beta cos(theta)); AX4 apparent speed 2.7 +/- 0.4 c, corresponding radio knot 0.8 +/- 0.1 c | [Bogensberger et al. 2024, arXiv:2408.14078, equation 1 and abstract](https://arxiv.org/html/2408.14078v1). Adopted 15-degree angle is an assumption; intrinsic values are the algebraic inversion, not an independently measured bulk flow. |
| M87 kinematics context | Apparent speeds vary with knot, wavelength and epoch. The retained 6.3 c target and 15-degree inclination are explicitly illustrative, with intrinsic beta derived consistently. | [Meyer et al. 2013, arXiv:1308.4633, abstract and sections I/III](https://arxiv.org/html/1308.4633). This paper is context for heterogeneous knot motions, not evidence for the illustrative 6.3 c / 15-degree pair. |

## Remaining integration requirements and next actions

- Controller: integrate this scoped commit and run the full frontend/backend/strict gates with the other remediation branches. No push or merge was performed here.
- UI accessibility owner: event-only `index.html`/`main.ts` edits add the motion contract, remove `agn-observer-frame`, and wire preset/status synchronization. Panel and keyboard sections were not edited.
- Controller SCN-013 owner: every `beltRenderer.ts` change is inside `createKuiperBeltRenderer`; asteroid shader and material sections are untouched.
- Browser/GPU captures were not run. The KBO evidence measures real CPU propagation, instance-matrix writes/versions, and requested upload bytes; it is not a hardware GPU-transfer capture. Grid tests verify visibility/reset/disposal and update suppression without a WebGL submission trace.
- SCN-042 wrong-plane geometry is expressly unmodified. Source vectors use canonical ecliptic axes, but this report does not claim that separate grid-plane issue is closed.
- H29 remains a hypothetical educational display. No optional provider capture, observational validation of H29, or missing runtime/hardware check is marked passing.
- No code blocker remains in the assigned event requirements. Pinned-runtime reproduction, browser observation and full integration are outstanding controller checks.

## Separate SCN-025 propagation follow-up

The pinned runtime is available and was used for this follow-up: Node v22.23.2 and npm 10.9.8 from `/tmp/solar-remediation-toolchain-20261014/node_modules/`. No dependency installation was needed.

Changes:

- `smbhTypes.ts` defines the source inputs, scenario options, complete multi-messenger timeline, channel propagation variants, H29 metadata, metric peak and stochastic flare interfaces.
- `smbhPropagation.ts` has explicit numerical inputs/returns and structured inputs/outputs. Energy-dependent channels require `referenceEnergyEV` through the discriminated channel type. Existing scientific equations, fallback values and runtime schedules are unchanged.
- `smbhPhysicsConstants.ts` checks source and channel catalogs with `satisfies`, preserving their inferred catalog details while validating the model contracts.
- `agnShockwaveEngine.ts` consumes the shared physics/channel/flare interfaces. It remains at zero strict diagnostics.
- `smbhPropagation.types.test.ts` checks public type signatures and exercises custom sources without optional field/jet estimates, both scenarios and non-default numerical parameters.
- `sunController.events.test.ts` installs the deterministic RNG before engine construction. The initial pinned run exposed this pre-existing test-fixture ordering problem: `advances background flares with no foreground event` observed four callbacks instead of one because the engine had already captured the original random function. The fix is in the fixture; runtime behavior was not altered.

Strict diagnostic evidence: immediately before this follow-up, the engine had 0 and propagation had 79 errors. Afterward both have 0. Full worktree strict diagnostics fall from 163 to 84. Those 84 errors are outside these owned modules and reflect this worktree's pre-integration versions of other owners' files; full `npm run typecheck` still exits 2 here. No file exclusion or settings change was used.

Exact pinned-toolchain focused test command:

```sh
PATH=/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH /tmp/solar-remediation-toolchain-20261014/node_modules/node/bin/node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js test -- src/frontend/features/superluminal-modeling src/frontend/features/asteroids/kuiperPaused.test.ts src/sunController.events.test.ts src/sunController.test.ts src/sim/solarSystemModel.test.ts src/workers/modelWorker.events.test.ts src/workers/modelWorkerContract.test.ts
```

Result: exit 0, **51 passed / 10 files**, 1.42 seconds. The first pinned run before repairing the RNG fixture was 50 passed / 1 failed; no failure is omitted from this report.

Explicit strict compilation of both owned modules, their dependencies and the new type-contract tests, with the repository's strict compiler settings:

```sh
/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin/node node_modules/typescript/bin/tsc --strict --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --types vite/client --isolatedModules --resolveJsonModule src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts src/frontend/features/superluminal-modeling/smbhPropagation.ts src/frontend/features/superluminal-modeling/smbhPropagation.types.test.ts
```

Result: **exit 0, zero diagnostics**. This targeted compiler invocation validates the new compile-time assertions; Vitest alone does not typecheck them.

```sh
PATH=/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH /tmp/solar-remediation-toolchain-20261014/node_modules/node/bin/node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run typecheck:ratchet
```

Result: exit 0, **84/226 legacy diagnostics**, no new or enlarged diagnostic buckets. `git diff --check` also exits 0.

Next action: controller integrates this separate follow-up after `32da51b` alongside the other strict-cleanup branches, then runs the repository-wide strict-zero gate. No `main.ts` edit is included in this follow-up. No code blocker remains for either owned module. Browser/GPU captures and full integration gates remain unperformed here; this type-only production change does not add scientific claims or replace the provenance above.
