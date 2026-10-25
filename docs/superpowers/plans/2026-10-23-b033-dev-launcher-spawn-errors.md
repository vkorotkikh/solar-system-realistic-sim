# B033 Dev Launcher Spawn Error Implementation Plan

> **For agentic workers:** Use test-driven development and leave the change uncommitted for the parent agent's one-bug atomic commit.

**Goal:** Make both development launchers fail cleanly when a child cannot start, without leaving a backend or Vite process behind.

**Architecture:** Put the common spawn boundary in a small launcher helper that catches synchronous `spawn()` throws and immediately observes asynchronous child `error` events. Launch the repository's Vite CLI directly with `process.execPath`, avoiding both the Windows `npx.cmd` EINVAL path and the extra npm wrapper process that can outlive teardown. Keep `dev:full`'s existing idempotent shutdown policy and `dev:ui`'s exit/signal relay.

**Tech Stack:** Node.js 22 child processes, Vitest, hermetic temporary launcher fixtures.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B033 / LEDGER-TOOL-059.

## Constraints

- Fix B033 only; do not change launcher flags, host/port defaults, or environment construction.
- Handle both deferred ENOENT-style child errors and synchronous spawn throws.
- A backend launch failure must terminate an already-created frontend child and exit nonzero.
- Do not use `shell: true`; user-provided launcher arguments must not cross a shell boundary.
- Spawn Vite as the direct managed child on every platform.
- Tests that intentionally reproduce the old orphan must always clean the exact owned PID.

### Task 1: Add failing black-box launcher regressions

**Files:**
- Add: `scripts/dev-launchers.test.mjs`

- [ ] Run both launchers from a temporary copied root with no `npx` on `PATH` and prove the local Vite JS entry point receives the unchanged arguments.
- [ ] Delay a synthetic missing-`python3` error until a long-lived fake frontend is ready, then require controlled error text, exit 1, shutdown, and no surviving child.
- [ ] Preload synchronous EINVAL and deferred ENOENT-style failures and require `dev:ui` to report both without raw uncaught-event output.
- [ ] Run the focused test before implementation and record the intended failures.

### Task 2: Make child ownership explicit

**Files:**
- Add: `scripts/dev-launcher-process.mjs`
- Modify: `scripts/dev-full.mjs`
- Modify: `scripts/run-ui-dev.mjs`

- [ ] Add a common spawn helper that catches synchronous throws and registers the asynchronous error listener before returning.
- [ ] Resolve `node_modules/vite/bin/vite.js` locally and invoke it with `process.execPath` in both launchers.
- [ ] Route `dev:full` failures through its existing teardown and skip later spawns after a synchronous failure.
- [ ] Give `dev:ui` a contextual nonzero failure path while preserving ordinary child exit and signal forwarding.
- [ ] Run focused mutations for a removed error observer and omitted child kill, then run the frontend suite, type gates, build, and `git diff --check`.
