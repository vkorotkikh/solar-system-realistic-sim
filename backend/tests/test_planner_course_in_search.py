"""The course report in the trip search (navigation issue N4b): "include": ["course"].

The report's own numbers are checked in test_planner_course.py. Here: that each
leg around the Sun gets its report, for rockets and torch ships, that the belt
dates agree with the path the same answer carries, and that the search's time
limit leaves the asteroid screen out rather than run over.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest
from pydantic import ValidationError

from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
import time

from planner import course, torch, trips
from planner.trips import TripSearchRequest, search_trips

BODIES = {body["id"]: body for body in ALL_BODIES}
TORCH_1G = {"kind": "torch", "acceleration_g": 1.0}
ONE_DAY = {"earliest_departure": "2026-11-12", "latest_departure": "2026-11-12"}
MARS_2026 = {"to": "mars", "earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"}


def search(body: dict, **options) -> dict:
    return search_trips(TripSearchRequest.model_validate(body), today=date(2026, 11, 12), **options)


def sun_distance_at(leg: dict, moment: dict) -> float:
    """How far from the Sun the leg's own path is at a moment the report names."""
    path = np.array(leg["path"])
    return float(np.interp(moment["jd"], path[:, 0], np.linalg.norm(path[:, 1:], axis=1)))


def test_only_known_extras_can_be_included() -> None:
    assert TripSearchRequest.model_validate({"to": "mars", "include": ["course", "path"]}).include == ["course", "path"]
    with pytest.raises(ValidationError):
        TripSearchRequest.model_validate({"to": "mars", "include": ["course", "course", "path"]})


def test_a_torch_leg_to_jupiter_reports_what_it_passes() -> None:
    answer = search({"to": "jupiter", **ONE_DAY, "drive": TORCH_1G, "include": ["course", "path"]})
    leg = answer["trips"][0]["legs"][0]
    report = leg["course"]
    assert set(report) == {"closest_sun_approach", "belts", "nearest_bodies", "nearest_asteroid", "context"}
    # Jupiter is round the far side that day, so the course first cuts a little inside Earth's orbit.
    closest = report["closest_sun_approach"]
    assert set(closest) == {"date", "au", "jd"} and closest["au"] == leg["closest_sun_approach_au"] < 0.99
    assert sun_distance_at(leg, closest) == pytest.approx(closest["au"], abs=1e-3)
    assert closest["jd"] == round(torch.solve("earth", "jupiter", 2_461_356.5, 1.0).closest_sun_jd, 4)  # the solver's own
    (belt,) = report["belts"]
    assert leg["depart"]["jd"] < closest["jd"] < belt["enters"]["jd"] and closest["date"] == "2026-11-12"
    assert belt["belt"] == "asteroid" and set(belt["enters"]) == set(belt["leaves"]) == {"date", "jd"}
    assert sun_distance_at(leg, belt["enters"]) == pytest.approx(2.06, abs=1e-3)
    assert sun_distance_at(leg, belt["leaves"]) == pytest.approx(3.28, abs=1e-3)
    assert belt["days_inside"] == pytest.approx(belt["leaves"]["jd"] - belt["enters"]["jd"], abs=2e-4)
    assert leg["depart"]["jd"] < belt["enters"]["jd"] < belt["leaves"]["jd"] < leg["arrive"]["jd"]
    assert len(report["nearest_bodies"]) == 3
    for body in report["nearest_bodies"]:
        assert set(body) == {"id", "name", "distance_km", "date", "jd"} and body["id"] not in ("earth", "jupiter")
        assert isinstance(body["distance_km"], int) and leg["depart"]["jd"] <= body["jd"] <= leg["arrive"]["jd"]
    asteroid = report["nearest_asteroid"]
    assert asteroid["status"] == "ok" and isinstance(asteroid["distance_km"], int) and asteroid["within_km"] == 1_500_000
    assert asteroid["date"] <= leg["arrive"]["date"] and asteroid["indicative"] is False
    assert "asteroid belt" in report["context"]
    assert answer["searched"]["complete"] is True


def test_a_torch_leg_to_ceres_ends_inside_the_belt() -> None:
    answer = search({"to": "ceres", **ONE_DAY, "drive": TORCH_1G, "include": ["course", "path"]})
    leg = answer["trips"][0]["legs"][0]
    (belt,) = leg["course"]["belts"]
    assert belt["belt"] == "asteroid" and belt["leaves"] is None  # Ceres orbits 2.8 AU from the Sun, inside the band
    assert sun_distance_at(leg, belt["enters"]) == pytest.approx(2.06, abs=1e-3)
    assert belt["days_inside"] == pytest.approx(leg["arrive"]["jd"] - belt["enters"]["jd"], abs=2e-4)


@pytest.mark.parametrize("g", [1.0, 0.3])
def test_a_torch_leg_to_pluto_crosses_the_asteroid_belt_and_ends_in_the_kuiper_belt(g: float) -> None:
    answer = search({"to": "pluto", **ONE_DAY, "drive": {"kind": "torch", "acceleration_g": g}, "include": ["course", "path"]})
    leg = answer["trips"][0]["legs"][0]
    asteroid, kuiper = leg["course"]["belts"]
    assert (asteroid["belt"], kuiper["belt"]) == ("asteroid", "kuiper") and kuiper["leaves"] is None  # Pluto is 35 AU out
    assert sun_distance_at(leg, kuiper["enters"]) == pytest.approx(30.0, abs=2e-3)
    assert asteroid["leaves"]["jd"] < kuiper["enters"]["jd"]
    assert "Kuiper belt" in leg["course"]["context"] and "asteroid belt" in leg["course"]["context"]


def test_a_rocket_leg_gets_a_course_report_and_nothing_else_changes() -> None:
    answer = search({**MARS_2026, "include": ["course"]})
    plain, with_paths = search(MARS_2026), search({**MARS_2026, "include": ["course", "path"]})
    assert [trip["labels"] for trip in answer["trips"]] == [trip["labels"] for trip in plain["trips"]]
    for trip, plain_trip, drawn in zip(answer["trips"], plain["trips"], with_paths["trips"]):
        (leg,) = trip["legs"]
        report = leg.pop("course")
        assert trip == plain_trip and "path" not in leg  # the path was not asked for
        assert report == drawn["legs"][0]["course"]
        # The closest approach to the Sun is the least distance along the leg's own path: near Earth's, soon after leaving.
        from_sun = np.linalg.norm(np.array(drawn["legs"][0]["path"])[:, 1:], axis=1)
        earth = np.linalg.norm(sample_body_state_from_elements(BODIES["earth"], leg["depart"]["jd"])["position"])
        assert report["closest_sun_approach"]["au"] == pytest.approx(from_sun.min(), abs=1e-4)
        assert earth - 0.01 < report["closest_sun_approach"]["au"] <= earth + 1e-4
        assert leg["depart"]["jd"] <= report["closest_sun_approach"]["jd"] < leg["depart"]["jd"] + 60
        # A transfer out to Mars never reaches the asteroid belt.
        assert report["belts"] == [] and "context" not in report
        assert {"earth", "mars"}.isdisjoint(body["id"] for body in report["nearest_bodies"])
        # The transfer reaches Mars at 1.5 AU or more, inside the catalog's range (it starts at 1.46 AU), so it is screened.
        assert report["nearest_asteroid"]["status"] == "ok" and report["nearest_asteroid"]["distance_km"] > 1_500_000
    assert answer["searched"]["complete"] is True


def test_without_include_there_is_no_report() -> None:
    for body in ({**MARS_2026}, {"to": "jupiter", **ONE_DAY, "drive": TORCH_1G}):
        answer = search(body)
        assert not any({"course", "path"} & set(leg) for trip in answer["trips"] for leg in trip["legs"])


def test_both_legs_of_a_round_trip_are_reported_and_a_hop_is_not() -> None:
    answer = search({"to": "jupiter", **ONE_DAY, "trip": "round_trip", "stay_days": 5, "drive": TORCH_1G, "include": ["course"]})
    out, back = answer["trips"][0]["legs"]
    assert out["course"]["belts"][0]["belt"] == back["course"]["belts"][0]["belt"] == "asteroid"
    assert back["course"]["belts"][0]["enters"]["jd"] > out["course"]["belts"][0]["leaves"]["jd"]
    # A trip around one planet has no leg around the Sun, so nothing to report, and it says so.
    for drive in ({"drive": TORCH_1G}, {}):
        moon = {"from": "leo", "to": "moon-earth-moon", **ONE_DAY, **drive}
        asked = search({**moon, "include": ["course", "path"]})
        assert not {"course", "path"} & set(asked["trips"][0]["legs"][0])
        assert sum("legs around the Sun" in note for note in asked["searched"]["notes"]) == 1
        assert not any("legs around the Sun" in note for note in search(moon)["searched"]["notes"])


def test_out_of_time_the_asteroid_screen_is_left_out_and_the_answer_says_so() -> None:
    # Less than the second a screen can take is left, so it is not started; the rest of the report is still there.
    answer = search({"to": "jupiter", **ONE_DAY, "drive": TORCH_1G, "include": ["course"]}, time_budget_s=0.9)
    report = answer["trips"][0]["legs"][0]["course"]
    assert answer["status"] == "ok" and report["nearest_asteroid"] == {"status": "not_searched"}
    assert report["belts"][0]["belt"] == "asteroid" and len(report["nearest_bodies"]) == 3
    assert answer["searched"]["complete"] is False
    assert any("asteroid" in note and "time" in note for note in answer["searched"]["notes"])


def test_reports_made_after_the_time_is_up_leave_the_nearest_bodies_out_and_say_so(monkeypatch) -> None:
    # Earth to Venus never reaches the asteroids, so only the nearest bodies are at stake. Every report is made
    # as if the search had just run out of time.
    report = course.report
    monkeypatch.setattr(trips.course, "report", lambda path, **given: report(path, **{**given, "deadline": time.monotonic()}))
    for body in ({"to": "venus", **ONE_DAY, "drive": TORCH_1G}, {"to": "venus", "earliest_departure": "2026-10-25",
                                                                "latest_departure": "2026-11-25"}):
        answer = search({**body, "include": ["course"]})
        made = [leg["course"] for trip in answer["trips"] for leg in trip["legs"]]
        assert made and all(one["nearest_bodies"] == [] and one["nearest_asteroid"] == {"status": "none_in_range"} for one in made)
        assert all(one["closest_sun_approach"]["au"] < 1.0 and one["belts"] == [] for one in made)
        assert answer["searched"]["complete"] is False
        assert sum("ran out of time" in note for note in answer["searched"]["notes"]) == 1


def test_a_rocket_leg_whose_orbit_cannot_be_sampled_says_so(monkeypatch) -> None:
    monkeypatch.setattr(trips.course, "rocket_path", lambda *leg: None)
    answer = search({**MARS_2026, "include": ["course", "path"]})
    assert answer["status"] == "ok" and not any({"course", "path"} & set(leg) for trip in answer["trips"] for leg in trip["legs"])
    assert any("from earth to mars could not be sampled" in note for note in answer["searched"]["notes"])


def test_a_rocket_search_out_of_time_leaves_the_asteroid_screen_out_too() -> None:
    answer = search({"to": "mars", "earliest_departure": "2026-10-25", "latest_departure": "2026-11-25", "include": ["course"]},
                    time_budget_s=0.95)
    assert answer["status"] == "ok" and answer["searched"]["complete"] is False
    assert all(leg["course"]["nearest_asteroid"] == {"status": "not_searched"} and len(leg["course"]["nearest_bodies"]) == 3
               for trip in answer["trips"] for leg in trip["legs"])


def test_a_rocket_round_trip_with_reports_stays_inside_the_search_budget() -> None:
    answer = search({"to": "mars", "earliest_departure": "2026-08-06", "latest_departure": "2028-08-06", "trip": "round_trip",
                     "stay_days": 30, "max_stay_days": 500, "include": ["course", "path"]})
    # The search itself stops at 10 s; the route allows 1.5 s more for what is cheap enough to finish after that.
    assert answer["status"] == "ok" and answer["searched"]["seconds"] < 11.5
    assert all("course" in leg and "path" in leg for trip in answer["trips"] for leg in trip["legs"])
