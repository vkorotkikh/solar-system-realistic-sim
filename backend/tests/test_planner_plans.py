"""Trip plans (epic issue C6): several trips on one date axis, tied to each other.

A tied trip leaves no sooner than gap_days after the trip it is tied to
departs or, for "arrives", reaches its final destination.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import server
from planner.plans import PlanRequest, solve_plan

MARS_2026 = {"to": "mars", "earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"}
CARGO_THEN_CREW = [
    {"key": "cargo", "search": MARS_2026},
    {"key": "crew", "search": {"to": "mars", "latest_departure": "2029-12-31"},
     "after": {"trip": "cargo", "event": "arrives", "gap_days": 60}},
]


def solve(trips: list[dict]):
    return solve_plan(PlanRequest.model_validate({"trips": trips}))


def _depart(entry: dict) -> float:
    return entry["chosen"]["legs"][0]["depart"]["jd"]


def _arrive(entry: dict) -> float:
    return entry["chosen"]["legs"][-1]["arrive"]["jd"]


@pytest.fixture(scope="module")
def cargo_then_crew():
    return solve(CARGO_THEN_CREW)


def test_a_tied_trip_leaves_after_the_gap(cargo_then_crew) -> None:
    plan = cargo_then_crew
    assert (plan["status"], plan["problems"]) == ("ok", [])
    cargo, crew = plan["trips"]["cargo"], plan["trips"]["crew"]
    assert _depart(crew) >= _arrive(cargo) + 60
    assert crew["after"] == {"trip": "cargo", "event": "arrives", "gap_days": 60.0}


def test_the_plan_spans_its_first_departure_to_its_last_arrival(cargo_then_crew) -> None:
    plan = cargo_then_crew
    cargo, crew = plan["trips"]["cargo"], plan["trips"]["crew"]
    assert plan["first_departure"]["jd"] == _depart(cargo)
    assert plan["last_arrival"]["jd"] == _arrive(crew)
    assert plan["first_departure"]["date"] == cargo["chosen"]["legs"][0]["depart"]["date"]


def test_trips_are_solved_in_tie_order_whatever_order_they_are_listed_in(cargo_then_crew) -> None:
    listed_backwards = solve(list(reversed(CARGO_THEN_CREW)))
    assert list(listed_backwards["trips"]) == ["crew", "cargo"]  # the request's order
    assert _depart(listed_backwards["trips"]["crew"]) == _depart(cargo_then_crew["trips"]["crew"])


def test_a_tied_trip_keeps_its_own_later_earliest_departure() -> None:
    crew = {**CARGO_THEN_CREW[1], "search": {"to": "mars", "earliest_departure": "2030-06-01",
                                             "latest_departure": "2031-06-01"}}
    assert solve([CARGO_THEN_CREW[0], crew])["trips"]["crew"]["searched"]["earliest_departure"] == "2030-06-01"


def test_an_itinerary_continues_from_where_the_first_trip_ended() -> None:
    plan = solve([
        {"key": "mars", "search": MARS_2026},
        {"key": "ceres", "search": {"from": "mars", "to": "ceres", "latest_departure": "2031-12-31"},
         "after": {"trip": "mars", "gap_days": 30}},
    ])
    first, second = plan["trips"]["mars"], plan["trips"]["ceres"]
    assert second["chosen"]["legs"][0]["from"] == "mars"
    assert _depart(second) >= _arrive(first) + 30


def test_a_tie_to_a_departure_counts_from_the_departure() -> None:
    plan = solve([
        {"key": "first", "search": MARS_2026},
        {"key": "second", "search": {"to": "venus", "latest_departure": "2028-12-31"},
         "after": {"trip": "first", "event": "departs", "gap_days": 100}},
    ])
    assert _depart(plan["trips"]["second"]) >= _depart(plan["trips"]["first"]) + 100


def test_a_tie_loop_is_reported_and_its_trips_are_not_searched() -> None:
    plan = solve([
        {"key": "a", "search": {"to": "mars"}, "after": {"trip": "b"}},
        {"key": "b", "search": {"to": "venus"}, "after": {"trip": "a"}},
        {"key": "c", "search": MARS_2026},
    ])
    assert plan["status"] == "incomplete"
    assert [(problem["code"], sorted(problem["trips"])) for problem in plan["problems"]] == [("tie_loop", ["a", "b"])]
    assert (plan["trips"]["a"]["status"], plan["trips"]["b"]["status"]) == ("not_searched", "not_searched")
    assert plan["trips"]["c"]["status"] == "ok"


def test_a_tie_to_a_missing_trip_is_reported() -> None:
    plan = solve([{"key": "a", "search": MARS_2026, "after": {"trip": "ghost"}}])
    assert [problem["code"] for problem in plan["problems"]] == ["tie_to_missing_trip"]
    assert plan["trips"]["a"]["status"] == "not_searched"


def test_a_tie_that_cannot_be_met_is_reported_and_blocks_what_waits_on_it() -> None:
    # Cargo arrives in 2027; the crew must leave by 2027-01-01, so no crew trip exists.
    plan = solve([
        {"key": "cargo", "search": MARS_2026},
        {"key": "crew", "search": {"to": "mars", "latest_departure": "2027-01-01"}, "after": {"trip": "cargo"}},
        {"key": "return", "search": {"from": "mars", "to": "earth"}, "after": {"trip": "crew"}},
    ])
    assert [(problem["code"], problem["trips"]) for problem in plan["problems"]] == [
        ("no_route_after_tie", ["crew"]), ("waits_for_unscheduled_trip", ["return"])]
    assert plan["trips"]["return"]["status"] == "not_searched"
    assert plan["last_arrival"]["jd"] == _arrive(plan["trips"]["cargo"])


def test_a_refused_trip_is_a_problem_with_its_own_message() -> None:
    plan = solve([{"key": "a", "search": {"to": "Europa"}}])
    (problem,) = plan["problems"]
    assert (problem["code"], problem["trips"]) == ("refused", ["a"])
    assert problem["message"] == plan["trips"]["a"]["message"]


@pytest.mark.parametrize(
    "trips",
    [
        [{"key": "a", "search": MARS_2026}, {"key": "a", "search": MARS_2026}],
        [{"key": f"t{n}", "search": MARS_2026} for n in range(7)],
        [],
    ],
)
def test_impossible_plans_are_rejected_before_any_work(trips: list[dict]) -> None:
    with pytest.raises(ValidationError):
        PlanRequest.model_validate({"trips": trips})


def test_the_endpoint_solves_a_plan(monkeypatch) -> None:
    monkeypatch.setattr(server.app, "middleware_stack", None)  # out of the shared rate-limit window
    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post("/planner/plans/solve", json={"trips": CARGO_THEN_CREW})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    duplicate = client.post("/planner/plans/solve", json={"trips": [CARGO_THEN_CREW[0]] * 2})
    assert duplicate.status_code == 422
