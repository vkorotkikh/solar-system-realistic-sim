# Construction closure checkpoint - 2026-10-15

> Scope clarification (2026-10-17): `SimulationClient` is **API/library-only; not integrated into the default UI.** The [consolidated tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md#simulationclient-scope-decision--2026-10-17) separates backend, client-library and active-browser acceptance. The dated execution results below are preserved.

> Subsequent repair (2026-10-17): the shader and sampling corrections described below are now implemented on `remediation/scn-followup-20261017`, with scoped 6/6 hardware rendering acceptance. Full-catalog startup coordination passes the unchanged catalog timing gate in three DEV measurements, but observed complete-scene readiness remains 6.5–6.9 s and SCN-005 stays partial. See the [rendering repair](SCN042_RENDERING_REPAIR_2026-10-17.md), [startup repair](REMEDIATION_STARTUP_WARMUP_2026-10-17.md) and maintained tracker. The October 15 failures and approval requests below are historical, not the current disposition of those repairs.

**Progress checkpoint, not complete resolution of the canonical register.**

Branch: `remediation/canonical-register-20261014`. Production source:
`6539902`. No merge into main, push, fetch, or deployment was performed.
The primary states in the master remain tied to its explicitly dated main
baseline; construction-branch fixes are not relabeled as shipped.

## Integrated changes

- `df8adc6`: PFSS float-coordinate handling, near-pole sine/Cartesian accuracy, shared scalar/batch evaluation, and finite-azimuth rejection. The 55 previously failing regression cases now pass.
- `cdea3bc`: scientific mutation gates now target the executed streaming recurrence and source-surface factor. The immutable 136-mode helper oracle is retained, with 135 nonmonopole production comparisons added under the same required node and unchanged tolerances.
- `a8187a7`: negotiated Kuiper activation identities reject stale snapshots without discarding ordinary body updates. Actual native producer captures reproduce the old race; legacy peers retain their explicitly documented limitation.
- `6539902`: asteroid binary-body reads overlap metadata loading while retaining validation, error ordering, cancellation deadlines, retries, and cache behavior. This is not an end-to-end startup acceptance result.

## Fresh verification

| Scope | Revision | Result | Qualification |
| --- | --- | --- | --- |
| Full backend/CI/script suite | `a8187a7` | **3,878 passed, 0 failed, 12 skipped**, 2 warnings; 184.59 s | Required native SpiceyPy enabled. Skips remain skips. |
| Complete frontend, opt-in GPU cases enabled | `6539902` | **745 passed, 411 skipped**, 73 files; 10.29 s | Node **22.23.2**. The 411 moon records are not yet promoted into this branch. |
| Strict TypeScript | `6539902` | Exit 0 | No relaxed compiler settings. |
| Production build | `6539902` | Exit 0; 1.54 s | Worker 26.13 kB; main chunk 969.57 kB. Existing >500 kB warning remains. |
| Required real Tudat | `a8187a7` | **17 passed, 0 failed, 0 skipped**, 4 warnings; 1.47 s | Python **3.12.15**, TudatPy **1.0.0**, `SOLAR_REQUIRE_TUDAT=1`. Cached native environment restored. |
| Scientific baseline and mutation acceptance | `cdea3bc` | **6/6 baseline passed; 6/6 mutants killed** | Clean detached runs, offline guard, call-phase assertion and every changed production hunk executed. |
| Harmonic, azimuth, verifier tests | `df8adc6` plus the subsequently committed gate patch | **291 passed** | Overlaps other rows; do not add counts. |

The only production change after the full backend/native runs is the frontend
catalog-loading commit. Scientific pinned inputs likewise remain unchanged
after the scientific gate. Results above retain their actual execution revision
rather than being relabeled as a single final all-subsystem run.

Evidence: [scientific summary](scientific-gate-2026-10-15/summary.json),
[backend log](scientific-gate-2026-10-15/full-backend-a8187a7.log),
[frontend log](scientific-gate-2026-10-15/full-frontend-6539902.log),
[strict TypeScript log](scientific-gate-2026-10-15/strict-types-6539902.log),
[build log](scientific-gate-2026-10-15/build-6539902.log),
[native log](scientific-gate-2026-10-15/native-tudat-a8187a7.log), and
[native versions](scientific-gate-2026-10-15/native-versions.json).

## Independent review and scope

Kuiper review reported no Critical or Important findings, with 91 backend
checks, 69 frontend checks (client and frame-lifecycle suites) and six additional native captures across paused/running
and tagged/legacy transitions. Its client rerun used Node 24; the integrated
Node 22 frontend result above supplies the pinned-toolchain gate. These captures
use an in-memory transport and do not certify a deployed browser/network.

The parent independently reviewed the PFSS production patch. A separate review
of the parent-authored scientific gate found no blocking findings. The added
production oracle covers 135 isolated cosine-coefficient modes, degrees 1-15,
five latitudes, radius 1 and azimuth 0. It is not a blanket degree-90, sine-mode,
azimuthal-field or all-radius certificate; separate reference and regression
suites retain those distinct scopes. Three reference epochs and cold High/Ultra
responses passed the unchanged budgets in the [PFSS report](SCN041_NUMERICAL_REVIEW_REPAIR_2026-10-14.md).

## Still open

| Item | Current remaining work |
| --- | --- |
| `SCN-005` | End-to-end startup still lacks a passing unchanged two-second catalog gate. The narrow overlap optimization does not establish this. Choose startup behavior and measure actual usable rendering separately. |
| `SCN-030` | Manual NVDA/VoiceOver/physical-touch acceptance and affected final-source browser checks. Earlier three-engine automated passes remain dated evidence. |
| `SCN-035` | Owner code-license choice, SILSO terms disposition and Deimos permission or approved asset replacement/removal. |
| `SCN-041` | Numerical and scientific gates are repaired; observed-input/frame integration, provider/application wind calibration and their acceptance remain scoped open. Observational safeguards remain fail-closed. |
| `SCN-042` | Default actual-main rendering still fails. The fixture correction passes 154/156 markers and 235/235 surface probes. Remaining causes are diagnostic MSAA/reference mismatch and an asteroid shader `PI` macro collision. Corrections require the requested approval. |
| `SCN-043` | All 424 records are prepared locally, but only 13 are integrated here. Two new independent loader findings, storage approval, promotion and final validation remain. |
| `SCN-047` | Global release acceptance still needs rendering, startup/delivery, remaining moon work, final browser and applicable manual/deployment gates. Green unit/build lanes are not complete acceptance. |
| `SCN-048` | Scalar-JD leap-boundary policy, implementation and tests; owner deployment URL/auth/TLS; observed spatial/calibration acceptance. |
| `SCN-049` | Stale-Kuiper implementation and native/client-library verification are integrated into the construction branch. Final actual-browser requirements remain for active visual/lifecycle children. This evidence does not establish default-UI N-body delivery; retirement or opt-in UI integration requires the separate decision recorded in the consolidated tracker. |

## Moon promotion: prepared, not accepted

The isolated moon worktree reports 517 scoped tests and a production build
passing with Node 22.23.2, plus seven Python tests including a network-blocked
byte-identical 410-shard rebuild. Earlier broader Node 24 results are not
substituted for the pinned runtime. All 424 identities, both Puck records and
the original 13 model artifact hashes are retained.

Independent review found two P2 gaps: missing/inconsistent `vectorOracle` and
individual endpoint error limits can be admitted, and rejected HTTP/oversized
responses can leave bodies uncancelled after concurrency permits are released.
Approval was requested for both corrections; the promotion is held.

Sizes: compressed source inputs **330,929,304 bytes**, source manifest
**5,119,933 bytes**, downloadable shards **59,955,387 bytes**, download index
**303,149 bytes**; largest shard **1,624,520 bytes**. Source inputs are not
browser downloads. No background shard loading is claimed. The storage decision
must account for both reproducibility inputs and generated publication assets.

See [author acceptance](SCN043_LAZY_PROMOTION_ACCEPTANCE_2026-10-15.md) and
[independent findings](SCN043_LAZY_INDEPENDENT_REVIEW_2026-10-15.md).
Source and bulk assets remain uncommitted in the isolated moon worktree.

## Rendering and startup evidence boundaries

The [rendering report](SCN042_RENDERED_ACCEPTANCE_2026-10-15.md) retains failing
baseline/corrected captures and diagnostic controls. In-memory shader/sampling
corrections pass 6/6 cases, 156/156 markers, 235/235 surface probes and all three
negative controls, but those corrections are not applied or accepted as a
default-production pass. The proposed diagnostic target is single-sample;
production AA remains enabled and requires its own shader/error gate.

The existing 2,000 ms metric starts at uncached catalog fetch and ends after
parsing/hash verification, before scene adoption. The delivery harness's first
intercepted RAF callback is not proof of a drawn usable scene. Neither metric
may be used to hide shader warmup or delay the complete scene while claiming
startup success. No new complete-scene budget is silently imposed or approved.

## Next decisions

Apply the two additional rendering corrections and the two moon-loader fixes
only after their requested approval. Resolve source-storage, startup-behavior
and precise-time policy choices. External permissions, manual devices and
deployment acceptance require real owner input or evidence. Keep unmerged
qualifiers until a separately authorized landing is actually evidenced.
