# Torch-ship navigation and the course report (2026-11-15 to 2026-11-17)

## The question

Can the trip planner plan trips for ships that thrust the whole way ("accelerate, flip, decelerate", 0.1 to
12 g) between any two bodies, keep them away from the Sun, and say what a course passes in the asteroid belt
and the Kuiper belt? How accurate and how fast is each piece, and where does it break?

The design these runs fed is `records/specs/2026-11-15-navigation-torch-ships-and-course-report.md`
(branch `docs/navigation-design`). The code is on branches `feat/planner-n2-torch-solver` to
`feat/planner-n4b-course-in-search`.

## What is here

| Folder | What it holds | When |
|---|---|---|
| `torch-solver/` | The reference two-burn solver, its 1,512-trip grid, start guesses, speed and coasting runs | research, 11-15 |
| `torch-ends/` | Leaving and entering orbit under continuous thrust; Earth-Moon and Earth-Mars optima | research |
| `course-geometry/` | Days a straight course passes the Sun, a first detour, sampling a rocket leg | research |
| `belt-data/` | Decoder for the asteroid catalog, propagation, the closest-approach screen | research |
| `route-drawing/` | How many path rows a drawn leg needs | research |
| `sources/` | `SOURCES.md`: quotes and URLs for the belt, Parker Solar Probe, crew limits, The Expanse figures | research |
| `critique-*/` | Four adversarial reviews of design revision 1 (physics, numerics, contract, scope) | review, 11-15 |
| `production-checks/` | Sweeps of the module as committed, with outputs: `sweep_two_burn`, `sweep_keep_out`, `where_closest`, `nodes_and_slow` | build, 11-16 |
| `n3/`, `n4a/` | The mutant lists run against `planner/trips.py` and `planner/course.py` | build, 11-17 |
| `tools/mutate.py` | The mutation runner: one change at a time, expect a test to fail, restore | build |

## How to run

The `production-checks/` scripts take the backend directory of a checkout that has the code:

```bash
python -B production-checks/sweep_two_burn.py <checkout>/backend    # 10 s
python -B production-checks/sweep_keep_out.py <checkout>/backend    # 4 min
python -B production-checks/where_closest.py <checkout>/backend out.json
python -B tools/mutate.py backend/planner/course.py backend/tests/test_planner_course.py /tmp/course.bak n4a/mutants.py   # from the checkout root
```

Python 3.12 with numpy and scipy (the CI lock, `ci/backend-test-requirements.txt`). The research and
critique scripts were written by agents against one session's folders; those local paths are replaced
here by `<session-dir>` (the folder that held `nav-lab/` and the checkouts) and `<venv>`. Treat them as a
record, not as runnable.

`nodes_and_slow.py` ran against the solver while it still had a separate node setting for detours and no
longer runs against the committed module. `torch_quarters_snapshot.py` is the solver before the detour was
centred on the close pass.

## What it found

- **Accuracy.** 1,296 trips (9 pairs, 24 dates, 0.1 to 12 g) flown again with scipy's DOP853 at rtol 1e-12
  arrive within 18 km and 0.03 m/s (`production-checks/sweep_two_burn.out`). The tolerance is 1e-9 of the
  trip's length, which is 14 km for Eris.
- **Speed.** A solve takes 4 ms at the median, 25 ms with a detour. One Earth to Mercury day at 0.1 g took
  1 s, in the plain solve (`production-checks/sweep_keep_out.out`).
- **The Sun.** 890 blocked days over a launch cycle (Earth to Mars, Mercury, Venus, Jupiter at five thrusts)
  and all 9,360 ordered pairs of the 40 catalog bodies got a course 0.10001 AU from the Sun
  (`sweep_keep_out.out`). The detour costs Earth to Mars 0.28% more time on average at 1 g and Earth to
  Mercury up to 5.4%.
- **Where the first detour broke.** A bow across the whole flight failed on 13 of 13 blocked courses whose
  close pass came in the last tenth of the flight (`where_closest_quarters.json`); centred on the close pass
  it fails on none of 182 (`where_closest_final.out`).
- **Nodes.** With 12 collocation nodes one detour in 182 does not converge (Earth to Metis, JD 2463553.5,
  1 g); with 16 all do.
- **Ranking days.** The closed-form gravity-free estimate is within 0.24% of the solved time at 1 g and 0.7%
  at 0.3 g, at 0.3 ms a day (`torch-solver/`).
- **The belt.** The catalog decoder reproduces the published ten-row sample exactly. A two-pass screen of
  all 100,000 asteroids takes 0.4 to 0.55 s a leg and equals a brute-force search. A 1 g course to Jupiter
  passes about a million km from the nearest catalogued asteroid and has two within 1.5 million km.
- **The ends.** For Earth to Mars at 1 g, a single continuous optimum from low orbit to low orbit costs
  1,748.0 km/s against 1,753.1 for the Sun-centred trip alone (`torch-ends/`): the orbits are not costed
  separately, and each trip prints a bound instead.

## Not committed

Result files over 200 kB (the full 1,512-trip grids, daily blocked-day tables: 22 MB) and the web pages the
source notes were read from. `sources/SOURCES.md` has the quotes and the URLs.

## Context

Commits under test: 1883ce4 (solver) and 720e17d (search), as they were before the branches were rebased
onto main on 2026-11-21; the rebase changed no line of `planner/torch.py` or `planner/course.py`. Python 3.12.13, numpy 2.5.2, scipy 1.18.0. Runs on
2026-11-15 to 2026-11-17 on the development machine; the mutation and sweep runs shared it with a test run
at times, so the millisecond figures are indicative.
