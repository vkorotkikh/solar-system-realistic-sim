#!/usr/bin/env python3
"""C12: run the route-planning agent's 13 acceptance prompts on each Claude tier, and score them.

Run from anywhere, in the measured checkout's CI test environment:

    uv run --offline --python 3.12.13 --with-requirements <checkout>/ci/backend-test-requirements.txt \\
      python run_tiers.py run --checkout <checkout> --arms claude-opus-5-5 --runs 3 --today 2026-11-23 --out out/<name>

Subcommands: run (with --stub: a scripted model that costs nothing), score, summarize, decoys, blinding.
The rules every reply is scored by are in prereg.md, section Scoring.
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
# USD per million tokens: input, output, cache read (claude-api reference, cached 2026-11-03).
# A cache write costs 1.25 times the input price.
PRICES = {
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "claude-sonnet-5-5": (2.00, 10.00, 0.10),
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-fable-5-2": (8.00, 40.00, 0.20),
}
BARS = {"run_pass_rate": 0.90, "p95_seconds": 30.0, "cost_per_prompt": 0.25}
WORDS_THE_MODEL_MUST_NOT_SEE = re.compile(
    r"\b(eval\w*|test\w*|judge\w*|experiment\w*|rubric\w*|score\w*|compar\w*|benchmark\w*|candidate\w*|arena)\b", re.I)
LAYERS = {"orbits": True, "labels": True, "magnetic_field": False, "realistic_scale": False, "moons": True,
          "asteroid_belt": True, "kuiper_belt": True, "earth_satellites": False}
RETRY_AFTER_S = 30.0


def load_backend(checkout: str):
    sys.path.insert(0, str(Path(checkout).resolve() / "backend"))
    from planner import places, trips  # noqa: PLC0415 - the measured checkout decides what is imported
    from planner.agent import loop, provider_anthropic, tools  # noqa: PLC0415
    return {"loop": loop, "provider": provider_anthropic, "tools": tools, "trips": trips, "places": places}


def rows() -> list[dict]:
    return [json.loads(line) for line in (HERE / "prompts.jsonl").read_text().splitlines() if line.strip()]


def cost_usd(arm: str, usage: dict) -> float:
    price_in, price_out, price_cache = PRICES.get(arm, (0.0, 0.0, 0.0))
    return (usage.get("input_tokens", 0) * price_in + usage.get("output_tokens", 0) * price_out
            + usage.get("cache_read_input_tokens", 0) * price_cache
            + usage.get("cache_creation_input_tokens", 0) * price_in * 1.25) / 1e6


# Direct planner answers to each prompt's canonical request: what a correct agent shows.

def search_fields(canonical: dict) -> dict:
    return {"objective": "min_delta_v", "flybys": 0, **canonical}


def canonical_trip(backend: dict, canonical: dict, today: dt.date) -> dict:
    trips = backend["trips"]
    result = trips.search_trips(trips.TripSearchRequest.model_validate(search_fields(canonical)), today=today)
    if result["status"] != "ok":
        raise SystemExit(f"the canonical search was refused: {canonical}: {result.get('message')}")
    cheapest = next(trip for trip in result["trips"] if "cheapest" in trip["labels"])
    return {"resolved": result["resolved"], "trip": cheapest}


# The checks of prereg.md, section Scoring.

def _numbers_checked(reply: dict) -> bool:
    return (reply.get("check") or {}).get("result") in ("passed", "corrected")


def _answered(reply: dict) -> bool:
    return reply.get("status") == "ok" and reply["reply"]["kind"] == "answer"


def score_trip(row: dict, reply: dict, canonical: dict) -> dict:
    show = reply.get("show") or {}
    shows_trip = show.get("kind") == "trip"
    checks = {"answered": _answered(reply), "shows_trip": shows_trip}
    trip, reference = (show.get("trip") or {}), canonical["trip"]
    checks["right_trip"] = shows_trip and all(
        show["resolved"][end]["orbit"]["id"] == canonical["resolved"][end]["orbit"]["id"] for end in ("from", "to")
    ) and len(trip["legs"]) == len(reference["legs"]) and trip.get("stay_days") == reference.get("stay_days")
    checks["has_numbers"] = shows_trip and all(
        key in trip for key in ("total_days", "total_delta_v_km_s")) and bool(trip["legs"][0]["depart"]["date"]
                                                                           and trip["legs"][-1]["arrive"]["date"])
    checks["names_window"] = shows_trip and all(
        day in reply["reply"]["text"] for day in (trip["legs"][0]["depart"]["date"], trip["legs"][-1]["arrive"]["date"]))
    checks["delta_v"] = shows_trip and abs(trip["total_delta_v_km_s"] - reference["total_delta_v_km_s"]) <= (
        row["tolerance"] * reference["total_delta_v_km_s"])
    checks["numbers_checked"] = _numbers_checked(reply)
    return checks


def score_plan(row: dict, reply: dict, backend: dict) -> dict:
    show = reply.get("show") or {}
    plan = show.get("plan") or {} if show.get("kind") == "plan" else {}
    entries = plan.get("trips", {})
    checks = {"answered": _answered(reply), "shows_plan": show.get("kind") == "plan"}
    checks["all_scheduled"] = (len(entries) == 2 and all(entry.get("status") == "ok" for entry in entries.values())
                               and not plan.get("problems"))
    checks["right_legs"] = checks["tie_respected"] = False
    second = next((entry for entry in entries.values() if entry.get("after")), None)
    if checks["all_scheduled"] and second is not None and second["after"]["trip"] in entries:
        first = entries[second["after"]["trip"]]
        orbit_of = {body: backend["places"].get_place(body).default_orbit.id for leg in row["legs"] for body in leg}
        checks["right_legs"] = all(
            [entry["resolved"]["from"]["orbit"]["id"], entry["resolved"]["to"]["orbit"]["id"]]
            == [orbit_of[leg[0]], orbit_of[leg[1]]] for entry, leg in ((first, row["legs"][0]), (second, row["legs"][1])))
        gap = row["gap_days"]
        checks["tie_respected"] = (second["after"]["event"] == "arrives" and abs(second["after"]["gap_days"] - gap) < 0.5
                                   and second["chosen"]["legs"][0]["depart"]["jd"]
                                   >= first["chosen"]["legs"][-1]["arrive"]["jd"] + gap - 0.5)
    checks["numbers_checked"] = _numbers_checked(reply)
    return checks


def score_focus(row: dict, reply: dict) -> dict:
    focused = any(action.get("type") == "focus_on" and action.get("place_id") == row["place"]
                  for action in reply.get("actions") or [])
    asked = reply.get("status") == "ok" and reply["reply"]["kind"] == "question" and any(
        re.search(r"\b(moon|jupiter)\b", option, re.I) or option.strip().lower() == "europa"
        for option in reply["reply"]["options"])
    return {"focus_or_asks": focused or asked, "numbers_checked": _numbers_checked(reply)}


def score_date(setup: dict, reply: dict) -> dict:
    shown = setup.get("show") or {}
    if shown.get("kind") != "trip":
        return {"setup_shows_trip": False, "date_is_arrival": False, "numbers_checked": _numbers_checked(reply)}
    arrival = shown["trip"]["legs"][-1]["arrive"]["date"]
    dated = [action["date"] for action in reply.get("actions") or [] if action.get("type") == "set_date"]
    return {"setup_shows_trip": True, "date_is_arrival": dated[-1:] == [arrival], "numbers_checked": _numbers_checked(reply)}


def score_layer(row: dict, reply: dict) -> dict:
    switched = any(action.get("type") == "set_layer" and action.get("layer") == row["layer"]
                   and action.get("on") == row["on"] for action in reply.get("actions") or [])
    return {"layer_switched": switched, "numbers_checked": _numbers_checked(reply)}


def score(row: dict, replies: dict, backend: dict, canonical: dict | None) -> dict:
    reply = replies["reply"]
    if row["kind"] == "trip":
        return score_trip(row, reply, canonical)
    if row["kind"] == "plan":
        return score_plan(row, reply, backend)
    if row["kind"] == "focus":
        return score_focus(row, reply)
    if row["kind"] == "date":
        return score_date(replies["setup"], reply)
    return score_layer(row, reply)


# A scripted model for the zero-cost dry run: it calls the tools a correct agent would and quotes their results.

def stub_for(row: dict, backend: dict):
    loop = backend["loop"]

    def tool(name: str, **arguments):
        return loop.ModelReply("tool_use", tool_calls=(loop.ToolCall("stub-call", name, arguments),), model="stub")

    def answer(text: str, *, trip: str = "", plan: bool = False):
        return loop.ModelReply("end_turn", model="stub", text=json.dumps(
            {"kind": "answer", "text": text, "show_trip_id": trip, "show_plan": plan, "options": []}))

    def result(turns) -> dict:
        last = next(turn for turn in reversed(turns) if isinstance(turn, loop.ToolResults))
        return json.loads(last.results[0][1])

    def cheapest(turns) -> dict:
        return next(trip for trip in result(turns)["trips"] if "cheapest" in trip["labels"])

    def trip_answer(turns):
        trip = cheapest(turns)
        return answer(f"Leave {trip['legs'][0]['depart']['date']}, arrive {trip['legs'][-1]['arrive']['date']}: "
                      f"{trip['total_days']:.0f} days and {trip['total_delta_v_km_s']:.2f} km/s in burns.", trip=trip["id"])

    def plan_answer(turns):
        plan = result(turns)
        return answer(f"The first trip leaves {plan['first_departure']['date']} and the last one arrives "
                      f"{plan['last_arrival']['date']}.", plan=True)

    if row["kind"] == "trip":
        return [[tool("search_trips", **search_fields(row["canonical"])), trip_answer]]
    if row["kind"] == "plan":
        (a_from, a_to), (b_from, b_to) = row["legs"]
        trips = [{"key": "first", "search": search_fields({"from": a_from, "to": a_to, "trip": "one_way"})},
                 {"key": "second", "search": search_fields({"from": b_from, "to": b_to, "trip": "one_way"}),
                  "after": {"trip": "first", "event": "arrives", "gap_days": row["gap_days"]}}]
        return [[tool("solve_plan", trips=trips), plan_answer]]
    if row["kind"] == "focus":
        return [[tool("find_place", query="Europa"), tool("focus_on", place_id=row["place"], follow=True),
                 answer("Europa is in view.")]]
    if row["kind"] == "date":
        setup = [tool("search_trips", **search_fields(row["canonical"])), trip_answer]
        jump = [tool("search_trips", **search_fields(row["canonical"])),
                lambda turns: tool("set_date", date=cheapest(turns)["legs"][-1]["arrive"]["date"]),
                answer("The app moves to the day the trip arrives.")]
        return [setup, jump]
    return [[tool("set_layer", layer=row["layer"], on=row["on"]), answer("The asteroid belt is hidden.")]]


class Script:
    def __init__(self, steps: list) -> None:
        self.steps = list(steps)

    def __call__(self, **call):
        step = self.steps.pop(0)
        return step(call["turns"]) if callable(step) else step


# Running.

def ask(backend: dict, arm: str, provider, messages: list[dict], today: dt.date, plan: dict | None) -> tuple[dict, str | None]:
    """One prompt through run_agent, with the one retry prereg.md allows for a provider error."""
    loop = backend["loop"]
    request = loop.AgentRequest.model_validate({"messages": messages, "plan": plan, "app": {
        "date": today.isoformat(), "focused": "earth", "layers": LAYERS}})
    for attempt in (1, 2):
        try:
            return loop.run_agent(request, model=arm, provider=provider, today=today), None
        except loop.ProviderError as exc:
            if attempt == 2:
                return {}, f"{exc.code}: {exc}"
            time.sleep(RETRY_AFTER_S)
    raise AssertionError("unreachable")


def run_one(backend: dict, arm: str, row: dict, today: dt.date, stub: bool, canonical: dict | None) -> tuple[dict, dict]:
    scripts = stub_for(row, backend) if stub else None
    provider = (lambda index: Script(scripts[index])) if stub else (lambda index: backend["provider"].call_model)
    replies, usage, error = {}, {}, None
    plan = None
    if row["kind"] == "date":
        replies["setup"], error = ask(backend, arm, provider(0), [{"role": "user", "text": row["setup"]}], today, None)
        shown = (replies["setup"] or {}).get("show") or {}
        plan = {"trips": [{"key": "trip", "search": shown["request"]}]} if shown.get("kind") == "trip" else None
        messages = [{"role": "user", "text": row["setup"]},
                    {"role": "assistant", "text": ((replies["setup"] or {}).get("reply") or {}).get("text") or "No trip."},
                    {"role": "user", "text": row["prompt"]}]
    else:
        messages = [{"role": "user", "text": row["prompt"]}]
    if error is None:
        replies["reply"], error = ask(backend, arm, provider(1 if row["kind"] == "date" else 0), messages, today, plan)
    for reply in replies.values():
        for key, value in (reply.get("usage") or {}).items():
            if isinstance(value, (int, float)) and key != "seconds":
                usage[key] = usage.get(key, 0) + value
    reply = replies.get("reply") or {}
    checks = {} if error else score(row, replies, backend, canonical)
    record = {
        "arm": arm, "prompt_id": row["id"], "kind": row["kind"], "today": today.isoformat(),
        "checks": checks, "passed": bool(checks) and all(checks.values()), "provider_error": error,
        "seconds": (reply.get("usage") or {}).get("seconds"), "usage": usage, "cost_usd": round(cost_usd(arm, usage), 6),
        "models": sorted({model for reply in replies.values() for model in (reply.get("usage") or {}).get("models", [])}),
        "status": reply.get("status"), "code": reply.get("code"),
        "replaced": (reply.get("check") or {}).get("result") == "replaced",
        "question": (reply.get("reply") or {}).get("kind") == "question",
        "stopped": reply.get("status") == "stopped", "decoy": False,
        "reply": {key: reply.get(key) for key in ("reply", "actions", "check")},
    }
    return record, replies


def commit_of(checkout: str) -> str:
    def git(*args):
        return subprocess.run(["git", "-C", checkout, *args], capture_output=True, text=True).stdout.strip()
    return git("rev-parse", "--short=12", "HEAD") + ("-dirty" if git("status", "--porcelain", "--", "backend") else "")


def command_run(args) -> None:
    backend = load_backend(args.checkout)
    today = dt.date.fromisoformat(args.today)
    out = Path(args.out)
    (out / "replies").mkdir(parents=True, exist_ok=True)
    chosen = [row for row in rows() if not args.prompts or row["id"] in args.prompts.split(",")]
    canonical = {row["id"]: canonical_trip(backend, row["canonical"], today) for row in chosen if row["kind"] == "trip"}
    context = {"commit": commit_of(args.checkout), "today": today.isoformat(), "python": sys.version.split()[0],
               "stub": args.stub, "arms": args.arms, "runs": args.runs, "started": dt.datetime.now(dt.timezone.utc).isoformat()}
    (out / "context.json").write_text(json.dumps(context, indent=1) + "\n")
    (out / "canonical.json").write_text(json.dumps(canonical, indent=1) + "\n")
    with (out / "records.jsonl").open("a") as records:
        for run in range(1, args.runs + 1):  # the arms alternate run by run, so load swings hit every arm alike
            for row in chosen:
                for arm in args.arms.split(","):
                    record, replies = run_one(backend, arm, row, today, args.stub, canonical.get(row["id"]))
                    record.update(run=run, commit=context["commit"])
                    records.write(json.dumps(record) + "\n")
                    records.flush()
                    (out / "replies" / f"{arm}-{row['id']}-{run}.json").write_text(json.dumps(replies) + "\n")
                    print(f"RUN: arm={arm} prompt={row['id']} run={run} passed={record['passed']} "
                          f"seconds={record['seconds']} cost=${record['cost_usd']:.4f}"
                          + (f" provider_error={record['provider_error']}" if record["provider_error"] else ""), flush=True)


# Reporting.

def load_records(path: str) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def p95(values: list[float]) -> float | None:
    values = sorted(value for value in values if value is not None)
    return values[math.ceil(0.95 * len(values)) - 1] if values else None


def command_score(args) -> None:
    records = [record for record in load_records(args.records) if not record.get("decoy")]
    prompts = [row["id"] for row in rows()]
    print("| arm | runs | passed | run_pass_rate | prompt_coverage | p95_seconds | cost_per_prompt | replaced "
          "| provider_errors | questions | stopped | meets every bar |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|")
    for arm in dict.fromkeys(record["arm"] for record in records):
        mine = [record for record in records if record["arm"] == arm]
        scored = [record for record in mine if not record["provider_error"]]
        passed = sum(record["passed"] for record in scored)
        rate = passed / len(scored) if scored else 0.0
        covered = 0  # a prompt passes when it passes in two thirds of its runs, rounded up: 2 of 3 (prereg.md)
        for prompt in prompts:
            runs = [record for record in scored if record["prompt_id"] == prompt]
            covered += bool(runs) and sum(record["passed"] for record in runs) >= math.ceil(2 * len(runs) / 3)
        slowest = p95([record["seconds"] for record in scored])
        cost = sum(record["cost_usd"] for record in mine) / len(mine) if mine else 0.0
        meets = (rate >= BARS["run_pass_rate"] and covered == len(prompts) and slowest is not None
                 and slowest <= BARS["p95_seconds"] and cost <= BARS["cost_per_prompt"])
        counts = summarize(mine)
        print(f"| {arm} | {len(scored)} | {passed} | {rate:.2f} | {covered} of {len(prompts)} | {slowest} | ${cost:.4f} "
              f"| {counts['replaced']} | {counts['provider_errors']} | {counts['questions']} | {counts['stopped']} "
              f"| {'yes' if meets else 'no'} |")
    failed = {}
    for record in records:
        for check, ok in record["checks"].items():
            if not ok:
                failed.setdefault((record["arm"], record["prompt_id"], check), 0)
                failed[(record["arm"], record["prompt_id"], check)] += 1
    for (arm, prompt, check), count in sorted(failed.items()):
        print(f"FAILED_CHECK: arm={arm} prompt={prompt} check={check} runs={count}")


def summarize(records: list[dict]) -> dict:
    return {"replaced": sum(record["replaced"] for record in records),
            "provider_errors": sum(record["provider_error"] is not None for record in records),
            "questions": sum(record["question"] for record in records),
            "stopped": sum(record["stopped"] for record in records),
            "decoys_accepted": sum(bool(record.get("decoy")) and record["passed"] for record in records)}


def command_summarize(args) -> None:
    print(json.dumps(summarize(load_records(args.records))))


def decoys(replies: dict) -> list[tuple[str, str, dict]]:
    """Six replies the scorer must fail (prereg.md, section Decoys), edited from real stub replies."""
    def edit(prompt_id: str, change) -> dict:
        changed = copy.deepcopy(replies[prompt_id])
        change(changed)
        return changed

    def wrong_destination(r):
        r["reply"]["show"]["resolved"]["to"]["orbit"]["id"] = "psyche-low-orbit"

    def no_arrival(r):
        arrival = r["reply"]["show"]["trip"]["legs"][-1]["arrive"]["date"]
        r["reply"]["reply"]["text"] = r["reply"]["reply"]["text"].replace(arrival, "soon")

    def replaced(r):
        r["reply"]["check"]["result"] = "replaced"

    def tie_broken(r):
        entries = r["reply"]["show"]["plan"]["trips"]
        second = next(entry for entry in entries.values() if entry.get("after"))
        first = entries[second["after"]["trip"]]
        second["chosen"]["legs"][0]["depart"]["jd"] = first["chosen"]["legs"][-1]["arrive"]["jd"] + 10.0

    def wrong_day(r):
        for action in r["reply"]["actions"]:
            if action["type"] == "set_date":
                action["date"] = (dt.date.fromisoformat(action["date"]) + dt.timedelta(days=1)).isoformat()

    def stopped(r):
        r["reply"] = {"status": "stopped", "code": "limit", "reply": {"kind": "answer", "text": "Stopped.", "options": []},
                      "show": None, "actions": [], "check": None}

    return [("wrong_destination", "trip-earth-mars", edit("trip-earth-mars", wrong_destination)),
            ("no_arrival_date", "trip-earth-mars", edit("trip-earth-mars", no_arrival)),
            ("replaced_answer", "trip-moon", edit("trip-moon", replaced)),
            ("tie_broken", "plan-cargo-crew", edit("plan-cargo-crew", tie_broken)),
            ("wrong_day", "app-jump-arrival", edit("app-jump-arrival", wrong_day)),
            ("stopped_run", "app-hide-belt", edit("app-hide-belt", stopped))]


def command_decoys(args) -> None:
    backend = load_backend(args.checkout)
    out = Path(args.out)
    context = json.loads((out / "context.json").read_text())
    canonical = json.loads((out / "canonical.json").read_text())
    arm = context["arms"].split(",")[0]
    real = {row["id"]: json.loads((out / "replies" / f"{arm}-{row['id']}-1.json").read_text()) for row in rows()}
    by_id = {row["id"]: row for row in rows()}
    accepted = 0
    for name, prompt_id, replies in decoys(real):
        checks = score(by_id[prompt_id], replies, backend, canonical.get(prompt_id))
        passed = all(checks.values())
        accepted += passed
        print(f"DECOY: {name} prompt={prompt_id} accepted={passed} failed_checks="
              f"{','.join(check for check, ok in checks.items() if not ok) or 'none'}")
    print(f"DECOYS: {6 - accepted} of 6 rejected")
    sys.exit(1 if accepted else 0)


def command_blinding(args) -> None:
    backend = load_backend(args.checkout)
    loop, tools = backend["loop"], backend["tools"]
    sample = loop.AgentRequest.model_validate({"messages": [{"role": "user", "text": "Earth to Mars"}], "app": {
        "date": "2026-11-23", "focused": "earth", "layers": LAYERS}})
    seen = {"system prompt": loop.SYSTEM_PROMPT, "answer schema": json.dumps(loop.ANSWER_SCHEMA),
            "app state": loop._context(sample, dt.date(2026, 11, 23)), "tool limit note": loop.TOOL_LIMIT_NOTE,
            **{f"tool {tool.name}": json.dumps([tool.name, tool.description, tool.input_schema]) for tool in tools.TOOLS},
            **{f"prompt {row['id']}": " ".join([row["prompt"], row.get("setup", "")]) for row in rows()}}
    hits = [(where, match.group()) for where, text in seen.items() for match in WORDS_THE_MODEL_MUST_NOT_SEE.finditer(text)]
    for where, word in hits:
        print(f"BLINDING_HIT: {where}: {word}")
    print(f"BLINDING: {'ok' if not hits else 'fail'} checked={len(seen)} hits={len(hits)}")
    sys.exit(1 if hits else 0)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--checkout", required=True)
    run.add_argument("--arms", required=True)
    run.add_argument("--runs", type=int, default=3)
    run.add_argument("--today", required=True)
    run.add_argument("--out", required=True)
    run.add_argument("--prompts", default="")
    run.add_argument("--stub", action="store_true")
    for name in ("score", "summarize"):
        commands.add_parser(name).add_argument("records")
    decoy = commands.add_parser("decoys")
    decoy.add_argument("--checkout", required=True)
    decoy.add_argument("--out", required=True)
    commands.add_parser("blinding").add_argument("--checkout", required=True)
    args = parser.parse_args()
    {"run": command_run, "score": command_score, "summarize": command_summarize, "decoys": command_decoys,
     "blinding": command_blinding}[args.command](args)


if __name__ == "__main__":
    main()
