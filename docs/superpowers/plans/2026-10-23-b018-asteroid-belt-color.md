# B018 Asteroid Belt Color Implementation Plan

> **For agentic workers:** Use test-driven development and leave the change uncommitted for the parent agent's one-bug atomic commit.

**Goal:** Keep the main-belt asteroids' per-instance colors from being multiplied by a missing per-vertex color attribute.

**Architecture:** Exercise the shipped `createAsteroidBeltRenderer` path, not a duplicate material fixture. The belt geometry intentionally has no `color` attribute and the mesh supplies `instanceColor`; therefore its `MeshStandardMaterial` must leave `vertexColors` disabled so Three.js enables only the instance-color shader path.

**Tech Stack:** TypeScript, Three.js, Vitest.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B018.

## Constraints

- Fix B018 only.
- Preserve the existing `instanceColor` buffer and all orbit shader customization.
- Do not add a redundant geometry-wide color attribute.
- Test the real renderer handle/material/geometry contract; do not source-scan `beltRenderer.ts`.
- Leave the change uncommitted for the parent agent.

### Task 1: Lock the material/geometry color contract

**Files:**
- Add: `src/frontend/features/asteroids/beltRenderer.color.test.ts`
- Modify: `src/frontend/features/asteroids/beltRenderer.ts`
- Modify: `tests/browser/asteroid-shader.spec.ts`

- [ ] Add a regression test that creates a real asteroid renderer and proves it has an `instanceColor`, no geometry `color` attribute, and a material with `vertexColors === false`.
- [ ] Run that test before the fix and record the intended failure.
- [ ] Remove only `vertexColors: true` from the orbit material.
- [ ] Extend the existing production WebGL program check to require `instanceColor` and reject a stray active `color` attribute.
- [ ] Run the focused asteroid renderer tests, strict TypeScript checks, the frontend suite, build, and `git diff --check`.
- [ ] Report evidence and leave the three B018 files uncommitted.
