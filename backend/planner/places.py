"""Places a trip can start or end at: a catalog body or moon and an orbit around it.

Moons come from the frontend's own list, src/data/moons.json, with ids built
by the frontend's rule (src/sim/catalog.ts, makeMoonId) so a result maps onto
a scene node. Moon radii come from src/data/moonPhysicalRadii.json and masses
from backend/data/moon_gm.json; both are derived from the same pinned JPL
table. A moon without a mass is treated as having no gravity.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from data.bodies import ALL_BODIES
from mission.orbital import G_SI
from trajectory.contracts import eligible_endpoint_body_ids

ROOT = Path(__file__).resolve().parents[2]
MOONS_FILE = ROOT / "src/data/moons.json"
MOON_RADII_FILE = ROOT / "src/data/moonPhysicalRadii.json"
MOON_GM_FILE = ROOT / "backend/data/moon_gm.json"
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
    around: str = "sun"  # a moon's planet
    orbit_radius_km: float = 0.0  # a moon's distance from its planet (semi-major axis)


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


def _id_part(text: str) -> str:
    """The frontend's sanitizeIdPart (src/constants.ts)."""
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", text.lower()))


def _moons(planet_ids: set[str]) -> list[Place]:
    radii = json.loads(MOON_RADII_FILE.read_text())["bodies"]
    masses = json.loads(MOON_GM_FILE.read_text())["bodies"]
    moons: list[Place] = []
    seen: set[str] = set()
    for moon in json.loads(MOONS_FILE.read_text()):
        parent = moon["planet"].lower()
        if parent not in planet_ids:
            continue
        moon_id = f"moon-{_id_part(moon['planet'])}-{_id_part(moon['name'])}"
        if moon_id in seen:  # the frontend would add a -2 suffix; fail closed instead of diverging
            raise ValueError(f"Duplicate moon id {moon_id}")
        seen.add(moon_id)
        physical, mass = radii.get(moon["iauCode"]), masses.get(moon["iauCode"])
        for record in (physical, mass):
            if record and (record["name"], record["parent"]) != (moon["name"], moon["planet"]):
                raise ValueError(f"Moon identity differs between catalogs: {moon['name']}")
        radius = float(physical["radiusKm"]) if physical else 0.0
        moons.append(Place(
            id=moon_id,
            name=moon["name"],
            kind="moon",
            radius_km=radius,
            mu_km3_s2=float(mass["gmKm3S2"]) if mass else 0.0,
            default_orbit=Orbit(f"{moon_id}-low-orbit", f"Low orbit around {moon['name']}, 100 km",
                                radius + 100.0, radius + 100.0),
            around=parent,
            orbit_radius_km=float(moon["aKm"]),
        ))
    return moons


_ELIGIBLE = set(eligible_endpoint_body_ids(ALL_BODIES))
_SUN_PLACES = tuple(_place(body) for body in ALL_BODIES if body["id"] in _ELIGIBLE)
PLACES: tuple[Place, ...] = _SUN_PLACES + tuple(_moons({place.id for place in _SUN_PLACES}))
_BY_ID = {place.id: place for place in PLACES}


def _words(text: str) -> list[str]:
    return re.sub(r"[()\[\],]", " ", text.lower()).split()


def get_place(place_id: str) -> Place | None:
    return _BY_ID.get(place_id.strip().lower())


def find_places(query: str, limit: int = 5) -> list[Place]:
    """Places where every word of the query starts a word of the name or the id; exact names first."""
    wanted = _words(query)
    if not wanted:
        return []
    matches = [
        place
        for place in PLACES
        if all(any(word.startswith(w) for word in _words(place.name) + [place.id]) for w in wanted)
    ]
    text = " ".join(wanted)

    def exact(place: Place) -> bool:
        return text in (place.id, " ".join(_words(place.name)), " ".join(_words(re.sub(r"\(.*?\)", " ", place.name))))

    return sorted(matches, key=lambda place: not exact(place))[:limit]


def sun_body(place: Place) -> str:
    """The Sun-orbiting body a transfer around the Sun leaves from or reaches for this place."""
    return place.id if place.around == "sun" else place.around


def shared_planet(first: Place, second: Place) -> Place | None:
    """The planet both places are around (a planet and its moon, or two moons of one planet)."""
    for planet, other in ((first, second), (second, first)):
        if planet.around == "sun" and other.around == planet.id:
            return planet
    return _BY_ID[first.around] if first.around != "sun" and first.around == second.around else None


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


def end_burn_km_s(place: Place, v_infinity_km_s: float) -> float:
    """The burn at one end of a transfer around the Sun, for this excess speed at the place's Sun body.

    A moon is reached, or left, straight in: the path's closest approach to its
    planet sits on the moon's orbit, moving the same way as the moon.
    """
    if place.around == "sun":
        return orbit_burn_km_s(v_infinity_km_s, place.mu_km3_s2, place.default_orbit)
    mu_planet, distance = _BY_ID[place.around].mu_km3_s2, place.orbit_radius_km
    relative = math.sqrt(v_infinity_km_s**2 + 2.0 * mu_planet / distance) - math.sqrt(mu_planet / distance)
    return orbit_burn_km_s(relative, place.mu_km3_s2, place.default_orbit)


def _around_planet(place: Place, planet: Place) -> tuple[float, float, Place | None]:
    """Distance from the planet's centre, the speed there, and the moon to escape or enter (if any)."""
    if place is planet:  # the planet's own default orbit, at its periapsis
        orbit = planet.default_orbit
        semi_major_axis = (orbit.periapsis_km + orbit.apoapsis_km) / 2.0
        return orbit.periapsis_km, math.sqrt(planet.mu_km3_s2 * (2.0 / orbit.periapsis_km - 1.0 / semi_major_axis)), None
    return place.orbit_radius_km, math.sqrt(planet.mu_km3_s2 / place.orbit_radius_km), place


def planet_leg(origin: Place, target: Place, planet: Place) -> tuple[float, float, float, float, float]:
    """Minimum-energy transfer around one planet between circular, coplanar orbits.

    Returns the burn at the origin, the burn at the target, the flight in days,
    and the speed differences at each end before any moon's gravity is counted.
    """
    (r1, v1, moon1), (r2, v2, moon2) = _around_planet(origin, planet), _around_planet(target, planet)
    mu = planet.mu_km3_s2
    semi_major_axis = (r1 + r2) / 2.0
    change1 = abs(math.sqrt(mu * (2.0 / r1 - 1.0 / semi_major_axis)) - v1)
    change2 = abs(math.sqrt(mu * (2.0 / r2 - 1.0 / semi_major_axis)) - v2)
    burn1 = orbit_burn_km_s(change1, moon1.mu_km3_s2, moon1.default_orbit) if moon1 else change1
    burn2 = orbit_burn_km_s(change2, moon2.mu_km3_s2, moon2.default_orbit) if moon2 else change2
    return burn1, burn2, math.pi * math.sqrt(semi_major_axis**3 / mu) / 86_400.0, change1, change2


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
        "around": place.around,
        "default_orbit": orbit_json(place.default_orbit, place),
    }
