"""The course report (navigation issue N4a): what a course around the Sun passes.

References: hand-built straight courses whose crossings follow from a line and a
circle; scipy's DOP853 for two-body motion; and brute-force searches written
out here for the nearest body and the nearest of the 100,000 catalog asteroids.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import numpy as np
import pytest
from scipy.integrate import solve_ivp
from scipy.optimize import fsolve, minimize_scalar

from data.bodies import ALL_BODIES
from mission.orbital import MU_SUN_AU3_DAY2 as MU
from mission.orbital import sample_body_state_from_elements
from planner import course, torch

AU_KM = 149_597_870.7
BODIES = {body["id"]: body for body in ALL_BODIES}
JD_2026 = 2_461_041.5  # 2026-01-01
SAMPLE = Path(__file__).resolve().parents[2] / "public/data/asteroid-phase1/sample_top_10.json"


def position(body_id: str, jd: float) -> np.ndarray:
    return np.array(sample_body_state_from_elements(BODIES[body_id], jd)["position"])


def straight(start, end, days: float, rows: int = 181, depart_jd: float = JD_2026) -> np.ndarray:
    """A course along the line from start to end at constant speed: rows of [jd, x, y, z]."""
    share = np.linspace(0.0, 1.0, rows)[:, None]
    return np.column_stack([depart_jd + days * share, np.array(start) + share * (np.array(end) - np.array(start))])


def flat(crossing: dict) -> tuple:
    """A belt crossing as (belt, day in, day out, days inside), days counted from 2026-01-01; None for an open end."""
    return (crossing["belt"], crossing["enters"] and crossing["enters"]["jd"] - JD_2026,
            crossing["leaves"] and crossing["leaves"]["jd"] - JD_2026, crossing["days_inside"])


def two_body_rhs(_, y):
    return np.concatenate([y[3:], -MU * y[:3] / np.linalg.norm(y[:3]) ** 3])


# ---------------------------------------------------------------------------------------- rocket legs
def test_two_body_motion_on_a_circle_is_the_closed_form() -> None:
    speed = math.sqrt(MU)  # circular speed at 1 AU, so the angle after t days is sqrt(mu) t
    days = np.array([0.0, 100.0, 365.25, 1000.0])
    flown = course.two_body([1.0, 0.0, 0.0], [0.0, speed, 0.0], days)
    assert flown == pytest.approx(np.column_stack([np.cos(speed * days), np.sin(speed * days), 0 * days]), abs=1e-12)


@pytest.mark.parametrize("velocity", [[0.003, 0.020, 0.004],  # an ellipse: 35 km/s at 1 AU
                                      [0.010, 0.030, 0.002]])  # a hyperbola: 55 km/s, above the 42 km/s escape speed
def test_two_body_motion_matches_an_independent_integration(velocity: list[float]) -> None:
    days = np.array([1.0, 200.0, 900.0, 3000.0])
    start = np.array([1.0, 0.0, 0.0, *velocity])
    truth = solve_ivp(two_body_rhs, (0.0, 3000.0), start, method="DOP853", rtol=1e-12, atol=1e-14, t_eval=days).y[:3].T
    assert course.two_body(start[:3], start[3:], days) == pytest.approx(truth, abs=1e-8)


def test_two_body_motion_on_a_parabola_is_barkers_equation() -> None:
    # Escape speed at periapsis 1 AU. With D = tan(half the angle from periapsis), time = sqrt(2/mu) (D + D^3/3)
    # and the position is (1 - D^2, 2 D): at D = 1 that is (0, 2), after sqrt(2/mu) x 4/3 days.
    flown = course.two_body([1.0, 0.0, 0.0], [0.0, math.sqrt(2 * MU), 0.0], [math.sqrt(2 / MU) * 4 / 3])
    assert flown[0] == pytest.approx([0.0, 2.0, 0.0], abs=1e-9)


def test_two_body_motion_survives_a_long_arc_where_plain_newton_runs_away() -> None:
    # A low, eccentric orbit followed for 2,850 days: an unguarded Newton iteration on Kepler's equation diverges here.
    start = np.array([-0.42, 0.17, -0.45, 0.0008, -0.005, 0.0057])
    truth = solve_ivp(two_body_rhs, (0.0, 2850.0), start, method="DOP853", rtol=1e-13, atol=1e-15).y[:3, -1]
    assert course.two_body(start[:3], start[3:], [2850.0])[0] == pytest.approx(truth, abs=1e-8)


@pytest.mark.parametrize(("target", "days"), [("mars", 259.0), ("eris", 3650.0)])  # the second leaves on a hyperbola
def test_a_rocket_leg_is_sampled_from_one_body_to_the_other(target: str, days: float) -> None:
    depart = JD_2026 + 315  # 2026-11-12, in the 2026 window to Mars
    path = course.rocket_path("earth", target, depart, depart + days)
    assert path.shape == (181, 4)
    assert np.diff(path[:, 0]) == pytest.approx(np.full(180, days / 180), abs=1e-9)
    assert path[0, 1:] == pytest.approx(position("earth", depart), abs=1e-12)
    assert np.linalg.norm(path[-1, 1:] - position(target, depart + days)) * AU_KM < 1_000.0
    # Between the ends it coasts. Independently: find by shooting the launch velocity whose integrated orbit reaches
    # the last row on time, then compare where that orbit is half-way.
    def coast(velocity, until):
        return solve_ivp(two_body_rhs, (0.0, until), np.concatenate([path[0, 1:], velocity]), method="DOP853",
                         rtol=1e-12, atol=1e-14).y[:3, -1]
    velocity = fsolve(lambda v: coast(v, days) - path[-1, 1:], (path[1, 1:] - path[0, 1:]) / (days / 180), xtol=1e-13)
    assert np.linalg.norm(coast(velocity, days) - path[-1, 1:]) < 1e-9
    assert np.linalg.norm(path[90, 1:] - coast(velocity, days / 2)) * AU_KM < 100.0


def test_a_rocket_leg_with_no_transfer_has_no_path(monkeypatch) -> None:
    monkeypatch.setattr(course, "solve_direct_lambert", lambda *_, **__: {"solution": None})
    assert course.rocket_path("earth", "mars", JD_2026, JD_2026 + 200) is None


# ---------------------------------------------------------------------------------------- the Sun and the belts
def test_the_closest_approach_to_the_sun_of_a_line_is_the_foot_of_the_perpendicular() -> None:
    # From (-3, 0.5, 0) to (5, 0.5, 0) in 400 days: closest at x = 0, 3/8 of the way, 0.5 AU from the Sun.
    passing = course.sun_approach(straight([-3.0, 0.5, 0.0], [5.0, 0.5, 0.0], 400.0))
    assert passing["au"] == pytest.approx(0.5, abs=1e-12) and passing["jd"] == pytest.approx(JD_2026 + 150.0, abs=1e-6)
    # A course heading outward is closest where it starts.
    outward = course.sun_approach(straight([1.0, 0.0, 0.0], [5.2, 0.0, 0.0], 300.0))
    assert outward["au"] == pytest.approx(1.0, abs=1e-12) and outward["jd"] == pytest.approx(JD_2026, abs=1e-6)


def test_a_radial_course_to_jupiters_distance_crosses_the_asteroid_belt_once() -> None:
    # 1 to 5.2 AU in 300 days: at 2.06 AU after 300 x 1.06/4.2 days, at 3.28 AU after 300 x 2.28/4.2 days.
    crossings = course.belt_crossings(straight([1.0, 0.0, 0.0], [5.2, 0.0, 0.0], 300.0))
    assert len(crossings) == 1
    assert flat(crossings[0]) == pytest.approx(("asteroid", 300 * 1.06 / 4.2, 300 * 2.28 / 4.2, 300 * 1.22 / 4.2), abs=1e-6)


def test_a_course_that_starts_or_ends_inside_a_belt_has_an_open_crossing() -> None:
    ends_inside = course.belt_crossings(straight([1.0, 0.0, 0.0], [2.7, 0.0, 0.0], 100.0))
    assert [flat(crossing) for crossing in ends_inside] == [
        pytest.approx(("asteroid", 100 * 1.06 / 1.7, None, 100 * 0.64 / 1.7), abs=1e-6)]
    starts_inside = course.belt_crossings(straight([0.0, 2.5, 0.0], [0.0, 1.0, 0.0], 60.0))
    assert [flat(crossing) for crossing in starts_inside] == [
        pytest.approx(("asteroid", None, 60 * 0.44 / 1.5, 60 * 0.44 / 1.5), abs=1e-6)]


def test_a_course_that_dips_inside_the_belts_inner_edge_crosses_the_belt_twice() -> None:
    # The line y = 1.5 from x = -3 to 3 in 600 days: it meets the 3.28 AU circle at x = -+2.91692 and the
    # 2.06 AU circle at x = -+1.41195, so it is in the belt between those on the way in and again on the way out.
    crossings = course.belt_crossings(straight([-3.0, 1.5, 0.0], [3.0, 1.5, 0.0], 600.0))
    outer, inner = math.sqrt(3.28**2 - 1.5**2), math.sqrt(2.06**2 - 1.5**2)
    day = lambda x: 100.0 * (x + 3.0)  # noqa: E731
    # The distance from the Sun is curved between rows, so the interpolated times are good to about an hour.
    assert [flat(crossing) for crossing in crossings] == [
        pytest.approx(("asteroid", day(-outer), day(-inner), 100.0 * (outer - inner)), abs=0.05),
        pytest.approx(("asteroid", day(inner), day(outer), 100.0 * (outer - inner)), abs=0.05)]


def test_a_course_to_the_outer_system_crosses_both_belts_in_order() -> None:
    # 1 to 61 AU in 600 days, 0.1 AU a day: the asteroid belt on days 10.6 to 22.8, the Kuiper belt on days 290 to 490.
    crossings = course.belt_crossings(straight([1.0, 0.0, 0.0], [61.0, 0.0, 0.0], 600.0, rows=601))
    assert [flat(crossing) for crossing in crossings] == [pytest.approx(("asteroid", 10.6, 22.8, 12.2), abs=1e-6),
                                                          pytest.approx(("kuiper", 290.0, 490.0, 200.0), abs=1e-6)]
    # The same line flown inward meets the Kuiper belt first: 50 AU on day 110, 30 AU on day 310, then the asteroid belt.
    inward = course.belt_crossings(straight([61.0, 0.0, 0.0], [1.0, 0.0, 0.0], 600.0, rows=601))
    assert [flat(crossing) for crossing in inward] == [pytest.approx(("kuiper", 110.0, 310.0, 200.0), abs=1e-6),
                                                       pytest.approx(("asteroid", 577.2, 589.4, 12.2), abs=1e-6)]
    assert course.belt_crossings(straight([1.0, 0.0, 0.0], [0.7, 0.0, 0.0], 50.0)) == []


# ---------------------------------------------------------------------------------------- catalogued bodies
def brute_force_nearest(path: np.ndarray, body_id: str) -> tuple[float, float]:
    """Closest distance (AU) of a straight constant-speed course to a body, and when: dense search, then refined."""
    def distance(jd: float) -> float:
        share = (jd - path[0, 0]) / (path[-1, 0] - path[0, 0])
        return float(np.linalg.norm(path[0, 1:] + share * (path[-1, 1:] - path[0, 1:]) - position(body_id, jd)))
    times = np.linspace(path[0, 0], path[-1, 0], 2001)
    nearest = int(np.argmin([distance(jd) for jd in times]))
    found = minimize_scalar(distance, bounds=(times[max(nearest - 1, 0)], times[min(nearest + 1, 2000)]),
                            method="bounded", options={"xatol": 1e-9})
    return float(found.fun), float(found.x)


def test_the_nearest_bodies_are_the_ones_a_brute_force_search_finds() -> None:
    # A course from Earth through the place Vesta will be 30 days later, and as far again beyond it.
    start, vesta = position("earth", JD_2026), position("vesta", JD_2026 + 30)
    path = straight(start, 2 * vesta - start, 60.0)
    nearest = course.nearest_bodies(path, skip={"earth"})
    assert [body["id"] for body in nearest][:1] == ["vesta"] and len(nearest) == 3
    assert nearest[0]["name"] == "Vesta" and nearest[0]["distance_km"] < 1.0
    assert nearest[0]["jd"] == pytest.approx(JD_2026 + 30, abs=1e-6)
    everyone = sorted((brute_force_nearest(path, body_id) + (body_id,) for body_id in course.SUN_BODIES if body_id != "earth"))
    for found, (distance, jd, body_id) in zip(nearest[1:], everyone[1:3]):
        assert found["id"] == body_id
        assert found["distance_km"] == pytest.approx(distance * AU_KM, rel=1e-4)
        assert found["jd"] == pytest.approx(jd, abs=0.1)  # a distant body's closest moment is a shallow minimum
    assert "vesta" not in [body["id"] for body in course.nearest_bodies(path, skip={"earth", "vesta"})]


# ---------------------------------------------------------------------------------------- catalogued asteroids
def test_the_asteroid_catalog_decodes_to_the_published_sample() -> None:
    catalog = course.asteroids()
    assert len(catalog["id"]) == 100_000
    names = {"a_au": "a_au", "e": "e", "i_deg": "i_deg", "node_deg": "ascending_node_deg", "argp_deg": "arg_periapsis_deg",
             "mean_anomaly_deg": "mean_anomaly_deg", "period_days": "period_days", "epoch_jd": "epoch_jd"}
    for row, expected in enumerate(json.loads(SAMPLE.read_text())):
        assert int(catalog["id"][row]) == expected["source_id"]
        for ours, theirs in names.items():
            assert catalog[ours][row] == expected[theirs], (row, ours)


def asteroid_positions(catalog: dict, rows: np.ndarray, jds: np.ndarray) -> np.ndarray:
    """Two-body positions (len(jds), len(rows), 3), written out independently of the module."""
    a, e = catalog["a_au"][rows], catalog["e"][rows]
    inclination, node, periapsis = (np.radians(catalog[key][rows]) for key in ("i_deg", "node_deg", "argp_deg"))
    mean = np.radians(catalog["mean_anomaly_deg"][rows]) + 2 * np.pi / catalog["period_days"][rows] * (
        np.asarray(jds, float)[:, None] - catalog["epoch_jd"][rows])
    eccentric = mean.copy()
    for _ in range(15):  # Newton from the mean anomaly: ample below the catalog's largest eccentricity, 0.56
        eccentric -= (eccentric - e * np.sin(eccentric) - mean) / (1 - e * np.cos(eccentric))
    x, y = a * (np.cos(eccentric) - e), a * np.sqrt(1 - e * e) * np.sin(eccentric)
    # perifocal to ecliptic: turn by the argument of periapsis, tilt by the inclination, turn by the node
    xw, yw = x * np.cos(periapsis) - y * np.sin(periapsis), x * np.sin(periapsis) + y * np.cos(periapsis)
    return np.stack([xw * np.cos(node) - yw * np.cos(inclination) * np.sin(node),
                     xw * np.sin(node) + yw * np.cos(inclination) * np.cos(node),
                     yw * np.sin(inclination)], axis=-1)


def brute_force_asteroids(path: np.ndarray) -> np.ndarray:
    """True closest distance (AU) of a straight constant-speed course to every asteroid that could be the nearest
    or pass within 1.5 million km; infinity for the rest. It samples the course on its own grid, not the path's rows."""
    catalog = course.asteroids()
    began, ended = path[0, 0], path[-1, 0]

    def along(jds):
        return path[0, 1:] + ((np.asarray(jds, float) - began) / (ended - began))[..., None] * (path[-1, 1:] - path[0, 1:])
    times = np.linspace(began, ended, 61)
    at_times = np.full(100_000, np.inf)
    for first in range(0, 100_000, 5_000):
        rows = np.arange(first, first + 5_000)
        at_times[rows] = np.linalg.norm(asteroid_positions(catalog, rows, times) - along(times)[:, None, :], axis=-1).min(0)
    # Between two sample times an asteroid and the course close by at most half a step of their fastest relative
    # motion: the course's own speed plus 0.02 AU a day, more than any main-belt asteroid moves.
    step = times[1] - times[0]
    slack = 0.5 * step * (np.linalg.norm(path[-1, 1:] - path[0, 1:]) / (ended - began) + 0.02)
    out = np.full(100_000, np.inf)
    dense = np.linspace(began, ended, 2401)
    for row in np.flatnonzero(at_times < max(at_times.min(), 1.5e6 / AU_KM) + slack):
        def distance(jds, row=row):
            return np.linalg.norm(asteroid_positions(catalog, np.array([row]), np.atleast_1d(jds))[:, 0] - along(np.atleast_1d(jds)), axis=-1)
        sampled = distance(dense)
        nearest = int(sampled.argmin())
        out[row] = sampled[nearest]
        if sampled[nearest] < 0.03:  # close enough to matter: pin it down
            out[row] = minimize_scalar(lambda jd: float(distance(jd)[0]), method="bounded", options={"xatol": 1e-9},
                                       bounds=(dense[max(nearest - 1, 0)], dense[min(nearest + 1, 2400)])).fun
    return out


def test_the_nearest_asteroid_is_the_one_a_brute_force_search_finds() -> None:
    path = straight([1.0, 0.0, 0.0], [5.2, 0.0, 0.0], 300.0, depart_jd=2_461_000.5)
    found = course.nearest_asteroid(path)
    truth = brute_force_asteroids(path)
    assert found["status"] == "ok"
    assert found["spk_id"] == int(course.asteroids()["id"][truth.argmin()])
    assert found["number"] == found["spk_id"] - 20_000_000  # a numbered asteroid: JPL's id is 20,000,000 + the number
    # An asteroid's path sags up to 3,800 km between rows 1.7 days apart, which is how exact the distance can be.
    assert found["distance_km"] == pytest.approx(truth.min() * AU_KM, abs=5_000.0)
    assert found["count_within"] == int((truth < 1_500_000.0 / AU_KM).sum()) > 0 and found["within_km"] == 1_500_000.0
    assert path[0, 0] <= found["jd"] <= path[-1, 0]
    assert found["indicative"] is False  # within a year of the catalog's epoch, 2026-06-09


def test_an_unnumbered_asteroid_with_its_own_epoch_is_found_where_its_elements_put_it() -> None:
    # 609 of the catalog's asteroids have no number, and 33 of those carry elements for an older date than the rest.
    # A course aimed through where this one will be must find it, at next to no distance.
    catalog = course.asteroids()
    row = int(np.flatnonzero(catalog["id"] == 50_533_865)[0])
    assert catalog["epoch_jd"][row] == 2_458_979.5  # 2020-05-10; the rest of the catalog is 2026-06-09
    meeting = asteroid_positions(catalog, np.array([row]), np.array([2_461_030.5]))[0, 0]
    start = position("earth", 2_461_000.5)
    found = course.nearest_asteroid(straight(start, 2 * meeting - start, 60.0, depart_jd=2_461_000.5))
    assert (found["spk_id"], found["number"]) == (50_533_865, None)
    assert found["distance_km"] < 1.0 and found["jd"] == pytest.approx(2_461_030.5, abs=1e-4)
    assert found["indicative"] is True  # five and a half years from its own epoch
    # Met on the last row of a course whose row count is not one more than a multiple of ten: the tail is screened too.
    at_the_end = course.nearest_asteroid(straight(start, meeting, 30.0, rows=176, depart_jd=2_461_000.5))
    assert at_the_end["spk_id"] == 50_533_865 and at_the_end["distance_km"] < 1.0


def test_an_asteroid_named_years_from_the_catalog_epoch_is_marked_indicative() -> None:
    later = course.nearest_asteroid(straight([1.0, 0.0, 0.0], [5.2, 0.0, 0.0], 300.0, depart_jd=2_461_000.5 + 1_500))
    assert later["status"] == "ok" and later["indicative"] is True


def test_the_asteroid_screen_is_skipped_out_of_range_or_out_of_time() -> None:
    inner = straight([1.0, 0.0, 0.0], [0.7, 0.0, 0.0], 50.0)  # Earth to Venus never reaches the catalog's distances
    assert course.nearest_asteroid(inner) == {"status": "none_in_range"}
    through = straight([1.0, 0.0, 0.0], [5.2, 0.0, 0.0], 300.0)
    course.asteroids()  # read the catalog first, so the clock below times only the decision
    started = time.monotonic()
    assert course.nearest_asteroid(through, deadline=time.monotonic() + 0.05) == {"status": "not_searched"}
    assert time.monotonic() - started < 0.05


# ---------------------------------------------------------------------------------------- the whole report
def test_the_report_of_a_torch_course_to_jupiter_puts_the_belt_where_the_path_is() -> None:
    trip = torch.solve("earth", "jupiter", JD_2026 + 315, 1.0, want_path=True)
    report = course.report(trip.path, skip={"earth", "jupiter"}, sun=(trip.closest_sun_au, trip.closest_sun_jd))
    assert set(report) == {"closest_sun_approach", "belts", "nearest_bodies", "nearest_asteroid", "context"}
    assert report["closest_sun_approach"] == {"au": trip.closest_sun_au, "jd": trip.closest_sun_jd}
    (belt,) = report["belts"]
    distance = np.linalg.norm(trip.path[:, 1:], axis=1)
    assert np.interp([belt["enters"]["jd"], belt["leaves"]["jd"]], trip.path[:, 0], distance) == pytest.approx([2.06, 3.28], abs=1e-9)
    # From rest at Earth at 1 g, a course straight out from the Sun is in the band for
    # (sqrt(2 a 2.29) - sqrt(2 a 1.07)) / a = 0.97 days and one at right angles to that for 0.86 days.
    assert belt["belt"] == "asteroid" and 0.8 < belt["days_inside"] < 1.0
    assert belt["days_inside"] == pytest.approx(belt["leaves"]["jd"] - belt["enters"]["jd"], abs=1e-9)
    assert len(report["nearest_bodies"]) == 3 and report["nearest_asteroid"]["status"] == "ok"
    assert {"earth", "jupiter"}.isdisjoint(body["id"] for body in report["nearest_bodies"])
    hurried = course.report(trip.path, skip={"earth", "jupiter"}, deadline=time.monotonic())
    assert hurried["nearest_asteroid"] == {"status": "not_searched"} and hurried["belts"] == report["belts"]
    assert "asteroid belt" in report["context"] and "Kuiper" not in report["context"]


def test_the_report_of_a_course_to_pluto_gives_kuiper_belt_dates_and_one_to_venus_no_belt() -> None:
    for g in (1.0, 0.3):
        trip = torch.solve("earth", "pluto", JD_2026 + 315, g, want_path=True)
        report = course.report(trip.path, skip={"earth", "pluto"})
        assert [belt["belt"] for belt in report["belts"]] == ["asteroid", "kuiper"]
        kuiper = report["belts"][1]
        assert kuiper["leaves"] is None  # Pluto is inside the belt, 35 AU from the Sun
        assert np.interp(kuiper["enters"]["jd"], trip.path[:, 0], np.linalg.norm(trip.path[:, 1:], axis=1)) == pytest.approx(30.0)
        assert "Kuiper belt" in report["context"]
    venus = torch.solve("earth", "venus", JD_2026 + 315, 1.0, want_path=True)
    report = course.report(venus.path, skip={"earth", "venus"})
    assert report["belts"] == [] and "context" not in report and report["nearest_asteroid"] == {"status": "none_in_range"}
    assert report["closest_sun_approach"]["au"] == pytest.approx(venus.closest_sun_au, abs=1e-4)
