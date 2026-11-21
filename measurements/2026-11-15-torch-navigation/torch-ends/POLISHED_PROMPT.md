# Polished prompt (interview-ready)

Note: I only saw the harness's computed task text, not your original message, so this is the best rewrite of what that
text asks. If your original wording had other goals, keep the structure and swap the content.

---

**Role and goal.** You are a senior flight-dynamics engineer working in my solar-system simulator repo
(`backend/planner/`, `backend/trajectory/`, `backend/mission/`). Design, but do not yet ship, two features for the trip
planner: (1) trips for constant-thrust "torch" ships (0.01 g to 10 g, thrust on for the whole trip: accelerate, flip,
decelerate, low orbit at A to low orbit at B, Sun's gravity, both bodies moving), and (2) a course report (closest approach
to the Sun and to catalogued bodies; when the course crosses the asteroid belt and the Kuiper belt).

**First, plan.** Use `/spec` to turn this into an executable spec, then `/plan-eng-review` on the plan before any code.
State the open questions you will answer by measurement rather than opinion.

**Method (measured, not asserted).**
1. Work read-only in the repo; put scripts and outputs in a scratch directory and keep `REPORT.md` current.
2. Reuse the planner's own numbers (bodies, moon GM, `sample_body_state_from_elements`); do not call the budgeted ephemeris service.
3. For every claim, label it measured / read (file:line) / derived (show the maths) / cited (URL + quote) / assumed, with units.
4. Fan out independent sub-questions to parallel agents (`superpowers:dispatching-parallel-agents`), one deliverable each.
5. If a sub-question is too hard for the time box, say so; never report something as run that you did not run.

**Deliverable for this sub-task (ends of the trip).** Cost and time to leave and to enter a low orbit under continuous
thrust, and how to patch those ends onto the Sun-centred leg: tabulate delta-v/v_circular against a/g0 (1e-3 to 1e3) and check
the two limits; test whether velocity-aligned thrust is cheapest; repeat from an elliptical periapsis; give concrete values
for Earth/Mars/Moon/Jupiter/Ceres; quantify the patching error against an optimised continuous trajectory (LEO to low lunar
orbit at 1 g and 0.1 g; Earth to Mars if time allows); recommend the cheapest model within 2% for interplanetary trips at
a >= 0.1 g and state how wrong it is for planet-to-moon hops.

**Acceptance.** `ends_reference.py` exposing `escape_cost(mu, r_periapsis, r_apoapsis, a) -> (delta_v_km_s, seconds)` with a
self-test under `__main__` (limits, work-energy identity, input refusal); scripts re-runnable; `REPORT.md` with a results
table, the measured error of each model, and an explicit list of what was not done.
Finish with `/verify` (or `superpowers:verification-before-completion`) before claiming done, then `/review` the diff.
