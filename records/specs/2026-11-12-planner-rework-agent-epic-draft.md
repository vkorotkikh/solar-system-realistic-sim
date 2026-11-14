---
title: Planner rework and route-planning agent (epic draft)
date: 2026-11-13
target: origin/main fa132f9 (planner panel on screen only on feat/restore-solar-system-layers)
status: draft
---

# Planner rework and route-planning agent: epic draft

Revision 2, 2026-11-13: the owner's five selections are folded in. No issue is filed and no rework code is written. The owner authorized one action, landing the restore branch (issue P0).

Evidence labels used throughout:
**[M]** measured by running the repo's own code,
**[R]** read in the code,
**[C]** calculated with a scratch model that is not repo code,
**[A]** assumed.
Raw output is in `2026-11-12-planner-rework-agent-epic-draft-evidence/`. The scripts are in `measurements/2026-11-12-planner-capabilities/` on branch `lab/measurements`.

## 1. Decisions

| Decision | Value | Status |
|---|---|---|
| What the planner plans | Trips with a launch-window search, one way or round trip, with an optional vehicle check. No mining economy. | Confirmed 2026-11-11 |
| Places | Planets, dwarf planets, asteroids, all 423 moons, and named orbits | Confirmed 2026-11-11 |
| Agent surface | A prompt box in the app; the backend calls a hosted model that calls planner tools | Confirmed 2026-11-11 |
| Model provider | Claude through the Anthropic API first. The provider call lives in one module so OpenAI can replace it. Local models are out of v1. | Confirmed 2026-11-12 |
| Model tier | The model id is a backend setting with no built-in default. The first build runs the acceptance prompts on each tier and reports pass rate and measured cost; the owner picks the cheapest tier that passes. | Confirmed 2026-11-12 |
| Scheduling | Several trips planned together on one timeline | Confirmed 2026-11-13 |
| App control | The agent also moves the camera, sets the date and switches layers | Confirmed 2026-11-13 |
| Done criteria | The seven checks in section 9, with 5% and 10% accuracy limits | Confirmed 2026-11-13 |
| What "ground up" keeps | Keep the tested orbit maths, rebuild everything above it | Confirmed 2026-11-13 |
| Branch order | `feat/restore-solar-system-layers` lands before this work starts. Rebase, push and pull request authorized. | Confirmed 2026-11-13 |

The owner chose the timeline and app control without detail, so how each works is my reading and is tagged **PROPOSED** where it appears, along with the other design choices the owner has not yet seen. The seven confirmed checks do not cover those two additions; section 9 proposes two more.

## 2. Context

The owner uses the app to explore the solar system and wants to type a trip in plain words, such as "Earth to Mars" or "to the Moon", and get back when to leave, the route drawn in the scene, and an explanation. The start defaults to Earth. Several trips can sit on one timeline, and the same prompt box can steer the app.

Today that is not possible, for three reasons. The planner's main button, Mission plan, can never succeed. The planner refuses every moon. And the app calls no AI model. The planner panel was also taken off the page in February: its code is still on `main`, unused, and only the restore branch puts it back on screen.

Two consumers will use the reworked planner: the owner through a form, and the agent through tools. Both must get the same numbers from the same code.

## 3. Current state

Checked 2026-11-12. The planner backend is byte-identical on `origin/main` fa132f9 and the restore branch **[R]**.

| Fact | Evidence |
|---|---|
| Six planner endpoints in `backend/server.py` (lines 3942 to 4514): `/trajectory/capabilities`, `/trajectory/plan`, `/trajectory/lambert`, `/trajectory/porkchop`, `/mission/capabilities`, `/mission/plan` | **[R]** |
| 8,391 lines behind them: `backend/trajectory/` 3,750 and `backend/mission/` 4,641 | **[R]** |
| The planner's frontend code, 1,610 lines in four files, is on `main` but nothing there uses it. The panel's markup in `index.html` and its wiring in `src/main.ts` exist only on the restore branch. | **[R]** |
| 303 planner tests: 260 backend in 21 files, 43 frontend | **[R]** |
| The backend catalog `backend/data/bodies.py` has 41 bodies: the Sun, 8 planets, 14 dwarf planets, 18 asteroids. It has no moons. 40 are accepted as trip endpoints. | **[M]** |
| Moons are refused as endpoints by `backend/trajectory/contracts.py:125` | **[R]** |
| `src/data/moons.json` holds all 423 moons with orbital elements around their planet. It has no mass field. | **[M]** |
| A launch-window scan exists (`run_porkchop_scan`). A ten-year Earth to Mars search took 3.0 s for 9,646 transfer solves and found the windows of late 2026, late 2028, the turn of 2030 to 2031, April 2033 and June 2035. | **[M]** |
| One scan request is capped at 2,000 grid points, a flight-time step of at least 5 days, a flight time of at most 3,650 days, and dates from 1990-01-01 to 2050-01-01 | **[M]** by rejection, **[R]** |
| The scan's "delta-v" is the sum of the speed differences at each end, not engine burns from an orbit. Earth to Mars in the 2026 window: 3.31 + 2.57 = 5.88 km/s by the scan, against 3.71 + 2.04 = 5.76 km/s as burns from a 200 km Earth orbit into a 400 km Mars orbit. | **[M]** |
| A burn-from-orbit function exists: `circular_parking_burn_km_s` at `backend/mission/propulsion.py:33` | **[R]** |
| A staged vehicle check exists: `VehicleService.evaluate_burn_budget` at `backend/mission/vehicle_service.py:32`. The default two-stage vehicle fails a one-way Mars trip by 1.93 km/s. | **[M]** |
| Mission plan with default inputs returns `no_verified_candidate`. Its four candidates need 24.3 to 31.0 km/s; the default vehicle has about 4.0 km/s. All four fail all three checks. | **[M]**, vehicle total **[C]** |
| Planning on one fixed date is the core weakness. Earth to Saturn leaving 2026-11-12 costs 50.7 km/s; the best window in ten years costs 16.1 km/s (both as speed-difference sums). | **[M]** |
| A gravity-assist search exists (`plan_interplanetary_route`). In two tests (Jupiter and Saturn, one and two flybys allowed) it returned the direct route. | **[M]** |
| The five "agents" in `backend/mission/agents.py` are plain Python classes. `backend/mission/epo/` (757 lines, 5 test files) is imported by nothing in the server. | **[R]** |
| No AI model is called anywhere. No model API key is set on this machine and `backend/requirements.txt` has no model library. | **[R]**, key names only **[M]** |
| The backend serves on loopback by default (`SOLAR_SECURITY_PROFILE=local`). A network profile with API keys exists but covers only the solar endpoints (`backend/server.py:569`, `:1909`). | **[R]** |
| The app has a camera focus function (`focusBody`, `src/main.ts:804` on the restore branch) and eight layer switches: orbits, labels, magnetic field, realistic scale, moons, asteroid belt, Kuiper belt, Earth satellites. No control sets an arbitrary date; there is only "Jump to now". Nothing is saved in browser storage. | **[R]** |

Terms: *delta-v* is the total speed change the engines must supply. A *launch window* is the span of dates when leaving costs least.

## 4. What v1 does

Sizes are my estimates, not measurements: **S** about half a day, **M** about a day, **L** about two days of agent working time including tests.

| # | Capability | Example prompt | What the user sees | Exists today | To build | Size | Issue |
|---|---|---|---|---|---|---|---|
| 1 | Understand a trip in plain words | "to the Moon" | One line restating the trip with the defaults filled in: from Earth, 200 km orbit, to the Moon, 100 km orbit, one way, cheapest departure in the next ten years. Then the result. | Nothing. No model is called. | Agent endpoint and prompt box | L + M | C10, C11 |
| 2 | Find the place and ask when unclear | "Earth to Europa" | "Europa, the moon of Jupiter, or the asteroid 52 Europa?" | The backend knows 41 bodies by id. Two moon names clash with asteroids already in it: Europa and Metis **[M]**. Nothing looks up moons or orbits. | A place list covering 464 bodies and the named orbits, and a lookup | in C1, C3, C4 | C1 |
| 3 | Find when to leave | "Earth to Mars, cheapest in the next ten years" | Leave 2026-11-12, arrive 2027-09-08, 300 days, burns 3.71 + 2.04 = 5.76 km/s **[M]**, plus a fastest and a soonest alternative | The scan exists and is fast, but is capped at 2,000 points, reports speed differences and leaves its alternatives unlabelled | A scheduler around the scan: several passes, burns from orbits, labelled alternatives | L | C1 |
| 4 | Fly to and from moons | "to the Moon" | Leave Earth orbit 3.13 km/s, enter lunar orbit 0.82 km/s, 5.0 days **[C]** | Refused | Moon data on the backend and a planet-centred transfer model | L | C3 |
| 5 | Start or end in a named orbit | "low Earth orbit to the NRHO" | 3.13 + 0.23 km/s, marked approximate **[C]** | Only a single parking altitude number | An orbit list and burns for elliptical orbits | M | C4 |
| 6 | Round trips | "Earth to Mars and back with a 30 day stay" | Two legs and the stay, each leg with its own window, and the total | The old Mission plan chains two fixed dates inside the mining pipeline | Chain two window searches | S | C2 |
| 7 | Compare options | "fastest instead of cheapest", "would a flyby help?" | Alternative trips side by side; a flyby route only when it is cheaper | The scan returns a trade-off list (16 entries in one test **[M]**). The flyby search exists but found nothing cheaper in two tests. | Labels and a pass-through flag | S | C1 |
| 8 | Check a vehicle | "can a two-stage ship with 18 t of fuel fly it?" | Yes or no, fuel left after each burn, and the shortfall | Exists as a Python class | An endpoint and a tool | S | C5 |
| 9 | Plan several trips on one timeline | "Send cargo to Mars, then crew 60 days after the cargo arrives" | Two trips as bars on one date axis, the second leaving after the first arrives, both routes drawn, and the plan's first departure and last arrival | Nothing | A plan solver, a timeline view and an agent tool | M + L | C6, C8 |
| 10 | Chain trips into an itinerary | "Earth to Mars, then on to Ceres 30 days after arriving" | Two trips in sequence, each with its own window | Nothing | The same plan solver | in C6 | C6 |
| 11 | Drive the app | "show me Europa", "jump to the day we arrive", "hide the asteroid belt" | The camera moves to Europa; the app date jumps to the arrival date; the belt layer switches off | A focus function and eight layer switches exist. Nothing sets an arbitrary date. | Three tools that return actions, and a set-date function | S + S | C8, C10, C11 |
| 12 | Follow up | "make it a round trip" | The updated trip in the same conversation | Nothing | Conversation kept in the browser | in C10, C11 | C10 |
| 13 | Show and explain | any | The route drawn, each burn with its date, and a short explanation | Sun-centred arcs are drawn on the restore branch | A result card, drawing for moon legs, and an explanation checked against the solver's numbers | L | C7, C10 |

The same trips and plans are available from a manual form without any model or key (issues C7 and C8).

## 5. Not in v1, and why

| Left out | Why |
|---|---|
| Mining and cargo economics | Owner decision. It is the reason Mission plan never passes. |
| Tours optimised as a whole | Chained trips are in (capability 10), each leg optimised in turn. Optimising all legs together needs a different search. |
| Shared resources on the timeline: ships, crews, launch pads | **PROPOSED** exclusion. Nothing in the repo models them, so the only clash the planner can find is a trip that cannot leave after the one it is tied to. |
| Saving a plan across reloads | **PROPOSED** exclusion. The app stores nothing in the browser today. The plan lives for the session; saving it is a small follow-up. |
| Low-thrust (ion) engines | Different maths; the repo has no solver for it |
| Moon-flyby tours and aerobraking | Need another class of solver. Their absence is why some trips cost more than real missions (section 6). |
| Launch from and landing on a surface | Needs ascent and atmosphere models |
| Real rocket presets | Need sourced figures with provenance, which this repo requires for shipped data |
| Comets, spacecraft, Lagrange points, other stars | No orbit data in the catalogs. The NRHO is the one exception, as a named orbit. |
| Trips arriving after 2050 or flying longer than ten years per leg | The backend's position data is only validated for 1990 to 2050 **[R]** |
| App actions beyond camera, date and layers | The agent gets exactly three actions. It cannot change speed, open panels or touch the Sun controls. |
| Conversation memory across reloads, streamed replies, voice | Not needed for the stated use |
| A local model, and access for outside assistants | Owner decisions |
| A browser-side fallback planner | **PROPOSED** removal. Today the Direct and Route buttons fall back to a calculation in the browser when the backend is down. Keeping it means two planners that can disagree. Without the backend the new panel says the planner is offline. |

## 6. Limits a user will notice

**Refused**

- Any place outside the catalogs: comets, spacecraft, surface sites, the Sun, other stars **[R]**.
- Any leg that arrives after 2050-01-01, departs before 1990-01-01, or flies longer than ten years **[M]**. In practice Uranus, Neptune and Pluto are only reachable on fast, very costly paths: speed-difference sums of 17.9, 25.2 and 31.8 km/s at the ten-year cap **[M]**. The agent must say this rather than present those as sensible trips.

**Approximate**

- Planet and asteroid positions come from offline orbital elements, not a live ephemeris **[R]**. The repo validates them at four sampled dates per body, not continuously.
- Window dates are found on a grid: 10-day departure steps and flight-time steps of at least 5 days **[M]**. The scheduler refines around the best point, but dates are good to a few days, not hours.
- Moon legs assume circular orbits in one plane. 402 of the 423 moons have rough orbits, and 3 have only a provisional name **[M]**.
- Moon masses are not in `moons.json` **[M]**. The 21 named moons get sourced masses in C3; every other moon is treated as having no gravity, so arriving there means matching its speed.
- The NRHO is treated as a lunar ellipse of 3,366 by 70,000 km radius. That gives an arrival burn of 0.23 km/s **[C]**. Published figures I recall are nearer 0.4 km/s **[A]**, so the arrival burn is probably low while the trip total is within a few percent. C4 must cite a reference before any accuracy claim.
- Round trips and plans choose each leg in order. They are not optimised as a set.

**More expensive than real missions**

- Moons of the giant planets are reached straight in. Earth to Europa costs 6.29 + 5.40 = 11.69 km/s **[C]**. Real designs use repeated moon flybys to cut the braking burn **[A]**.
- Mercury costs 6.73 + 6.43 = 13.15 km/s direct **[M]**. Real Mercury missions used years of planetary flybys **[A]**.
- Asteroid rendezvous is chemical and direct. Earth to Psyche is 11.46 km/s as a speed-difference sum **[M]**; the real Psyche spacecraft uses ion engines and a Mars flyby **[A]**.
- No aerobraking at Mars, Venus or Titan, and no low-energy lunar transfers.
- The flyby search is offered but should not be expected to help: it found no saving in either test **[M]**.

**App control**

- Switching on the Earth satellites layer downloads current orbits from CelesTrak, exactly as clicking the switch does.
- The agent sees the app only through a short state summary sent with each prompt: the date, the focused body and the eight switch states.

What "arriving" means sets the fuel figure. At Jupiter a low circular orbit costs 17.09 km/s to enter and a loose capture ellipse costs 0.44 km/s **[C]**. Section 7.4 proposes defaults.

## 7. Design

### 7.1 Shape

```
prompt box ──> POST /planner/agent ──> model ──tools──┐
     ▲                │ actions                       ▼
     └── app applies ─┘            backend/planner (new)
manual form ─> POST /planner/trips/search       │
               POST /planner/plans/solve        │
               POST /planner/vehicle-check      ▼
               GET  /planner/places   kept orbit maths: trajectory/lambert.py, mga.py,
                                      budget.py, contracts.py, planner.py and
                                      mission/ephemeris_service.py, orbital.py,
                                      propulsion.py, vehicle_service.py
```

One new package, `backend/planner/`, holds everything above the kept orbit maths. The agent's tools call the same Python functions the HTTP endpoints call, in process. The old six endpoints, the mining mission, the five agent classes, the risk simulation and `backend/mission/epo/` are removed in C9, after the new panel is live.

### 7.2 Places

A place is a body plus an orbit around it.

- Body ids stay as they are for the 41 backend bodies (`mars`, `europa52`). Moons use the frontend's existing rule, `moon-<planet>-<name>` in lower case, for example `moon-earth-moon` (`src/sim/catalog.ts:644`), so a result maps straight onto a scene node.
- The backend reads `src/data/moons.json` directly. There is one moon list, not a copy. A test fails if 423 moons do not load.
- Named orbits, **PROPOSED** list for v1: `leo` (200 km, the existing default), `geo`, `llo` (100 km lunar), `nrho` (approximate), `lmo` (400 km Mars).
- `GET /planner/places?query=<text>` returns up to five matches, each with `id`, `name`, `kind` (planet, dwarf planet, asteroid, moon, orbit), `around`, and `default_orbit`. Matching ignores case and brackets, so "Europa" returns both the moon and `europa52`.

### 7.3 Trip search

`POST /planner/trips/search`

```json
{
  "from": "earth",
  "to": "mars",
  "trip": "one_way",
  "earliest_departure": "2026-11-12",
  "latest_departure": "2036-11-12",
  "stay_days": null,
  "max_stay_days": null,
  "objective": "min_delta_v",
  "flybys": 0
}
```

- `from` defaults to `earth`. `earliest_departure` defaults to today and `latest_departure` to ten years later. Dates are ISO calendar dates; results carry the date and the Julian date the renderer needs.
- `trip` is `one_way` or `round_trip`. For a round trip `stay_days` is the shortest stay and `max_stay_days` the longest; it defaults to `stay_days`, an exact stay.
- `objective` is `min_delta_v`, `min_time` or `earliest_arrival`.
- `flybys` is 0, 1 or 2 and applies to Sun-centred legs only.

Response:

```json
{
  "status": "ok",
  "resolved": { "from": { "id": "earth", "orbit": "leo" }, "to": { "id": "mars", "orbit": "lmo" } },
  "trips": [
    {
      "id": "t1",
      "label": "cheapest",
      "total_delta_v_km_s": 5.76,
      "total_days": 300.0,
      "legs": [
        {
          "from": "earth", "to": "mars", "around": "sun",
          "depart": { "date": "2026-11-12", "jd": 2461356.5 },
          "arrive": { "date": "2027-09-08", "jd": 2461656.5 },
          "flight_days": 300.0,
          "burns": [
            { "at": "earth", "orbit": "leo", "date": "2026-11-12", "delta_v_km_s": 3.71 },
            { "at": "mars", "orbit": "lmo", "date": "2027-09-08", "delta_v_km_s": 2.04 }
          ],
          "excess_speed_km_s": { "depart": 3.31, "arrive": 2.57 }
        }
      ],
      "approximations": []
    }
  ],
  "searched": { "earliest_departure": "2026-11-12", "latest_departure": "2036-11-12", "transfer_solves": 9646, "seconds": 3.0, "complete": true }
}
```

`status` is `ok`, `no_route` or `refused`. A refusal carries a `code` and a plain `message`, for example `arrives_after_2050`. Every trip lists its `approximations` in plain words, and those strings are what the agent and the result card show.

The scheduler runs the existing scan in passes under its 2,000-point cap: a coarse pass across the whole range, then a fine pass around each low point. It returns up to three trips labelled cheapest, fastest and soonest, taken from the scan's trade-off list.

### 7.4 Transfer model

Two-body transfers stitched together, in four pieces. Exact formulas go in the child issues.

1. **Sun leg.** Between two Sun-orbiting bodies, or between the parent planets of two moon endpoints. Uses the existing solver through the scan. The cost is a departure burn and an arrival burn, each computed from the leftover speed at that end and the orbit there.
2. **Planet leg.** Between two places around the same planet: orbit to moon, moon to moon, orbit to orbit. A minimum-energy transfer between the two radii, circular and in one plane. Any day works, so the result says so instead of naming a window.
3. **Moon at the end of a Sun leg.** Straight in: the incoming path's closest approach to the planet is placed at the moon's orbit, and one burn at the moon enters its orbit.
4. **Orbit burns.** Circular orbits use the existing `circular_parking_burn_km_s`. Elliptical named orbits burn at their lowest point.

**PROPOSED** default orbits when the user names only a body: Earth 200 km; other rocky bodies of radius 2,000 km or more 400 km; smaller bodies and all moons 100 km; the four giant planets a loose capture ellipse from 1.1 to 200 planet radii.

### 7.5 Vehicle check

`POST /planner/vehicle-check` takes a list of burns in km/s, a payload mass, a reserve fraction and a list of stages (`name`, `dry_mass_kg`, `propellant_mass_kg`, `isp_s`). It returns what `VehicleService.evaluate_burn_budget` returns today: feasible or not, fuel used per burn, the margin and any shortfall. It is stateless and has no mining inputs.

### 7.6 Trip plans and the timeline (**PROPOSED** reading of "several trips on one timeline")

A plan is a list of trips on one date axis. A trip can be tied to another trip in the plan: it leaves no sooner than a number of days after the other one arrives or departs.

`POST /planner/plans/solve`

```json
{
  "trips": [
    { "key": "cargo", "search": { "from": "earth", "to": "mars", "trip": "one_way" } },
    { "key": "crew", "search": { "from": "earth", "to": "mars", "trip": "round_trip", "stay_days": 500 },
      "after": { "trip": "cargo", "event": "arrives", "gap_days": 60 } }
  ]
}
```

- Each `search` is a trip search request from 7.3. `after.event` is `arrives` or `departs`.
- The solver orders the trips by their ties, searches each in turn, and sets a tied trip's earliest departure to the other trip's date plus the gap. Each trip is chosen by its own objective.
- The response returns, per key, the chosen trip and its alternatives, plus the plan's first departure and last arrival, and a `problems` list. Problems are a tie that loops, a tie to a missing key, and a trip with no route after its tie within its date range.
- A chained itinerary is two trips where the second starts where the first ended and is tied to its arrival.
- The endpoint is stateless. The browser holds the plan for the session.

The timeline view (C8) lists the plan's trips, draws one bar per trip from departure to arrival on a shared date axis with any stay shaded, draws all routes in the scene together, and moves the app date when the axis is dragged. That needs a function that sets the app to an arbitrary date, which does not exist today; the agent's `set_date` action uses the same function.

### 7.7 Agent

`POST /planner/agent` takes the conversation so far, the current plan and a short app state (date, focused body, the eight switch states). The browser keeps all three; the backend stores nothing. It returns the reply, the trips or plan to show, a list of app actions, and the token usage.

**Tools the model gets**, all with strict schemas so arguments always match:

| Tool | Does |
|---|---|
| `find_place(query)` | The lookup of 7.2 |
| `search_trips(...)` | The search of 7.3, with plot data stripped to save tokens |
| `solve_plan(trips)` | The plan solve of 7.6 |
| `check_vehicle(trip_id, payload_mass_kg, stages)` | The check of 7.5 on a trip from this conversation |
| `focus_on(place_id, follow)` | Queues a camera move to a body |
| `set_date(date)` | Queues a change of the app date |
| `set_layer(layer, on)` | Queues a layer switch. `layer` is one of `orbits`, `labels`, `magnetic_field`, `realistic_scale`, `moons`, `asteroid_belt`, `kuiper_belt`, `earth_satellites`. |

The last three do not run on the backend. The backend checks their arguments against the place list, the supported date range and the layer list, tells the model the action is queued, and returns the actions in order. The frontend checks them again and applies them after it shows the reply. The model has no other tools: no web, no code execution, no file access, and no way to reach any other part of the app.

**How it is kept from inventing numbers**

1. The result card's numbers are drawn by the frontend straight from the trip object. The model only names which trip or plan to show.
2. The model's final answer is schema-constrained JSON: `kind` (answer or question), `text`, `show_trip_id`, `show_plan`, `options`.
3. The backend checks the `text`. Every number in it must match a value in this request's tool results after rounding, or be a count of ten or less. On a mismatch the model gets one corrective retry; if that fails the text is replaced by a sentence the backend builds from the trip.
4. When the planner returns `no_route` or `refused`, the reply must carry the planner's own message.

**Loop.** A hand-written loop, provider-neutral, in `backend/planner/agent/loop.py`: at most 6 model calls and 8 tool calls per prompt, a 2,000-character prompt limit, and a 30-second wall clock. `backend/planner/agent/provider_anthropic.py` is the only file that imports the Anthropic SDK and exposes one function. Adding OpenAI later means adding one sibling module.

Details taken from the Claude API reference and not yet exercised here **[A]**: tool choice is left on automatic, because Fable 5.2, Opus 5.5 and Sonnet 5.5 reject a forced choice; effort is pinned to `low`; a `refusal` or `max_tokens` stop returns a fixed message; the system prompt is fixed text with no date in it, so it can be cached.

**Estimated cost per prompt.** Prices are from the reference's table dated 2026-11-03. The token counts are assumed, about 15,000 input and 1,500 output over four model calls, and caching is not counted **[A]**. C12 replaces these with measured figures.

| Tier | Model id | Price per million tokens, in / out | Per prompt | Per 100 prompts |
|---|---|---|---:|---:|
| Haiku | `claude-haiku-5-5` | $0.10 / $0.50 | $0.002 | $0.23 |
| Sonnet | `claude-sonnet-5-5` | $2 / $10 | $0.045 | $4.50 |
| Opus | `claude-opus-5-5` | $4 / $20 | $0.09 | $9 |
| Fable | `claude-fable-5-2` | $8 / $40 | $0.18 | $18 |

### 7.8 Settings and security

- `PLANNER_AGENT_MODEL`: the model id. No default. Unset means the agent is off and `GET /planner/capabilities` says so, which the frontend uses to hide the prompt box.
- Credentials are resolved by the Anthropic SDK: `ANTHROPIC_API_KEY` or a profile from `ant auth login`.
- `PLANNER_AGENT_MAX_PROMPTS_PER_DAY`, **PROPOSED** default 200: a per-process counter, so a looping client cannot run up a bill.
- In the default local profile the agent endpoint is served on loopback like the rest. In the network profile it requires the same API key guard as the solar endpoints, and startup fails if the agent is enabled without one.
- The only untrusted text is the user's own prompt. The planning tools are read-only calculations and the three app actions are checked against fixed lists on both sides, so the worst a hostile prompt can do is waste spend, which the caps bound, or flip a layer.

### 7.9 Frontend

A new feature directory, `src/frontend/features/planner/`, holds the client, the panel, the result card, the timeline and the prompt box, composed under the rules of `docs/adr/0006-runtime-composition-and-retained-apis.md`. `src/frontend/app/routeRenderer.ts` keeps drawing Sun legs. Planet legs are drawn attached to the parent planet and use the same display offset the moons use, so a drawn Earth to Moon leg meets the drawn Moon at either scale.

## 8. Child issues in build order

| # | Issue | Delivers | Depends on | Size |
|---|---|---|---|---|
| P0 | Land `feat/restore-solar-system-layers` | Moons visible on `main`; the old panel, until C9 | Pull request #66 opened 2026-11-13; the owner merges | S |
| C1 | Trip contract and scheduler for Sun-orbiting bodies | `backend/planner/`, the place list for 41 bodies, `/planner/places`, `/planner/trips/search` one way, burns from orbits, labelled alternatives, the flyby flag | none | L |
| C2 | Round trips | Two chained searches with a stay | C1 | S |
| C3 | Moons | The backend reads `moons.json`; sourced masses for the 21 named moons; planet legs; moons at the end of a Sun leg | C1 | L |
| C4 | Named orbits | The orbit list, elliptical burns, the giant-planet default | C1, C3 | M |
| C5 | Vehicle check | `/planner/vehicle-check` | C1 | S |
| C6 | Trip plans | `/planner/plans/solve`: ties, ordering, problems | C1, C2 | M |
| C7 | New planner panel | The form, the result card, drawing of moon legs, replaces the five-button panel | P0, C1 to C5 | L |
| C8 | Timeline view | The trip list, the bars, all routes drawn together, the date axis, and the set-date function | C6, C7 | L |
| C9 | Remove the old planner | Six old endpoints, mining, risk, agent classes, `epo/`, old frontend client and fallback planner, and their tests | C7 | M |
| C10 | Agent backend | `/planner/agent`, the loop, the provider module, seven tools, the number check, caps, settings | C1 to C6 | L + S |
| C11 | Prompt box and app actions | Prompt input, conversation, the question buttons, reuse of the result card and timeline, applying the three actions | C7, C8, C10 | M + S |
| C12 | Tier comparison | The acceptance prompts, three runs each, on each tier: pass rate, latency and measured cost | C10, C11, owner's API key | S |

```
P0 ─────────────────────────────────────┐
C1 ─┬─> C2 ──> C6 ──────────────┐       │
    ├─> C3 ──> C4 ──────────────┤       ▼
    └─> C5 ─────────────────────┼─────> C7 ──┬─> C9
                                │            └─> C8   (needs C6 too)
                                └─> C10 ──> C11 ──> C12   (C11 needs C7 and C8 too)
```

**Why this order.** The contract comes first because everything else consumes it. Moons come before named orbits because the lunar orbits need the Moon. Trip plans come before the panel work so the timeline is built once against a finished contract. The new panel lands before the old planner is removed, so `main` always has a working planner. The agent comes after its tools exist, so its tests run against real tools. The tier comparison is last because its prompts touch moons, orbits, round trips, plans and app actions. C7 and C10 can run in parallel.

C12 spends real money and runs only on the owner's go with the owner's key. At the assumed token counts it costs about $8 for the eight confirmed prompts across four tiers, or about $12 if the five proposed prompts of section 9 are added **[A]**.

## 9. Definition of done

**Confirmed 2026-11-13**

1. Eight prompts each produce a plotted route with departure date, arrival date, flight time and delta-v, with no refusal: "Earth to Mars"; "to the Moon"; "Earth to Europa, cheapest launch in the next 10 years"; "low Earth orbit to low lunar orbit"; "low Earth orbit to the NRHO"; "Mars to Earth"; "Earth to Mars and back with a 30 day stay"; "Earth to Psyche". Checked in a headless browser.
2. Total trip delta-v is within 5% of an independent reference for Sun-orbiting trips and within 10% for moon and named-orbit trips. Each reference is cited in its test. The NRHO result is labelled approximate, and section 6 explains why it may miss on the arrival burn.
3. Every answer names the best launch window found in the date range asked for.
4. A test checks every number in an agent reply against the planner's output.
5. A planner call answers within 12 seconds and a whole prompt within 30. The ten-year search measured 3.0 s **[M]**; the prompt time is unmeasured and C12 reports it.
6. With no model configured, the manual form plans the same eight trips.
7. The Mission plan button and the mining code are gone, and the form's default values produce a plan.

**PROPOSED additions for the two capabilities chosen on 2026-11-13**

8. Two plan prompts each produce a timeline with every trip scheduled and the tie respected: "Send cargo to Mars, then crew 60 days after the cargo arrives"; "Earth to Mars, then on to Ceres 30 days after arriving". The manual form can build the same two plans.
9. Three app prompts each change the app as asked: "show me Europa" (the camera focuses Europa); "jump to the day we arrive" (the app date equals the shown trip's arrival date); "hide the asteroid belt" (the belt switch is off).

## 10. Testing plan

Counts are set when each child issue is filed.

| Issue | Unit | Integration | Browser |
|---|---|---|---|
| C1 | Scheduler passes, burns against hand calculations, place lookup including the Europa and Metis clashes | The endpoint on Mars, Venus, Jupiter; each refusal code | none |
| C2 | Stay handling, exact and ranged | Mars round trip | none |
| C3 | Moon loading (423), planet legs, straight-in arrival | Earth to Moon against a cited published figure; Earth to Europa against an independent calculation | none |
| C4 | Elliptical burns, default orbit per body class | Low Earth orbit to geostationary, to low lunar orbit, to the NRHO | none |
| C5 | Pass-through of the existing vehicle tests | The endpoint | none |
| C6 | Tie ordering, loop and missing-key problems, a tie that cannot be met | The two plan prompts of check 8 as requests | none |
| C7 | Panel controller, result card | none | The eight trips from the form; disposal; offline state |
| C8 | Timeline model, the set-date function | none | The two plans from the form; dragging the axis moves the app date |
| C9 | none | Old endpoints return 404 | The old panel is gone |
| C10 | Number check, caps, each stop reason, argument checks for the three actions, with a scripted fake provider | The loop end to end on recorded tool calls. No live model runs in CI. | none |
| C11 | Prompt box controller, the action applier and its refusal of unknown actions | none | A scripted conversation, the question buttons, each of the three actions, and the hidden box when no model is set |
| C12 | none | none | The live comparison, run by hand |

Each test states its card in the child issue: what it protects, the wrong result it rejects, and what a green run does not prove.

## 11. Rules for the implementing agent

1. The acceptance criteria are the protect, reject and no-claim profile of each test, never "make the tests pass".
2. Real code and real tests land in the same change. A placeholder, a stub assertion or a test deferred to a follow-up is not done.
3. Any change to a test, validator, CI step, timeout, tolerance, threshold, snapshot or suppression is reported on its own line with its reason, before any other result.
4. A reported command names the command and its observed result. A command that was not run is not reported, and stderr is never silenced in a cited command.
5. A report is a claim until the parent re-runs it: say what was verified, what was reused and what could not be checked.
6. Browsers run headless only. On this machine a headed browser opens on the owner's desktop.

## 12. Rollback

Each child issue is one pull request and is undone by reverting it. Nothing migrates data. C9 is the only step that deletes working code; reverting it restores the old planner files and endpoints. Turning the agent off needs no revert: unset `PLANNER_AGENT_MODEL`.

## 13. Effort

About 16.5 days of agent working time: C1 2, C2 0.5, C3 2, C4 1, C5 0.5, C6 1, C7 2, C8 2, C9 1, C10 2.5, C11 1.5, C12 0.5. The timeline and app control added 4 days to revision 1's 12.5. A human team would need roughly seven to eight weeks.

## 14. Files

| Path | Change |
|---|---|
| `backend/planner/` | New package: places, orbits, transfers, scheduler, plans, contract, vehicle, `agent/loop.py`, `agent/provider_anthropic.py` |
| `backend/server.py` | New `/planner/*` routes (C1, C5, C6, C10); the six old routes removed (C9) |
| `backend/data/moon_gm.json` | New: sourced masses for the 21 named moons (C3) |
| `backend/requirements.txt` | Add `anthropic` (C10) |
| `src/data/moons.json` | Unchanged; now also read by the backend (C3) |
| `backend/trajectory/lambert.py`, `mga.py`, `budget.py`, `contracts.py`, `planner.py` | Kept. `contracts.py:125` stops being the moon gate once the new package owns place validation. |
| `backend/mission/ephemeris_service.py`, `orbital.py`, `propulsion.py`, `vehicle_service.py` | Kept |
| `backend/mission/agents.py`, `mining_service.py`, `risk_service.py`, `explainability.py`, `schemas.py`, `epo/` | Removed (C9), with their tests |
| `src/frontend/features/planner/` | New: client, panel, result card (C7), timeline (C8), prompt box and action applier (C11) |
| `src/frontend/app/routeRenderer.ts` | Extended to draw planet legs and several routes at once (C7, C8) |
| `src/main.ts` | Composition calls; a set-date function beside `focusBody` (C8) |
| `src/frontend/app/plannerController.ts`, `src/frontend/features/trajectory/` | Removed (C9), with their tests |
| `index.html`, `README.md`, `docs/adr/0006-...md` | Planner section and scope text (C7, C8, C11) |

C9's issue must list every deleted test with the behaviour it covered and where that behaviour is tested afterwards, or why it is gone.

## 15. Related

- `feat/restore-solar-system-layers`: the planner panel, visible moons and Moon quick views (P0).
- `test/headless-hardware-webgl` (faa3730, local): runs the browser suites on the GPU with no window.
- `lab/measurements`: the measurement scripts behind this spec's figures, and a headless-GPU launcher for later measurements.
- `agent-notes/MAIN_JS_REMOVAL_REPORT_04e99a4_2026-11-08.md` on the restore branch: how the planner panel was lost and restored.

## 16. Evidence

All runs used the backend code of the restore branch, which matches `origin/main` for every planner file, in a Python 3.12 environment built from `backend/requirements.txt`, on a quiet machine.

| Script, in `measurements/2026-11-12-planner-capabilities/` on `lab/measurements` | Shows |
|---|---|
| `bench_planner.py` | Scan speed, the 2,000-point cap, one fixed-date route, the default Mission plan verdict |
| `capability_evidence.py` | Date range, the ten-year Mars search, direct trips, the flyby search, the scan's trade-off list, the vehicle check, name clashes, and the scratch model of section H |
| `inner_outer_planets.py` | Mercury and Venus at a 5-day step; Uranus, Neptune and Pluto at the ten-year cap |

The captured output of all three is `2026-11-12-planner-rework-agent-epic-draft-evidence/output.txt`, beside this spec.

Not checked: any figure marked **[A]**, the accuracy of the existing solver against an outside reference, agent latency, and real token counts.
