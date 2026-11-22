"""Planner agent (epic issue C10): the loop, its tools, the number check, the endpoint and the provider call.

No live model runs here. A scripted stand-in returns what a model would: tool
calls, then a JSON answer. The tools run for real, so every trip and plan is
the planner's own output. The provider test sends nothing over the network:
it checks the request built for the Anthropic SDK and parses SDK response
objects.
"""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import date
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from anthropic.lib.credentials import WorkloadIdentityError
from anthropic.types.beta import BetaMessage
from fastapi.testclient import TestClient
from pydantic import ValidationError

import server
from planner.agent import provider_anthropic
from planner.agent import tools as agent_tools
from planner.agent.loop import (ANSWER_SCHEMA, MAX_MODEL_CALLS, MAX_TOOL_CALLS, STOP_TEXT, TOOL_LIMIT_NOTE,
                                AgentRequest, AssistantText, DailyLimit, ModelReply, ProviderError, ToolCall,
                                ToolResults, UserText, run_agent, unmatched_numbers)
from planner.agent.tools import ANSWER_RESERVE_S, TOOLS, Toolbox
from planner.trips import TripSearchRequest, search_trips
from planner.vehicle import VehicleCheckRequest, check_vehicle
from trajectory.budget import PlanningCancelled

TODAY = date(2026, 11, 12)
MARS = {"from": "earth", "to": "mars", "trip": "one_way", "objective": "min_delta_v", "flybys": 0,
        "earliest_departure": "2026-11-12", "latest_departure": "2027-01-31"}
STAGES = [{"name": "main", "dry_mass_kg": 6_500.0, "propellant_mass_kg": 18_000.0, "isp_s": 360.0}]
# The app's own backend: a direct loopback client, as the local profile requires for the agent.
client = TestClient(server.app, base_url="http://localhost", headers={"host": "localhost:8042"},
                    client=("127.0.0.1", 32123), raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _fresh_middleware_stack(monkeypatch) -> None:
    # Keep these requests out of the suite-wide trajectory rate-limit window.
    monkeypatch.setattr(server.app, "middleware_stack", None)


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



def test_showing_a_trip_and_the_plan_together_is_corrected() -> None:
    reply = run(Script(tool("search_trips", **MARS), answer("Here it is.", trip="s1-t1", plan=True), cheapest_answer))
    assert reply["check"] == {"result": "corrected", "problems": ["Show either one trip or the plan, not both."]}


def test_showing_a_plan_that_was_never_solved_is_corrected() -> None:
    reply = run(Script(answer("Here is the plan.", plan=True), answer("No plan has been solved yet.")))
    assert reply["check"]["problems"] == ["No plan was solved in this prompt, so there is no plan to show."]
    assert reply["show"] is None


def test_a_plan_answer_that_fails_twice_is_replaced_by_the_plans_own_dates() -> None:
    invented = answer("It all costs 77.77 km/s.", plan=True)
    reply = run(Script(tool("solve_plan", trips=[{"key": "cargo", "search": MARS}]), invented, invented))
    plan = reply["show"]["plan"]
    assert reply["check"]["result"] == "replaced"
    assert reply["reply"]["text"] == (f"The plan's first trip leaves {plan['first_departure']['date']} and its "
                                      f"last trip arrives {plan['last_arrival']['date']}.")


def test_an_answer_rejected_on_the_last_model_call_is_replaced_at_once() -> None:
    script = Script(*[tool("find_place", query="Mars")] * (MAX_MODEL_CALLS - 1), answer("It costs 77.77 km/s."))
    reply = run(script)
    assert (reply["check"]["result"], len(reply["check"]["problems"]), reply["usage"]["model_calls"]) == (
        "replaced", 1, MAX_MODEL_CALLS)


def test_a_tool_use_stop_with_no_tool_calls_is_an_unexpected_stop() -> None:
    reply = run(Script(ModelReply("tool_use")))
    assert (reply["status"], reply["code"]) == ("stopped", "unexpected_stop")


def test_the_current_plan_reaches_the_model_and_its_numbers_count_as_sources() -> None:
    request = prompt("When does the crew leave?", plan={"trips": [
        {"key": "cargo", "search": {"to": "mars"}},
        {"key": "crew", "search": {"to": "mars"}, "after": {"trip": "cargo", "event": "arrives", "gap_days": 45}}]})
    script = Script(answer("The crew leaves 45 days after the cargo arrives."))
    reply = run(script, request)
    assert reply["check"]["result"] == "passed"  # 45 is in the plan the browser sent
    assert '"gap_days":45.0' in script.calls[0]["turns"][-1].text


@pytest.mark.parametrize("extra", [
    {"app": {"layers": {"comets": True}}},  # not one of the eight switches
    {"app": {"focused": "x" * 65}},
    {"messages": [{"role": "user", "text": "Hi"}, {"role": "assistant", "text": "Hello."}] * 20
     + [{"role": "user", "text": "Earth to Mars"}]},  # 41 messages
])
def test_requests_outside_the_contract_are_rejected(extra) -> None:
    with pytest.raises(ValidationError):
        AgentRequest.model_validate({"messages": [{"role": "user", "text": "Earth to Mars"}], **extra})


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


def test_an_agent_search_holds_a_shared_search_slot_while_it_runs(monkeypatch) -> None:
    slots, seen = threading.BoundedSemaphore(1), []

    def search(_request, **_options) -> dict:
        seen.append(slots.acquire(blocking=False))  # False: this search holds the only slot
        return {"status": "refused", "code": "no_route", "message": "No route."}
    monkeypatch.setattr(agent_tools, "search_trips", search)
    box = Toolbox(deadline=time.monotonic() + 30.0, cancel=threading.Event(), today=TODAY, search_slots=slots)
    box.run("search_trips", MARS)
    assert seen == [False] and slots.acquire(blocking=False)  # held during the search, free after it


def test_an_agent_search_gives_up_when_the_search_slots_stay_busy() -> None:
    slots = threading.BoundedSemaphore(1)
    assert slots.acquire(blocking=False)  # an HTTP search holds the only slot
    box = Toolbox(deadline=time.monotonic() + ANSWER_RESERVE_S + 1.5, cancel=threading.Event(), today=TODAY,
                  search_slots=slots)
    text, is_error = box.run("search_trips", MARS)
    assert is_error and "busy" in json.loads(text)["error"]


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
    ("It takes 12 days.", ["12"]),  # the day of a source date is not a number to quote
    ("11 options", ["11"]),  # nor is its month
    ("The 2026 launch window.", []),  # its year is
    ("8 km/s", ["8"]),  # a small number with a unit is a quantity, not a count
    ("9 days", ["9"]),
    ("8 trips", []),  # without a unit it is a count
    ("About 2 days late.", []),  # a quantity that a source rounds to (2.04)
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


# The endpoint.

BODY = {"messages": [{"role": "user", "text": "Earth to Mars"}]}


@pytest.fixture
def agent_on(monkeypatch):
    def turn_on(provider, limit: int = 200) -> None:
        monkeypatch.setattr(server, "PLANNER_AGENT_MODEL", "test-model")
        monkeypatch.setattr(server, "PLANNER_AGENT_PROVIDER", provider)
        monkeypatch.setattr(server, "PLANNER_AGENT_DAILY_LIMIT", DailyLimit(limit))
    return turn_on


def test_with_no_model_set_the_agent_is_off(monkeypatch) -> None:
    monkeypatch.setattr(server, "PLANNER_AGENT_MODEL", None)
    agent = client.get("/planner/capabilities").json()["agent"]
    assert (agent["enabled"], agent["model"]) == (False, None)
    response = client.post("/planner/agent", json=BODY)
    assert response.status_code == 503 and response.json()["detail"]["code"] == "planner_agent_disabled"


@pytest.mark.parametrize(("peer", "headers"), [
    ("198.51.100.8", {}),  # not this machine
    ("127.0.0.1", {"host": "rebound.example:8042"}),  # a page whose name was rebound to this machine
    ("127.0.0.1", {"origin": "https://untrusted.example"}),
    ("127.0.0.1", {"x-forwarded-for": "198.51.100.8"}),
])
def test_the_agent_answers_only_this_machine_and_the_apps_own_pages(agent_on, peer, headers) -> None:
    script = Script(answer("Hello."))
    agent_on(script)
    outsider = TestClient(server.app, base_url="http://localhost", headers={"host": "localhost:8042"},
                          client=(peer, 32123), raise_server_exceptions=False)
    response = outsider.post("/planner/agent", json=BODY, headers=headers)
    assert response.status_code == 403 and response.json()["detail"]["code"] == "planner_agent_local_only"
    assert script.calls == []
    assert client.post("/planner/agent", json=BODY, headers={"origin": "http://localhost:5173"}).status_code == 200


def test_the_endpoint_answers_a_prompt(agent_on) -> None:
    agent_on(Script(tool("search_trips", **MARS), cheapest_answer))
    assert client.get("/planner/capabilities").json()["agent"] == {
        "enabled": True, "model": "test-model", "max_prompt_chars": 2_000, "max_prompts_per_day": 200,
        "max_request_bytes": 32_768}
    response = client.post("/planner/agent", json=BODY)
    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["show"]["trip_id"], body["check"]["result"]) == ("ok", "s1-t1", "passed")


def test_the_daily_limit_refuses_prompts_past_it_and_frees_the_slot(agent_on) -> None:
    agent_on(Script(answer("Hello.")), limit=1)
    assert client.post("/planner/agent", json=BODY).status_code == 200
    for _ in range(3):  # more refusals than the two agent slots: a refusal that kept its slot would turn into 503
        response = client.post("/planner/agent", json=BODY)
        assert response.status_code == 429 and response.json()["detail"]["code"] == "planner_agent_daily_limit"
    agent_on(Script(answer("Hello again.")), limit=1)
    assert client.post("/planner/agent", json=BODY).status_code == 200


@pytest.mark.parametrize(("retryable", "status"), [(True, 503), (False, 502)])
def test_provider_failures_become_gateway_errors(agent_on, retryable, status) -> None:
    def failing(**_call):
        raise ProviderError("model_error", "The model provider returned HTTP 500.", retryable=retryable)
    agent_on(failing)
    response = client.post("/planner/agent", json=BODY)
    assert response.status_code == status
    assert response.json()["detail"] == {"code": "model_error", "message": "The model provider returned HTTP 500.",
                                         "retryable": retryable, "context": {}}


def test_a_prompt_that_got_no_model_reply_gives_its_daily_slot_back(agent_on, monkeypatch) -> None:
    def down(**_call) -> ModelReply:
        raise ProviderError("model_unreachable", "The model provider could not be reached in time.", retryable=True)
    agent_on(down, limit=1)
    assert client.post("/planner/agent", json=BODY).status_code == 503
    monkeypatch.setattr(server, "PLANNER_AGENT_PROVIDER", Script(answer("Hello.")))
    assert client.post("/planner/agent", json=BODY).status_code == 200  # the failed prompt cost nothing


def test_a_prompt_that_failed_after_a_model_reply_keeps_its_slot(agent_on) -> None:
    def down(_turns) -> ModelReply:
        raise ProviderError("model_unreachable", "The model provider could not be reached in time.", retryable=True)
    agent_on(Script(tool("find_place", query="mars"), down), limit=1)
    assert client.post("/planner/agent", json=BODY).status_code == 503
    assert client.post("/planner/agent", json=BODY).status_code == 429  # the first reply was paid for


def test_the_endpoint_gives_the_agent_the_http_search_slots(agent_on, monkeypatch) -> None:
    seen: dict = {}

    def fake_run_agent(_request, **options) -> dict:
        seen.update(options)
        return {"status": "ok"}
    agent_on(Script())
    monkeypatch.setattr(server, "run_agent", fake_run_agent)
    assert client.post("/planner/agent", json=BODY).status_code == 200
    assert seen["search_slots"] is server._planner_search_guard


def test_a_busy_agent_answers_503_without_using_a_prompt(agent_on, monkeypatch) -> None:
    agent_on(Script(answer("Hello.")), limit=1)
    guard = threading.BoundedSemaphore(1)
    monkeypatch.setattr(server, "_planner_agent_guard", guard)
    assert guard.acquire(blocking=False)
    response = client.post("/planner/agent", json=BODY)
    assert (response.status_code, response.json()["detail"]["code"], response.headers["Retry-After"]) == (
        503, "planner_agent_busy", "2")
    guard.release()
    assert client.post("/planner/agent", json=BODY).status_code == 200  # the day's one prompt is still there


def test_a_timed_out_prompt_answers_504_and_frees_its_slot(agent_on, monkeypatch) -> None:
    def slow(**_call) -> ModelReply:
        time.sleep(0.3)  # gstack-timing-ok: six times the endpoint timeout; the assertions are on the outcome
        return answer("Too late.")
    agent_on(slow)
    guard = threading.BoundedSemaphore(1)
    monkeypatch.setattr(server, "_planner_agent_guard", guard)
    monkeypatch.setattr(server, "PLANNER_AGENT_TIMEOUT_SECONDS", 0.05)
    response = client.post("/planner/agent", json=BODY)
    assert (response.status_code, response.json()["detail"]["code"]) == (504, "planner_agent_timeout")
    assert guard.acquire(timeout=2.0)
    guard.release()


def test_an_overlong_prompt_is_rejected_before_any_model_call(agent_on) -> None:
    script = Script()
    agent_on(script)
    response = client.post("/planner/agent", json={"messages": [{"role": "user", "text": "x" * 2_001}]})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "trajectory_request_validation_error" and script.calls == []


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
    (anthropic.CredentialsError("profile 'default' has expired"), "model_credentials", False),  # `ant auth login`
    (WorkloadIdentityError("token refresh failed"), "model_credentials", False),
    (_status(anthropic.InternalServerError, 529), "model_error", True),
    (_status(anthropic.BadRequestError, 400), "model_error", False),
])
def test_provider_errors_become_provider_neutral_errors(error, code, retryable) -> None:
    with pytest.raises(ProviderError) as raised:
        provider_anthropic.call_model(model="m", system="s", tools=TOOLS, answer_schema={}, turns=(UserText("hi"),),
                                      timeout_s=5.0, client=FakeClient(error))
    assert (raised.value.code, raised.value.retryable) == (code, retryable)


def test_missing_credentials_are_a_credentials_error_before_any_request(monkeypatch, tmp_path) -> None:
    for name in [name for name in os.environ if name.startswith("ANTHROPIC_")]:
        monkeypatch.delenv(name)
    monkeypatch.setenv("HOME", str(tmp_path))  # no `ant auth login` profile either
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    sent: list = []
    sdk = anthropic.Anthropic(max_retries=0, http_client=httpx2.Client(
        transport=httpx2.MockTransport(lambda request: sent.append(request) or httpx2.Response(500))))
    with pytest.raises(ProviderError) as raised:
        provider_anthropic.call_model(model="m", system="s", tools=TOOLS, answer_schema={}, turns=(UserText("hi"),),
                                      timeout_s=5.0, client=sdk)
    assert (raised.value.code, raised.value.retryable, sent) == ("model_credentials", False, [])


@pytest.mark.parametrize("error", [
    anthropic.CredentialsError("profile 'default' has expired"),
    _status(anthropic.AuthenticationError, 401),
])
def test_a_credentials_failure_drops_the_cached_client_so_a_new_sign_in_is_used(monkeypatch, error) -> None:
    built: list = []

    def build(**options):
        built.append(options)
        return FakeClient(error)

    monkeypatch.setattr(provider_anthropic.anthropic, "Anthropic", build)
    provider_anthropic._client.cache_clear()
    for _ in range(2):
        with pytest.raises(ProviderError) as raised:
            provider_anthropic.call_model(model="m", system="s", tools=TOOLS, answer_schema={},
                                          turns=(UserText("hi"),), timeout_s=5.0)
        assert raised.value.code == "model_credentials"
    provider_anthropic._client.cache_clear()
    assert len(built) == 2  # the second prompt built a fresh client, which reads a new `ant auth login`
