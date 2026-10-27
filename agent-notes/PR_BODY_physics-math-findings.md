## Summary

> Current status (2026-10-14): see [the master tracker](MASTER_ISSUE_TRACKER_2026-10-11.md) and [active remediation effort](REMEDIATION_EFFORT_2026-10-14.md). The dated findings below preserve their original snapshot; they are not current merge status.


Fixes the open physics and math defects from the 2026-08/09 audits. These are tracked in
`agent-notes/AUDIT_AND_ISSUE_INDEX_2026-10-07.md` §5 (not committed to git). That index has the status of each item on
main.

There are 14 commits on top of `17d1e63`, one fix each, and the branch merges into current `main` (`e7de6cc`) without
conflicts. Every fix comes with a check that fails on `17d1e63` and passes here. The "before → after" numbers are
measured, mostly against JPL Horizons.

| Area | Commit | Before → after |
|---|---|---|
| SMBH constants | `eef8945` | Schwarzschild radii 100× too small (ISCO and photon sphere too). Heliosphere equilibrium time ×1e5 (19 yr shown as 1.9 Myr). The AGN front was sped up by the *transverse* apparent β, so it hit the Sun at 4.07 s; the GW channel it is anchored to fires at 8 s. |
| `solveKeplerFast` | `7a21468` | Worst residual 1.1e8 rad for e ≥ 0.99 → < 1e-9 for all e < 1 (Danby starter). |
| Pluto | `fc32483` | No secular rates → Standish Table 1 rates. Error vs Horizons 0.54–1.90e6 → 0.28–1.36e6 km, matching an independent Standish evaluation exactly. Pluto is added to the planet gate. |
| Io, Europa, Triton | `0caa1bd` | Worst error 2000–2030: Io 8.47e5 → 1.56e3 km, Europa 1.35e6 → 2.16e3 km, Triton 1.47e5 → 2.53e4 km. |
| Earth vs EMB | `fea6f9d` | Earth was the Earth–Moon barycentre. Velocity error vs Horizons 399: 11.05–13.74 → 0.52–1.48 m/s. |
| Hathaway cycle | `0ea15f8` | Normalised at the c = 0 peak, so it overshot by 3.4% and the clamp held 15.1 months of every cycle at exactly 1.0. Now normalised at the true peak (58.39 months). |
| Rotation label | `a91ce42` | The rotation law was labelled `snodgrass_1983_like`; it is now `snodgrass_ulrich_1990`, matching its coefficients. |
| Mission mass flow | `62a4f5d` | A plan 26.5 km/s short of Δv reported 9,021 kg returned and failure probability 0.0. Now 0 kg and 1.0. |
| MGA flyby floors | `838e7bf` | Mean radius + 300 km put Saturn's periapsis inside its 1-bar level. Now equatorial radii, and Jupiter uses the GTOP 671,492 km floor; max turn at v∞ = 10 km/s drops from 142.7° to 81.6°. |
| Lambert | `62fd99a` | Adds multi-rev (`revolutions`, `branch="low"/"high"`), fast hyperbolic arcs, a 0-rev cap below 4π², and rejection of arcs through the Sun. Agrees with lamberthub `izzo2015` on 148 cases to ≤ 1.2e-7 m/s. |
| Benchmark | `dc1f0ab` | With nothing comparable it reported a mean error of 0.0. Now `null`, plus two published fixed-state textbook problems (Curtis Ex. 5.2; Vallado), which pass to ≤ 4e-5 km/s. |
| Sirius B | `dcef69b` | Sirius B carried Sirius A's mass, so its period was 2.72% off Kepler III. Now Bond et al. 2017 (ApJ 840, 70) elements and masses: 0.0006% off. |
| Galactic tide | `074759c` | Uses the Heisler–Tremaine tensor on galactic axes (was compressive and applied on ecliptic axes). The module is still not imported. |
| Trojans | `607ba0d` | Trojans are now phased by mean longitude, giving L4/L5 clouds instead of a uniform ring. The pipeline is still not imported. |

### Root causes that differ from the audits

- **Io and Europa.** Their periods were fine: JUP365 tabulates anomalistic periods, and the catalog reads them that way.
  The real defect is that their periapses *regress* (Laplace resonance, 2n_E − n_I = −0.7395 °/d), while the catalog
  assumed prograde precession.
- **Triton.** The defect is its node, which is *prograde* (retrograde orbit; measured 677.6 yr period). The table has
  −105.76 °/cy. Every period-only change made Triton worse.
- **Fix location.** Both moon fixes are measured overrides in `catalog.ts` (`MEASURED_ORBITS`), so regenerating
  `moons.json` cannot undo them. Ganymede and Callisto were already right.
- **Lambert "hyperbolic floor".** This came from the 0.25-wide z grid stepping over the y = 0 boundary, not from the
  −40 limit.

## Behaviour changes to review

- **Earth is now the geocentre everywhere.** `propagateKeplerOrbit` applies an optional `barycentreCompanion`, so every
  caller moves: model, scene nodes, orbit lines and local renderer. The shift is ~4,700 km. The planet gate's Earth
  truth is now Horizons 399.
- **Lambert returns solutions it used to reject.**
  - It returns very short time-of-flight hyperbolic arcs and multi-rev arcs on request.
  - It now returns `None` for arcs passing periapsis inside `min_periapsis_au`. The default is the solar radius, to
    match the default `mu`; callers using another central body must pass their own.
  - The 0-rev result is unchanged for every existing reference case.
- **Two owner-written tests were rewritten.** `test_lambert_solver_rejects_unbracketed_short_tof` and
  `test_original_short_tof_wrapper_regression_fails_explicitly` asserted `None` for 0.1–10 d transfers. Those solutions
  exist, so the tests now assert they are bracketed and certified. The explicit-`None` contract is now tested on arcs
  that pass through the Sun.
- **Mission.**
  - Returned payload is capped by the cargo the return burn can carry.
  - `payload_return_closure` takes a required `return_capacity_kg`.
  - `run_monte_carlo` takes a `reclose` callable in place of `base_propellant_margin_kg`.
- **Benchmark.** `meanAbsErrorKmS` and `passRate` are `null` when nothing is compared. A new `fixedStateReferences`
  block is added; the legacy window rows are unchanged.
- **AGN observer-frame switch.** It stays wired but no longer alters the front's timing, because arrival at the
  observer does not depend on the frame. Removing the switch means editing `main.ts` and `index.html`, which are being
  changed on `fix/solar-display-truth`.
- **Moon gate.** Io, Europa, Ganymede, Callisto and Triton lose their `DATA_LIMITED` exemptions; their budgets are now
  2× measured instead of up to 2.7e6 km.

## Verification

Results on the branch as built on `17d1e63`:

- `npm test`: 325 passed. The 1 failure was already failing on `17d1e63`; `main` fixed it since (#2).
- `pytest` (backend): 2,162 passed. The 2 failures were already failing on `17d1e63` (the stale `wall_jd`
  tests), which `main` fixed since (#2).
- `tsc --strict`: 219 errors against 221 on `17d1e63`; none are new.
- `npm run verify:planet-positions` (54 rows, now including Pluto) and `npm run verify:moon-frames` (140 rows) both
  pass.
- Independent cross-checks:
  - JPL Horizons, live, for Pluto, Earth (399 / 3) and dense 61-epoch moon sets.
  - lamberthub `izzo2015` for Lambert.
  - An independent Standish evaluation for Pluto.
  - An RK4 two-body propagation closing the M = 2 Lambert arc to < 50 km.

## Not in this PR

- **Frontend Hathaway fallback.** `sunController.ts:97-102` has the same c = 0 normaliser bug. It was left for
  `fix/solar-display-truth`, which owns that file.
- **Dione and Rhea.** They are offset by roughly half an orbit, constant in time, because of their element data.
- **Retrograde irregular moons.** 287 of them still assume regressing nodes. This can't be measured under their 2–4%
  mean-motion errors, and moons are not rendered.
- **MGA search quality.** The 09-24 audit's M-4: the planner rarely finds assists.
- **CME speeds.** They are a log-normal distribution in the gap plan; here they are a deterministic envelope.
- **Legacy benchmark window rows.** Still incomparable.
- **GLSL belt Kepler solver.** It has the same E0 = M start, but its data is main-belt only (e < 0.4).

## Test plan

- [ ] CI on this PR (runs against the merge with `main`)
- [ ] `npm test`
- [ ] `npm run verify:planet-positions && npm run verify:moon-frames`
- [ ] `cd backend && pytest -q`
- [ ] Open the app: Earth and the planets render as before, and the AGN event's front lands when the GW channel fires.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
