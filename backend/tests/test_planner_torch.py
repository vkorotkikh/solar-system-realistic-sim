"""Torch-ship trips around the Sun (navigation issue N2).

Three references, none of them the solver's own integration. The flip-and-burn
closed forms: T = 2 sqrt(d/a), delta-v = 2 sqrt(d a), and a receding target
worked by hand. scipy's DOP853 integrator flying each solved thrust programme
again, with the equations of motion written out here. And the work-energy
identity, which needs no integrator at all.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy.integrate import solve_ivp
from scipy.optimize import minimize_scalar

from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
from planner import torch

AU_KM = 149_597_870.7
MU_SUN = 1.32712440018e11 * 86_400.0**2 / AU_KM**3  # AU^3/day^2
G_AU_DAY2 = 9.80665e-3 * 86_400.0**2 / AU_KM  # 1 g in AU/day^2
KM_S = AU_KM / 86_400.0  # 1 AU/day in km/s
BODIES = {body["id"]: body for body in ALL_BODIES}
JD_2026 = 2_461_041.5  # 2026-01-01
CLEAR = JD_2026 + 400  # 2027-02-05, two weeks before a Mars opposition: the course to Mars stays outside 1 AU
CONJUNCTION = JD_2026 + 818  # 2028-03-29, Mars behind the Sun: the course to Mars passes 0.03 AU from it


def state(body_id: str):
    def at(jd: float):
        sample = sample_body_state_from_elements(BODIES[body_id], jd)
        return np.array(sample["position"]), np.array(sample["velocity"])
    return at


def at_rest(position):
    return lambda jd: (np.array(position, float), np.zeros(3))


class Flown:
    """A solved trip flown again by DOP853 under the equations written out here: the Sun's gravity
    plus a thrust of constant size whose direction follows the documented law."""

    def __init__(self, trip, start, mu: float = MU_SUN) -> None:
        acc = trip.acceleration_g * G_AU_DAY2
        t1, t2 = trip.burn_days
        total = t1 + t2
        tilted = (0.0, 0.0, 0.0, 0.0)  # the tilted stretch: its start, quarter, three-quarter and end, in days
        if trip.tilt_rad:
            begin, end = trip.tilt_window
            tilted = tuple(total * mark for mark in (begin, begin + (end - begin) / 4, end - (end - begin) / 4, end))
        cuts = sorted({0.0, t1, total, *tilted})
        y = np.concatenate(start(trip.depart_jd))
        self.arcs = []
        for lo, hi in zip(cuts[:-1], cuts[1:]):
            middle = 0.5 * (lo + hi)
            thrust = trip.directions[0] if middle < t1 else trip.directions[1]
            if tilted[0] < middle < tilted[3]:
                across = trip.tilt_toward - np.dot(trip.tilt_toward, thrust) * thrust
                sign = 1.0 if middle < tilted[1] or middle > tilted[2] else -1.0
                thrust = math.cos(trip.tilt_rad) * thrust + sign * math.sin(trip.tilt_rad) * across / np.linalg.norm(across)

            def rhs(_, y, thrust=thrust):
                return np.concatenate([y[3:], -mu * y[:3] / np.linalg.norm(y[:3]) ** 3 + acc * thrust])
            arc = solve_ivp(rhs, (lo, hi), y, method="DOP853", rtol=1e-12, atol=1e-14, dense_output=True)
            self.arcs.append((lo, hi, arc.sol))
            y = arc.y[:, -1]
        self.position, self.velocity = y[:3], y[3:]

    def positions(self, days) -> np.ndarray:
        return np.array([next(sol for _, hi, sol in self.arcs if day <= hi)(day)[:3]
                         for day in np.minimum(days, self.arcs[-1][1])])

    def closest(self) -> tuple[float, float]:
        """Closest distance to the Sun, and the day after departure it happens."""
        best = (math.inf, 0.0)
        for lo, hi, sol in self.arcs:
            def distance(day, sol=sol):
                return np.linalg.norm(sol(day)[:3], axis=0)
            days = np.linspace(lo, hi, 2001)
            nearest = int(distance(days).argmin())
            found = minimize_scalar(distance, bounds=(days[max(nearest - 1, 0)], days[min(nearest + 1, 2000)]),
                                    method="bounded", options={"xatol": 1e-12})
            best = min(best, (float(found.fun), float(found.x)))
        return best


@pytest.mark.parametrize(("g", "published_hours"), [(0.3, 257), (1.0, 141), (7.0, 53), (12.0, 41)])
def test_in_free_space_between_bodies_at_rest_the_trip_is_the_closed_form(g: float, published_hours: int) -> None:
    # 4.2 AU is the Earth-Jupiter distance of the published role-playing-game calculator, whose
    # hours are this formula rounded.
    distance = 4.2
    trip = torch.solve(at_rest([1.0, 0.0, 0.0]), at_rest([5.2, 0.0, 0.0]), JD_2026, g, mu=0.0, keep_out_au=0.0)
    assert trip.days == pytest.approx(2 * math.sqrt(distance / (g * G_AU_DAY2)), rel=1e-9)
    assert sum(trip.delta_v_km_s) == pytest.approx(2 * math.sqrt(distance * g * G_AU_DAY2) * KM_S, rel=1e-9)
    assert trip.peak_speed_km_s == pytest.approx(math.sqrt(distance * g * G_AU_DAY2) * KM_S, rel=1e-9)
    assert trip.burn_days[0] == pytest.approx(trip.burn_days[1], rel=1e-9)
    assert round(trip.days * 24) == published_hours


def test_in_free_space_a_target_moving_away_is_chased_by_a_longer_first_burn() -> None:
    # One dimension, by hand. The target starts D ahead and recedes at w; the ship burns forward for t1 and
    # back for t2. Matching speed needs a (t1 - t2) = w, so t1 = t2 + w/a. Matching position needs
    # a t1^2/2 + a t1 t2 - a t2^2/2 = D + w (t1 + t2), which reduces to t2^2 = D/a + (w/a)^2 / 2.
    acc, gap, speed = G_AU_DAY2, 1.0, 100.0 / KM_S  # 1 g, 1 AU, 100 km/s
    t2 = math.sqrt(gap / acc + (speed / acc) ** 2 / 2)
    t1 = t2 + speed / acc
    origin = at_rest([1.0, 0.0, 0.0])

    def target(jd: float):
        return np.array([2.0 + speed * (jd - JD_2026), 0.0, 0.0]), np.array([speed, 0.0, 0.0])
    assert torch.free_space_days(origin, target, JD_2026, 1.0) == pytest.approx(t1 + t2, rel=1e-9)
    trip = torch.solve(origin, target, JD_2026, 1.0, mu=0.0, keep_out_au=0.0)
    assert trip.burn_days == pytest.approx((t1, t2), rel=1e-9)
    assert trip.directions[0] == pytest.approx([1.0, 0.0, 0.0], abs=1e-9)
    assert trip.directions[1] == pytest.approx([-1.0, 0.0, 0.0], abs=1e-9)


@pytest.mark.parametrize("g", [0.1, 0.3, 1.0, 3.0, 12.0])
def test_solved_trips_arrive_and_clear_the_sun_when_flown_again_independently(g: float) -> None:
    for origin, target in (("earth", "mars"), ("earth", "venus"), ("earth", "mercury"),
                           ("earth", "jupiter"), ("mars", "ceres"), ("earth", "eris")):
        for days in (0, 818, 1900):
            trip = torch.solve(origin, target, JD_2026 + days, g)
            flown = Flown(trip, state(origin))
            arrival_position, arrival_velocity = state(target)(trip.arrive_jd)
            case = f"{origin}-{target} day {days} at {g} g"
            assert np.linalg.norm(flown.position - arrival_position) * AU_KM < 100.0, case
            assert np.linalg.norm(flown.velocity - arrival_velocity) * KM_S * 1000.0 < 1.0, case
            closest = flown.closest()[0]
            assert closest >= 0.1 - 1e-5, case
            assert closest == pytest.approx(trip.closest_sun_au, abs=1e-5), case


@pytest.mark.parametrize(("origin", "target", "g"), [("earth", "mars", 1.0), ("earth", "mercury", 0.3),
                                                    ("earth", "jupiter", 0.1), ("mars", "ceres", 12.0)])
def test_each_burn_changes_the_orbital_energy_by_the_work_the_thrust_does(origin: str, target: str, g: float) -> None:
    # Energy per kilogram, v^2/2 - mu/r, changes over a burn by thrust . displacement however gravity
    # bends the path between. No integrator is involved: the ends come from the catalog.
    trip = torch.solve(origin, target, JD_2026 + 200, g, keep_out_au=0.0)
    (r0, v0), (r2, v2) = state(origin)(trip.depart_jd), state(target)(trip.arrive_jd)
    r1 = trip.flip_position_au

    def energy(position, speed):
        return 0.5 * speed**2 - MU_SUN / np.linalg.norm(position)
    at_flip = energy(r1, trip.peak_speed_km_s / KM_S)
    acc = g * G_AU_DAY2
    assert at_flip - energy(r0, np.linalg.norm(v0)) == pytest.approx(acc * trip.directions[0] @ (r1 - r0), rel=1e-6)
    assert energy(r2, np.linalg.norm(v2)) - at_flip == pytest.approx(acc * trip.directions[1] @ (r2 - r1), rel=1e-6)


def test_a_course_through_the_sun_is_bent_to_the_keep_out_distance() -> None:
    straight = torch.solve("earth", "mars", CONJUNCTION, 1.0, keep_out_au=0.0)
    bent = torch.solve("earth", "mars", CONJUNCTION, 1.0)
    assert straight.tilt_rad == 0.0 and straight.closest_sun_au < 0.05
    assert bent.tilt_rad != 0.0
    assert bent.closest_sun_au == pytest.approx(0.1 * 1.0001, abs=2e-6)
    assert 0.0 < bent.days / straight.days - 1.0 < 0.01  # measured: under 0.6% for Earth to Mars
    for trip in (straight, bent):  # when the closest approach happens, to within ten seconds
        assert trip.closest_sun_jd - trip.depart_jd == pytest.approx(Flown(trip, state("earth")).closest()[1], abs=1e-4)


def test_the_bow_is_centred_on_the_close_pass_even_when_that_is_just_before_arrival() -> None:
    # Coming in from Pluto, the unbent course swings past the Sun nine tenths of the way through the flight.
    # A bow across the whole flight cannot reach that far along: it has to sit where the close pass is.
    depart_jd = JD_2026 + 564
    unbent = torch.solve("pluto", "venus", depart_jd, 1.0, keep_out_au=0.0)
    centre = (unbent.closest_sun_jd - depart_jd) / unbent.days
    assert unbent.closest_sun_au < 0.05 and centre == pytest.approx(0.90, abs=0.01)
    trip = torch.solve("pluto", "venus", depart_jd, 1.0)
    assert trip.tilt_window == pytest.approx((2 * centre - 1, 1.0))
    flown = Flown(trip, state("pluto"))
    assert flown.closest()[0] == pytest.approx(0.1 * 1.0001, abs=2e-6)
    assert np.linalg.norm(flown.position - state("venus")(trip.arrive_jd)[0]) * AU_KM < 100.0


def test_a_course_aimed_through_the_centre_of_the_sun_bows_toward_the_ecliptic_pole() -> None:
    # Gravity off and both ends at rest on a line through the Sun: no side is better, so the pole is used.
    origin = at_rest([-1.0, 0.0, 0.0])
    trip = torch.solve(origin, at_rest([1.5, 0.0, 0.0]), JD_2026, 1.0, mu=0.0)
    assert trip.tilt_toward == pytest.approx([0.0, 0.0, 1.0])
    flown = Flown(trip, origin, mu=0.0)
    closest, day = flown.closest()
    assert closest == pytest.approx(0.1 * 1.0001, abs=2e-6)
    assert flown.positions([day])[0][2] > 0.09  # the close pass is over the Sun's pole
    assert flown.position == pytest.approx([1.5, 0.0, 0.0], abs=1e-6)
    assert trip.days > 2 * math.sqrt(2.5 / G_AU_DAY2)


def test_a_course_that_already_clears_the_sun_is_not_bent() -> None:
    trip = torch.solve("earth", "mars", CLEAR, 1.0)
    assert trip.tilt_rad == 0.0 and trip.tilt_toward is None and trip.tilt_window is None
    assert trip.closest_sun_au == pytest.approx(np.linalg.norm(state("earth")(CLEAR)[0]), abs=1e-9)
    assert trip.closest_sun_jd == pytest.approx(CLEAR, abs=1e-6)


# The Metis day is one a coarser integration (12 collocation nodes) fails on: its closest approach is then
# too noisy for the solve to finish.
@pytest.mark.parametrize(("target", "days"), [("mercury", 366), ("mercury", 1394), ("mercury", 3242), ("metis", 2512)])
def test_blocked_days_get_a_detour_that_the_independent_flight_confirms(target: str, days: int) -> None:
    trip = torch.solve("earth", target, JD_2026 + days, 0.3 if target == "mercury" else 1.0)
    flown = Flown(trip, state("earth"))
    assert trip.tilt_rad != 0.0
    assert flown.closest()[0] == pytest.approx(0.1 * 1.0001, abs=2e-6)
    assert np.linalg.norm(flown.position - state(target)(trip.arrive_jd)[0]) * AU_KM < 100.0


def test_the_trip_record_adds_up() -> None:
    trip = torch.solve("earth", "mars", CLEAR, 1.0)
    assert trip.days == pytest.approx(sum(trip.burn_days))
    assert trip.arrive_jd == pytest.approx(trip.depart_jd + trip.days)
    assert trip.flip_jd == pytest.approx(trip.depart_jd + trip.burn_days[0])
    # delta-v of an arc is thrust times its duration: 1 g for a day is 847.3 km/s.
    assert trip.delta_v_km_s == pytest.approx([847.29456 * days for days in trip.burn_days], rel=1e-9)
    for direction in trip.directions:
        assert np.linalg.norm(direction) == pytest.approx(1.0, abs=1e-12)


@pytest.mark.parametrize("depart_jd", [CLEAR, CONJUNCTION])
def test_the_path_is_evenly_timed_ends_at_the_two_bodies_and_follows_the_flown_course(depart_jd: float) -> None:
    assert torch.solve("earth", "mars", depart_jd, 1.0).path is None
    trip = torch.solve("earth", "mars", depart_jd, 1.0, want_path=True)
    path = trip.path
    assert path.shape == (181, 4)
    assert np.diff(path[:, 0]) == pytest.approx(np.full(180, trip.days / 180), abs=1e-9)
    assert path[0] == pytest.approx([trip.depart_jd, *state("earth")(trip.depart_jd)[0]], abs=1e-12)
    assert path[-1] == pytest.approx([trip.arrive_jd, *state("mars")(trip.arrive_jd)[0]], abs=1e-12)
    flown = Flown(trip, state("earth")).positions(np.linspace(0.0, trip.days, 181))
    assert np.linalg.norm(path[:, 1:] - flown, axis=1).max() * AU_KM < 50.0


@pytest.mark.parametrize(("g", "tolerance"), [(1.0, 0.005), (0.3, 0.015)])
def test_the_free_space_estimate_ranks_days_close_to_the_solved_time(g: float, tolerance: float) -> None:
    # Measured over 216 trips each: within 0.24% at 1 g and 0.69% at 0.3 g.
    for days in (0, 400, 1200, 2500):
        estimate = torch.free_space_days("earth", "mars", JD_2026 + days, g)
        solved = torch.solve("earth", "mars", JD_2026 + days, g, keep_out_au=0.0).days
        assert estimate == pytest.approx(solved, rel=tolerance)


def test_the_fallback_start_is_equal_burns_along_the_line_to_the_target() -> None:
    # 5 AU apart along (0, 3, 4)/5: half the distance at 1 g takes sqrt(5 / a) days.
    aim, brake, first, second = torch._straight_at_target(at_rest([1.0, 0.0, 0.0]), at_rest([1.0, 3.0, 4.0]), JD_2026, G_AU_DAY2)
    assert aim == pytest.approx([0.0, 0.6, 0.8]) and brake == pytest.approx([0.0, -0.6, -0.8])
    assert first == second == pytest.approx(math.sqrt(5.0 / G_AU_DAY2))


def test_a_start_that_goes_nowhere_falls_back_to_aiming_straight_at_the_target(monkeypatch) -> None:
    expected = torch.solve("earth", "mars", CLEAR, 1.0)
    away = np.array([0.0, 0.0, 1.0])
    monkeypatch.setattr(torch, "_free_space", lambda *_: (away, away, 1e-3, 1e-3))
    trip = torch.solve("earth", "mars", CLEAR, 1.0)
    assert trip.days == pytest.approx(expected.days, rel=1e-9)

    monkeypatch.setattr(torch, "_straight_at_target", lambda *_: (away, away, 1e-3, 1e-3))
    with pytest.raises(torch.NoTrip):
        torch.solve("earth", "mars", CLEAR, 1.0)


@pytest.mark.parametrize("g", [0.0, 0.05, 12.5, math.nan])
def test_thrust_outside_the_supported_range_is_an_error(g: float) -> None:
    with pytest.raises(ValueError, match="between 0.1 and 12.0 g"):
        torch.solve("earth", "mars", JD_2026, g)
