"""What a course around the Sun passes: the Sun, the belts, catalogued bodies and asteroids.

A course is a path: rows of [Julian date, x, y, z] in AU, heliocentric ecliptic
J2000, evenly spaced in time. A torch leg brings its own path; a rocket leg is
sampled here from its transfer orbit. Between two rows everything is taken to
move in a straight line at constant speed, so a closest approach is good to the
sag of the path between rows.

The belts are bands of distance from the Sun, by convention: the asteroid belt
from 2.06 to 3.28 AU (between the 4:1 and 2:1 Kirkwood gaps) and the Kuiper belt
from 30 to 50 AU. What is really near a course is counted separately: the
catalog's bodies that orbit the Sun, and the 100,000 main-belt asteroids the app
draws, moved as two-body orbits from their catalogued elements. Dates are Julian
dates under "jd" keys; the caller adds calendar dates.

Not modelled: dust and rocks too small to be catalogued, asteroids outside the
main belt, and Kuiper belt objects other than the catalog's dwarf planets.
"""

from __future__ import annotations

import math
import time
from functools import lru_cache
from pathlib import Path

import numpy as np

from data.bodies import ALL_BODIES
from mission.orbital import MU_SUN_AU3_DAY2, sample_body_state_from_elements
from planner.places import AU_KM, PLACES
from planner.torch import PATH_ROWS
from trajectory.planner import solve_direct_lambert

BELTS_AU = {"asteroid": (2.06, 3.28), "kuiper": (30.0, 50.0)}
CONTEXT = {
    "asteroid": "Spacecraft from Pioneer 10 to Juno have crossed the asteroid belt unharmed, and NASA puts asteroids a mile or "
                "more across about 3 million km apart on average; the risk from dust and small rocks at this speed is not estimated.",
    "kuiper": "The Kuiper belt is counted from 30 to 50 AU; this catalog holds only its dwarf planets, so nothing smaller is checked.",
}
NEAR_KM = 1_500_000.0  # asteroids passing closer than this are counted
SCREEN_SECONDS = 1.0  # what one asteroid screen can take; it is skipped when less time is left
ASTEROID_FILE = Path(__file__).resolve().parents[2] / "public/data/asteroid-phase1/asteroid_phase1_main_100000.bin"
_FIELDS = ("epoch_jd", "a_au", "e", "i_deg", "node_deg", "argp_deg", "mean_anomaly_deg", "period_days", "diameter_km", "albedo")
SUN_BODIES = {place.id: place.name for place in PLACES if place.around == "sun" and not place.body}
_BODIES = {body["id"]: body for body in ALL_BODIES}


def _stumpff(z: float) -> tuple[float, float]:
    if z > 1e-8:
        root = math.sqrt(z)
        return (1.0 - math.cos(root)) / z, (root - math.sin(root)) / root**3
    if z < -1e-8:
        root = math.sqrt(-z)
        return (math.cosh(root) - 1.0) / -z, (math.sinh(root) - root) / root**3
    return 0.5 - z / 24.0, 1.0 / 6.0 - z / 120.0


def two_body(position, velocity, days, mu: float = MU_SUN_AU3_DAY2) -> np.ndarray:
    """Positions after each of `days` on the orbit through a position (AU) and velocity (AU/day): ellipse or hyperbola.

    Universal variables. Kepler's equation in them rises steadily, so the root is kept bracketed and a Newton step
    that leaves the bracket is replaced by its midpoint; plain Newton diverges on long eccentric arcs.
    """
    r0, v0 = np.asarray(position, float), np.asarray(velocity, float)
    radius, root_mu = float(np.linalg.norm(r0)), math.sqrt(mu)
    radial = float(r0 @ v0) / root_mu
    alpha = 2.0 / radius - float(v0 @ v0) / mu  # one over the semi-major axis
    out = np.empty((len(days), 3))
    for row, elapsed in enumerate(days):
        def kepler(chi: float) -> tuple[float, float]:
            c2, c3 = _stumpff(alpha * chi * chi)
            return (radial * chi * chi * c2 + (1.0 - alpha * radius) * chi**3 * c3 + radius * chi - root_mu * elapsed,
                    radial * chi * (1.0 - alpha * chi * chi * c3) + (1.0 - alpha * radius) * chi * chi * c2 + radius)
        low, high = 0.0, max(root_mu * elapsed / radius, 1e-12)
        while kepler(high)[0] < 0.0:
            low, high = high, 2.0 * high
        chi = 0.5 * (low + high)
        for _ in range(200):
            value, slope = kepler(chi)
            low, high = (low, chi) if value > 0.0 else (chi, high)
            step = chi - value / slope
            if not low < step < high:
                step = 0.5 * (low + high)
            moved, chi = abs(step - chi), step
            if moved < 1e-15 * max(1.0, abs(chi)):
                break
        c2, c3 = _stumpff(alpha * chi * chi)
        out[row] = (1.0 - chi * chi / radius * c2) * r0 + (elapsed - chi**3 / root_mu * c3) * v0
    return out


def rocket_path(origin_id: str, target_id: str, depart_jd: float, arrive_jd: float) -> np.ndarray | None:
    """A rocket leg's coast between two catalog bodies, sampled from its transfer orbit. None when there is no transfer.

    The orbit is the transfer solver's own, so the last row is where that orbit ends: within 1,000 km of the target.
    """
    solution = solve_direct_lambert(ALL_BODIES, from_id=origin_id, to_id=target_id,
                                    departure_jd=depart_jd, arrival_jd=arrive_jd)["solution"]
    if solution is None:
        return None
    days = np.linspace(0.0, arrive_jd - depart_jd, PATH_ROWS)
    return np.column_stack([depart_jd + days, two_body(solution["startPosition"], solution["departureVelocityApprox"], days)])


def _closest_on_segments(relative: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Closest approach to the origin of points moving in a straight line between samples (..., rows, 3).

    Returns the distance, the segment it falls in and how far along that segment (0 to 1).
    """
    start, step = relative[..., :-1, :], np.diff(relative, axis=-2)
    length2 = (step * step).sum(-1)
    along = np.clip(-(start * step).sum(-1) / np.where(length2 > 0.0, length2, 1.0), 0.0, 1.0)
    distance = np.linalg.norm(start + along[..., None] * step, axis=-1)
    segment = distance.argmin(-1)
    return (np.take_along_axis(distance, segment[..., None], -1)[..., 0], segment,
            np.take_along_axis(along, segment[..., None], -1)[..., 0])


def _when(times: np.ndarray, segment, along) -> float:
    return float(times[segment] + along * (times[segment + 1] - times[segment]))


def sun_approach(path: np.ndarray) -> dict:
    distance, segment, along = _closest_on_segments(path[:, 1:])
    return {"au": float(distance), "jd": _when(path[:, 0], segment, along)}


def belt_crossings(path: np.ndarray) -> list[dict]:
    """Each stay inside a belt, in time order. A course that starts or ends inside has None for that end.

    ponytail: a belt narrower than one row's step would be jumped; the narrowest is 1.2 AU and a row is 1/180 of a
    leg, so that needs a leg over 200 AU long. Sample more rows if one ever is.
    """
    times, distance = path[:, 0], np.linalg.norm(path[:, 1:], axis=1)
    found = []
    for belt, (inner, outer) in BELTS_AU.items():
        inside = (distance >= inner) & (distance <= outer)
        since, enters = times[0], None
        for row in np.flatnonzero(inside[1:] != inside[:-1]):
            edge = inner if min(distance[row], distance[row + 1]) < inner else outer
            at = float(times[row] + (edge - distance[row]) / (distance[row + 1] - distance[row]) * (times[row + 1] - times[row]))
            if inside[row]:
                found.append((since, {"belt": belt, "enters": enters, "leaves": {"jd": at}, "days_inside": at - since}))
            else:
                since, enters = at, {"jd": at}
        if inside[-1]:
            found.append((since, {"belt": belt, "enters": enters, "leaves": None, "days_inside": float(times[-1] - since)}))
    return [crossing for _, crossing in sorted(found, key=lambda entry: entry[0])]


def nearest_bodies(path: np.ndarray, skip=()) -> list[dict]:
    """The three catalog bodies the course passes nearest, leaving out `skip` (the leg's own ends)."""
    ids = [body_id for body_id in SUN_BODIES if body_id not in skip]
    # ponytail: 7,000 scalar position calls, about 60 ms a leg; vectorise the element propagation if that ever matters
    positions = np.array([[sample_body_state_from_elements(_BODIES[body_id], jd)["position"] for jd in path[:, 0]]
                          for body_id in ids])
    distance, segment, along = _closest_on_segments(positions - path[:, 1:])
    return [{"id": ids[k], "name": SUN_BODIES[ids[k]], "distance_km": float(distance[k] * AU_KM),
             "jd": _when(path[:, 0], segment[k], along[k])} for k in np.argsort(distance)[:3]]


@lru_cache(maxsize=1)
def asteroids() -> dict[str, np.ndarray]:
    """The asteroid catalog as one array per field. File format ACBF v2: a 12-byte header, then 88-byte records."""
    raw = ASTEROID_FILE.read_bytes()
    count = int.from_bytes(raw[8:12], "little")
    if raw[:8] != b"ACBF\x02\x00\x58\x00" or len(raw) < 12 + 88 * count:
        raise ValueError(f"{ASTEROID_FILE.name} is not an ACBF v2 asteroid catalog")
    rows = np.frombuffer(raw, np.dtype([("id", "<u4"), ("fields", "<f8", (10,)), ("unused", "V4")]), count, 12)
    catalog = {name: np.ascontiguousarray(rows["fields"][:, k]) for k, name in enumerate(_FIELDS)}
    catalog["id"] = rows["id"].astype(np.int64)  # JPL SPK ids: 20,000,000 + the number for a numbered asteroid
    a, e = catalog["a_au"], catalog["e"]
    inclination, node, periapsis = (np.radians(catalog[name]) for name in ("i_deg", "node_deg", "argp_deg"))
    catalog["mean_anomaly"] = np.radians(catalog["mean_anomaly_deg"])
    catalog["mean_motion"] = 2.0 * np.pi / catalog["period_days"]
    catalog["perihelion"], catalog["aphelion"] = a * (1.0 - e), a * (1.0 + e)
    # unit vectors in the orbit's plane: toward periapsis, and a quarter turn ahead of it
    catalog["toward_periapsis"] = np.stack([
        np.cos(node) * np.cos(periapsis) - np.sin(node) * np.sin(periapsis) * np.cos(inclination),
        np.sin(node) * np.cos(periapsis) + np.cos(node) * np.sin(periapsis) * np.cos(inclination),
        np.sin(periapsis) * np.sin(inclination)], axis=-1)
    catalog["ahead"] = np.stack([
        -np.cos(node) * np.sin(periapsis) - np.sin(node) * np.cos(periapsis) * np.cos(inclination),
        -np.sin(node) * np.sin(periapsis) + np.cos(node) * np.cos(periapsis) * np.cos(inclination),
        np.cos(periapsis) * np.sin(inclination)], axis=-1)
    return catalog


def _asteroid_positions(catalog: dict, rows: np.ndarray, jds: np.ndarray) -> np.ndarray:
    """Two-body positions (len(jds), len(rows), 3) of some of the catalog's asteroids, each from its own epoch."""
    e = catalog["e"][rows]
    mean = catalog["mean_anomaly"][rows] + catalog["mean_motion"][rows] * (jds[:, None] - catalog["epoch_jd"][rows])
    eccentric = mean + e * np.sin(mean)
    for _ in range(30):  # Newton on Kepler's equation; the catalog's eccentricities stay below 0.56
        change = (eccentric - e * np.sin(eccentric) - mean) / (1.0 - e * np.cos(eccentric))
        eccentric -= change
        if np.abs(change).max() < 1e-13:
            break
    a = catalog["a_au"][rows]
    return ((a * (np.cos(eccentric) - e))[..., None] * catalog["toward_periapsis"][rows]
            + (a * np.sqrt(1.0 - e * e) * np.sin(eccentric))[..., None] * catalog["ahead"][rows])


def _screen(catalog: dict, rows: np.ndarray, times: np.ndarray, course: np.ndarray):
    """Closest approach to the course of each listed asteroid: distance (AU), segment and how far along it."""
    distance, segment, along = np.empty(len(rows)), np.empty(len(rows), int), np.empty(len(rows))
    for first in range(0, len(rows), 4_000):  # a few thousand at a time keeps the arrays in cache
        part = slice(first, first + 4_000)
        relative = np.swapaxes(_asteroid_positions(catalog, rows[part], times), 0, 1) - course
        distance[part], segment[part], along[part] = _closest_on_segments(relative)
    return distance, segment, along


def nearest_asteroid(path: np.ndarray, deadline: float | None = None) -> dict:
    """The catalogued asteroid the course passes nearest, and how many pass within NEAR_KM.

    "none_in_range" when the course never reaches the catalog's distances from the Sun; "not_searched" when
    `deadline` (a time.monotonic() value) leaves no time for a screen. An asteroid named more than a year from
    its elements' epoch is marked indicative: two-body motion drifts from the real orbit.
    """
    catalog = asteroids()
    times, course = path[:, 0], path[:, 1:]
    reach = np.linalg.norm(course, axis=1)
    if reach.max() < catalog["perihelion"].min() or reach.min() > catalog["aphelion"].max():
        return {"status": "none_in_range"}
    if deadline is not None and time.monotonic() + SCREEN_SECONDS > deadline:
        return {"status": "not_searched"}
    # First every asteroid against every tenth row, then the ones that could matter against every row. `pad` bounds
    # how far the coarse straight segments can be from the fine ones, so the shortlist cannot miss the answer.
    # Half a second a leg; a wider stride makes the first pass cheaper and the shortlist longer.
    coarse = np.unique(np.r_[np.arange(0, len(times), 10), len(times) - 1])
    roughly = _screen(catalog, np.arange(len(catalog["id"])), times[coarse], course[coarse])[0]
    owner = np.clip(np.searchsorted(coarse, np.arange(len(times)), side="right") - 1, 0, len(coarse) - 2)
    share = (times - times[coarse][owner]) / (times[coarse][owner + 1] - times[coarse][owner])
    chord = course[coarse][owner] + share[:, None] * (course[coarse][owner + 1] - course[coarse][owner])
    pad = (catalog["aphelion"].max() * (catalog["mean_motion"].max() * np.diff(times[coarse]).max()) ** 2 / 8.0
           + np.linalg.norm(chord - course, axis=1).max())
    near = NEAR_KM / AU_KM
    shortlist = np.flatnonzero(roughly < max(near + pad, roughly.min() + 2.0 * pad))
    distance, segment, along = _screen(catalog, shortlist, times, course)
    best = int(distance.argmin())
    spk_id, jd = int(catalog["id"][shortlist[best]]), _when(times, segment[best], along[best])
    return {"status": "ok", "spk_id": spk_id, "number": spk_id - 20_000_000 if 20_000_000 < spk_id < 21_000_000 else None,
            "distance_km": float(distance[best] * AU_KM), "jd": jd, "within_km": NEAR_KM,
            "count_within": int((distance < near).sum()),
            "indicative": bool(abs(jd - catalog["epoch_jd"][shortlist[best]]) > 365.25)}


def report(path: np.ndarray, skip=(), sun: tuple[float, float] | None = None, deadline: float | None = None) -> dict:
    """The course report of one leg. `sun` is (AU, jd) of the closest approach when the caller knows it exactly."""
    belts = belt_crossings(path)
    out = {"closest_sun_approach": {"au": sun[0], "jd": sun[1]} if sun else sun_approach(path), "belts": belts,
           "nearest_bodies": nearest_bodies(path, skip), "nearest_asteroid": nearest_asteroid(path, deadline)}
    if belts:
        out["context"] = " ".join(CONTEXT[belt] for belt in dict.fromkeys(crossing["belt"] for crossing in belts))
    return out
