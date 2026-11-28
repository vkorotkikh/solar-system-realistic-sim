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
from dataclasses import dataclass, replace
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
    alongside: bool = False  # no orbit: the trip ends, or starts, 100 km off the body, matching its path


def _alongside(body_id: str, name: str, radius_km: float, reason: str = "") -> Orbit:
    """The end for a body that cannot hold the default orbit: no mass in the catalog, or too small.

    The standoff distance is kept for code that needs one; the burn there ignores the body's gravity.
    """
    return Orbit(f"{body_id}-alongside", f"Alongside {name}, 100 km off, matching its path{reason}",
                 radius_km + 100.0, radius_km + 100.0, alongside=True)


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
    body: str = ""  # for a named orbit, the body or moon it is around


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
    if not body.get("mass_kg"):  # treated as having no gravity, so there is no orbit to enter
        return _alongside(body_id, name, radius)
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


def _moons(planets: dict[str, Place]) -> list[Place]:
    radii = json.loads(MOON_RADII_FILE.read_text())["bodies"]
    masses = json.loads(MOON_GM_FILE.read_text())["bodies"]
    moons: list[Place] = []
    seen: set[str] = set()
    for moon in json.loads(MOONS_FILE.read_text()):
        parent = moon["planet"].lower()
        if parent not in planets:
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
        mu, mu_planet = (float(mass["gmKm3S2"]) if mass else 0.0), planets[parent].mu_km3_s2
        # The Hill radius: farther out, the planet rather than the moon holds a spacecraft.
        reach = float(moon["aKm"]) * (mu / (3.0 * mu_planet)) ** (1.0 / 3.0) if mu and mu_planet else 0.0
        if moon_id == "moon-earth-moon":
            orbit = Orbit("llo", "Low lunar orbit, 100 km", radius + 100.0, radius + 100.0)
        elif radius + 100.0 <= reach:
            orbit = Orbit(f"{moon_id}-low-orbit", f"Low orbit around {moon['name']}, 100 km", radius + 100.0,
                          radius + 100.0)
        else:
            orbit = _alongside(moon_id, moon["name"], radius, ": it is too small to hold an orbit" if mu else "")
        moons.append(Place(
            id=moon_id,
            name=moon["name"],
            kind="moon",
            radius_km=radius,
            mu_km3_s2=mu,
            default_orbit=orbit,
            around=parent,
            orbit_radius_km=float(moon["aKm"]),
        ))
    return moons


def _named_orbits(by_id: dict[str, Place]) -> list[Place]:
    """PROPOSED v1 list (spec section 7.2). A named orbit is its body with that orbit as the default."""
    moon = by_id["moon-earth-moon"]
    geo = Orbit("geo", "Geostationary orbit, 42,164 km from Earth's centre", 42_164.0, 42_164.0)
    # NASA, "Gateway NRHO" (nrho-artemis-orbit.pdf, 2023): typical orbit 1,000 by 70,000 km, period 7 days.
    nrho = Orbit("nrho", "Near-rectilinear halo orbit (NRHO), taken as a 1,000 by 70,000 km lunar ellipse",
                 moon.radius_km + 1_000.0, moon.radius_km + 70_000.0)
    named = (("earth", None), ("earth", geo), (moon.id, None), (moon.id, nrho), ("mars", None))
    places = []
    for body_id, orbit in named:
        orbit = orbit or by_id[body_id].default_orbit
        places.append(replace(by_id[body_id], id=orbit.id, name=orbit.name, kind="orbit", default_orbit=orbit,
                              body=body_id))
    return places


_ELIGIBLE = set(eligible_endpoint_body_ids(ALL_BODIES))
_SUN_PLACES = tuple(_place(body) for body in ALL_BODIES if body["id"] in _ELIGIBLE)
_BODIES = _SUN_PLACES + tuple(_moons({place.id: place for place in _SUN_PLACES}))
PLACES: tuple[Place, ...] = _BODIES + tuple(_named_orbits({place.id: place for place in _BODIES}))
_BY_ID = {place.id: place for place in PLACES}


_LITTLE_WORDS = frozenset({"the", "a", "an", "of", "s"})  # "s" is what "Earth's" leaves
_PROVISIONAL = re.compile(r"\bS/(\d{4})\s*([A-Z])\s*(\d+)\b", re.IGNORECASE)  # IAU "S/2010 J 1"; the catalog: S2010_J_1


def _words(text: str) -> list[str]:
    return re.sub(r"[()\[\],'\u2019]", " ", text.lower()).split()


def get_place(place_id: str) -> Place | None:
    return _BY_ID.get(place_id.strip().lower())


def find_places(query: str, limit: int = 5) -> list[Place]:
    """Places where every word of the query starts a word of the name or the id; exact names win.

    Little words such as "the" are skipped, a moon also answers to its
    planet's name, and a provisional name may be written the IAU way, so "the
    Moon", "Earth's moon", "Jupiter Io" and "S/2010 J 1" find what they mean.
    When some places match exactly, only those are returned.
    """
    wanted = [word for word in _words(_PROVISIONAL.sub(r"S\1_\2_\3", query)) if word not in _LITTLE_WORDS]

    def own(place: Place) -> list[str]:  # the words that must name the place itself
        return [word for word in wanted if not (place.kind == "moon" and word == place.around)]

    def matches(place: Place) -> bool:
        words = own(place)
        return bool(words) and all(any(part.startswith(word) for part in _words(place.name) + [place.id])
                                   for word in words)

    def exact(place: Place) -> bool:
        text = " ".join(own(place))
        return text in (place.id, " ".join(_words(place.name)), " ".join(_words(re.sub(r"\(.*?\)", " ", place.name))))

    found = [place for place in PLACES if matches(place)]
    return ([place for place in found if exact(place)] or found)[:limit]


def body_id(place: Place) -> str:
    """The body or moon a place is: itself, or for a named orbit the body it is around."""
    return place.body or place.id


def sun_body(place: Place) -> str:
    """The Sun-orbiting body a transfer around the Sun leaves from or reaches for this place."""
    return body_id(place) if place.around == "sun" else place.around


def shared_planet(first: Place, second: Place) -> Place | None:
    """The planet both places are at: the planet itself, its moons, or orbits around either."""
    return _BY_ID[sun_body(first)] if sun_body(first) == sun_body(second) else None


def orbit_burn_km_s(v_infinity_km_s: float, mu_km3_s2: float, orbit: Orbit) -> float:
    """Impulsive burn at periapsis between a hyperbola of this excess speed and the orbit.

    The same figure serves departure and capture. With no gravity (mu = 0) it
    reduces to the excess speed itself, and so does an end alongside a body.
    """
    if orbit.alongside:
        return v_infinity_km_s
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
    if body_id(place) == planet.id:  # an orbit around the planet itself, at its periapsis
        orbit = place.default_orbit
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
        "around": place.body if place.kind == "orbit" else place.around,
        "default_orbit": orbit_json(place.default_orbit, place),
    }
