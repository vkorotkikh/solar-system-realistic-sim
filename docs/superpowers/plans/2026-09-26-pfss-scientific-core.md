# PFSS Scientific Core Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the numerically invalid PFSS harmonic, grid, tracing, and wind-mapping path with one explicit, independently tested scientific core.

**Architecture:** One NumPy-only harmonic module owns the Schmidt quasi-normalized basis and derivatives. Magnetograms carry an explicit spherical grid, PFSS evaluation consumes the shared basis, tracing exposes three terminal states with exact spherical-boundary intersections, and the WSA-inspired mapper consumes only exact radial-field values from valid open traces. Provider provenance, process isolation, API V2, security, browser delivery, and release automation remain separate follow-up plans because they have independent interfaces and rollback boundaries.

**Tech Stack:** Python 3.12.13, NumPy, Pytest; SciPy only in an offline fixture generator.

**Spec:** `agent-notes/R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md`

## Global Constraints

- Use `Pbar_l^m(x) = sqrt((2-delta_m0)(l-m)!/(l+m)!) P_l^m(x)` with no Condon-Shortley phase and version it as `schmidt-quasi-normalized-no-cs-v1`.
- Production code must not import SciPy or derive expected test values from production algorithms.
- Add and run a failing behavior test before each production fix; retain RED and GREEN command evidence in the implementer report.
- GONG/synthetic grid geometry must be explicit. Never silently interpret a sine-latitude array as uniform colatitude.
- Apply Schmidt normalization exactly once; no additional `epsilon_m=2` multiplier is permitted.
- The PFSS source surface is radial: `Btheta=Bphi=0`; `Br` is generally nonzero.
- Trace states are exactly `open`, `closed`, and `indeterminate`; exhaustion, nulls, non-finite values, and stalls are never `closed`.
- Open/closed endpoints must be interpolated to `Rss`/`Rsun` with radial residual `<=1e-6 Rsun`.
- Expansion uses exact radial components at exact boundaries. Unavailable/indeterminate cells remain unavailable and never become a hard-coded speed.
- Do not weaken the numerical tolerances in the implementation prompt to accommodate production output.
- Every task runs its focused tests and `PYTHONPATH=backend /home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python -m pytest -q backend/tests` before commit.

## Review Focus

- Pole and near-pole inputs: Task 1 tests exact limits and finite Cartesian continuity instead of hiding singularities with a `sin(theta)` floor.
- Grid row order and shape mismatch: Task 2 rejects ambiguous/mismatched grids and proves north-to-south and south-to-north canonicalization.
- Pure non-axisymmetric modes: Task 2 proves cosine and sine recovery without the old factor-of-two error.
- Weak, non-finite, stalled, and budget-exhausted traces: Task 4 proves each becomes `indeterminate` and cannot enter a coronal-hole boundary.
- Sparse source-surface coverage: Task 5 proves distant/uncovered lookup remains unavailable and does not silently produce 380/400 km/s.

---

### Task 1: Shared Schmidt Harmonic Basis and Immutable Oracle

**Files:**
- Create: `backend/sim/spherical_harmonics.py`
- Create: `backend/tests/test_pfss_harmonics.py`
- Create: `backend/tests/fixtures/pfss/harmonics_schmidt_v1.json`
- Create: `scripts/generate_pfss_harmonic_fixture.py`
- Create: `docs/adr/0001-pfss-harmonic-convention.md`
- Modify: `backend/sim/pfss_magnetogram.py`

**Interfaces:**
- Consumes: NumPy arrays/scalars containing `mu = cos(theta)`.
- Produces: `HARMONIC_CONVENTION_VERSION`, `schmidt_legendre(lmax, mu)`, and `schmidt_legendre_with_theta_derivative(lmax, mu)`, returning dictionaries keyed by `(l, m)` with arrays matching `mu.shape`.
- Produces: legacy `_associated_legendre`, `PFSSField._legendre_at_point`, and `PFSSField._legendre_batch` as thin delegates to the shared implementation.

- [ ] **Step 1: Add failing basis/oracle tests**

  Add tests for the exact low-degree zonal values at `x=0.5`, every `(l,m)` through 15 at `x={-0.9,-0.5,0,0.5,0.9}` from the immutable fixture, 64-point Gauss-Legendre orthogonality, scalar/batch identity, derivatives away from poles, pole limits, and several-longitude Cartesian continuity. Assert the spec tolerances (`1e-14`, `5e-13*max(1,abs(ref))`, `2e-12`, `1e-13`, and `1e-8`, respectively).

- [ ] **Step 2: Run the focused tests and record RED**

  Run: `PYTHONPATH=backend /home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python -m pytest -q backend/tests/test_pfss_harmonics.py`

  Expected: numerical assertion failures reproducing the mixed-normalization recurrence, including `P2(0.5) != -0.125`; import/collection failure alone is not acceptable red evidence.

- [ ] **Step 3: Add the independent fixture generator and provenance**

  `scripts/generate_pfss_harmonic_fixture.py` must use locked SciPy `special.lpmv`, explicitly remove the Condon-Shortley phase, independently apply the stated factorial normalization, record Python/NumPy/SciPy versions plus generator SHA-256, and never import `backend.sim` or `sim`. Tests consume the checked-in JSON without importing SciPy.

- [ ] **Step 4: Implement the shared recurrence and derivatives**

  Use one recurrence for values and its analytic theta derivative. Validate `0 <= lmax <= 64`, finite `mu`, and `mu in [-1,1]`; preserve arbitrary NumPy input shape. Do not clip invalid inputs into validity. Remove duplicated recurrence bodies by delegation.

- [ ] **Step 5: Run GREEN and regressions**

  Run the focused command from Step 2, then the full backend command in Global Constraints. Expected: all new nodes pass; existing tests remain green with no new skips/warnings.

- [ ] **Step 6: Commit**

  Commit message: `fix(pfss): unify the normalized harmonic basis`

### Task 2: Explicit Equal-Area Grid and Stable Harmonic Decomposition

**Files:**
- Create: `backend/sim/magnetogram_grid.py`
- Create: `backend/tests/test_pfss_decomposition.py`
- Create: `docs/adr/0002-magnetogram-grid-and-projection.md`
- Modify: `backend/sim/pfss_magnetogram.py`
- Modify: `backend/tests/test_solar_physics_model.py`

**Interfaces:**
- Consumes: Task 1 `schmidt_legendre`.
- Produces: immutable `MagnetogramGrid(mu: np.ndarray, phi_rad: np.ndarray, row_order: Literal["north_to_south", "south_to_north"], convention: str)` with validated factories `equal_area_sine_latitude_grid(n_lat, n_lon, row_order=...)` and `uniform_colatitude_grid(...)`.
- Produces: `decompose_spherical_harmonics(br_map, lmax, *, grid, condition_limit=1e6)`; grid is required and shape mismatches fail.
- Produces: `synthetic_magnetogram(..., *, grid=None)` on the canonical equal-area grid by default.

- [ ] **Step 1: Add failing grid and pure-mode tests**

  Test explicit row-order canonicalization, shape/finite validation, the axial dipole on a GONG-style sine-latitude grid, every isolated real cosine/sine mode through `l=15`, mixed band-limited reconstruction, condition-number fail-closed behavior, and both observed-array and synthetic ingestion. Require target error/leakage/reconstruction `<=1e-10` and mixed reconstruction RMS `<=1e-9`.

- [ ] **Step 2: Run the focused tests and record RED**

  Run: `PYTHONPATH=backend /home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python -m pytest -q backend/tests/test_pfss_decomposition.py`

  Expected: the old path produces approximately `g10=0.75` for the sine-latitude dipole and `g11=2` for an equatorial dipole.

- [ ] **Step 3: Implement explicit grids and weighted QR/least-squares projection**

  Fourier-project each uniform-longitude row, then solve each order's latitude basis with area weights appropriate to the explicit grid. On equal-area `mu` cells, do not apply `sin(theta) dtheta`. Compute and enforce the design-matrix 2-norm condition limit. Apply no post-Schmidt `epsilon_m` multiplier.

- [ ] **Step 4: Route all production callers through explicit grids**

  Give synthetic generation canonical `mu` centers. Mark the legacy fetched GONG array with its documented sine-latitude geometry without claiming unverified WCS orientation; the later provider plan must replace this interim metadata with FITS/WCS-derived orientation. Update importance-seeding inputs so it does not reapply a uniform-theta area factor to an equal-area grid.

- [ ] **Step 5: Run GREEN and regressions**

  Run the focused command from Step 2 and the full backend command. Expected: specified recovery tolerances pass and no caller uses an implicit grid.

- [ ] **Step 6: Commit**

  Commit message: `fix(pfss): honor sine-latitude magnetogram geometry`

### Task 3: Lock PFSS Radial and Boundary Mathematics

**Files:**
- Create: `backend/tests/test_pfss_analytic_fields.py`
- Create: `docs/adr/0003-pfss-source-surface-boundary.md`
- Modify: `backend/sim/pfss_magnetogram.py`

**Interfaces:**
- Consumes: Tasks 1-2 coefficients and shared basis.
- Produces: `PFSSField.evaluate`/`evaluate_cartesian_batch` whose photospheric radial field reconstructs the declared coefficients and whose source surface has zero tangential field.

- [ ] **Step 1: Add analytic field tests**

  For every degree `1..15` and representative `m`, test cosine/sine `Br`, `Btheta`, `Bphi` and radial attenuation at `r=1`, `r=Rss`, and three interior radii. Add source-surface tangential relative/absolute RMS and maximum gates (`<=1e-11` relative), finite-difference divergence/curl convergence (`<=1e-6` normalized), and photospheric reconstruction tests.

- [ ] **Step 2: Run the focused tests and record RED or verified pre-correct behavior**

  Run: `PYTHONPATH=backend /home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python -m pytest -q backend/tests/test_pfss_analytic_fields.py`

  The false `Br=0` contract must fail as documentation/contract evidence even if the existing radial factors pass. Do not change correct factors merely to manufacture a numerical red.

- [ ] **Step 3: Correct the boundary contract and any independently demonstrated factor defects**

  State that the source surface enforces `Btheta=Bphi=0` and preserves radial flux. Keep the radial formulas only when the analytic tests prove them; make any required sign/factor fix minimal and explicit.

- [ ] **Step 4: Run GREEN and regressions**

  Run the focused command and full backend command. Expected: all analytic gates pass.

- [ ] **Step 5: Commit**

  Commit message: `test(pfss): certify radial boundary mathematics`

### Task 4: Three-State Tracing with Exact Boundary Intersections

**Files:**
- Create: `backend/sim/pfss_tracing.py`
- Create: `backend/tests/test_pfss_tracing.py`
- Modify: `backend/sim/pfss_magnetogram.py`
- Modify: `backend/tests/test_solar_physics_model.py`

**Interfaces:**
- Consumes: `PFSSField.evaluate_cartesian` and `evaluate_cartesian_batch`.
- Produces: `TraceState = Literal["open", "closed", "indeterminate"]`, `TraceTermination(state, reason, steps, endpoint_radius_residual)`, and exact line/sphere segment intersection helpers shared by scalar and batch tracers.
- Produces: each public field-line dictionary with `state`, nullable compatibility `is_open`, `termination_reason`, full-precision physical endpoint metadata, and separately rounded display `arc`.

- [ ] **Step 1: Add failing termination tests**

  Drive deterministic analytic field stubs to test outer crossing, inner return, max-step exhaustion, zero/stalled field, NaN/Inf field, and invalid RK stages. Assert exact-boundary residual `<=1e-6`, exhaustion/null/nonfinite are `indeterminate`, and rounded display points do not feed physics.

- [ ] **Step 2: Run the focused tests and record RED**

  Run: `PYTHONPATH=backend /home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python -m pytest -q backend/tests/test_pfss_tracing.py`

  Expected: old exhaustion reports closed and an open endpoint overshoots `Rss` (the audited dipole reached about `2.51628` for `Rss=2.5`).

- [ ] **Step 3: Implement shared three-state termination**

  Reject non-finite RK stages, distinguish weak/stalled direction from a closed return, solve the segment/sphere quadratic for the first valid crossing, and evaluate/store the endpoint at exactly the selected boundary. Count `closed` only from explicit inner crossings; do not infer it from `not open`.

- [ ] **Step 4: Update payload consumers**

  Update PFSS summary counts to expose open/closed/indeterminate separately. Preserve `is_open` only as `True`, `False`, or `None` derived from state so indeterminate cannot masquerade as closed.

- [ ] **Step 5: Run GREEN and regressions**

  Run the focused command and full backend command. Expected: all state and residual gates pass.

- [ ] **Step 6: Commit**

  Commit message: `fix(pfss): classify traces at exact boundaries`

### Task 5: Radial Expansion and Honest WSA-Inspired Availability

**Files:**
- Create: `backend/tests/test_wsa_semantics.py`
- Create: `docs/adr/0004-wsa-inspired-semantics.md`
- Modify: `backend/sim/pfss_magnetogram.py`
- Modify: `backend/sim/solar_physics.py`
- Modify: `backend/tests/test_solar_physics_model.py`
- Modify: `backend/tests/test_solar_physics_api.py`

**Interfaces:**
- Consumes: Task 4 exact trace endpoints/states.
- Produces: expansion `fs = (Rsun/Rss)^2 * abs(Br(Rsun)) / abs(Br(Rss))` only for valid open traces.
- Produces: `wsa_velocity_at_source_surface(...) -> float | None` with a declared maximum interpolation distance; no sample or distant sample returns `None`.
- Produces: result metadata `model="wsa_inspired_v1"`, valid/indeterminate/coverage fractions, nullable mean velocity, and explicit quality reasons.

- [ ] **Step 1: Add failing expansion/availability tests**

  Test a radial inverse-square tube (`fs=1` to `1e-12`), exact boundary evaluation, invalid/zero denominators, `_wsa_velocity` NaN/Inf rejection, all-open/all-closed/no-boundary/neutral/exhausted inputs, lookup distance limits, rotation invariance, and empty-map behavior. Prove no path returns 380/400 solely because data are absent.

- [ ] **Step 2: Run the focused tests and record RED**

  Run: `PYTHONPATH=backend /home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python -m pytest -q backend/tests/test_wsa_semantics.py`

  Expected: old code yields about `fs=0.99403876` for the radial tube, `349.5` for NaN inputs, and 380/400 km/s for unavailable data.

- [ ] **Step 3: Implement radial expansion and quality semantics**

  Use signed radial evaluations at exactly `Rsun` and `Rss`, absolute values only in the ratio, and leave invalid cells NaN/unavailable. Exclude indeterminate traces from both open and closed boundary sets. A map with no valid boundary has an explicit quality outcome, not an invented distance or speed.

- [ ] **Step 4: Enforce bounded source-surface lookup**

  Require finite theta/phi/velocity, include `ss_phi` validation, cap acceptance at two target-cell diagonals, return `None` when uncovered, and propagate that state through Parker assembly without labeling it WSA-derived.

- [ ] **Step 5: Rename the delivered model honestly**

  Use `wsa_inspired_v1` consistently in internal metadata and public payloads until Schatten/current-sheet and heliospheric propagation stages are implemented and independently validated.

- [ ] **Step 6: Run GREEN and regressions**

  Run the focused command and full backend command. Expected: all semantic tests pass and existing API/model tests use explicit availability rather than defaults.

- [ ] **Step 7: Commit**

  Commit message: `fix(solar): make WSA-inspired output scientifically explicit`

### Task 6: Scientific-Tranche Evidence and Status Reconciliation

**Files:**
- Modify: `agent-notes/R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md`
- Modify: `agent-notes/SUNFOCUS_REGRESSION_STATUS_AND_FIX_PLAN_2026-09-25.md`

**Interfaces:**
- Consumes: Tasks 1-5 commits and test evidence.
- Produces: an exact current status that marks only demonstrated mechanisms fixed and leaves provider, acquisition, coordinator, security, browser, and R4 release lanes open.

- [ ] **Step 1: Correct the baseline language**

  Replace “divergent recurrences” with “duplicated implementations of the same incorrect mixed-normalization recurrence”; record that the source-surface implementation already enforced tangential zero while its docstring was wrong; preserve the already-fixed exact cache/single-flight/permit facts.

- [ ] **Step 2: Record fresh evidence**

  Add exact commit IDs, focused/full commands, node/pass counts, fixture/generator hashes, and any remaining numerical or product limitations. Do not claim full R3/R4 closure.

- [ ] **Step 3: Verify the integrated scientific tranche**

  Run the five focused files together, the full backend suite, and `git diff --check`. Expected: clean output, no new skip/xfail, and a clean worktree after commit.

- [ ] **Step 4: Commit**

  Commit message: `docs(pfss): record scientific core remediation evidence`

## Follow-Up Plan Boundaries

After this plan passes review, continue without declaring R3/R4 closed using separate plans in this dependency order:

1. bounded Astropy FITS/WCS GONG provider, source snapshots, Carrington/time/unit provenance, and immutable provider fixtures;
2. scientific identity/cache layers, independent `sunkit-magex` corpus, and production truncation/convergence gates;
3. snapshot coordinator, supervised subprocess isolation, V2 route contract, and cache-hit bypass;
4. network-profile authentication/proxy/admission/state bounds and deployment topology;
5. browser V2 delivery/AIA decoupling plus R4 pinned CI, red-green, mutation, Playwright, load, rollout, and runbook evidence.

