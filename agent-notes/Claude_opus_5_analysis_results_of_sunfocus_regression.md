> **Historical raw transcript — not current branch status.** This file concatenates the moon-frame, IAS15, and server-hardening audit outputs from the 2026-08-24 pinned-checkout review. Prefer the standalone verification reports for formatted citations, and re-run their checks before treating a verdict as current.

Verdict: NOT FIXED
sub-defect	verdict	evidence
K-05 orbit-normal sign convention	NOT FIXED — unchanged	catalog.ts:116 normal is still exactly Rz(180°) of orbitMath.ts's h-hat (residual 8.5e-7°, 48 cases)
K-06 ω re-referencing	NOT FIXED — new code, still wrong	analytic i=0 cases: periapsis 125–176° off
K-07 parent pole	PARTIALLY FIXED at best — the authoritative fix is dead code	override map keyed "Pluto"/"Uranus", looked up as "pluto"/"uranus" → always undefined
The rewrite changed the code substantially but did not change the outcome. All 67 non-ecliptic moons still fail; Io/Callisto got worse.

1. Ground-truth table (executed, not inferred)
Bundled pinned catalog.ts+orbitMath.ts via node_modules/.bin/esbuild --bundle --platform=node --format=cjs; propagated with propagateKeplerOrbit(orbit, jd - epochJd, …) (= exactly what SolarSystemModel.update does), AU→km. Truth = Horizons API, EPHEM_TYPE=VECTORS, CENTER='@<parent body>', REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF', OUT_UNITS='KM-S', VEC_CORR='NONE', TLIST_TYPE='JD', TIME_TYPE='TDB'. Headers confirmed "Center body name: Jupiter (599) / Center-site name: BODY CENTER / Reference frame: Ecliptic of J2000.0 / Output units: KM-S" and calendar dates 2451545 = 2000-Jan-01 12:00 TDB, 2461276.5 = 2026-Aug-24 00:00 TDB.

J2000 (JD 2451545.0 TDB), parent-relative, ecliptic J2000

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
Epoch 2 — 2026-08-24 (JD 2461276.5 TDB)

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
3. The control — harness is sound
Moon reproduces the prior audit to the digit: 4,432 km / 0.011 / 0.53° / 0.13° (prior: 4,432 / 0.011 / 0.53 / 0.13). Unchanged, as it must be — Earth's Moon takes the ecliptic short-circuit at catalog.ts:315. Side-by-side with the prior audit's other rows:

moon	prior dr/r	now dr/r	prior sep°	now sep°	prior plane°	now plane°
Moon (CTRL)	0.011	0.011	0.53	0.53	0.13	0.13
Io	1.970	2.000	159.95	177.13	4.42	4.42
Callisto	1.864	1.999	137.40	176.42	3.66	3.60
Enceladus	1.906	1.907	144.16	144.29	56.13	56.13
Plane errors are identical; positions moved further from truth.

4. Sub-defect verification
K-05 — NOT FIXED. src/sim/catalog.ts:116-127

function orbitNormalFromElements(iDeg, ascendingNodeDeg): OrbitNormal {
  const i = (iDeg ?? 0) * DEG_TO_RAD;
  const omega = (ascendingNodeDeg ?? 0) * DEG_TO_RAD;
  const sinI = Math.sin(i);
  // Angular-momentum direction for Rz(Omega) * Rx(i) perifocal transform.
  return { x: -Math.sin(omega) * sinI, y: Math.cos(omega) * sinI, z: Math.cos(i) };
}
Constructed, not read: I took the propagator's h-hat empirically as r × v from propagateKeplerOrbit output and compared to this function over 48 (i, Ω) pairs.


 i(deg) node(deg) |  propagator h-hat (r x v)      |  catalog normal                | angle
      0        0  |   0.000000  0.000000  1.000000 |  0.000000  0.000000  1.000000 |   0.0000
      5        0  |  -0.000000 -0.087156  0.996195 |  0.000000  0.087156  0.996195 |  10.0000
     27    100.9  |   0.445800  0.085848  0.891007 | -0.445800 -0.085848  0.891007 |  54.0000
  97.77    309.1  |  -0.768921 -0.624885 -0.135197 |  0.768921  0.624885 -0.135197 | 164.4600
 157.3      45    |   ...                          |  ...                          |  45.4000
max angle( Rz(180)*propagator_h , catalog_normal ) over all 48 cases = 8.538e-7 deg
Expected 0°; actual exactly 2i. The comment on line 121 asserts the opposite of what the code does.

New compounding finding: sourcePeriapsisDirection (catalog.ts:249) uses the correct (propagator) convention while orbitNormalFromElements uses the flipped one. The two vectors handed to the same rotation are therefore not orthogonal — they describe no physical orbit:


  i=  0.5 node= 184 argp=   45  n.p = 0.012341   angle(n,p)= 89.293 deg
  i=  7.6 node=86.5 argp=254.5  n.p =-0.252653   angle(n,p)=104.635 deg   <- Iapetus
  i= 27   node=100.9 argp= 40   n.p = 0.520026   angle(n,p)= 58.666 deg
  n.p == sin(2i)*sin(argp) exactly
elementsFromPlane (catalog.ts:263-285) then inverts the flipped convention (atan2(-normal.x, normal.y), line 266) and builds nodeAxis = ẑ × normal (line 268) which points opposite the true ascending node for the Ω it just emitted.

K-06 — NOT FIXED. Analytic test with a known answer
For a moon with i_src = 0, JPL's ω is measured from the frame x-axis, so the periapsis must land at R·(cos ω, sin ω, 0) for the converter's own R:


  Io         w_src=  49.1  periapsis error = 175.878 deg   (expected 0.000)
  Enceladus  w_src= 119.5  periapsis error = 124.842 deg   (expected 0.000)
  Charon     w_src=     0  periapsis error = 134.643 deg   (expected 0.000)
  Ariel      w_src=   9.6  periapsis error = 149.742 deg   (expected 0.000)
createSolarSystemCatalog does now pass frameNormalized.argPeriapsisDeg (catalog.ts:526) — the plumbing changed, the value is still wrong.

K-07 — the fix is present but unreachable. catalog.ts:102-105, catalog.ts:180-189

const PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC: Record<string, OrbitNormal> = {
  Uranus: normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(257.311, -15.175))),
  Pluto:  normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(132.993, -6.163)))
};
...
function parentPoleInEcliptic(parentId: string): OrbitNormal {
  const override = PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC[parentId];   // <- parentId is 'pluto'/'uranus'
createSolarSystemCatalog builds parentId from planetNameToId ('Pluto' → 'pluto'). Executed: OVERRIDE['pluto'] → null, OVERRIDE['uranus'] → null. The IAU values are correct (0° and 8.5e-7° vs IAU) and never used. Signature in the data: Charon's converted i = 122.530 (exactly Pluto's axialTiltDeg) and Ω = 270.000 (exactly the longitude-0 fallback).

Every parent then falls through to (90 − axialTiltDeg, spinAxisLongitudeDeg):


parent    computed pole            IAU north pole (ecliptic)   err_vs_IAU
earth     lon=  0.000 lat= 66.561  lon= 90.000 lat= 66.561      32.672
mars      lon=  0.000 lat= 64.810  lon=352.907 lat= 63.282       3.457
jupiter   lon=  0.000 lat= 86.870  lon=247.818 lat= 87.783       4.466
saturn    lon= 79.530 lat= 63.270  lon= 79.528 lat= 61.948       1.322
uranus    lon=257.650 lat= -7.770  lon=257.647 lat=  7.722      15.492
neptune   lon=  0.000 lat= 61.680  lon=318.755 lat= 61.517      19.289
pluto     lon=  0.000 lat=-32.530  lon=137.351 lat=-22.816     111.290
PARENT_SPIN_AXIS_LONGITUDE_DEG = {mercury:0, venus:0, earth:0, mars:0, jupiter:0, saturn:79.53, uranus:257.65, neptune:0, pluto:0}
The transformation (90 − tilt, longitude) is not the IAU pole, exactly as you suspected: (a) spinAxisLongitudeDeg exists in planets.ts for Saturn and Uranus only — everyone else silently gets longitude 0; (b) even where it exists the latitude is wrong, because axialTiltDeg is obliquity to the orbit normal, not the ecliptic (Saturn off 1.32° despite having the longitude); (c) for Uranus the latitude sign is inverted (90−97.77 = −7.77 vs true +7.72).

Reachable blast radius: parentPoleInEcliptic is called only by the 11 non-ecliptic moons lacking poleRaDeg/poleDecDeg — Uranus Ariel, Umbriel, Titania, Oberon, Miranda, Puck (pole 164.51° from the true rotational pole) and Pluto Charon, Styx, Nix, Kerberos, Hydra (111.29°).

Why Ariel/Titania still show ~0.05° plane error — two bugs cancelling, proven numerically:


Uranus: angle( Rz(180)*parentPoleInEcliptic , true rotational pole ) =   0.048 deg
Pluto : angle( Rz(180)*parentPoleInEcliptic , true rotational pole ) =  38.729 deg
The K-05 Rz(180) flip undoes the Uranus latitude-sign error. Their plane is accidentally right; their ω is still 150° off (sep 10.5°, dr/r 0.18). Pluto gets no such luck: 38.66° plane, 67–74° sep.

5. Round-trip / invariant tests (no network needed — strongest evidence)
Propagate the source elements with orbitMath, rotate the state vector by the converter's own R = [planeX, planeY, sourcePole], vs. propagate the converted elements. A correct converter gives 0. (My rebuild of R was validated: it reproduces convertElementsFromPlaneToEcliptic to 3.3e-13 deg across all 67 non-ecliptic moons.)


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
Sweep of all 67 non-ecliptic moons:


position-direction residual: {<0.1°: 0, 0.1-1°: 0, 1-10°: 0, 10-90°: 10, >90°: 57}
orbit-plane      residual: {<0.1°: 0, 0.1-1°: 0, 1-10°: 9, 10-90°: 33, >90°: 25}
moons with sep residual < 1 deg: (none)      moons with plane residual < 1 deg: (none)
Zero of 67 pass. This is independent of Horizons, of the frame's azimuth convention, and of the data quality.

What a correct converter scores on the same data
I wrote a reference converter (correct h/periapsis convention, Z = source pole, X = source plane's ascending node on the ICRF equator, rotational-pole sign for Uranus):


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
Same data, same propagator, same units: 0.1° instead of 177°. So the defect is in the converter, not the data or the harness — except for Titan / Iapetus / Phoebe / Cordelia, where the plane is nailed (≤4°) but the phase is not, indicating a separate ω/M-convention problem in src/data/moons.json for those rows (outside F-05's scope; worth its own finding).

6. Regression check — ecliptic path
357 ecliptic-frame moons; 0 have their elements altered by the new code path (catalog.ts:315-322 returns the raw elements, normalizeDegrees-wrapped; all source values already in [0,360)). The Moon control matching the prior audit bit-for-bit confirms it. Full catalog produces 0 non-finite elements across 434 bodies. No regression.

7. Reachability / user impact
src/main.ts:381 const showMoons = false; — a hardcoded const with no toggle. Moons are skipped at node creation (:383) and orbit-line creation (:389), and forced invisible at :788. plannerBodyIds filters to parentId === 'sun' (no moons). jumpBodyIds includes major moons but nothing in src/ consumes it. Moons are still constructed and propagated by SolarSystemModel.update every frame (434 bodies), so the cost is CPU only.

Severity: High as a latent physics defect, currently not user-visible. Flipping one boolean surfaces 67 wrong moons at once — Jupiter/Saturn/Neptune/Pluto moons on the wrong side of their planet (dr/r ≈ 2.0) and Uranus's inner moons orbiting retrograde (plane 164.8°). The claimed fix does not reduce that risk.

8. Explicit refutation attempts
"The harness is wrong." Control matches the prior audit to the digit; my reference converter hits 0.001 dr/r vs Horizons through the same propagator, units, frame, origin and epoch plumbing. Refuted.
"The Rz(180) flip is a self-consistent internal convention that cancels." Tested via the code's own rotation on the code's own elements (§5) — up to 2.0 dr/r, and the analytic i=0 case is 125–176° off. Algebraically the composite is S·R·S where R is required; these differ whenever the source pole is off ẑ. Refuted.
"JPL measures Ω from the source plane's node on the ecliptic, so my reference frame is the wrong one." Tested that variant (refB): 16–20° sep for the Galileans vs 0.1° for the equator-node variant. The code's SOURCE_FRAME_REFERENCE_ECLIPTIC_AXIS (ICRF equator pole) is the right choice — I cannot blame the frame definition. Refuted.
"The data is bad, not the code." Same moons.json rows through a correct converter → ≤0.1° plane / ≤5.5° sep for 10 of 14. Refuted for those. Not refuted for Titan/Iapetus/Phoebe/Cordelia — a genuine separate data defect.
"Ariel/Titania are fixed (plane 0.05°)." Their plane is right only because two bugs cancel (angle(Rz(180)·parentPole, true) = 0.048°); ω is still 150° off, sep 10.5°, and the same cancellation fails for Pluto (38.7°). Refuted.
"I mis-derived the propagator's normal." Never derived it — took r × v empirically from propagateKeplerOrbit over 48 cases. Refuted.
"The override key mismatch is harmless because parentPoleInEcliptic is unreachable." It is reached by exactly 11 moons, confirmed by executed lookup (→ null) and by Charon's converted i = 122.530 / Ω = 270.000 fallback fingerprints. Refuted.
"Ignoring poleTiltDeg (the Laplace-tilt branch at catalog.ts:224-233 is dead) is a defect." Checked: the supplied poleRaDeg/poleDecDeg already sit at exactly poleTiltDeg from the parent's IAU pole (Iapetus 14.8 → 14.765°, Phoebe 26.7 → 26.677°, Cordelia 180 → 179.973°). The early return is correct; the branch is merely unreachable dead code. This sub-claim I refuted against myself.
Executed vs inferred: everything above is executed. Horizons was reachable (20/20 bodies, HTTP 200). Nothing inferred except the IAU pole reference values (WGCCRE J2000; Neptune's used at its J2000 phase), which only affect the K-07 error magnitudes, not any verdict. Artifacts in .../out/F05/: sim_states.cjs, compare.cjs, test_k05.cjs, test_k07.cjs, test_roundtrip.cjs, test_final.cjs, test_blast.cjs, fetch_horizons.py, horizons.json, horizons_raw_*.txt. The pinned snapshot was never modified (catalog_probe.ts is a copy in my scratch dir; its body was diff-verified byte-identical to catalog.ts modulo import paths, plus one appended export {} line, and it reproduces the black-box catalog's elements exactly — max diff 0).

Server stopped, port 8051 free. All work stayed in the scratch dir; the real repo was never touched.

F-02 Verification Report — ri_ias15 guard in rebound_nbody.py
Headline
The crash is genuinely fixed. The "silent downgrade" hypothesis is REFUTED — I tried hard to prove precision was lost and could not: results are bit-identical. But the fix is a dead branch that satisfies its own intent only by coincidence, and the masking test is 100% intact.

Overall verdict: FIXED (functionally) / NOT FIXED (as engineering) — split into three findings below.

Finding 1 — The WS crash: FIXED
backend/sim/rebound_nbody.py:70-77


if self._integrator == "ias15":
    ri_ias15 = getattr(self.sim, "ri_ias15", None)
    if ri_ias15 is not None:
        try:
            ri_ias15.min_dt = 0  # let integrator choose
            ri_ias15.epsilon = 1e-9
        except Exception:
            pass
Reproduction (server started from pinned copy on 8051):


cd <pinned>/backend && <venv>/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8051
<venv>/bin/python -u <out>/F02/ws_seek.py
Actual — both default and explicit ?integrator=ias15 connect, stream, and integrate correctly. Never 1011:


===== [A: default (no integrator param)] ws://127.0.0.1:8051/ws/sim =====
  connected: integrator='ias15' fidelity='high' engine='rebound' warnings=[]
  t=0 (J2000)   : jd=2451545.0000 earth_r=0.981872569AU earth_lon= 100.819deg jup_r=4.959902AU
  +0.25 yr      : jd=2451636.3125 earth_r=1.006744643AU earth_lon= 192.488deg jup_r=4.974717AU
  +0.50 yr      : jd=2451727.6250 earth_r=1.019584350AU earth_lon= 280.169deg jup_r=4.993738AU
  +1.00 yr      : jd=2451910.2500 earth_r=0.979315478AU earth_lon= 100.688deg jup_r=5.042646AU
  [A] closed cleanly, never 1011
Physics is sound: Earth's radius oscillates 0.979–1.020 AU (matches e=0.0167 → perihelion 0.983 / aphelion 1.017), and heliocentric longitude returns to 100.7° after exactly 1 yr (full 360° revolution). Jupiter moves 4.96→5.04 AU, correct for its 11.86 yr period.

Baseline confirmed still real — the pre-fix line under rebound 5.1.1:


AttributeError: 'Simulation' object has no attribute 'ri_ias15'
Severity: resolved (was High/Blocker).

Finding 2 — Silent downgrade? REFUTED. No precision lost.
This was the critical question, and the answer is the opposite of what the hypothesis predicted.

(a) rebound 5.1.1's IAS15 defaults are exactly the intended values. In rebound 5.x sim.integrator is an IntegratorConfiguration with ctypes field-descriptor access:


repr(sim.integrator) -> name=ias15, epsilon=1e-09, min_dt=0.0, adaptive_mode=PRS23, ...
The library docstring confirms: "epsilon … The default value is 1e-9", "min_dt … The default value is 0". The code wanted epsilon=1e-9, min_dt=0. It gets exactly that, from the defaults.

(b) Measured consequence — bit-identical. Ran the real 41-body catalog three ways (numeric.py):

mode	eff_epsilon	dE@1yr	dE@100yr	steps@100yr	wall@100yr
as_shipped (guard no-ops)	1e-09	5.6717e-15	3.7160e-15	15958	3.655s
explicit 1e-9 via rebound-5 API	1e-09	5.6717e-15	3.7160e-15	15958	3.895s
tight 1e-12	1e-12	5.4761e-15	3.7160e-15	42819	7.457s

-- t = 100.0 yr --
  as_shipped vs explicit_1e-9 : max|dr| = 0.000000e+00 AU (body=None) BIT-IDENTICAL
  as_shipped vs tight_1e-12   : max|dr| = 3.842351e-12 AU (body=venus)
      earth   |dr| vs explicit_1e-9 : 0.000000e+00 AU  (0.000000e+00 km)
Precision actually lost: exactly zero. Even a 1000× tighter tolerance buys nothing (3.7160e-15 at 100 yr either way — already at the floating-point roundoff floor) while costing 2.7× the steps.

(c) The correct rebound-5 API does exist and is sim.integrator.epsilon / sim.integrator.min_dt (verified settable: s.integrator.epsilon = 1e-12 → reads back 1e-12). Rebound's own test suite uses this form (sim.integrator.adaptive_mode = "individual"). The fix did not use it — but since the defaults already match the intent, no capability was lost.

Refutation attempt (this section IS the refutation): I set out to prove the fix silently downgrades accuracy. I compared as-shipped against the intent applied through the correct rebound-5 API on the real catalog over 1 yr and 100 yr. max|dr| = 0.0 exactly and identical step counts — the runs are the same computation. The downgrade hypothesis fails. I also checked sim.copy() (used by the checkpoint path) preserves integrator config: it does (epsilon=1e-12 survives the copy).

Severity: Low (was projected High). Correctness is intact; only maintainability is affected.

Finding 3 — Dead branch + except Exception: pass: PARTIALLY FIXED
backend/sim/rebound_nbody.py:71-72 — under rebound 5.1.1 getattr(sim,'ri_ias15',None) is always None, so the body never executes. Verified:


getattr(sim,'ri_ias15',None) -> None  => guard body executes: False
epsilon actually in effect  = 1e-09   (from library default, not from this code)
Root cause: the fix suppresses the AttributeError by guarding a rebound-4 attribute name instead of migrating to the rebound-5 sim.integrator.<field> API, leaving a permanently-false branch whose stated intent is satisfied only by coincidence with library defaults.

Concrete latent risk — if a maintainer ever tightens the tolerance by editing the guard body, the edit has no effect:


### 4. DEAD BRANCH RISK: if intent changed to a tighter epsilon, would it apply?
   epsilon after init = 1e-09 (would still be 1e-9; edit has NO effect)
On except Exception: pass: it is unreachable under 5.1.1 (the is not None check short-circuits first), so it masks nothing today. On any rebound version where ri_ias15 does exist, it would swallow a genuine tolerance-set failure with no log or warning. It is latent, not active, risk.

Severity: Medium — no current numerical impact, but the code lies about what it does and silently ignores future edits.

Finding 4 — Does /health still lie? No — now justified

$ curl -s http://127.0.0.1:8051/health
{"status":"ok","engines":{"rebound":{"available":true,"fidelity":"high"},...}}
$ curl -s http://127.0.0.1:8051/info
{...,"integrators":["ias15","whfast","mercurius"],"default_integrator":"ias15",...}
_rebound_available() (backend/server.py) only checks import-ability, never constructs an IAS15 sim — so it would still lie if init were broken. But since the default ias15 path now genuinely works end-to-end (Finding 1) and runs at full intended precision (Finding 2), available: true, fidelity: high is now accurate. The weak probe remains a latent reporting gap, not an active falsehood. whfast (dE@1yr 2.1339e-12) and mercurius (1.8134e-10) also work.

Severity: Low.

Finding 5 — Is the mocking test still masking? YES — FIX MASKS NOTHING, BUT THE TEST STILL DOES
backend/tests/test_seek_optimizations.py:37 — the fake IAS15 is fully intact:


self.ri_ias15 = _FakeIAS15()
plus :60-62 in copy(). The monkeypatch at :98 (monkeypatch.setattr(rebound_nbody, "rebound", _FakeReboundModule())) means the only test touching REBOUNDEngine(integrator="ias15") never loads real rebound.

Definitive proof of masking — I reverted the fix to the original unguarded code in a scratch copy and reran:


cp -r <pinned>/backend <out>/F02/revert   # then restore `self.sim.ri_ias15.min_dt = 0`
cd <out>/F02/revert && <venv>/bin/python -m pytest tests/test_seek_optimizations.py -q

############ SUITE ON REVERTED (PRE-FIX, KNOWN-BROKEN) BACKEND ############
..                                                                       [100%]
2 passed in 0.15s
Full-suite comparison, fixed vs. reverted-broken — identical:


reverted (broken): 6 failed, 47 passed, 1 warning in 2.65s
pinned  (fixed):   6 failed, 47 passed, 1 warning in 2.68s
(The 6 failures are nearby_systems data-path artifacts of copying backend/ out of the repo root — present in both, unrelated to F-02.)

No test opens a real /ws/sim (grep -rn "websocket_connect" backend/tests/ → nothing; the three files using TestClient only hit HTTP routes). No test constructs a real rebound.Simulation (grep -rn "rebound.Simulation" backend/tests/ → nothing).

Root cause: the sole IAS15 test substitutes a fake rebound module that does have ri_ias15, so it exercises an API surface the real library does not have.

Severity: High — the suite would not catch a re-regression of this exact defect, and gave false green over it once already.

What I ran vs. inferred
Ran: live backend on 8051 (killed; port verified free), two WS clients (ws_probe.py, ws_seek.py), the 3-mode numerical comparison on the real 41-body catalog (numeric.py), 7 API/behavior checks (checks.py), and the full pytest suite on both fixed and deliberately-reverted copies. Inferred: nothing load-bearing. Blocked: nothing.

Artifacts (scripts + raw output) in /tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/61f0923f-ccb6-49cc-ba58-5791c93163f9/scratchpad/out/F02/.

Recommended remediation
Replace the dead branch with the real rebound-5 API and make failure loud:

if self._integrator == "ias15":
    self.sim.integrator.epsilon = 1e-9
    self.sim.integrator.min_dt = 0
(no try/except — a failure here should surface, and this is now assertable)
Delete _FakeIAS15/_FakeSimulation from test_seek_optimizations.py and drive the seek test against a real rebound.Simulation, asserting sim.integrator.epsilon == 1e-9.
Add one smoke test that opens a real /ws/sim with integrator=ias15 via TestClient.websocket_connect and asserts the first frame is connected, not error.
Make _rebound_available() actually initialize a 2-body IAS15 sim so /health cannot report fidelity: high over a broken engine.

All checks complete, server stopped, real repo untouched (read-only git queries only; no .eval, no worktrees).

Audit of 8f1f051 + 9673bb1 — pinned snapshot 44088f8
Executed: full read of server.py (1672 lines) and solar_realtime_data.py (665 lines); live backend on 127.0.0.1:8052 against a throwaway repo copy; ~50 curl probes; a stubbed-upstream concurrency harness (out/SRV/sf_test.py); the 53-test backend suite; read-only git show against the real repo to separate this commit from prior ones.

1. What the hardening actually does
+577 in server.py is almost entirely config plumbing + throttles on two solar endpoints: _load_env_csv/int/float loaders, ~25 env-tunable limits, opt-in API keys, two sliding-window rate limiters, four BoundedSemaphore guards, request-size enforcers for porkchop/mission-plan, and asyncio.wait_for(asyncio.to_thread(...)) timeouts. 9673bb1 adds a single-flight map + 4.5 s failure backoff.

Per git show 8f1f051 --stat, the commit touched only server.py, solar_realtime_data.py, test_solar_physics_api.py. It did not touch the file-write endpoint; _resolve_benchmark_report_path came from an earlier commit a201065.

2. F-11 / K-26 file overwrite — NOT FIXED (destructive primitive intact)
benchmark/accuracy.py:358-360 — unchanged, no existence check:


path = Path(output_path)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(markdown, encoding="utf-8")
server.py:1193-1208 — no auth, no rate limit, no concurrency guard.

Executed against the throwaway copy:


$ md5sum my-notes/SENTINEL.md          → 6bfc89a0…  ("SENTINEL-DO-NOT-DESTROY-12345")
$ curl -X POST :8052/benchmark/accuracy/report -H 'Content-Type: application/json' \
       -d '{"output_path":"SENTINEL.md"}'
HTTP/1.1 200 OK … "reportPath":"…/throwaway/my-notes/SENTINEL.md"
$ md5sum my-notes/SENTINEL.md          → af1a67ee…  ("# Trajectory Accuracy Benchmark Report")
{"output_path":"a/b/c/d/e/f/g/pwn.md"} → 200, created all 7 directories. Six requests in a row → 200 200 200 200 200 200 (no throttle).

Refutation attempts, all confirming containment holds (and all pre-existing, not new): ../README.md, /etc/passwd, /etc/passwd.md, my-notes/../README.md, ../../../../../../tmp/pwned.md, my-notes/sub/../../README.md → all 400; symlink escapes (link.md → outside file, updir/… → dir symlink) → 400 (resolve() follows symlinks before the check). Browser CSRF is now genuinely blocked: preflight from https://evil.example → 400, and simple-request content-types (text/plain, x-www-form-urlencoded, multipart/form-data) → 422, because StrictRequestModel(strict=True) refuses a str body.

Verdict: PARTIALLY (browser reachability closed by the new CORS allowlist; the primitive itself untouched). Severity: High — any local process or LAN host can silently destroy the user's my-notes/*.md (where this repo's own audit notes live), and one sentinel was destroyed again in this run. Confinement to my-notes/**/*.md is real.

3. CORS — FIXED
server.py:99-117 replaced allow_origins=["*"] with a localhost allowlist.


GET /health -H 'Origin: https://evil.example'   → NO access-control-allow-origin
OPTIONS /benchmark/accuracy/report (evil)       → 400 Disallowed CORS origin
OPTIONS /benchmark/accuracy/report (localhost:5173) → 200 + ACAO: http://localhost:5173
_load_env_csv also refuses "*" in the env override (verified: "https://evil.example,*" → falls back to defaults). Cosmetic only: access-control-allow-credentials: true is still emitted for disallowed origins, but without ACAO the browser discards it — no impact.

4. Single-flight / backoff — works for one key, four defects
#	Test	Result
A	20 concurrent latest(), same key	13 upstream calls, 1 shared object → dedupe works (K-12 fixed for identical keys)
B	20 concurrent latest(jd=distinct), 0.05 s/call	165 upstream calls → herd NOT collapsed
C	10 serial latest(force_refresh=True)	85 calls (vs 0 cached)
G	allow_cached_failure=False	fetch invoked 5/5 vs 1/5 → backoff bypassed by force_refresh
NEW ISSUE — waiters get 500 (regression from 9673bb1). solar_realtime_data.py:124 sets wait_timeout_s = self.timeout_s + 0.5 = 4.3 s, but the leader runs 13 sequential upstream fetches each with timeout=3.8 s (~49 s worst case). Non-leaders can essentially never win. server.py:802-809 has no exception handling. Live, unstubbed, 8 concurrent GET /solar/realtime:

req5 http=200 t=6.97   req1..4,6..8 http=500 t≈4.40  body: "Internal Server Error"
Log: server.py:804 → solar_realtime_data.py:250 → TimeoutError. Before this commit all 8 would have succeeded. Severity: Medium-High (the frontend polls this endpoint).
NOT FIXED — cache ignores jd (K-51). The single-flight key is jd-aware (:120) but the TTL cache (:118, :129) is one global slot. latest(jd=2460000.5) then latest(jd=2400000.5) → 0 new fetches, same object returned, request_date_utc = 2023-02-25 for both (should be 1858 for the second). Net effect: distinct-jd requests stampede upstream and 19 of 20 results are discarded, then later callers are served the wrong epoch. Live confirmation: a live_data=true response carried sdo_aia.updated = "2023-02-25T00:00:10Z" with ok: true.
NOT FIXED — force_refresh amplifies (K-51). GET /solar/realtime has no rate limit, no API key, no guard; 12 serial requests → 200 ×12. ?force_refresh=true: 3.47–5.27 s each vs 0.0013 s cached — ~2700× per-request amplification, re-downloading the 2.9 MB SILSO CSV every time (SILSO reported ok: true, so the transfer is real). No byte cap anywhere (response.read() at :173/:184/:280).
Low — shared exception re-raise / unbounded failure map. :236 re-raises the same exception instance to every caller: traceback frames grew 13 → 53 over 26 raises (also a cross-thread mutation of __traceback__/__context__). _inflight_failures has no eviction sweep (contrast _binary_cache, capped at 48): 2000 distinct failing keys → 2000 retained entries, each pinning an exception + traceback. Hard to reach in practice (_fetch_snapshot swallows per-source errors so snapshot keys never fail) — latent.
Low, latent — latest() returns the shared cache dict, not a copy (:118, :131): a caller mutation was visible to the next caller. Verified solar_physics.py only reads it, so no live impact today.
5. New tests — real but narrow, and one stubs out the break
The +113 lines are 5 tests, all in test_solar_physics_api.py, all asserting real behaviour (429 + Retry-After, 503 on timeout, 413 on max_features=4096). Monkeypatches are module-global rebinds read at call time, so they take effect correctly. Suite: 53 passed.

Two problems:

test_solar_physics_times_out_with_short_budget (:234-254) encodes the wrong model. Its delayed_state sleeps 0.2 s and finishes on its own; assert elapsed < 1.0 proves only that the client was released. Nothing asserts the worker stopped — and it cannot, because asyncio.to_thread is uncancellable (see §7). This test would pass while the server melts.
test_server_validation.py:131-150 monkeypatches away the file write. fake_generate_accuracy_report replaces the writer, so the only test of the endpoint's happy path never writes. It even passes "reports/api/test_report.md" — the exact nested-mkdir behaviour the fake hides — and asserts only that the resolved path contains my-notes. This is the same pattern flagged previously in this repo. (The two rejection tests at :105 and :118 are genuine; they 400 before reaching the writer.)
Coverage grep across all backend tests: zero references to _singleflight_fetch, _inflight, _resolve_benchmark_report_path, CORS/Origin/allow_origins, _enforce_porkchop_request_size, X-Forwarded-For, or SOLAR_PHYSICS_API_KEYS. The commit's headline feature — the dedupe/backoff in 9673bb1 (28 lines of concurrency code) — ships with no tests at all.

6. Prior "new issues" list — re-checked
Item	Verdict	Evidence
/solar/physics ignores unknown query params	NOT FIXED	?jd=2460000.5 → epoch_jd 2460000.5; ?julian_date=2460000.5 → epoch_jd 2461276.83 (wall clock), no warning, 200
Zero-confidence observations still blended	NOT FIXED	solar_physics.py:510,515. Live: observed_confidence: 0.0, applied: true, blend_weight: 0.25 → activity_index moved 0.7466 → 0.6601 (−12%) using data the model scores at zero confidence
tof_min_days has no gt	NOT FIXED	server.py:633 tof_min_days: FiniteFloat = 60.0. tof_min_days:-500, tof_max_days:-100 → 200 with an all-failures grid
scan_porkchop_window accumulates then points[:500]	PARTIALLY	lambert.py:277,316,334 unchanged — all cells built and sorted in memory; now capped upstream at 20 000 cells by _enforce_porkchop_request_size. Refutation attempt: estimator floors (0.5 / 5.0 days) exactly match scan_porkchop_window's hardcoded floors, so no bypass at default config
Unhandled RuntimeError → 500	NOT FIXED, and wider	ephemeris_service.py:133. ephemeris_provider:"spice" — a value /trajectory/capabilities advertises and the request model validates — gives 500 on /trajectory/lambert, /trajectory/porkchop, and /mission/plan (the last is new to the list)
7. New issues introduced
N-1 — Timeout + semaphore give false assurance; abandoned work pins the machine. Severity: High.
asyncio.wait_for cannot cancel asyncio.to_thread, and every guarded endpoint releases its semaphore in finally at timeout (server.py:947, 1120, 1172, 855) — so the guard counts waiters, not workers. Measured on POST /trajectory/porkchop at 19 900 grid points (just under the cap):


2 requests → both 503 "timed out" at t=8.16s
CPU ticks: 8323 → 9160 (at response) → 10734 (+15s) → 13834 (+45s) → 13988 (+90s)
~60 s of unkillable CPU bought with 8 s of client time. Four rounds of 2 (≈32 s of client effort) left the server unresponsive:


t+15s  /health http=000 t=20.0   (timeout)
t+30s  /health http=000 t=20.0   (timeout)
t+45s  /health http=200 t=0.006  ← orphans finished, CPU flatlined
Applies to /trajectory/porkchop, /mission/plan, /solar/physics, /solar/realtime/aia-tile. This is exactly what the 8 s budget was meant to prevent.

N-2 — Rate limiter is bypassable and is itself an unbounded memory sink. Severity: Medium.
server.py:296 trusts client-supplied X-Forwarded-For with no trusted-proxy config, and the documented run command binds directly (no proxy).


45 requests, same identity      → 9 × 429
45 requests, rotating XFF       → 0 × 429
_solar_physics_rate_locks (:326) never evicts stale identities: 5000 rotating identities → 5000 retained entries, ~4.1 MB, all with expired deques, zero 429s. The limiter grows without bound under the very flood it exists to stop.

N-3 — /solar/physics?live_data=true self-defeating budget. The 4 s compute timeout is smaller than the provider's own ~49 s worst case, so a cold-cache live request reliably 503s while its orphaned thread completes the fetch anyway (N-1). No test exercises the live path.

N-4 — output_path with a NUL byte → 500. {"output_path":"ab\u0000cd.md"} → 500 Internal Server Error (uncaught ValueError from Path.resolve() in _resolve_benchmark_report_path, new code). Body is generic; the traceback goes to the server log only. Cosmetic sibling: "...md" is accepted as a .md file.

N-5 — Filesystem paths in responses. reportPath and the 400 detail ("must resolve under /tmp/.../throwaway/my-notes") return absolute paths; /nearby-systems returns catalog_path; /solar/realtime/aia-tile returns f"AIA tile unavailable: {exc}". Info-only, low.

Posture note (stated once)
This is a locally-run scientific sim: no auth by default (SOLAR_PHYSICS_API_KEYS = empty set, so _require_optional_solar_api_key is a no-op), uvicorn.run(host="0.0.0.0", port=8042) at server.py:1672, and the new throttles cover only /solar/physics + /solar/realtime/aia-tile. /benchmark/accuracy/report (writes files), /solar/realtime (outbound amplifier), /benchmark/accuracy, /trajectory/*, /mission/plan and /nearby-systems have no rate limit. The asymmetry is the story: the read-only physics endpoint got auth hooks, a rate limit, a concurrency guard and a timeout; the endpoint that deletes the user's notes got nothing.

Ranked by the stated criteria: destroy data → §2 (High). Pin the machine → N-1 (High), N-2 (Medium). Amplify outbound traffic → §4 force_refresh + jd-herd (Medium). Correctness → jd-agnostic cache and zero-confidence blending both silently return wrong physics (Medium).

Artifacts: out/SRV/sf_test.py (harness), out/SRV/server.log, out/SRV/throwaway/ (all writes landed here).
