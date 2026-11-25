---
title: Navigation for fast ships, and course checks (design)
date: 2026-11-15
target: origin/main 21d5d5e (the planner epic through its agent backend, PRs #73 to #80, is merged)
status: built 2026-11-17, rebased onto main 2026-11-21; local branches feat/planner-n1-orbit-choice to feat/planner-n4b-course-in-search; revision 3, the design as built
---

# Navigation for fast ships, and course checks: design

This extends the trip planner epic (`2026-11-12-planner-rework-agent-epic-draft.md`). It adds trips for
constant-acceleration "torch" ships like those in The Expanse, a choice of orbit at each end, and a report on
what a course passes. A rocket request that does not ask for the new things gets the same answer as today,
plus one field naming its drive.

Revision 2 folded in a review by four independent critics (physics, numerics, contract, scope), who ran 164
checks against revision 1. Section 13 lists what they changed. Revision 3 is the design as built: issues N1 to
N4b are implemented, and section 13a lists what building and measuring changed. N5 is not built.

Evidence labels: **[M]** measured by running code, **[R]** read in the code, **[C]** calculated by hand or
with a scratch script, **[S]** sourced (section 14), **[A]** assumed. Choices the owner has not seen are
tagged **PROPOSED**.

## 1. What was asked, and what is delivered

| The owner asked | Delivered | Issue |
|---|---|---|
| "from one LEO point on planet A to another LEO point on planet B" | For rockets: any orbit at either end, by altitude. For torch ships the trip runs body to body: the orbits are named in the answer but not costed, and each trip prints the most they could change it | N1 (built), N3 |
| "newer, faster spacecraft such as the ones from Expanse" | Ships that thrust the whole way at a chosen acceleration from 0.1 to 12 g: accelerate, flip, decelerate | N2, N3 |
| "the most optimal course" | Rockets: least delta-v, shortest flight or earliest arrival over the dates searched (already built). Torch ships: the shortest flight for the chosen thrust, leaving on the first day and on the best day. A fuel budget with coasting is a later issue | N3 |
| "accounting for asteroid belt, kuiper belt" | Bodies in both belts are destinations (already true: 18 asteroids, 14 dwarf planets). New, on request: when a course is inside each belt, how close it comes to the Sun, to catalogued bodies and to the nearest of 100,000 real asteroids. This is a report: nothing in the belts changes a course | N4 |

This release is an API. No panel calls the new planner yet for rockets or torch ships; that is the epic's
C7 and C8.

**What each kind of request returns**

| Request | Rocket | Torch |
|---|---|---|
| Between two Sun-orbiting bodies | built | best day and first day, bent around the Sun when needed |
| To or from a moon | built | solved to the moon's planet; the last stretch is reported, not flown |
| Around one planet (orbit to moon, moon to moon) | built | a straight flip-and-burn estimate, marked approximate |
| Chosen orbit at an end | built (N1) | accepted and named, not costed |
| Round trip, plans | built | yes |
| Flybys | built | ignored, with a note |
| Course report, path | on request (N4) | on request |

## 2. What exists

The stack up to PR #79 plans ballistic trips for chemical rockets: it searches launch dates with two-burn
Lambert transfers between 468 places and prices each trip as burns between a low orbit at each end, one way
or round trip, alone or as a plan of tied trips **[R]**. It has no model for a ship that thrusts continuously
and does not look at what a course passes **[R]**.

## 3. Request changes

`TripSearchRequest` gains two fields and one changed default.

```json
"drive": {"kind": "impulsive"}
"drive": {"kind": "torch", "acceleration_g": 1.0, "exhaust_velocity_km_s": 11000}
"include": ["path", "course"]
```

- `drive` defaults to impulsive. `acceleration_g` is required for torch, between 0.1 and 12 (a 422 outside
  that, like any malformed field). It is the ship's thrust acceleration, held constant: the engine throttles
  down as the ship gets lighter. `exhaust_velocity_km_s` is optional; with it each trip reports the fraction
  of the ship's starting mass burned as propellant, by the rocket equation.
- `include` defaults to empty. `"path"` adds sampled positions to each leg around the Sun. `"course"` adds
  the course report (section 7). Neither is computed unless asked for, so answers stay small and fast; the
  panel asks for both and the agent for neither.
- `objective` now defaults per drive: least delta-v for rockets (as today), earliest arrival for torch
  ships. The answer states the one used in `searched.objective`.
- Torch with `flybys` above zero is accepted and the flybys are ignored with a note, as round trips already
  do.

## 4. Torch trips around the Sun (N2)

**Model.** The ship leaves body A at the departure time with A's position and velocity and must reach body
B's position and velocity at arrival. In between it feels the Sun's gravity and its own thrust. The thrust
points in one fixed direction for the first burn and another for the second (the flip is the change between
them). That is six unknowns (two directions, two durations) for six conditions (position and velocity at
arrival), so a departure time and a thrust fix the trip. Delta-v is thrust times burn time.

**How close two fixed directions come to the best steering [M].**

| Thrust | Gravity off (exact optimum known), median / worst of 28 | Gravity on, worst (confounded by several solutions) |
|---|---|---|
| 0.1 g | 0.005% / 0.10% longer | 0.41% |
| 0.3 g | 0.002% / 0.04% | 0.10% |
| 1 g | 0.0007% / 0.014% | 0.03% |

**The ends are not costed [M], with a printed bound.** Adding "leave orbit" and "enter orbit" burns on top
of the main burn double-counts speed the ship already has. For one idealised case, Earth to Mars at 1 g
with circular coplanar orbits, a single continuous optimum from low Earth orbit to low Mars orbit costs
1,748.0 km/s; the Sun-centred trip alone gives 1,753.1 (+0.29%); adding the two end burns gives 1,757.8
(+0.56%). That is the only case validated: the same run at 0.3 g did not converge, and ends at a
giant-planet capture orbit were not tested. So each torch trip prints a bound, the two orbits' speeds over
the trip's delta-v **[C]**: 0.6% for Earth to Mars at 1 g, 1.2% at 0.3 g, 2% at 0.1 g; 1.8% for a low
orbit at Jupiter at 0.3 g. The speed used for an orbit is that of a circular orbit with the same energy, so
a loose capture ellipse counts for little.

**Method [M].** Each burn is propagated by Chebyshev-Picard collocation in numpy (no per-step Python loop),
with 16 nodes a segment, in segments sized by how much the path turns and how fast its distance from the Sun
changes; a segment whose solved path turns more than expected is split again. The six unknowns are found by a damped Newton iteration
with a forward-difference Jacobian (step 1e-7, relative) whose columns ride along as extra rows of the same
propagation. The first guess is the closed-form free-space two-burn trip between the moving bodies. If that
start does not converge, a straight-at-the-target start is tried; each start is capped at 25 iterations.
`scipy` is in the CI lock but nothing in the backend imports it at run time **[R]**, so the solver is
numpy-only and tests use `scipy` only as an independent check.

| Measured | Result |
|---|---|
| 1,512 trips, 9 pairs, 24 dates, 0.01 to 10 g, complex-step Jacobian | all converged; arrival error against an independent integrator (DOP853, rtol 1e-12) at most 15 km and 0.024 m/s |
| 324 trips, 0.03 to 10 g, forward-difference Jacobian | all converged to the same solutions (flight times equal to 5e-10); at most 14 km and 0.012 m/s; median 5.4 ms a trip |
| Sun's gravity changes the flight time by | at most 0.24% at 1 g, 0.7% at 0.3 g, 2.8% at 0.1 g |
| The module as built: 1,296 trips, 9 pairs, 24 dates, 0.1 to 12 g | all converged from the first start; at most 18 km and 0.03 m/s (the solve tolerance is 1e-9 of the trip's length, 14 km for Eris); median 4.1 ms |
| The module as built: all 9,360 ordered pairs of the 40 catalog bodies at 0.1, 1 and 12 g on two dates | all solved, 62 with a detour; the second start was needed twice; slowest 47 ms |

**More than one solution [M].** The six equations can have several solutions (the course can pass either
side of the Sun). From the first guess, a faster one was missed in 9% of cases at 0.1 g, 4% at 0.3 g and
1% at 1 g, by at most 1.3%, 0.3% and 0.05%. Extra starts recover most of these at five times the cost, with
a tail of seconds. This release uses one start and says so: the trip found is within those figures of the
shortest. Below 0.1 g the misses reach 15% and the Sun bends the course by up to 20%, which is why the range
starts at 0.1 g.

**Limits.**
- **Thrust: 0.1 to 12 g, PROPOSED.** The lower end is where the model stays clean (above 15 times the Sun's
  pull even at Mercury's perihelion **[C]**). The upper end covers the 12 g that fans report for The Expanse;
  N2's tests and sweeps include 12 g.
- **Relativity is ignored.** At 12 g a trip to Eris peaks at 14% of light speed, where the flight-time error
  is about 0.2% **[C]**. Each torch trip carries this as a standing note.
- **Crew.** Above 2 g the trip carries a note: NASA's design limits are 2 g for 24 hours and 4 g for about
  an hour **[S]**. Nothing is refused on these grounds.

## 5. Too close to the Sun (N2)

The straight course between two planets passes within 0.1 AU of the Sun on 5.7% of days for Earth to Mars
and 11.6% for Earth to Mercury, in runs of up to 52 days **[M]**. Unconstrained solutions came as close as
1.2 solar radii **[M]**.

- **Keep-out distance, PROPOSED: 0.1 AU, enforced** (21.5 solar radii; 100 times the sunlight at Earth
  **[C]**). The closest any spacecraft has flown is Parker Solar Probe, 6.17 million km above the surface
  **[S]**, 0.046 AU from the centre **[C]**, behind a heat shield.
- **Detour.** When the solved course passes inside the keep-out, solve again with one more unknown: a tilt
  of the thrust by an angle over a stretch of the flight. The stretch is centred on the time the
  unconstrained course came closest to the Sun and reaches to the nearer end of the flight; the tilt is
  positive over the stretch's first quarter, negative over its middle half and positive over its last
  quarter (the flip time stays free). A stretch that is the whole flight is the revision 2 rule; that rule
  failed on all 13 blocked courses whose close pass fell in the last tenth of the flight (Pluto to Venus,
  Eris to Mercury), where a bow across the whole flight has no leverage **[M]**. The tilt is toward `n`: the
  position at the unconstrained course's closest approach to the Sun, with its component along the thrust
  removed and made a unit vector; the ecliptic pole when that closest approach is under 0.001 AU. The
  seventh condition sets the closest approach to the keep-out distance times 1.0001. With 12 collocation
  nodes the closest-approach condition is too noisy for some detours to converge (Earth to Metis on
  2032-11-17 at 1 g fails), so the solver uses 16 everywhere **[M]**.
- **Measured with the module as built [M].** Every blocked day got a detour: 890 of 890 over a launch cycle
  for Earth to Mars, Mercury, Venus and Jupiter at 0.1, 0.3, 1, 3 and 12 g, and 182 of 182 blocked courses
  between an inner planet and any other catalog body. Flown again by an independent integrator they arrive
  within 1 km and stay 0.10001 AU from the Sun. About 25 ms each; one low-thrust day took 1 s, in the
  unconstrained solve. Extra flight time: Earth to Mars 0.28% on average at 1 g (at most 0.6%), Earth to
  Venus at most 1.3%, Earth to Jupiter at most 0.4%, Earth to Mercury 1% on average and at most 5.4%.
  Centring the bow costs a little more than the whole-flight bow did where both work (Mercury: 5.4% against
  3.3% at worst). Waiting for the next clear day would cost 21.7 days on average.
- **When no detour is found.** That day has no trip: the search moves to the next day and counts it in
  `searched.skipped`. If every day is skipped the answer is `no_route`. Revision 2 also accepted a stalled
  detour inside a tolerance; nothing stalls in the sweeps above, so that rule was not built.
- "Blocked" is judged from the solved course, not the straight line: they disagree on 17% of borderline
  days at 1 g **[M]**.

## 6. Torch trips in the search (N3)

### 6.1 Days

A torch trip can leave any day, but its length depends on how far apart the bodies are that day.

1. Rank days with the closed-form free-space estimate: 0.33 ms each, within 0.24% of the solved time at 1 g
   and 0.7% at 0.3 g **[M]**. Scan the range on a grid of at most 366 points, then every day within one grid
   step either side of the eight best grid minima.
2. Solve two trips. The first day that has a trip is labelled **soonest**. The best-ranked day is labelled
   **fastest** and **cheapest**: for a continuous burn the shortest flight is also the least delta-v. A
   one-day range gives one trip with all three labels.
3. The rocket rule that alternatives cost at most a quarter more than the cheapest does not apply: leaving
   today can cost nearly twice the best day (1.87 times for Earth to Mars at 1 g over ten years **[M]**) and
   is still what "leave now" means. Torch trips are labelled by their own function.
4. Over ten years the best-ranked day was the true shortest day in 4 of 6 pair and thrust combinations and
   within 0.2% of it in the other two **[M]**. "Fastest" means within 0.2% of the shortest.

Round trips: the soonest outbound trip returns on the earliest day the stay allows; the fastest outbound
trip returns on the best-ranked day inside the stay range. Plans need no change: they call the trip search
and read each leg's dates **[M]** (the plan solver was run against torch-shaped legs).

### 6.2 Moons and one planet

- **A moon at the end of a trip around the Sun.** The trip is solved to the moon's planet. The moon is not
  placed on its orbit (as for rockets), so the last stretch is not flown; the leg reports its size, the
  moon's distance from its planet.
- **Between two places around one planet.** A flip-and-burn across the gap: time `2*sqrt(d/a)`, delta-v
  `2*sqrt(d*a)`, with `d` the difference of the two distances from the planet's centre. That is the closest
  alignment; two moons on opposite sides are up to about twice as far apart in time, and the leg says the
  price is for the closest alignment. Against full continuous-thrust optima the formula is 1.4 to 4.6% high
  for low Earth orbit to low lunar orbit over 0.1 to 5 g, and 3.1 to 7.2% high for a low orbit at Jupiter to
  Io at 0.5 to 3 g **[M]**; it never came out low. The hop is refused (`acceleration_too_low`, with the
  minimum) when the thrust is under a tenth of the planet's gravity at the lower of the two orbits: the
  lowest ratio measured is 0.107, and below that the ship spirals **[A]**.

### 6.3 What a torch leg looks like

```json
{
  "from": "earth", "to": "mars", "around": "sun",
  "drive": {"kind": "torch", "acceleration_g": 1.0},
  "depart": {"date": "2026-11-12", "jd": 2461356.5},
  "arrive": {"date": "2026-11-15", "jd": 2461359.8107},
  "flight_days": 3.3107,
  "thrust": [
    {"phase": "accelerate", "start": {"date": "2026-11-12", "jd": 2461356.5},
     "end": {"date": "2026-11-13", "jd": 2461358.1554}, "hours": 39.73, "delta_v_km_s": 1402.6},
    {"phase": "decelerate", "start": {"date": "2026-11-13", "jd": 2461358.1554},
     "end": {"date": "2026-11-15", "jd": 2461359.8107}, "hours": 39.72, "delta_v_km_s": 1402.4}
  ],
  "peak_speed_km_s": 1417.9,
  "closest_sun_approach_au": 0.99,
  "detour": false,
  "ends_bound_percent": 0.6
}
```

The numbers are illustrative; the README shows a real answer for the same request (3.294 days, 2,791 km/s,
peak 1,418 km/s). A torch leg around the Sun also carries `unflown_km`, the distance of a moon end from its
planet at each end (zero otherwise).

- A torch leg has `thrust` arcs, not `burns`: an arc starts and ends in flight, so the rocket fields `at`
  and `orbit` would mislead. Rocket legs keep `burns` and `excess_speed_km_s` unchanged.
- Every leg, rocket or torch, carries `drive`, so a consumer can tell which shape it has and a request whose
  drive was ignored cannot pass unnoticed.
- `arrive` is the time at the target body's centre. `peak_speed_km_s` is the speed relative to the Sun at
  the flip.
- The trip's `total_delta_v_km_s` is the sum of the arcs as printed; with an exhaust velocity the trip adds
  `propellant_fraction`.
- With `include: ["path"]` each leg around the Sun adds `path`: 181 rows `[jd, x, y, z]`, evenly spaced in
  time, jd to 4 decimals and AU to 6, heliocentric ecliptic J2000, the first and last at the two bodies'
  centres, so a drawn leg meets the drawn planets at either scale **[R]**. 181 rows keep the line within
  2e-5 of the path's extent **[M]** and cost about 8 kB a leg. Rocket legs get the same from their Lambert
  orbit.

### 6.4 Notes and refusals

Torch trips carry their own approximations: positions from the catalog; one start, so the trip is within
the section 4 figures of the shortest; the ends bound; relativity ignored; the first day is exact and the
best day is searched on a grid. New refusal: `acceleration_too_low` (one-planet hops only), with
`minimum_acceleration_g`. `searched` gains `objective`, `skipped` and, for torch, counts solver runs in
`transfer_solves`.

## 7. Course report (N4)

With `include: ["course"]`, every leg around the Sun, for either drive, gains `course`. It is computed for
the trips returned, after the search, inside the same deadline: when time runs short the asteroid screen is
left out, marked `not_searched`, and `searched.complete` is false; once the time is up the nearest bodies
are left out too, and only the Sun approach and the belts, which cost nothing, are reported. Legs around
one planet get no report, and a request that asks for one gets a note saying so.

- **Path.** Torch legs use the solver's path. Rocket legs are re-solved with the direct Lambert solver
  (0.45 ms) and propagated as a two-body orbit; the end lands within 378 km of the arrival body over 400
  random legs **[M]**.
- **Closest approach to the Sun**: distance in AU and the date. Torch legs use the solver's own figure;
  rocket legs a parabola through the squared distance at the three nearest rows (straight segments between
  rows cut 15,000 km inside an orbit near Earth).
- **Belts.** The course is "in the asteroid belt" while its distance from the Sun is between 2.06 and
  3.28 AU: the main belt between the Kirkwood gaps **[S]**, which is where the app draws it **[R]**. It is
  "in the Kuiper belt" between 30 and 50 AU **[S]**. Each crossing gives the dates in and out and the days
  inside; a crossing can be open at either end. These are conventions by distance: at any one date about a
  fifth of the catalogued asteroids are outside 2.06 to 3.28 AU **[M]**, so the report also counts what is
  actually near the course (below).
- **Nearest catalogued bodies**: the three closest of the 40 Sun-orbiting catalog places other than the
  leg's two ends, with distance and date, from the same samples.
- **Nearest catalogued asteroids.** The repo ships 100,000 real main-belt asteroids from JPL's small-body
  database **[R]**. When a course comes within their range of distances from the Sun, it is screened against
  all of them: 0.4 to 0.6 s a leg here **[M]**, agreeing with brute force to within 3,740 km **[M]**. The
  report gives the nearest one's JPL id (`spk_id`) and its number (609 of the catalog's asteroids are
  unnumbered, so `number` can be null), distance and date, and how many pass within 1.5 million km. The
  screen is two passes, every asteroid against every tenth row and then a shortlist against every row, with
  the shortlist chosen so the answer equals a full screen.
  A fast course across the belt typically passes about 870,000 km from the nearest (36 directions: 60,000
  to 2.4 million km) **[M]**. The catalog's orbits are two-body elements for 2026; more than a year from
  then the named asteroid is indicative only and the report flags it.
- **Context, one sentence when a belt is crossed**: probes have crossed the asteroid belt at tens of km/s
  with no reported hit, and NASA puts asteroids a mile or more across about 3 million km apart on average
  **[S]**; the risk from dust and small rocks at torch speeds is not estimated.

The Kuiper belt gets less than the asteroid belt: the repo has no real catalog of small Kuiper belt objects
**[R]**, so there the report gives the crossing dates and the nearest of the catalogued dwarf planets.

## 8. Limits a user will notice

- A torch trip's delta-v is thousands of km/s. The planner reports it, and the propellant fraction when an
  exhaust velocity is given. It does not yet plan coasting trips inside a fuel budget.
- For torch ships the orbits at each end are named, not costed; each trip prints the most they could change
  it (section 4).
- Thrust below 0.1 g is refused; ion-engine spirals need a different model.
- Planet and asteroid positions are the catalog's orbital elements, valid 1990 to 2050, as for rockets.
- A torch trip to a moon ends at its planet; hops around one planet are a straight-line estimate, a few
  percent high, priced for the closest alignment (section 6.2).
- The nearest-asteroid figure is a floor on how close the course comes to something large, not a hazard
  estimate: the catalog holds the 100,000 largest main-belt asteroids with known diameters, and nothing
  inside 2 AU or beyond 3.5 AU.
- The Expanse's own figures (0.3 g cruising, 12 g bursts) are fan-reported; only continuous thrust, the
  flip-and-burn and thrust gravity are corroborated **[S]**. The planner takes whatever acceleration is
  asked for and names no ship.

## 9. Issues in build order

| # | Issue | Delivers | Depends on | Size |
|---|---|---|---|---|
| N1 | Orbit at each end | Built: `feat/planner-n1-orbit-choice` | C4 | S |
| | | **Built, all local and unpushed, one branch on the next:** N2 `feat/planner-n2-torch-solver`, N4a `feat/planner-n4a-course-module`, N3 `feat/planner-n3-torch-trips`, N4b `feat/planner-n4b-course-in-search` (two commits) | | |
| N2 | Torch solver | `backend/planner/torch.py`: the two-burn solve, the fallback start, the free-space estimate, the keep-out detour, the path | none (new module) | L |
| N4a | Course module | `backend/planner/course.py`: rocket leg sampling, Sun approach, belts, nearest bodies, the asteroid screen | none (new module) | M |
| N3 | Torch trips in the search | `drive` and `include: ["path"]`; day ranking; soonest and fastest; round trips; moons and one-planet hops; leg shape; propellant fraction; notes | N1, N2 | L |
| N4b | Course report in the search | `include: ["course"]` on legs of both drives, inside the deadline | N3, N4a | S |
| N5 | Fuel budget | `max_delta_v_km_s`: burn, coast, burn, with a time against delta-v curve. Not in this build | N3 | M |

N2 and N4a share no code and are built in parallel. Drawing torch legs and adding drive controls belong to
the epic's panel issues (C7, C8); exposing `drive` to the agent belongs to C10.

## 10. Definition of done

1. Closed form: with gravity off and both bodies at rest, a torch trip takes `2*sqrt(d/a)` and costs
   `2*sqrt(d*a)` to 1e-9 **[S]** (the formula; the published role-playing-game figures for 4.2 AU, 257, 141,
   53 and 41 hours at 0.3, 1, 7 and 12 g, are the same formula rounded, and are checked as such).
2. Propagator accuracy: every solved trip in a test grid, including 12 g and detours, arrives within 100 km
   and 1 m/s when its solved parameters are re-integrated by an independent integrator.
3. The gravity term, independently of the solver: along a solved path, the change in orbital energy equals
   the work done by the thrust to 1e-6 relative.
4. Keep-out: re-integrated densely, no returned torch course comes closer to the Sun than the keep-out
   distance minus 1e-5 AU.
5. Days: for Earth to Mars at 1 g and 0.3 g the fastest trip is within 0.2% of the shortest found by solving
   every day of one synodic period; the soonest trip leaves on the first day.
6. Torch searches that touch 1990 or 2050 return the existing refusal codes; a cancelled torch search stops
   its worker.
7. Belts: Earth to Jupiter and Earth to Ceres at 1 g report asteroid belt dates that match the path's own
   distances; Earth to Pluto at 1 g and 0.3 g reports Kuiper belt dates; a synthetic straight radial course
   reports the crossing times its formula gives.
8. Asteroids: the catalog decoder reproduces the repo's ten-row sample exactly, and the screen's nearest
   asteroid matches a brute-force search.
9. Rockets do not move: the 133 planner tests that exist today pass unchanged, and a request without
   `include` returns the same rocket answer as today apart from the added `drive` field and
   `searched.objective`.
10. Speed, measured here: a torch search without `include` answers within 1 second; with `course`, a rocket
    round trip stays under the 10-second budget.
11. The README documents one request and answer for Earth to Mars at 1 g.

## 11. Testing plan

| Issue | Tests |
|---|---|
| N2 | The closed forms; the re-integration grid; the energy identity; a known conjunction date (closest approach at the keep-out, tilt nonzero); three Earth to Mercury days that stall at 12 nodes; the fallback start; path rows evenly spaced with ends at the two bodies |
| N4a | Rocket leg sampling against the arrival body; belt crossings on a synthetic radial course; nearest body against a direct search; the decoder against the ten-row sample; the screen against brute force; the indicative flag; a deadline that leaves the screen out |
| N3 | Request validation; labels and order for both objectives; a skipped day; the daily brute-force check; 1990 and 2050; round trip returns; a moon end's unflown stretch; hops against the hand formula, the alignment note and the refusal; propellant fraction by the rocket equation; every leg of a torch search has a torch drive; cancellation; the HTTP route; a plan with a torch trip |
| N4b | `include` absent leaves answers unchanged; course on rocket and torch legs; Kuiper and asteroid belt cases |

Every expected value is hand-derived or comes from independent code; each test fails first and survives a
mutation check, as in the epic's rules.

## 10a. Results against the definition of done

| # | Result |
|---|---|
| 1 | Met: closed forms to 1e-9, at rest and for a receding target worked by hand (`test_planner_torch.py`) |
| 2 | Met: 90 trips in the test grid and 1,296 in the sweep within 100 km and 1 m/s (worst 18 km, 0.03 m/s) |
| 3 | Met: work-energy identity to 1e-6 on four trips, from catalog states and the flip position |
| 4 | Met: every detour in tests and sweeps stays at 0.10001 AU when flown again densely |
| 5 | Met: fastest within 0.2% of solving all 782 days at 1 g and 0.3 g; over ten years the ranked day is the estimate's best day |
| 6 | Met: 1990 and 2050 refusals; a search cancelled before or during stops |
| 7 | Met: Jupiter, Ceres (open crossing) and Pluto at 1 g and 0.3 g; straight courses by hand |
| 8 | Met: ten-row sample exact; nearest asteroid equals a brute-force search of all 100,000 |
| 9 | Met: the 133 earlier planner tests pass unchanged (246 in all on 2026-11-17; 331 after the rebase, with main's agent and vehicle tests) |
| 10 | Met here: a ten-year torch search 0.2 s; a rocket round trip with six reported legs 7.4 s (4.8 s without). The search stops at 10 s; reports cheap enough to finish after that can add a few tenths |
| 11 | Met |

Mutation checks: 36 on the solver, 55 on the course module, 78 on the search; every surviving mutant was
closed with a test or removed as dead code.

## 12. Evidence and what was not checked

Six research agents (382 tool calls) and four critics (164) ran on 2026-11-15. Their scripts and outputs
are on branch `lab/measurements-torch-navigation` (one commit ahead of `lab/measurements`) under
`measurements/2026-11-15-torch-navigation/`: `torch-solver/` (the 1,512-trip grid, starts, speed, coasting),
`torch-ends/` (leaving and entering orbit; Earth-Moon and Earth-Mars optima), `course-geometry/` (blocked
days, a first detour, rocket leg sampling), `belt-data/` (catalog decoder, screening), `route-drawing/`
(path sampling), `sources/` (quotes and URLs), and `critique-*/` (the detour inside the collocation solver,
the label and budget runs, the floor and hop checks).

The build's own sweeps of the module as committed are in `production-checks/` in the same folder (two-burn accuracy,
blocked days, where blocked courses come closest, 12 against 16 nodes) with their outputs.

Not checked: the ends bound beyond one idealised Earth to Mars case at 1 g; ends at a giant-planet capture
orbit; one-planet hops below a thrust-to-gravity ratio of 0.107; any frontend rendering; flyby legs in a
course report (no search tried here found a cheaper flyby route).

One independent review of the built code ran on 2026-11-21 (`/code-review`, medium effort, the whole diff
against main). It found five minor points. Three were fixed in one commit: reports now stop at the time
limit, a trip around one planet says it has no report, and a rocket leg that cannot be sampled says so.
One was refuted by measurement: rocket leg dates fall on half-days, so rounding them to four decimals
changes nothing, and over 27 legs the orbit the report samples matched the orbit the search scored to
0.5 m/s. One was left: trips that share a leg share its report in memory, which no code depends on.

## 13. What the review changed

| Finding (critic) | Change |
|---|---|
| Reusing the rocket labelling drops the "leave today" trip: its 25% cost cap excludes it (contract, ran it) | Torch trips are labelled by their own function; the default objective for torch is earliest arrival |
| A catalog screen on every leg pushes a four-trip plan past the endpoint timeout: 11.6 s (contract, ran it) | `include` makes path and course opt-in; the screen runs inside the deadline |
| "The orbit at each end does not change the numbers" holds only near 1 g on shallow wells (physics) | Each trip prints the bound; the one validated case is named |
| The thrust floor was measured at the semi-major axis; just above it flight times are off by up to 20% and solutions are not unique (physics) | The range starts at 0.1 g |
| Four starts cost five times one start with a tail of seconds, and still miss cases (numerics) | One start, with the measured miss figures stated |
| The detour stalls at 12 collocation nodes; "away from the Sun" did not define a direction; solving to equality leaves courses a hair inside (numerics) | 16 nodes; the direction defined; a 1e-4 margin; the done-check given a tolerance |
| Torch `burns` reused rocket fields with other meanings; the example's own dates contradicted them (contract, scope) | `thrust` arcs with start and end |
| The one-planet hop used the closest alignment silently, and its refusal rule had no evidence (physics) | The alignment is stated; the refusal is tied to the lowest ratio measured |
| The belt sentence was stronger than its sources and ignored torch speeds (scope) | Rewritten |
| Belt "by distance" disagrees with where a fifth of the catalog is (physics) | The convention is labelled and the report counts asteroids near the course |
| The checks were less independent than claimed (scope) | An energy identity for the gravity term; a daily brute-force check; Kuiper, belt and date-limit cases |

Left as it was, with the reason: the nearest-asteroid screen stays (one critic would cut it) because the
owner asked about the belt by name and the data is already in the repo; it is now opt-in and bounded.

## 13a. What the build changed

| Found while building | Change |
|---|---|
| A bow across the whole flight cannot move a close pass near the end of it: 13 of 13 such courses had no detour | The bow is centred on the close pass (`tilt_window`) |
| With the centred bow, 12 nodes still fail one detour in 182 | 16 nodes everywhere: one setting, 15% slower |
| Nothing stalls any more | The "accept a stalled detour" rule was not built |
| The second start is needed (2 of 9,360) | Kept, with a test |
| 609 catalog asteroids have no number; 33 of them carry an older epoch | The report gives `spk_id` and a nullable `number`; `indicative` uses each asteroid's own epoch |
| Straight segments under-read the Sun approach of an orbit by 15,000 km | Parabola through three rows |
| A course's closest approach to the Sun is often just after departure, inside the origin's orbit | Tests corrected; nothing in the code |
| For a round trip, "fastest" counts the stay, as it does for rockets | The quickest-flight round trip can be labelled only `cheapest` |
| In a plan each trip gets an equal share of the time left | With four trips, rocket searches and their asteroid screens are often cut short and say so |

Rebased onto main on 2026-11-21, after PRs #77 to #80 merged. Two things main added apply to torch trips
too: a search whose first day is 2050-01-01 or later is refused (`departs_after_2050`), and a change of
orbit around one moon is refused (`orbit_change_around_moon`). The route-planning agent (PR #80) calls the
same trip search but its tool schema, sent in strict mode, offers neither `drive` nor `include`: the agent
plans rocket trips only until `drive` is added to that schema.

## 14. Open choices for the owner

1. The Sun keep-out: enforced at 0.1 AU with a detour. The alternative is to only report the closest
   approach. 0.2 AU would cost 2 to 3 hours at 1 g on the worst conjunction measured.
2. Thrust range 0.1 to 12 g.
3. The catalog's asteroid numbers in the report: the repo's own register marks the catalog
   "review-required" for republishing.
4. Whether the fuel budget (N5) and the panel controls come next.
5. Pushing the six navigation commits and opening their PRs (not done: asked first).
6. Whether one medium-effort review is enough before merging, or a deeper one should run.
7. Whether the agent's `search_trips` tool should offer `drive`, so a prompt such as "Earth to Mars at 1 g"
   plans a torch trip. Its vehicle check reads rocket burns and would need to refuse a torch trip.

## 15. Sources

- Flip-and-burn formulas: Atomic Rockets, https://www.projectrho.com/public_html/rocket/torchships.php
- Role-playing-game calculator figures, as quoted by a fan site: https://www.iandrea.co.uk/wargames/ScienceFiction/TheExpanse/index.html
- Belt spacing and "mostly empty space": NASA Dawn FAQ, https://science.nasa.gov/mission/dawn/faq/
- Spacecraft that crossed the belt: NASA Basics of Space Flight, https://science.nasa.gov/learn/basics-of-space-flight/chapter1-3/
- "Without incident" and the belt edges at the Kirkwood gaps: https://en.wikipedia.org/wiki/Asteroid_belt
- Kuiper belt extent: NASA, https://science.nasa.gov/solar-system/kuiper-belt/facts/
- Parker Solar Probe closest approach: https://www.guinnessworldrecords.com/world-records/sun-closest-approach-by-spacecraft
- Crew acceleration limits: NASA OCHMO-TB-024, https://www.nasa.gov/sites/default/files/atoms/files/acceleration_technical_brief_ochmo.pdf
