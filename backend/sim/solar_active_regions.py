"""Shared deterministic, synthetic active-region evolution in z-up inertial axes.

The recurrence and lifetime are visualization parameters, not observed regions.
Rotation uses Snodgrass & Ulrich (1990); the tilt/Hale conventions are described
by Hathaway (2015), https://arxiv.org/html/1502.07020, sections 3.6 and 4.13.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import math
from random import Random

J2000_JD = 2451545.0
CYCLE_25_START_JD = 2458849.5
CYCLE_DAYS = 132.0 * 30.44
REGION_MODEL_VERSION = "persistent-bipoles-v2"


@dataclass(frozen=True)
class ActiveRegionSeed:
    idx: int
    center_lat_rad: float
    center_lon_rad: float
    tilt_rad: float
    separation_rad: float
    strength: float
    hemisphere_sign: float
    hale_cycle25_leading_polarity: float
    flux_imbalance: float


@lru_cache(maxsize=16)
def build_active_regions(seed: int = 17, base_tube_count: int = 420) -> tuple[ActiveRegionSeed, ...]:
    rng = Random(seed * 31 + 7)
    regions = []
    for idx in range(max(24, base_tube_count // 4)):
        hemisphere = -1.0 if rng.random() < .5 else 1.0
        core_lat, low_lat, blend = rng.uniform(7, 34), rng.uniform(3, 18), rng.random() ** 1.8
        lat = hemisphere * (core_lat * (1 - blend) + low_lat * blend)
        lon = rng.uniform(0, 360)
        tilt = hemisphere * (.5 * abs(lat) + rng.uniform(-15, 15))
        strength = min(1, max(.06, rng.betavariate(2.2, 3) * 1.22))
        separation = min(10, max(2, 2 + strength * 7 + rng.uniform(-.9, .9)))
        regions.append(ActiveRegionSeed(
            idx, math.radians(lat), math.radians(lon), math.radians(tilt),
            math.radians(separation), strength, hemisphere, -hemisphere,
            rng.uniform(-.18, .18),
        ))
    return tuple(regions)


def differential_rotation_rad_day(lat: float) -> float:
    sin2 = math.sin(lat) ** 2
    return math.radians(14.713 - 2.396 * sin2 - 1.787 * sin2**2)


def region_lifetime(region: ActiveRegionSeed, jd: float) -> tuple[float, float, float]:
    """Return (smooth envelope, birth JDTDB, lifetime days) without mutable clocks.

    Each persistent longitude has successive finite-lived emergences. A sin^2
    envelope and a quiet interval give zero value and derivative at replacement.
    The birth epoch fixes Hale polarity for the entire life of each emergence.
    """
    recurrence = 45.0 + 30.0 * region.strength
    lifetime = .65 * recurrence
    offset = (region.idx * .6180339887498949 % 1) * recurrence
    generation = math.floor((jd - J2000_JD + offset) / recurrence)
    birth = J2000_JD + generation * recurrence - offset
    age = jd - birth
    envelope = math.sin(math.pi * age / lifetime) ** 2 if 0 < age < lifetime else 0.0
    return envelope, birth, lifetime


def region_polarity_dirs(region: ActiveRegionSeed, jd: float):
    lat = region.center_lat_rad
    lon = (region.center_lon_rad + differential_rotation_rad_day(lat) * (jd - J2000_JD)) % (2 * math.pi)
    center = (math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat))
    east = (-math.sin(lon), math.cos(lon), 0.0)
    north = (-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat))
    # Leading lies in the direction of rotation, with the trailing spot
    # poleward under Joy's law. Coordinate side is independent of polarity.
    axis = tuple(e * math.cos(region.tilt_rad) - n * math.sin(region.tilt_rad) for e, n in zip(east, north))
    half = max(.005, region.separation_rad / 2)
    leading = tuple(c * math.cos(half) + a * math.sin(half) for c, a in zip(center, axis))
    trailing = tuple(c * math.cos(half) - a * math.sin(half) for c, a in zip(center, axis))
    _, birth, _ = region_lifetime(region, jd)
    cycle = 25 + math.floor((birth - CYCLE_25_START_JD) / CYCLE_DAYS + 1e-12)
    sign = region.hale_cycle25_leading_polarity * (-1 if (cycle - 25) % 2 else 1)
    positive, negative = (leading, trailing) if sign > 0 else (trailing, leading)
    return center, negative, positive, axis, sign
