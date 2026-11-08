# SCN-042 production frame wiring checkpoint

> **Current status (2026-10-30):** See the [verified remediation status](REMEDIATION_STATUS_2026-10-30.md) for all 83 dispositions, branch-specific fixes, remaining acceptance gates and the 25 completed working-note removals. The dated content below is historical evidence; it does not describe current main.

**2026-10-31 follow-up:** [Solar eruption modeling and rendering](../docs/solar-eruption-modeling.md) documents the current particle architecture, square-sprite defect and proposed implementation/validation sequence. That visual repair remains open.

**2026-10-31 repair:** The square-sprite child is repaired on `fix/solar-eruption-visuals` (soft-disc alpha map, smaller and denser particles, per-particle restart fade, texture disposal), with [rendered real-GPU evidence](SOLAR_ERUPTION_VISUALS_2026-10-31_EVIDENCE/README.md). SCN-042 itself remains open.

Assigned worktree: `solar-remediation-20261014-solar`, branch `remediation/20261014-solar`.
Parent integration owns `src/main.ts`; apply `SCN042_MAIN_HANDOFF_2026-10-14.patch`
there when integrating this checkpoint. No master tracker or observation helper was edited.

## Behavior

- Backend synthetic snapshots declare frozen, Z-up `SOLAR_EQUATORIAL_J2000`
  coordinates (defined as `IAU_SUN` at J2000), their TDB epoch, units, source,
  and unvalidated calibration status per layer. Observed PFSS native frames remain unresolved.
- The active Sun controller admits PFSS, loops, spots, Parker geometry, CMEs,
  and coronal holes independently. Missing/incompatible provenance, malformed vectors,
  explicit rendering revocation, and observed PFSS tags are rejected.
- Frozen geometry is attached below the Sun translation parent and transformed to
  ECLIPJ2000. The surface alone uses the evolving IAU orientation. Surface feature
  coordinates remove that rigid phase so their world positions do not spin twice.
- Existing `lockBodySpin` child orientations are preserved. Newly owned surface
  children discard catalog scalar rotation once, then remain locked.
- CME mesh and shader longitude conventions agree. `BACKEND_GEOMETRY_VALIDATED`
  remains false; the delivery status explicitly reports uncalibrated synthetic geometry.
  After this change nothing reads the constant; see
  [the gate section](#backend-geometry-gate-plan-history-and-state-on-main).

## Backend geometry gate: plan, history and state on main

> **Merged 2026-11-07** from the H-1 plan's write-up of the gate: §1.3, H2.4, Phase 4, H5.1, traps T1 and T9–T11,
> decisions D3, D10 and D11, and review rows K3 and K11. The full plan remains in
> [H1_SOLAR_DELIVERY_PLAN_2026-09-25.md](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md). Its byte copy in the 2026-10-30
> archive was removed the same day. The checkpoint text above and below this section is unchanged.

### What the plan specified (2026-09-25)

Shipping delivery without gates would have switched on every display path that had never run with real data
(trap T1, coupling C4): a 242 AU spiral, loops past Mars, sunspots at 72° latitude and the wrong H-2 field lines.
Step H2.4 therefore let each backend layer reach the screen only after its own check:

| Layer | Gate | Opens in |
|---|---|---|
| Activity | on | — |
| Sunspots, loops, eruptions, model flares, coronal holes | frame | H4 |
| Solar-wind spiral | scale and frame (empirical wind); WSA | H4; H5 |
| Field lines, backend PFSS | PFSS validation | H5 |
| Field lines, analytic but seeded at backend regions | frame | H4.10 |
| AIA image | projection | H6.6 |
| Observation controls (blend, emission, hue, confidence, freshness) | calibration and projection | H6.10 |
| Auto tint | D4: never while in Auto | — |

- **Mechanism:** gated consumers receive `null` state. The field-line builder receives `physicsState: null`, so
  feature seeds never read backend state (review K3). The observation controls and the AIA texture refresh are
  gated as well (review K11).
- **Planned tests:** gated layers never receive backend state; feature-seeded field lines never read backend state
  while gated; the observation blend equals its no-data value while gated; every layer has a legend entry.
- **Opening order (Phase 4):** one Sun frame (HGC: z north, x at Carrington longitude 0) and the IAU orientation
  first, then a per-layer legend before any layer opens. After that: sunspots (4.5), loops and eruptions (4.6),
  coronal holes (4.7), model flares and CMEs (4.8), the empirical spiral (4.9) and the feature-seeded field lines
  (4.10). Backend PFSS lines open only when the payload reports `validated === true` (H5.1).
- **Acceptance, measured on rendered placement (§1.3, H4):**
  - Sunspots: rendered |latitude| p95 ≤ 35°.
  - Loops: footpoints within 5° of drawn spot groups; drift 14.2 ± 0.6°/day; height ≤ 1.6 display radii at the
    default scale.
  - Coronal holes: polar limbs darker than equatorial limbs at solar minimum.
  - Flares: origins at feature latitude ± 0.5°.
  - Spiral: crosses Earth's orbit within 1%, with winding atan(Ωr/v) ± 1°.
  - Feature-seeded field lines: seeds within 5° of drawn spot groups.
- **Frame traps the gate guarded against:** mapping z-up to y-up with a y/z swap, which is a reflection (T9);
  converting only at ingest while the shaders still use world normals (T10); and putting inertial longitudes under
  the spinning group, which rotates them twice (T11).
- **Owner decisions:** D3, how structures around the enlarged Sun are scaled; D10, accepting that the poles move to
  the true axis; D11, showing the non-PFSS backend layers before R3 closes, in the local profile only and
  model-only until H6.10.

### What was built

| Date | Change | Effect |
|---|---|---|
| 2026-10-07 | `86d199b` (H2.4); merged with H2.1–H2.6 in PR #5 on 2026-10-11 | One global constant, `BACKEND_GEOMETRY_VALIDATED = false`, instead of the per-layer table. No backend geometry reached the Sun, and the chip said "backend activity, procedural features". |
| 2026-10-14 | `68be768`, this checkpoint | Per-layer frame admission replaced the constant's three readers. A layer draws backend geometry when its snapshot carries the frame contract described above. The constant stays exported and `false`, but nothing reads it. The chip says "backend solar model" once any layer is admitted. |
| 2026-11-03 | PR #31 (H2.7–H2.10) | Stale-state clearing and lag labels, field-line identity by content and epoch, rigid rotation of backend field lines between snapshots, fixed decorative blends, and the rate/Paused header. |
| 2026-11-07 | Branch `fix/solar-h2-followups`, pushed, not merged | Loops and eruption bursts also turn with the Sun between snapshots (part of H4.6), plus review fixes. |

The frame is not the plan's HGC. Snapshots use the frozen `SOLAR_EQUATORIAL_J2000` frame (`IAU_SUN` at J2000) with
already-evolved vectors. The IAU orientation is implemented in `solarFrame.ts` and checked against CSPICE, in place of
the planned `sunOrientation.ts`.

### State on main (2026-11-07)

- `validatedSolarLayerFrames` (`src/frontend/features/solar/solarGeometryContract.ts`) admits six layers
  independently: PFSS, loops, spots, the Parker spiral, CMEs and coronal holes. Its contract requires
  `source_kind: synthetic` and `calibration_status: unvalidated`; observed or untagged geometry is refused.
  The local backend declared all six for a default request on 2026-11-04. Five draw from the model by default;
  PFSS lines also draw once the "Solar magnetic field" switch is on (it starts off).
- One difference from the plan matters. H5.1 kept backend PFSS lines hidden until they were validated. The
  contract now admits them because they are labelled synthetic and unvalidated.
- Observed inputs stay off: forcing is synthetic, and the chip reads "Sun: backend solar model (synthetic
  forcing, observations disabled until validated)".
- **Placement evidence:**
  - frame-contract and field-line rotation tests (`solarGeometryContract.test.ts`);
  - CSPICE orientation and no-double-rotation tests (`solarFrame.test.ts`);
  - this checkpoint's CSPICE production-controller regression;
  - the actual-main GPU frame gate (`scripts/verify_solar_main_frame.py`; 6 cases on an RTX 5090, per the
    2026-10-30 status);
  - display-scale tests (`solarDisplayScale.test.ts`).
- **Not built as planned:**
  - the H2.4 gate tests;
  - the layer legend (4.4);
  - the rendered checks for sunspot latitude, loop footpoint co-location, flare origins, spiral winding and
    feature-seeded field lines.

  `backend/tests/test_solar_region_consistency.py` checks that map polarity and feature footpoints agree inside
  the model, but not on screen.

### Open

- **SCN-042 acceptance.** Item 5 of [REMEDIATION_SOLAR_SCN042_FRAMES_2026-10-14.md](REMEDIATION_SOLAR_SCN042_FRAMES_2026-10-14.md)
  asks for integrated production-scene tests showing that every enabled layer avoids double tilt or spin and agrees
  spatially. The evidence above covers the pole, prime meridian, PFSS and surface features; the rendered per-layer
  checks listed as not built remain open.
- **Owner decision, deferred on 2026-11-07:** keep the layers visible with an honest "not yet validated" label and
  delete the unread constant, or restore a real gate.

## Fresh checkpoint checks

- Full frontend: **443 passed, 31 files**, exit 0.
- Backend frame contract, solar physics model, and PFSS cache: **163 passed**,
  exit 0 (67.10 seconds).
- Production build: exit 0; existing bundle-size warning remains.
- TypeScript ratchet: exit 0, **217/226** baseline diagnostics, no bucket regression.
  Strict typecheck is not green: 217 legacy diagnostics remain outside this change.
- `git diff --check`: exit 0.
- Follow-up full backend suite: **2,358 passed, zero skipped**, exit 0, 227.10 seconds.
  Two existing Starlette/httpx/AnyIO deprecation warnings remain. This is the
  assigned branch's suite, not the parent's broader integrated test count.

The production-controller regression uses the independent CSPICE matrices at display
epochs 2451545, 2451552, and 2461326.238888889. It checks pole and prime meridian,
PFSS world geometry, surface feature alignment, and spin locks. Initial failures
exposed an incorrectly embedded 3x3 reference matrix, overwritten existing spin
locks, ignored explicit rendering revocation, and a null-hole exception. These
were corrected without widening scientific tolerances.

Commands (run from the assigned worktree):

```sh
export PATH=/tmp/solar-remediation-solar-toolchain-20261014/node_modules/node-linux-x64/bin:$PATH
node /tmp/solar-remediation-solar-toolchain-20261014/node_modules/npm/bin/npm-cli.js test
node /tmp/solar-remediation-solar-toolchain-20261014/node_modules/npm/bin/npm-cli.js run typecheck:ratchet
node /tmp/solar-remediation-solar-toolchain-20261014/node_modules/npm/bin/npm-cli.js run build
PYTHONPATH=backend PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_frame_contract.py backend/tests/test_solar_physics_model.py backend/tests/test_pfss_cache.py --tb=short
```

The supplied shared `/tmp` toolchain was absent and its reconstruction failed.
An isolated copy uses the same pinned Node 22.23.2 and npm 10.9.8.

## Remaining integration boundary

This checkpoint does not close SCN-042 application delivery: the lifecycle owner
must integrate the main-scene handoff and rerun the integrated hardware screen
oracle and delivery checks. No observed Carrington calibration is asserted.
SCN-041's full-domain accuracy gate remains failed; its numerical investigation
follows this checkpoint. Parent ACE overlap work is external-model-only and is
not replaced by this frame change.
