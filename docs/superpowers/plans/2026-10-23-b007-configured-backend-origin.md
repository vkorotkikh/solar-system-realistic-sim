# B007 Configured Backend Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every trajectory HTTP operation use the validated backend origin supplied by the runtime UI configuration.

**Architecture:** Replace the trajectory module's private `window.location`/port-8042 URL construction with a small client factory that receives a `backendBaseUrl: () => string` dependency. The four request operations close over that dependency, matching the existing dependency-injection pattern used by the solar clients and fitting the planner controller's structural service bundle.

**Tech Stack:** TypeScript, Vitest 5, Three.js, Vite runtime configuration.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B007 at lines 253-264.

## Global Constraints

- Fix B007 only; do not restore or otherwise change the currently inactive planner UI.
- Use strict TDD: add the regression first, observe the expected failure, then make the minimum production change.
- Every trajectory endpoint must use the injected backend origin; no implicit `localhost:8042` or page-host fallback remains in this module.
- The injected value is `runtimeUiConfig.backendOrigin`, already validated and normalized by `createRuntimeUiConfig`; do not duplicate URL validation here.
- Preserve request bodies, timeout behavior, hydration, error classification, and local-fallback policy.
- Produce exactly one atomic B007 commit, including its regression test and this plan.
- Run frontend commands under Node `22.23.2`, as pinned by `.nvmrc` and `package.json`.

## Review Focus

- A configured custom host and port must prefix `/trajectory/plan`; the regression test covers it.
- The same origin must prefix Lambert, porkchop, and mission requests; the table-driven regression covers all four operations.
- A differing page origin must not influence request routing; the regression stubs a page host distinct from the configured backend.
- Existing offline fallback must still occur only for an auto-provider connection failure; the existing fallback-policy tests remain in the focused run.
- HTTP errors and request aborts must retain their existing classification and timeout cleanup; the existing error/abort tests remain in the focused and full-suite runs.

---

### Task 1: B007 trajectory client routing

**Files:**
- Modify: `src/frontend/features/trajectory/index.ts`
- Modify: `src/frontend/features/trajectory/index.test.ts`
- Test: `src/frontend/app/runtimeConfig.test.ts`
- Test: `scripts/frontend-origin.test.mjs`

**Interfaces:**
- Consumes: `backendBaseUrl: () => string`, supplied as `() => runtimeUiConfig.backendOrigin` by a composition root.
- Produces: `createTrajectoryClient({ backendBaseUrl })`, returning `planInterplanetaryRoute`, `solveLambertTransfer`, `scanPorkchopWindow`, and `planMissionProfile` with their current call signatures and behavior.
- Preserves: `TrajectoryApiError`, `buildTransferCurvePoints`, and `describeRoute` exports.

- [ ] **Step 1: Write the failing configured-origin regression**

Add a table-driven test named `routes every trajectory operation through the configured backend origin`. Build a real `RuntimeUiConfig` with `VITE_BACKEND_ORIGIN: 'http://127.0.0.1:9000'` and a different `pageOrigin`, inject `() => config.backendOrigin`, invoke all four operations with valid minimal inputs and successful response fixtures, and assert the exact requested URLs:

```text
http://127.0.0.1:9000/trajectory/plan
http://127.0.0.1:9000/trajectory/lambert
http://127.0.0.1:9000/trajectory/porkchop
http://127.0.0.1:9000/mission/plan
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/frontend/features/trajectory/index.test.ts
```

Expected: FAIL because `createTrajectoryClient` is not exported (or because requests still target the page host on port 8042); it must not fail because of malformed fixtures or test setup.

- [ ] **Step 3: Inject the routing dependency**

In `src/frontend/features/trajectory/index.ts`, add:

```typescript
export function createTrajectoryClient({
  backendBaseUrl
}: {
  backendBaseUrl: () => string;
})
```

Move the four public operations and their private request functions into the factory closure, remove `DEFAULT_BACKEND_HOST`, `DEFAULT_BACKEND_PORT`, and the window-derived `backendBaseUrl()`, and return the four operations. Do not change their request or fallback behavior.

- [ ] **Step 4: Adapt existing trajectory tests to the factory**

Construct the client in test setup with a fixed injected origin and run the unchanged fallback/error assertions through the returned methods. Keep the configured-origin regression dependent on `createRuntimeUiConfig`, not a hand-normalized expected helper.

- [ ] **Step 5: Run focused verification to verify GREEN**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/frontend/features/trajectory/index.test.ts src/frontend/app/runtimeConfig.test.ts scripts/frontend-origin.test.mjs
```

Expected: all focused tests pass with pristine output.

- [ ] **Step 6: Run project verification**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run
npx --yes node@22.23.2 node_modules/typescript/bin/tsc --project tsconfig.json --strict --noEmit
npx --yes node@22.23.2 node_modules/vite/bin/vite.js build
git diff --check
```

Expected: 73 test files pass and one is skipped; 759 existing tests plus the new regression cases pass, 413 remain skipped; strict TypeScript reports no errors; Vite builds successfully; `git diff --check` is silent.

- [ ] **Step 7: Commit B007 atomically**

```bash
git add docs/superpowers/plans/2026-10-23-b007-configured-backend-origin.md src/frontend/features/trajectory/index.ts src/frontend/features/trajectory/index.test.ts
git commit -m "fix(frontend): honor configured trajectory origin (B007)"
```
