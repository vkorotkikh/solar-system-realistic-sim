# Raw measurement data — audit of `ec7ad33`, 2026-09-07

> **Historical raw evidence — not current acceptance data.** These measurements support the audit of commit `ec7ad33`; preserve them as observed, and re-run the probes for current-branch conclusions.

Companion to `CODEBASE_AUDIT_2026-09-07.md`. Every number here was produced by a command in that
report's Appendix A. Horizons data was fetched live on 2026-09-07.

## A. Frontend planet model vs live JPL Horizons

Query: `EPHEM_TYPE=VECTORS, CENTER='500@10', REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF, OUT_UNITS=AU-D`

| epoch | body | pos err (km) | rel | vel err (km/s) | rel |
|---|---|---:|---:|---:|---:|
| J2000 | mercury | 1,030 | 1.48e-05 | 2.2626e-04 | 5.82e-06 |
| J2000 | venus | 8,112 | 7.53e-05 | 1.3033e-03 | 3.71e-05 |
| J2000 | earth | 6,792 | 4.62e-05 | 1.2331e-02 | 4.07e-04 |
| J2000 | mars | 8,193 | 3.94e-05 | 2.0769e-03 | 7.89e-05 |
| J2000 | jupiter | 1,149,805 | 1.55e-03 | 1.5138e-02 | 1.11e-03 |
| J2000 | saturn | 3,848,012 | 2.80e-03 | 1.6943e-02 | 1.69e-03 |
| J2000 | uranus | 1,077,458 | 3.61e-04 | 1.8177e-02 | 2.77e-03 |
| J2000 | neptune | 1,099,284 | 2.44e-04 | 1.8703e-02 | 3.45e-03 |
| J2000 | pluto | 1,359,996 | 3.01e-04 | 2.6498e-02 | 4.40e-03 |
| 1850 | mercury | 245 | 3.83e-06 | 5.0349e-04 | 1.17e-05 |
| 1850 | venus | 9,691 | 8.93e-05 | 1.9578e-03 | 5.61e-05 |
| 1850 | earth | 3,772 | 2.56e-05 | 1.3646e-02 | 4.51e-04 |
| 1850 | mars | 21,176 | 8.94e-05 | 1.4644e-03 | 6.31e-05 |
| 1850 | jupiter | 535,338 | 6.60e-04 | 4.3687e-03 | 3.49e-04 |
| 1850 | saturn | 4,234,897 | 3.00e-03 | 2.1507e-02 | 2.21e-03 |
| 1850 | uranus | 488,984 | 1.64e-04 | 6.5664e-03 | 1.00e-03 |
| 1850 | neptune | 144,954 | 3.23e-05 | 1.6534e-02 | 3.04e-03 |
| 1850 | pluto | 1,554,449 | 2.13e-04 | 2.9841e-02 | 8.01e-03 |
| 1900 | mercury | 1,393 | 2.21e-05 | 1.3713e-03 | 3.13e-05 |
| 1900 | venus | 6,907 | 6.35e-05 | 1.5615e-03 | 4.48e-05 |
| 1900 | earth | 4,490 | 3.05e-05 | 1.3737e-02 | 4.53e-04 |
| 1900 | mars | 23,208 | 1.09e-04 | 1.9499e-03 | 7.56e-05 |
| 1900 | jupiter | 335,134 | 4.16e-04 | 1.1882e-02 | 9.42e-04 |
| 1900 | saturn | 4,395,661 | 2.92e-03 | 3.3405e-02 | 3.65e-03 |
| 1900 | uranus | 1,221,130 | 4.30e-04 | 2.0384e-02 | 2.96e-03 |
| 1900 | neptune | 1,042,409 | 2.33e-04 | 2.1484e-02 | 3.94e-03 |
| 1900 | pluto | 1,273,469 | 1.81e-04 | 2.3488e-02 | 6.00e-03 |
| today | mercury | 2,990 | 4.92e-05 | 2.3094e-03 | 5.06e-05 |
| today | venus | 3,330 | 3.07e-05 | 1.2559e-03 | 3.60e-05 |
| today | earth | 8,075 | 5.48e-05 | 1.1162e-02 | 3.69e-04 |
| today | mars | 34,767 | 1.61e-04 | 3.7351e-03 | 1.47e-04 |
| today | jupiter | 424,740 | 5.45e-04 | 5.8343e-03 | 4.47e-04 |
| today | saturn | 1,872,310 | 1.31e-03 | 3.7219e-03 | 3.85e-04 |
| today | uranus | 1,027,884 | 3.52e-04 | 1.8933e-02 | 2.82e-03 |
| today | neptune | 833,293 | 1.86e-04 | 1.5327e-02 | 2.80e-03 |
| today | pluto | 1,573,275 | 2.97e-04 | 3.2053e-02 | 6.12e-03 |
| 2050 | mercury | 2,475 | 5.10e-05 | 2.3862e-03 | 4.24e-05 |
| 2050 | venus | 2,051 | 1.88e-05 | 1.1486e-03 | 3.30e-05 |
| 2050 | earth | 1,715 | 1.17e-05 | 1.2168e-02 | 4.02e-04 |
| 2050 | mars | 69,513 | 2.86e-04 | 4.5985e-03 | 2.04e-04 |
| 2050 | jupiter | 1,128,076 | 1.44e-03 | 1.7373e-02 | 1.34e-03 |
| 2050 | saturn | 2,994,189 | 2.00e-03 | 2.5546e-02 | 2.78e-03 |
| 2050 | uranus | 1,052,324 | 3.85e-04 | 1.6067e-02 | 2.25e-03 |
| 2050 | neptune | 646,934 | 1.45e-04 | 8.0968e-03 | 1.48e-03 |
| 2050 | pluto | 1,129,062 | 1.82e-04 | 3.0504e-02 | 6.79e-03 |
| 2100 | mercury | 2,251 | 3.48e-05 | 1.8601e-03 | 4.37e-05 |
| 2100 | venus | 11,347 | 1.05e-04 | 2.2055e-03 | 6.31e-05 |
| 2100 | earth | 3,501 | 2.38e-05 | 1.2646e-02 | 4.18e-04 |
| 2100 | mars | 39,288 | 1.74e-04 | 2.5069e-03 | 1.03e-04 |
| 2100 | jupiter | 541,725 | 6.64e-04 | 9.0529e-03 | 7.27e-04 |
| 2100 | saturn | 6,202,260 | 4.29e-03 | 2.5052e-02 | 2.63e-03 |
| 2100 | uranus | 1,934,721 | 6.48e-04 | 9.6453e-03 | 1.48e-03 |
| 2100 | neptune | 1,852,973 | 4.10e-04 | 7.0924e-03 | 1.31e-03 |
| 2100 | pluto | 1,903,355 | 2.60e-04 | 3.4042e-02 | 9.21e-03 |

## B. Error decomposition — independent Standish reimplementation vs Horizons

Reproduces the app's errors to 4 s.f., proving the error is the JPL model's, not an implementation bug.

| epoch\|body | total (km) | radial (km) | along-track (km) | normal (km) |
|---|---:|---:|---:|---:|
| J2000|mercury | 1,030 | 473 | 913 | 49 |
| J2000|venus | 8,112 | 2,465 | 7,726 | 201 |
| J2000|earth | 6,792 | -3,029 | 6,053 | 572 |
| J2000|mars | 8,193 | -7,264 | 3,724 | 701 |
| J2000|jupiter | 1,149,805 | 287,149 | 1,113,361 | 4,949 |
| J2000|saturn | 3,848,012 | -1,728,529 | -3,437,847 | -24,249 |
| J2000|uranus | 1,077,458 | -349,943 | -1,019,030 | 5,708 |
| J2000|neptune | 1,099,284 | -490,663 | -983,704 | -998 |
| J2000|pluto | 1,359,996 | 1,061,365 | -798,266 | -293,026 |
| 1850|mercury | 245 | 231 | 83 | 2 |
| 1850|venus | 9,691 | -1,083 | -9,630 | 55 |
| 1850|earth | 3,772 | -2,210 | -3,012 | 524 |
| 1850|mars | 21,176 | -9,158 | -19,090 | -361 |
| 1850|jupiter | 535,338 | 137,273 | 517,429 | 3,266 |
| 1850|saturn | 4,234,897 | 673,112 | 4,180,918 | 34,617 |
| 1850|uranus | 488,984 | 34,494 | -487,729 | -6,019 |
| 1850|neptune | 144,954 | 143,675 | -17,702 | 7,471 |
| 1850|pluto | 352,499 | -198,416 | -287,372 | -47,996 |
| 1900|mercury | 1,393 | 287 | 1,360 | -92 |
| 1900|venus | 6,907 | 3,882 | 5,708 | 229 |
| 1900|earth | 4,490 | -3,225 | -3,081 | 520 |
| 1900|mars | 23,208 | -19,091 | -13,196 | -140 |
| 1900|jupiter | 335,134 | 285,881 | -174,890 | -537 |
| 1900|saturn | 4,395,661 | -1,879,237 | 3,973,671 | 15,637 |
| 1900|uranus | 1,221,130 | -1,214,354 | 125,153 | -28,964 |
| 1900|neptune | 1,042,409 | 920,417 | -488,971 | 18,922 |
| 1900|pluto | 799,232 | 739,153 | -173,402 | 249,712 |
| today|mercury | 2,990 | -736 | -2,897 | -60 |
| today|venus | 3,330 | -1,881 | -2,747 | 80 |
| today|earth | 8,075 | -7,586 | 2,761 | -166 |
| today|mars | 34,767 | 32,982 | -10,993 | -207 |
| today|jupiter | 424,740 | -423,867 | -27,132 | -2,197 |
| today|saturn | 1,872,310 | -349,351 | 1,839,377 | 13,893 |
| today|uranus | 1,027,884 | -1,006,888 | 206,679 | 2,416 |
| today|neptune | 833,293 | -368,055 | -747,602 | -2,015 |
| today|pluto | 1,028,089 | 516,594 | -868,644 | -188,564 |
| 2050|mercury | 2,475 | -365 | -2,448 | 33 |
| 2050|venus | 2,051 | -1,931 | 687 | -83 |
| 2050|earth | 1,715 | -1,558 | -717 | 47 |
| 2050|mars | 69,513 | -6,544 | 69,200 | 780 |
| 2050|jupiter | 1,128,076 | 548,905 | 985,510 | 5,536 |
| 2050|saturn | 2,994,189 | 759,295 | -2,896,257 | 18,228 |
| 2050|uranus | 1,052,324 | -19,683 | -1,052,121 | -6,378 |
| 2050|neptune | 646,934 | -346,461 | -546,336 | -2,238 |
| 2050|pluto | 285,975 | -51,202 | -279,020 | -36,164 |
| 2100|mercury | 2,251 | 1,881 | -1,234 | 61 |
| 2100|venus | 11,347 | 4,295 | -10,497 | -347 |
| 2100|earth | 3,501 | 3,494 | -86 | -206 |
| 2100|mars | 39,288 | 29,816 | -25,556 | -1,214 |
| 2100|jupiter | 541,725 | 181,984 | 510,239 | 1,768 |
| 2100|saturn | 6,202,260 | -2,151,710 | -5,817,040 | -14,761 |
| 2100|uranus | 1,934,721 | 1,279,995 | -1,450,774 | -3,385 |
| 2100|neptune | 1,852,973 | -1,655,786 | 831,791 | 2,346 |
| 2100|pluto | 1,006,395 | -588,226 | 711,825 | 400,158 |

## C. Moon propagation vs live JPL Horizons (F-01)

Query: `CENTER='500@<parent>', REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF, OUT_UNITS=KM-S`
**A** = as shipped · **B** = with the SF-1 mean-longitude gate applied

| Moon | ephemeris | orbit radius (km) | J2000 | +30 d | +1 yr | +5 yr | today |
|---|---|---:|---:|---:|---:|---:|---:|
| **Moon** A | DE405/LE405 | 384,400 | 4,432 | — | 266,688 | **745,623** | 167,457 |
| **Moon** B | | | 4,432 | — | 6,728 | **6,071** | 1,839 |
| Io A | JUP365 | 421,700 | 831 | 317,986 | 840,170 | 842,281 | 141,867 |
| Io B | | | 831 | 161,408 | 592,474 | 589,702 | 839,912 |
| Europa A | JUP365 | 671,000 | 401 | 489,916 | 1,324,956 | 684,284 | 897,338 |
| Europa B | | | 401 | 264,254 | 961,718 | 941,079 | 1,336,794 |
| Ganymede A | JUP365 | 1,070,400 | 1,602 | 1,383 | 816 | 7,929 | 29,861 |
| Ganymede B | | | 1,602 | 3,318 | 50,126 | 248,580 | **1,209,342** |
| Callisto A | JUP365 | 1,882,700 | 4,790 | 2,659 | 3,573 | 4,365 | 9,429 |
| Callisto B | | | 4,790 | 4,276 | 24,703 | 111,843 | **573,261** |
| **Titan** A | SAT441 | 1,221,870 | **2,392,364** | 2,362,061 | 2,366,361 | 2,404,850 | 2,427,741 |
| **Rhea** A | SAT441 | 527,000 | **1,033,977** | 1,033,500 | 1,036,273 | 1,045,661 | 974,666 |
| Phobos A | MAR099 | 9,376 | 9 | 6,032 | 12,193 | 9,375 | 6,398 |
| Triton A | NEP097 | 354,800 | 25,064 | 25,068 | 25,688 | 37,115 | 127,767 |

**Conclusion:** the gate is required for `DE405/LE405` (Moon: 91–129× better) and harmful for
`JUP365`/`NEP097` (Ganymede 40× worse, Callisto 61× worse) — the JPL satellite tables publish **anomalistic**
periods for those sets. **The fix must be per-ephemeris.** Titan/Rhea are wrong *at the element epoch itself*,
which is an element-set/frame defect, not a propagation defect.

Ephemeris distribution across the 424 moons: SAT455 128, JUP347 89, SAT457 79, SAT456 42, SAT441 14,
URA184 14, SAT415 10, URA117 10, JUP365 8, NEP097 8, NEP104 7, URA182 6, PLU060 5, MAR099 2,
**DE405/LE405 1**, NEP105 1.

## D. UTC→TDB correction effect (F-09), epoch JD 2461025.5

| Body | as shipped (UTC JD) | TDB-corrected (+69.184 s) | change |
|---|---:|---:|---:|
| Mercury | 2,990 km | **229 km** | **−2,760** |
| Venus | 3,330 km | 1,897 km | −1,432 |
| Earth | 8,075 km | 9,017 km | +943 |
| Mars | 34,767 km | 34,121 km | −646 |
| Jupiter | 424,740 km | 424,640 km | −100 |
| Saturn | 1,872,310 km | 1,872,973 km | +663 |
| Uranus | 1,027,884 km | 1,027,997 km | +113 |
| Neptune | 833,293 km | 832,954 km | −338 |

## E. Pluto: legacy path vs the same table's own rates (F-10)

| Epoch | shipped (no rates) | with `Ldot = 145.20780515` | ratio |
|---|---:|---:|---:|
| J2000 | 1,359,996 | 1,359,996 | 1.00 |
| 1850 | 1,554,449 | 352,499 | **4.41** |
| 1900 | 1,273,469 | 799,232 | 1.59 |
| today | 1,573,275 | 1,028,089 | 1.53 |
| 2050 | 1,129,062 | 285,975 | **3.95** |
| 2100 | 1,903,355 | 1,006,395 | 1.89 |

## F. Lambert closure, certified via an independent universal-variable propagator (§8.1)

| Case | status | closure (km) |
|---|---|---:|
| Earth→Venus type | ok | 2.351 |
| short TOF 60 d | ok | 9.440 |
| near-collinear θ→0 | ok | 44.549 |
| near-collinear θ→180 | ok | 5.079 |
| high inclination 89° | ok | 2.401 |
| outer (Jupiter-like) | ok | 0.130 |
| very long TOF 1500 d | ok | 93.547 |
| exactly 180° | no solution | (correct — plane undefined) |
| TOF 1 d / 0 / negative / identical endpoints | no solution | (correct rejection) |

Returned keys: `computedTofDays, pathSense, revolutions, rootBracketed, rootResidualDays, transferAngleDeg, v1, v2, z`
Example: `rootResidualDays = 1.1932854704355123e-06` (0.103 s), `rootBracketed = true`.
`revolutions` is not an accepted parameter → **no multi-revolution support**.

Textbook check (circular Hohmann Earth→Mars): solver Δv₁ **2.9461 km/s**, independent computation 2.9461,
Vallado/Curtis 2.943. TOF 258.915 d.

## G. `/trajectory/plan` outbound fan-out (F-03)

| `max_assists` | ephemeris samples | local compute |
|---|---:|---:|
| 0 | 17 | 0.00 s |
| 1 | 382 | 0.11 s |
| 2 | **1,499** | 0.48 s |
| 3 | **1,499** | 0.50 s |

Same request, `ephemeris_provider=kepler`: **0.47 s, HTTP 200**. Default `auto`: **>240 s, http=000** (2/2 attempts).

## H. Asteroid catalog integrity and selection bias

```
header: magic=ACBF version=1 flags=0 stride=36 count=100000
file size=3,600,012 = 12 + 36×100,000                       OK
fnv1a32 (whole file) 0xf1f80244 == declared 0xf1f80244       OK
sha256  (whole file) a0b8328c… == declared a0b8328c…         OK
sample_top_10.json round-trip: 10/10 exact (|Δa|=0, |Δdiam|=0)
```

| Set | mean diameter | min diameter | mean a (AU) | mean e | mean i (deg) |
|---|---:|---:|---:|---:|---:|
| first 15,000 | 15.88 km | 7.72 km | 2.9821 | 0.1378 | 11.063 |
| **first 50,000 (rendered)** | **8.85 km** | **4.66 km** | **2.9415** | 0.1379 | **11.107** |
| full 100,000 (corpus) | 6.26 km | 2.80 km | 2.8574 | 0.1389 | 10.562 |

Corpus is `sort: "-diameter"` (per its own metadata) and the loader takes the first N in file order.

## I. Live REBOUND WebSocket invariants

| Quantity | Backend | Horizons @ J2000 | Δ |
|---|---:|---:|---:|
| Earth \|v\| | 30.285 km/s | 30.292 | 0.02 % |
| Jupiter \|v\| | 13.660 km/s | 13.676 | 0.12 % |
| Mercury \|v\| | 38.892 km/s | 38.882 | 0.03 % |

`seek idempotence: 0.000e+00 km` · `forward 10 yr → back: 0.000e+00 km` (re-initialises, so not a
reversibility test) · `energy_error @J2000 = 1.174e-15` · `energy_error after +200 yr seek = 0.0` (re-baselined).

Engine fallback: `{"type":"connected", "engine":"rebound", "engine_requested":"tudatpy", "integrator":"ias15", …}`

## J. `solveKeplerFast` divergence (F-24, latent)

| e | fast E | exact E | \|err\| rad |
|---:|---:|---:|---:|
| 0.05–0.90 | — | — | ≤ 2.2e-16 |
| 0.95 | 0.741918 | 0.741918 | 3.83e-08 |
| **0.99** | **−54.960286** | 0.831660 | **5.58e+01** |
| 1.05 | −1.314301 | 0.853750 | 2.17e+00 |

Shipped data: max KBO e **0.9164**, max asteroid e 0.2313.
**Worst error over all shipped eccentricities: 7.194e-14 rad** → latent risk only.

## K. Browser measurements (SwiftShader software WebGL — NOT representative of GPU hardware)

```
load event                1,162 ms
renderer                  ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)
context                   WebGL 2.0 (OpenGL ES 3.0 Chromium)
bodies                    55,010
page errors               0
FPS p50/p95/p99           0.8 / 0.4 / 0.4        (software)
rAF interval p50/p95/max  1,183 / 2,333 / 2,333 ms
heap over 2 min           35.6 → 35.6 MB (flat, no leak)
CPU: propagateKBOPositions(5,000)   1.06 ms/frame  = 6.3 % of a 60 FPS budget
CPU: generateAsteroidBelt(50,000)   32 ms (startup)
```

Degraded modes — `Bodies: 55,010` in **all** cases, no UI signal in any:
```
[catalog-blocked]  [phase-1] Using procedural fallback for asteroid belt: TypeError: Failed to fetch
[backend-blocked]  (silent; app fully functional)
[natural slow run] [phase-1] Acceptance gates failed: loadMs=3768.3 exceeded budgetMs=2000
```

## L. Coverage

**Frontend** (`npx vitest run --coverage`; `@vitest/coverage-v8` is **not** in `package.json`):
`src/sim` 39.61 % · `src/workers` 30.38 % · `src/sim/asteroids` 0 %
0 %: `solarSystemModel.ts`, `kuiperBelt.ts`, `asteroidBelt.ts`, `phase1AsteroidCatalog.ts`, `modelWorker.ts`,
all 4 `sim/asteroids/*`, `milkyWay.ts`, `orbitRenderer.ts`, `lodManager.ts`, `trajectory/*`
Well covered: `catalog.ts` 94.65 % · `orbitMath.ts` 91.21 % · `modelWorkerContract.ts` 96.49 % ·
`moonFrameCheck.ts` 82.69 % · `planetPositionCheck.ts` 72.84 %

**Backend** (`pytest --cov`): TOTAL **74 %** (inflated — test files are 100 %)
`server.py` **56 %** · `lambert.py` 86 % · `mga.py` 92 % · `planner.py` 75 % · `rebound_nbody.py` 76 % ·
`solar_physics.py` 76 % · `solar_realtime_data.py` **21 %** · `tudatpy_hooks.py` **31 %** ·
`radiation_pressure.py` **0 %**

## M. npm audit

| Package | Severity | Advisory |
|---|---|---|
| vitest <3.2.6 | **critical** | GHSA-5xrq-8626-4rwp |
| vite 7.0.0–7.3.3 | high | GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, +2 |
| rollup 4.0.0–4.58.0 | high | GHSA-mw96-cpmx-2vgc |
| postcss ≤8.5.22 | high | GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, +2 |
| picomatch 4.0.0–4.0.3 | high | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| nanoid ≤3.3.17 | high | GHSA-28wg-ghj8-5hjv, +2 |
| fflate 0.8.0–0.8.2 | moderate | GHSA-px8p-9vwx-vf98 |
| esbuild 0.27.3–0.28.0 | low | GHSA-g7r4-m6w7-qqqr |

Dependency counts: **prod 2**, dev 109, optional 52. All 8 are dev-only; `npm audit fix` resolves all.
