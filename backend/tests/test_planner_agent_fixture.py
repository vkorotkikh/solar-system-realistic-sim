"""The frontend's agent-reply fixture has the shape the agent produces today (epic issue C11).

src/frontend/features/planner/agentReplies.fixture.json feeds the prompt box's
unit tests and its browser test. It is written by this file from real planner
runs behind a scripted stand-in model:

    PLANNER_FIXTURE_WRITE=1 python -m pytest backend/tests/test_planner_agent_fixture.py

Without that variable the test compares shapes, not values: the same keys with
the same kinds of value. A renamed or dropped field fails here, before the
frontend reads it; a number that moves in its last digit does not.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from planner.agent.loop import ModelReply
from test_planner_agent import MARS, Script, answer, calls, cheapest_answer, prompt, results, run, tool

FIXTURE = Path(__file__).resolve().parents[2] / "src/frontend/features/planner/agentReplies.fixture.json"
CREW = {**MARS, "latest_departure": "2029-12-31"}
PLAN = {"trips": [{"key": "cargo", "search": MARS},
                  {"key": "crew", "search": CREW, "after": {"trip": "cargo", "event": "arrives", "gap_days": 60}}]}


def _first_trip(text: str):
    return lambda turns: answer(text, trip=results(turns)[0]["trips"][0]["id"])


def _europa_question(turns) -> ModelReply:
    return answer("Which Europa do you mean?", kind="question",
                  options=[match["name"] for match in results(turns)[0]["matches"]])


def build() -> dict:
    replies = {
        "mars": run(Script(tool("search_trips", **MARS), cheapest_answer)),
        "marsRoundTrip": run(Script(
            tool("search_trips", **{**MARS, "trip": "round_trip", "stay_days": 30}),
            _first_trip("Earth to Mars and back with a 30 day stay."))),
        "moon": run(Script(
            tool("search_trips", **{**MARS, "to": "moon-earth-moon"}),
            _first_trip("Low Earth orbit to low lunar orbit."))),
        "plan": run(Script(tool("solve_plan", **PLAN),
                           answer("The crew leaves 60 days after the cargo arrives.", plan=True))),
        "question": run(Script(tool("find_place", query="Europa"), _europa_question), prompt("Earth to Europa")),
        "actions": run(Script(
            calls(("focus_on", {"place_id": "moon-jupiter-europa", "follow": True}),
                  ("set_date", {"date": "2027-09-08"}),
                  ("set_layer", {"layer": "asteroid_belt", "on": False})),
            answer("Europa is in view on 2027-09-08, with the asteroid belt hidden."))),
    }
    return json.loads(json.dumps(replies))


def _shape(value):
    if isinstance(value, dict):
        return {key: _shape(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_shape(value[0])] if value else []
    return "number" if isinstance(value, (int, float)) and not isinstance(value, bool) else type(value).__name__


def test_the_frontend_fixture_has_the_shape_the_agent_produces() -> None:
    built = build()
    if os.environ.get("PLANNER_FIXTURE_WRITE"):
        FIXTURE.write_text(json.dumps(built, indent=1) + "\n")
    assert _shape(json.loads(FIXTURE.read_text())) == _shape(built)
