# Task 2 backend implementation and evidence

Historical implementation report, archived on 2026-11-01. Commands and results
below refer to the implementation worktree and commit stated in the report,
not final integrated acceptance. See README.md for commit mapping and scope.

Worktree: `/home/nomad/ai/projects/worktrees/solar-partials-backend-20261031`.
Branch: `fix/partials-backend-20261031`. Base: `8d330a07`.
No push, merge, subagents, live upstream requests, or public-service load tests.
Root owns consolidated README/documentation updates and independent review.

| Finding | Commit | Result |
|---|---|---|
| F-013 | `6224b86` | Sparse checkpoints retained; forward/backward native seek segments bounded to .1 year; cancellation propagates |
| F-018 | `b35ebdb` | Inherited cargo/risk fixes verified end to end; explicit default smoke contracts; original 30 stress inputs/policies retained unchanged with actionable failures |
| F-021 | `22d2c6e` | Unsafe source publication retired before side effects; preview and shared query helpers retained |
| F-018 independent-review followup | `197bd69` | Require explicit search completion and fail closed on malformed negative results |

## Reproduction environment and commands

All Python commands used the existing cached, locked environment, with no install:

```bash
env PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend \
  OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 \
  uv run --offline --no-project --python 3.12.13 \
  --with-requirements ci/backend-test-requirements.txt python ...
```

Below, `python ...` means that complete launcher followed by the indicated
arguments, from the implementation worktree. Pytest uses `-p no:cacheprovider`.
The only reported warnings in scoped runtime checks were existing Starlette/
httpx and AnyIO deprecations. No product caches or bytecode were generated.

## F-013: cancellation and throughput

Root cause: the cancellation event was inspected between native calls covering
up to ten years. The small-backward direct path also omitted cancellation
inspection and could swallow a cancellation exception in its fallback handler.

Red: updated cancellation tests for forward and direct backward seeks, plus a
checkpoint materialization test. All three failed against the original source:
forward advanced 10 years, backward did not raise, and native spans were 10 years.

Green: an independent seek helper limits each native integration call to .1 year
and checks cancellation after every call. The ten-year checkpoint schedule and
LRU limit remain independent. Direct backward cancellation propagates rather
than invoking fallback. The final safety fallback uses bounded calls too.

```bash
python -m pytest -q -p no:cacheprovider \
  backend/tests/test_ws_resource_contract.py \
  backend/tests/test_rebound_epoch_contract.py \
  backend/tests/test_runtime_review_regressions.py
```

Result: **92 passed**, 2 existing deprecation warnings, 10.08 seconds.
The new copy regression seeks 30 years: native spans <=.1 year, copies only at
10/20/30 years, final LRU indices `[2,3]` with a limit of two.

Native production probe: initialize real IAS15 with ALL_BODIES; run a paused
SimulationRunner seek; wait for command entry, delay .005 seconds, call stop,
then inspect return value and actual worker liveness. Three runs per direction:

| Direction | Stop latency, ms | Stop result / surviving worker |
|---|---|---|
| forward | 3.302, 4.092, 3.297 | true / false, all three |
| direct backward | 3.249, 2.951, 2.931 | true / false, all three |

The forward target was the supported 2050 endpoint, starting at J2000. Backward
started at year 2001 and targeted J2000. This is machine-scoped evidence below
the historical 16.7 ms frame target, not a hardware-independent wall-clock bound.
Deterministic tests assert bounded native time spans and ownership semantics.

Throughput probe: initialize once, copy identical initial simulations; compare
50 years using five original-size 10-year native calls against production
set_julian_date at the same epoch, including sparse checkpoint copying.

| Probe | Baseline seconds | Bounded seconds | Ratio |
|---|---:|---:|---:|
| initial run, overlapping runtime tests | 1.854763 | 2.282862 | 1.230810 |
| isolated 1 | 1.899317 | 2.013318 | 1.060022 |
| isolated 2, reversed execution order | 1.867279 | 2.001609 | 1.071938 |
| isolated 3 | 1.874928 | 1.977664 | 1.054794 |

Median isolated overhead: **6.0%**. Earlier read-only exploratory native-call
comparison was approximately 4%; production overhead is not claimed to be <5%.
The competing-load 23% observation remains disclosed. Fifty-year production seek
retained six sparse checkpoints, including its original checkpoint.

## F-018: cargo/risk and honest EPO outcomes

The inherited storage and risk changes required no additional physics rewrite.
Original audit mass/risk probe replay now reports:

| Quantity | Result |
|---|---:|
| Continuous-production departure stock | 951.6258196404043 kg |
| Arrival after return transit | 779.1253239626399 kg |
| Arrival with 500 kg departure capacity | 409.3653765389909 kg |
| Payload p05/p50/p95 with every delivery infeasible | 0 / 0 / 0 kg |
| Capacity-capped feasible fixture payload p95 | 1000 kg |

The analytic fixture is ten days at 100 refined kg/day, loss .01/day, twenty
return-transit days. It separates continuous stock production, capacity at
departure, and subsequent transit survival. Initial scoped inherited coverage:
**94 passed** for storage transport plus EPO smoke contracts.

Added a fully real planner case with no trajectory or physics doubles. Payload:
Earth–Mars–Earth, JD 2460500.5, Kepler, zero assists, payload 100 kg, mining 10 days,
extraction 1 kg/day, loss .001/day, risk 30 samples; three stages each dry 1000 kg,
propellant 20000 kg, Isp 900 s, reserve .02. The planner returns verified `ok`:
18.9554597306 km/s modeled burns, 1.40989875708 kg departure cargo,
.838213781640 kg delivered, risk failure 0. The test independently integrates
stock, applies handling once and return survival, checks return-burn cargo,
capacity/risk bounds, and charges used propellant exactly once in the score.

This is an ideal impulsive, nuclear-thermal-style modeled-feasibility example.
It is not certification of finite thrust, structure, surface mining, or flight.
Its economic score is negative; smoke does not pretend physical feasibility
establishes profitability.

### Why the old thirty cases cannot be assumed to succeed

Replayed all thirty original payloads without modifying their success policies:

- 17 `no_verified_candidate`: all four evaluated candidates fail the empty-cargo
  vehicle budget, return no payload and fail risk constraints.
- 2 `trajectory_search_inconclusive`: Pluto and Eris also have failed evaluated
  candidates, but assist-depth-one work reaches `assist_depth_1_budget_exhausted`.
  The unsearched space remains unknown; these remain failing episodes.
- 11 `request_rejected`: `mission_propulsion_body_unsupported` with exact body
  context: flora, sedna, metis, amphitrite, euphrosyne, cybele, sylvia, camilla,
  varuna, ixion, salacia. Every listed catalog entry has `mass_kg=None` and a
  finite radius. Parking/capture cannot be computed without a mass; no masses
  were invented to make a smoke test pass.

The nineteen candidate-bearing cases demand approximately 31.7–632 km/s across
retained candidate burns. For example the original Ceres case requests
36.31188379596 km/s, while its baseline chemical vehicle can supply only
3.71619611953 km/s before running out of usable propellant, even without cargo.
This explains that candidate rejection; it does not prove global impossibility
for every trajectory or spacecraft. Search bounds were not raised or disabled.

### New smoke contract

Default smoke now runs three explicitly labeled contracts:

1. `verified`: the feasible mission with nonzero storage/transit loss.
2. `vehicle_infeasible`: enormous payload and complete evaluated candidates
   failing the empty-cargo burn budget. Passing requires exact result status,
   no recommendation, candidates, rejected verification, physical budget failure,
   positive unmet delta-v, zero cargo, and zero cargo added in every burn.
3. `request_rejected`: flora parking mass rejection, matching exact code/body.

Missing routes, missing evidence, different input rejection, and inconclusive
search never pass the negative contract. Three passed contracts mean one
verified mission and two expected negative outcomes, not three successful missions.
Failures now report each episode's observed status, expected outcome, candidate
verification reasons, search termination reasons and rejection code/body.

The original thirty inputs/policies remain `SAMPLE_EPISODE_FAMILIES` and can be
selected by their original names. Their failures were not relabeled as success.

```bash
python -m mission.epo.smoke_test --compact
# exit 0: total 3 / passed 3 / failed 0 / exceptions 0

python -m mission.epo.smoke_test --family mining_core --family outer_reacher \
  --family return_pressure --compact
# exit 1: total 30 / passed 0 / failed 30 / exceptions 0
```

Red: new default smoke test observed the old 0/30 result, diagnostics were absent,
and outcome fields were unsupported. Green focused mission/EPO suite:

```bash
python -m pytest -q -p no:cacheprovider \
  backend/tests/test_epo_outcome_contracts.py backend/tests/test_epo_smoke_contract.py \
  backend/tests/test_epo_single_family_policy.py backend/tests/test_mission_storage_transport.py \
  backend/tests/test_mission_mass_flow.py backend/tests/test_mission_propulsion_contract.py \
  backend/tests/test_mission_reserve_partition.py backend/tests/test_mission_agents.py
```

Result: **156 passed**, 4.84 seconds. Includes explicit Pluto/Eris failure guards,
wrong rejection guards, missing-budget guards, and malformed planner-result
reporting. No benchmark reference/expectation was changed.

### Independent-review correction

Review found that the first negative verifier checked only top-level status and
would accept missing/contradictory search-completion evidence. It also found
uncaught malformed rejection/candidate/burn shapes. Commit `197bd69` adds explicit
completed, nontruncated mission evidence, completed outbound/return candidate
searches, and consistency with any supplied aggregate root search. Missing,
deadline, truncated or inconclusive evidence fails closed. Malformed dictionaries,
candidate lists, verification/logistics/burn entries and rejection context/code
produce actionable failed records and serializable diagnostics without crashes.

Red: six real-negative search mutations were incorrectly accepted; malformed
result mutations crashed. The initial combined run had 14 failures and 1 pass;
the ninth malformed case was then focused on the request-rejected contract and
also reproduced its context-shape crash. Green: **123 passed in 9.25 seconds**:

```bash
python -m pytest -q -p no:cacheprovider \
  backend/tests/test_epo_outcome_contracts.py backend/tests/test_epo_smoke_contract.py \
  backend/tests/test_epo_single_family_policy.py backend/tests/test_mission_storage_transport.py
```

Parent owns subsequent independent rereview and integrated full validation.

Public default vehicle and mission defaults are intentionally unchanged.
POST `/mission/plan {}` remains a safe 422/no-verified-candidate result with the
baseline chemical vehicle; the successful modeled payload is explicit. This is
not presented as a successful default public mission workflow.

## F-021: retire obsolete source publication

Root cause: sequential writes to bodies.py then deleted planets.js, after a
catalog-cache write. Original missing-second-target regression reproduced the
first-file mutation before the error. The stale append routines were removed.

Default, selection-only, explicit `--write`, and `--dry-run --write` invocations
now return actionable argparse exit 2 before cache setup, reads/fetches or writes.
Help exits 0 and names the maintained builder. `--dry-run` retains textual preview;
query caches may be populated, but sources and sbdb_catalog.json are not published.
Shared SBDB query constants/helpers used by maintained builders are preserved.

Red: **5 failed, 1 passed**; two failures showed actual first-output mutation with
the absent second target. Green:

```bash
python -m pytest -q -p no:cacheprovider \
  backend/tests/test_sbdb_legacy_publication.py backend/tests/test_catalog_cli_write_policy.py \
  scripts/test_catalog_generation.py scripts/test_catalog_science_review.py
```

Result: **73 passed**, 5.64 seconds. All acquisition in these tests is synthetic
and all output paths belong to pytest-owned temporary directories.

Migration wording sent to root: legacy source publication is retired;
`fetch_jpl_sbdb.py --dry-run` previews and may populate query caches. Use
`build_asteroid_phase1_dataset.py` for validated offline preview, or its explicit
`--write` mode for maintained bundle publication.

## Full validation and handoff

Full backend suite:

```bash
python -m pytest -q -p no:cacheprovider backend/tests
```

**4,485 passed, 13 skipped, 2 existing deprecation warnings**, 178.03 seconds,
exit 0. Skipped optional native prerequisites are not counted as passes.

After the review followup, an additional worker-owned full run was interrupted
at the parent's request to avoid duplicate work during its integrated full run:
partial **3,667 passed, 2 skipped, 2 warnings**, no observed failures, exit 2 from
KeyboardInterrupt after 208.37 seconds. Only its exact Python PID was signaled,
after checking owned worktree cwd and pytest argv. No outside CPU work or parent
process was touched. This interrupted run is not a full-suite pass.

`git diff 8d330a07..HEAD --check` passes. Implementation worktree clean after
three finding-specific commits plus the atomic review followup. Parent independent review requested with brief,
base/head and concern areas; no worker-owned reviewer/subagent was spawned.
