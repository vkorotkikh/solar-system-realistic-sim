"""Places a trip can start or end at: a catalog body and an orbit around it."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from data.bodies import ALL_BODIES
from mission.orbital import G_SI
from trajectory.contracts import eligible_endpoint_body_ids

KINDS = {"planet": "planet", "dwarf": "dwarf planet", "asteroid": "asteroid"}
GIANT_PLANETS = frozenset({"jupiter", "saturn", "uranus", "neptune"})


@dataclass(frozen=True, slots=True)
class Orbit:
    id: str
    name: str
    periapsis_km: float  # distances from the body's centre
    apoapsis_km: float


@dataclass(frozen=True, slots=True)
class Place:
    id: str
    name: str
    kind: str
    radius_km: float
    mu_km3_s2: float  # 0 when the catalog has no mass: the body is treated as having no gravity
    default_orbit: Orbit


def _default_orbit(body: dict) -> Orbit:
    # PROPOSED defaults (spec section 7.4): Earth 200 km; rocky bodies of radius
    # 2,000 km or more 400 km; smaller bodies 100 km; giant planets a loose
    # capture ellipse from 1.1 to 200 planet radii.
    body_id, name, radius = body["id"], body["name"], float(body["radius_km"])
    if body_id in GIANT_PLANETS:
        return Orbit(f"{body_id}-capture-orbit", f"{name} capture orbit, 1.1 to 200 planet radii",
                     1.1 * radius, 200.0 * radius)
    if body_id == "earth":
        return Orbit("leo", "Low Earth orbit, 200 km", radius + 200.0, radius + 200.0)
    altitude = 400.0 if radius >= 2_000.0 else 100.0
    orbit_id = "lmo" if body_id == "mars" else f"{body_id}-low-orbit"
    orbit_name = f"Low {name} orbit" if radius >= 2_000.0 else f"Low orbit around {name}"
    return Orbit(orbit_id, f"{orbit_name}, {altitude:.0f} km", radius + altitude, radius + altitude)


def _place(body: dict) -> Place:
    mass = body.get("mass_kg")
    return Place(
        id=body["id"],
        name=body["name"],
        kind=KINDS[body["type"]],
        radius_km=float(body["radius_km"]),
        mu_km3_s2=float(mass) * G_SI / 1e9 if mass else 0.0,
        default_orbit=_default_orbit(body),
    )


_ELIGIBLE = set(eligible_endpoint_body_ids(ALL_BODIES))
PLACES: tuple[Place, ...] = tuple(_place(body) for body in ALL_BODIES if body["id"] in _ELIGIBLE)
_BY_ID = {place.id: place for place in PLACES}


def _words(text: str) -> list[str]:
    return re.sub(r"[()\[\],]", " ", text.lower()).split()


def get_place(place_id: str) -> Place | None:
    return _BY_ID.get(place_id.strip().lower())


def find_places(query: str, limit: int = 5) -> list[Place]:
    """Places where every word of the query starts a word of the name or the id."""
    wanted = _words(query)
    if not wanted:
        return []
    matches = [
        place
        for place in PLACES
        if all(any(word.startswith(w) for word in _words(place.name) + [place.id]) for w in wanted)
    ]
    return matches[:limit]


def orbit_burn_km_s(v_infinity_km_s: float, mu_km3_s2: float, orbit: Orbit) -> float:
    """Impulsive burn at periapsis between a hyperbola of this excess speed and the orbit.

    The same figure serves departure and capture. With no gravity (mu = 0) it
    reduces to the excess speed itself.
    """
    periapsis = orbit.periapsis_km
    semi_major_axis = (orbit.periapsis_km + orbit.apoapsis_km) / 2.0
    hyperbolic = math.sqrt(v_infinity_km_s**2 + 2.0 * mu_km3_s2 / periapsis)
    bound = math.sqrt(mu_km3_s2 * (2.0 / periapsis - 1.0 / semi_major_axis))
    return hyperbolic - bound


def orbit_json(orbit: Orbit, place: Place) -> dict:
    return {
        "id": orbit.id,
        "name": orbit.name,
        "periapsis_altitude_km": round(orbit.periapsis_km - place.radius_km, 1),
        "apoapsis_altitude_km": round(orbit.apoapsis_km - place.radius_km, 1),
    }


def place_json(place: Place) -> dict:
    return {
        "id": place.id,
        "name": place.name,
        "kind": place.kind,
        "around": "sun",
        "default_orbit": orbit_json(place.default_orbit, place),
    }
