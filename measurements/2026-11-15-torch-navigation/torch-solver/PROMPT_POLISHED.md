# Torch-ship trip solver: prototype, measure, recommend

## Role and goal
You are a numerical-methods engineer extending a solar-system trip planner (`backend/planner/`, orbit maths in
`backend/trajectory/` and `backend/mission/`). The planner today prices *ballistic* trips (two short burns joined by a
Lambert arc). Design and validate a solver for **constant-acceleration "torch" ships** (The Expanse): thrust of constant
magnitude `a`, 0.01 g to 10 g, for the whole trip (accelerate, flip, decelerate), from a low orbit at body A to a low orbit
at body B, under the Sun's gravity, with both bodies moving. Return measurements, not opinions.

## Environment (hard constraints)
- Repo checkout is READ-ONLY. Scratch and all outputs go in `nav-lab/torch-solver/`. No git commands that change state.
- Python venv `~/.venvs/solar-sim` (numpy, scipy, astropy), always `python -B`. No browser, no network.
- Body states: `sample_body_state_from_elements(body, jd)` -> AU, AU/day, heliocentric ecliptic J2000, ~9 us/call,
  catalogue 1990-2050. Do NOT use `EphemerisService` (budgeted, 2,000-state cap).
- Constants: 1 AU = 149,597,870.7 km; Sun GM = 1.32712440018e11 km^3/s^2; 1 g = 9.80665 m/s^2.
- Machine is shared (load ~17 on 32 cores): repeat every timing, report best of three.

## Method to evaluate first (challenge it, do not just implement it)
Two burns, each with a constant inertial direction (e1 for t1, e2 for t2): 6 unknowns (2 angles per direction + 2
durations), 6 arrival conditions (position and velocity of B at t0+T). Solve with scipy `root`/`least_squares` around a
numerical integration, starting from the free-space flip-and-burn guess (e1 = -e2 = direction to where B will be,
t1 = t2 = sqrt(d/a)). If you find a faster or more robust method, say so and show the numbers.

## Work order
1. Skim the planner and orbit code, then write a half-page plan with acceptance tests *before* coding (`/spec` or
   `superpowers:writing-plans`).
2. Write the self-test first (`superpowers:test-driven-development`): gravity off, bodies at rest, T = 2 sqrt(d/a),
   delta-v = a T to 1e-9 relative.
3. Implement, then measure. Keep `REPORT.md` current as you go so partial work survives an interruption.
4. Before claiming any number, re-run it (`superpowers:verification-before-completion`).

## Questions to answer, each with a table (use real ephemeris data)
Grid: pairs earth-mars, earth-venus, earth-mercury, earth-jupiter, earth-saturn, earth-neptune, mars-ceres, earth-eris,
jupiter-saturn; 24 departure dates in 2026-2036 including near-conjunction dates (chord passes close to the Sun);
a in {0.01, 0.03, 0.1, 0.3, 1, 3, 10} g.
1. **Convergence**: rate per acceleration, iteration counts, where and why it fails.
2. **Accuracy**: gravity off + bodies at rest: T and delta-v to 1e-9. Gravity on: re-integrate with DOP853 (rtol 1e-12);
   report arrival position error (km) and velocity error (m/s).
3. **Sun's gravity**: T and delta-v with gravity on vs off, per acceleration.
4. **Cost of constant-direction burns** vs minimum-time steering (direction proportional to c0 + c1 t, same end
   conditions): difference in T, and the acceleration below which it exceeds 0.1% and 1%.
5. **Speed**: wall time per solve; cheapest configuration (steps or tolerances) with arrival error < 100 km and < 1 m/s.
   Target 50 ms or better; say what is achievable and how (e.g. analytic state-transition Jacobian vs finite differences).
6. **Burn, coast, burn** with a total delta-v budget a (t1 + t2) = budget (7 unknowns, 7 conditions): does it converge?
   Trip time vs delta-v for earth-mars at 1 g and 0.3 g on one date.
7. **Closest approach to the Sun** (AU) per solution; list cases under 0.1 AU.
8. **Lower limit**: acceleration at which the model stops making sense (no convergence, spiralling). Recommend a minimum
   as a multiple of the Sun's gravitational acceleration at the smaller of the two orbit radii.
9. **Date-search pre-screen**: error distribution of a free-space estimate with moving bodies against the solved T, so a
   search can rank dates cheaply and solve only the best.

## Reporting rules
Label every claim `measured` (you ran it), `read` (file:line), `derived` (show the derivation), `cited` (URL and quote) or
`assumed`. Give units. Never report something as run that you did not run. If a sub-question is too hard, say so plainly
instead of guessing. About 30 minutes of work.

## Deliverables
- All scripts, plus `REPORT.md` with the tables.
- `torch_reference.py` exposing one function that solves a trip. Inputs: A state function, B state function, t0, a,
  optional delta-v budget. Outputs: T, t1, t2, coast, e1, e2, delta-v, sampled path, closest Sun distance. Include a
  self-test under `__main__`.
- Finish with `/review` on `torch_reference.py` and a one-paragraph recommendation: which method, which tolerances, which
  minimum acceleration, which pre-screen.
