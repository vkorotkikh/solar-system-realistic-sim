# Torch-ship ends: cost of leaving and entering a low orbit, and joining it to the Sun-centred trip

Status: DONE for the time box (Mars 0.5/0.2/0.14/0.1 g not solved; see 'Not done'). Labels: [measured] = I ran it, [derived] = shown, [read] = file:line, [assumed].
All numbers from scripts in this directory, run with <venv>/bin/python -B. W = wt-c1 checkout, never modified.

## 0. Setup [read]
- Planner constants match the task text: Earth mu = 398 613.891 km^3/s^2, R = 6371 km, LEO periapsis = apoapsis = 6571 km;
  Mars R 3389.5 km (400 km orbit = 3789.5 km); Jupiter R = 69 911 km (NOT 71 492), 1.1 R = 76 902.1 km, 200 R = 13 982 200 km
  (W/backend/planner/places.py:55-64, PLACES printed by probe_places.py); Moon mu = 4902.8 km^3/s^2, R = 1737.4 km, a = 384 400 km
  (moon_gm.json key "301"; radius from src/data/moonPhysicalRadii.json via places.py:101); Ceres R = 469.7 km, mu = 62.6917 km^3/s^2.
- W/backend/planner/ has no vehicle.py (the task text lists one): it holds places.py, plans.py, trips.py only. [read: ls]
- ends_reference.escape_cost(mu, r_periapsis, r_apoapsis, a): mu km^3/s^2, radii km, **a in km/s^2** (1 g = 9.80665e-3), returns (km/s, s).

## 1. Escape from a circular orbit, thrust along the velocity [measured: t1_circular_table.py, ends_reference.py]
Units: x = a/g0, g0 = mu/r0^2, vc = sqrt(mu/r0); time in sqrt(r0^3/mu) (= 1/omega, orbit period = 2 pi). DOP853, rtol 1e-12, atol 1e-14,
event E = v^2/2 - mu/r = 0. delta-v = a t, so dv/vc = x t. Cross-check: the work-energy identity E_end - E_0 = integral a|v| dt holds to 1e-8
(self-test, ends_reference.py __main__).

| a/g0 | dv/vc | t | r_end/r0 | | a/g0 | dv/vc | t | r_end/r0 |
|---|---|---|---|---|---|---|---|---|
| 1e-6 | 0.974442 | 974 442 | 878.6 | | 0.1 | 0.513452 | 5.1345 | 2.627 |
| 1e-5 | 0.954551 | 95 455 | 277.8 | | 0.2154 | 0.443868 | 2.0603 | 1.509 |
| 1e-4 | 0.919179 | 9 191.8 | 87.86 | | 0.4642 | 0.421410 | 0.9079 | 1.126 |
| 1e-3 | 0.856300 | 856.3 | 27.79 | | 1 | 0.415814 | 0.4158 | 1.028 |
| 2.154e-3 | 0.825773 | 383.3 | 18.93 | | 2.154 | 0.414561 | 0.1924 | 1.006 |
| 4.642e-3 | 0.788851 | 169.95 | 12.92 | | 4.642 | 0.414288 | 0.0893 | 1.001 |
| 0.01 | 0.745344 | 74.534 | 8.779 | | 10 | 0.414230 | 0.04142 | 1.000 |
| 0.02154 | 0.693064 | 32.169 | 6.060 | | 100 | 0.414214 | 0.004142 | 1.000 |
| 0.04642 | 0.632739 | 13.632 | 4.210 | | 1000 | 0.414214 | 4.14e-4 | 1.000 |

(Full 25-row table: t1_circular_table.txt / .json; 1e3 < a/g0 <= 1e6 gives 0.414214 as well.)
- High-thrust limit: dv/vc -> sqrt(2)-1 = 0.414214 from ABOVE; excess = 1.6e-3 / x^2 for x >~ 1 (x=1: +0.39%, x=10: +0.004%) [measured].
  The 1/x term is absent because thrust is parallel to the velocity (no first-order gravity loss) [derived: dE/dt = a v exactly].
- Low-thrust limit: dv/vc -> 1 from BELOW, but very slowly: 1 - dv/vc = 0.8082 x^(1/4) (measured 0.80821, 0.80822, 0.80822 at x = 1e-4, 1e-5, 1e-6;
  3-parameter fit dv = L - c x^(1/4) + d x^(1/2) on x=1e-3..1e-6 gives L = 1.00001, c = 0.8084, d = 0.0018). Escape happens at r_end = 0.8786 r0 x^(-1/2)
  (thrust equals local gravity there) [measured]; so 1 - dv/vc ~ v_c(r_end) ~ x^(1/4) [derived scaling]. Consequence: dv/vc is still 0.86 at 1e-3 g0 and reaches
  0.99 only below ~2e-8 g0. The usual "low thrust costs vc" is an asymptote, not a usable estimate.
- dv/vc is monotone in x with its knee at x ~ 0.1-0.5; 0.1 g0 already costs +24% over impulsive, 0.3 g0 +4%, 1 g0 +0.4%.
- Capture = time reverse (same dv and t): the reversed path is a trajectory of the same equations with thrust against the velocity, so the cost is identical [derived].
- Table lookup is NOT a free substitute: PCHIP on a 3-points-per-decade table has 1.6% worst relative error (t1b_interp_check.txt; knee region x 0.03-0.3).
  Direct integration is cheap enough: best of 3, one escape_cost call = 0.3 ms (Earth, >=1 g), 1.6 ms (0.1 g), 9.3 ms (0.01 g); Jupiter ellipse 0.2-0.7 ms
  [measured, load ~17-25 on 32 cores, t3_t4_concrete.txt]. A 468 x 468 pair table at a fixed set of accelerations is therefore a few seconds.

## 2. Is thrust along the velocity the cheapest steering? [measured: t2_steering.py; circular orbit; cost at fixed a is a t, so cheapest = earliest E = 0]
Differences are t_alt / t_velocity - 1 (positive = costlier than velocity-aligned). Optimised = piecewise-linear offset angle delta(t) (8 nodes, Nelder-Mead, 4 restarts, local search only).

| a/g0 | transverse (perp. to radius) | fixed inertial, beta = 0 (initial velocity dir.) | fixed inertial, best beta | numerically optimised offset |
|---|---|---|---|---|
| 0.01 | +2.13% | no escape in 30 t_vel | no escape in 30 t_vel | -0.46% |
| 0.03 | +3.53% | no escape in 30 t_vel | no escape in 30 t_vel | -0.68% |
| 0.1 | +8.00% | no escape in 30 t_vel | +165.6% (beta = 85.5 deg; only 11 of 36 scanned directions escape) | -0.55% |
| 0.3 | +1.86% | +33.8% | +4.56% (beta = 40.1 deg) | -0.25% |
| 1 | +0.18% | +1.92% | +0.33% (beta = 11.9 deg) | -0.031% |
| 3 | +0.020% | +0.205% | +0.036% | -0.004% |
| 10 | +0.002% | +0.018% | +0.003% | -0.000% |
| 100 | +0.000% | +0.000% | +0.000% | -0.000% |

- Velocity-aligned is NOT exactly the cheapest: tilting the thrust slightly toward the planet early (up to +12 deg at x = 0.1, decaying to 0 over about one t_vel)
  saves 0.25-0.7% at x between 0.01 and 0.3 and under 0.04% for x >= 1. [measured, lower bound: a local 8-node search, not a proven optimum; at x = 0.01 the node
  values are noisy, so the true gain there may be larger.] Reason [derived]: dE/dt = a v cos(delta), and staying lower keeps v (hence a v) higher.
- Perpendicular-to-radius thrust is worse by up to 8% (x = 0.1) and converges to velocity-aligned as x grows (difference ~ gamma^2 where gamma = flight-path angle).
- A fixed inertial direction is bad: +0.3% at 1 g even with the best direction, +4.6% at 0.3 g, and at <= 0.03 g no scanned direction escapes within 30 velocity-aligned
  burn times (at 0.1 g only 11 of 36 directions do, the best costing +166%) (energy gain averages to ~0 over an orbit for a fixed direction; only the eccentricity vector drifts) [measured cap-limited; "no escape" means > 30 t_vel, not never].
- Planner implication: velocity-aligned is within 0.7% of the best steering found for every a/g0 and the self-consistent choice for a reference.

## 3. Elliptical orbit, from periapsis [measured: t3_t4_concrete.py]
Thrust along velocity from periapsis until E = 0. Cell = dv / dv_impulsive (burn time / orbital period), dv_impulsive = sqrt(2)vc(rp) - vp.

| ra/rp | e | dv_imp/vc | a/g0=0.01 | 0.1 | 0.3 | 1 | 3 | 10 |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 0.4142 | 1.799 (11.9) | 1.240 (0.82) | 1.040 (0.23) | 1.004 | 1.000 | 1.000 |
| 1.5 | 0.20 | 0.3188 | 2.041 (7.4) | 1.253 (0.45) | 1.040 (0.13) | 1.004 | 1.000 | 1.000 |
| 2 | 0.33 | 0.2595 | 2.254 (5.1) | 1.220 (0.27) | 1.033 (0.08) | 1.003 | 1.000 | 1.000 |
| 5 | 0.67 | 0.1232 | 2.883 (1.1) | 1.086 (0.04) | 1.011 | 1.001 | 1.000 | 1.000 |
| 20 | 0.90 | 0.0341 | 1.446 (0.02) | 1.009 | 1.001 | 1.000 | 1.000 | 1.000 |
| 181.8 (Jupiter 1.1-200 R) | 0.989 | 0.0039 | 1.012 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| 1000 | 0.998 | 0.0007 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

- Eccentricity helps because the burn is short in angle: above e ~ 0.9 the cost is the impulsive periapsis burn for every a/g0 >= 0.1 [measured].
- For moderate e (0.2-0.7) at x <= 0.1 continuous velocity-aligned thrust also burns at apoapsis where v is low, costing up to 2.9x the impulsive periapsis value
  (ra/rp = 5, x = 0.01: 1.09 orbits). A periapsis-window burn (coast between passes) would be cheaper in dv and slower; NOT computed here. [not done]

## 4. Concrete values [measured: t3_t4_concrete.py -> t3_t4_concrete.txt / t4_concrete.json]
Inputs: Earth mu = 5.97237e24 kg x 6.6743e-11 = 398 613.89 km^3/s^2, orbit radius 6571 km; Mars 42 829.65, 3789.5 km; Moon 4902.8 (moon_gm.json "301"), 1837.4 km;
Jupiter 126 691 562.6, 76 902.1 km circular and 76 902.1 -> 13 982 200 km ellipse; Ceres 62.69, 569.7 km. dv in km/s, t in s (d = days).
"imp" = impulsive escape dv; g0 = local circular gravity; vc (ellipse row: periapsis speed vp) = orbital speed.

| case | g0 m/s^2 | vc km/s | imp | 0.01 g | 0.1 g | 0.3 g | 1 g | 3 g | 10 g |
|---|---|---|---|---|---|---|---|---|---|
| Earth 200 km | 9.232 | 7.789 | 3.226 | 5.772 / 58 853 s | 3.937 / 4 014 s | **3.340 / 1 135 s** | **3.237 / 330 s** | **3.227 / 110 s** | 3.226 / 33 s |
| Mars 400 km | 2.983 | 3.362 | 1.393 | 2.199 / 22 420 s | 1.439 / 1 467 s | 1.398 / 475 s | 1.393 / 142 s | 1.393 / 47 s | 1.393 / 14 s |
| Moon 100 km | 1.452 | 1.634 | 0.677 | 0.940 / 9 586 s | 0.682 / 696 s | 0.677 / 230 s | 0.677 / 69 s | 0.677 / 23 s | 0.677 / 7 s |
| Jupiter 1.1 R circ | 21.423 | 40.589 | 16.812 | 32.058 / 3.78 d | 25.743 / 26 250 s | 19.341 / 6 574 s | 17.112 / 1 745 s | 16.847 / 573 s | 16.816 / 171 s |
| Jupiter 1.1-200 R ellipse (periapsis) | 21.423 | 57.244 | 0.157 | 0.166 / 1 688 s | 0.157 / 160 s | 0.157 / 53 s | 0.157 / 16 s | 0.157 / 5 s | 0.157 / 2 s |
| Ceres 100 km | 0.193 | 0.332 | 0.137 | 0.139 / 1 422 s | 0.137 / 140 s | 0.137 / 47 s | 0.137 / 14 s | 0.137 / 5 s | 0.137 / 1 s |

Read-outs [measured]: dv is within 1% of the impulsive value once a/g0 >~ 0.8 and within 0.01% once a/g0 >= 10 (Earth: 1 g is +0.3%, 3 g +0.03%; Mars from 0.3 g (a/g0 = 0.99) it is +0.4%; Moon from 0.1 g (+0.8%); Ceres from 0.03 g (+0.4%)).
Earth at 0.3 g costs 3.340 km/s (+3.5% over impulsive), at 0.1 g 3.937 (+22%), at 0.01 g 5.772 (+79%). The Jupiter ellipse at 1 g is 0.157 km/s in 16 s, so
for capture into the planner's giant-planet orbit the ends are negligible against any interplanetary leg; the Jupiter circular 1.1 R case is the expensive one
(16.8-32 km/s). Jupiter's radius in the planner is 69 911 km (bodies.py:91; I take it to be the volumetric mean radius [assumed]; the 71 492 km equatorial radius would shift the Jupiter rows).
Burn times are short compared with the trip: 33 s to 59 000 s for Earth; at a >= 0.3 g under 20 min.

## 5. Patching error [measured: t5_earth_moon.py, t5_compare.py, t5_refine.py, t6_earth_mars.py]
### 5a. LEO 200 km (r = 6571 km) -> low lunar orbit 100 km (r = 1837.4 km), Earth-centred frame
Model [assumed]: Earth at the origin (its 4 670 km barycentric wobble ignored, but the Moon's pull on Earth is included as the indirect term, so a Moon on a circle of
radius D = 384 400 km with n^2 = (muE + muM)/D^3 = 2.665e-6 rad/s is exact), coplanar, Earth + Moon gravity, thrust of constant magnitude a on the whole time.
Start: circular LEO, free phase, prograde. End: circular orbit about the Moon at 1837.4 km, either direction (|r_rel| = 1837.4 km, r_rel . v_rel = 0, |v_rel|^2 = muM/r).
Optimiser: direct single shooting, thrust angle piecewise-linear in time on two segments (burn, then brake, flip fraction p free, jump allowed at the flip),
K+1 = 11 nodes each (nodes packed toward the start of segment 1 and the end of segment 2), free T, LEO phase, p; scipy trust-constr with parallel finite-difference
Jacobians, continuation in a from 10 g down to 0.1 g. delta-v = a T because the engine never stops. Each row verified by re-integration at rtol 1e-12 (max constraint residual
<= 9e-6 in units of r_t = 1.84e3 km and v_c = 1.63 km/s; i.e. < 20 m and < 15 mm/s) and by dense sampling of the path (never below the surface of Earth or Moon except 10 g, see below).

| a (g) | T s | dv km/s | straight line dv = 2 sqrt(D a), T | patched dv (esc + line + cap), T | patched / truth | straight / truth | capture sense |
|---|---|---|---|---|---|---|---|
| 5 | 5 447 | 267.07 | 274.58, 5 600 s | 278.48, 5 680 s | +4.3% | +2.8% | retro |
| 3 | 6 997 | 205.86 | 212.69, 7 229 s | 216.59, 7 362 s | +5.2% | +3.3% | retro |
| 2 | 8 529 | 167.28 | 173.66, 8 854 s | 177.56, 9 053 s | +6.1% | +3.8% | retro |
| 1.4 | 10 152 | 139.38 | 145.29, 10 583 s | 149.20, 10 867 s | +7.0% | +4.2% | retro |
| **1** | **11 964** | **117.33** | **122.80, 12 522 s** | **126.71, 12 921 s** | **+8.0%** | **+4.7%** | retro |
| 0.7 | 14 246 | 97.80 | 102.74, 14 966 s | 106.66, 15 538 s | +9.1% | +5.1% | retro |
| 0.5 | 16 801 | 82.38 | 86.83, 17 708 s | 90.78, 18 513 s | +10.2% | +5.4% | retro |
| 0.3 | 21 665 | 63.74 | 67.26, 22 861 s | 71.28, 24 227 s | +11.8% | +5.5% | retro |
| 0.2 | 26 680 | 52.33 | 54.92, 27 999 s | 59.06, 30 111 s | +12.8% | +4.9% | retro |
| 0.14 | 31 989 | 43.92 | 45.95, 33 466 s | 50.28, 36 622 s | +14.5% | +4.6% | pro |
| **0.1** | **38 723** | **37.97** | **38.83, 39 597 s** | **43.45, 44 307 s** | **+14.4%** | **+2.3%** | pro |

(rows 10 g not used: its path passes 363 km from the Moon's centre, inside the 1737 km Moon; the other rows stay above 1807 km from the Moon's centre and above 6475 km from Earth's centre.)
- Patched sum is conservative: +8.0% in delta-v and +8.0% in time at 1 g (126.71 vs 117.33 km/s; 12 921 vs 11 964 s) and +14.4% / +14.4% at 0.1 g
  (43.45 vs 37.97 km/s; 44 307 vs 38 723 s). Because a feasible trajectory is an upper bound on the true optimum, the real conservativeness is AT LEAST these numbers.
- The straight-line flip-and-burn alone is also above the optimum, by +4.7% (1 g) and +2.3% (0.1 g), and over all 11 valid rows between +2.3% and +5.5%: it never underestimates here.
  Why the optimum beats the gravity-free straight line [derived]: the ship starts with 7.8 km/s of orbital speed and ends with 1.6 km/s (+1.0 km/s Moon motion), which for aligned
  velocities gives dv = 2 sqrt(a L + (v0^2+v1^2)/2) - (v0+v1) ~ 2 sqrt(aL) - 9.4 km/s; the measured saving is 5.5 km/s at 1 g (orbital velocity is not aligned with the path) and 0.9 km/s at 0.1 g.
  So adding escape and capture on top double counts: the patched sum charges +3.9 km/s (Earth 1 g: 3.24 + Moon 0.68) where the optimum shows -5.5 km/s relative to the line.
- Node-count check [measured]: K = 16 (45 variables) from the K = 10 solution: 1 g T 11 964.31 -> 11 964.57 s (+0.002%); 0.1 g 38 722.87 -> 38 824.02 s (+0.26%, a slightly worse local optimum).
  So the delta-v values are good to about 0.3% at 0.1 g and 0.01% at 1 g; this is a local optimum from a continuation start, not a global proof [assumed].
- Capture sense: the optimiser chooses retrograde for >= 0.2 g and prograde for <= 0.14 g; I did not constrain it. A fixed-sense requirement could cost more [not tested].

### 5b. Earth (LEO 200 km) -> Mars (400 km orbit), planar model [measured: t6_earth_mars.py, t6_compare.py] -- partly done
Model [assumed]: Sun at the origin; Earth and Mars on prescribed circular COPLANAR orbits (catalogue semi-major axes 1.00000261 and 1.52371034 AU; the real planets have
e = 0.017 and 0.093 and Mars is inclined 1.85 deg, so this is the idealised best-aligned case, not a dated trip); ship attracted by Sun, Earth and Mars; integrated in the
Earth-centred translating frame; free launch date (Mars phase), LEO phase, flip fraction and thrust-angle nodes (K = 10); terminal condition a circular 3789.5 km orbit about Mars.
"Sun-only" = the patching model's middle term solved with the same optimiser: start at Earth's position and velocity, end at Mars's position and velocity, Sun gravity only
(free launch date), i.e. 'rest relative to A to rest relative to B'.

| a (g) | Sun-only dv, T | straight line 2 sqrt(a L), L = 0.5237 AU | continuous optimum dv, T (feasible to max residual) | patched = Sun-only + esc + cap | Sun-only vs optimum | patched vs optimum |
|---|---|---|---|---|---|---|
| 1 | 1 753.12 km/s, 178 768 s | 1 753.06 | **1 748.02 km/s, 178 248 s** (1.4e-4) | 1 757.75 (4.63 of ends) | +0.29% | +0.56% |
| 0.3 | 960.23, 326 387 s | 960.19 | **<= 960.90, 326 616 s** (1.9e-4) | 964.97 (4.74) | -0.07% (see caveat) | >= +0.42% |
| 0.5, 0.2, 0.14, 0.1 | 1 239.65, 784.03, 655.96, 554.37 | 1 239.60, 783.99, 655.94, 554.37 | not solved | +4.66, +4.87, +5.07, +5.38 | | |

- Residual units: the terminal constraints are scaled by the 3789.5 km radius and 3.36 km/s circular speed, so 1.4e-4 / 1.9e-4 = 0.5 km, 0.5 m/s (1 g) and 0.7 km, 0.6 m/s (0.3 g) of miss;
  re-integration at rtol 1e-12 reproduces them. Path stays above 3758 km from Mars's centre (altitude >= 369 km) and 6571 km from Earth's.
  Caveat: trust-constr on this problem is unreliable (restarts from the best point walk away from it; 0.5 g, 0.2 g and 0.14 g did not converge, the 0.3 g run stopped on its evaluation cap),
  so both optimum values are feasible UPPER bounds on the true optimum, not proven optima. At 0.3 g the true optimum may lie below the Sun-only value (as it does at 1 g), which would
  move "Sun-only vs optimum" positive. The Earth-Moon rows (which converged cleanly) say the benefit of the orbital head start shrinks from ~0.58 (vA+vB) at 1 g to ~0.09 (vA+vB) at 0.1 g.
- Finding [measured]: the Sun-only optimum equals the gravity-free straight line 2 sqrt(a L) to 0.005% for every a from 0.1 g to 1 g (best-aligned geometry): at a >= 0.1 g the Sun's pull
  (0.06% of 1 g at 1 AU, i.e. 0.6% of the thrust at 0.1 g) and the planets' motion change the cruise by almost nothing, so the Sun-centred part is a flip-and-burn over the closest separation.
- Finding [measured, 1 g]: the continuous optimum is 5.1 km/s BELOW the Sun-only trip, although the ends "cost" 4.63 km/s in the patched sum: a ship in LEO already moves at 7.8 km/s and ends at
  Mars in a 3.4 km/s orbit, so the ends are a credit, not a cost, at high thrust (same mechanism as the Moon case; fraction 0.46 of vcA + vcB here versus 0.58 for the Moon).

## 6. Recommendation [derived from sections 1-5; numbers measured above]
**Cheapest model within 2% for interplanetary trips at a >= 0.1 g: price only the Sun-centred flip-and-burn between the two moving bodies (the planner's date search supplies the
separation), with NO escape or capture term added.** T_total = T_sun, delta-v = a T_sun. Measured errors against the continuous optimum (planar Earth-Mars, best-aligned):

| model | 1 g | 0.3 g | what it is |
|---|---|---|---|
| Sun-only, no ends (recommended) | +0.29% | -0.07% (optimum is an upper bound, may be lower) | 1 753.12 / 960.23 km/s |
| patched sum, exact-thrust ends (esc + Sun leg + cap) | +0.56% | >= +0.42% | 1 757.75 / 964.97 km/s |
| gravity-free straight line 2 sqrt(a L) | +0.29% | -0.07% | equals Sun-only to 0.005% |

- Why the ends should NOT be added [measured]: a ship that is already orbiting at 7.8 km/s and ends in a 3-8 km/s orbit uses that speed; the optimum sits 5.1 km/s below the Sun-only trip at
  1 g (Mars) and 5.5 km/s below the straight line (Moon). Adding 4.6 km/s (Mars) or 3.9 km/s (Moon) of end costs moves the model the wrong way.
  Model error of Sun-only is the head-start credit c(a) (vcA + vcB), with c measured on the Earth-Moon optimum as a function of thrust:

  | a (g) | 5 | 3 | 2 | 1.4 | 1 | 0.7 | 0.5 | 0.3 | 0.2 | 0.14 | 0.1 |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | c = (dv_line - dv_optimum)/(vcA + vcB), vcA + vcB = 9.42 km/s | 0.80 | 0.72 | 0.68 | 0.63 | 0.58 | 0.52 | 0.47 | 0.37 | 0.28 | 0.22 | 0.09 |

  (Mars at 1 g gives 0.46 of 11.15 km/s.) Sun-only is therefore at most c (vcA + vcB) / dv_sun too expensive: with c <= 0.58 (its value for a <= 1 g; it is <= 0.8 up to 5 g, and the leg grows as sqrt(a), so the bound only shrinks at higher a) and circular low orbits the bound is
  Earth-Venus (closest, L = 0.277 AU) 2.14% at 0.1 g and 0.68% at 1 g, Earth-Mars 1.17% / 0.37%, Mercury-Venus 1.29% / 0.41%, Earth-Ceres 0.46% / 0.15%, Mars-Ceres 0.25% / 0.08% (t6b_ends_fraction.txt;
  Sun leg taken as 2 sqrt(a |a1 - a2|), which the Earth-Mars optimiser confirmed to 0.005%). The measured c at 0.1 g is 0.09, so the realistic Earth-Venus error at 0.1 g is about 0.3%.
  The patched sum is worse everywhere (it adds the ends: 1.83% of the leg for Earth-Venus at 0.1 g, giving about 2.2% error there), and exceeds 2% only for such short, massive pairs at the low-thrust end.
- If a pair is so short that ends / dv_sun > ~1.5% (e.g. near-Earth asteroids at 0.1 g: 4 km/s of ends against ~170 km/s at L = 0.05 AU), use the continuous-thrust ends-aware model below.
- Not validated: pairs ending in the planner's giant-planet capture ellipse (1.1-200 R). Their ends are tiny (0.16-0.25 km/s of dv, burn 2-1 700 s, section 4) but the head-start credit
  was only measured for circular orbits, and at 0.1 g the thrust is 0.046 of local gravity at 1.1 R, so gravity dominates there and the credit may not apply. Treat Sun-only as unvalidated for those ends [assumed].
- Time: the optimum's T is within 0.3% of T_sun in both Mars rows (178 248 vs 178 768 s; 326 616 vs 326 387 s), so the ends' time (330 s Earth at 1 g up to 58 853 s at 0.01 g) is already inside the Sun-only time to that accuracy.

**Planet-to-moon hops (Earth-Moon, 11 valid optimisation rows, 0.1-5 g)**: neither model is within 2%.
- Sun-only / straight line over-estimates delta-v and time by +2.3% (0.1 g) to +5.5% (0.3 g); +4.7% at 1 g (122.80 vs 117.33 km/s).
- Patched sum over-estimates by +4.3% (5 g), +8.0% (1 g), +14.4% (0.1 g), +14.5% (0.14 g) (126.71 vs 117.33 km/s; 43.45 vs 37.97 km/s).
- A calibrated correction dv = 2 sqrt(a D) - c(a) (vcA + vcB) with c(a) from the table above reproduces these rows by construction; it is NOT validated for any other pair [assumed].
  Planet-to-moon hops therefore need their own continuous-thrust (planet-centred) model, not the interplanetary one. Moons deeper in a planet's well than the Moon (Io, Europa; a/g0 of the ends < 1) were not tested [not done].

## Not done / limits
- Mars full solves at 0.5, 0.2, 0.14 and 0.1 g did not converge (trust-constr stalls; a variable rescale did not help). 0.3 g is feasible to 2e-4 but not a proven optimum. No 3-D, no eccentric/inclined Mars, no dated ephemeris case.
- All optimisation results are local optima from a continuation start (direct single shooting, piecewise-linear thrust angle). K = 10 -> 16 changed T by +0.002% (1 g) and +0.26% (0.1 g, worse) in the Moon case, nothing else was cross-checked (no indirect/Pontryagin check, no second start).
- Earth-Moon: Earth fixed at the origin (barycentric wobble ignored), Moon circular and coplanar, capture sense left free (retrograde for >= 0.2 g, prograde for <= 0.14 g); the 10 g solution crosses the Moon and is discarded.
- Steering optimum (section 2) is a local 8-node Nelder-Mead search; "no escape" for a fixed inertial direction is within a cap of 30 velocity-aligned burn times.
- Periapsis-window (coast-between-passes) burns for moderately eccentric orbits at low thrust: not computed. Interplanetary legs with Sun gravity in non-aligned geometry or close solar passes: not computed (only the best-aligned optimum, which equals the straight line to 0.005%).
- Timing: only escape_cost timings are best-of-three. Optimiser wall times in the logs (25-470 s) are single runs on a loaded machine (load 12-26 on 32 cores) and are not benchmarks.
- No browser was opened, no network used, nothing under W was modified (git status clean, no file in W newer than my first probe).

## Reproduce
`<venv>/bin/python -B ends_reference.py` (self-test, 2 s); t1_circular_table.py (95 s), t1b_interp_check.py, t2_steering.py (3.6 min on 8 workers), t3_t4_concrete.py,
`t5_earth_moon.py 10 10,5,3,2,1.4,1,0.7,0.5,0.3,0.2,0.14,0.1 K10` (~10 min on 12 workers) then t5_compare.py K10 and t5_refine.py K10 16 1.0,0.1,
`t6_earth_mars.py sun 10 1 sun_1g 6`, `... full 10 1 full_1g 6 t6_earth_mars_sun_1g.json`, t6_compare.py, t6b_ends_fraction.py. Outputs: *.txt, *.json next to the scripts.

## Appendix: polished version of the request
See POLISHED_PROMPT.md in this directory (also reproduced in the return message).
