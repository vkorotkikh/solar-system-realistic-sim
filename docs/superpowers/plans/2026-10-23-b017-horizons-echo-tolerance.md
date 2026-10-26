# B017 Horizons Echo Tolerance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept the rounding error in Horizons' nine-decimal Julian-date echo without accepting a genuinely different epoch.

**Architecture:** Keep the strict response-envelope parser and requested-epoch sample identity unchanged. Widen only the protocol echo comparison from `5e-10` to `2e-9` days, which covers the observed one-nanoday wire discrepancy while remaining far below one second.

**Tech Stack:** Python 3.12, pytest, NASA/JPL Horizons JSON/CSV response contract.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B017 at lines 423-429.

## Global Constraints

- Fix B017 only; do not relax the five independent Horizons payload-envelope checks tracked by B072.
- Accept absolute epoch-echo differences through `2e-9` days and reject differences beyond it.
- Preserve the caller's requested JD as `EphemerisSample.jd` and therefore as the request/cache identity.
- Preserve strict target, center, frame, unit, correction, and time-scale validation.
- Run tests with Python `3.12.13` at `/tmp/solar-sim-py312/bin/python`, `PYTHONPATH=backend`.
- Leave the change uncommitted for the parent agent's one-bug atomic commit.

## Review Focus

- Exact, one-nanoday, and two-nanoday nine-decimal echoes are accepted.
- An echo beyond two nanodays remains a protocol error.
- A clearly different Julian date remains a protocol error.
- The observed `2460400.987654321` request / `2460400.987654320` echo succeeds.
- The resulting sample retains `2460400.987654321`, not the rounded echoed value.

---

### Task 1: Bound the Horizons epoch-echo comparison to the wire precision

**Files:**
- Modify: `backend/tests/test_ephemeris_service_safety.py`
- Modify: `backend/mission/ephemeris_service.py:1605-1609`

**Interfaces:**
- Consumes: `_parse_horizons_payload(payload, expected_target_id, expected_jd, body_id)` and `EphemerisService.sample_state(body_id, jd)`.
- Produces: unchanged parsed vector/revision and sample interfaces, with a `2e-9`-day echo allowance.

- [x] **Step 1: Write failing protocol-boundary and observed-regression tests**

Extend the real-shaped payload fixture to permit an explicit nine-decimal echoed-JD string. Test exact, inside-bound, at-bound, just-beyond-bound, and clearly wrong echoes through the production parser. Exercise the observed fractional request through `EphemerisService` and assert the returned sample keeps the requested JD.

- [x] **Step 2: Run RED**

Run the new B017 tests only. Expected: the one- and two-nanoday valid cases plus the observed fractional echo fail with `EphemerisProtocolError`; rejection controls pass.

Result: `3 failed, 3 passed, 49 deselected`; the failures were the one-nanoday, two-nanoday, and observed fractional echoes, each at the old `5e-10` comparison.

- [x] **Step 3: Implement the minimal tolerance change**

Change only `_parse_horizons_payload`'s absolute echo tolerance from `5e-10` to `2e-9` days. Do not substitute the returned echo into the sample.

- [x] **Step 4: Run GREEN and focused backend regressions**

Run the new B017 tests, the full ephemeris safety file, the Horizons transport/redirect files, and `git diff --check`. Expected: zero failures and a clean diff check.

Result: B017 focus `6 passed, 49 deselected`; related ephemeris/Horizons suite `118 passed`; full backend suite `3950 passed, 13 skipped`; `git diff --check` silent.

- [x] **Step 5: Hand off uncommitted**

Report the red/green evidence, exact files changed, and remaining working-tree diff to the parent agent without committing.
