# Silent-worker smoke fixture correction — 2026-11-01

Base HEAD: `8b4d3207a33a8e5cdcb0276183ec93e7e66ddaf8`. Implementation change is
limited to `tests/browser/app-smoke.spec.ts`; no runtime deadlines, restart
limits, or worker/controller behavior changed. No commit made by this agent.

## Recorded browser failure and cause

Inspected `test-results/4187/app-smoke-actual-app-recov-31a58-y-terminated-orbital-worker-chromium/trace.zip`.
At trace time 14248 ms the app warned `worker initialization timed out`.
The app subsequently created attempt 2, reached the canvas `ready` state, and
posted two ticks. The final probe was
`{created:2,killed:0,retired:1,replacementTicks:2}`; line 76 failed because
`killed` was zero. The fixture injected only on attempt 1, which had already
timed out before its first tick. Thus its supposed recovery observations came
from an allowed cold-start retry before the intended silent-worker fault.

## Correction and preserved acceptance

Inject once on the first real application tick, whichever attempt receives it.
Snapshot the attempt, creation count, and retirement count at that kill. Require
exactly one subsequent creation and retirement, a ready replacement, more than
one replacement tick and actual worker state reply, exactly one injection, and
at most three lifetime attempts. The probe counts replies only from the direct
replacement and attaches its final counters as `silent-worker-recovery` JSON.
These checks continue to reject missing recovery, extra recovery attempts, a
replacement that never answers, and a renderer recovery failure.

## Validation so far

- UI test typecheck passed with pinned Node v22.23.2:
  `node node_modules/typescript/bin/tsc -p tsconfig.ui-tests.json --noEmit`.
- `git diff --check -- tests/browser/app-smoke.spec.ts` passed.
- A one-off in-memory probe bundled the actual production
  `createModelWorkerController`, extracted the exact old/new `addInitScript`
  callbacks from test source, and used a deterministic transport double and
  virtual timers. The old callback reproduced the missing injection after a
  cold-start timeout. The revised callback produced the following results:

| Scenario | Created / retired at kill | Final created / killed / retired | Replacement ticks / state replies |
| --- | --- | --- | --- |
| Normal startup | 1 / 0 | 2 / 1 / 1 | 2 / 2 |
| One cold-start initialization retry | 2 / 1 | 3 / 1 / 2 | 2 / 2 |

In both revised scenarios the real controller accepted the final state at
JD 2451545; disposal left zero owned timers. This validates the fixture's
causal bookkeeping and controller interaction using a transport double. It
does not replace the actual browser/WebGL test.

**Real-browser validation is still pending.** No browser jobs were launched by
this agent because the parent owns the active matrix and will run the updated
fixture next. The parent also owns the final review/commit and integration
evidence update.
