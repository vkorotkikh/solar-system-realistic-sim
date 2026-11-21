"""HTTP routes of the trip planner (epic issue C1): /planner/places and /planner/trips/search."""

from __future__ import annotations

import threading

import pytest
from fastapi.testclient import TestClient

import server
from planner.places import PLACES

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _fresh_middleware_stack(monkeypatch) -> None:
    # The trajectory rate limiter (60 requests a minute per client) is shared by the whole
    # suite; a fresh stack keeps these requests out of its window.
    monkeypatch.setattr(server.app, "middleware_stack", None)


def _search(body: dict):
    return client.post("/planner/trips/search", json=body)


def test_places_without_a_query_lists_every_place() -> None:
    response = client.get("/planner/places")
    assert response.status_code == 200
    ids = [place["id"] for place in response.json()["places"]]
    assert ids == [place.id for place in PLACES]
    assert (len(ids), ids[0], ids[-1]) == (468, "mercury", "lmo")  # 40 Sun-orbiting bodies, 423 moons, 5 named orbits


def test_places_with_a_query_returns_the_matches_as_json() -> None:
    response = client.get("/planner/places", params={"query": "europa"})
    assert response.status_code == 200
    assert response.json() == {"places": [{
        "id": "europa52",
        "name": "Europa (52)",
        "kind": "asteroid",
        "around": "sun",
        "default_orbit": {"id": "europa52-low-orbit", "name": "Low orbit around Europa (52), 100 km",
                          "periapsis_altitude_km": 100.0, "apoapsis_altitude_km": 100.0},
    }, {
        "id": "moon-jupiter-europa",
        "name": "Europa",
        "kind": "moon",
        "around": "jupiter",
        "default_orbit": {"id": "moon-jupiter-europa-low-orbit", "name": "Low orbit around Europa, 100 km",
                          "periapsis_altitude_km": 100.0, "apoapsis_altitude_km": 100.0},
    }]}


def test_places_rejects_an_overlong_query() -> None:
    assert client.get("/planner/places", params={"query": "x" * 101}).status_code == 422


def test_search_plans_earth_to_mars() -> None:
    response = _search({"to": "mars", "earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert (payload["resolved"]["from"]["orbit"]["id"], payload["resolved"]["to"]["orbit"]["id"]) == ("leo", "lmo")
    assert "2026-09-01" <= payload["trips"][0]["legs"][0]["depart"]["date"] <= "2026-12-31"


def test_search_plans_earth_to_venus_in_its_winter_2027_window() -> None:
    # A brute-force one-day scan puts the cheapest departure of this range on 2028-01-13.
    response = _search({"to": "venus", "earliest_departure": "2027-06-01", "latest_departure": "2028-06-01"})
    trip = response.json()["trips"][0]
    assert "2027-12-15" <= trip["legs"][0]["depart"]["date"] <= "2028-02-15"
    assert trip["legs"][0]["burns"][1]["orbit"] == "venus-low-orbit"


def test_search_plans_earth_to_jupiter_into_the_loose_capture_orbit() -> None:
    # Arriving with 5.6 to 7 km/s left over, the capture burn into a 1.1 to 200 radii
    # ellipse is 0.43 to 0.58 km/s; a low circular orbit would cost about 17 km/s.
    response = _search({"to": "jupiter", "earliest_departure": "2028-06-01", "latest_departure": "2029-06-01"})
    arrival = response.json()["trips"][0]["legs"][0]["burns"][1]
    assert arrival["orbit"] == "jupiter-capture-orbit"
    assert 0.4 < arrival["delta_v_km_s"] < 0.6


def test_a_refusal_is_an_answer_not_an_error() -> None:
    response = _search({"to": "Europa"})
    assert response.status_code == 200
    assert response.json() == {
        "status": "refused",
        "code": "unknown_place",
        "message": "No place is called 'Europa'. Look the place up to get its id.",
        "suggestions": ["europa52", "moon-jupiter-europa"],
    }


@pytest.mark.parametrize(
    "body",
    [
        {"to": "mars", "unexpected": 1},
        {"to": "mars", "flybys": 3},
        {"to": "mars", "flybys": True},
        {"from": 5, "to": "mars"},
        {"to": "mars", "earliest_departure": "next week"},
        {"to": "mars", "objective": "cheapest"},
        {},
    ],
)
def test_malformed_searches_are_rejected_before_any_work(body: dict) -> None:
    response = _search(body)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "trajectory_request_validation_error"


def test_an_oversized_search_body_is_refused_before_it_is_read() -> None:
    response = _search({"to": "mars", "padding": "x" * 40_000})
    assert response.status_code == 413


def test_a_busy_planner_answers_503(monkeypatch) -> None:
    monkeypatch.setattr(server, "_planner_search_guard", threading.BoundedSemaphore(1))
    assert server._planner_search_guard.acquire(blocking=False)
    response = _search({"to": "mars"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "planner_search_busy"
    assert response.headers["Retry-After"] == "2"


def test_a_timed_out_search_answers_504_and_its_worker_stops(monkeypatch) -> None:
    # An uncancelled ten-year Mercury search runs for about four seconds. The slot frees
    # within two seconds only if the timeout reached the worker.
    guard = threading.BoundedSemaphore(1)
    monkeypatch.setattr(server, "_planner_search_guard", guard)
    monkeypatch.setattr(server, "PLANNER_SEARCH_TIMEOUT_SECONDS", 0.05)
    response = _search({"to": "mercury", "earliest_departure": "2026-11-12"})
    assert response.status_code == 504
    assert response.json()["detail"]["code"] == "planner_search_timeout"
    assert guard.acquire(timeout=2.0)
    guard.release()
