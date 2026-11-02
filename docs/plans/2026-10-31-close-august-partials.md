# Close the sixteen August audit partial findings

## Specification and global constraints

The owner's completion checklist is F-001, F-006, F-009, F-012, F-013,
F-018, F-021, F-022, F-023, F-025, F-026, F-027, F-028, F-029,
F-030 and F-031. Each must have implemented repairs, meaningful regression
evidence and independent review. A passing narrow test alone is not closure.

Historical audit: `agent-notes/CODEBASE_EVALUATION_RECHECK_2026-10-31.md`
in the original repository checkout; structured evidence is alongside it in
`AUGUST_23_RECHECK_2026-10-31/{root,backend,solar,catalogs}/findings.json`.
That report evaluated the older remote baseline. This repair integrates
remote `81b042b` with local remediation and eruption fixes through `c9e0cc7`.

All final repairs belong on `fix/close-august-partials-20261031`, with atomic
commits per finding, multiple commits where needed. Isolated worktrees allow
independent implementation; the controller integrates commits sequentially.
Preserve newer correct behavior and immutable provider/oracle evidence.
Do not weaken scientific limits, manufacture measured data, hide test failures,
or activate dormant features merely to satisfy a checklist. Preserve the
owner-approved contracts in `docs/supported-product-policies.md`.
Use red/green tests for behavior changes, focused validation while developing,
then full integration gates. Record commands, results, limitations and commits.
Fresh reviewers must assess both specification and code quality.

## Ownership and dependencies

| Task | Ownership | Dependencies / overlap ruling |
|---|---|---|
| 1 | Catalog formats, taxonomy, moon source/physical data and their consumers | Own radius-related edits in main.ts; root worker/display edits merge sequentially. Own obsolete TS catalog CLI and its README. |
| 2 | Backend seek/mission and legacy Python SBDB CLI | Shared README changes deferred to task 6. No taxonomy TS edits. |
| 3 | Worker controller, screen-size display policy, stars, Kuiper frontend | Integrate task 1 radius edits before final review. |
| 4 | Solar delivery and solar model metadata | Wait for backend baseline merge; no seek/mission files. |
| 5 | Dormant TLE/satellite/DOM/client modules | API/library tests; preserve default composition. |
| 6 | Build gates, docs, governance, asset distribution | Integrate tasks 1–5 first for accurate docs; may prepare independently. |
| 7 | Independent review, integration acceptance and closure record | All implementation tasks; no self-review as final evidence. |

## Task 1: F-012, F-026 and F-027 catalog integrity

Implement separate atomic commits per finding. Read existing audit findings
and inspect current implementation before changing it. Report full evidence in
the task report and return commits, tests and concerns. Do not spawn subagents.

F-012: Add ACBF v2 with a 12-byte header, version 2 and 88-byte records
(`uint32 sourceId`, ten Float64 scalars in the documented order, taxonomy byte,
reserved padding). Preserve v1 and ASPH decoding. Retain unknown taxonomy and
albedo semantics; validate malformed inputs. Regenerate the maintained 100k
bundle offline from pinned provider inputs. Require exact source-to-native
orbital values, including arbitrary fractional epochs; keep legacy literal-byte
tests. Record the increased transfer size and distinguish storage precision
from Float32 GPU display and two-body physical-model accuracy.

F-026: Eliminate fabricated taxonomy/albedo behavior from callable legacy paths.
Prefer retiring the unused TS resolver/acquisition CLI in favor of the maintained
Python builder, with explicit migration documentation. Do not infer metallic
composition from orbital radius or ambiguous X/E/O labels. Confirm no runtime
importers before removing modules; retain observed/unknown policy tests.

F-027: Canonicalize 423 distinct moon identities, keeping newer Puck row 388 and
retiring duplicate 378. Preserve the captured 424-row historical oracle and
explicitly project it onto active identities. Update lazy accounting to 410
lazy models plus 13 base models, pinned Puck recipe and public shard/index hashes.
Preserve Puck's stricter 86.004 km cap; accept a positive published cap at most
the .001*a ceiling. Regeneration must leave all unrelated shard bytes unchanged.
Pin JPL's physical-parameter source and derive nullable physical radii with
source/reference/definition/uncertainty. Separate finite display estimates from
physical radius and realRadiusAu; unknown physics must stay null. Update scale,
focus and info consumers and prove actual UI displays Unknown for missing data.
Run catalog builders/checks, all moon oracle coverage, loader and consumer tests.

## Task 2: F-013, F-018 and F-021 backend and maintenance safety

Implement separate commits per finding. Inspect audit evidence, reproduce gaps,
write failing behavior tests, then repair. No subagents. Full report includes
commands/results and any scientifically inconclusive cases.

F-013: Keep sparse 10-year checkpoint spacing but bound native IAS15 calls with
independent subsegments no longer than .1 year, forward and backward. Check
cancellation between segments and preserve ownership/checkpoint semantics.
Measure real native cancellation latency and total seek throughput; test both
directions and checkpoint eviction without multiplying copies.

F-018: Verify inherited mining mass-flow, handling, capacity and risk fixes end
to end. Diagnose the EPO smoke contract: 19 cases currently yield no recommendation
and 11 unsupported bodies; Pluto/Eris have search-inconclusive failures. Do not
label unknown/search failure as proven physical infeasibility. Provide explicit
known-feasible positive and supported negative contracts, make smoke failures
actionable, repair genuine recommendation defects and update obsolete benchmark
expectations only with mathematical/native evidence.

F-021: Retire unsafe legacy source publication in fetch_jpl_sbdb.py, preserving
shared API query helpers used by maintained builders. Reject write invocation
before fetch/cache/source side effects with actionable migration help; optional
dry-run preview must not mutate published sources. Remove stale append helpers.
Regression-test missing planets.js, unchanged sources and early rejection.
Root handles obsolete TS CLI, browser scripts and consolidated documentation.

## Task 3: F-022, F-023, F-028 and F-030 live runtime ownership

Extract a lifecycle-owned orbital worker controller with a bounded watchdog,
stale-generation fencing, disposal and explicit fallback/recovery status. Test
a silent worker at the actual main integration boundary and real browser.
Use screen-size label policy with body-relative offset; ensure camera-following
stars remain visible at close focus despite near/far planes. Verify rendered
close and distant views as well as numerical policy tests.
Suppress hidden Kuiper uploads while retaining a pending current-JD update on
reveal. Make synthetic candidate labels honest and backend generation seeded
and reproducible. Preserve paused upload behavior and existing binary fixes.
Document composition boundaries and owners instead of cosmetic line-count edits.

## Task 4: F-009 and F-025 solar delivery and scientific presentation

Preserve authenticated magnetogram handling, observed-frame qualification,
single-flight cancellation and the native acceptance suite. Bound repeated
geometry delivery by versioned/conditional or compact transport without losing
the latest state; test byte budgets, updates, reconnect and fallback behavior.
Choose and cite a consistent differential-rotation model from primary sources;
separate illustrative corona/eruption display from physical radii. Preserve
owner-approved decorative clock and local particle/disposal fixes. Test model
coefficients and lifecycle contracts with actual consumer paths.

## Task 5: F-029 dormant API contracts

Repair mixed named/unnamed TLE parsing and trailing-record handling with literal
input tests. Remove absolute-JD-derived satellite interpolation spans; propagate
at requested display JD or bound interpolation by orbital period with native
oracle evidence. Make optional legacy DOM capabilities explicit and validate
before side effects. Complete supported SimulationClient orbital-elements and
seek/JD protocol contracts with transport tests. Keep default UI composition
unchanged and document retained module ownership/status.

## Task 6: F-001, F-006, F-021 and F-031 gates, docs and distribution

Keep browser CI blocking and qualify all configured browser targets. Add a
strict script gate covering maintained scripts; retired scripts must not remain
advertised entrypoints. Repair or retire personal-path Puppeteer scripts in
favor of maintained Playwright commands. Run pinned clean install, source/UI/
script types, build, unit/backend and browser gates. Fix failures without
loosening behavioral limits or adding unjustified skips.
Align README with live composition, mandatory SHA256, exact catalog counts,
supported commands and scientific limitations. Add CONTRIBUTING and canonical
document navigation. Archive oversized rolling history without dropping open
items or provenance; pick a canonical SMBH document with historical links.
Preserve owner's permission-required code policy. Audit bundled asset references;
remove unlicensed Deimos distribution and use honest fallback. Set explicit
binary-retention/distribution policy, preserve pinned verification fixtures,
and remove current orphan assets only after proving no references. No history
rewrite or invented third-party permission.

## Task 7: Independent verification and closure

Review each task's complete commit range for specification and quality. Resolve
important findings with new atomic commits and targeted re-review. Then fresh
agents scan every one of the 16 IDs on the final integrated tree. Run full
appropriate gates and representative real runtime/browser/science acceptance.
Publish a single closure matrix with original issue, final behavior, commits,
test evidence and independent verdict. Only mark fixed when all relevant
subclaims are supported; report any remaining external constraint explicitly.
