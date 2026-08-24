# Report A — Adversarial Verification of the Prior Register

**Part A of 4** · `main @ aa6e39a` · 2026-08-23 · read-only · **run 2 (independent re-execution)**

> Companion parts: **[Report 0 — Baseline](MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md)** · **[Report B — Blocked-Check Closure](MAJOR_ISSUE_REPORT_B_BLOCKED_CHECKS_2026-08-23.md)** · **[Report C — sun-focus & New-Issue Hunt](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md)**

## What this part is

The comprehensive evaluation of 2026-08-23 (`CODEBASE_EVALUATION_REPORT_2026-08-23.md`) produced 20 findings, F-01..F-20, every one of them re-derived by a single reviewer. Its planned independent adversarial pass **never ran** — its verifier agents died on a spend limit. This part closes that gap.

**Method.** Eleven agents, each assigned a finding cluster, each instructed to (1) re-run the reproduction from a clean state, (2) actively try to **refute** the finding — wrong line, guard in a caller, unreachable path, overstated impact, environmental artifact — and (3) record the refutation attempt and its outcome. A finding that could not survive a refutation attempt was to be downgraded or deleted.

This was executed **twice**. Run 1 and run 2 used the same cluster definitions but run-2 agents were explicitly told to derive everything fresh from source and their own command output, not to read run-1 artifacts, and to say plainly where they disagreed. **Run 2: 11/11 agents, 0 errors, 580 tool calls, ~1.25 M tokens.** Both runs are reported below, because agreement across two blind passes is stronger evidence than either alone — and the four places they disagree are the most interesting rows in the table.

## Headline

**No finding was wholly refuted. Three sub-claims were.** Of the 20 findings plus K-13:

| Disposition | Count | Findings |
|---|---|---|
| **CONFIRMED** unchanged | 13 | F-01, F-02, F-03, F-04, F-05, F-06, F-09, F-11, F-14, F-17, F-18, F-19, K-13 |
| **REVISED** — real, mechanism/severity/blast-radius differs | 7 | F-07, F-08, F-12, F-13, F-15, F-16, F-20 |
| **Sub-claims refuted** | 3 | F-08 "~60 missing paths"; F-15 "epoch quantization in the shipped binary"; F-20 "worker *and* CPU both propagate every tick" |

The register survives as a body of work. What the adversarial pass bought is **precision**: several findings were stated more broadly than the evidence supports, and two were understated.

---

## 1. Verdict table (both runs)

| ID | Run 1 | Run 2 | Agreed severity | What the adversarial pass changed |
|---|---|---|---|---|
| **F-01** belt inside the Sun | CONFIRMED crit | CONFIRMED crit | **Critical** | Run 2 found the defect is *also* in the `projectVertex` chunk, which drives `gl_Position` — so it is direct on-screen geometry, not a lighting artifact. Realistic-scale mode makes it ~1000× worse, not better. |
| **F-02** default `ias15` dead | CONFIRMED **crit** | CONFIRMED **high** | *disputed* — see §3.1 | Run 2 showed the shipped frontend never opens a WebSocket at all, so no user reaches this path today. Real, but not user-facing on `main`. |
| **F-03** benchmark fabricated | CONFIRMED high | CONFIRMED high | **High** | Run 2 enumerated 0–8 revolutions in both senses with pykep (Nmax=0 → only two branches exist) and refuted the "window-optimised capture" excuse `sun-focus` adopts. |
| **F-04** N-body mean-as-osculating | CONFIRMED high | CONFIRMED high | **High** | Run 2 re-seeded the same 10 bodies from Horizons state vectors: Saturn error drops 60.2 → **0.124 Mkm**, proving the initial conditions are the entire defect. And *every* body is worse, not just Saturn. |
| **F-05** moon frame conversion | CONFIRMED high | CONFIRMED high | **High** | Both runs independently found the register understates it: there are **three** compounding defects, not one. |
| **F-06** Lambert uncertified | CONFIRMED high | CONFIRMED high | **High** | Run 2 measured endpoint miss **2.09 AU** at TOF 0.01 d and confirmed `computedTofDays` is absent from the response body entirely. |
| **F-07** planet mean elements | CONFIRMED med (14 Mkm *not* reproduced) | REVISED med (**14 Mkm rescued**) | **Medium** | Run 1 sampled 3 epochs and found max 7.57 Mkm; run 2 swept 1990–2060 yearly and found Saturn peaks at **12.89 Mkm**. The register's figure was roughly right; run 1 simply didn't look at enough epochs. |
| **F-08** README ≠ product | REVISED med | REVISED med | **Medium** | Both runs **refute "~60 referenced paths missing"**: all 70 Project-Structure paths exist. Correct statement: 5 dead absolute links, 31 of 70 documented entries unreachable. |
| **F-09** 1,300 tsc errors, no gate | CONFIRMED high | CONFIRMED high | **High** | Run 2 rebuilt the reachable set from scratch (BFS incl. `new URL(...,import.meta.url)`) and got 438 exactly. Nuance: a `typecheck` script *does* exist — it is simply never chained into `build` and there is no CI. |
| **F-11** security posture | CONFIRMED high | CONFIRMED high | **High** (network-exposed) | Run 2 **executed** the overwrite on a sandboxed repo copy and destroyed a sentinel file. Both runs independently tightened the same sub-claim: the write is confined to `my-notes/**/*.md`, not arbitrary-FS. |
| **F-12** per-frame resize | CONFIRMED high | REVISED med | **Medium** | Both runs converged on a sharper mechanism than "setPixelRatio each frame": a **unit mismatch** (`canvas.width` in device px vs `w` in CSS px) means the guard can never be true on any DPR>1 display. |
| **F-13** H29 displaces bodies | REVISED med | REVISED **low** | **Low** | Both runs agree the mechanism is exactly as described *and* that it is a **numeric no-op**. Run 2 quantified it: max **2.87e-11 AU (4.3 m)** per frame — far below the 1e-4 AU info-box print resolution. |
| **F-14** corona non-deterministic | CONFIRMED med | CONFIRMED high | **High** | Run 2 diffed per-feature: **1,633 numeric field differences** across 220 matched features between two calls 0.5 s apart at the same `jd`. Also: only NOAA SWPC is dead; SILSO and Helioviewer still respond. |
| **F-15** asteroid fp32 / self-test | CONFIRMED high | REVISED high (**half refuted**) | **High** | Run 2 **refutes the "in binary" half**: the shipped catalog's float32 epochs are *lossless* (all multiples of 0.25 d). The 0.125 d error is a property of the synthetic **test generator**, not the data. The GPU quantization and the failing self-test are both real. |
| **F-16** licensing/provenance | REVISED med | REVISED med | **Medium** | Both runs tightened the same point: the README credits d3-celestial **correctly**; the Gaia mis-attribution is confined to `scripts/fetch_gaia_catalog.py`. Run 2 measured a 5042/5042 exact match against upstream. |
| **F-17** resilience / a11y | REVISED high | CONFIRMED high | **High** | Run 2's A/B browser test: WebGL off → 1 uncaught page error, body list empty, date `--`, and **no error word anywhere in visible text**. |
| **F-18** dead/duplicate/broken scripts | CONFIRMED med | CONFIRMED med | **Medium** | Run 2 measured 7 Kepler solver copies (5 distinct implementations) and confirmed the `temp_` duplicate is byte-identical by md5 after its 619-line comment header. |
| **F-19** cross-engine contract | CONFIRMED med | CONFIRMED med | **Medium** | Both runs agree this is **latent, not live** — the frontend never reads the `vel` field. Run 2 enumerated the live message keys: no `units`, `frame`, or `schema_version`. |
| **F-20** 434-body propagation | REVISED med | REVISED med | **Medium** | Both runs **refute "worker *and* CPU both propagate every tick"**: `main.ts:827-829` early-returns on a successful worker snapshot. The wasted 424-moon propagation is real. |
| **K-13** warp mesh never renders | CONFIRMED | CONFIRMED | **Low** | Run 2 executed `computeMultiMessengerTimeline` in H29 mode and enumerated the runtime channel keys — `'warpMetric'` is absent. Worse: the mesh is *drawn and discarded* every AGN frame (~33k verts). |

---

## 2. The three refuted sub-claims

These matter because a register that overstates loses credibility on the findings that are exactly right.

**F-08 — "~60 referenced paths do not exist" is false.** Run 2 checked all 70 README Project-Structure entries: **70/70 exist** (the single "missing" hit was a `#`-glue parse artifact). What is true: **5** distinct absolute `/home/nomad/Documents/...` links are dead, and **31 of 70** documented entries are unreachable from `src/main.ts`. The real doc defect is "these files exist but are not wired into the shipped app," which is a different and more useful statement.

**F-15 — the shipped binary's epochs are not quantized.** Run 2 decoded the shipped `.bin`: every float32 epoch is an exact multiple of 0.25 d and **99,956/100,000 are identical** to their source values — lossless, because the source epochs are themselves quarter-day values. The 0.125 d round-trip error the register cites comes from the **synthetic test generator** (`asteroidCatalogLoader.ts:285` adds 0.125/0.25-day fractions), not from any shipped data. The GPU-side quantization (absolute JD in an fp32 uniform → 0.25 d ULP → ~376,000 km along-track steps) and the self-test returning `ok:false` at 1250× its documented tolerance are both **confirmed**.

**F-20 — the worker and CPU paths do not both run.** `main.ts:827-829` early-returns once a worker snapshot lands, so the main-thread `model.update` executes only during startup or after the worker errors out. What is confirmed is the genuinely wasteful part: the worker propagates all **434** bodies including **424 moons that are never rendered** (98.3% of propagation cost, 97.7% of the worker→main payload) because `showMoons = false`.

---

## 3. Where the two runs disagreed

Four disagreements, all worth stating rather than smoothing over.

### 3.1 F-02 severity: Critical (run 1) vs High (run 2)

Both runs agree on every fact: `rebound_nbody.py:70-72` sets `sim.ri_ias15.min_dt/.epsilon`; REBOUND 5.1.1 has no such attribute (`'ri_ias15' in dir(Simulation())` → `False`); the default and explicit-`ias15` WebSocket connections both die `engine_init_failed` → close 1011; `whfast` and `mercurius` work (energy error 1.6e-15 / 2.2e-15); `/health` reports `available:true, fidelity:high` because it only checks that the module imports; and `test_seek_optimizations.py` monkeypatches a `_FakeIAS15` so 48/48 pass over the crash.

They disagree on blast radius. Run 2 established that **no shipped code path reaches this at all**: `src/main.ts` contains no WebSocket, and `simulationClient.ts` — the only module that opens `/ws/sim`, hardcoding `integrator: 'ias15'` — has **zero importers** anywhere in `src/`.

**Resolution: High, not Critical.** It is a genuine broken-capability-plus-false-health-claim defect, and the mocked test is a real testing failure. But nothing a user of the shipped app touches is broken by it today. It becomes Critical the moment the WebSocket client is wired up — which is exactly what the README already promises.

### 3.2 F-07 magnitude: run 2 rescued the register's number

Run 1 sampled three epochs, found a maximum Saturn error of 7.57 Mkm, and called the register's "1–14 Mkm" overstated. Run 2 swept **yearly from 1990 to 2060** against Horizons and found Saturn peaks at **12.89 Mkm** (around the 2020s), Jupiter 3.23, Uranus 1.69, Neptune 1.55. The register's upper bound was approximately right; run 1 simply sampled too few epochs to see it. **This is the clearest argument for running the pass twice** — a single blind pass produced a confidently wrong downgrade.

Run 2 also apportioned the UTC-as-TDB error precisely: the 69.184 s offset contributes only 0.06% of Saturn's error but **19.4% of Earth's**.

### 3.3 F-13 severity: Medium (run 1) → Low (run 2)

Both runs independently reached the same surprising conclusion — the `1e12` "visual exaggeration" multiplier multiplies a β of order 1e-18, so the H29 displacement is physically invisible. Run 2 measured the maximum per-frame world-position offset at **2.87e-11 AU (4.3 m)** for the H29 preset and 7.8e-9 AU (1.17 km) for the largest-energy preset, against a 1e-4 AU info-box print resolution. The mechanism (writes into `state.worldPosition`, non-integrating, runs while paused, reaches three user-visible consumers) is fully confirmed; the consequence is not. **Resolution: Low**, and the finding should be restated as a *labelling* issue, not a state-corruption one.

### 3.4 F-12 severity: High (run 1) → Medium (run 2)

Same mechanism, better characterized in run 2 (the CSS-px vs device-px unit mismatch at `main.ts:880`). Both agree the redundant `setSize` + `updateProjectionMatrix` runs every frame forever on any HiDPI display. Since the measured cost is real but bounded and the fix is a one-line comparison change, **Medium** is the better call.

---

## 4. Selected evidence

The strongest independent re-derivations from run 2, quoted because they are what a second engineer would want to re-run:

**F-01** — instantiated the real renderer under Node and read `mesh.instanceMatrix` directly, rather than reasoning about GLSL:
```
i=    0  a=2.769 AU  |orbit|=2.7066 AU  |world_actual|=0.023496 AU  |world_if_correct|=2.7001 AU
i=14999  a=2.695 AU  |orbit|=2.4462 AU  |world_actual|=0.005445 AU  |world_if_correct|=2.4451 AU
ALL 15000: orbital radius 1.742..3.700 AU  ->  MAX rendered world radius 0.023496 AU
instanceMatrix decompose: scale=(2.7e-3..7.67e-3), translation=(0,0,0) for every instance
Sun rendered radius = 0.3754 AU  ->  the belt blob sits 16x inside the Sun's sphere
```
Five refutation routes were tried and all failed, including executing `updatePositions()` with a 2.5 AU array and confirming `instanceMatrix` does not change.

**F-04** — the isolation experiment that proves the cause:
```
body      Kepler err   N-body err    N/K
saturn      1.179 Mkm    60.204 Mkm  51.0x
earth       0.010        0.232       22.1x
neptune     0.665       15.009       22.6x
Same 10 bodies re-seeded from Horizons STATE VECTORS instead of elements:
saturn 60.204 -> 0.124 Mkm   (whfast and ias15 bit-identical)
```
The integrator is exonerated; the initial conditions are the entire defect.

**F-05** — with Earth's Moon as a control (it bypasses the converter, so a large error there would indict the test harness rather than the code):
```
moon        frame      dr(km)     dr/r    sep°    plane°
Moon (CTRL) ecliptic     4,432    0.011    0.53     0.13   <- harness is sound
Io          Laplace    827,729    1.970  159.95     4.42
Callisto    Laplace  3,506,727    1.864  137.40     3.66
Enceladus   Laplace    451,639    1.906  144.16    56.13
```

**F-11** — the file-overwrite primitive, executed against a sandboxed copy:
```
POST /benchmark/accuracy/report {"output_path":"ACCURACY_REPORT_2026-02-15_04-51-05.md"}
  -> sha 8fce85b8 -> ab4e4058; sentinel "IMPORTANT USER NOTES" grep count 0 (file destroyed)
"a/b/c/d/e/f/g/pwn.md" -> 200, 7 directories created under my-notes/
Traversal correctly REJECTED: ../README.md, /etc/passwd, my-notes/../README.md, symlink escapes
GET /health -H 'Origin: https://evil.example'
  -> access-control-allow-origin: https://evil.example + allow-credentials: true
```

---

## 5. New issues surfaced while verifying

The refutation pass was not supposed to find new defects, but adversarial reading does that anyway. These are carried into **Report C** for disposition; listed here for provenance:

- **`/solar/physics` silently ignores unknown query parameters.** `?julian_date=...` (instead of the declared `jd`) returns a state for the current wall-clock instant with no warning — a caller typo yields plausible-looking wrong-epoch data.
- **Zero-confidence observations are still blended.** `data_assimilation.applied=true` with `observed_confidence=0.0` and `blend_weight=0.25` — the model blends in an observation it knows nothing about.
- **`ephemeris_service.py:238-243`** falls back to sending a raw catalog name (e.g. `'Europa '`) as a Horizons `COMMAND` for any body outside its 10-entry map.
- **`TrajectoryPorkchopRequest.tof_min_days`** has no `gt` constraint while the step fields do, so `tof_min_days=0.01` is accepted and every sub-feasible grid row enters the scan.
- **`scan_porkchop_window`** accumulates every solved cell in memory and truncates only at serialization (`points[:500]`), so memory scales with the grid, not the response.
- **Unhandled `RuntimeError` → HTTP 500** on `/trajectory/porkchop` and `/trajectory/lambert` when the provider chain is exhausted.
- **The H29 speculative label is destructible**: `main.ts:1018-1025` writes it into `#body-info` on one change event, and any later body-list interaction overwrites it.
- **`beltRenderer.ts:175-188`** drops the `#if defined(USE_ENVMAP) || ...` guard three.js wraps `worldpos_vertex` in — harmless today, breaks if three moves the declaration.
- **Frustum culling is disabled on the belt** (`mesh.frustumCulled = false`), which masks that its bounding sphere is ~0.02 AU; re-enabling culling would cull the entire belt.

---

## 6. What this part did not do

- It did **not** re-derive the Ground-Truth-Packet baseline (that is Report 0) or hunt outside the register (that is Report C).
- Four F-items touch code that is unreachable from `src/main.ts`; their severities are stated for the dormant class, with the reactivation trigger noted, per the scope rule in Report 0 §1.2.
- TudatPy and real-GPU measurements remain blocked; no finding here depends on either.
