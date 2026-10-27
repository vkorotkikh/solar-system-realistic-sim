# B046 Single Lifetime Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply each active region's lifetime envelope exactly once and consistently to coronal feature ranking, thermodynamics, geometry, speed, brightness, and serialized emergence.

**Architecture:** Keep emergence and eruption as intrinsic phase signals while a region is alive, with `(0, 0)` retained for dormant regions. Apply the lifetime envelope at each delivered-output boundary after its existing physical clamp, so every visible/dynamic quantity fades coherently and the full-envelope output remains unchanged.

**Tech Stack:** Python 3.12, NumPy, pytest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B046), plus the task's approved coherent-design constraints

## Global Constraints

- Modify only `backend/sim/solar_physics.py`, focused tests, this plan, and this plan's ignored SDD ledger.
- `_feature_temporal_state` returns intrinsic emergence/eruption for every positive envelope and `(0, 0)` for a dormant envelope.
- `_feature_score` retains its single outer lifetime-envelope multiplication.
- Clamp magnetic field first, then multiply by the lifetime envelope before deriving temperature and Alfvén speed; do not restore a 12 G floor after fading.
- Clamp peak first, then apply `1 + (peak - 1) * envelope`; multiply width and the already-clamped family speed by the envelope.
- Keep the existing final brightness multiplication and serialize `emergence * envelope`.
- Preserve full-envelope output and the existing CME speed distribution.
- Verify with `PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest` and leave the work uncommitted for independent review.

## Review Focus

- Small positive envelopes must not alter intrinsic phase before output fading; test `1`, `.5`, `.25`, and `.02` explicitly.
- A zero envelope must retain dormant `(0, 0)` timing and omit features from `sample_state`.
- The delivered field and Alfvén speed must fade together, including below 12 G at low envelope.
- CME speed, height above one solar radius, width-derived arc displacement, brightness, and serialized emergence must each scale once rather than remain unfaded or scale twice.
- The `E=1` path and broad slow/fast CME distribution must remain unchanged.

---

### Task 1: Make lifetime fading coherent across coronal features

**Files:**
- Modify: `backend/sim/solar_physics.py:397-688`
- Modify: `backend/tests/test_solar_region_consistency.py`

**Interfaces:**
- Consumes: `region_lifetime(region, jd) -> (envelope, birth_jd, lifetime_days)` and the existing intrinsic phase formulas.
- Produces: unchanged feature schema with coherently faded numeric fields and dormant feature omission.

- [x] **Step 1: Add controlled-envelope regression tests**

Add production-path tests using envelopes `1.0`, `0.5`, `0.25`, `0.02`, and `0.0` that establish:

- positive envelopes return the same intrinsic emergence/eruption, while zero returns `(0, 0)`;
- score is proportional to exactly one envelope;
- field, Alfvén speed, clamped family speed, peak height above one, brightness, serialized emergence, and arc displacement are proportional to exactly one envelope;
- the low-envelope field may fall below 12 G, `E=1` output stays unchanged, and zero-envelope geometry collapses;
- a dormant population is omitted from `sample_state`.

- [x] **Step 2: Run the new tests and verify RED**

Run the named B046 tests from `backend/tests/test_solar_region_consistency.py`.

Expected: failures show pre-scaled intrinsic phase, squared score/field effects, and unfaded speed/extent.

- [x] **Step 3: Apply the minimal production fix**

In `SolarCoronaPhysicsModel`:

- gate `_feature_temporal_state` on `envelope <= 0`, otherwise return intrinsic phase values;
- leave `_feature_score`'s final envelope multiplication intact;
- after peak clamp, apply envelope to height above one and to width;
- after the family-specific speed clamp, multiply speed by envelope;
- keep field fading before derived thermodynamics and the existing final brightness fade;
- serialize emergence after multiplying it by the envelope.

- [x] **Step 4: Run focused and baseline verification**

Run the B046 tests, then:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_solar_region_consistency.py \
  backend/tests/test_solar_physics_model.py \
  backend/tests/test_solar_numerical_policy.py
```

Expected: all tests pass, including the existing CME speed-distribution test.

- [x] **Step 5: Review scope and hand off uncommitted**

Inspect `git diff --check`, the complete diff, and `git status --short`; update this plan and its ignored ledger with RED/GREEN evidence. Do not commit before independent review.

## Result

- RED: `7 failed, 4 passed, 13 deselected`; failures exposed pre-faded alive phase and unfaded CME speed/geometry.
- Targeted GREEN: `11 passed, 13 deselected in 0.34s`.
- Focused GREEN: `145 passed in 15.17s` across the three baseline modules, including the existing CME speed-distribution gate.
- Scope: one production file, one test file, and this plan; left uncommitted for independent review.
