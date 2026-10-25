# B038 Kepler Velocity Gate Implementation Plan

> **For agentic workers:** Use mutation-driven test development and leave the change uncommitted for the parent agent's one-bug atomic commit.

**Goal:** Make every catalog orbit that uses the non-secular Kepler propagator prove that its returned velocity is the derivative of its returned position and has the correct two-body magnitude.

**Architecture:** Add a backend test over the production `ALL_BODIES` catalog, dynamically selecting every body with an orbit and no `secular_rates`. Call the shipped `propagate_kepler_orbit` directly. Compare velocity to an independent five-point central difference of position, then compare its norm to the Sun-centered vis-viva equation.

**Tech Stack:** Python 3.12, pytest, standard-library `math`.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B038.

## Constraints

- Fix the B038 test gap only; do not change orbital production code.
- Cover all current and future catalog bodies that take the non-secular branch.
- Use an elapsed time away from anomaly wrapping and a step scaled to each orbital period.
- Check the velocity vector direction with a five-point central difference and its magnitude independently with vis-viva.
- Demonstrate that the reported `vz` sign mutation is killed.
- Run the focused test and full backend suite, then leave the B038 files uncommitted.

### Task 1: Gate non-secular Kepler velocity

**Files:**
- Add: `backend/tests/test_kepler_velocity.py`

- [ ] Parameterize the production catalog's non-secular orbit definitions with readable body IDs.
- [ ] At `0.137 * period_days`, compute the production position and velocity.
- [ ] Approximate `d(position)/dt` with samples at `t ± h` and `t ± 2h`, where `h = 1e-4 * period_days`, and assert a tight vector-relative error.
- [ ] Assert `|v|² = μ(2/r - 1/a)` using `MU_SUN_AU3_DAY2`.
- [ ] Temporarily flip the production `vz` sign, run the focused test to record the intended failure, then restore production unchanged.
- [ ] Run focused and full backend tests plus `git diff --check`.
