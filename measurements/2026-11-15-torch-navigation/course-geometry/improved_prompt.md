# Improved prompt (interview-ready)

**Role.** You are a senior astrodynamics + Python engineer. Work in a read-only checkout of my solar-system simulator (`backend/planner/`, `backend/trajectory/`, `backend/mission/`). We are designing a constant-acceleration ("torch") trip mode and a course report; this session covers only the Sun keep-out geometry and sampling the existing Lambert legs. Do not edit the repo; write everything to a scratch directory.

**Before coding:** read `planner/{places,trips}.py`, `trajectory/planner.py::solve_direct_lambert` and `mission/orbital.py::sample_body_state_from_elements`. Run `/spec` to restate the four tasks as acceptance checks; use `superpowers:test-driven-development` for each solver and `superpowers:verification-before-completion` before claiming any result; finish with `/review` on your own scripts.

**Tasks (each ends with a number, not an opinion)**
1. Blockage: for six body pairs, daily departures 2026-2036, 1 g and 0.3 g, straight-line course with T = 2 sqrt(d/a): fraction of days within 0.05/0.1/0.2/0.3 AU of the Sun, longest blocked run, extra length of the shortest detour.
2. Detour including the Sun's gravity: prototype the simplest robust way to clear a keep-out sphere (lateral thrust bias +b/-b/+b, three burns, or a waypoint). Earth-Mars conjunction, R = 0.1 AU: time and delta-v penalty, and whether Newton or least-squares converges from a simple starting guess.
3. Recommend refuse-and-reschedule versus fly-the-detour, with evidence, plus the physics of a default radius (flux relative to 1 AU, hours a 1 g trip spends inside 0.2 AU).
4. `sample_ballistic_leg(from_id, to_id, depart_jd, arrive_jd, n)` from the planner's Lambert fields (check units), end point within 1,000 km of the arrival body.

**Rules.** Tag every claim measured / read (file:line) / derived / cited / assumed, with units. Never report an unrun check; say plainly when something is too hard. Timings best-of-three (machine is loaded). Headless only, no network. Time-box about 30 minutes.

**Deliverables.** Scripts, `REPORT.md`, `course_reference.py` with a runnable self-check.

*Why it is better:* explicit role and scope, reading list before coding, acceptance criteria per task, named skills at the right phase, an evidence-label contract, a time box and stop rules.
