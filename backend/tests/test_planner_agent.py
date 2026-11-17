"""Planner agent (epic issue C10): the loop, its tools, the number check and the provider call.

No live model runs here. A scripted stand-in returns what a model would: tool
calls, then a JSON answer. The tools run for real, so every trip and plan is
the planner's own output. The provider test sends nothing over the network:
it checks the request built for the Anthropic SDK and parses SDK response
objects.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import date
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from anthropic.types.beta import BetaMessage
from pydantic import ValidationError

from planner.agent import provider_anthropic
from planner.agent.loop import (ANSWER_SCHEMA, MAX_MODEL_CALLS, MAX_TOOL_CALLS, STOP_TEXT, TOOL_LIMIT_NOTE,
                                AgentRequest, AssistantText, DailyLimit, ModelReply, ProviderError, ToolCall,
                                ToolResults, UserText, run_agent, unmatched_numbers)
from planner.agent.tools import TOOLS, Toolbox
from planner.trips import TripSearchRequest, search_trips
from planner.vehicle import VehicleCheckRequest, check_vehicle
from trajectory.budget import PlanningCancelled

TODAY = date(2026, 11, 12)
MARS = {"from": "earth", "to": "mars", "trip": "one_way", "objective": "min_delta_v", "flybys": 0,
        "earliest_departure": "2026-11-12", "latest_departure": "2027-01-31"}
STAGES = [{"name": "main", "dry_mass_kg": 6_500.0, "propellant_mass_kg": 18_000.0, "isp_s": 360.0}]


class Script:
    """A stand-in model: each step is a reply, or a function of the turns so far that returns one."""

    def __init__(self, *steps) -> None:
        self.steps = list(steps)
        self.calls: list[dict] = []

    def __call__(self, **call) -> ModelReply:
        self.calls.append(call)
        step = self.steps.pop(0)
        return step(call["turns"]) if callable(step) else step


def calls(*pairs: tuple[str, dict]) -> ModelReply:
    return ModelReply("tool_use", tool_calls=tuple(ToolCall(f"call-{index}", name, arguments)
                                                   for index, (name, arguments) in enumerate(pairs)),
                      usage={"input_tokens": 1_000, "output_tokens": 50}, model="test-model")


def tool(name: str, **arguments) -> ModelReply:
    return calls((name, arguments))


def answer(text: str, *, kind: str = "answer", trip: str = "", plan: bool = False, options=()) -> ModelReply:
    return ModelReply("end_turn", text=json.dumps({"kind": kind, "text": text, "show_trip_id": trip,
                                                   "show_plan": plan, "options": list(options)}),
                      usage={"input_tokens": 1_200, "output_tokens": 80}, model="test-model")


def results(turns) -> list[dict]:
    """The tool results the model was sent most recently."""
    last = next(turn for turn in reversed(turns) if isinstance(turn, ToolResults))
    return [json.loads(content) for _, content, _ in last.results]


def cheapest_answer(turns) -> ModelReply:
    """The answer a model keeping to the rules gives about the last search's cheapest trip."""
    trip = results(turns)[0]["trips"][0]
    leg = trip["legs"][0]
    return answer(f"Earth to Mars, one way, low Earth orbit to low Mars orbit, cheapest: leave "
                  f"{leg['depart']['date']}, arrive {leg['arrive']['date']}, {trip['total_days']:.0f} days, "
                  f"{trip['total_delta_v_km_s']:.2f} km/s in burns.", trip=trip["id"])


def prompt(text: str = "Earth to Mars", **extra) -> AgentRequest:
    return AgentRequest.model_validate({"messages": [{"role": "user", "text": text}], **extra})


def run(script, request: AgentRequest | None = None, **options) -> dict:
    return run_agent(request or prompt(), model="test-model", provider=script, today=TODAY, **options)


def toolbox() -> Toolbox:
    return Toolbox(deadline=time.monotonic() + 30.0, cancel=threading.Event(), today=TODAY)


# The loop.

def test_a_trip_prompt_runs_the_planner_and_shows_its_trip() -> None:
    script = Script(tool("find_place", query="Mars"), tool("search_trips", **MARS), cheapest_answer)
    reply = run(script)
    assert (reply["status"], reply["check"]) == ("ok", {"result": "passed", "problems": []})
    shown = reply["show"]
    assert (shown["kind"], shown["trip_id"], shown["request"]["to"]) == ("trip", "s1-t1", "mars")
    # The card's numbers are the planner's: the same search run directly gives the same trip.
    direct = search_trips(TripSearchRequest.model_validate(MARS), today=TODAY)["trips"][0]
    assert {**shown["trip"], "id": "t1"} == direct
    assert reply["reply"]["text"].startswith("Earth to Mars") and reply["actions"] == []
    usage = reply["usage"]
    assert (usage["model_calls"], usage["tool_calls"], usage["input_tokens"]) == (3, 2, 3_200)
    assert usage["models"] == ["test-model"]
    first = script.calls[0]
    assert first["model"] == "test-model" and first["tools"] == TOOLS and 0 < first["timeout_s"] <= 30
    assert "Today: 2026-11-12" in first["turns"][-1].text
    assert first["turns"][-1].text.endswith("The user's prompt:\nEarth to Mars")


def test_an_invented_number_gets_one_corrective_retry() -> None:
    invented = lambda turns: answer("Leave soon; it costs 77.77 km/s.", trip="s1-t1")  # noqa: E731
    script = Script(tool("search_trips", **MARS), invented, cheapest_answer)
    reply = run(script)
    assert reply["check"]["result"] == "corrected"
    [problem] = reply["check"]["problems"]
    assert "words: 77.77." in problem
    correction = script.calls[2]["turns"][-1]
    assert isinstance(correction, UserText) and "77.77" in correction.text
    assert reply["reply"]["text"].startswith("Earth to Mars")


def test_a_second_failure_is_replaced_by_a_sentence_built_from_the_trip() -> None:
    invented = answer("It costs 77.77 km/s.", trip="s1-t1")
    reply = run(Script(tool("search_trips", **MARS), invented, invented))
    assert reply["check"]["result"] == "replaced" and len(reply["check"]["problems"]) == 2
    trip, text = reply["show"]["trip"], reply["reply"]["text"]
    assert trip["legs"][0]["depart"]["date"] in text and f"{trip['total_delta_v_km_s']:.2f} km/s" in text
    assert "77.77" not in text
    assert unmatched_numbers(text, [trip]) == []  # the replacement passes the same check


def test_an_answer_that_is_not_json_is_retried_then_replaced() -> None:
    reply = run(Script(ModelReply("end_turn", text="Mars is far."), ModelReply("end_turn", text="{")))
    assert reply["check"] == {"result": "replaced", "problems": ["It is not valid JSON.", "It is not valid JSON."]}
    assert reply["show"] is None and "could not check" in reply["reply"]["text"]


def test_showing_a_trip_that_was_never_found_is_corrected() -> None:
    script = Script(tool("search_trips", **MARS), answer("Here it is.", trip="s9-t1"), cheapest_answer)
    reply = run(script)
    assert reply["check"]["result"] == "corrected" and "'s9-t1'" in reply["check"]["problems"][0]
    assert reply["show"]["trip_id"] == "s1-t1"


def test_an_unclear_place_becomes_a_question_with_the_matches_as_options() -> None:
    def ask(turns):
        return answer("Which Europa do you mean?", kind="Question",  # the API may change an enum value's case
                      options=[match["name"] for match in results(turns)[0]["matches"]])
    reply = run(Script(tool("find_place", query="Europa"), ask), prompt("Earth to Europa"))
    assert reply["check"]["result"] == "passed"  # the 52 in "Europa (52)" comes from the lookup
    assert reply["reply"] == {"kind": "question", "text": "Which Europa do you mean?",
                              "options": ["Europa (52)", "Europa"]}


def test_a_refusal_reaches_the_user_in_the_planners_words() -> None:
    script = Script(tool("search_trips", **{**MARS, "to": "vulcan"}), answer("I could not plan that trip."))
    reply = run(script)
    message = results(script.calls[1]["turns"])[0]["message"]
    assert message.startswith("No place is called 'vulcan'")
    assert reply["reply"]["text"] == f"I could not plan that trip. {message}"


def test_a_plan_is_solved_and_shown_with_its_trips_named_by_key() -> None:
    plan = {"trips": [{"key": "cargo", "search": MARS},
                      {"key": "crew", "search": {**MARS, "latest_departure": "2029-12-31"},
                       "after": {"trip": "cargo", "event": "arrives", "gap_days": 60}}]}
    reply = run(Script(tool("solve_plan", **plan), answer("The crew leaves after the cargo arrives.", plan=True)))
    shown = reply["show"]
    assert shown["kind"] == "plan" and shown["request"]["trips"][1]["after"]["gap_days"] == 60
    crew = shown["plan"]["trips"]["crew"]
    assert crew["status"] == "ok" and crew["chosen"]["id"] == "p1-crew-t1"


def test_earlier_turns_reach_the_model_but_only_the_users_numbers_count_as_sources() -> None:
    request = AgentRequest.model_validate({
        "messages": [{"role": "user", "text": "Earth to Mars with a 30 day stay"},
                     {"role": "assistant", "text": "Leave 2026-11-20."},
                     {"role": "user", "text": "When do we leave?"}],
        "app": {"date": "2027-01-01", "focused": "mars", "layers": {"moons": True, "asteroid_belt": False}},
    })
    script = Script(answer("You leave on 2026-11-20, for a 30 day stay."), answer("I will search that trip again."))
    reply = run(script, request)
    # 30 is the user's own number; the earlier answer's date must be searched again before it is quoted.
    [problem] = reply["check"]["problems"]
    assert "words: 2026-11-20." in problem
    turns = script.calls[0]["turns"]
    assert [type(turn) for turn in turns] == [UserText, AssistantText, UserText]
    assert "Date shown in the app: 2027-01-01" in turns[-1].text and "asteroid_belt off" in turns[-1].text


@pytest.mark.parametrize("stop", ["refusal", "max_tokens", "pause_turn"])
def test_a_stop_without_an_answer_returns_a_fixed_message_and_no_actions(stop) -> None:
    reply = run(Script(tool("set_layer", layer="moons", on=False), ModelReply(stop)))
    code = stop if stop in STOP_TEXT else "unexpected_stop"
    assert (reply["status"], reply["code"], reply["reply"]["text"]) == ("stopped", code, STOP_TEXT[code])
    assert (reply["actions"], reply["show"]) == ([], None)


def test_a_model_that_never_answers_stops_after_six_calls() -> None:
    script = Script(*[tool("find_place", query="Mars")] * MAX_MODEL_CALLS)
    reply = run(script)
    assert (reply["status"], reply["code"], reply["usage"]["model_calls"]) == ("stopped", "limit", MAX_MODEL_CALLS)


def test_tool_calls_past_the_cap_are_refused_not_run() -> None:
    script = Script(calls(*[("set_layer", {"layer": "orbits", "on": True})] * (MAX_TOOL_CALLS + 1)),
                    answer("The orbits are on."))
    reply = run(script)
    sent = script.calls[1]["turns"][-1].results
    assert [is_error for _, _, is_error in sent] == [False] * MAX_TOOL_CALLS + [True]
    assert json.loads(sent[-1][1]) == {"error": TOOL_LIMIT_NOTE}
    assert len(reply["actions"]) == reply["usage"]["tool_calls"] == MAX_TOOL_CALLS


def test_no_model_call_starts_without_time_left() -> None:
    script = Script()
    reply = run(script, seconds=1.0)
    assert (reply["status"], reply["code"], script.calls) == ("stopped", "limit", [])


def test_a_cancelled_prompt_stops_before_the_next_model_call() -> None:
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(PlanningCancelled):
        run(Script(), cancel_event=cancel)


def test_actions_come_back_in_the_order_queued() -> None:
    script = Script(calls(("focus_on", {"place_id": "mars", "follow": True}),
                          ("set_layer", {"layer": "asteroid_belt", "on": False})),
                    tool("set_date", date="2027-09-08"),
                    answer("Mars is in view on 2027-09-08, with the asteroid belt hidden."))
    reply = run(script)
    assert reply["check"]["result"] == "passed"  # the date is in the queued action's result
    assert reply["actions"] == [{"type": "focus_on", "place_id": "mars", "follow": True},
                                {"type": "set_layer", "layer": "asteroid_belt", "on": False},
                                {"type": "set_date", "date": "2027-09-08"}]


# The tools.

@pytest.mark.parametrize(("name", "arguments", "action"), [
    ("focus_on", {"place_id": "moon-jupiter-europa", "follow": True},
     {"type": "focus_on", "place_id": "moon-jupiter-europa", "follow": True}),
    ("focus_on", {"place_id": "leo", "follow": False},  # a named orbit is shown as its body
     {"type": "focus_on", "place_id": "earth", "follow": False}),
    ("set_date", {"date": "2027-09-08"}, {"type": "set_date", "date": "2027-09-08"}),
    ("set_layer", {"layer": "Asteroid_Belt", "on": False}, {"type": "set_layer", "layer": "asteroid_belt", "on": False}),
])
def test_app_actions_are_checked_and_queued(name, arguments, action) -> None:
    box = toolbox()
    content, is_error = box.run(name, arguments)
    assert not is_error and box.actions == [action] and json.loads(content)["queued"] == action


@pytest.mark.parametrize(("name", "arguments", "message"), [
    ("focus_on", {"place_id": "vulcan", "follow": True}, "No place has the id 'vulcan'"),
    ("focus_on", {"place_id": "mars", "follow": "yes"}, "follow must be true or false"),
    ("set_date", {"date": "2050-01-02"}, "from 1990-01-01 to 2050-01-01"),
    ("set_date", {"date": "20270908"}, "YYYY-MM-DD"),
    ("set_date", {"date": "2027-02-30"}, "YYYY-MM-DD"),
    ("set_layer", {"layer": "sun", "on": True}, "layer must be one of"),
    ("search_trips", {**MARS, "flybys": 5}, "flybys"),
    ("check_vehicle", {"trip_id": "s1-t1", "payload_mass_kg": 1.0, "stages": STAGES}, "No trip has the id 's1-t1'"),
    ("launch", {}, "There is no tool called 'launch'"),
])
def test_bad_tool_arguments_are_errors_the_model_can_correct(name, arguments, message) -> None:
    box = toolbox()
    content, is_error = box.run(name, arguments)
    assert is_error and message in json.loads(content)["error"] and box.actions == []


def test_the_vehicle_check_uses_the_burns_of_a_found_trip() -> None:
    box = toolbox()
    box.run("search_trips", MARS)
    content, is_error = box.run("check_vehicle", {"trip_id": "s1-t1", "payload_mass_kg": 6_500.0, "stages": STAGES})
    burns = [burn["delta_v_km_s"] for burn in box.trips["s1-t1"]["trip"]["legs"][0]["burns"]]
    expected = check_vehicle(VehicleCheckRequest.model_validate(
        {"burns_km_s": burns, "payload_mass_kg": 6_500.0, "stages": STAGES}))
    assert not is_error and len(burns) == 2
    assert json.loads(content) == {"trip_id": "s1-t1", "burns_km_s": burns, **json.loads(json.dumps(expected))}


def test_a_search_with_no_time_left_is_refused() -> None:
    box = Toolbox(deadline=time.monotonic() + 5.0, cancel=threading.Event(), today=TODAY)  # inside the answer reserve
    content, is_error = box.run("search_trips", MARS)
    assert is_error and "No time is left" in json.loads(content)["error"] and box.trips == {}


# The number check.

@pytest.mark.parametrize(("text", "unmatched"), [
    ("Burns of 3.71 and 2.04 km/s, 5.76 in all.", []),
    ("About 5.8 km/s in about 300 days.", []),  # roundings
    ("5.7 km/s", ["5.7"]),  # a truncation is not a rounding
    ("299 days", ["299"]),
    ("Leave 2026-11-12.", []),
    ("Leave 2026-11-13.", ["2026-11-13"]),
    ("Two trips, 3 burns and 10 options.", []),  # counts of ten or less
    ("13 options", ["13"]),
    ("An orbit 42,164 km from the centre.", []),  # numbers inside the planner's text count
    ("Trips t1 and s2-t3.", []),  # ids are not numbers
])
def test_the_number_check(text, unmatched) -> None:
    sources = [{"total_delta_v_km_s": 5.76, "burns": [3.71, 2.04], "date": "2026-11-12", "total_days": 300.0,
                "name": "Geostationary orbit, 42,164 km from Earth's centre"}]
    assert unmatched_numbers(text, sources) == unmatched


# The request.

@pytest.mark.parametrize("messages", [
    [{"role": "assistant", "text": "Hello."}, {"role": "user", "text": "Mars"}],
    [{"role": "user", "text": "Mars"}, {"role": "assistant", "text": "Which Mars?"}],
    [{"role": "user", "text": "x" * 2_001}],
])
def test_a_conversation_runs_from_user_to_user_with_short_prompts(messages) -> None:
    with pytest.raises(ValidationError):
        AgentRequest.model_validate({"messages": messages})


def test_the_daily_limit_restarts_each_utc_day() -> None:
    limit = DailyLimit(1)
    assert [limit.take(date(2026, 11, 12)), limit.take(date(2026, 11, 12)), limit.take(date(2026, 11, 13))] \
        == [True, False, True]


# The Anthropic provider.

def _schemas(schema: dict):
    yield schema
    yield from (node for child in [*schema.get("properties", {}).values(), *filter(None, [schema.get("items")])]
                for node in _schemas(child))


def test_the_strict_schemas_stay_inside_the_apis_limits() -> None:
    # Strict tools and JSON outputs (structured-outputs docs, 2026-11): every object closed, no numeric or
    # length limits, at most 20 strict tools, 24 optional parameters and 16 union-typed parameters in all.
    nodes = [node for root in [*(tool.input_schema for tool in TOOLS), ANSWER_SCHEMA] for node in _schemas(root)]
    objects = [node for node in nodes if node.get("type") == "object"]
    assert all(node["additionalProperties"] is False and set(node["required"]) <= set(node["properties"])
               for node in objects)
    assert not [key for node in nodes for key in ("minimum", "maximum", "minLength", "maxLength", "multipleOf",
                                                 "anyOf", "oneOf") if key in node]
    assert not [node for node in nodes if isinstance(node.get("type"), list)]
    assert len(TOOLS) <= 20 and sum(len(node["properties"]) - len(node["required"]) for node in objects) <= 24


class FakeClient:
    """Records the request and returns a canned SDK message, or raises an SDK error."""

    def __init__(self, outcome) -> None:
        self.outcome, self.request, self.options = outcome, None, None
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def with_options(self, **options):
        self.options = options
        return self

    def _create(self, **request):
        self.request = request
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def test_the_provider_sends_strict_tools_and_the_answer_schema_and_parses_tool_calls() -> None:
    earlier = ModelReply("tool_use", replay=[{"type": "thinking", "thinking": "", "signature": "sig-1"},
                                             {"type": "tool_use", "id": "toolu_1", "name": "find_place",
                                              "input": {"query": "mars"}}])
    turns = (UserText("Earth to Mars"), AssistantText("Which Mars?"), UserText("The planet"), earlier,
             ToolResults((("toolu_1", '{"matches":[]}', False),)))
    response = BetaMessage.model_validate({
        "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-test", "stop_reason": "tool_use",
        "stop_sequence": None, "usage": {"input_tokens": 120, "output_tokens": 30, "cache_read_input_tokens": 100},
        "content": [{"type": "thinking", "thinking": "", "signature": "sig-2"}, {"type": "text", "text": "Searching."},
                    {"type": "tool_use", "id": "toolu_2", "name": "search_trips", "input": {"to": "mars"}}]})
    fake = FakeClient(response)
    reply = provider_anthropic.call_model(model="claude-test", system="SYSTEM", tools=TOOLS, answer_schema={"x": 1},
                                          turns=turns, timeout_s=12.5, client=fake)
    request = fake.request
    assert fake.options == {"timeout": 12.5}
    assert (request["model"], request["system"], request["fallbacks"]) == ("claude-test", "SYSTEM", "default")
    assert request["betas"] == ["server-side-fallback-2026-07-01"]
    assert request["output_config"] == {"effort": "low", "format": {"type": "json_schema", "schema": {"x": 1}}}
    assert request["cache_control"] == {"type": "ephemeral"} and "tool_choice" not in request
    assert [(sent["name"], sent["strict"], sent["input_schema"]) for sent in request["tools"]] \
        == [(spec.name, True, spec.input_schema) for spec in TOOLS]
    assert request["messages"] == [
        {"role": "user", "content": "Earth to Mars"},
        {"role": "assistant", "content": "Which Mars?"},
        {"role": "user", "content": "The planet"},
        {"role": "assistant", "content": earlier.replay},  # thinking blocks go back unchanged
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": '{"matches":[]}',
                                      "is_error": False}]},
    ]
    assert (reply.stop, reply.text, reply.model) == ("tool_use", "Searching.", "claude-test")
    assert reply.tool_calls == (ToolCall("toolu_2", "search_trips", {"to": "mars"}),)
    assert reply.usage == {"input_tokens": 120, "output_tokens": 30, "cache_read_input_tokens": 100,
                           "cache_creation_input_tokens": 0}
    assert reply.replay == [block.to_dict() for block in response.content]


_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _status(error_class, status: int):
    return error_class("failed", response=httpx2.Response(status, request=_REQUEST), body=None)


@pytest.mark.parametrize(("error", "code", "retryable"), [
    (anthropic.APITimeoutError(request=_REQUEST), "model_unreachable", True),
    (_status(anthropic.RateLimitError, 429), "model_rate_limited", True),
    (_status(anthropic.AuthenticationError, 401), "model_credentials", False),
    (_status(anthropic.InternalServerError, 529), "model_error", True),
    (_status(anthropic.BadRequestError, 400), "model_error", False),
])
def test_provider_errors_become_provider_neutral_errors(error, code, retryable) -> None:
    with pytest.raises(ProviderError) as raised:
        provider_anthropic.call_model(model="m", system="s", tools=TOOLS, answer_schema={}, turns=(UserText("hi"),),
                                      timeout_s=5.0, client=FakeClient(error))
    assert (raised.value.code, raised.value.retryable) == (code, retryable)
