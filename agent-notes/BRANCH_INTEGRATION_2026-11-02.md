# Branch integration — 2026-11-02

Status: integration in progress. This report records branch reconciliation, not closure of external scientific, deployment, or manual-accessibility acceptance gaps.

## Completed landing

PR [#22](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/22) landed as `c842196c17ddf491080b3b4fb1a97106f362cdda` after all 14 push/pull-request checks passed. Ordinary Chromium passed 56 cases with one existing native-display skip on both GitHub runs. The gate now uses full Chromium headless instead of headless shell; real WebGL context-loss and scientific assertions remain enabled. PR #23 was also marked merged through the included eruption history.

Local main was synchronized to that remote commit. Its earlier local-only routing commit is preserved on `backup/local-main-before-sync-20261102`; incoming untracked-note collisions were backed up and SHA-256 verified in `/home/nomad/ai/projects/backups/solar-main-before-sync-20261102`. Unrelated untracked notes and dirty acceptance worktrees remain untouched.

## Requested branches at reconciliation

| Branch | Observed local head | Inclusion at `c842196c` |
|---|---|---|
| `docs/remediation-reconciliation-20261029` | `25aacf70cbc1288dfac21a7c21fec62d064e1dc0` | Included by ancestry |
| `feat/solar-wind-visual` | `a8019b2c962029cd5c5ac9d0c489994cd1fb9dcf` | Distinct integration under review |
| `fix/close-august-partials-20261031` | `69ccd781e4b4b1f768a2f593910685b42f322109` | Included by ancestry |
| `fix/horizons-coverage-refusal-on-v2` | `a04cb64c7bfc53126985b69ae9c9c6aa83566373` | Distinct integration under review |
| `fix/markdown-audit-20261024` | `da91221fcca3cb068b07544df5823e8e719c419c` | Distinct integration under review |
| `fix/partials-apis-20261031` | `58ee0e14c070511b825803e2fad0f4bdbad75add` | Every branch-only patch equivalent; ancestry reconciliation pending |
| `fix/partials-backend-20261031` | `197bd6948a2bdcb26166fa685beeabc2de011d3b` | Every branch-only patch equivalent; ancestry reconciliation pending |
| `fix/partials-catalog-20261031` | `359cb577caf19b71fb7f3fd819f1c88ea146ee92` | Every branch-only patch equivalent; ancestry reconciliation pending |
| `fix/partials-solar-20261031` | `97b514ed110eff3d89ab6df0ccd955b951eb6cc0` | Every branch-only patch equivalent; ancestry reconciliation pending |
| `fix/remediation-completion-20261030` | `fda20ab6c34cc66dc28cb2cecb50eda52831bac3` | Included by ancestry |
| `fix/scn-041-scn-049-closure` | `faa0e8dcaf1fd95318020683a77e9edefad3957b` | Included by ancestry |
| `fix/scn005-final-acceptance-20261028` | `bb29d4be393c9dedca7049fc9b83511ed955be40` | Included by ancestry |
| `fix/scn005-startup-20261017` | `cce5263173f6a35f9ab7f1ec7b48626f4b66fac4` | Every branch-only patch equivalent; ancestry reconciliation pending |
| `fix/scn030-scn031-browser-gate-20261027` | `bb29d4be393c9dedca7049fc9b83511ed955be40` | Included by ancestry |
| `fix/scn042-rendering-20261017` | `047d067937d4d8c9197e38cd679c2404fffa7994` | Every branch-only patch equivalent; ancestry reconciliation pending |
| `fix/solar-eruption-visuals` | `69ccd781e4b4b1f768a2f593910685b42f322109` | Included by ancestry |

Four partial branches produce clean, content-identical merges with current main. The older startup and rendering branches conflict only where later changes supersede their already-equivalent patches. Their reconciliation must retain current source, strengthened browser gates, and dated evidence.

## Audit integration contracts

- Keep 423 canonical moon identities, Puck 388/URA184, nullable measured physical radii, separate display estimates, and mandatory fit/oracle checks. Preserve the original 424-row oracle as historical evidence and explicitly map active identities.
- Retain extracted runtime owners, startup cancellation, worker recovery, current label ownership, and immediate camera HUD updates.
- Combine solar request generation/deadlines with bounded render-v1 responses, origin-scoped geometry reuse, and cached full/render projection. Keep validated-data admission.
- Preserve strict Horizons envelope/version validation before epoch-coverage classification. Coverage refusal must not open the provider breaker.
- Keep legacy asteroid publication retired. Retain query-keyed preview caches, validated explicit publication through the maintained Python builder, and meaningful tests for former acquisition failure classes.
- Keep the complete blocking browser matrix and zero-diagnostic type gates; add immutable workflow action pins throughout. Keep all science nodes/mutations and the correct PFSS source hash.
- Keep root scratch launchers retired. Preserve diagnostics through the maintained Playwright CLI with owned output directories, signal forwarding, and failure propagation.

## Validation before the audit merge commit

- Full frontend/tooling suite: **2,951 passed, 2 existing skips** after reconciling four legacy fixture families. The oracle source, science hashes and thresholds were preserved; retired Deimos was replaced with another supported texture fixture.
- Full backend suite: **5,654 passed, 12 optional-Tudat skips**, no failures or xfails (340.91 s).
- Strict source, broad-script and native-Node asteroid-script types, UI fixture types, zero-error ratchet and production build passed.
- Chromium: 66 passed, one existing native-display skip, two action-stability timeouts during unrelated host CPU stress. Both failed cases passed unchanged after the stress ended (42.6 s). All 68 applicable cases have passed; a fresh combined GitHub run remains required before merge.
- All 23 scientific manifest input hashes match. The committed-source mutation gate and remaining browser projects are pending.
- Independent backend and runtime/solar merge reviews found no concrete Important/Critical regressions. Tooling review remains pending.

PR [#24](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/24) carries solar-wind integration head `a8019b2`. Its full suite passed 1,773 cases (two existing skips), source types/build passed, and independent review found no findings. GitHub acceptance is still running.
