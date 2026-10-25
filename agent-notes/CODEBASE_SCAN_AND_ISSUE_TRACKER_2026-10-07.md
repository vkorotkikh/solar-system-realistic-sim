# Codebase scan and issue / problem / bug tracker — 2026-10-07

> **Historical record — superseded for maintenance on 2026-10-17.** Use the [consolidated October 10 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md), including the [approved SimulationClient scope and verification boundaries](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md#simulationclient-scope-decision--2026-10-17). The original dated content below is preserved; it is not a fresh status report.

> Current status (2026-10-14): see [the master tracker](MASTER_ISSUE_TRACKER_2026-10-11.md) and [active remediation effort](REMEDIATION_EFFORT_2026-10-14.md). The dated findings below preserve their original snapshot; they are not current merge status.


> **Successor:** [October 10, 2026 three-branch scan and tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md). This October 7 record is retained as historical evidence; use the successor for current branch-specific status.

This is a fresh scan of the current checkout, with an actionable register and a reconciliation of the older audits. The application builds, and the scoped frontend and backend suites pass under the conditions below. Significant scientific, solar-delivery, tooling, and documentation defects remain. Passing those suites does not establish scientific validity: independent probes still fail the PFSS basis and expose a benchmark with no comparable scenarios.

## 1. Snapshot and scope

| Field | Value |
|---|---|
| Audited HEAD | `fc191df036b72059e019bbc7ee6a387d51c33bf2` |
| Branch | `fix/trajectory-amplification-defense-in-depth` |
| Last commit | `docs: define frontend accessibility remediation` |
| Scan date | 2026-10-07, America/New_York; evidence captured that day in UTC |
| Baseline source state | No tracked modifications at scan start; four pre-existing untracked audit/report paths listed below |
| Inventory | 381 tracked files; 175 tracked `.ts` / `.py` / `.mjs` / `.js` files; 114 tracked Markdown files. These counts exclude untracked evidence and this new tracker. |
| Method | Single-agent source and history review, repository validation commands, fresh Python environment, offline numerical and API probes, selected primary-source comparison |
| Deliverable scope | Documentation and retained probe evidence. No application fixes, dataset refresh, branch merge, dependency-file edits, or commits. |
| Evidence | [CODEBASE_SCAN_2026-10-07_EVIDENCE/](CODEBASE_SCAN_2026-10-07_EVIDENCE/) |

The supplied context named `d175e4b`. HEAD is one documentation commit newer. The accessibility design is approved **for implementation planning**, not implemented. The trajectory work in `931faae`, `406b2c3`, and `d175e4b`, and the moon/time work in `bd48a7d`, must be accounted for before reusing September findings.

Existing untracked material was preserved:

- `CODEBASE_AUDIT_2026-09-24.md` and `CODEBASE_AUDIT_2026-09-24_EVIDENCE/`.
- `H1_SOLAR_DELIVERY_PLAN_2026-09-25.md` and `H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/`.

This is a broad source scan with targeted reproductions, not a new exhaustive browser, live-Horizons, GPU, coverage, or load audit. Old measurements are not presented as current measurements. There is deliberately no new readiness score or sum of historical issue counts.

### Reading the tracker

- **OPEN / OBS**: reproduced by a command or probe in this scan.
- **OPEN / CODE**: the mechanism is present in current source; the full user-visible outcome was not exercised here.
- **VERIFY**: historical claim, capability question, or broader acceptance gate that needs fresh evidence. Excluded from confirmed-open counts.
- **Preserved fix**: current implementation and relevant passing regression coverage support closure in the stated scope. It does not close the whole subsystem.
- **P0**: first corrective work before relying on the affected scientific output. **P1**: next release/reliability work. **P2**: follow-up quality, model, or capability work. Priority is sequencing, not a CVSS rating.

All entries were reviewed on 2026-10-07. Owners are **unassigned** until claimed. IDs are stable: do not renumber or reuse them. The 40 open entries include code bugs, model limitations, tooling, and documentation/governance problems; they are **not** a claim of 40 independent production bugs. Nine additional entries are a verification queue.

## 2. Fresh validation results

| Check | Current result | Evidence and interpretation |
|---|---|---|
| `npm run build` | PASS | [build.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/build.log). Vite 7.3.1; 44 modules; main JS 904.92 kB, gzip 228.17 kB. Large-chunk warning remains. |
| `npm test` | FAIL, exit 1 | [frontend-default.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/frontend-default.log). 14 passing source files / 162 passing tests, plus **6 failing suite imports** from old untracked H1 evidence. This is not six failed product assertions. |
| `npm test -- src` | PASS | [frontend-src.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/frontend-src.log): **14 files, 162 tests**. Explicitly scoped; not a claim that plain `npm test` passes. |
| `npm run typecheck` | FAIL, exit 2 | [typecheck.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/typecheck.log): **240 TypeScript diagnostics**, counted by `error TS…` lines. September's 246 is stale. |
| `npm run verify:planet-positions` | PASS | [planet-positions.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/planet-positions.log): 8 planets × 6 epochs, 48 rows, under existing budgets. This is a position gate, not a geocentre or velocity certification. |
| `npm run verify:moon-frames` | PASS | [moon-frames.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/moon-frames.log): **20 moons × 7 epochs, 140 rows**, utilisation 50.0/100. Does not cover all 424 catalog entries. |
| Fresh Python 3.12 environment, only `backend/requirements.txt`, collect backend suite | FAIL, exit 2 | [backend-fresh-install.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/backend-fresh-install.log): **8 collection errors** because Starlette 1.7.0 requires undeclared `httpx2`; 362 tests collected before interruption. |
| Same environment after adding `httpx2` locally | PASS | [backend-tests.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/backend-tests.log): **458 passed in 48.15 s**, no skips reported. REBOUND 5.1.1 installed. Repository requirements were not changed. |
| `npm audit --json` | FAIL, exit 1 | [npm-audit.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/npm-audit.json): **11 affected dependency entries**: 2 critical, 6 high, 2 moderate, 1 low. Registry output, not an exploitability test or 11 distinct root advisories. |
| Offline backend audit probe | Defects reproduced | [probe-backend.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/probe-backend.json): PFSS basis, FITS reader, benchmark, solar identity, preview CORS, risk-service composition, stale assimilation, and cold solar timing. |
| Frontend numerical / DOM-write probe | Defects reproduced | [probe-frontend.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/probe-frontend.json): date precision, catalog round trip, fast Kepler, SMBH radius, repeated HUD writes, position/velocity derivative mismatch. No browser or GPU measurement. |
| Moon texture ingestion CLI | FAIL, exit 1 | [texture-script.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/texture-script.log): missing `moonTextureCatalog.js` import, before ingestion starts. |

Environment: Linux/WSL2, Node **24.21.0**, npm **11.19.0**, temporary Python **3.12.13**, NumPy **2.5.3**. The default shell Python was 3.14.6 without the backend dependencies; it was not used for backend validation. See [node-packages.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/node-packages.log), [python-freeze.txt](CODEBASE_SCAN_2026-10-07_EVIDENCE/python-freeze.txt), and [scan-manifest.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/scan-manifest.json). The manifest records source hashes; hashing a file does not mean every line was reviewed.

## 3. Coverage map

| Area | Work performed | Remaining boundary |
|---|---|---|
| Frontend startup, UI, rendering | Entry path, animation loop, panel/focus code, scene setup, shipped solar client, build and source tests | No fresh browser interaction, screen-reader, GPU, screenshot, or frame-time run |
| Planets, moons, worker boundary | Propagator and catalog review, time/worker tests, committed planet/moon gates, finite-difference velocity probe | No new live Horizons capture; no all-moon accuracy assertion |
| Asteroids / Kuiper belt | Live shader inputs, deterministic catalog selection, catalog serializer probe, paused-loop review | No GPU shader readback, new upstream catalog, or bandwidth benchmark |
| Solar / PFSS / live data | Basis and FITS probes, ingress/CORS checks, provider/cache/forcing review, one cold offline timing in final probe output | No five-minute browser delivery run; no observed magnetogram oracle or live outage/load test |
| Trajectory / Lambert / MGA | Recent patch/test review; full backend and frontend planner tests | No new independent Izzo/Gooding sweep or broad real-mission window search |
| Mission / risk | Mass-flow source tracing, infeasible vehicle + risk service probe, backend suite | Probe does not establish that the endpoint recommends an infeasible candidate |
| REBOUND / WebSocket | Full backend suite with REBOUND installed; runner/admission review | No long-duration stream, GPU client, fairness/load, or TudatPy run |
| Tooling / data / documentation | Clean Python setup, dependency audit, type/build/test commands, CLI failure, licensing/README/history checks | No Python vulnerability scan, fresh dataset rebuild, license determination, or comprehensive link audit |

## 4. Open tracker

### Solar computation and delivery

| ID | Priority / state | Problem and current evidence | Next action / closure gate |
|---|---|---|---|
| SCN-001 | P0 · OPEN / OBS | **PFSS harmonic basis is incorrect.** `_associated_legendre` at [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):281–313 mixes seeds and recurrence normalization. At x=0.5, P₂ is −0.633911 instead of −0.125; P₃ is −1.134220 instead of −0.4375. The integral of P₀P₂ is −0.945074 instead of zero. Historical H-2 / R3. | Establish one basis convention across decomposition and scalar/batch field evaluation. Gate analytic values, orthogonality, derivatives/poles, dipole/quadrupole reconstruction, and source-surface boundary behavior through supported lmax. |
| SCN-002 | P1 · OPEN / OBS | **FITS reader rejects a valid image in the fresh supported dependency environment.** `dtype` is the scalar class `np.float32`, then `dtype.newbyteorder('>')` is called at [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):117. A 12×12, BITPIX=−32 fixture raises `AttributeError` on NumPy 2.5.3. `_compute` catches fetch exceptions and falls back to synthetic. | Use the NumPy dtype API correctly and add a committed valid FITS fixture with exact expected pixels. Exercise the complete fetch/parse/source-status path so a parser failure cannot masquerade as observed input. |
| SCN-003 | P1 · OPEN / CODE | **Observed GONG grid semantics are lost.** Fetch documents a sine-latitude grid, while decomposition constructs uniform θ and `sin(θ) dθ` weights at [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):131–136, 316–364. The reader discards WCS/longitude metadata and passes a bare array onward. This remains a distinct problem after SCN-002. | Preserve source grid/WCS metadata; explicitly transform or integrate on the declared grid. Validate orientation, latitude ordering, LONG0, and a known harmonic map from a committed observed-format fixture. |
| SCN-004 | P1 · OPEN / CODE | **Solar upstream selection and reads are insufficiently bounded.** [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):167–197 falls back to any monthly FITS match, selects the last listing entry, reads without a byte cap, and decompresses without an expansion cap. [solar_realtime_data.py](../backend/sim/solar_realtime_data.py):207–224, 322–328 also reads full remote bodies. Historical L-17 and H1 digest. | Require exact declared source/rotation or report unavailable; retain actual source identity. Bound downloaded and decompressed bytes and total work. Test wrong-rotation input, oversize bodies, gzip expansion, and slow-drip responses. |
| SCN-005 | P1 · OPEN / OBS | **Cold solar computation exceeds the shipped client deadline.** [sunController.ts](../src/sunController.ts):152–155 uses a 900 ms polling interval and 2.6 s timeout. The final probe's cold high/180/hybrid computation takes **4.094 s even with network disabled**. AIA refresh occurs only after a successful physics update (:500–509), and the error is used for scheduling without a visible delivery-state UI. Historical H-1. | Complete the solar delivery contract: bounded compute/snapshot lifecycle, compatible deadlines/cadence, cached availability, visible source/stale/error state, and independent observation recovery. Dev and preview must meet a recorded five-minute delivery gate. Do not close from this one timing sample. |
| SCN-006 | P1 · OPEN / OBS | **Default preview origin is rejected by CORS.** [server.py](../backend/server.py):392–404 allows :3000/:5173 but not :4173. TestClient OPTIONS from `http://localhost:4173` returns 400 with no allow-origin header. | Align configured dev/preview origins and test both localhost and loopback-IP cases. Verify real browser physics and AIA delivery from preview. |
| SCN-007 | P1 · OPEN / OBS | **Solar rate-limit identity is caller-controlled and retained without a key bound.** [server.py](../backend/server.py):885–944 trusts X-Forwarded-For and prefers an API-key header as identity. With auth unconfigured, 50 rotating XFF values pass a 36/request window; 50 unvalidated API-key values create 50 identities. Dictionaries retain keys. The new trajectory middleware has different, stronger behavior. | Derive identity from validated credentials or a trusted transport/proxy policy; bound identity storage with expiry/eviction. Test both forged XFF and arbitrary key rotation from one peer. |
| SCN-008 | P1 · OPEN / CODE | **Solar JD validation checks finiteness but no supported epoch range.** [server.py](../backend/server.py):1970–1982 and PFSS `_normalize_key` admit arbitrary finite epochs; GONG selection converts them to a calendar timestamp. The sun-focus plan's bounded-JD behavior is not present in this checkout. | Define supported epochs and reject out-of-range finite values before remote access or compute. Test route and cache boundaries; distinguish unavailable historical data from an invalid input. |
| SCN-009 | P1 · OPEN / OBS | **Hybrid forcing applies zero-confidence observations.** [solar_physics.py](../backend/sim/solar_physics.py):397–519 has no requested-epoch argument in its assimilation function and a minimum hybrid weight of 0.25. A stale 2000-01-01 input produces confidence 0, `applied: true`, weight 0.25, and changes synthetic activity 0.8 to 0.625. SWPC/SILSO ingestion also lacks requested-date selection; AIA does accept a requested date. Historical M-8. | Gate assimilation by observation validity, requested epoch, and provenance; stale/unavailable data must follow a declared fallback. Test historical, current, future, missing, and zero-confidence observations. |
| SCN-010 | P1 · OPEN / CODE | **Realtime cache discards expired good snapshots and caches returned failure snapshots as ordinary values.** [solar_realtime_data.py](../backend/sim/solar_realtime_data.py):118–170 removes expired entries, then caches whatever `_fetch_snapshot` returns; that method catches provider failures. Exact-JD keys also limit reuse as simulation time advances. H1 digest remains relevant, but old outage timings were not rerun. | Add a declared stale-data and recovery policy, distinguish successful/failed snapshots, and test outage followed by recovery. Preserve valid exact-input identity until any reuse equivalence has a scientific error budget. |
| SCN-011 | P2 · OPEN / OBS | **AIA freshness depends on the browser timezone.** [solarObservationTexture.ts](../src/frontend/features/solar/solarObservationTexture.ts):66–71 uses `Date.parse` on upstream `image_date`; the backend preserves the raw date at [solar_realtime_data.py](../backend/sim/solar_realtime_data.py):682. The same zone-less string resolves seven hours later in Los Angeles and nine hours earlier in Tokyo than UTC. [Probe](CODEBASE_SCAN_2026-10-07_EVIDENCE/aia-timezones.json). | Normalize the upstream timestamp to a declared UTC representation at ingestion; test the full freshness result across multiple TZ settings with a fixed clock. |

### Scientific results, propagation, and mission models

| ID | Priority / state | Problem and current evidence | Next action / closure gate |
|---|---|---|---|
| SCN-012 | P0 · OPEN / OBS | **Accuracy benchmark still validates zero scenarios.** [accuracy.py](../backend/benchmark/accuracy.py):509–538 reports 3 scenarios, 0 comparable, coverage 0, and mean error **0.0**. Tests explicitly accept zero coverage; reference rows still use `strict`. Resource-budget improvements did not repair the oracle. Historical H-4. | Record reproducible fixed-state references and generate them with an independent implementation; make nonzero comparable coverage a gate. Represent undefined error as unavailable, and distinguish artifact-integrity checks from numerical validation. |
| SCN-013 | P1 · OPEN / OBS | **Asteroid shader uses float32 absolute JD.** [beltRenderer.ts](../src/frontend/features/asteroids/beltRenderer.ts):62–65, 124–128 subtracts float epoch from float JD. `2461320.125` rounds to `2461320`; spacing here is **0.25 day**. This reproduces input precision loss, not September's GPU position-error or stutter measurements. Historical M-1. | Send relative time computed in CPU double precision or a validated split representation. Gate arbitrary sub-day epochs against a double-precision reference and then measure actual GPU motion/readback. |
| SCN-014 | P1 · OPEN / OBS | **ACBF's own round-trip validator fails.** [asteroidCatalogLoader.ts](../src/data/asteroidCatalogLoader.ts):319–394 reports `ok: false`, **99,916/100,000 mismatched records**, maximum epoch error ≈0.125 day and angle error ≈0.002747°. Historical M-14. | Declare field-specific quantization budgets, correct the round-trip comparison contract, and add a meaningful format gate. A failing synthetic validator alone does not prove the committed catalog is corrupt. |
| SCN-015 | P2 · OPEN / CODE | **Rendered asteroid selection favors the leading catalog records.** [asteroidBelt.ts](../src/sim/asteroidBelt.ts):138–161 stops at `count`; the phase-1 catalog builder orders by descending diameter and the app uses 50,000 records. Historical M-21. | Declare the displayed population or use a reproducible representative sampling policy. Gate the selection against the full source corpus; September's diameter statistics were not remeasured. |
| SCN-016 | P1 · OPEN / CODE | **The object labelled Earth uses Earth–Moon barycentre elements.** [planets.ts](../src/data/planets.ts):85–113 matches JPL Table 1's EM Bary row; propagation supplies that state without a geocentre correction. Historical M-3. The published row identity was rechecked against [JPL's table](https://ssd.jpl.nasa.gov/planets/approx_pos.html). | Either explicitly model/label EMB and derive Earth/Moon offsets, or use geocentric Earth states consistently. Test against both Horizons 3 and 399; do not quote the old ~4,700 km / 12.3 m/s as a fresh measurement. |
| SCN-017 | P1 · OPEN / OBS | **Planet velocities are not the derivative of the secularly changing position model.** [orbitMath.ts](../src/sim/orbitMath.ts):202–265 evolves elements and axes; :337–358 uses the instantaneous fixed-element velocity formula. Central differences at J2000+9775.12345 days disagree by **8.067 m/s for Neptune**, 6.639 Uranus, 2.814 Saturn, 0.272 Earth. These are internal consistency differences, not errors against Horizons. R2 velocity residual. | Differentiate all time-dependent elements/rotations consistently. Gate derivative agreement at several step sizes/epochs, then apply independent velocity budgets. Preserve the existing mean-longitude correction and rate-free invariant. |
| SCN-018 | P2 · OPEN / CODE | **Pluto lacks secular rates and is outside the eight-planet gate.** [planets.ts](../src/data/planets.ts):261–279 defines fixed elements only. Historical M-15. | Define the supported Pluto model/date range; add appropriate rates or an ephemeris and explicit Pluto position/velocity acceptance cases. No new Pluto error estimate was measured here. |
| SCN-019 | P1 · OPEN / CODE | **Mission return cargo is absent from the burn mass model.** [agents.py](../backend/mission/agents.py):480–518 evaluates outbound and return burns using the request payload before computing returned mining cargo. [vehicle_service.py](../backend/mission/vehicle_service.py):64 initializes that one payload mass; mining closure later subtracts return propellant from product. The older claim that every leg resets the wet mass is too broad: fuel is tracked across burns, but acquired cargo is not added. | Use one chronological mass ledger for stages, expended propellant, acquired cargo, losses, and any declared ISRU. A return cargo increase must affect return Δv/propellant feasibility. |
| SCN-020 | P1 · OPEN / OBS | **Risk output can say 0% failure for an infeasible vehicle budget.** An actual 100+100 km/s burn-budget evaluation returns `feasible: false`, yet retains a 1,275 kg reserve margin. Passing that margin into [risk_service.py](../backend/mission/risk_service.py):28–115 with zero uncertainty and positive payload gives `failureProbability: 0.0`. The service accepts no deterministic-feasibility input; [agents.py](../backend/mission/agents.py):510–518 passes the margin. | Propagate unmet Δv/feasibility into risk, and re-close each sampled mass/burn case. Preserve the mission verifier that already rejects infeasible logistics; this probe does **not** show an infeasible recommendation passing the endpoint. |
| SCN-021 | P1 · OPEN / OBS | **SMBH radius constants disagree with the module's own G, M, c by about 100×.** [smbhPhysicsConstants.ts](../src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts):62 stores Sgr A* radius `1.24e10` cm; `2GM/c²` from the same file gives `1.227027274220e12` cm, ratio **98.954**. The radius has a consumer in [smbhPropagation.ts](../src/frontend/features/superluminal-modeling/smbhPropagation.ts):642. | Derive dimensional constants from one unit system and cover Sgr A*, M87*, ISCO/photon radii and downstream dimensional conversions. Keep speculative interpretation distinct from arithmetic consistency. |
| SCN-022 | P2 · OPEN / OBS | **Fast Kepler solver diverges at high eccentricity.** [orbitMath.ts](../src/sim/orbitMath.ts):168–173 uses six unguarded Newton iterations. A 10,001-angle sweep at e=0.99 produces maximum residual **1.3874×10⁸ radians**. Historical L-2; activation risk for expanded catalogs, not proof of a failure in the currently shipped population. | Bound the supported domain or use safeguarded convergence and a fallback. Gate residuals around periapsis and e→1, and test caller handling of unsupported values. |

### Frontend state, validation, and operations

| ID | Priority / state | Problem and current evidence | Next action / closure gate |
|---|---|---|---|
| SCN-023 | P1 · OPEN / CODE | **Speculative warp mutates canonical planet positions.** [main.ts](../src/main.ts):840–845 and [modelWorker.ts](../src/workers/modelWorker.ts):17, 131 call `applyMetricKinematics` with `1e12`; [solarSystemModel.ts](../src/sim/solarSystemModel.ts):169 onward mutates world positions. Those positions feed display/perturber paths. Historical M-9. | Keep scientific states distinct from visual experiment offsets. Assert identical canonical states with the experiment on/off while allowing the presentation to differ. |
| SCN-024 | P2 · OPEN / CODE | **Paused frames still propagate/upload KBO positions.** [main.ts](../src/main.ts):1395–1409 unconditionally calls both propagators and renderer updates; pause affects time advancement, not this work. Historical M-10. | Skip unchanged-state propagation and buffer updates. Instrument a paused frame sequence and require no unnecessary KBO position uploads. September's bandwidth/CPU numbers were not rerun. |
| SCN-025 | P1 · OPEN / OBS | **Strict TypeScript checking fails with 240 diagnostics.** [Log](CODEBASE_SCAN_2026-10-07_EVIDENCE/typecheck.log). `build` only runs Vite, so it succeeds despite this failure. Historical M-11. | Resolve the diagnostics in manageable modules and make strict checking an enforced release command. Close only when `npm run typecheck` exits 0 without relaxed settings. |
| SCN-026 | P1 · OPEN / OBS | **Default Vitest discovery loads archival audit suites.** Six untracked evidence suites fail imports; all 162 source tests pass. [package.json](../package.json) uses bare `vitest run`, with no repository-level include/exclude config. | Limit product test discovery deliberately while retaining audit evidence. Plain `npm test` must pass with those archives present. This is a workspace reproducibility defect; a fresh clone lacks those untracked suites. |
| SCN-027 | P1 · OPEN / OBS | **Fresh backend install cannot collect the full suite.** [requirements.txt](../backend/requirements.txt) omits the TestClient dependency (`httpx2` for the resolved Starlette 1.7.0); most dependencies have only lower bounds and there is no backend lock. Eight collection failures reproduced. Historical M-16. | Declare tested runtime/dev environments and lock compatible versions. Verify clean install → full suite with no manual dependency additions. Record the supported Python version. |
| SCN-028 | P1 · OPEN / OBS | **Installed frontend toolchain has registry-reported advisories.** Fresh npm audit reports 11 affected entries, including critical classifications on Vitest/tinypool and high on Vite and transitive tools. [Full advisories](CODEBASE_SCAN_2026-10-07_EVIDENCE/npm-audit.json). Historical M-20 count of 9 is stale. | Triage and update affected packages, then rerun the lockfile install, type/test/build gates, and audit. Do not treat the registry counts as evidence that the production Three.js bundle is exploitable. |
| SCN-029 | P1 · OPEN / CODE | **No tracked repository CI workflow enforces release gates.** No `.github` workflow/configured equivalent found in the tracked tree; package scripts remain independent. Historical M-11/S14. External hosting checks were not inspected. | Add a reproducible enforced lane for typecheck, product tests, backend tests with REBOUND, numerical gates, and build. Scientific probes should become independent-oracle tests, not assertions that bless current wrong output. |
| SCN-030 | P1 · OPEN / CODE + OBS | **Accessibility remediation remains a design, with current code gaps.** `style.css:59` sets a 280px minimum; :1213 expands the small-screen panel width to 100vw. The canvas has no keyboard camera controller; mobile panel code at [main.ts](../src/main.ts):1117–1160 does not isolate the background or restore focus on breakpoint changes. `index.html:222,249` has two search-related live regions. The HUD probe records four identical text writes across two paused updates. | Implement the [approved accessibility design](../docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md), including its eight acceptance areas. Require interaction tests plus real zoom/keyboard/drawer checks. The design explicitly leaves existing reduced-motion simulation behavior unchanged, so that residual needs its own decision. |
| SCN-031 | P2 · OPEN / CODE | **WebGL initialization has no usable fallback.** [sceneSetup.ts](../src/frontend/app/sceneSetup.ts):155 constructs WebGLRenderer directly, with no startup error surface around this path. Historical L-6. | Catch unavailable/lost-context initialization and display an accessible recovery explanation. Verify with WebGL disabled; no fresh browser reproduction was performed here. |
| SCN-032 | P1 · OPEN / CODE | **README still describes controls/capabilities absent from the entry UI.** [README](../README.md) tells users to select REBOUND/TudatPy and click Connect; current [index.html](../index.html) does not supply those controls, and [main.ts](../src/main.ts):147 still disables moons. README also lists missing `src/workers/asteroidWorker.ts` and an outdated backend-test module count. Historical H-6. | Audit README claims against the shipped entry point and separate API/library capabilities from exposed UI. Keep corrected moon implementation notes, but do not imply moons are rendered. |
| SCN-033 | P2 · OPEN / OBS + CODE | **Maintenance scripts have broken or misleading invocation behavior.** `ingest-moon-textures.mjs --help` fails on a deleted `.js` import. [update-moons-data.mjs](../scripts/update-moons-data.mjs):79 always writes the catalog and has no argument parsing, so `--help` is not a safe help operation. The latter was inspected, not executed. | Repair the import/runner contract; implement help/dry-run and explicit output destinations. Add invocation smoke checks that cannot overwrite tracked data. |
| SCN-034 | P2 · OPEN / CODE | **Dataset regeneration is not pinned to archived source inputs.** The asteroid and moon update scripts retrieve mutable upstreams; [build_asteroid_phase1_dataset.py](../scripts/build_asteroid_phase1_dataset.py):423,427 also calls `relative_to(PROJECT_ROOT)` on a caller-selected output path after writing it. Historical M-13. | Add immutable input snapshots with hashes, offline rebuild mode, and safe external output directories. Require byte-identical regeneration from those snapshots. Do not repeat September's changed-record totals without a fresh rebuild. |
| SCN-035 | P1 · OPEN / CODE | **Repository licensing and asset provenance remain unresolved.** No repository LICENSE/COPYING was found. [moon_texture_attribution.json](../public/textures/moons/moon_texture_attribution.json):37 explicitly says one provider license is unspecified. Texture/catalog provenance is incomplete. Historical H-5. | Have the owner choose/document distribution terms and complete per-asset/source attribution. Verify dependency and provider terms for the intended distribution. This is a documentation/provenance finding, not a legal determination of redistribution rights. |
| SCN-036 | P1 · OPEN / CODE | **WebSocket global capacity still has no client fairness/authentication policy.** [server.py](../backend/server.py):454 defaults to four slots; `_websocket_origin_allowed` allows absent Origin, and the endpoint acquires only the global slot. Origin filtering and permit ownership are already implemented. Historical M-5. | Define authenticated/per-client admission and session lifetime appropriate to deployment; verify that four unrelated draining clients cannot indefinitely exclude an authorized client. No fresh long-duration lockout attack was run. |
| SCN-037 | P2 · OPEN / CODE | **Backend simulation speed uses a target tick duration even when computation overruns.** [server.py](../backend/server.py):2957 advances by `time_scale * frame_time`; slow steps therefore reduce simulated days per real second. | Declare fixed-step versus wall-time semantics. If the UI/API promises days per wall second, use a bounded elapsed-time accumulator and test a deliberately slow engine without unbounded catch-up. |
| SCN-038 | P2 · OPEN / CODE | **Solar animation timing is disconnected from pause/reverse/epoch progression.** [main.ts](../src/main.ts):1412–1417 explicitly passes wall-clock seconds to sun visuals while other simulation state uses JD. This avoids the old absolute-time float precision defect, but the behavior needs a clear contract. Historical L-3. | Decide and expose simulation versus decorative motion semantics; test pause/reverse/reduced-motion behavior. Preserve the relative-time precision fix. |
| SCN-039 | P2 · OPEN / CODE | **Backend connection configuration is hard-coded around port 8042.** [main.ts](../src/main.ts) defines the backend URL from the page location and `DEFAULT_BACKEND_PORT`; there is no documented deployment override in this entry path. Historical L-15. | Provide an explicit configurable backend/proxy contract, document standalone behavior, and test a nondefault origin/port. Mixed request/response casing alone is not counted as a defect here. |
| SCN-040 | P1 · OPEN / CODE | **Recent audit evidence is outside version control.** The September 24 audit and H1 plan/evidence remain untracked in this checkout. The user's source inventory correctly warns that fresh clones do not contain them. | Deliberately archive or commit the intended evidence with appropriate review; link a durable source from the tracker. Do not sweep unrelated files into a commit. This new tracker/evidence also remains uncommitted until intentionally included. |

## 5. Reproduction details and limits for the highest-impact findings

### PFSS correctness is independent of green tests

The backend probe calls the real `_associated_legendre` implementation. Its expected zonal P₂/P₃ values are elementary polynomial values, and the P₀/P₂ inner product is integrated with a 128-point Gauss–Legendre rule. Nonzero cross-degree overlap cannot be repaired by simply relabelling a normalization constant. The independent FITS fixture is constructed locally with a primary header and big-endian float32 image; it does not depend on GONG availability.

SCN-001, SCN-002, and SCN-003 are separate gates: fixing the recurrence will not fix the reader; fixing the reader will expose the grid/WCS problem. The retained [R3/R4 implementation work order](R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md) has more extensive analytic, ingestion, topology, and load acceptance criteria. It remains a plan, not evidence that those criteria pass.

### Solar timeout and rate-limit probes are narrowly scoped

The timing probe patches the GONG fetch to return unavailable and supplies no realtime data. Its final run takes 4.094 s for one cold high/180 state, compared with the actual frontend's 2.6 s timeout. This demonstrates a local deadline mismatch even without upstream delay. It does **not** establish the previous audit's 0/39 success rate, a current p95, or universal failure on other hardware.

The rate-limit probe directly exercises the actual guard function with Starlette Requests from one transport peer. It admits 50 different forwarded identities and 50 arbitrary API-key identities when key authentication is unconfigured. A production proxy or independently configured credentials could change exposure; those deployments were not inspected. Trajectory-family ingress now uses transport identity with bounded storage and must not be conflated with this older solar guard.

The exact-JD cache keys currently preserve input distinctions. Replacing them with a day/rotation bucket without an error budget could introduce new scientific aliasing. Delivery improvements must retain the cache correctness tests until the replacement equivalence is proven.

### Mission risk and cargo findings do not imply all feasibility checks are absent

The current vehicle service carries remaining propellant across its burn sequence. The missing state transition is acquired mining cargo before the return burn, not a complete per-leg mass reset. The risk probe combines real vehicle/risk services with a deliberately infeasible burn requirement and zero uncertainty; it exposes a contradictory probability contract. The mission verifier separately checks `logistics.feasible`. A full API regression should assert both correct candidate rejection and truthful reported risk.

### Existing orbital gates remain valuable but have defined scope

The planet gate's broad approximation budgets and the moon gate's selected bodies/epochs are printed in the retained logs and implemented in their checker modules. They should be preserved. They do not validate rendered moon availability, the rest of the moon catalog, Earth geocentre semantics, every epoch, or the derivative of a secularly rotating orbit. The new velocity probe is a central difference with h=0.001 day; a fix should establish convergence across multiple h values before choosing a tolerance.

## 6. Verification queue — not confirmed open bugs in this scan

| ID | Priority / state | Historical item or unmeasured gate | Required next evidence |
|---|---|---|---|
| SCN-041 | P1 · VERIFY | WSA expansion uses field magnitude at a 1.005 R☉ footpoint and a nominal radius factor; historical R3/R4 and September 6 reports dispute the formula/name and topology semantics. Current magnitude computation was inspected, but no independent WSA case was run. | Analytic/reference expansion and speed-map comparison, footpoint/radius convention, open/closed mask and source-surface behavior. Fix or label the approximation honestly. |
| SCN-042 | P1 · VERIFY | Broader solar semantics: Hathaway normalization, multiple rotation laws, Y-up/Z-up transforms, Carrington orientation, AIA tile projection, and current-day sources at historical epochs. SCN-009 covers the demonstrated assimilation mechanism only. | Separate analytic/frame/projection probes per root cause using the September 6 report and H1 digest as leads. Do not count all solar formulas as either fixed or broken from one PFSS probe. |
| SCN-043 | P1 before enabling moons · VERIFY | Remaining satellite elements/period conventions and full-catalog accuracy. September's 11/26 or 18/26 failure counts are not current measurements; `bd48a7d` adds fitted and native-source-frame paths and stronger validation. | Validate the intended rendered set across declared coverage; compare uncovered bodies and boundaries with parent-relative external states. Define unavailable/approximate behavior before exposing moons. |
| SCN-044 | P2 · VERIFY | Broad MGA solution quality and mission realism. The old inert-search complaint is substantially changed by bounded coupled search and real/synthetic feasible-assist tests; those tests pass. This is not proof of Galileo/Cassini window coverage or global optimality. | New independent real-window benchmark including two-assist cases, pruning/budget effects, v∞ continuity, periapsis policies, and truthful exhausted/inconclusive outcomes. |
| SCN-045 | P2 · VERIFY / capability | Multi-revolution Lambert remains unsupported (`TRAJECTORY_LAMBERT_MAX_REVOLUTIONS = 0`); short-TOF/hyperbolic and near-180° claims need rechecking after the large Lambert rewrite. | Declare supported transfer classes; repeat independent reference cases for boundary geometry, TOF, and M>0 before requesting expanded support. Old fixed-bracket failures are not presumed current. |
| SCN-046 | P2 · VERIFY | Actual reproducibility of current asteroid/moon artifacts and the new fitted moon generator. The scripts' mutable-input problem is SCN-034; exact present-day deltas were not measured. | Safe rebuild to a temporary destination from pinned input; hashes and provenance; offline `generate_moon_ephemeris.py --check` with its required inputs. |
| SCN-047 | P1 · VERIFY | End-to-end browser delivery, accessibility, frontend coverage, GPU precision/performance, and cross-endpoint load. September's FPS, coverage, bandwidth, and 17 s `/health` figure cannot be reused as current. | Browser traces for dev/preview with source states, observed AIA success, missing-WebGL and keyboard cases; coverage with a declared denominator; bounded slow-upstream and cold-PFSS load tests with a documented host. |
| SCN-048 | P1 · VERIFY | Live SWPC/GONG/provider availability and deployment exposure. Current SWPC constants still name the old one-day feeds. Web retrieval in this scan returned tool errors, not a usable HTTP-status measurement. Non-loopback authentication/proxy policy was not tested. | Timestamped bounded HTTP captures for the exact configured endpoints and real deployment configuration; distinguish upstream HTTP failure from tooling/network failure. Do not assert a current 404 from the September log. |
| SCN-049 | P2 · VERIFY | Remaining low-priority historical ledger: replay/randomness, dead Tudat SRP/galactic tide, WebSocket seek correlation/disconnect logs, energy rebaselining, path disclosure, broken doc links, fonts, ineffective perturbation claims, other SMBH conversions, binaries/Trojans/star manifests. | Triage each against current callers and a focused reproduction; split confirmed root causes into new stable IDs. Do not carry old counts forward or label dormant code as a shipped feature. |

## 7. Historical reconciliation and preserved fixes

### Changes that invalidate blanket carry-forward claims

| Historical claim | Current assessment | Evidence / residual |
|---|---|---|
| H-3: unbounded synchronous trajectory fan-out starves the shared API pool | **Fixed in the covered implementation/tests; broader load acceptance remains SCN-047.** | Async trajectory endpoints, dedicated bounded executor, deadlines/budgets/cancellation, remote-provider constraints, and shared ephemeris safety tests. The 458-test run includes these tests. Do not repeat the old 1,312-call / 3.6 h / 17 s measurements as current. |
| M-7: body size is unbounded and validation reflects full inputs | **Fixed for the six named trajectory/mission/benchmark ingress paths.** | [server.py](../backend/server.py):781–828 applies bounded bodies and sanitized validation errors to `TRAJECTORY_INGRESS_PATHS`; corresponding endpoint tests pass. This is not a claim of universal API authentication or all-path protection. |
| M-2: browser UTC is fed directly to a TDB model | **Preserve the `bd48a7d` conversion and contracts.** | `src/constants.ts`, its tests, and worker contracts are updated and pass. Leap-second/time-range assumptions remain part of the documented model. |
| M-22: the Moon still double-counts apsidal precession | **Old blanket claim superseded for the corrected fitted/native-frame paths.** | Moon ephemeris/source-frame tests and 140-row gate pass. Remaining catalog accuracy is SCN-043. |
| M-24: moon verification is only one epoch with loose radius tolerances | **Old description is obsolete.** | Current command validates 20 moons × 7 epochs, including corrected-state contracts. It is still not an all-moon certification. |
| M-4: MGA is effectively inert | **Changed substantially; do not repeat the old 96-attempt result.** | Bounded search tests include independently revalidated real Kepler assist and feasible synthetic two-assist cases. Wider search quality is SCN-044. |
| Worker transport loses double precision | **Preserve Float64 payload/filtering behavior.** | Current worker contract tests pass. Shader precision remains the separate SCN-013. |
| IAS15 compatibility / mean-element N-body seeding / Kuiper velocity units | **Preserve the existing fixes.** | REBOUND 5.1.1 is installed and the full suite, including initial-condition, Horizons-accuracy, and Kuiper-unit tests, passes. No new long-term integration claim is made. |
| Lambert returns uncertified exhausted solutions / free powered flybys | **Preserve TOF certification and unpowered v∞ checks.** | Current Lambert state/reference and MGA flyby tests pass. Extra solver capabilities and coverage remain SCN-044/045. |
| Heavy permits are released while timed-out work continues | **Preserve ownership until worker completion.** | `_run_owned_thread` and resource-contract tests cover this behavior. It does not terminate solar compute or guarantee warm-snapshot availability. |
| Catalog provenance, report path containment and overwrite checks | **Preserve current protections.** | Source frontend tests and backend report/benchmark tests pass. Dataset regeneration and independent benchmark truth remain separate issues. |
| Accessibility is now fully fixed | **Incorrect; latest commit is a design.** | Existing labels, focus styles, drawer trapping and CSS reduced-motion improvements remain. SCN-030/031 and the approved design cover outstanding behavior. |

### September 24 ID crosswalk

All 47 IDs from that audit are mapped below so that omissions are visible. Mapping is not a claim that every historical reproduction was repeated.

| Prior ID(s) | Current destination / treatment |
|---|---|
| H-1 | SCN-005, SCN-006; additional solar mechanisms SCN-007–011 |
| H-2 | SCN-001–004; WSA/solar acceptance SCN-041/042 |
| H-3 | Preserved trajectory containment above; wider load SCN-047 |
| H-4 | SCN-012 |
| H-5 | SCN-035; no inherited legal conclusion |
| H-6 | SCN-032 |
| M-1 | SCN-013 |
| M-2 | Preserved time-scale correction above |
| M-3 | SCN-016 |
| M-4 | Updated implementation above; wider quality SCN-044 |
| M-5 | SCN-036 |
| M-6 | SCN-007; solar and trajectory guards differ |
| M-7 | Scoped ingress fix above; deployment review SCN-048 |
| M-8 | SCN-009 |
| M-9 | SCN-023 |
| M-10 | SCN-024 |
| M-11 | SCN-025, SCN-029 |
| M-12 | SCN-047; no current coverage percentage asserted |
| M-13 | SCN-034, SCN-046 |
| M-14 | SCN-014 |
| M-15 | SCN-018 |
| M-16 | SCN-027 |
| M-17 | SCN-033, SCN-049 |
| M-18 | SCN-048; current upstream HTTP status unverified |
| M-19 | SCN-045 |
| M-20 | SCN-028 |
| M-21 | SCN-015 |
| M-22 | Corrected-path closure above; residual SCN-043 |
| M-23 | SCN-043; old counts not reused |
| M-24 | Multi-epoch gate now passes; residual SCN-043 |
| L-1 | SCN-045; changed Lambert code needs a new boundary probe |
| L-2 | SCN-022 |
| L-3 | SCN-038 |
| L-4, L-5 | SCN-049; disclosure/disconnect outcomes not rerun |
| L-6 | SCN-031 |
| L-7 | SCN-030, SCN-047; distinguish CSS motion from simulation motion |
| L-8 | SCN-049 |
| L-9 | Repeated writes in SCN-030; actual layout counts in SCN-047 |
| L-10, L-11, L-12, L-13, L-14 | SCN-049 |
| L-15 | SCN-039; casing inconsistency is not independently counted |
| L-16 | SCN-049 |
| L-17 | SCN-004 |

Older R01–R56 and September 6 physics topics remain historical root-cause inventories. Their counts and branch statuses are not additive to this tracker. In particular, the September 25 sun-focus convergence plan describes multiple branch tips; its proposed branch merge is not automatically the next action on this trajectory branch.

## 8. Suggested execution order

1. **Retain reproducible evidence and restore trustworthy developer gates:** SCN-026/027/029, then the typecheck and dependency backlog SCN-025/028. Archive the intended historical artifacts under SCN-040 without deleting or staging unrelated work.
2. **Correct the scientific solar foundation:** SCN-001/002/003, with exact/bounded input handling SCN-004/008 and independent WSA/solar reference checks SCN-041/042. Security identity containment SCN-007 can proceed independently of the numerical work.
3. **Make solar delivery observable and reliable:** SCN-005/006/009/010/011, followed by the real browser/load gates in SCN-047. Use the existing H1 and R3/R4 plans as design inputs, rechecking their branch assumptions.
4. **Repair scientific representation and evidence:** SCN-012/013/014/016/017/019/020/021. Preserve current trajectory and moon fixes; establish missing oracles before expanding capabilities.
5. **Complete the approved frontend work and align product claims:** SCN-030/031/032, then paused work, configuration, dataset tooling/provenance and other P2 items. Enable moons or advertise mission-grade accuracy only after the relevant acceptance gates.

### Tracker maintenance contract

For an entry moved to `IN PROGRESS`, record an owner and implementation branch/PR. For `RESOLVED`, record the fixing commit, the original failing reproduction, the passing replacement gate, and its scope. For `NOT A BUG`, record the counterexample or intended contract. Retain the old ID with a destination for duplicates. A passing generic test suite, a merged design document, an upstream timeout, or absence from the UI is not by itself a closure reason.

Suggested update record:

```text
ID: SCN-___
Status: OPEN | IN PROGRESS | BLOCKED | RESOLVED | NOT A BUG | DUPLICATE
Owner:
Last verified (date + commit):
Evidence / reproduction:
Fix / PR:
Acceptance command and actual result:
Remaining scope / linked ID:
```

## 9. Reproduce this scan

Run from the repository root. These instructions intentionally scope product tests and use a temporary Python environment. Do not execute catalog update scripts merely to ask for help.

```bash
git rev-parse HEAD
git status --short
npm run build
npm run typecheck
npm test
npm test -- src
npm run verify:planet-positions
npm run verify:moon-frames
npm audit --json

# First reproduce the missing test dependency in a NEW temporary environment.
uv venv --python python3.12 /tmp/solar-codebase-scan-repro
uv pip install --python /tmp/solar-codebase-scan-repro/bin/python -r backend/requirements.txt
/tmp/solar-codebase-scan-repro/bin/python -m pytest backend/tests --collect-only -q

# Then add the separately recorded test prerequisite; do not confuse this with
# a successful requirements-only install. Current registry resolutions may drift.
uv pip install --python /tmp/solar-codebase-scan-repro/bin/python httpx2
/tmp/solar-codebase-scan-repro/bin/python -m pytest backend/tests -q
/tmp/solar-codebase-scan-repro/bin/python agent-notes/CODEBASE_SCAN_2026-10-07_EVIDENCE/probe_backend.py

node_modules/.bin/esbuild agent-notes/CODEBASE_SCAN_2026-10-07_EVIDENCE/probe_frontend.mjs \
  --bundle --platform=node --format=esm --outfile=/tmp/solar-scan-repro.mjs
node /tmp/solar-scan-repro.mjs
```

For an exact Python package set, use the retained `python-freeze.txt` instead of resolving requirements anew; doing so does not reproduce the requirements-only collection failure. The backend audit probe refuses urllib network access and prints observations rather than failing on known bugs. **Exit 0 from a probe means the probe ran, not that its reported invariants passed.** Browser/provider/load acceptance requires separate harnesses. The temporary environment and generated JS bundle are disposable; all report evidence and probe sources are retained in the repository directory.

## 10. Source documents and provenance

- [September 24 audit](CODEBASE_AUDIT_2026-09-24.md) and its retained evidence: principal historical ID baseline; includes its own corrections and the `bd48a7d` addendum. Pre-existing untracked material.
- [September 7 audit](CODEBASE_AUDIT_2026-09-07.md) and [September 6 physics audit](CODEBASE_AUDIT_2026-09-06.md): historical hypotheses and physics leads, not current status authority.
- [August 24 reconciliation](MAJOR_ISSUE_REPORT_2026-08-24.md) and [Report C / R01–R56 ledger](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md): prior root-cause and branch history.
- [September 25 consolidated status/plan](SUNFOCUS_REGRESSION_STATUS_AND_FIX_PLAN_2026-09-25.md): branch-aware preservation and release gates; not a scan of this exact HEAD.
- [Trajectory amplification plan](TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md): compare with the actual September 26 implementation and passing tests.
- [R3/R4 PFSS work order](R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md): solver/input/delivery acceptance design.
- [H1 solar delivery plan](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md) and [digest](H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/h1/digest.md): historical delivery/upstream mechanisms; pre-existing untracked material.
- [October 7 accessibility design](../docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md): approved design only at audited HEAD.
- [JPL approximate planetary elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html): primary-source identity/time-scale check, accessed in this scan. JPL labels the matching Earth row as the Earth/Moon barycentre and specifies JDTDB for the formula. No new live Horizons truth vectors were downloaded.

Old February accuracy pass rates, unverifiable multi-tool captures, pruned plans, and a September 25 scan without retained results are not used as fresh numerical evidence. This file and its evidence directory are the current scan record; previous reports remain historical records.
