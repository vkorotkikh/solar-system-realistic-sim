# B042 Risk-Sized Cargo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve enough delta-v dispersion margin when selecting return cargo that a nominally closable mission is not rejected merely because every above-nominal Monte Carlo sample exceeds the exact closure boundary.

**Architecture:** Keep the bounded B010 cargo bisection unchanged, but give it a design burn schedule derived from the configured risk threshold and the risk model's default delta-v sigma: `1 + NormalDist().inv_cdf(1 - threshold) * (0.01 + 0.04)`. At thresholds at or above 0.5, cargo sizing uses nominal burns; at zero or below, it uses the largest finite quantile below one. Reclose and report the selected cargo against nominal burns as before, then run the existing Monte Carlo verification. Define the shared dispersion defaults and design factor in `RiskService` so sizing and simulation cannot silently drift.

**Tech Stack:** Python 3.12, deterministic staged rocket equation, seeded Monte Carlo, pytest.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B042 at lines 313-319.

## Global Constraints

- Fix B042 only; do not change the B010 bisection loop, stage physics, reserve accounting, mining output, random sampling order, or verifier threshold semantics.
- Use strict TDD: add deterministic capacity and seeded-risk regressions, observe that nominal maximum cargo has roughly 50% delta-v failure risk, then change production code.
- Size cargo at the configured verifier risk threshold using the existing default combined delta-v sigma of 0.05. A 5% threshold reproduces the report's 1.645-sigma margin; the default 45% threshold uses a smaller 0.12566-sigma margin.
- Centralize the Monte Carlo default sigma fractions and threshold-aware cargo design factor in `RiskService`; the simulation defaults and sizing factor must derive from the same values.
- Apply the design factor only to the cargo-capacity search. Final nominal budget telemetry and requested burn delta-v values must remain nominal.
- Preserve `None` when even zero cargo cannot close at the design burns, and preserve available-cargo caps.
- Preserve B010's finite-bound and floating-point progress guarantees; perform exactly one bounded cargo search per candidate, not one search per risk sample.
- Expose the applied factor as logistics telemetry so the reduced cargo capacity is auditable.
- Produce exactly one atomic B042 commit, including tests and this plan.
- Run tests under Python `3.12.13` from `/tmp/solar-sim-py312/bin/python` with `PYTHONPATH=backend`.

## Review Focus

- The pre-fix nominal maximum is feasible at 1.0x but fails under an arbitrarily small positive delta-v perturbation and produces approximately 0.5 failure probability.
- The post-fix cargo is strictly lighter, closes at the threshold-aware design factor, and produces seeded failure probability at or below the configured verifier threshold.
- `totalRequestedDeltaV_km_s`, per-burn telemetry, and nominal propellant use are not inflated by the sizing factor.
- Risk-service default arguments and the cargo-sizing factor share constants rather than duplicated numeric literals.
- Infinite/huge available cargo still terminates under the B010 tests.

---

### Task 1: B042 size return cargo at dispersed delta-v

**Files:**
- Modify: `backend/mission/risk_service.py`
- Modify: `backend/mission/agents.py`
- Modify: `backend/tests/test_mission_mass_flow.py`
- Modify: `backend/tests/test_mission_propulsion_contract.py`

- [x] **Step 1: Write failing design-margin regressions**

In `test_mission_mass_flow.py`, use the default vehicle, a 6,500 kg payload, burns `[2.0, 1.5]`, cargo loaded before the second burn, and 5% protected reserves. Prove the current nominal maximum cargo is feasible at nominal delta-v but infeasible at `1.0001x`, and prove its seeded 5,000-sample risk is approximately 0.47. Add assertions for the shared threshold-aware cargo design factor, including 5%, 45%, and finite boundary behavior.

In `test_mission_propulsion_contract.py`, exercise `LogisticsAgent.evaluate` with a four-event schedule whose cargo load occurs at burn index 2. Compare its selected cargo with the nominal capacity, require the smaller selected cargo to close under all burns scaled by the shared design factor, require seeded failure probability at or below the configured bound, and assert nominal burn/total telemetry remains unchanged. Also assert the applied factor is reported. Add the report's 22-ton end-to-end fixture at the default threshold.

- [x] **Step 2: Run the regressions to verify RED**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_mission_mass_flow.py \
  backend/tests/test_mission_propulsion_contract.py
```

Expected: nominal-boundary evidence passes, but the shared design factor/telemetry is absent and `LogisticsAgent` returns the larger nominal cargo with approximately 50% risk.

- [x] **Step 3: Centralize risk dispersion defaults**

In `risk_service.py`, define named defaults for ephemeris, thrust, and extraction sigma fractions. Use those constants as `run_monte_carlo` defaults. Add a small class/static method or property that returns the threshold-aware cargo delta-v design factor from the combined default delta-v sigma.

- [x] **Step 4: Size cargo against design burns and preserve nominal telemetry**

In `LogisticsAgent.evaluate`, accept the verifier threshold, derive `design_burns = burns * RiskService cargo factor` and pass only those burns to `max_closable_cargo_kg`. Reclose the returned cargo with the original nominal burns exactly as today. Add `cargoSizingDeltaVFactor` to the returned logistics budget and decision-log metrics.

- [x] **Step 5: Run focused and backend verification**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_mission_mass_flow.py \
  backend/tests/test_mission_propulsion_contract.py \
  backend/tests/test_mission_agents.py \
  backend/tests/test_server_validation.py
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests
git diff --check
```

Expected: all focused and backend tests pass, including B010's bounded bisection regressions, and `git diff --check` is silent.

> Verification note (2026-10-23): the original fixed-p95 design failed the
> report's 22-ton fixture with `no_verified_candidate` and zero cargo. The
> amended threshold-aware design passed 58 focused tests and `git diff --check`
> was silent. Two full backend runs each passed 3,855 tests and skipped 13;
> each encountered two unrelated deadline-sensitive failures under whole-suite
> load, and all four failed cases passed immediately when rerun in isolation.

- [x] **Step 6: Commit B042 atomically**

```bash
git add docs/superpowers/plans/2026-10-23-b042-risk-sized-cargo.md \
  backend/mission/risk_service.py backend/mission/agents.py \
  backend/tests/test_mission_mass_flow.py backend/tests/test_mission_propulsion_contract.py
git commit -m "fix(mission): reserve cargo delta-v margin (B042)"
```
