# F-05 / K-05 / K-06 / K-07 — moon frame conversion verification (pinned snapshot `44088f8`)

> **Historical snapshot — not current branch status.** This report is pinned to `44088f8`; later catalog and frame-conversion changes are intentionally outside its scope.

## Verdict: **NOT FIXED**

| sub-defect | verdict | evidence |
|---|---|---|
| **K-05** orbit-normal sign convention | **NOT FIXED** — unchanged | `catalog.ts:116` normal is still *exactly* `Rz(180°)` of `orbitMath.ts`'s h-hat (residual 8.5e-7°, 48 cases) |
| **K-06** ω re-referencing | **NOT FIXED** — new code, still wrong | analytic i=0 cases: periapsis 125–176° off |
| **K-07** parent pole | **PARTIALLY FIXED at best** — the authoritative fix is *dead code* | override map keyed `"Pluto"`/`"Uranus"`, looked up as `"pluto"`/`"uranus"` → always `undefined` |

The rewrite changed the code substantially but did **not** change the outcome. All 67 non-ecliptic moons still fail; Io/Callisto got **worse**.

---

## 1. Ground-truth table (executed, not inferred)

Bundled pinned `catalog.ts`+`orbitMath.ts` via `node_modules/.bin/esbuild --bundle --platform=node --format=cjs`; propagated with `propagateKeplerOrbit(orbit, jd - epochJd, …)` (= exactly what `SolarSystemModel.update` does), AU→km. Truth = Horizons API, `EPHEM_TYPE=VECTORS`, `CENTER='@<parent body>'`, `REF_PLANE='ECLIPTIC'`, `REF_SYSTEM='ICRF'`, `OUT_UNITS='KM-S'`, `VEC_CORR='NONE'`, `TLIST_TYPE='JD'`, `TIME_TYPE='TDB'`. Headers confirmed *"Center body name: Jupiter (599) / Center-site name: BODY CENTER / Reference frame: Ecliptic of J2000.0 / Output units: KM-S"* and calendar dates `2451545 = 2000-Jan-01 12:00 TDB`, `2461276.5 = 2026-Aug-24 00:00 TDB`.

### J2000 (JD 2451545.0 TDB), parent-relative, ecliptic J2000

```
moon        parent   frame        r_true(km)     dr(km)      dr/r     sep(deg)  plane(deg)  d|r|(km)   dv(km/s)
Moon (CTRL) Earth    ecliptic         402449        4432    0.0110       0.53        0.13      -2368     0.0159
Io          Jupiter  Laplace          420232      840296    1.9996     177.13        4.42         95    34.8477
Europa      Jupiter  Laplace          664878     1329485    1.9996     176.41        4.44        380    27.8262
Ganymede    Jupiter  Laplace         1070308     2138687    1.9982     176.25        4.26       -783    21.7649
Callisto    Jupiter  Laplace         1881685     3762046    1.9993     176.42        3.60        510    16.4131
Enceladus   Saturn   Laplace          236917      451807    1.9070     144.29       56.13        838    23.6660
Titan       Saturn   Laplace         1255511      884672    0.7046      42.35       54.88     -68265     4.2517
Iapetus     Saturn   Laplace         3650784     2966251    0.8125      48.71       25.12    -112603     2.2240
Phoebe      Saturn   Laplace        12120958     3515028    0.2900      16.81        8.88    -246962     0.1073
Triton      Neptune  Laplace          354716      626268    1.7655     123.93       55.90         84     8.7614
Charon      Pluto    equatorial        19598       21739    1.1092      67.36       38.66          2     0.2509
Cordelia    Uranus   Laplace           49771       42123    0.8463      50.08      164.83        -16    19.4529
Miranda     Uranus   equatorial       129780       30978    0.2387      13.71        8.79         28     1.5718
Ariel       Uranus   equatorial       191200       35031    0.1832      10.51        0.05        -85     1.0134
Titania     Uranus   equatorial       436005       81109    0.1860      10.67        0.13        -31     0.6803
Himalia     Jupiter  ecliptic       11298156      344558    0.0305       1.72        1.85      59680     0.0741
Pasiphae    Jupiter  ecliptic       25280258     3104726    0.1228       6.90        8.21     462596     0.1166
Nereid      Neptune  ecliptic        9385181       14070    0.0015       0.06        0.04      -9633     0.0049
Sinope      Jupiter  ecliptic       29911750     1146125    0.0383       2.11        5.16    -331079     0.1630
Carme       Jupiter  ecliptic       26522808     1183491    0.0446       1.66        0.12    -913158     0.0354
```

### Epoch 2 — 2026-08-24 (JD 2461276.5 TDB)

```
Moon (CTRL) Earth    ecliptic         403116       44970    0.1116       6.38       10.20       1490     0.1489
Io          Jupiter  Laplace          423097      845206    1.9977     174.46        4.43          0    34.6095
Europa      Jupiter  Laplace          673223     1345888    1.9992     176.67        4.71         10    27.4631
Ganymede    Jupiter  Laplace         1069333     1743256    1.6302     109.18        4.40        250    17.7602
Callisto    Jupiter  Laplace         1886771     3726304    1.9750     161.82        3.54        171    16.1655
Enceladus   Saturn   Laplace          236972      471888    1.9913     165.23       56.13       1892    22.5313
Titan       Saturn   Laplace         1230418     1074452    0.8732      51.56       54.86       9715     2.7956
Iapetus     Saturn   Laplace         3558940     2211216    0.6213      36.54       24.79     -67395     2.1902
Phoebe      Saturn   Laplace        12307308     8585825    0.6976      34.91        9.81    2694587     0.8853
Triton      Neptune  Laplace          354740      652942    1.8406     133.92       58.24         60     8.2034
Charon      Pluto    equatorial        19593       23480    1.1984      73.61       38.66          7     0.2296
Cordelia    Uranus   Laplace           49738       98223    1.9748     161.67      164.67         17     3.9835
Miranda     Uranus   equatorial       130039       26239    0.2018      11.59        0.82       -322     1.3481
Ariel       Uranus   equatorial       190820       35645    0.1868      10.71        0.05        208     1.0337
Titania     Uranus   equatorial       435941       82103    0.1883      10.81        0.09       -515     0.6860
(ecliptic-frame set degrades as expected from frozen Kepler elements: Nereid 0.05°, Himalia 66°, Carme 145°)
```

### 3. The control — harness is sound

`Moon` reproduces the prior audit **to the digit**: `4,432 km / 0.011 / 0.53° / 0.13°` (prior: `4,432 / 0.011 / 0.53 / 0.13`). Unchanged, as it must be — Earth's Moon takes the `ecliptic` short-circuit at `catalog.ts:315`. Side-by-side with the prior audit's other rows:

| moon | prior dr/r | now dr/r | prior sep° | now sep° | prior plane° | now plane° |
|---|---|---|---|---|---|---|
| Moon (CTRL) | 0.011 | **0.011** | 0.53 | **0.53** | 0.13 | **0.13** |
| Io | 1.970 | **2.000** | 159.95 | **177.13** | 4.42 | **4.42** |
| Callisto | 1.864 | **1.999** | 137.40 | **176.42** | 3.66 | **3.60** |
| Enceladus | 1.906 | **1.907** | 144.16 | **144.29** | 56.13 | **56.13** |

Plane errors are **identical**; positions moved *further* from truth.

---

## 4. Sub-defect verification

### K-05 — NOT FIXED. `src/sim/catalog.ts:116-127`

```ts
function orbitNormalFromElements(iDeg, ascendingNodeDeg): OrbitNormal {
  const i = (iDeg ?? 0) * DEG_TO_RAD;
  const omega = (ascendingNodeDeg ?? 0) * DEG_TO_RAD;
  const sinI = Math.sin(i);
  // Angular-momentum direction for Rz(Omega) * Rx(i) perifocal transform.
  return { x: -Math.sin(omega) * sinI, y: Math.cos(omega) * sinI, z: Math.cos(i) };
}
```

Constructed, not read: I took the propagator's h-hat **empirically** as `r × v` from `propagateKeplerOrbit` output and compared to this function over 48 (i, Ω) pairs.

```
 i(deg) node(deg) |  propagator h-hat (r x v)      |  catalog normal                | angle
      0        0  |   0.000000  0.000000  1.000000 |  0.000000  0.000000  1.000000 |   0.0000
      5        0  |  -0.000000 -0.087156  0.996195 |  0.000000  0.087156  0.996195 |  10.0000
     27    100.9  |   0.445800  0.085848  0.891007 | -0.445800 -0.085848  0.891007 |  54.0000
  97.77    309.1  |  -0.768921 -0.624885 -0.135197 |  0.768921  0.624885 -0.135197 | 164.4600
 157.3      45    |   ...                          |  ...                          |  45.4000
max angle( Rz(180)*propagator_h , catalog_normal ) over all 48 cases = 8.538e-7 deg
```

**Expected 0°; actual exactly 2i.** The comment on line 121 asserts the opposite of what the code does.

**New compounding finding:** `sourcePeriapsisDirection` (`catalog.ts:249`) uses the *correct* (propagator) convention while `orbitNormalFromElements` uses the flipped one. The two vectors handed to the same rotation are therefore **not orthogonal** — they describe no physical orbit:

```
  i=  0.5 node= 184 argp=   45  n.p = 0.012341   angle(n,p)= 89.293 deg
  i=  7.6 node=86.5 argp=254.5  n.p =-0.252653   angle(n,p)=104.635 deg   <- Iapetus
  i= 27   node=100.9 argp= 40   n.p = 0.520026   angle(n,p)= 58.666 deg
  n.p == sin(2i)*sin(argp) exactly
```

`elementsFromPlane` (`catalog.ts:263-285`) then inverts the *flipped* convention (`atan2(-normal.x, normal.y)`, line 266) and builds `nodeAxis = ẑ × normal` (line 268) which points **opposite** the true ascending node for the Ω it just emitted.

### K-06 — NOT FIXED. Analytic test with a known answer

For a moon with `i_src = 0`, JPL's ω is measured from the frame x-axis, so the periapsis **must** land at `R·(cos ω, sin ω, 0)` for the converter's own `R`:

```
  Io         w_src=  49.1  periapsis error = 175.878 deg   (expected 0.000)
  Enceladus  w_src= 119.5  periapsis error = 124.842 deg   (expected 0.000)
  Charon     w_src=     0  periapsis error = 134.643 deg   (expected 0.000)
  Ariel      w_src=   9.6  periapsis error = 149.742 deg   (expected 0.000)
```

`createSolarSystemCatalog` does now pass `frameNormalized.argPeriapsisDeg` (`catalog.ts:526`) — the *plumbing* changed, the *value* is still wrong.

### K-07 — the fix is present but unreachable. `catalog.ts:102-105`, `catalog.ts:180-189`

```ts
const PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC: Record<string, OrbitNormal> = {
  Uranus: normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(257.311, -15.175))),
  Pluto:  normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(132.993, -6.163)))
};
...
function parentPoleInEcliptic(parentId: string): OrbitNormal {
  const override = PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC[parentId];   // <- parentId is 'pluto'/'uranus'
```

`createSolarSystemCatalog` builds `parentId` from `planetNameToId` (`'Pluto' → 'pluto'`). Executed: `OVERRIDE['pluto'] → null`, `OVERRIDE['uranus'] → null`. **The IAU values are correct (0° and 8.5e-7° vs IAU) and never used.** Signature in the data: Charon's converted `i = 122.530` (exactly Pluto's `axialTiltDeg`) and `Ω = 270.000` (exactly the longitude-0 fallback).

Every parent then falls through to `(90 − axialTiltDeg, spinAxisLongitudeDeg)`:

```
parent    computed pole            IAU north pole (ecliptic)   err_vs_IAU
earth     lon=  0.000 lat= 66.561  lon= 90.000 lat= 66.561      32.672
mars      lon=  0.000 lat= 64.810  lon=352.907 lat= 63.282       3.457
jupiter   lon=  0.000 lat= 86.870  lon=247.818 lat= 87.783       4.466
saturn    lon= 79.530 lat= 63.270  lon= 79.528 lat= 61.948       1.322
uranus    lon=257.650 lat= -7.770  lon=257.647 lat=  7.722      15.492
neptune   lon=  0.000 lat= 61.680  lon=318.755 lat= 61.517      19.289
pluto     lon=  0.000 lat=-32.530  lon=137.351 lat=-22.816     111.290
PARENT_SPIN_AXIS_LONGITUDE_DEG = {mercury:0, venus:0, earth:0, mars:0, jupiter:0, saturn:79.53, uranus:257.65, neptune:0, pluto:0}
```

**The transformation `(90 − tilt, longitude)` is not the IAU pole**, exactly as you suspected: (a) `spinAxisLongitudeDeg` exists in `planets.ts` for **Saturn and Uranus only** — everyone else silently gets longitude 0; (b) even where it exists the latitude is wrong, because `axialTiltDeg` is obliquity to the *orbit* normal, not the ecliptic (Saturn off 1.32° despite having the longitude); (c) for Uranus the latitude **sign** is inverted (`90−97.77 = −7.77` vs true `+7.72`).

Reachable blast radius: `parentPoleInEcliptic` is called only by the 11 non-ecliptic moons lacking `poleRaDeg/poleDecDeg` — Uranus `Ariel, Umbriel, Titania, Oberon, Miranda, Puck` (pole 164.51° from the true rotational pole) and Pluto `Charon, Styx, Nix, Kerberos, Hydra` (111.29°).

**Why Ariel/Titania still show ~0.05° plane error — two bugs cancelling, proven numerically:**
```
Uranus: angle( Rz(180)*parentPoleInEcliptic , true rotational pole ) =   0.048 deg
Pluto : angle( Rz(180)*parentPoleInEcliptic , true rotational pole ) =  38.729 deg
```
The K-05 `Rz(180)` flip undoes the Uranus latitude-sign error. Their **plane** is accidentally right; their ω is still 150° off (sep 10.5°, dr/r 0.18). Pluto gets no such luck: 38.66° plane, 67–74° sep.

---

## 5. Round-trip / invariant tests (no network needed — strongest evidence)

Propagate the **source** elements with `orbitMath`, rotate the state vector by the converter's **own** `R = [planeX, planeY, sourcePole]`, vs. propagate the **converted** elements. A correct converter gives 0. (My rebuild of `R` was validated: it reproduces `convertElementsFromPlaneToEcliptic` to **3.3e-13 deg** across all 67 non-ecliptic moons.)

```
moon        frame        r(km)      dr(km)     dr/r    sep(deg)  plane(deg)
Io          laplace         420327      840399   1.9994     177.18        4.41
Europa      laplace         665259     1329869   1.9990     176.42        4.41
Ganymede    laplace        1069526     2137945   1.9990     176.31        4.19
Callisto    laplace        1882194     3762480   1.9990     176.35        3.68
Enceladus   laplace         237755      450408   1.8944     142.60       56.16
Titan       laplace        1187245     2200246   1.8532     135.83       54.81
Iapetus     laplace        3538181     6885398   1.9460     153.32       26.58
Phoebe      laplace       11873996    23724656   1.9980     174.92        5.03
Triton      laplace         354800      623844   1.7583     123.08       56.05
Charon      equatorial       19600       21449   1.0943      66.34      114.94
Cordelia    laplace          49755       26509   0.5328      30.90      164.61
Miranda     equatorial      129808      234486   1.8064     129.16      162.33
Ariel       equatorial      191115      336044   1.7583     123.08      164.46
Titania     equatorial      435974      285095   0.6539      38.17      164.46
```

Sweep of **all 67** non-ecliptic moons:
```
position-direction residual: {<0.1°: 0, 0.1-1°: 0, 1-10°: 0, 10-90°: 10, >90°: 57}
orbit-plane      residual: {<0.1°: 0, 0.1-1°: 0, 1-10°: 9, 10-90°: 33, >90°: 25}
moons with sep residual < 1 deg: (none)      moons with plane residual < 1 deg: (none)
```
**Zero of 67 pass.** This is independent of Horizons, of the frame's azimuth convention, and of the data quality.

### What a correct converter scores on the same data
I wrote a reference converter (correct h/periapsis convention, `Z` = source pole, `X` = source plane's ascending node on the ICRF equator, rotational-pole sign for Uranus):

```
moon        frame        | PINNED CODE  dr/r   sep    plane | CORRECT REF  dr/r   sep    plane
Io          laplace      |   2.000  177.1     4.42          |   0.002    0.1     0.05
Europa      laplace      |   2.000  176.4     4.44          |   0.001    0.0     0.04
Ganymede    laplace      |   1.998  176.2     4.26          |   0.001    0.1     0.07
Callisto    laplace      |   1.999  176.4     3.60          |   0.003    0.1     0.08
Enceladus   laplace      |   1.907  144.3    56.13          |   0.096    5.5     0.03
Triton      laplace      |   1.766  123.9    55.90          |   0.071    4.0     0.53
Charon      equatorial   |   1.109   67.4    38.66          |   0.001    0.1     0.08
Miranda     equatorial   |   0.239   13.7     8.79          |   0.019    1.1     0.03
Ariel       equatorial   |   0.183   10.5     0.05          |   0.004    0.2     0.00
Titania     equatorial   |   0.186   10.7     0.13          |   0.001    0.1     0.07
Cordelia    laplace      |   1.273   79.1   164.83          |   1.597  106.0     0.26
Titan       laplace      |   0.705   42.4    54.88          |   1.905  156.7     0.28
Iapetus     laplace      |   0.812   48.7    25.12          |   1.850  139.9     1.56
Phoebe      laplace      |   0.290   16.8     8.88          |   1.965  165.8     3.97
```
Same data, same propagator, same units: **0.1° instead of 177°.** So the defect is in the converter, not the data or the harness — **except** for Titan / Iapetus / Phoebe / Cordelia, where the plane is nailed (≤4°) but the phase is not, indicating a **separate ω/M-convention problem in `src/data/moons.json`** for those rows (outside F-05's scope; worth its own finding).

## 6. Regression check — `ecliptic` path

357 ecliptic-frame moons; **0** have their elements altered by the new code path (`catalog.ts:315-322` returns the raw elements, `normalizeDegrees`-wrapped; all source values already in [0,360)). The `Moon` control matching the prior audit bit-for-bit confirms it. Full catalog produces **0 non-finite elements** across 434 bodies. No regression.

## 7. Reachability / user impact

`src/main.ts:381` `const showMoons = false;` — a hardcoded const with no toggle. Moons are skipped at node creation (`:383`) and orbit-line creation (`:389`), and forced invisible at `:788`. `plannerBodyIds` filters to `parentId === 'sun'` (no moons). `jumpBodyIds` includes major moons but **nothing in `src/` consumes it**. Moons *are* still constructed and propagated by `SolarSystemModel.update` every frame (434 bodies), so the cost is CPU only.

**Severity: High as a latent physics defect, currently not user-visible.** Flipping one boolean surfaces 67 wrong moons at once — Jupiter/Saturn/Neptune/Pluto moons on the wrong side of their planet (dr/r ≈ 2.0) and Uranus's inner moons orbiting retrograde (plane 164.8°). The claimed fix does not reduce that risk.

## 8. Explicit refutation attempts

1. **"The harness is wrong."** Control matches the prior audit to the digit; my reference converter hits 0.001 dr/r vs Horizons through the *same* propagator, units, frame, origin and epoch plumbing. **Refuted.**
2. **"The `Rz(180)` flip is a self-consistent internal convention that cancels."** Tested via the code's own rotation on the code's own elements (§5) — up to 2.0 dr/r, and the analytic i=0 case is 125–176° off. Algebraically the composite is `S·R·S` where `R` is required; these differ whenever the source pole is off ẑ. **Refuted.**
3. **"JPL measures Ω from the source plane's node on the ecliptic, so my reference frame is the wrong one."** Tested that variant (refB): 16–20° sep for the Galileans vs 0.1° for the equator-node variant. The code's `SOURCE_FRAME_REFERENCE_ECLIPTIC_AXIS` (ICRF equator pole) is the *right* choice — I cannot blame the frame definition. **Refuted.**
4. **"The data is bad, not the code."** Same `moons.json` rows through a correct converter → ≤0.1° plane / ≤5.5° sep for 10 of 14. **Refuted** for those. **Not refuted** for Titan/Iapetus/Phoebe/Cordelia — a genuine separate data defect.
5. **"Ariel/Titania are fixed (plane 0.05°)."** Their plane is right only because two bugs cancel (`angle(Rz(180)·parentPole, true) = 0.048°`); ω is still 150° off, sep 10.5°, and the same cancellation fails for Pluto (38.7°). **Refuted.**
6. **"I mis-derived the propagator's normal."** Never derived it — took `r × v` empirically from `propagateKeplerOrbit` over 48 cases. **Refuted.**
7. **"The override key mismatch is harmless because `parentPoleInEcliptic` is unreachable."** It is reached by exactly 11 moons, confirmed by executed lookup (`→ null`) and by Charon's converted `i = 122.530` / `Ω = 270.000` fallback fingerprints. **Refuted.**
8. **"Ignoring `poleTiltDeg` (the Laplace-tilt branch at `catalog.ts:224-233` is dead) is a defect."** Checked: the supplied `poleRaDeg/poleDecDeg` already sit at exactly `poleTiltDeg` from the parent's IAU pole (Iapetus 14.8 → 14.765°, Phoebe 26.7 → 26.677°, Cordelia 180 → 179.973°). The early return is **correct**; the branch is merely unreachable dead code. **This sub-claim I refuted against myself.**

**Executed vs inferred:** everything above is executed. Horizons was reachable (20/20 bodies, HTTP 200). Nothing inferred except the IAU pole reference values (WGCCRE J2000; Neptune's used at its J2000 phase), which only affect the K-07 error magnitudes, not any verdict. Artifacts in `.../out/F05/`: `sim_states.cjs`, `compare.cjs`, `test_k05.cjs`, `test_k07.cjs`, `test_roundtrip.cjs`, `test_final.cjs`, `test_blast.cjs`, `fetch_horizons.py`, `horizons.json`, `horizons_raw_*.txt`. The pinned snapshot was never modified (`catalog_probe.ts` is a copy in my scratch dir; its body was `diff`-verified byte-identical to `catalog.ts` modulo import paths, plus one appended `export {}` line, and it reproduces the black-box catalog's elements exactly — max diff 0).
