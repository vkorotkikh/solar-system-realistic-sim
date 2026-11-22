"""The agent's loop (spec section 7.7). Provider-neutral: the model call is a function passed in.

One prompt runs at most six model calls and eight tool calls within 30 seconds.
The model's final answer is JSON in a fixed shape. Every number in its text
must be a rounding, at the decimals written, of a number in this prompt's tool
results, the app state or the user's own words. A whole number of ten or less
passes as a count unless a unit such as km/s or days follows it. A date written
YYYY-MM-DD must appear as written; a source date's year counts as a number,
its month and day do not. A mismatch gets one corrective retry; if that fails
too, the text is replaced by a sentence built from the trip. The backend keeps nothing between prompts: the browser sends the
conversation, the current plan and the app state each time.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import threading
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr, ValidationError, model_validator

from trajectory.budget import PlanningCancelled

from ..plans import PlanRequest
from .tools import TOOLS, Layer, Toolbox, validation_message

MAX_MODEL_CALLS = 6
MAX_TOOL_CALLS = 8
MAX_PROMPT_CHARS = 2_000
MAX_REPLY_CHARS = 4_000
MAX_MESSAGES = 40
AGENT_SECONDS = 30.0
MIN_MODEL_CALL_S = 2.0  # no model call starts with less time than this left
MAX_COUNT = 10  # whole numbers up to this are counts, allowed in any answer

SYSTEM_PROMPT = """\
You are the trip planner inside a solar system simulator. Users ask in plain words about spacecraft trips between \
planets, dwarf planets, asteroids, moons and named orbits, and ask to change what the app shows. You answer with \
the planner's results.

Tools
- Every date, speed, duration and mass you give must come from a tool result. Never work one out or estimate it.
- Look each place up with find_place before using its id. If more than one place could be meant, ask which: set \
kind to "question", ask in one sentence, and list the matching places by name in options.
- A trip starts from Earth when the user names no start. Search one trip with search_trips. Use solve_plan for \
several trips on one timeline, or for a trip that starts after another one.
- Use check_vehicle only when the user describes a rocket, with a trip id from a result in this prompt.
- Use focus_on, set_date and set_layer when the user asks to look at a place, change the app's date, or show or \
hide a layer. The app makes these changes after your answer.
- Each prompt begins with the app's state: today's date, the date shown in the app, the focused body, the layer \
switches and the current plan. A follow-up refers to earlier turns; search a trip from an earlier turn again before \
you quote its numbers.

Answer
- text: at most four short sentences in plain words. For a trip, first restate it in one line with the defaults \
filled in: from where to where, the orbit at each end, one way or round trip, and what the search optimised. Then \
give the best launch window found in the dates searched: the departure date, the arrival date, the flight time and \
the total delta-v. Then the most important limit from the trip's approximations.
- Copy numbers from the tool results; you may round them. Write dates as YYYY-MM-DD, speeds in km/s and times in \
days, as the tools give them. Do not write trip ids or place ids.
- If the planner refuses or finds no route, say so and repeat its message.
- If a trip's total delta-v is far beyond what a chemical rocket carries, say plainly that the trip is very costly.
- show_trip_id: the id of the trip to show, from a tool result in this prompt, or "" for none. show_plan: true to \
show the plan from your last solve_plan call. options: the choices when kind is "question", otherwise empty.
"""

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["answer", "question"]},
        "text": {"type": "string"},
        "show_trip_id": {"type": "string"},
        "show_plan": {"type": "boolean"},
        "options": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["kind", "text", "show_trip_id", "show_plan", "options"],
    "additionalProperties": False,
}

STOP_TEXT = {
    "refusal": "The model declined to answer this prompt. Try asking about a trip or about what the app shows.",
    "max_tokens": "The answer ran past its length limit and was cut off. Try a shorter request.",
    "limit": "This prompt reached its limit of six model calls, eight tool calls or 30 seconds before an answer. "
             "Try a narrower request.",
    "unexpected_stop": "The model stopped without an answer. Try again.",
}
TOOL_LIMIT_NOTE = "This prompt has used all its tool calls. Answer now with the results you have."


# Provider-neutral turns. A provider module turns them into its own messages.

@dataclass(frozen=True, slots=True)
class UserText:
    text: str


@dataclass(frozen=True, slots=True)
class AssistantText:
    """An earlier answer, as the browser sent it back."""

    text: str


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass(frozen=True, slots=True)
class ModelReply:
    stop: str  # end_turn, tool_use, max_tokens, refusal, or another provider stop reason
    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    usage: dict = field(default_factory=dict)  # token counts by name
    model: str = ""  # the model that answered
    replay: object = None  # what the provider sends back, unchanged, to continue from this turn


@dataclass(frozen=True, slots=True)
class ToolResults:
    results: tuple[tuple[str, str, bool], ...]  # (tool call id, JSON text, is an error)


Turn = UserText | AssistantText | ModelReply | ToolResults
Provider = Callable[..., ModelReply]


class ProviderError(Exception):
    """The model provider could not be reached or rejected the call."""

    def __init__(self, code: str, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.model_replies = 0  # replies this prompt had already received; run_agent fills it in


# The request.

class AgentMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    text: StrictStr = Field(min_length=1, max_length=MAX_REPLY_CHARS)


class AppState(BaseModel):
    """The short summary of the app the model sees: its date, the focused body and the layer switches."""

    model_config = ConfigDict(extra="forbid")

    date: dt.date | None = None
    focused: StrictStr | None = Field(None, max_length=64)
    layers: dict[Layer, bool] = Field(default_factory=dict)


class AgentRequest(BaseModel):
    """One prompt with the conversation so far. The browser keeps the conversation; the backend stores nothing."""

    model_config = ConfigDict(extra="forbid")

    messages: list[AgentMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    plan: PlanRequest | None = None
    app: AppState | None = None

    @model_validator(mode="after")
    def _starts_and_ends_with_the_user(self) -> "AgentRequest":
        if self.messages[0].role != "user" or self.messages[-1].role != "user":
            raise ValueError("the conversation must start and end with a user message")
        if any(message.role == "user" and len(message.text) > MAX_PROMPT_CHARS for message in self.messages):
            raise ValueError(f"a prompt is limited to {MAX_PROMPT_CHARS} characters")
        return self


class _Answer(BaseModel):
    kind: Literal["answer", "question"]
    text: str = Field(min_length=1, max_length=MAX_REPLY_CHARS)
    show_trip_id: str = ""
    show_plan: bool = False
    options: list[str] = Field(default_factory=list, max_length=6)


# The number check.

_ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_NUMBER = re.compile(r"(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?")
_UNIT = re.compile(r"\s*(?:km/s|m/s|km|kg|t|tonnes?|days?|d|hours?|h|years?|yr|%)(?![a-z/])", re.IGNORECASE)


def _parse(match: re.Match) -> tuple[str, float, int]:
    """A number as written, its value, and its decimal places."""
    return (match.group(), float(match.group(1).replace(",", "") + (match.group(2) or "")),
            len(match.group(2) or ".") - 1)


def _collect(value, numbers: set[float], dates: set[str]) -> None:
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        numbers.add(abs(float(value)))
    elif isinstance(value, str):
        days = _ISO_DATE.findall(value)
        dates.update(days)
        numbers.update(float(day[:4]) for day in days)  # a date's year can be quoted alone; its month and day not
        numbers.update(_parse(match)[1] for match in _NUMBER.finditer(_ISO_DATE.sub(" ", value)))
    else:
        for item in value.values() if isinstance(value, dict) else value:
            _collect(item, numbers, dates)


def unmatched_numbers(text: str, sources: list) -> list[str]:
    """Numbers in the text that no source number rounds to, at the decimals written.

    Dates written YYYY-MM-DD must appear in the sources as written. A whole
    number of ten or less is a count, and passes, unless a unit follows it.
    """
    numbers: set[float] = set()
    dates: set[str] = set()
    _collect(sources, numbers, dates)
    unmatched = [day for day in _ISO_DATE.findall(text) if day not in dates]
    stripped = _ISO_DATE.sub(" ", text)
    for match in _NUMBER.finditer(stripped):
        written, value, places = _parse(match)
        if places == 0 and value <= MAX_COUNT and not _UNIT.match(stripped, match.end()):
            continue
        half_step = 0.5 * 10.0**-places + 1e-9
        if not any(abs(known - value) <= half_step for known in numbers):
            unmatched.append(written)
    return list(dict.fromkeys(unmatched))


def _judge(text: str, toolbox: Toolbox, sources: list) -> tuple[_Answer | None, str | None]:
    """The parsed answer, and what is wrong with it, if anything."""
    try:
        data = json.loads(text)
    except ValueError:
        return None, "It is not valid JSON."
    if isinstance(data, dict) and isinstance(data.get("kind"), str):
        data["kind"] = data["kind"].lower()  # the API does not guarantee an enum value's case
    try:
        answer = _Answer.model_validate(data)
    except ValidationError as exc:
        return None, f"It does not fit the answer schema: {validation_message(exc)}."
    if answer.show_trip_id and answer.show_plan:
        return answer, "Show either one trip or the plan, not both."
    if answer.show_trip_id and answer.show_trip_id not in toolbox.trips:
        return answer, (f"No trip has the id '{answer.show_trip_id}' in this prompt's tool results. "
                        "Use an id from them, or an empty string.")
    if answer.show_plan and toolbox.plan is None:
        return answer, "No plan was solved in this prompt, so there is no plan to show."
    unmatched = unmatched_numbers(" ".join([answer.text, *answer.options]), sources)
    if unmatched:
        return answer, ("These numbers are not in this prompt's tool results or the user's words: "
                        + ", ".join(unmatched) + ". Copy numbers from the tool results, or leave them out.")
    return answer, None


def _trip_sentence(entry: dict) -> str:
    trip, resolved = entry["trip"], entry["resolved"]
    first, last = trip["legs"][0], trip["legs"][-1]
    way = "round trip" if "stay_days" in trip else "one way"
    return (f"{resolved['from']['name']} to {resolved['to']['name']}, {way}: leave {first['depart']['date']}, "
            f"{'back' if way == 'round trip' else 'arrive'} {last['arrive']['date']}, {trip['total_days']:.0f} days "
            f"in all, with burns totalling {trip['total_delta_v_km_s']:.2f} km/s.")


def _replacement(answer: _Answer | None, toolbox: Toolbox) -> _Answer:
    """The backend's own answer when the model's failed the checks twice, built from what it chose to show."""
    shown = toolbox.show(answer.show_trip_id, answer.show_plan) if answer is not None else None
    if shown is not None and shown["kind"] == "trip":
        return _Answer(kind="answer", text=_trip_sentence(shown), show_trip_id=answer.show_trip_id)
    if shown is not None:
        plan = shown["plan"]
        text = "The plan's trips are shown on the timeline."
        if plan["first_departure"] and plan["last_arrival"]:
            text = (f"The plan's first trip leaves {plan['first_departure']['date']} and its last trip arrives "
                    f"{plan['last_arrival']['date']}.")
        return _Answer(kind="answer", text=text, show_plan=True)
    return _Answer(kind="answer", text="I could not check my answer against the planner's results, so I left it "
                                       "out. Please ask again.")


def _context(request: AgentRequest, today: dt.date) -> str:
    app = request.app or AppState()
    lines = [f"Today: {today.isoformat()}",
             f"Date shown in the app: {app.date.isoformat() if app.date else 'unknown'}",
             f"Focused on: {app.focused or 'nothing'}"]
    if app.layers:
        lines.append("Layers: " + ", ".join(f"{name} {'on' if on else 'off'}" for name, on in app.layers.items()))
    plan = request.plan.model_dump(mode="json", by_alias=True, exclude_none=True) if request.plan else None
    lines.append("Current plan: " + (json.dumps(plan, separators=(",", ":")) if plan else "none"))
    return "App state:\n" + "\n".join(f"- {line}" for line in lines)


class DailyLimit:
    """A per-process count of prompts per UTC day, so a looping client cannot run up a bill."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self._day: dt.date | None = None
        self._count = 0
        self._lock = threading.Lock()

    def take(self, today: dt.date | None = None) -> bool:
        today = today or dt.datetime.now(dt.timezone.utc).date()
        with self._lock:
            if today != self._day:
                self._day, self._count = today, 0
            if self._count >= self.limit:
                return False
            self._count += 1
            return True

    def give_back(self, today: dt.date | None = None) -> None:
        """Return a prompt that cost nothing, such as one that never got a reply from the model."""
        today = today or dt.datetime.now(dt.timezone.utc).date()
        with self._lock:
            if today == self._day and self._count > 0:
                self._count -= 1


def run_agent(request: AgentRequest, *, model: str, provider: Provider,
              today: dt.date | None = None, cancel_event: threading.Event | None = None,
              seconds: float = AGENT_SECONDS, search_slots: threading.Semaphore | None = None) -> dict:
    """Answer one prompt: call the model, run the tools it asks for, and check its final answer."""
    started = time.monotonic()
    deadline = started + seconds
    cancel = cancel_event or threading.Event()
    today = today or dt.datetime.now(dt.timezone.utc).date()
    context = _context(request, today)
    turns: list[Turn] = [UserText(message.text) if message.role == "user" else AssistantText(message.text)
                         for message in request.messages[:-1]]
    turns.append(UserText(f"{context}\n\nThe user's prompt:\n{request.messages[-1].text}"))
    sources: list = [context, *(message.text for message in request.messages if message.role == "user")]
    toolbox = Toolbox(deadline=deadline, cancel=cancel, today=today, search_slots=search_slots)
    usage: Counter = Counter()
    models: set[str] = set()
    model_calls = tool_calls = 0
    problems: list[str] = []

    def report(**reply) -> dict:
        return {**reply, "usage": {**usage, "model_calls": model_calls, "tool_calls": tool_calls,
                                   "models": sorted(models), "seconds": round(time.monotonic() - started, 2)}}

    def stopped(code: str) -> dict:
        return report(status="stopped", code=code, reply={"kind": "answer", "text": STOP_TEXT[code], "options": []},
                      show=None, actions=[], check=None)

    while True:
        if cancel.is_set():
            raise PlanningCancelled("The agent prompt was cancelled")
        if model_calls == MAX_MODEL_CALLS or deadline - time.monotonic() < MIN_MODEL_CALL_S:
            return stopped("limit")
        try:
            reply = provider(model=model, system=SYSTEM_PROMPT, tools=TOOLS, answer_schema=ANSWER_SCHEMA,
                             turns=tuple(turns), timeout_s=deadline - time.monotonic())
        except ProviderError as exc:
            exc.model_replies = model_calls
            raise
        model_calls += 1
        usage.update(reply.usage)
        models.update([reply.model] if reply.model else [])
        turns.append(reply)
        if reply.stop == "tool_use" and reply.tool_calls:
            results = []
            for call in reply.tool_calls:
                if tool_calls == MAX_TOOL_CALLS:
                    results.append((call.id, json.dumps({"error": TOOL_LIMIT_NOTE}), True))
                    continue
                tool_calls += 1
                results.append((call.id, *toolbox.run(call.name, call.arguments)))
            turns.append(ToolResults(tuple(results)))
            continue
        if reply.stop != "end_turn":
            return stopped(reply.stop if reply.stop in STOP_TEXT else "unexpected_stop")
        answer, problem = _judge(reply.text, toolbox, sources + toolbox.outputs)
        if problem is None:
            result = "corrected" if problems else "passed"
            break
        problems.append(problem)
        out_of_room = model_calls == MAX_MODEL_CALLS or deadline - time.monotonic() < MIN_MODEL_CALL_S
        if len(problems) == 2 or out_of_room:
            answer, result = _replacement(answer, toolbox), "replaced"
            break
        turns.append(UserText(f"Your answer was not accepted. {problem} Send the whole answer again."))

    if (answer.kind == "answer" and not answer.show_trip_id and not answer.show_plan
            and toolbox.planner_message and toolbox.planner_message not in answer.text):
        answer = answer.model_copy(update={"text": f"{answer.text} {toolbox.planner_message}"})
    return report(status="ok", reply={"kind": answer.kind, "text": answer.text, "options": answer.options},
                  show=toolbox.show(answer.show_trip_id, answer.show_plan), actions=toolbox.actions,
                  check={"result": result, "problems": problems})
