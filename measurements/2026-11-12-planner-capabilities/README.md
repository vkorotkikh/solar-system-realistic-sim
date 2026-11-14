# Planner capabilities, 2026-11-12

**Question.** What can the existing route planner do, how fast is it, and why does the
Mission plan button never return a plan? Evidence for the planner rework spec
(`records/specs/2026-11-12-planner-rework-agent-epic-draft.md` on branch
`docs/planner-rework-spec`).

**Run.** From `backend/` of the checkout under test, with an environment built from
`backend/requirements.txt` (Python 3.12):

```bash
python /path/to/measurements/2026-11-12-planner-capabilities/bench_planner.py
python /path/to/measurements/2026-11-12-planner-capabilities/capability_evidence.py
python /path/to/measurements/2026-11-12-planner-capabilities/inner_outer_planets.py
```

| Script | Measures |
|---|---|
| `bench_planner.py` | Launch-window scan speed, its 2,000-point cap, one fixed-date route, and the default Mission plan's verdict |
| `capability_evidence.py` | The supported date range, a ten-year Earth to Mars window search, best direct trips to nine bodies, the flyby search, the scan's trade-off list, the vehicle check, moon name clashes, and a scratch two-body model of moon and named-orbit trips |
| `inner_outer_planets.py` | Mercury and Venus at a 5-day flight-time step; Uranus, Neptune and Pluto at the ten-year flight cap |

`output.txt` holds all three runs: backend code of `feat/restore-solar-system-layers`,
identical to `origin/main` for every planner file, on a quiet machine.

**Findings.**

- A ten-year Earth to Mars search makes 9,646 transfer solves in 3.0 s. The limit is the
  2,000-point cap per request, not time.
- The scan's "delta-v" is the speed difference at each end, not burns from an orbit:
  5.88 km/s for Earth to Mars in late 2026, against 5.76 km/s as burns between 200 km and
  400 km orbits.
- Mission plan's default inputs need 24 to 31 km/s; its default vehicle has about 4.0.
- The backend catalog has no moons, and moons are refused as trip endpoints.
- The flyby search returned the direct route for Jupiter and Saturn.

Section H of `capability_evidence.py` is a scratch model, not repo code; its moon and
named-orbit figures are calculations, not measurements of the planner.
