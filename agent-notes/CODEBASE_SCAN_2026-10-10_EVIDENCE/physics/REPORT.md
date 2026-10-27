# Physics, catalog and mission sweep — 2026-10-10

Read-only product audit. All scripts/results in this directory are newly generated evidence. No product files, old reports, dependency declarations, or datasets were edited. The dangerous moon updater was exercised only in a temporary copy with a local fetch stub.

## Branch scope and method

- Main: `e7de6cc20ea0880da230432ea0c44f8f6ae93829`.
- CI: `0523a5bc94360f281f5c8c692b16a4fbc6dd60bc`; source tree exactly identical to main per root audit.
- Trajectory: `e40fc8cff85a8c7cf5dd24d0a135552faf424a20`.
- Snapshots: `/tmp/solar-sweep-2026-10-10-j1gnowo_/{main,ci,trajectory}`.
- `source-hashes.json` records 42 inspected or traced files. All are byte-identical across these tips except `orbitMath.ts`, whose two differences are blank lines. **No physics-math fix branch was assumed merged.** The hashes are identity evidence, not a claim of exhaustive line coverage.
- Offline probes ran separately against main and trajectory with the prepared main pinned interpreter `/tmp/solar-sweep-2026-10-10-j1gnowo_/venv-main/bin/python`. CI inherits identical-source results; it was not redundantly probed here. Root owns standard suite results.
- Probe exit 0 means observations captured, not scientific invariants passed. Frontend checks are Node CPU checks, not GPU readback/browser measurements. Python probes prohibit their urllib network calls.
- Exact numerical observations: `backend-{main,trajectory}.json`, `frontend-{main,trajectory}.json`, `tools-{main,trajectory}.json`.

## Newly confirmed findings for assignment of stable tracker IDs

Temporary labels below deliberately do not allocate global SCN IDs. All six entries apply to **main, CI and trajectory**. Line references are the main snapshot; the backend files are identical at all three tips.

### PHYS-N01 — Reserve enforcement depends on arbitrary burn partitioning

**P1; high confidence; reproduced.** `backend/mission/vehicle_service.py:79–80` recomputes usable propellant as `remaining * (1-reserve_fraction)` for each burn. It therefore repeatedly spends what was previously a protected reserve. The code does carry spent fuel between burns; the defect is the reserve floor.

**Reproducer:** `probe_backend.py`, `reserve_partition`. A single stage has 100 kg dry mass, 1,000 kg propellant, 300 s Isp, 100 kg payload and 5% reserve. Request `[4.8]` km/s, then `[2.4,2.4]` km/s with the identical vehicle.

**Actual:** Single burn is infeasible with 0.1851398 km/s unmet, after consuming 950 kg. Split burns are feasible after consuming 965.2477049 kg; only 34.7522951 kg remains. **Expected:** With no intervening mass/staging event, splitting the same ideal impulsive total delta-v must not change feasibility or permit spending below the stage's 50 kg reserve floor.

**Impact/callers:** `backend/mission/agents.py:480–486` uses this service for outbound and return burns. This can produce optimistic deterministic feasibility independently of the missing cargo transition. The probe does not assert a complete endpoint recommendation was accepted.

**Closure:** Define reserve against initial stage fuel (or an explicit policy), preserve it across the chronological burn ledger, and require burn-partition invariance and reserve-floor tests across stage transitions. Separate expelled fuel from fuel still aboard.

**Old-ID reconciliation:** New root cause; related to SCN-019 mass ledger and SCN-020 margin/risk, not a replacement for either. An additional observed SCN-020 mechanism is `propellantMarginKg` at line 148 counting jettisoned reserve: the infeasible default-vehicle case reports 1,275 kg margin while every stage is jettisoned and onboard fuel is zero.

### PHYS-N02 — Ordinary REBOUND stepping bypasses its validated date interval

**P1; high confidence; reproduced.** `backend/sim/rebound_nbody.py:404–408` integrates a computed target without `_validate_supported_jd`, whereas initialization/seeking enforce `[2447892.5,2469807.5]` JDTDB. The public metadata continues claiming `fidelity: high` and listing the validated interval.

**Reproducer:** `probe_backend.py`, `rebound_range_step`: initialize the real REBOUND engine at `2469807.5`, then `step(1)`. It emits `2469808.5` with `fidelity: high`. Seeking directly to that same date raises `ValueError` for leaving the validated interval.

**Expected:** Identical epoch support semantics for seek and ordinary playback. Playback should stop/reject before leaving coverage, or explicitly downgrade/mark unsupported according to a defined contract.

**Reachability:** Main `backend/server.py:4353–4354` calls `engine.step(time_scale*frame_time)` during playback. Its range check at `4457–4469` only applies to `set_julian_date`. Root can integrate this with its WS findings. The UI/server speed cap does not prevent eventually crossing the endpoint.

**Closure:** Bound both positive and negative playback, validate finite increments at the engine boundary, and test endpoint crossing plus truthful fidelity/availability. Preserve valid in-range seek/checkpoint behavior.

**Old-ID reconciliation:** New residual; does not reopen the repaired J2000 initial conditions, AU/day contract, or IAS15 compatibility.

### PHYS-N03 — Backend binary initializer violates its circular-speed and barycenter invariants

**P2; high confidence for speed; mass weighting conditional on the conventional companion/primary ratio used by the frontend; reproduced.** `backend/sim/kuiper.py:156–157` computes mean motion with `max(1e-12,separation_au**3)`. This floor alters all separations below 0.0001 AU (~14,960 km), despite the configured range starting at 1,000 km. `:173–193` also gives the primary the larger offset when the sampled mass ratio is below one, the reverse of the frontend mass split in `src/sim/kuiperBelt.ts:346–348`.

**Reproducer:** `probe_backend.py`, `binary_initializer`, calls the actual initializer at 1,000 km separation, e=0, M=0, inclination=0 and q=0.35. Nominal total mass is the class's own `5e-13 Msun`.

**Actual:** Relative speed `2.9698838e-5 AU/year`; **expected** from `sqrt(mu/a)` is `0.0017184131 AU/year` (about 57.9 times larger). Under q=m_companion/m_primary, the purported barycenter shifts `-3.2185049e-6 AU` (~481.48 km), with nonzero COM velocity; expected weighted offset/velocity are zero. The speed failure is independent of how q is named.

**Impact/limits:** The initialized pairs occur in the on-demand backend Kuiper simulation. Both particles subsequently have zero gravitational mass (`:368`, `:408`), explicitly documented at `:79–81`; mutual binding is not integrated. Fixing only the initializer cannot establish persistent physical binary dynamics. No new long-duration binary integration or renderer claim is made.

**Closure:** Remove unit-inappropriate floors over the supported separation domain; define q's orientation, enforce weighted COM invariants, and gate circular/elliptic relative states against independent formulas. Either implement mutual motion or label the backend pair approximation truthfully. The 5-decimal position serializer (`:456–459`) should also be assessed before claiming resolution of 1,000 km pairs.

**Old-ID reconciliation:** Promotes the binary portion of SCN-049 with new precise arithmetic evidence. Preserve the repaired incoming AU/day→AU/year conversion; that separate fix still stands.

### PHYS-N04 — Tudat energy diagnostic mixes incompatible origins

**P2; high confidence; reproduced on injected documented states; Tudat runtime not installed/executed.** Tudat central-body definitions at `backend/sim/tudatpy_hooks.py:243–245` store Sun relative to SSB and other bodies relative to Sun. `get_state()` correctly reconstructs barycentric states, but `get_energy()` at `:425–434` directly subtracts these mixed-origin positions and uses mixed velocities.

**Reproducer:** `probe_backend.py`, `tudat_energy_translation`, injects a Sun/Earth state with Earth at 1 AU and 29,780 m/s heliocentric. Change only the Sun's SSB position from zero to 0.01 AU, leaving the physical relative orbit and velocities unchanged.

**Actual:** Energy changes from `-2.6513706e33 J` to `-2.7049009e33 J`, a 2.01897% change. **Expected:** A common spatial translation leaves energy invariant; in this mixed representation only the Sun-relative-to-SSB coordinates change.

**Impact:** A false conservation diagnostic when the optional Tudat engine is used; this does not invalidate its separately corrected output frame normalization.

**Closure:** Reconstruct one inertial origin for every particle before energy calculation, test spatial-translation invariance and the documented kinetic-energy frame convention, then validate under a real Tudat installation.

**Old-ID reconciliation:** New confirmed diagnostic defect from the SCN-049 latent Tudat/energy domain. No claim about an installed/deployed Tudat path.

### PHYS-N05 — Direct EPO family execution omits its family policy

**P2; high confidence; reproduced.** `backend/mission/epo/runners.py:64–68` executes a supplied `EpisodeFamily` but does not register its policy. Only `run_families()` at `:72–74` does so. The default verifier then lacks the score/risk/embedded-verification gates.

**Reproducer:** `probe_backend.py`, `epo_family_policy`. Use a family requiring score ≥100, failure probability ≤0.01 and a valid embedded verifier; supply a deterministic stub planner result with score -100, failure probability 0.9 and `verification.valid=false`.

**Actual:** `run_family(family)` reports 1 pass/0 failures. `run_families([family])` reports 0 passes/1 failure and all three rejection reasons. **Expected:** Equivalent policy enforcement for both public entry points.

**Impact/limits:** False-positive EPO smoke/episode acceptance for direct library users. The existing main smoke workflow uses `run_families`, so this is not a claim that its registered-policy suite currently bypasses checks. Planner intentionally stubbed to isolate policy wiring; actual verifier is used.

**Closure:** Register/apply the family policy consistently inside the single-family entry point, and test direct versus aggregate execution equivalence without prior verifier state.

**Old-ID reconciliation:** New EPO reliability finding; independent of scientific Monte Carlo SCN-020.

### PHYS-N06 — Dormant SRP and galactic-tide callbacks cannot consume actual REBOUND callback arguments

**P2; high confidence; reproduced; inactive module defect.** `backend/sim/radiation_pressure.py:189` and `backend/sim/galactic_tide.py:124` treat the callback argument as a Simulation object (`reb_sim.particles`). REBOUND calls the registered Python callback with an `LP_Simulation` pointer.

**Reproducer:** `probe_tools.py`, `dormant_callbacks`, registers an observer wrapper with a real REBOUND simulation and delegates its unmodified callback argument into each actual helper. Both raise `AttributeError: 'LP_Simulation' object has no attribute 'particles'`.

**Expected:** A registered callback dereferences the supported pointer interface and applies its acceleration; no exception at the first particle access.

**Impact/limits:** Source search finds no registration of these helpers in the shipped `REBOUNDEngine` or `KuiperBeltEngine`. Thus this is an activation hazard, not proof that current default dynamics silently include failed extra forces. SRP's docstring also recommends `particle.params['beta']`, whereas its code reads a `beta` attribute; no REBOUNDx integration is shown. That additional parameter plumbing remains unverified beyond source review.

**Closure:** Use the supported callback contract and validated per-particle coefficients, test an actual integration acceleration delta with the models enabled, and declare frame/time units for the tide callback. Avoid claiming either force is enabled before this wiring exists.

**Old-ID reconciliation:** Splits a confirmed dormant-force activation defect from SCN-049. Scientific PR-drag and full rotating galactic-tide formulas remain an independent verification queue; this audit did not obtain a fresh external force-model oracle.

## Existing tracker reconciliation

All rows below apply to all three selected branches unless stated otherwise. Main line references are shown; `orbitMath.ts` references after its second removed blank line are +2 in trajectory.

| Old ID | Current result and precise evidence | Closure remains |
|---|---|---|
| SCN-012 | **OPEN / OBS.** `backend/benchmark/accuracy.py:509–538`; fresh default Kepler run reports 3 scenarios, 0 comparable, coverage 0.0, mean error 0.0. | Nonzero independent fixed-state comparison coverage; undefined mean error must be unavailable. Artifact integrity is not numerical validation. |
| SCN-013 | **OPEN / OBS (input arithmetic), GPU outcome unmeasured.** `src/frontend/features/asteroids/beltRenderer.ts:65,124–128`; float32 JD 2461320.125 becomes 2461320, ULP 0.25 day. | Relative/split time and subday CPU-vs-GPU gates. |
| SCN-014 | **OPEN / OBS.** `src/data/asteroidCatalogLoader.ts:180,316–394`; own 100,000-row validator reports 99,916 mismatches, max epoch error 0.1249998966 day. | Field-specific quantization contracts and passing format gate. This synthetic ACBF result does not establish corruption in the shipped ASPH catalog. |
| SCN-015 | **OPEN / CODE.** `src/sim/asteroidBelt.ts:154–159` takes the leading unique records; main `src/main.ts:183` targets 50,000; builder `scripts/build_asteroid_phase1_dataset.py:179` requests descending diameter. | Declare the population or use a reproducible representative sampling contract. No new distribution-bias estimate. |
| SCN-016 | **OPEN / CODE + primary source rechecked.** `src/data/planets.ts:85–113` calls JPL's exact EM Bary row Earth, with no lunar correction in `solarSystemModel`. | Explicit EMB label/state or derive consistent geocentric Earth; compare both IDs 3 and 399. |
| SCN-017 | **OPEN / OBS.** `src/sim/orbitMath.ts:202–263,335–360`; positions evolve all elements but fixed-element velocity omits secular derivatives. Three epochs × three finite-difference steps recorded. At elapsed 9775.12345 days, h=.001: Neptune 8.0674256 m/s, Uranus 6.6386912, Saturn 2.8140996, Earth .2715801. | Differentiate evolving elements/axes; convergence gates and independent state budgets. These are internal derivative differences, not new Horizons residuals. |
| SCN-018 | **OPEN / CODE / model scope.** `src/data/planets.ts:261–279`, fixed Pluto elements and no Pluto entry in eight-planet gate. | Supported interval/model and Pluto acceptance tests; no new external Pluto error measured. |
| SCN-019 | **OPEN / CODE.** `backend/mission/agents.py:480–504`, vehicle uses request payload for both legs, then mining closure subtracts fuel from product; `vehicle_service.py:64` initializes one payload. | Chronological acquired-cargo/staging/fuel ledger; changing return cargo must change return propulsion requirements. No blanket per-leg mass reset claim. |
| SCN-020 | **OPEN / OBS.** `backend/mission/risk_service.py:28–115`, agents `:508–518`. Default vehicle with 100+100 km/s demand is infeasible yet risk reports 0.0 failure at zero uncertainties and positive payload. Its 1,275 kg margin is entirely jettisoned. | Propagate deterministic infeasibility and re-close sampled budgets; exclude discarded fuel. Verifier's `agents.py:233–234` still rejects infeasible logistics, so no infeasible endpoint recommendation claimed. |
| SCN-021 | **OPEN / OBS, expanded.** `src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts:62–64,152`; Sgr A* stored radius is 98.9538× smaller than local 2GM/c²; M87 is 101.0526× smaller. Stored radii imply .0008289 AU and 1.27005 AU, contradicting comments .083 AU/127 AU. `smbhPropagation.ts:642` consumes the value. | Derive dimensional constants consistently; gate both SMBHs and related radii. |
| SCN-022 | **OPEN / OBS, expanded-catalog hazard.** `src/sim/orbitMath.ts:168–173`; 10,001-angle e=.99 sweep has max residual 1.3874119e8 radians. Actual committed loaded ASPH population max e=.5555047; this probe does not claim present catalog divergence. | Safeguarded solve/domain enforcement and residual gates near e→1. |
| SCN-023 | **OPEN / OBS + CODE.** `src/sim/solarSystemModel.ts:169–202`, main `src/main.ts:840–845`, workers `src/workers/modelWorker.ts:17,131`. Actual method changes `getWorldPosition('earth')` by .0020039888 AU for the recorded synthetic shift while independent `sampleBodyStateAt` remains unchanged. These world states feed perturbers at main `src/main.ts:491–499`. | Separate canonical scientific state from visual offset; on/off invariance. The probe is synthetic to isolate mutation, not a rendered wave amplitude measurement. |
| SCN-024 | **OPEN / CODE.** Main `src/main.ts:1405–1409` propagates/uploads KBO positions per frame despite pause. | Root frontend audit can assess actual pause/upload counts; no new bandwidth estimate here. |
| SCN-033 | **OPEN / OBS, stronger updater evidence.** `scripts/update-moons-data.mjs:29–80`. Exact script copied into a temp tree; `--help` with a syntactically matched empty table exits 0 and replaces sentinel catalog with `[]`. | Help must exit before I/O; parser must reject empty/invalid populations before atomic write. Product catalog was untouched. Broken texture CLI is delegated to root/frontend tooling review. |
| SCN-034 | **OPEN / OBS + CODE.** Mutable upstream fetches remain. `scripts/build_asteroid_phase1_dataset.py:423,427` calls `relative_to(PROJECT_ROOT)` after writing. Focused external-output probe, substituting encoding/meta only, creates three temp files then raises ValueError. | Pinned inputs/offline rebuild and valid external destinations; transactional output. Full catalog regeneration not executed. |
| SCN-043 | **VERIFY / bounded coverage.** Runtime artifact validator accepts committed four-body fit artifact; catalog has 424 moons, exactly 4 fitted/required (Cordelia, Iapetus, Phoebe, Titan). | Root standard 20-body gates remain scoped; no all-424-moon external accuracy claim. |
| SCN-046 | **VERIFY.** Generator and caches inspected; no fresh mutable-input regeneration. | Archived pinned rows and offline reproducibility proof. |
| SCN-049 | **Partially promoted** to PHYS-N03/04/06; remaining topics below. | Do not close the entire umbrella. |

Primary source for SCN-016: [JPL Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), fetched by web tool during this audit. Table 1 gives the matching Earth/Moon barycenter row and bounds its fit to 1800–2050. The source also specifies JDTDB. No new live Horizons vectors were fetched.

## Preserved behavior and limits

- The actual 100,000-record committed asteroid artifact passes its existing metadata, version, row-count, taxonomy and SHA-256 acceptance checks in both source snapshots. SHA-256: `a0b8328ca9b74399df500b1fa463e1157b9c30983cbf967c774745d78c08823d`. This is an integrity/format observation, not validation of all orbit elements against live SBDB.
- Worker buffers are still Float64 with explicit availability and source-index contracts. Main model required-ephemeris failure remains explicit, and the four committed moon fits pass parser validation. Generic backend nonfinite/catalog corruption resilience was not exhaustively fuzzed.
- UTC↔TDB conversion, native moon source-frame propagation, strict N-body initial-condition data/hash/frame validation, IAS15 seeding and incoming Kuiper velocity conversion are present. Root owns their fresh standard-suite results; this audit does not reopen their historical blanket claims.
- Optional Tudat `enable_srp` is still only stored/logged/reported (`tudatpy_hooks.py:182,299,315`); the acceleration construction `:256–285` contains gravity only. `TudatPyEngine(enable_srp=True).get_state()` advertises SRP without any force being constructed. Treat this as **SCN-049 OPEN / CODE, dormant capability**, not proof of an enabled production path.
- Galactic tide, radiation-pressure, dust-size, beta and Yarkovsky helpers were reviewed for callers/units. No shipped registration was found. Do not treat a working standalone formula as evidence it influences the app, and do not claim full PR/galactic scientific correctness from callback fixes.
- Nearby catalog parsing/lookup and strict initial-condition loader reviewed. Current local-system manifest acceptance is left to root's backend tests. No fresh Gaia cross-match or stellar coordinate oracle was run.
- `sourceFrameOrbit.ts`, satellite J2/core transforms, procedural frontend KBO/binary paths and SMBH propagation were sampled for boundaries/units. No new external satellite/SMBH oracle, GPU verification, long-duration dynamics, mining economics model validation, or real TudatPy execution.
- Mining storage treats all material as stored for the entire mining+transport interval; return cargo handling remains SCN-019. The intent/physics of that simplified accumulation model was not independently established here, so it is not allocated another defect.

## Reproduction

From the original repository:

```bash
/tmp/solar-sweep-2026-10-10-j1gnowo_/venv-main/bin/python \
  agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/probe_backend.py \
  /tmp/solar-sweep-2026-10-10-j1gnowo_/main
python agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/run_frontend.py \
  /tmp/solar-sweep-2026-10-10-j1gnowo_/main
/tmp/solar-sweep-2026-10-10-j1gnowo_/venv-main/bin/python \
  agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/probe_tools.py \
  /tmp/solar-sweep-2026-10-10-j1gnowo_/main
```

Replace final `main` snapshot argument with `trajectory` for the second implementation snapshot. Source hashes establish CI applicability. Frontend harness replaces `__SNAPSHOT__` in the retained template, bundles with that snapshot's esbuild and writes JSON beside the script. Temporary snapshot/interpreter paths are not promised durable; preserved commit IDs and scripts allow recreation.
