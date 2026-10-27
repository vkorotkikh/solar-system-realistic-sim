# B044 Synthetic Dipole Phase Plan

**Goal:** Evolve the synthetic magnetogram's tilted dipole at the solar sidereal rate in the declared fixed J2000 frame.

**Scope:** `backend/sim/pfss_magnetogram.py` and focused PFSS/solar-region tests. Active-region motion, observed GONG maps, frontend frame evolution, and feature lifetimes are unchanged.

## Contract

- The tilted component has zero phase at J2000 and advances at `14.1844 deg/day`.
- Positive time advances positive longitude: `cos(phi - phase)`.
- Axisymmetric dipole, quadrupole, and octupole components are unchanged.
- Zero activity remains epoch invariant.
- Synthetic snapshot/cache identity advertises `synthetic-persistent-bipoles-v3`; v2 identifiers are rejected.

## TDD evidence

- Baseline: the four focused modules passed 790 tests before B044.
- RED: the focused new selection produced 4 failures and 3 passes. Quarter, half, and negative-quarter phase maps remained frozen, and the snapshot still advertised transform v2.
- GREEN: all 7 focused new cases pass after adding the inertial sidereal phase and version bump.

## Verification

- [x] Independent literal-rate map-roll and harmonic coefficient oracle.
- [x] J2000 compatibility, full-cycle wrap, and zero-activity invariance.
- [x] Snapshot reuse, changed-epoch identity, v3 literal, and v2 rejection.
- [x] Run the full four-module PFSS verification: 797 passed in 11.86s; `git diff --check` clean.
- [x] Independent review found no Critical or Important issues.
