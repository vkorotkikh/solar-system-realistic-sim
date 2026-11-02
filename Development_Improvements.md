# Development Improvements

## 1) Instruction Layer
This file is a rolling, timestamped log for suggestions, improvements, candidate fixes, known problems, and forward-looking development ideas.

Purpose:
- Keep a high-signal backlog of improvement opportunities.
- Capture problems and proposed solutions before and after implementation.
- Preserve context for future planning and prioritization.

Scope boundaries:
- Include ideas, bug hypotheses, optimization opportunities, architecture improvements, UX suggestions, and technical debt notes.
- Include both implemented and unimplemented items, clearly marked by status.
- Exclude verbose discussion transcripts and duplicate notes from other files.

Maintenance rules:
- Keep entries in reverse chronological order (newest first).
- Use UTC timestamps in `YYYY-MM-DD HH:MM:SS UTC`.
- Keep entries concise, actionable, and file-aware.
- Prefer append-only updates; only edit old entries for factual corrections or status changes.
- Do not modify this instruction layer unless process rules change.

Entry status values:
- `OPEN`: Identified, not started.
- `IN-PROGRESS`: Being implemented/evaluated.
- `DONE`: Completed and validated.
- `BLOCKED`: Cannot proceed due to dependency/constraint.
- `DEFERRED`: Valid idea, postponed intentionally.

Rolling size control:
- Soft target: keep file under `35 KB` or `350` lines.
- Hard cap: if file exceeds `48 KB` or `500` lines, prune oldest entries from the bottom.
- Prune notes only; never prune the instruction layer.
- Preserve unresolved high-priority `OPEN` / `BLOCKED` entries where possible.
- After pruning, add one line noting prune date/time and approximate entries removed.

Entry template (use this order):
- Timestamp
- Status
- Type (`IDEA`, `PROBLEM`, `FIX`, `OPTIMIZATION`, `ARCHITECTURE`, `UX`, `TECH-DEBT`)
- Summary
- Context / rationale
- Proposed approach
- Expected impact
- Affected files/systems
- Next step

## 2) Improvements Log (Rolling)

### 2026-10-31 09:00:00 UTC
Status: `IN-PROGRESS`
Type: `FIX`
Summary: Sixteen August partial findings are being repaired and independently verified.
Current status: [closure ledger](agent-notes/AUGUST_PARTIALS_CLOSURE_2026-10-31.md).
Architecture: [runtime composition](docs/adr/0006-runtime-composition-and-retained-apis.md).

The complete former log is preserved byte-for-byte in
[the March archive](docs/history/development-improvements-through-2026-03.md).
Its dated implementation claims are historical. The following unresolved entries
are retained as a triage index, not silently closed by archival. Entry numbers
refer to the sequential `###` entries in that archive. Use current code evidence
before accepting or closing a historical hypothesis.

| Archive entry | Historical status | Summary |
|---|---|---|
| 4 | IN-PROGRESS | Removed `// @ts-nocheck` from all 41 source files and began adding proper type annotations. |
| 5 | OPEN | Comprehensive codebase audit identified 23 issues; critical and high-severity items fixed, medium/low items tracked here. |
| 7 | OPEN | Asteroid ingestion currently has two binary paths: legacy runtime `ASPH` loading and new compact `ACBF` packing utilities. |
| 9 | IN-PROGRESS | TypeScript migration in `src` is functionally complete. `@ts-nocheck` has been removed from all files. Worker contracts and type hardening are in progress. |
| 13 | IN-PROGRESS | Implementing DEM (Differential Emission Measure) channel response system for the solar corona, a new transition region atmospheric shell, and physics fixes for the heliospheric current sheet tilt and Parker spiral geometry. |
| 17 | OPEN | Solar corona physics engineering plan — roadmap for DEM-aware rendering and atmospheric layer completion. |
| 18 | OPEN | Brainstorming: channel-specific coronal heating diagnostics and observation-comparison mode. |
| 32 | OPEN | Identified additional non-solar issues from codebase sweep requiring future attention. |
| 34 | OPEN | Next-phase partitioning roadmap for finishing `main.js` decomposition. |
| 35 | IN-PROGRESS | TypeScript continuation plan for physics and frontend contract safety. |
| 38 | OPEN | Add multi-revolution Lambert solver and Izzo's algorithm for improved trajectory planning. |
| 39 | OPEN | Add GR precession and J2 oblateness corrections to REBOUND N-body engine via REBOUNDx. |
| 41 | OPEN | Recorded external architectural/scientific deep review as a prioritized implementation queue. |
| 42 | OPEN | Added quick status table from latest deep re-audit to track unresolved and resolved platform items. |
| 46 | OPEN | Create a shared solar feature-state service to unify polling cadence, blending state, and render subscriptions. |

Archived 2026-10-31: all prior entries preserved; no unresolved item deleted.
