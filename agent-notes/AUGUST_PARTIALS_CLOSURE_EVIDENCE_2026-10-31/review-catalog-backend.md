# Independent catalog/backend closure review

Reviewed Task 1 at `359cb577caf19b71fb7f3fd819f1c88ea146ee92` and Task 2 at
`22d2c6e76b7aa73b5c6baddaf76c94e3d84c70f5`, against base `8d330a07`.
Reviewer did not modify either implementation tree, merge commits, refresh
provider/oracle data, or spawn agents. Read both briefs/reports, source diffs,
relevant consumers, planner status construction, and selected generated evidence.

## Initial verdict

Task 1 (F-012/F-026/F-027): closure justified within the stated storage,
provenance, identity and display scope; no important issue found.

Task 2: F-013 and F-021 closure justified. F-018 needs two scoped repairs before
closure because the newly introduced negative/result-reporting contracts fail
independent boundary probes. Existing happy-path tests pass. These findings do
not invalidate the real feasible mission or the inherited mass-flow fixes.

## Findings requiring repair

### P2 — Physical negative accepts missing or explicitly inconclusive search evidence

Location: `backend/mission/epo/verifier.py:41-58`, especially lines 43-58.

The branch rejects a top-level `trajectory_search_inconclusive` status but never
inspects `missionSearch` or nested `trajectorySearch`. Starting with the actual
planner result for `empty_vehicle_cannot_close` (four real evaluated candidates),
both of the following mutations still return `(True, [], {'mission_score': None})`:

```python
result['missionSearch'] = None
```

```python
result['missionSearch'] = {
    'configuredCandidatesCompleted': False,
    'truncated': True,
    'terminationReason': 'deadline_exceeded',
}
result['trajectorySearch'] = {'outbound': {
    'searchComplete': False,
    'truncated': True,
    'terminationReason': 'assist_depth_1_budget_exhausted',
}}
```

The unmodified result is `no_verified_candidate` with completed, untruncated
mission search and passes legitimately. The mutations keep its physical burn
evidence unchanged, demonstrating that the verifier trusts the status label
instead of independently enforcing the promised completeness boundary. The
current real planner normally promotes child inconclusiveness to its top-level
status; this is a missing regression gate, not a claim that today's normal smoke
already produces contradictory status. Nevertheless the explicit acceptance
criterion requires negative contracts to reject inconclusive results and the
implementation report says missing evidence cannot pass. Require complete mission
accounting, reject any explicit incomplete child search, and test these mutations.

### P2 — Malformed planner dictionaries crash smoke reporting

Locations: `backend/mission/epo/runners.py:49-51`,
`backend/mission/epo/verifier.py:30-36,43-57`, and reporting assumptions at
`backend/mission/epo/metrics.py:27-29`.

The newly added invalid-result test covers only a top-level list. Malformed
dictionaries escape the planner exception guard and abort the suite instead of
yielding actionable failed episode records. Independent injected-result probes:

| Planner return | Expected contract | Observed |
|---|---|---|
| `{'status': 'request_rejected'}` | request rejection | `KeyError: 'error'` at runner line 51 |
| `{'status': 'no_verified_candidate', 'alternatives': [None]}` | vehicle infeasible | `AttributeError: 'NoneType' object has no attribute 'get'` |
| `{'status': 'request_rejected', 'error': ['oops']}` | request rejection | `AttributeError: 'list' object has no attribute 'get'` |

Validate nested shapes at the verifier boundary and make diagnostics tolerant of
invalid result structure. Missing/malformed evidence should produce failed
records, never expected-negative success or a reporting crash. Exercise summary
serialization as well as `run_episode`, since metrics traverses nested structures.

## Reproducing the backend boundary probes

Run in the backend worktree with the cached offline Python environment used by
the implementation report (`PYTHONPATH=backend`, `PYTHONDONTWRITEBYTECODE=1`,
`uv run --offline --no-project --python 3.12.13 --with-requirements
ci/backend-test-requirements.txt python`).

```python
from copy import deepcopy
from mission.epo.runners import EpisodeRunner
from mission.epo.sample_episodes import SMOKE_EPISODE_FAMILIES
from mission.epo.verifier import DemoVerifier

negative = SMOKE_EPISODE_FAMILIES[0].episodes[1]
rejection = SMOKE_EPISODE_FAMILIES[0].episodes[2]
runner = EpisodeRunner()
result = runner.planner.plan(deepcopy(negative.mission_payload))
assert DemoVerifier().verify(negative, result)[0] is True
altered = deepcopy(result)
altered['missionSearch'] = None
print(DemoVerifier().verify(negative, altered))  # Incorrectly True
# Repeat with the explicit incomplete-search fields above.

runner.planner.plan = lambda payload: {'status': 'request_rejected'}
runner.run_episode(rejection)  # KeyError instead of a failed record
```

## Independent verification performed

- Directly unpacked the shipped ACBF binary using Python `struct.iter_unpack`
  and joined every one of its 100,000 records by source ID to the pinned SBDB
  provider response. All ten scalar fields (nine orbital/diameter values plus
  albedo or its documented unknown sentinel) exactly equal parsed provider
  values. This probe did not call the production writer or its source-value
  assertion helper. Header is v2/88 bytes. Arbitrary fractional-epoch/literal
  decoder tests were included in the frontend run below.
- Independently counted 423 unique `(parent, source ID)` moon identities and
  46 matching sourced physical radii, leaving 377 unknown. Verified every public
  shard's SHA-256 and byte length. Compared old/new indexes: only Puck's shard
  changes; its published position cap remains 86.004 km. Compared historical
  oracle bytes directly with `git show 8d330a07:...`: unchanged.
- `npx vitest run src/data/asteroidCatalogLoader.test.ts
  src/sim/moonPhysicalIntegrity.test.ts
  src/sim/moonCatalogRepair.horizons.test.ts
  src/sim/lazyMoonEphemerides.test.ts src/main.focusBody.test.ts`:
  **5 files / 522 tests passed**. This includes complete active-moon production
  loader/propagation oracle comparisons, nullable-radius info/focus consumers,
  literal legacy format reads, and stricter cap admission controls.
- `python3 scripts/build_asteroid_phase1_dataset.py --offline --check`:
  **100,000 records byte-identical**.
- `python3 scripts/generate_moon_physical_radii.py --check`:
  **46 source-reported radii, checksum verified, byte-identical**.
- Targeted Python tests for source corruption, physical provenance reproduction,
  and atomic complete-generation replacement with injected exchange failure:
  **3 passed / 7 deselected**. Verified that the publisher stages all pending
  lazy artifacts before exchange, and retained-default callers preserve existing
  unrelated files.
- Backend scoped suite (`test_epo_outcome_contracts.py`,
  `test_sbdb_legacy_publication.py`, `test_ws_resource_contract.py`):
  **57 passed**, two pre-existing deprecation warnings. Includes sparse copy/LRU
  assertions, both seek directions, legacy SBDB early side-effect rejection,
  real positive/negative smoke and original inconclusive stress episodes.
- Independent native IAS15 cancellation probe initialized actual `ALL_BODIES`,
  wrapped the class native integration entry only to measure calls, waited for
  native seek entry, delayed 5 ms and requested cancellation. Forward cancellation:
  **4.325 ms**, max native span **0.1 year**. Backward cancellation from year 2001
  toward J2000: **4.820 ms**, max native span **0.09999999999999998 year**.
  Both raised `SeekCancelledError`, joined without a surviving thread, and kept
  checkpoint list `[0]`. These are machine-specific observations, not universal
  latency guarantees. The initial attempt to instrument a simulation instance
  was rejected because its native `integrate` attribute is read-only; the final
  class-level wrapper delegated to the unchanged native integrator successfully.
- Source inspection confirms original thirty stress payloads/policies remain
  unchanged; only the explicitly named default contract family was added. No
  physical limits, upstream oracle captures, mining defaults, missing masses, or
  benchmark expectations were altered to make failures pass.
- Both reviewed trees were clean at their specified commits after these probes.

## Scope qualifications

The catalog result establishes lossless parsed-source storage, not improved
Float32 GPU accuracy or independently verified asteroid trajectories. Moon oracle
accuracy uses the existing per-model limits and retained source supplements;
the 423-model denominator does not imply a newly uniform accuracy guarantee.
Actual production info/focus functions were exercised through existing DOM
stubs; this review did not run a browser screenshot. The full backend/frontend
suites and expensive all-shard clean rebuild are implementation-reported evidence,
not independently rerun in their entirety here. No further important catalog,
seek, or SBDB publication issue was found during this review.

Awaiting scoped F-018 repairs and independent rereview before final approval.

## Scoped rereview — `197bd6948a2bdcb26166fa685beeabc2de011d3b`

Reviewed only the repair diff from `22d2c6e` plus the affected verifier/runner/
diagnostic behavior. The coordinator identifies integrated equivalent `4fab6ae`;
the independent execution below used the original backend tree at `197bd69`.

**Finding 1: ADDRESSED.** Replaying both original real-result mutations now
returns `(False, ['incomplete_search_evidence'], {'mission_score': None})`.
The verifier requires completed/untruncated mission accounting, exact evaluated
candidate count, and explicit completed outbound/return search evidence for each
candidate. An optional aggregate search cannot contradict that evidence.
Independently tried 18 additional mutations: both candidate search directions
with false completion, true truncation, exhausted budget, truncated stages, or
inconclusive termination reason; and eight missing/wrong-type/inconsistent
`candidatesEvaluated` values. Every mutation was rejected. The unmodified real
physical-negative result still passes.

**Finding 2: ADDRESSED.** Replayed the original missing rejection error, null
candidate, and list-valued rejection error. All now return failed episode
records, retain actionable reasons (`invalid_request_rejection`,
`request_rejection_mismatch`, or `invalid_candidate_evidence`), and serialize
through `record.as_dict()` and `json.dumps` without throwing. Reviewed the new
nested verification/logistics/burn shape checks and safe diagnostic traversal;
these preserve valid result behavior while rejecting missing evidence.

Independent scoped verification:

- `backend/tests/test_epo_outcome_contracts.py`: **27 passed in 10.16 seconds**.
- Real default smoke replay: **3 total, 3 passed, 0 failed, 0 exceptions**.
- Original independent counterexamples and the 18 additional completeness
  mutations above: all expected outcomes observed.
- Repair diff whitespace check passed; backend worktree clean at reviewed HEAD.

No new important breakage found in the repair diff. **Final review verdict:
Task 1 and Task 2 closure justified for all six assigned findings**, subject to
the previously stated scientific and review-scope qualifications. This verdict
supersedes the initial F-018 blockers above; no full-suite duplication was run.
