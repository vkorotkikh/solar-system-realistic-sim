# Closure of the sixteen August audit partial findings

Updated 2026-11-01. **All sixteen requested findings are resolved and independently verified.**

All repairs are on `fix/close-august-partials-20261031`, with 31 atomic repair/test commits
after the acceptance-plan commit, followed by this closure record. The tested implementation is
`a1977f828aea76a2828869823ccb7eae86b00aec`; its final commit corrects a browser
fault-injection fixture without changing production behavior. The branch
preserves remote `81b042b` and local remediation/eruption work through `c9e0cc7`.
The original checkout, historical audit evidence and other worktrees were preserved.

The [acceptance plan](../docs/plans/2026-10-31-close-august-partials.md) defines
scope and preserves the [approved product policies](../docs/supported-product-policies.md).
The [evidence index](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/README.md)
contains implementation reports, independent reviews, failed/interrupted attempts,
successful checks, source-to-integration commit mappings and integrity records.

## Finding-by-finding result

| Finding | Final behavior and evidence | Repair commits | Verdict |
|---|---|---|---|
| **F-001** | Strict source, UI and maintained-script checks pass; browser CI remains blocking; reproducible pinned installation and production build pass. The worker fault fixture targets the first actual tick, so an allowed cold-start retry cannot bypass the intended failure. | `5a37287`, `7938f54`, `1f12d7b`, `24802ff`, `a1977f8` | Fixed; independently reviewed and all gates passed |
| **F-006** | README describes the actual composition, retained APIs, supported commands, mandatory hashes, catalog counts and model limitations. | `23fb74d` | Fixed; independently reviewed |
| **F-009** | Solar delivery preserves exact geometry and current metadata while reusing geometry only for a matching content hash. Encoded/decoded size bounds fail closed. Actual TCP responses measured 262,645 bytes initially and 2,904 bytes with reuse. | `3e9297f` | Fixed; independently reviewed |
| **F-012** | ACBF v2 stores source scalars as Float64, retaining legacy decoding. An independent direct binary/source comparison verified all 1,000,000 scalar values across 100,000 identities exactly. | `e02b8b1` | Fixed; independently reviewed |
| **F-013** | Native REBOUND seeks use bounded 0.1-year integration segments with cancellation checks, while sparse checkpoints retain their ownership and memory bounds. Independent native cancellation measurements were 4.325/4.820 ms on the tested host. | `e2d4a4c` | Fixed; independently reviewed |
| **F-018** | Mining mass flow, capacity and risk are checked end to end. EPO verification distinguishes feasible missions, supported infeasibility, unsupported inputs and incomplete searches; malformed results fail safely. Negative contracts require complete, untruncated search evidence. | `f88686d`, `4fab6ae` | Fixed; independently reviewed after repair |
| **F-021** | Unsafe legacy SBDB publication rejects writes before side effects. Shared query helpers remain; obsolete personal-path browser scripts give actionable migration instructions. | `40a9830`, `a472f59` | Fixed; independently reviewed |
| **F-022** | A lifecycle-owned worker controller detects silent initialization/in-flight failures, fences stale replies, bounds retries and disposes owned resources. Local propagation remains available. The corrected actual-browser fault/recovery case passed. | `fef6c5b` | Fixed; independently reviewed and browser-validated |
| **F-023** | Labels retain their CSS-pixel size and body-relative clearance at close/distant views. Background stars survive close-focus clip planes and remain behind bodies. Independent rendered glyph/pixel probes verify these contracts. | `640bf15` | Fixed; independently reviewed |
| **F-025** | Backend and surface display share a cited differential-rotation profile. Visible/documented disclosures distinguish illustrative corona/eruption scale and time from physical quantities. | `d8eae54` | Fixed; independently reviewed |
| **F-026** | Callable legacy paths that fabricated taxonomy/albedo are retired. Maintained source-backed and unknown-value policies remain. | `ddd49a0` | Fixed; independently reviewed |
| **F-027** | The catalog contains 423 unique moons, retaining the newer Puck identity and stricter residual cap. There are 46 source-backed physical radii and 377 explicit unknowns; finite display estimates are separate. All 410 lazy shards validate and the historical oracle remains unchanged. | `1660173` | Fixed; independently reviewed |
| **F-028** | Hidden Kuiper populations avoid propagation/uploads and recompute the current epoch once revealed. Seeds are validated and reproducible; synthetic resonance candidates are labeled honestly. | `08a6d8e` | Fixed; independently reviewed |
| **F-029** | Retained APIs correctly parse mixed TLE records, deduplicate physical identities, bound interpolation, reject malformed snapshots before mutation, preflight DOM capabilities and handle orbital-element/seek notifications safely. Final independent review passed 86 tests and 12 reentrant observer scenarios. | `e8387d8`, `b026c21`, `3ea320d`, `581b162`, `eb7977a`, `7e49b5f`, `7abcce1`, `8b4d320` | Fixed; independently reviewed after repair |
| **F-030** | The composition ADR identifies actual runtime/state/transport/lifecycle owners and retained-module activation requirements. Current navigation distinguishes historical records. | `692457c` | Fixed; independently reviewed |
| **F-031** | Distribution validates curated asset provenance, hashes and notices. Unresolved Deimos imagery and unreferenced textures are retired with recorded inventories. Contribution/navigation/retention guidance exists, and the full historical rolling log is preserved byte-for-byte. | `fd8d149`, `ebc81a4`, `2b5ccaa` | Fixed; independently reviewed |

## Integrated validation

| Gate | Result | Evidence |
|---|---|---|
| Pinned Node 22.23.2 / npm 10.9.8 clean install | Passed; 51 packages added, 52 audited, zero reported vulnerabilities | [Install](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/clean-install-nov01.txt) |
| Strict source, UI and script types; ratchet/delta | Passed; zero diagnostics | [Types](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/types-final-nov01.txt) |
| Full frontend suite | 1,752 passed; 2 optional EGL tests skipped | [Frontend](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/frontend-final-nov01.txt) |
| Full backend suite, pinned Python 3.12.13 | 4,510 passed; 13 optional native checks skipped | [Backend and skip reasons](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/backend-final-nov01.txt) |
| Production build | Passed; 8 curated maps and 4 notices verified/packaged | [Build](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/build-final-nov01.txt) |
| Scientific runner/workflow contracts | 21 passed | [Runner contracts](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/science-runner-contracts-nov01.txt) |
| Pinned scientific baseline and mutation gate | 11 baseline cases passed; all 8 deliberately reintroduced defects detected | [Exact-head summary](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/science-final-nov01/summary.json) |
| Corrected actual worker-failure acceptance | Passed; one injected failure followed by bounded recovery and actual state replies | [Browser rerun](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/browser-worker-corrected-nov01.txt) |
| Complete configured browser matrix, including native hidden-tab acceptance | 136 passed; 34 Chromium-only checks skipped on Firefox/WebKit; zero failures/flaky cases | [Per-project summary](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/browser-summary-nov01.json) |
| Actual asteroid GPU numerical gate | Passed; 125 planar and 2 inclined cases, plus sub-minute motion | [WebGL2 output](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/asteroid-gpu-final-nov01.txt) |

The build retains its advisory about the large main bundle. The full backend's
13 skips are one optional SPICE check and twelve optional Tudat checks; these
are not counted as passes. The default frontend suite's two skipped tests need
the opt-in EGL environment. Earlier qualified NVIDIA hardware and catalog/native
probes retain their own commit and machine scope in the evidence bundle.

## Independent verification and retained limits

Separate reviewers assessed catalog/backend, runtime/solar/distribution and the
retained APIs. A fresh whole-branch reviewer checked every requested ID, ran 99
focused tests, directly compared source/catalog scalars, validated shard hashes,
and checked immutable oracle/archive bytes. Review findings led to additional
atomic repairs and scoped rereviews. The [final independent sweep](AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/final-sweep.md)
approves all sixteen findings at `a1977f8`, with no remaining blocking finding.

Closure preserves honest scientific and product boundaries: Float64 storage does
not make Float32 rendering or two-body dynamics exact; unknown moon radii remain
unknown; decorative solar rendering is not calibrated observational imagery;
retained satellite APIs use their documented mean-Kepler/J2 model and remain
opt-in. The original thirty mission stress cases retain their expectations and
reported unsupported/inconclusive results; supported positive and negative
contracts are verified without claiming every search or vehicle is feasible.
No new third-party distribution permission is inferred from the owner's code
license. These limits are documented contracts, not passing results for unrun
platforms, unavailable optional engines or unsupported physical models.
