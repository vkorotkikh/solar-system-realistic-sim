---
title: records/ conventions
updated: 2026-11-09
target: bbfbb27
status: final
---

# records/

Dated, append-only output about this repository: audits, reviews, issue notes,
remediation evidence. Human-maintained documentation stays in `docs/`.

## Layout

    records/
      audits/                  codebase-wide audits, scans, evaluations, rechecks
      issues/                  notes about one tracked issue or bug (SCN-043, B011, PR #45)
      remediation/             status checkpoints, closure and verification of fix lines
      reviews/                 branch, PR and independent evidence reviews; PR bodies
      issue-register.md        living register of tracked issues (stable name)
      remediation-status.md    living dispositions per issue (stable name)
      INDEX.md                 one line per record, newest first; archive pointers at the end

Folders are created on first use.

## Rules

1. Names are lowercase kebab-case ASCII: no underscores, spaces or capitals.
2. A dated record is `YYYY-MM-DD-<topic>.md`, dated the day it was finished. The folder is
   the kind, so the name does not repeat it: `audits/2026-11-08-codebase-defects.md`.
   Same day and topic: append `-2`.
3. Identifiers follow the date as lowercase tokens: `scn-043`, `b011`, `pr-45`. A commit SHA
   is the last token, 7 characters: `issues/2026-10-14-scn-043-recheck-041abfb.md`.
4. Evidence lives beside its record in `<same stem>-evidence/`, never loose, with a
   `SHA256SUMS` at its root. Machine-readable archives (JSON, logs) go inside it.
5. Registers are edited over time, so their names carry no date; the header's `updated:`
   line carries it.
6. A dated record is immutable once its `SHA256SUMS` exists. Corrections are a new dated
   record whose header names the old one under `supersedes:`.
7. Every file opens with this header:

       ---
       title: <short title>
       date: 2026-11-08          # dated records; registers use `updated:` instead
       target: <7-char commit>   # the tree the content was checked against
       status: final             # draft | final | frozen | superseded: <path>
       supersedes: <path>        # optional
       ---

8. Prompts that drive agents are maintained documents, not records: `docs/prompts/<topic>.md`,
   no date in the name; git keeps the history.
9. `agent-notes/` and `my-notes/` are archives. Read and link to them; never add to, rename
   or edit inside them: many files are hash-pinned by manifests and thousands of links point in.
10. Every new record adds one line at the top of `INDEX.md`:
    `- YYYY-MM-DD · <kind> · [title](path) · target <sha>`.
