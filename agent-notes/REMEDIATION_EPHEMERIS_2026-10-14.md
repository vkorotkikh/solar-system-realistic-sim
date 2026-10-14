# Ephemeris remediation checkpoint, 2026-10-14

## Integration and closure boundary

Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris`.
Baseline: `5be8696db4008bc969d09c3cbd258ba911580a07`.
This is a scoped implementation checkpoint, not a declaration that the canonical register or all scientific validation is complete. No master tracker, mission budget, Lambert solver, planet poles, quadtree rendering, or accessibility code was edited. No subagents were spawned.

The controller reports mission commit `2613436` is now merged. Preserve that branch's exact allowlist and no-redirect security changes when integrating. This branch changes only `EphemerisSample.model_metadata` and the catalog `_sample_kepler` path in `backend/mission/ephemeris_service.py`; it does not change request redirects or allowlists. Existing `catalog_orbit_reference` and `catalog_elements` compatibility labels are retained. Precise target/model definitions are additional metadata, not a silent contract rename. `src/data/planets.ts` changes only shared secular coefficient sourcing, not poles.

## Issue-by-issue status

| Item | Status at this checkpoint | Implementation and evidence | Remaining requirement |
| --- | --- | --- | --- |
| SCN-017 | Repaired; derivative gates passing | Frontend secular propagation uses the complete source-frame state derivative, including element and basis rates. Five epochs and two finite-difference steps cover all nine planet models; a synthetic case exercises every rate including changing semimajor axis without a supplied longitude rate. | A derivative-consistent approximate model is not automatically externally accurate. See SCN-080 bounds and limitations. |
| SCN-054 | Repaired initialization and serialization | Removed the separation-cubed floor; corrected companion mass fraction to `q/(1+q)` for companion/primary ratio `q`. Validate finite positive separation and ratio. Nine physical invariant cases cover mass weighting, relative vis-viva and angular momentum; serialized tight binaries retain separation and velocity. | Kuiper particles remain massless test particles: the binary is an initial osculating state, not a maintained mutual two-body orbit. This limitation is explicitly emitted. |
| SCN-055 | Code repaired; OPEN for native evidence | Mixed central-body states are reconstructed into one SSB origin before kinetic and potential energy. Synthetic coordinate-translation regression passes. | Real Tudat is absent. A native mixed-origin/translation run is mandatory for full closure. The diagnostic is a point-mass energy proxy, not the complete J2/J4 potential energy. |
| SCN-057 | Repaired; real REBOUND acceleration gates passing | Both force modules dereference the supported callback pointer via `.contents`. Caller-owned `beta_by_index` replaces unsupported arbitrary particle attributes. Tests install SRP, tide, and combined callbacks in actual REBOUND 5.1.1 and integrate with gravity disabled to isolate acceleration. | Dormant production callbacks are not newly activated. PR drag is separately tested, not silently wired into production. |
| SCN-074 | Repaired for all 13 identified fallback bodies; sampled per-body bounds passing | Insert each osculating fallback state at its declared epoch into the evolved active system, then integrate to the common epoch. Per-body source frame, epoch, provenance, fidelity and applicable sampled bounds survive wire normalization. Independent Horizons captures cover every identified body at four epochs. | Bounds are sampled, not continuous. They apply only to the exact canonical input orbit, IAS15, and full active major-body set; modified configurations and other fallback bodies explicitly remain unbounded/approximate. |
| SCN-076 | Repaired; independent polar-component gates passing | PR drag is `-beta GM/(r^2 c) * (v_r r_hat + v)` relative to the source. Circular, inward and outward radial, and eccentric cases independently check radial/tangential components and dissipated power. Static outward SRP is separate. | No production activation or broader radiation model claim. |
| SCN-077 | Code repaired; OPEN for native evidence | Continuous chunk handoff uses the previous integrated state, signed propagation steps, and exact termination; SPICE reseeding is restricted to initialization. TDB metadata is emitted. Adapter-level continuity tests pass. | The adapter test uses an explicitly identified solver double. Native Tudat chunk continuity, actual API compatibility, accumulated J2/J4 effects and energy behavior must be demonstrated before closure. |
| SCN-080 | Shared bounded approximate model implemented; independent sampled gates passing | Backend kepler/auto and frontend share secular coefficient data. Backend differentiates the full changing-element model. Five independent Horizons epochs gate all nine planet targets; supported interval, fit interval, source, target meaning and per-body sampled caps are explicit. Outside the supported backend interval, requests fail rather than extrapolate silently. | The gate is not a rigorous continuous error bound. Pluto retains the legacy catalog coefficients, absent from the current eight-planet JPL table, and is separately tested against Horizons target 9. This remains an approximate catalog model, not SPICE fidelity. |
| SCN-081 | Direction repaired; representative independent rates gated | Generic node rate follows `-sign(cos(i))` in the native element plane; polar rate is zero and the measured Triton override remains. All catalog generic node signs are checked, including 287 retrograde moons. Independent Carme/Himalia element captures gate representative retrograde/prograde nodal direction and magnitude. | This is not independent accuracy validation of every moon. Carme remains a coarse mean-element model; all-moon SCN-043 diagnostics are a separate follow-up. |
| SCN-043 (next scope) | Independent capture in progress; NOT closed | Live Horizons capture obtained 422/424 targets at all seven requested epochs. Daphnis cannot supply the requested 2025/2026 states from its current provider solution. The old `75052` identifier resolves to an asteroid, not S/2025 U 1; target validation rejected that response rather than accepting false truth. | Finish explicit target/date-gap handling and commit exhaustive comparison separately. No claim that 27 major fixtures validate all 424 moons. Capture coverage and model accuracy are distinct. |

## Native runtime inventory and blockers

`conda env list --json` enumerated these interpreters, each checked with `importlib.util.find_spec('tudatpy')`:

- `/home/nomad/miniconda3`: absent.
- `/home/nomad/miniconda3/envs/agentic-rag`: absent.
- `/home/nomad/miniconda3/envs/icl-vram-py312-cu132`: absent.
- The specified uv Python 3.12 backend environment: absent.

`conda` and `uv` are installed; `mamba` and `micromamba` are not on PATH. No optional installation was started. The native Tudat regression is explicitly skipped, not counted as native evidence. Next action: supply/install a supported Tudat environment and run the native chunk/energy tests plus an accumulated-J2/J4 trajectory comparison. Mock/adapter tests cannot satisfy that requirement.

Actual REBOUND 5.1.1 was exercised. Frontend tests used local `npm ci --ignore-scripts --no-audit --no-fund` dependencies after the existing root node_modules link lacked Vitest. Runtime was Node 24.21.0/npm 11.19.0, not the project pin Node 22.23.2/npm 10.9.8. The controller should repeat integrated frontend gates with its pinned runtime. No hardware/provider runtime was invented or labeled passing.

## Root-cause reproductions and repairs

Before repairs, the new frontend regression had 13 failures and one pass. The initial backend regression had 19 failures, one pass, and callback exceptions. The added Tudat continuity regression failed with one native skip. The secular backend regression failed 13 of 22 cases. Wire normalization dropped the newly attached per-body fidelity metadata and was repaired after a focused failing test. REBOUND 5.1.1 lacks the attempted `reset_integrator()` API; state transfer now constructs a fresh supported Simulation rather than calling that unavailable method.

The node-direction correction exposed Carme's catalog period inconsistency. Independently captured 183 Horizons element samples, 60-day spacing over 2000-2030, give mean-anomaly slope 0.4901747981374377 deg/day and anomalistic period 734.431883009745 days. That measured period replaces 719.2806 days. Existing external position/velocity/plane budgets were not relaxed. Carme's 2025 position error remains approximately 29.409 million km, versus 47.862 million km with the corrected node sign and old period. This is explicitly not high-accuracy closure.

### SCN-074 independent before/after position errors

The baseline module was loaded from the baseline git revision into an isolated module and run with real REBOUND against the same independent captures.

| JD TDB | Baseline median km | Baseline maximum km | Repaired median km | Repaired maximum km |
| --- | ---: | ---: | ---: | ---: |
| 2447892.5 | 10,084,969.365 | 192,158,494.032 | 158.165 | 2,170.212 |
| 2461000.5 | 11,853,141.809 | 48,290,622.387 | 1.263 | 62.385 |
| 2461327.5 | 12,238,154.182 | 63,039,523.695 | 4.060 | 68.195 |
| 2469807.5 | 23,306,879.302 | 167,929,778.287 | 184.822 | 965.028 |

| Body | Maximum sampled position error km | Maximum sampled velocity error m/s |
| --- | ---: | ---: |
| Hebe | 416.674823 | 0.02145169 |
| Flora | 328.173768 | 0.01481548 |
| Metis | 2170.212167 | 0.12105460 |
| Amphitrite | 687.253791 | 0.03206924 |
| Euphrosyne | 599.540185 | 0.01797796 |
| Cybele | 785.557020 | 0.02629773 |
| Sylvia | 74.545480 | 0.00118238 |
| Camilla | 74.560303 | 0.00232053 |
| Varuna | 184.822190 | 0.00022587 |
| Ixion | 268.323880 | 0.00042619 |
| Salacia | 12.443500 | 0.00014977 |
| Varda | 13.604491 | 0.00014912 |
| MS4 (provider name Mani) | 89.665707 | 0.00012790 |

The exact per-body regression caps and input fingerprints are committed in `backend/data/ephemerides/fallback_validation.json`.

### SCN-080 model and reference quality

Fit interval: 1800-2050. Supported/gated backend interval: JD 2415020.5 through 2469807.5 (1900-01-01 through 2050-01-01). Independent sample JDs: 2415020.5, 2433282.5, 2451545.0, 2460676.5, 2469807.5. Reference: Horizons DE441 geometric heliocentric states, ecliptic J2000, AU and AU/day, TDB. Targets are planetary system barycenters (Earth uses Earth-Moon barycenter), not an unsupported claim of Earth-center precision.

| Target | Maximum sampled position error km | Maximum sampled velocity error m/s |
| --- | ---: | ---: |
| Mercury | 3094.6983 | 2.86864 |
| Venus | 11238.8201 | 3.17339 |
| Earth-Moon barycenter | 4467.7575 | 1.35414 |
| Mars | 69513.2777 | 4.79986 |
| Jupiter | 1149744.8568 | 17.59514 |
| Saturn | 4395687.0410 | 34.31812 |
| Uranus | 1261234.3588 | 15.53116 |
| Neptune | 1099195.2686 | 16.11337 |
| Pluto | 1358629.9656 | 16.00836 |

Caps and model provenance live in the shared `planet_secular_model.json`. These errors explicitly show why the approximate provider must not be presented as a precision mission ephemeris. Independent captures retain the actual query, target/center/frame/unit headers, API signature and SHA256 of the provider response. The Carme/Himalia element captures retain the complete raw API responses.

## Exact executed gates

Backend commands below used this common prefix:

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q
```

Focused combined backend gate: **124 passed, 1 skipped, 44.63 s**. The skip is native Tudat, not scientific success.

```text
backend/tests/test_ephemeris_remediation.py backend/tests/test_fallback_ephemeris_accuracy.py backend/tests/test_secular_ephemeris.py backend/tests/test_ephemeris_service_safety.py backend/tests/test_kuiper_binary.py backend/tests/test_kuiper_velocity_units.py backend/tests/test_galactic_tide.py backend/tests/test_rebound_epoch_contract.py backend/tests/test_nbody_horizons_accuracy.py backend/tests/test_seek_optimizations.py backend/tests/test_sim_registry.py --tb=short
```

After the wire-normalization repair: **23 passed, 1 skipped, 1 deselected, 0.09 s**.

```text
backend/tests/test_ephemeris_remediation.py -k 'not each_explicit_epoch' backend/tests/test_sim_contracts.py --tb=short
```

Final compatibility run after retaining both existing provider labels: **86 passed, 0.67 s**. Neither the Lambert solver nor its tests were edited.

```text
backend/tests/test_lambert_state_contract.py backend/tests/test_nbody_initial_conditions.py backend/tests/test_secular_ephemeris.py backend/tests/test_ephemeris_service_safety.py --tb=short
```

Frontend: **177 passed across 8 files**, latest run 0.638 s.

```sh
npx vitest run src/sim/secularRemediation.test.ts src/sim/orbitMath.test.ts src/sim/orbitMath.accuracy.test.ts src/sim/sourceFrameOrbit.test.ts src/sim/planetPositions.horizons.test.ts src/sim/catalog.test.ts src/sim/moonFrames.horizons.test.ts src/sim/moonEphemeris.test.ts --reporter=dot
npm run typecheck:ratchet
```

Typecheck ratchet passed at **217/226 allowed legacy diagnostics**, no bucket exceeded. This is not a clean strict TypeScript build. The initial strict check exposed nine new narrowing diagnostics in the changed propagation branch; those were repaired, leaving the existing 217 diagnostics. `git diff --check` passed. Full integrated gates are delegated to the controller; a full backend suite was not repeatedly run.

## Fixed files

- State/ephemeris: `src/sim/orbitMath.ts`, `src/data/planets.ts`, `backend/data/bodies.py`, `backend/data/secular_planets.py`, `backend/data/ephemerides/planet_secular_model.json`, `backend/mission/orbital.py`, `backend/mission/ephemeris_service.py`.
- Dynamics/contracts: `backend/sim/rebound_nbody.py`, `backend/data/ephemerides/fallback_validation.json`, `backend/sim/contracts.py`, `backend/sim/kuiper.py`, `backend/sim/radiation_pressure.py`, `backend/sim/galactic_tide.py`, `backend/sim/tudatpy_hooks.py`, `src/sim/catalog.ts`.
- Regression gates: `src/sim/secularRemediation.test.ts`, `backend/tests/test_ephemeris_remediation.py`, `backend/tests/test_fallback_ephemeris_accuracy.py`, `backend/tests/test_secular_ephemeris.py`.
- Independent evidence: `scripts/fetch_remediation_ephemeris.py`, `backend/tests/fixtures/fallback_horizons_remediation.json`, `backend/tests/fixtures/secular_horizons_remediation.json`, `backend/tests/fixtures/carme_elements_horizons_capture.json`, `backend/tests/fixtures/himalia_elements_horizons_capture.json`.

## Primary references and provenance

- [JPL approximate planetary positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html): changing-element equations, Table 1 coefficients and validity interval; the current table lists eight planets, not Pluto.
- [Horizons API specification](https://ssd-api.jpl.nasa.gov/doc/horizons.html) and [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html): geometric vectors, explicit TDB epochs, centers, frames, units, and reproducible request parameters.
- [JPL satellite mean elements](https://ssd.jpl.nasa.gov/sats/elem/): mean-element versus osculating-model limitations, native planes and precession-period definitions.
- [REBOUND supported force callback example](https://rebound.readthedocs.io/en/3.28.4/ipython_examples/Forces/): ctypes pointer `.contents` and velocity-dependent force configuration. Actual execution here used REBOUND 5.1.1.
- [REBOUNDx radiation force implementation](https://raw.githubusercontent.com/dtamayo/reboundx/master/src/radiation_forces.c): Burns, Lamy and Soter (1979), equation 5; subtracting static radial pressure leaves the tested first-order PR drag.
- [University of Texas celestial mechanics, equation 10.128](https://farside.ph.utexas.edu/teaching/celestial/Celestialhtml/node93.html): nodal-rate dependence on `-cos(i)`. The representative moon signs are additionally checked against independent Horizons element histories, not inferred solely from an oblateness formula for every perturbation.
- [Tudat propagation architecture](https://docs.tudat.space/en/latest/user-guide/state-propagation/propagating-dynamics/propagation-architecture.html) and [propagator settings](https://cpp.api.tudat.space/tutorials/tudatFeatures/propagationSetup/propagatorSettings.html): initial states, integrated state histories and arc handoff. Documentation is not a substitute for unavailable native execution.

## Next actions

1. Controller integrates this checkpoint while preserving mission allowlist/redirect ownership, then runs full gates with the pinned Node runtime.
2. Supply native Tudat and demonstrate mixed-origin energy translation invariance, forward/backward chunk continuity, TDB wire metadata, and non-reset accumulated J2/J4 effects. SCN-055/077 stay open until then.
3. Commit the separate all-424 independent reference coverage and exhaustive error assessment, explicitly retaining provider gaps and failed accuracy outcomes. Address newly exposed moon fidelity defects in that next scope rather than calling capture completion an accuracy pass.

## Separate SCN-043 oracle follow-up

Integration checkpoint: `2005a1f`. The following evidence is intentionally a separate follow-up, not a prerequisite for cherry-picking the completed scoped repairs above.

The all-catalog capture is complete as an availability accounting exercise: **424 catalog records, 422 complete seven-epoch captures, one five-epoch partial capture, and one unavailable target**. Thus independent vectors exist for **423/424 bodies**, not 424/424. Requested JDs TDB are 2451545.0, 2451575.0, 2451725.0, 2451910.25, 2453371.25, 2460676.5, and 2461327.5. All successful queries explicitly request parent-center geometric states in ecliptic J2000, AU/AU-day, TDB; each capture includes query, response headers, source solution, API signature, UTC retrieval timestamp, and response SHA256.

- Daphnis (635): five older epochs captured from `sat415_merged_DE437`; the live provider explicitly rejects dates after 2018-JAN-17. The 2025/2026 samples remain missing, with the original error retained. No extrapolated model output is substituted for truth.
- S/2025 U 1 (catalog `S2025_U_1`, 75052): live Horizons returns asteroid `75052 (1999 UM50)`, source JPL#50, instead of the satellite. The target guard rejects it. The live major-body listing omits 75052; alternate provisional-name and 728 probes did not identify the moon. The catalog ID is supported by [JPL's satellite ephemeris table](https://ssd.jpl.nasa.gov/sats/ephem/sep.html), but that does not make the wrong live response valid evidence.
- An independent SPK route exists: [NAIF's published SPK inventory](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/aa_summaries.txt) lists 75052 and Uranus-center 799 relative to barycenter 7 in `ura184_part-2.bsp`, covering 1900-2100. A live HEAD request reports 2,062,529,536 bytes for that kernel; the unsplit SSD kernel is 4,442,362,880 bytes. SpiceyPy is absent from the tested uv environment. No multi-gigabyte download or optional runtime installation was started. Native extraction from this identified kernel is a concrete next action, not an already captured/passing result.

The reproducible all-catalog diagnostic uses the actual frontend catalog with its shipped fitted-moon artifact. **2,959 independently referenced samples were compared, zero model-unavailable samples among the captured epochs.** This is comparison coverage, not acceptable accuracy:

| Descriptive metric | Result |
| --- | ---: |
| Bodies with at least one sampled position error greater than one catalog semimajor axis | 190 |
| Bodies with at least one sampled position error greater than 10% of one semimajor axis | 399 |
| Largest sampled absolute error: S2021_N1 | 101,163,777.712 km |
| Neso maximum sampled error | 71,542,416.717 km |
| Psamathe maximum sampled error | 67,435,154.172 km |

These are descriptive severity counters, not invented scientific acceptance thresholds. The detailed machine-readable assessment retains all 424 records, per-epoch position and velocity errors, the runtime model-quality label, and explicit reference gaps. **SCN-043 remains OPEN for missing reference coverage and substantial demonstrated model-fidelity defects.** The 27-major-moon fixture suite is not used to claim all-moon validity.

Follow-up files: `scripts/capture_all_moon_oracle.py`, `scripts/assess_all_moon_oracle.mjs`, `backend/tests/fixtures/all_moons_horizons_oracle.json`, `backend/tests/test_all_moon_oracle_coverage.py`, `agent-notes/EPHEMERIS_ALL_MOON_ASSESSMENT_2026-10-14.json`. The shared capture helper now reports a wrong-target response explicitly instead of leaking a regex AttributeError; successful target validation is unchanged.

Executed follow-up commands:

```sh
python scripts/capture_all_moon_oracle.py
node scripts/assess_all_moon_oracle.mjs > agent-notes/EPHEMERIS_ALL_MOON_ASSESSMENT_2026-10-14.json
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_all_moon_oracle_coverage.py --tb=short
```

Reference-integrity result: **425 passed, 2 skipped, 0.18 s**. The two full-span skips are Daphnis and S/2025 U 1. Additional passing tests check Daphnis's partial provenance and rejection of the wrong asteroid; those checks do not turn either missing reference into a successful capture. No model-accuracy pass is claimed by this test file.

Next SCN-043 actions: obtain the identified native SPK state for 75052, seek an authoritative current Daphnis solution or restrict its declared interval, establish scientifically justified per-body/per-interval error budgets, and repair the demonstrated phase/frame/mean-element fidelity failures before claiming all-moon accuracy. The completed capture and exhaustive diagnostic make those failures visible without extending this checkpoint into an unbounded 424-body model redesign.

## SCN-043 repair checkpoint 1: actual trajectory repairs

SCN-043 ownership continued after the oracle-only checkpoint. The large errors are model defects, not external blockers. Six new trajectories are now repaired and independently gated: Phobos, Carme, Mimas, Dione, Neso and S2021_N1. Including the four pre-existing fitted moons, this checkpoint has **10/424 fitted, tested bodies**; **413 captured bodies remain model-repair work**, and one body remains provider-unavailable in this worktree's fixture. Daphnis's missing current epochs remain separately explicit. No all-moon closure is claimed.

The preregistered limits are recorded in `agent-notes/SCN043_REPAIR_PLAN_2026-10-14.md`: each new fit must satisfy position <= min(500 km, 0.001 * catalog semimajor axis) and velocity <= 10 m/s. Limits were not increased after failures. The original four models and their existing budgets remain unchanged; their pinned metadata was copied exactly from catalog commit `71ba472` before promotion.

Root causes and repairs:

- Rounded mean periods cannot retain orbital phase: Phobos goes from 9.367 km error at J2000 to 5794.692 km after 30 days in the original model. Parent-relative numerical-source fitting eliminates the phase drift rather than changing its label.
- Several Saturnian mean-element phases are already wrong at the declared epoch; Mimas and Dione now use actual numerical trajectories rather than assuming those descriptive phases are osculating states.
- Irregular bodies require varying eccentricity, plane, apsis and phase. Carme, Neso and S2021_N1 no longer advance one mean ellipse for decades.
- An initial attempt to interpolate osculating features failed for several bodies: fast terms that cancel in the physical Cartesian state become large errors when separately approximated. The repaired representation fits Cartesian states directly; fast moons can use a Fourier phase carrier with slowly varying Chebyshev amplitudes. Both carrier and amplitudes, including segment cross-fades, are analytically differentiated for velocity.

The existing artifact parser now accepts an explicit version-2 mixed collection with legacy element models and `horizons-chebyshev-cartesian-v1` bodies. It validates each model's feature count and carrier harmonics without weakening the legacy provenance/error gates. Runtime states remain parent-relative geometric ecliptic J2000, TDB, AU/AU-day; no fitted trajectory is extrapolated outside its declared interval.

| New repaired body | Fresh held-out samples | Maximum held-out+endpoint position error km | Maximum held-out+endpoint velocity error m/s | Maximum separate seven-epoch position error km |
| --- | ---: | ---: | ---: | ---: |
| Phobos | 36525 | 4.031136 | 2.227770 | 3.733115 |
| Carme | 4566 | 300.808418 | 2.520198 | 193.329961 |
| Mimas | 36525 | 26.809321 | 2.556723 | 16.762563 |
| Dione | 36525 | 283.217335 | 7.752763 | 271.913654 |
| Neso | 4566 | 410.593733 | 1.878466 | 91.833144 |
| S2021_N1 | 4566 | 115.472695 | 1.028873 | 91.833144 |

Every source grid uses fractional-day phase x.125, disjoint from all seven earlier vector-oracle epochs. Half-step numerical-source states and both exact coverage endpoints are independently retrieved and checked, with source/held-out hashes retained in each model. The model interval is J2000 through 2050-01-01. The seven-epoch vector oracle is not used as fitting input. Neso's seven-epoch maximum decreases from 71,542,416.717 km to 91.834 km; S2021_N1 decreases from 101,163,777.712 km to 91.834 km. A candidate failing the fixed budget, such as Styx in this pilot, is not promoted.

All-424 re-assessment is retained as `agent-notes/SCN043_CHECKPOINT1_ASSESSMENT_2026-10-14.json`: the number of bodies above one semimajor axis decreases from 190 to **185**, and those above 10% decrease from 399 to **393**. Remaining errors are still real repair work.

Executed runtime gates:

```sh
npx vitest run src/sim/moonCartesianEphemeris.test.ts src/sim/moonCatalogRepair.horizons.test.ts src/sim/moonEphemeris.test.ts src/sim/moonFrames.horizons.test.ts src/sim/catalog.test.ts src/sim/solarSystemModel.test.ts src/sim/sourceFrameOrbit.test.ts src/sim/secularRemediation.test.ts --reporter=dot
npm run typecheck:ratchet
node scripts/assess_all_moon_oracle.mjs > agent-notes/SCN043_CHECKPOINT1_ASSESSMENT_2026-10-14.json
```

Results: **80 passed, 414 explicitly skipped across 8 files**, 0.581 s. Those 414 skips consist of 413 oracle-available bodies pending repair and one unavailable provider target; they are not scientific successes. The new all-catalog regression retains all 424 test cases and checks actual position/velocity for every promoted body. Four analytic Cartesian tests cover polynomial derivatives, fast carrier phase and derivatives, cross-fade derivative terms, and no mutation/extrapolation on failure. The typecheck ratchet passes at 217/226 pre-existing diagnostics.

Generation uses the standard pinned Python 3.12 uv/backend environment prefix and `python scripts/repair_catalog_moon_ephemeris.py --bodies Phobos,Mimas,Dione,Carme,Neso,S2021_N1 --promote`. The separate driver leaves `scripts/update-moons-data.mjs` and the general generator's transactionality untouched. The full remaining-body batch is in progress; only passing, independently tested candidates will be checkpointed.

Controller coordination: the controller owns 75052 SPK byte-range extraction and reports native Tudat 1.0 installation with adapter corrections and four passing gates. These controller results were not rerun or claimed as local evidence here; accumulated J2/J4 evidence remains controller-owned. No duplicate 75052 retrieval or optional Tudat installation was performed in this worktree.

## SCN-043 reference and resource checkpoint (2026-10-14, follow-up)

Status: OPEN. No full-catalog artifact promotion in this checkpoint. The six
previously committed trajectory repairs remain the only newly shipped models.
The following candidate work is not a claim that all moons are verified.

### Independent references

- Controller reference commit d19c9fa is incorporated locally as 708d56c. NAIF
  75052/799 type-2 states are used instead of the rejected Horizons asteroid
  response. The wrong-asteroid rejection regression remains intact.
- Added a complete 9,216-byte released SAT393 Daphnis kernel, SHA-256 and original
  bytes, with a native CSPICE offline reproducer. It supplies the missing two
  epochs, while live Horizons states remain preferred for the other five.
- All 424 catalog records now have seven reference states: 2,968 comparisons.
  One record uses a legacy analytical reference supplement. This does not mean
  all 424 have current numerical provider coverage or accurate runtime models.
- Daphnis source is three Cassini-fit precessing ellipses (SPK type 17), released
  2016-10-11, with imaging through 2016-07-16. It is NOT a current 2025/2026
  observational solution. The original live Horizons post-2018 gap is preserved.
- Direct native evaluation across descriptor boundaries shows 647.519000 km /
  80.128024 m/s discontinuity at JD 2455197.5 and 168.444002 km / 21.113538 m/s
  at JD 2457388.5. The worst continuous-fit residuals occur at these boundaries.
  A continuous trajectory cannot uniformly meet the unchanged 136.505 km budget
  on both sides of the first jump. No Daphnis model was promoted and no tolerance
  was increased. This needs an explicitly piecewise source contract or a better
  independent continuous source, not an accuracy-label change.

### Candidate repairs and denominator

- The original all-catalog batch finished in 23.21 minutes, reporting 401 cached
  passing model keys and 18 unresolved records. Follow-up fitting against cached
  inputs repaired additional numerical-conditioning and segment-resolution
  failures. Detailed frozen counts, per-record maxima, payload sizes, and remaining
  names are in SCN043_CANDIDATE_FOOTPRINT_2026-10-14.json.
- The snapshot covers 418/424 catalog records with existing or cached passing
  candidates. Catalog Puck entries 378 and 388 both identify NAIF 715; the
  denominator is intentionally NOT collapsed. There are 417 distinct model keys.
- Remaining model work: Amalthea, Methone, Daphnis, S2023_S38, S2025_U_1 (75052),
  and Nereid. These are not relabeled as unavailable external references.
- Fixed fitting-side issues: percent-encoded cache filenames for names containing
  slashes; truncated-SVD handling of redundant carrier/amplitude directions;
  structurally underdetermined fits still fail; shorter eligible segments expose
  rapidly varying trajectories. Every candidate must still meet position
  <= min(500 km, 0.001 * catalog aKm), velocity <= 10 m/s, disjoint half-step
  validation, exact endpoints, and seven separate vector-oracle epochs.
- 75052 disjoint fitting-input acquisition is ongoing, separately from the
  already-successful seven-epoch oracle. It is bounded to 4 MiB original SPK
  bytes, using clustered windows and explicit target/parent segment evaluation.
  It has NOT yet produced a passing model. No additional optional Tudat work
  was attempted; native Tudat remains with the controller.

### Integration contract and storage decision

- All four original body records were compared with catalog commit 71ba472 and
  are byte-equivalent under the same JSON serialization. Their coefficients,
  provenance, and existing accuracy budgets are unchanged.
- However bf66bd4 changed the whole artifact target set/schema. The catalog
  agent's four-body offline generator checks the entire serialized file. It
  would therefore reject the combined artifact even though the four records are
  unchanged. Full promotion is paused; this integration defect remains OPEN.
- The local branch's older generator rejects --offline at argument parsing. That
  result is not misrepresented as a test of the controller's integrated newer
  generator. No edits were made to either catalog generator.
- Measured payload sizes in the companion JSON are DATA ONLY, not a built Vite
  bundle. They include current passing candidates plus the four original fits.
  The acquisition cache holds approximately 2.67 GB of raw provider responses;
  none of those responses or broad candidate payloads is added to this commit.
  Cache response count is not an exact request count; retries were not measured.
- Recommended next architecture: retain the four-body generated artifact exactly,
  deliver separately versioned lazy/per-system repair assets, and pin a bounded
  fitting-input archive with a checksum manifest. An external versioned archive
  versus repository-resident inputs is a user/controller decision before adding
  hundreds of MB of sources or tens of MB of frontend payload. Existing raw
  caches, hashes and passing coefficients are retained locally for that decision.
- Candidate reproducibility is NOT closed: current wall-clock generatedAt and
  untracked provider caches must be replaced by pinned capture provenance and
  deterministic offline reconstruction before release.

### Exact focused checks

- `PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt --with spiceypy==8.3.0 python -m pytest -q backend/tests/test_all_moon_oracle_coverage.py`
  Result: 428 passed in 0.27 s, including real native Daphnis boundary evidence.
  These are reference-integrity tests, not 428 trajectory-accuracy certifications.
- `PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt --with spiceypy==8.3.0 python scripts/capture_daphnis_spk_oracle.py`
  Result: seven offline native states reproduced from the embedded original kernel.
- `npx vitest run src/sim/moonCatalogRepair.horizons.test.ts src/sim/moonCartesianEphemeris.test.ts --reporter=dot`
  Result: 15 passed, 414 explicitly repair-pending skips, two files passed.
- `SCN043_CANDIDATE_DIR=node_modules/.cache/scn043 npx vitest run src/sim/moonCatalogRepair.horizons.test.ts --reporter=dot`
  Result: 418 passed, 1 failed, 6 skipped. One passing test is denominator
  integrity; 417 record-level accuracy cases passed. The failure is a test
  metadata-equality assertion for duplicate Puck: the shared fit's stricter
  86.004 km limit differs from the second record's 86.007 km budget. Its
  trajectory comparison is not reached for that record. No observed candidate
  accuracy exceedance is hidden by this result; the gate remains FAILED until
  the assertion is repaired. The assertion defect was reported to the controller.
- `node scripts/assess_all_moon_oracle.mjs`
  Result on the SHIPPED ten-model artifact: 424 referenced records, 2,968 compared
  states, zero unavailable samples, one legacy-reference supplement, 186 records
  above one catalog semimajor axis and 394 above 0.1 semimajor axis. These counts
  include newly available 75052/Daphnis samples and are not a regression against
  the prior smaller reference denominator. Cached candidates are not silently
  substituted by this diagnostic.

### Files and references

Changed reference tests/diagnostic: backend/tests/test_all_moon_oracle_coverage.py,
src/sim/moonCatalogRepair.horizons.test.ts, scripts/assess_all_moon_oracle.mjs.
Added native reference/reproducer: backend/tests/fixtures/daphnis_legacy_spk_capture.json,
scripts/capture_daphnis_spk_oracle.py. Candidate-only fitting work:
scripts/repair_catalog_moon_ephemeris.py, scripts/repair_spk_moon_ephemeris.py.
No catalog data, canonical artifact, mission files, planet poles, or master
tracker were edited in this follow-up checkpoint.

- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/sat393_daphnis.bsp
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/aa_summaries.txt
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/ura184_part-2.bsp
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc
- https://ssd.jpl.nasa.gov/sats/elem/ (published means are not an ephemeris)

For controller native Pluto work: gm_de440.tpc gives BODY999_GM =
869.6138177608748 km^3/s^2, separately from BODY9_GM = 975.5 km^3/s^2.
Supplying the correct GM does not supply a missing 999 body-center SPK segment;
do not silently substitute the Pluto-system barycenter trajectory.

## Neso / S2021_N1 independent identity review checkpoint

Concern: both reported seven-epoch maxima round to 91.833144 km. Verified without
changing either saved reference or either fitted trajectory:

- Neso is catalog 416 / JPL 813; S2021_N1 is catalog 418 / JPL 85052. Actual source
  and fresh VECTORS response headers identify these distinct targets, both
  relative to Neptune 899, ECLIPJ2000, TDB, geometric states.
- Fresh live seven-epoch VECTORS queries for both targets exactly reproduce their
  own prior oracle arrays. Their reference arrays, raw response hashes, source
  and held-out row hashes, coefficient arrays, and runtime catalog IDs differ.
- Actual runtime lookup attaches Neso to fitted `neso` and S2021_N1 to fitted
  `s2021_n1`; direct runtime propagation passes all fourteen fresh-reference
  comparisons under the original 500 km / 10 m/s limits.
- Unrounded maxima: Neso 91.833143799535 km; S2021_N1 91.83314385889636 km.
  Their residual vectors agree within 0.000003 km across these epochs.
- A separate real Horizons capture of Neptune 899 relative to barycenter 8,
  projected through the same linear fitting basis, reproduces the shared error
  to within 0.050429 km and 0.000632 m/s. This supports attribution to unresolved
  common fast parent-center motion rather than swapped moon identities. It is
  an attribution diagnostic, not a relaxation of scientific tolerances, and
  does not claim exact equivalence of every underlying provider kernel.
- Pinned provider result UTF-8 bytes are gzip/base64 encoded with SHA-256 in
  backend/tests/fixtures/neptune_moon_identity_capture.json (422,010 bytes).
  Original HTTP-response hashes are recorded separately; result-text hashes
  are the offline-reproducible hashes. No existing reference values changed.

Commands and results:

- `PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python scripts/verify_neptune_moon_identity.py`
  Passed distinct identity, fresh/original reference equality, byte integrity,
  and separate parent-motion attribution checks.
- `npx vitest run src/sim/moonCatalogIdentity.horizons.test.ts --reporter=dot`
  Three passed, including runtime object identity and fourteen independent state
  comparisons. No new trajectory coefficients were produced by these tests.
- Exact raw source/held-out response chunks were located for all six shipped
  repairs and parsed with target/center/frame validation. Recomputed combined
  row hashes match all twelve sourceRowsSha256 / heldOutRowsSha256 fields.
  Manifest: SCN043_SIX_BODY_SOURCE_AUDIT_2026-10-14.json.

Measured six-body source-pinning sizes, including held-out and endpoint evidence:
24 raw API-response blobs = 83,965,226 bytes; independently gzip-compressed blobs
= 27,266,758 bytes. Lossless little-endian float64 normalization of the exact eight
ElementRow fields totals 15,780,288 bytes raw / 12,982,334 bytes gzip, excluding the
small query/header/hash manifest. These compact inputs were measured, not yet
committed or claimed as an implemented offline generator. The response text and
normalized-row digests remain distinct provenance concepts.

Reproduction plan before integrating the six additions: restore the canonical
four-body artifact byte-for-byte to the catalog agent's output; keep the six
repairs in a separate versioned extension artifact; pin lossless numeric inputs
plus original response hashes, verified headers, query grids, capture provenance,
and held-out records; make the extension generator deterministic with an offline
byte-comparison gate. Preserve the four-body generator's complete-file check.
The six-body extension is approximately 0.51 MB, unlike the full cached set's
62,461,728-byte JSON / 29,098,129-byte gzip payload. No full-payload promotion is
approved or performed in this checkpoint.

Remaining work is running: bounded 75052 native fitting capture; denser 3-hour
source/held-out cadence for Amalthea and Methone, then 2-day Nereid cadence.
S2023_S38's non-elliptic provider states and Daphnis's source discontinuities still
need explicit model treatment. All 424 catalog records remain in the denominator.

## Resumed integration-compatible six-body checkpoint

Canonical `src/data/moonEphemerisChebyshev.json` is restored byte-for-byte from
`71ba472`: 4,118,909 bytes, SHA256
`9331771c6ae51983c21efcea2bb07191055c2d7891db5f702006487f54e0b9f4`.
All four original body objects, metadata and coefficients are unchanged.
Six additional fits now live in `src/data/moonEphemerisRepairs.json` (737,611
bytes). The offline reconstruction refits these six from lossless original
numeric inputs; the original four are never regenerated by the repair driver.

`scripts/moon-repair-inputs/` contains 13,065,139 bytes including the manifest:
18 deterministic gzip files preserve all eight ElementRow float64 fields.
The manifest retains exact original cache-response hashes, verified target,
center/frame/unit/GM headers, original queries (checked against cache keys),
provider preambles, source row digests, and generation-time provenance.
The normalized archive is NOT described as original HTTP bytes. Original capture
UTC is unknown for these caches; the original generation timestamp is explicitly
an upper bound on acquisition. No input is manufactured from fitted coefficients.

`scripts/generate_moon_repairs.py --offline --check` regenerates all six models,
validates disjoint training/half-step/endpoint/vector-oracle epochs, reruns the
original position/velocity caps, and compares complete serialized bytes.
Missing/corrupt inputs fail without acquiring data. Publication is atomic.
`--pin-audit` is the separate explicit maintenance conversion of audited provider
responses; a normal reconstruction does not need the untracked cache.

Fresh checks (Python 3.12.13, pinned requirements; Node 22.23.2/npm 10.9.8):

- Integration revision `938bca0`'s unmodified `generate_moon_ephemeris.py --offline
  --check --output-path src/data/moonEphemerisChebyshev.json`: byte-identical.
- Integration revision `938bca0`'s unmodified `scripts/test_catalog_generation.py`:
  20 passed in 5.91 seconds, including the real 100k offline catalog checks.
- The above integration scripts and their pinned inputs were exported into
  `node_modules/.cache/scn043/integration938`; neither the integration worktree nor
  the scientific-review agent's general source-store files were changed.
- `scripts/generate_moon_repairs.py --offline --check`: byte-identical.
- `python -m pytest -q scripts/test_moon_repairs.py`: 7 passed in 2.58 seconds.
- Full `npm test -- --reporter=dot`: 33 files passed; 429 passed, 414 skipped.
  The skips are explicitly unrepaired catalog records, not scientific passes.
- TypeScript ratchet: 217/226 legacy diagnostics, no new bucket. Node-only
  test helpers moved to a dedicated `.mjs` module; no baseline was increased.
- Full backend suite is still running at this checkpoint; its final result will
  be appended separately. `git diff --check` passed.

The Puck duplicate assertion now accepts the fitted stricter 86.004 km budget
for both catalog entries; runtime position/velocity gates use the smaller of the
catalog and model caps. Both records and all seven epochs remain tested.
Candidate cache gate: 422 passed (421 body records plus denominator), 3 skipped;
Amalthea/Methone's dense grids still need oracle-overlap rows removed and a fresh
fit before their independence claim is accepted. Nereid's cached denser fit is
also retained. No broad candidate promotion occurred.

`loadMoonEphemerides()` lazily combines the two artifacts and rejects any
canonical-key collision. Main's `showMoons` remains false. The integration owner
can use this loader in the existing optional moon-loading branch of `src/main.ts`;
that file is outside this agent's assigned write set and was not changed.
The all-moon diagnostic and scoped runtime tests already consume both artifacts.

Integration order from parent `938bca0`: `bf66bd4ba26fb815243b99065621c544e224e19a`,
`d6ddbb87d4ebaf5109c517ee6e5edfaea3d1a3bb`,
`28ccf2988f674d577d7c96471f02c8cdcd116fc6`, then this separation/reproducibility
checkpoint. `708d56c1f2a18ab167d1dea4b78f46b3ea09957d` is the already-integrated
75052 reference counterpart of parent's `d19c9fa`; do not replay both captures.
The intermediate mixed artifact from bf66bd4 is not a releasable final state.

Prior Neso/S2021_N1 identity evidence in 28ccf29 remains valid and was not
recaptured: IDs 813 versus 85052, distinct provider rows/hashes/coefficients,
residual maxima 91.833143799535 and 91.83314385889636 km, with the separately
captured parent-motion diagnostic agreeing within 0.050429 km / 0.000632 m/s.
Daphnis recent reference coverage remains explicitly qualified legacy SAT393
SPK type 17; the current live Horizons solution still lacks those two dates.
75052's resumed sparse candidate fails 105.491875 km / 40.985527 m/s versus fixed
57.844 km / 10 m/s caps. Resampling only already-captured source records does not
repair it. These are unresolved model failures, not missing source identity.

## Second resumed checkpoint: native 75052 and dense-grid independence

First resumed checkpoint hash: `022d334f8b5ffc2043d13d7d046d51374c008501`.
Its full backend run completed: **2669 passed, 1 skipped, 2 warnings, 280.14 s**.
The skip remains native Tudat; the warnings are installed Starlette/httpx/anyio
API deprecations. Command: pinned Python 3.12.13 requirements plus
`--with spiceypy==8.3.0 python -m pytest -q backend/tests scripts/test_moon_repairs.py`.

The 75052 conditioning defect is repaired with degree-8 carrier amplitudes over
256-day nominal segments. A bounded comparison of degrees 4/6/8 and spans
256/128/64 established that increasing polynomial degree had created poorly
constrained fits across the sparse input windows. Source acquisition is unchanged:
1,831,968 original SPK bytes, under the existing 4 MiB budget. The pinned gzip
archive is 1,907,367 bytes including its range manifest. No new provider request
or complete-kernel download was needed.

An additional disjoint validation phase, 0.002 days after the original held-out
samples, is evaluated only when both the target and Uranus-center coefficient
records are already captured. Missing original records are rejected before
CSPICE can read sparse-file holes or extrapolate. Both training/validation epoch
separation and all original checksums are enforced.

75052 final maxima: **9.955644 km / 6.430594 m/s** across held-out phases and exact
endpoints; separate seven-epoch vector-oracle maxima **9.857927 km / 3.246425 m/s**.
Unchanged limits: **57.844 km / 10 m/s**. The 270,686-byte native extension is
`src/data/moonEphemerisSpkRepairs.json`. The generator uses pinned capture time,
not rebuild wall time, and `--target 75052 --offline --check` is byte-identical.
The lazy loader combines all three artifacts without key replacement.

Amalthea and Methone were refitted from the already-captured three-hour grids
AFTER removing the eight training epochs that coincide with the seven vector
oracles or the final coverage endpoint. Their source hashes now describe the
filtered training set; original capture hashes and excluded epochs remain
explicit. Both independent fits pass their original caps. Candidate-only Nereid
also passes. These three dense candidates are retained locally, not promoted or
claimed to have pinned reconstruction inputs. Candidate metadata/digests are in
`SCN043_RESUMED_BATCH_2026-10-14.json`.

The candidate acquisition driver now owns its cache/network boundary, so it does
not depend on the canonical generator's old online `_fetch_result` behavior.
Its `--offline` mode fails on missing cache files; incomplete grids fail. Any
explicit candidate promotion targets the repair extension, never the canonical
four-body artifact. No general `catalog_sources.py` or capture code was modified.

Fresh final gates after the native addition:

- Full frontend: **430 passed, 413 skipped**, 33 files. Eleven delivered fitted
  records are available; unpromoted repairs remain explicit skips.
- Candidate runtime gate: **423 passed, 2 skipped** = 422 body records plus one
  denominator-integrity check. Remaining records: Daphnis and S2023_S38.
- Backend reference coverage plus all 12 new Python regression cases: **440
  passed, zero skips, 3.22 s**, using real SpiceyPy 8.3.0.
- Native generator offline whole-file check: byte-identical.
- TypeScript ratchet: **217/226** unchanged legacy diagnostics.

S2023_S38's failure is now localized: ten of the 4,568 captured source states have
hyperbolic osculating elements (maximum e=1.196336782426656, negative semimajor
axis), which the ellipse-only input conversion rejects. This does not imply the
provider target is wrong or that the physical satellite is unavailable. A direct
Cartesian/conic input path is required. Daphnis still needs explicit handling of
the released legacy source's piecewise fits and discontinuities. Neither record
has been removed or counted as a pass.
