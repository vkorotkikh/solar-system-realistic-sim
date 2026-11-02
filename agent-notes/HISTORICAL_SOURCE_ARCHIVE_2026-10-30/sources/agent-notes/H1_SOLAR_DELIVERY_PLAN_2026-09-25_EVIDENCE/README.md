# Evidence for `H1_SOLAR_DELIVERY_PLAN_2026-09-25.md`

In the plan, `$SP` means this folder. It is a curated copy of the session scratchpad that the investigation,
design and verification agents worked in on 2026-09-24/25. All runs were against disposable worktrees at `bd48a7d`
(main code; `main = d834dbe` adds docs only) or the chip branch `fix/solar-data-status-notice`; nothing in the
repository was modified by them.

## Layout
| Path | What it is |
|---|---|
| `h1/digest.md` | The six investigators' reports (facts with `path:line`, measurements, hidden problems, fix implications). Citation keys `[BR/UP/CD/FE/TC/BP-Fn]` in the plan point here |
| `h1/backend/` | Route lifecycle, slot-holding and cancellation experiments, stage timing, determinism, H-2 quick check |
| `h1/profile/` | Profiling of the default request, timing matrix, offline behaviour, jd sensitivity (`p5_semantic.txt`), real-server runs |
| `h1/upstream/` | Upstream probes (SWPC 404 / RTSW, SILSO, Helioviewer, GONG), AIA tile path, failure modes, `terms/` (NWS SCN 26-21). `upstream_raw/swpc_rtsw_*.gz` are gzip copies of the public-domain RTSW captures |
| `h1/config/` | Run-mode / CORS matrix, Vite proxy experiments (R1–R6 browser runs), uvicorn proxy-header and XFF checks |
| `h1/frontend/` | Payload consumers, injected-payload browser probes, flare/frame/fallback-activity probes, before/after shots |
| `h1/tests/` | Draft red tests (vitest, pytest), offline plugin, e2e upstream shim, acceptance runs at HEAD |
| `h1/spike/` | Raw captures of the prototype investigator that died before reporting — **unverified**, tagged (U) in the plan |
| `h1/verify/adversarial.md`, `h1/verify/code/` | Adversarial review of the chip branch and its attack tests |
| `h1/verify2/results.md`, `h1/verify2/browser/`, `h1/verify2/ux/` | Browser failure-mode matrix (S1–S9) and layout / accessibility / legibility review of the chip |
| `h1/verify3/` | Final checks after the review fixes: chip screenshots at 1024×768 and 390×844, cold-start false-timeout runs (0/6 preview, 0/6 dev) |
| `h1/tsc_baseline.txt` | Strict typecheck errors at `bd48a7d` (246), used for the no-new-errors check |
| `panel/` | The three designs, both judges' scores, the pre-critique draft and the two critiques |
| `plan/cycle_hindcast.txt` | Cycle-model hindcast used in H6.4 |
| `pw/` | Playwright scripts (they must be run from a directory that has `playwright` installed) |
| `mt_reconcile_summary.txt` | Which files the sun-focus/main reconcile changes on both sides, and the chip's files (no overlap) |

## What was left out
- Build outputs, Vite caches, `node_modules`, pickles, binaries and every file over 300 KB (for example full
  `/solar/physics` payloads of 550–780 KB and the 2.9 MB SILSO CSV). The SILSO data is CC BY-NC; whether recorded
  SILSO or Helioviewer data may be committed is the plan's decision **D18**.
- Most screenshots: the layout review took about 200. The ones the findings cite are kept.
- The full `git merge-tree` dump (about 5 MB); regenerate it with the command in `mt_reconcile_summary.txt`.

## Re-running
The scripts were run in the session scratchpad and still contain its absolute paths
(`/tmp/claude-1000/.../scratchpad/...`). To re-run one, create a worktree, install the toolchain the way the audit
evidence README describes (`agent-notes/CODEBASE_AUDIT_2026-09-24_EVIDENCE/README.md`), and replace that prefix with
your own directory. Per the owner's evidence policy, clean the absolute paths before any of these files are
committed as branch content; the plan's H1.1b moves the harnesses the plan relies on into `tests/e2e/` and
`backend/tests/`.
