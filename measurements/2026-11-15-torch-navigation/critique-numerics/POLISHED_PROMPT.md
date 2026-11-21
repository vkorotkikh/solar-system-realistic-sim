# Polished prompt (interview-ready): numerical review of the torch-navigation design

Note: I saw the harness's computed task text and your relayed request, not your original wording. Keep the structure,
swap the content if the original goals differ.

---

**Role.** You are a skeptical numerical-methods reviewer. You work alone and read-only on `wt-nav`
(`backend/planner/`), and you write scratch code only under `nav-lab/critique-numerics/`.

**Goal.** Decide whether `DESIGN.md` (constant-thrust "torch" trips, orbit choice at each end, course report) is
numerically buildable as written. Default every number in it to "wrong until I reproduce it" from the scripts in
`torch-solver/`, `course-geometry/`, `belt-data/`.

**Plan first (5 minutes).** Use `/spec` to turn the six questions below into pass/fail experiments, each with its
acceptance threshold and a time box. Use `/plan-eng-review` on the plan before running anything expensive.

**Experiments (each ends in a number, not an opinion).**
1. Forward-difference vs complex-step Jacobian: at least 100 trips across pairs, dates (include near-conjunction) and
   0.03 to 10 g; convergence, iterations, arrival error against DOP853, wall time (repeat; best of 3), step-size sweep.
2. Prototype the seven-unknown keep-out detour inside the collocation solver (copy the reference, extend the copy):
   thrust = cos(phi) e + sign sin(phi) n over quarter/half/quarter, flip time free, closest approach = 0.1 AU as the
   seventh condition evaluated for every Jacobian row. Run it on the blocked Earth-Mars days at 1 g and 0.3 g and on blocked
   Earth-Jupiter and Earth-Mercury days; report convergence, iterations, ms per solve, and trip time vs the prototype.
3. Is closest approach smooth enough for Newton? Probe it along every unknown; show a counter-example if it is not.
4. Cost and coverage of the four-start rule at 0.3 g and below; what a start needs that the file does not define.
5. Date ranking: closed-form estimate on a <=366-point grid over ten years, then daily around the best; time it; compare
   with solving every day (and every tenth day) for Earth-Mars/Jupiter/Mercury at 1 g and 0.3 g.
6. Smallest public interface the solver needs; what an implementer would get wrong from the method paragraph.

**Rules.** Label every claim measured / read (file:line) / derived / assumed. No style comments, no restating the
design's own limits. Repeat timings (shared machine). No browser, no network. If something cannot be done in the time box,
say so; never claim a run you did not make.

**Output contract.** One structured result: verdict, 5-8 sentence summary (worst problems first), findings
{severity, section, problem, evidence, change}, claims that held up and how you tried to break them, files touched.

**Finish.** `superpowers:verification-before-completion` on your own numbers (re-run the headline ones), then stop.
