"""Ideal impulsive, coplanar circular parking/capture patched-conic burns.

Specific energy gives v_periapsis^2 = v_infinity^2 + 2*mu/r;
subtract circular speed sqrt(mu/r) for departure (or capture by reversibility).
Reference: https://orbital-mechanics.space/interplanetary-maneuvers/planetary-departure-trajectory.html
and https://orbital-mechanics.space/interplanetary-maneuvers/planetary-arrival-capture.html
No surface ascent/descent, plane change, finite-thrust, or aerocapture is modeled.
"""
from __future__ import annotations

import math
from typing import Any, Sequence

from .orbital import G_SI
from trajectory.contracts import TrajectoryRequestRejected


def validate_parking_bodies(bodies: Sequence[dict[str, Any]], body_ids: Sequence[str]) -> None:
    catalog = {body["id"]: body for body in bodies}
    for body_id in body_ids:
        body = catalog.get(body_id, {})
        try:
            mass, radius = float(body["mass_kg"]), float(body["radius_km"])
            valid = math.isfinite(mass) and math.isfinite(radius) and mass > 0 and radius > 0
        except (KeyError, ValueError, TypeError):
            valid = False
        if not valid:
            raise TrajectoryRequestRejected("mission_propulsion_body_unsupported",
                "Circular parking/capture requires a finite positive body mass and radius",
                context={"bodyId": body_id})


def circular_parking_burn_km_s(v_infinity_km_s: float, mu_km3_s2: float, radius_km: float) -> float:
    if not all(math.isfinite(x) for x in (v_infinity_km_s, mu_km3_s2, radius_km)):
        raise ValueError("parking burn parameters must be finite")
    if v_infinity_km_s < 0 or mu_km3_s2 <= 0 or radius_km <= 0:
        raise ValueError("parking burn needs nonnegative v-infinity and positive mu/radius")
    circular = math.sqrt(mu_km3_s2 / radius_km)
    return math.hypot(v_infinity_km_s, math.sqrt(2) * circular) - circular


def mission_burn_schedule(bodies: Sequence[dict[str, Any]], outbound: dict, inbound: dict,
                          parking_altitude_km: float) -> dict[str, Any]:
    if not math.isfinite(parking_altitude_km) or parking_altitude_km <= 0:
        raise ValueError("parking_altitude_km must be finite and positive")
    catalog = {body["id"]: body for body in bodies}
    events = []
    for route in (outbound, inbound):
        for leg, side, kind in ((route["legs"][0], "Departure", "departure"),
                                (route["legs"][-1], "Arrival", "capture")):
            departure = kind == "departure"
            body_id = route["bodyRoute"][0 if departure else -1]
            body = catalog[body_id]
            mu = float(body["mass_kg"]) * G_SI / 1e9
            radius = float(body["radius_km"]) + parking_altitude_km
            vinf = float(leg[f"deltaV{side}KmS"])
            events.append({"event": kind, "bodyId": body_id,
                           "jd": float(leg["departureJd" if departure else "arrivalJd"]),
                           "vInfinityKmS": vinf, "muKm3S2": mu,
                           "parkingRadiusKm": radius,
                           "deltaVKmS": circular_parking_burn_km_s(vinf, mu, radius)})
    if any(b["jd"] < a["jd"] for a,b in zip(events,events[1:])):
        raise ValueError("mission propulsion events must be chronological")
    return {"model": "circular_parking_patched_conic", "parkingAltitudeKm": parking_altitude_km,
            "radiusModel": "catalog_spherical_radius", "cargoLoadBeforeBurnIndex": 2,
            "assumptions": ["impulsive tangential burns", "parking planes aligned with transfer",
                            "unpowered flybys", "cargo supplied in target parking orbit",
                            "surface ascent/descent, plane changes and finite thrust excluded"],
            "events": events}
