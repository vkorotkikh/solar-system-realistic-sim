# Branch integration — 2026-11-02

This is the candidate verification record for [PR #27](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/27). The PR records the final checked head and landing status. This report records branch reconciliation, not closure of external scientific, deployment, or manual-accessibility acceptance gaps.

## Completed landing

PR [#22](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/22) landed as `c842196c17ddf491080b3b4fb1a97106f362cdda` after all 14 push/pull-request checks passed. Ordinary Chromium passed 56 cases with one existing native-display skip on both GitHub runs. The gate now uses full Chromium headless instead of headless shell; real WebGL context-loss and scientific assertions remain enabled. PR #23 was also marked merged through the included eruption history.

PR [#24](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/24) then landed as `307dc4ffa69416ed974e067cea16756c7ffaba28`, with all 14 push/pull-request checks passing and independent review clear. Local main was synchronized to this remote commit. Its earlier local-only routing commit is preserved on `backup/local-main-before-sync-20261102`; incoming untracked-note collisions were backed up and SHA-256 verified in `/home/nomad/ai/projects/backups/solar-main-before-sync-20261102`. Unrelated untracked notes and dirty acceptance worktrees remain untouched.

## Requested branches at reconciliation

| Branch | Observed local head | Inclusion at `c842196c` |
|---|---|---|
| `docs/remediation-reconciliation-20261029` | `25aacf70cbc1288dfac21a7c21fec62d064e1dc0` | Included by ancestry |
| `feat/solar-wind-visual` | `a8019b2c962029cd5c5ac9d0c489994cd1fb9dcf` | Distinct integration under review |
| `fix/close-august-partials-20261031` | `69ccd781e4b4b1f768a2f593910685b42f322109` | Included by ancestry |
| `fix/horizons-coverage-refusal-on-v2` | `a04cb64c7bfc53126985b69ae9c9c6aa83566373` | Distinct integration under review |
| `fix/markdown-audit-20261024` | `da91221fcca3cb068b07544df5823e8e719c419c` | Distinct integration under review |
| `fix/partials-apis-20261031` | `58ee0e14c070511b825803e2fad0f4bdbad75add` | Equivalent patches confirmed; ancestry now reconciled on audit integration |
| `fix/partials-backend-20261031` | `197bd6948a2bdcb26166fa685beeabc2de011d3b` | Equivalent patches confirmed; ancestry now reconciled on audit integration |
| `fix/partials-catalog-20261031` | `359cb577caf19b71fb7f3fd819f1c88ea146ee92` | Equivalent patches confirmed; ancestry now reconciled on audit integration |
| `fix/partials-solar-20261031` | `97b514ed110eff3d89ab6df0ccd955b951eb6cc0` | Equivalent patches confirmed; ancestry now reconciled on audit integration |
| `fix/remediation-completion-20261030` | `fda20ab6c34cc66dc28cb2cecb50eda52831bac3` | Included by ancestry |
| `fix/scn-041-scn-049-closure` | `faa0e8dcaf1fd95318020683a77e9edefad3957b` | Included by ancestry |
| `fix/scn005-final-acceptance-20261028` | `bb29d4be393c9dedca7049fc9b83511ed955be40` | Included by ancestry |
| `fix/scn005-startup-20261017` | `cce5263173f6a35f9ab7f1ec7b48626f4b66fac4` | Equivalent patches confirmed; ancestry now reconciled on audit integration |
| `fix/scn030-scn031-browser-gate-20261027` | `bb29d4be393c9dedca7049fc9b83511ed955be40` | Included by ancestry |
| `fix/scn042-rendering-20261017` | `047d067937d4d8c9197e38cd679c2404fffa7994` | Equivalent patches confirmed; ancestry now reconciled on audit integration |
| `fix/solar-eruption-visuals` | `69ccd781e4b4b1f768a2f593910685b42f322109` | Included by ancestry |

All six patch-equivalent branches are now ancestors of the audit integration. Every history merge was checked to retain an identical tree. Conflicts were confined to later strengthened satellite guards, cancellation/cache ownership, retirement/integrity tests, startup ownership, and historical-note policy; those current contracts were preserved. No older implementation was restored.

## Audit integration contracts

- Keep 423 canonical moon identities, Puck 388/URA184, nullable measured physical radii, separate display estimates, and mandatory fit/oracle checks. Preserve the original 424-row oracle as historical evidence and explicitly map active identities.
- Retain extracted runtime owners, startup cancellation, worker recovery, current label ownership, and immediate camera HUD updates.
- Combine solar request generation/deadlines with bounded render-v1 responses, origin-scoped geometry reuse, and cached full/render projection. Keep validated-data admission.
- Preserve strict Horizons envelope/version validation before epoch-coverage classification. Incorporate the newer PR #26 target/cutoff applicability checks and planner HTTP 422 presentation. A matching request-scoped coverage refusal must not open the provider breaker; mismatched target/cutoff responses retain protocol protection.
- Keep legacy asteroid publication retired. Retain query-keyed preview caches, validated explicit publication through the maintained Python builder, and meaningful tests for former acquisition failure classes.
- Keep the complete blocking browser matrix and zero-diagnostic type gates; add immutable workflow action pins throughout. Keep all science nodes/mutations and the correct PFSS source hash.
- Keep root scratch launchers retired. Preserve diagnostics through the maintained Playwright CLI with owned output directories, signal forwarding, and failure propagation.

## Validation and final reconciliation

All **16 requested branch heads** are reachable from audit integration `997b523da27c77f5b2f79eada19c2da84dd28063`: 15 source tips plus audit itself. Independent verification found zero missing commits and no unexpected source-head movement. All six ancestry-only merges have trees identical to their first parents. Remote main `307dc4f` is an ancestor. The additional five equivalent histories from the earlier request are also ancestors after `bbade4b`; all thirty recorded source heads are included.

| Check | Recorded result and scope |
|---|---|
| Full frontend/tooling suite | GitHub on `226a1be`: 2,989 passed, 2 existing skips, including the AGN port repair and 17 worker-diagnostic matcher cases. |
| Full backend suite | 5,654 passed, 12 optional-Tudat skips, no failures or xfails (340.91 s), before the additional Horizons test merge. |
| Horizons integration | Original integration: 81 cases passed. After incorporating PR #26 (`9a00b15`) and correcting its approximate cutoff predicate: 221 focused backend cases and 16 planner cases passed; strict source/script types passed. The new wrong-side/boundary regressions failed before the exact calendar repair (47 failures). Strict signature/version validation precedes target/cutoff matching and request-scoped coverage refusal. |
| Scientific gate | On combined source `1cd1309`: 21 runner/workflow checks, 11/11 baselines and 8/8 mutations detected; zero unexpected failures, errors or skips. All 23 pinned input hashes remain unchanged. |
| Types/build | Strict source, broad-script and native-Node asteroid-script checks; UI fixture types; zero-error ratchet; production build passed. |
| Chromium | 66 passed and one existing native-display skip in the first run; two action-stability timeouts during unrelated host CPU stress passed unchanged on rerun (42.6 s). All 68 applicable cases have passed. |
| Native Chromium tab zoom | 4/4 passed, including genuine 200%/400% zoom and rejection of substitute zoom mechanisms. |
| Firefox + WebKit | Final combined run: 80 passed, 56 existing project-specific skips, zero failures. Local WebKit used the same WebKit 2370 binary with the previously verified Noble dependency bundle via its launcher; standard GitHub WebKit remains a required gate. |
| Independent reviews | Backend, runtime/solar, wind integration, tooling, AGN port repair and diagnostic fixture reviews found no unresolved Important/Critical issues. |

The initial legacy-fixture failures were reconciled with current contracts: preserved historical moon oracle projected onto exact active identities; current runtime ownership; supported texture replacing retired Deimos; current Kuiper snapshot; complete planet-velocity fixture dependencies. No science thresholds or production reserve calculations were weakened.

GitHub Chromium on `226a1be` exposed two timing defects in browser fixtures: the label drag spent its 90-second deadline on unasserted screenshots and sequential native input; late worker-fault arming allowed valid quarantine to arrive after an eight-second assertion window. The fixture repairs keep real rendering/worker delivery, retain the existing deadlines, and strengthen changed-frame and quarantine-reason assertions. Label verification: 2/2 browser cases, a two-CPU drag repeat (45.6 s), and 27/27 units passed. Worker verification: the repaired case passed 3/3 repeats and both neighboring cases passed. UI types and independent review passed. No production rendering code, scientific tolerances, or test timeouts changed.

The newer Horizons repair was strengthened during independent review: exact mixed-calendar TDB cutoff comparisons replace a one-year tolerance that accepted contradictory refusals. Tests cover both wrong-side HTTP 502 responses, equality, AD/BC boundaries, leap days, the Gregorian transition, fractional seconds, invalid date/time strings, and breaker isolation.

The AGN diagnostic script now binds another free port if its random candidate is occupied, and navigates only to its own actual bound address. A real occupied-socket regression failed before the repair and passed afterward. Firefox's intentional worker error is admitted only with the exact message, observed worker URL and matching stack frames; unexpected diagnostics remain failures. Both worker cases passed Chromium, Firefox and WebKit, with 17 negative/positive matcher tests.

Each published candidate must pass the complete GitHub check matrix before merging. Local reruns and qualified WebKit setup are not a substitute for those checks. The linked PR is the authority for the final accepted source head.

## Earlier requested branches

The earlier fourteen-branch list was also rechecked against `226a1be`. Nine heads were already ancestors. Every remaining commit on the following five heads has an identical stable patch ID in the candidate ancestry; independent review confirmed that later implementations supersede the historical snapshots.

| Branch | Historical → included commits |
|---|---|
| `remediation/20261014-lifecycle-review` | `ef460b5 → b072d32`; `32fbe36 → a8187a7` |
| `remediation/20261014-solar` | `9a239f0 → b123b7f`; `52f412d → c439f68`; `26ba8f4 → c8e7038`; `5247e4b → 4b55dff`; `728451e → df8adc6` |
| `work/scn-041-observational-acceptance` | `052550a → d37a37a`; `3942bd0 → 83c4ef1`; `1898b68 → c037837`; `6f60521 → 2c82d94` |
| `work/scn-049-browser-acceptance` | `bfcf425 → 4347a4e`; `eb53321 → db0645f`; `6ea9d86 → c76bea1` |
| `work/scn041-scn049-final-minors` | `b9d6414 → faa0e8d` |

The current transport ownership, observational provenance, expanded browser coverage, AGN port repair, and historical-note retirement remain authoritative. These duplicate commits required no content replay. History merges `95e97d8`, `7d9be35`, `5b35c15`, `76610e7`, and `bbade4b` each retained an identical tree. A concurrent cleanup removed their local branch names during reconciliation; the verified commit IDs were used without recreating those branches.

## Preserved work outside this merge

At intake, uncommitted work existed in `solar-scn005-final-acceptance-20261028`, `solar-scn030-scn031-browser-gate-20261027`, and `solar-remediation-20261014-ephemeris`, with additional detached payload and notes/evidence worktrees. This integration did not move, commit, or discard that work. Concurrent worktree cleanup outside this integration was observed later; this record does not certify its disposition. Inclusion of their committed branch histories does **not** declare those working copies or external acceptance tasks complete.
