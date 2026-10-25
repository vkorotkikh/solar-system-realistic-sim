# B013 Kuiper Test-Particle `N_active` Implementation Plan

**Goal:** Configure REBOUND's active-particle boundary after creating the massive Solar-System prefix so massless Kuiper particles do not participate in mutual force evaluation.

**Architecture:** `KuiperBeltEngine.activate()` already records the massive prefix in `_massive_count` before it creates particle and binary-companion suffixes. Assign that count to `sim.N_active` at this boundary. Keep all generated KBOs massless and preserve the existing deactivate/reactivate lifecycle.

**Tech Stack:** Python 3.12, REBOUND, pytest.

## Constraints

- Scope is B013 only; do not change particle generation, orbital sampling, binary construction, or integrator settings.
- `N_active` must be 2 with neither optional planet, 3 with either Jupiter or Saturn alone, and 4 with both.
- The massive prefix remains positive-mass and every generated particle, including binary companions, remains massless.
- Prove through real `activate()` calls, not a mocked REBOUND simulation; cover deactivation and reactivation.
- Use physical-state equivalence, not a performance-timing assertion, to guard the REBOUND semantic boundary.
- Verify with `PYTHONPATH=backend /tmp/solar-sim-py312/bin/python`.
- Do not commit until independent review is requested and complete.

## Review Focus

- The assignment must occur only after all massive bodies and before the first massless particle.
- Optional massive-body combinations must have the exact expected boundary and preserve ordering.
- The lifecycle reset must not leave stale state after `deactivate()` or a second `activate()`.
- Treating massless particles as active versus test particles must have equivalent physical state over a short deterministic integration.

### Task 1: Set the REBOUND massive-prefix boundary

**Files:**
- Modify: `backend/sim/kuiper.py`
- Modify: `backend/tests/test_kuiper_binary.py`
- Create: `.superpowers/sdd/2026-10-23-b013-kuiper-n-active/{progress.md,task-1-brief.md}`

- [x] **Step 1: Add real-initialization RED coverage**

Exercise all optional Jupiter/Saturn combinations with deterministic binary companions. Assert exact `N_active`, a positive-mass prefix, a massless suffix, proper binary-pair indexing, deactivate/reactivate reset behavior, and a short physical-state equivalence reference without `N_active` optimization.

- [x] **Step 2: Run RED**

Run the new focused N-active tests. Expected: the current engine leaves REBOUND's default active boundary in place rather than matching `_massive_count`.

Result: 5 failed and 1 passed in 0.13s. All four optional-perturber cases and
the reactivation case observed REBOUND's default `N_active` value
`18446744073709551615`, not the expected 2/3/3/4 counts; the independent
short-step physical-equivalence control passed.

- [x] **Step 3: Apply the minimal boundary assignment**

Set `self.sim.N_active = self._massive_count` immediately after validation of the completed massive prefix and before test-particle generation.

- [x] **Step 4: Run GREEN and the focused suite**

Run the new tests, then:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests/test_kuiper_binary.py backend/tests/test_kuiper_velocity_units.py backend/tests/test_kuiper_subscription_ordering.py
git diff --check
```

Result: `test_kuiper_binary.py -k ActiveParticleBoundary` passed 6 tests in
0.08s. The required three-module suite passed 46 tests in 7.69s; `git diff
--check` was clean.

- [x] **Step 5: Record results and request independent review**

Record RED/GREEN and focused-suite evidence in this plan and the ignored SDD ledger; leave the B013 change uncommitted for review.

Result: evidence recorded; independent review requested before committing.

- [x] **Step 6: Complete independent review**

An independent reviewer inspected the full production/test diff, the installed
REBOUND 5.1.1 semantics, optional-body ordering, lifecycle behavior, and test
stability. No Critical, Important, or non-blocking findings were reported. The
reviewer reran the focused suite (46 passed), repeated the six boundary tests
five times (30/30 passed), and observed a 20.1x speedup with zero state delta in
an independent 1,002-particle comparison.

- [x] **Step 7: Create the atomic B013 commit**

The production change, regression coverage, and this plan are committed
together as `fix(dynamics): mark Kuiper particles inactive (B013)`.
