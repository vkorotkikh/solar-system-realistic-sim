from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from random import Random
from typing import Any

AU_KM = 149_597_870.7
SOLAR_RADIUS_KM = 695_700.0
SOLAR_RADIUS_AU = SOLAR_RADIUS_KM / AU_KM
J2000_JD = 2_451_545.0
SOLAR_CYCLE_YEARS = 11.0
SOLAR_CYCLE_DAYS = SOLAR_CYCLE_YEARS * 365.25
CARRINGTON_ROTATION_DAYS = 27.2753
# Hathaway-cycle reference anchored at Cycle 25 start (~2019-12-01 UTC).
CYCLE_25_START_JD = 2_458_849.5
CYCLE_25_NUMBER = 25
CYCLE_LENGTH_MONTHS = 132.0
MEAN_MONTH_DAYS = 30.44
HATHAWAY_B = 54.0
HATHAWAY_C = 0.71

# SI constants used for coarse Alfvén-speed coupling.
MU0_SI = 4.0e-7 * math.pi
PROTON_MASS_KG = 1.67262192369e-27


def utc_now_to_julian_date() -> float:
    unix_seconds = datetime.now(timezone.utc).timestamp()
    return unix_seconds / 86_400.0 + 2_440_587.5


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def _dot(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _add(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(a: tuple[float, float, float], factor: float) -> tuple[float, float, float]:
    return (a[0] * factor, a[1] * factor, a[2] * factor)


def _normalize(vec: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = vec
    norm = math.sqrt(x * x + y * y + z * z)
    if norm < 1e-12:
        return (1.0, 0.0, 0.0)
    inv = 1.0 / norm
    return (x * inv, y * inv, z * inv)


def _cross(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    ax, ay, az = a
    bx, by, bz = b
    return (
        ay * bz - az * by,
        az * bx - ax * bz,
        ax * by - ay * bx,
    )


def _vector_from_lat_lon(lat_rad: float, lon_rad: float) -> tuple[float, float, float]:
    cos_lat = math.cos(lat_rad)
    return (
        cos_lat * math.cos(lon_rad),
        cos_lat * math.sin(lon_rad),
        math.sin(lat_rad),
    )


def _orthonormal_basis(base: tuple[float, float, float]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    ref = (0.0, 0.0, 1.0) if abs(base[2]) < 0.85 else (0.0, 1.0, 0.0)
    tangent = _normalize(_cross(ref, base))
    binormal = _normalize(_cross(base, tangent))
    return tangent, binormal


def _differential_rotation_rad_day(lat_rad: float) -> float:
    sin_lat = math.sin(lat_rad)
    sin2 = sin_lat * sin_lat
    # Snodgrass-like differential rotation profile (deg/day).
    deg_per_day = 14.713 - 2.396 * sin2 - 1.787 * sin2 * sin2
    return deg_per_day * math.pi / 180.0


def _slerp(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    t: float,
) -> tuple[float, float, float]:
    aa = _normalize(a)
    bb = _normalize(b)
    dot = _clamp(_dot(aa, bb), -1.0, 1.0)
    if dot > 0.9995:
        return _normalize(
            (
                aa[0] + (bb[0] - aa[0]) * t,
                aa[1] + (bb[1] - aa[1]) * t,
                aa[2] + (bb[2] - aa[2]) * t,
            )
        )

    theta = math.acos(dot)
    sin_theta = max(1e-9, math.sin(theta))
    wa = math.sin((1.0 - t) * theta) / sin_theta
    wb = math.sin(t * theta) / sin_theta
    return _normalize(
        (
            aa[0] * wa + bb[0] * wb,
            aa[1] * wa + bb[1] * wb,
            aa[2] * wa + bb[2] * wb,
        )
    )


def _hathaway_raw(t_months: float, b: float = HATHAWAY_B, c: float = HATHAWAY_C) -> float:
    if t_months <= 0.0:
        return 0.0
    ratio = t_months / max(1e-6, b)
    ratio2 = ratio * ratio
    ratio3 = ratio2 * ratio
    denom = math.exp(ratio2) - c
    if denom <= 1e-12:
        return 0.0
    return ratio3 / denom


def _hathaway_normalized(t_months: float, b: float = HATHAWAY_B, c: float = HATHAWAY_C) -> float:
    # Analytic peak at t = b * sqrt(3/2) for the canonical Hathaway form.
    t_peak = b * math.sqrt(1.5)
    peak_val = _hathaway_raw(t_peak, b, c)
    if peak_val <= 1e-12:
        return 0.0
    return _clamp(_hathaway_raw(t_months, b, c) / peak_val, 0.0, 1.0)


def _cycle_length_days() -> float:
    return CYCLE_LENGTH_MONTHS * MEAN_MONTH_DAYS


def _cycle_offset_months(jd: float) -> float:
    cycle_days = _cycle_length_days()
    cycle_offset_days = (jd - CYCLE_25_START_JD) % cycle_days
    if cycle_offset_days < 0.0:
        cycle_offset_days += cycle_days
    return cycle_offset_days / MEAN_MONTH_DAYS


def _solar_cycle_number(jd: float) -> int:
    cycle_days = _cycle_length_days()
    cycles_since_25 = math.floor((jd - CYCLE_25_START_JD) / cycle_days + 1e-12)
    return CYCLE_25_NUMBER + int(cycles_since_25)


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


@dataclass(frozen=True)
class FluxTubeSeed:
    idx: int
    region_idx: int
    strength: float
    twist: float
    chirality: float
    family: str
    polarity_sign: float
    footpoint_jitter_lat_rad: float
    footpoint_jitter_lon_rad: float


class SolarCoronaPhysicsModel:
    """
    Quasi-MHD, backend-driven solar corona model.

    This is not a full resistive-MHD solver. It is a deterministic, physically-inspired
    field model that emits 3D coronal structures (loops/plumes/CME-like fronts)
    parameterized by solar-cycle phase and differential rotation.
    """

    FIDELITY_POINT_COUNT = {
        "preview": 12,
        "operational": 20,
        "high": 30,
        "ultra": 42,
    }
    FORCING_MODES = ("synthetic", "hybrid", "data_driven")

    def __init__(self, seed: int = 17, base_tube_count: int = 420):
        self.seed = int(seed)
        self.base_tube_count = max(64, int(base_tube_count))
        self.fidelity_levels = tuple(self.FIDELITY_POINT_COUNT.keys())
        self.default_fidelity = "operational"
        self.model_name = "quasi_mhd_corona_v4"
        self.active_regions = self._build_active_regions()
        self.seeds = self._build_flux_tube_seeds()
        from sim.pfss_magnetogram import PFSSCache
        self._pfss_cache = PFSSCache()

    def _build_active_regions(self) -> list[ActiveRegionSeed]:
        rng = Random(self.seed * 31 + 7)
        out: list[ActiveRegionSeed] = []
        region_count = max(24, self.base_tube_count // 4)

        for idx in range(region_count):
            hemisphere = -1.0 if rng.random() < 0.5 else 1.0
            core_lat_deg = rng.uniform(7.0, 34.0)
            low_lat_deg = rng.uniform(3.0, 18.0)
            blend = rng.random() ** 1.8
            lat_deg = hemisphere * (core_lat_deg * (1.0 - blend) + low_lat_deg * blend)
            lon_deg = rng.uniform(0.0, 360.0)

            # Joy's law: tilt rises with latitude, plus observational scatter.
            tilt_mean_deg = 0.5 * abs(lat_deg)
            tilt_deg = hemisphere * (tilt_mean_deg + rng.uniform(-15.0, 15.0))
            strength = _clamp(rng.betavariate(2.2, 3.0) * 1.22, 0.06, 1.0)
            separation_deg = _clamp(2.0 + strength * 7.0 + rng.uniform(-0.9, 0.9), 2.0, 10.0)
            # Cycle 25 is odd: north leading is negative, south leading is positive.
            hale_cycle25_leading = -1.0 if hemisphere > 0.0 else 1.0
            flux_imbalance = rng.uniform(-0.18, 0.18)

            out.append(
                ActiveRegionSeed(
                    idx=idx,
                    center_lat_rad=math.radians(lat_deg),
                    center_lon_rad=math.radians(lon_deg),
                    tilt_rad=math.radians(tilt_deg),
                    separation_rad=math.radians(separation_deg),
                    strength=strength,
                    hemisphere_sign=hemisphere,
                    hale_cycle25_leading_polarity=hale_cycle25_leading,
                    flux_imbalance=flux_imbalance,
                )
            )

        return out

    def _build_flux_tube_seeds(self) -> list[FluxTubeSeed]:
        rng = Random(self.seed)
        out: list[FluxTubeSeed] = []
        templates = (
            ("loop", "leading", 1.00, 0.34, 1.16),
            ("loop", "trailing", 0.92, 0.42, 1.04),
            ("plume", "trailing", 0.78, 0.22, 0.94),
            ("cme", "leading", 1.18, 0.58, 1.42),
        )

        idx = 0
        for region in self.active_regions:
            for family, root_role, strength_scale, twist_min, twist_max in templates:
                if idx >= self.base_tube_count:
                    break
                root_sign = (
                    region.hale_cycle25_leading_polarity
                    if root_role == "leading"
                    else -region.hale_cycle25_leading_polarity
                )
                strength = _clamp(region.strength * (strength_scale + rng.uniform(-0.16, 0.2)), 0.05, 1.0)
                twist = rng.uniform(twist_min, twist_max)
                chirality = -region.hemisphere_sign if family != "cme" else region.hemisphere_sign
                jitter_span = 2.0 if family == "loop" else 1.7
                jitter_lat = math.radians(rng.uniform(-jitter_span, jitter_span))
                jitter_lon = math.radians(rng.uniform(-jitter_span, jitter_span))
                out.append(
                    FluxTubeSeed(
                        idx=idx,
                        region_idx=region.idx,
                        strength=strength,
                        twist=twist,
                        chirality=chirality,
                        family=family,
                        polarity_sign=root_sign,
                        footpoint_jitter_lat_rad=jitter_lat,
                        footpoint_jitter_lon_rad=jitter_lon,
                    )
                )
                idx += 1
            if idx >= self.base_tube_count:
                break

        while idx < self.base_tube_count:
            region = self.active_regions[idx % len(self.active_regions)]
            family = "loop"
            if idx % 11 == 0:
                family = "cme"
            elif idx % 3 == 0:
                family = "plume"

            root_sign = region.hale_cycle25_leading_polarity if family != "plume" else -region.hale_cycle25_leading_polarity
            strength = _clamp(region.strength * (0.78 + 0.44 * rng.random()), 0.05, 1.0)
            twist = rng.uniform(0.24, 1.4)
            chirality = -region.hemisphere_sign if family != "cme" else region.hemisphere_sign
            jitter_lat = math.radians(rng.uniform(-2.2, 2.2))
            jitter_lon = math.radians(rng.uniform(-2.2, 2.2))
            out.append(
                FluxTubeSeed(
                    idx=idx,
                    region_idx=region.idx,
                    strength=strength,
                    twist=twist,
                    chirality=chirality,
                    family=family,
                    polarity_sign=root_sign,
                    footpoint_jitter_lat_rad=jitter_lat,
                    footpoint_jitter_lon_rad=jitter_lon,
                )
            )
            idx += 1

        return out

    def capabilities(self) -> dict[str, Any]:
        return {
            "model": self.model_name,
            "description": (
                "Backend-driven quasi-MHD solar corona model producing 3D eruptive structures "
                "from rotating active regions with solar-cycle forcing."
            ),
            "fidelity_levels": list(self.fidelity_levels),
            "forcing_modes": list(self.FORCING_MODES),
            "default_fidelity": self.default_fidelity,
            "base_flux_tube_count": self.base_tube_count,
            "active_region_count": len(self.active_regions),
            "solar_radius_km": SOLAR_RADIUS_KM,
            "solar_radius_au": SOLAR_RADIUS_AU,
            "solar_cycle_days": SOLAR_CYCLE_DAYS,
            "activity_cycle_model": "hathaway_2015_normalized",
            "activity_cycle_params": {
                "b_months": HATHAWAY_B,
                "c_asymmetry": HATHAWAY_C,
                "reference_cycle_start_jd": CYCLE_25_START_JD,
            },
            "notes": [
                "Deterministic physically-inspired synthesis, not a full MHD PDE solve.",
                "Uses a normalized Hathaway envelope with Carrington-scale rotation modulation.",
                "Coronal loops are anchored to bipolar active-region polarity pairs.",
                "RTV-like temperature scaling and expanded CME speed envelope (20-3500 km/s).",
                "Returns feature arcs in solar-radii units for direct 3D rendering.",
                "Epoch sampling is deterministic by default; observation overlays only affect rendering.",
            ],
        }

    @staticmethod
    def _extract_numeric(mapping: dict[str, Any] | None, key: str) -> float | None:
        if not isinstance(mapping, dict):
            return None
        value = mapping.get(key)
        if not isinstance(value, (float, int)):
            return None
        value_f = float(value)
        if not math.isfinite(value_f):
            return None
        return value_f

    @staticmethod
    def _parse_utc_timestamp(value: Any) -> datetime | None:
        if not isinstance(value, str):
            return None
        raw = value.strip()
        if not raw:
            return None
        # Normalize common UTC forms: "YYYY-MM-DD HH:MM:SS" and ISO8601 with Z.
        normalized = raw.replace("Z", "+00:00")
        if " " in normalized and "T" not in normalized:
            normalized = normalized.replace(" ", "T")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _freshness_weight(timestamp: datetime | None, max_age_s: float) -> float | None:
        if timestamp is None:
            return None
        age_s = max(0.0, (datetime.now(timezone.utc) - timestamp).total_seconds())
        return _clamp(1.0 - age_s / max(1.0, max_age_s), 0.0, 1.0)

    def _apply_realtime_forcing(
        self,
        synthetic_activity: float,
        forcing: str,
        realtime_data: dict[str, Any] | None,
    ) -> tuple[float, dict[str, Any], float | None]:
        forcing_key = forcing.strip().lower()
        if forcing_key not in self.FORCING_MODES:
            forcing_key = "synthetic"

        assimilation = {
            "mode": forcing_key,
            "applied": False,
            "synthetic_activity_index": synthetic_activity,
            "observed_activity_index": None,
            "blended_activity_index": synthetic_activity,
            "observed_confidence": 0.0,
            "blend_weight": 0.0,
            "live_data_available": False,
            "source_status": None,
            "proxy_breakdown": {},
            "sources": {
                "swpc": None,
                "silso": None,
                "sdo_aia": None,
            },
        }
        if forcing_key == "synthetic":
            return synthetic_activity, assimilation, None
        if not isinstance(realtime_data, dict):
            return synthetic_activity, assimilation, None

        assimilation["source_status"] = realtime_data.get("source_status")
        swpc = realtime_data.get("swpc")
        silso = realtime_data.get("silso")
        sdo_aia = realtime_data.get("sdo_aia")
        assimilation["sources"]["swpc"] = swpc
        assimilation["sources"]["silso"] = silso
        assimilation["sources"]["sdo_aia"] = sdo_aia
        assimilation["live_data_available"] = any(
            isinstance(value, dict) for value in (swpc, silso, sdo_aia)
        )

        proxy_breakdown: dict[str, float] = {}
        observed_proxy = self._extract_numeric(realtime_data, "combined_activity_proxy")
        if observed_proxy is None:
            weighted_sum = 0.0
            weight_total = 0.0
            swpc_proxy = self._extract_numeric(swpc, "activity_proxy")
            silso_proxy = self._extract_numeric(silso, "activity_proxy")
            sdo_proxy = self._extract_numeric(sdo_aia, "activity_proxy")
            if swpc_proxy is not None:
                weighted_sum += swpc_proxy * 0.5
                weight_total += 0.5
                proxy_breakdown["swpc"] = swpc_proxy
            if silso_proxy is not None:
                weighted_sum += silso_proxy * 0.35
                weight_total += 0.35
                proxy_breakdown["silso"] = silso_proxy
            if sdo_proxy is not None:
                weighted_sum += sdo_proxy * 0.15
                weight_total += 0.15
                proxy_breakdown["sdo_aia"] = sdo_proxy
            if weight_total > 0:
                observed_proxy = _clamp(weighted_sum / weight_total, 0.0, 1.0)
        else:
            proxy_breakdown["combined"] = observed_proxy

        if observed_proxy is None:
            assimilation["blended_activity_index"] = synthetic_activity
            assimilation["proxy_breakdown"] = proxy_breakdown
            return synthetic_activity, assimilation, self._extract_numeric(swpc, "solar_wind_speed_kms")

        swpc_time = self._parse_utc_timestamp(swpc.get("time_tag") if isinstance(swpc, dict) else None)
        silso_date = self._parse_utc_timestamp(
            f"{silso.get('date')}T00:00:00Z" if isinstance(silso, dict) and isinstance(silso.get("date"), str) else None
        )
        sdo_time = self._parse_utc_timestamp(
            (
                sdo_aia.get("latest_image_date_utc")
                if isinstance(sdo_aia, dict) and isinstance(sdo_aia.get("latest_image_date_utc"), str)
                else sdo_aia.get("request_date_utc")
                if isinstance(sdo_aia, dict)
                else None
            )
        )
        swpc_weight = self._freshness_weight(swpc_time, max_age_s=4.0 * 3_600.0)
        silso_weight = self._freshness_weight(silso_date, max_age_s=8.0 * 86_400.0)
        sdo_weight = self._freshness_weight(sdo_time, max_age_s=10.0 * 3_600.0)

        confidence_sum = 0.0
        confidence_weight_total = 0.0
        if swpc_weight is not None:
            confidence_sum += swpc_weight * 0.48
            confidence_weight_total += 0.48
        if silso_weight is not None:
            confidence_sum += silso_weight * 0.27
            confidence_weight_total += 0.27
        if sdo_weight is not None:
            confidence_sum += sdo_weight * 0.25
            confidence_weight_total += 0.25
        observed_confidence = (
            _clamp(confidence_sum / confidence_weight_total, 0.0, 1.0)
            if confidence_weight_total > 0
            else 0.0
        )

        assimilation["observed_activity_index"] = observed_proxy
        assimilation["observed_confidence"] = observed_confidence
        assimilation["proxy_breakdown"] = proxy_breakdown

        if forcing_key == "data_driven":
            blend_weight = 0.78 + 0.18 * observed_confidence
        else:
            # Hybrid keeps synthetic cycle continuity while nudging toward real-time observations.
            blend_weight = 0.25 + 0.35 * observed_confidence
        blend_weight = _clamp(blend_weight, 0.0, 1.0)
        blended_activity = synthetic_activity * (1.0 - blend_weight) + observed_proxy * blend_weight
        blended_activity = _clamp(blended_activity, 0.02, 0.98)

        assimilation["applied"] = True
        assimilation["blend_weight"] = blend_weight
        assimilation["blended_activity_index"] = blended_activity
        return blended_activity, assimilation, self._extract_numeric(swpc, "solar_wind_speed_kms")

    def _activity_index(self, jd: float) -> tuple[float, float]:
        t_months = _cycle_offset_months(jd)
        cycle_phase = (t_months / CYCLE_LENGTH_MONTHS) * 2.0 * math.pi
        hathaway = _hathaway_normalized(t_months, HATHAWAY_B, HATHAWAY_C)
        rotation_mod = 0.5 + 0.5 * math.sin(((jd - J2000_JD) / CARRINGTON_ROTATION_DAYS) * 2.0 * math.pi + 0.17)
        activity = 0.06 + hathaway * 0.82 + rotation_mod * 0.10
        return _clamp(activity, 0.02, 0.98), cycle_phase

    def _feature_temporal_state(
        self,
        tube: FluxTubeSeed,
        jd: float,
        wall_jd: float,
    ) -> tuple[float, float]:
        slow_period_days = 6.0 + tube.twist * 3.4
        if tube.family == "cme":
            rapid_period_days = 0.09 + (tube.idx % 7) * 0.011
        elif tube.family == "plume":
            rapid_period_days = 0.16 + (tube.idx % 11) * 0.012
        else:
            rapid_period_days = 0.26 + (tube.idx % 13) * 0.018

        slow_phase = ((jd - J2000_JD) / slow_period_days) * 2.0 * math.pi
        rapid_phase = ((wall_jd - J2000_JD) / rapid_period_days) * 2.0 * math.pi
        micro_phase = ((wall_jd - J2000_JD) / max(0.03, rapid_period_days * 0.35)) * 2.0 * math.pi
        phase_offset = tube.idx * 0.193 + tube.twist * 1.17

        slow = 0.5 + 0.5 * math.sin(slow_phase + phase_offset)
        rapid = 0.5 + 0.5 * math.sin(rapid_phase + phase_offset * 1.7)
        micro = 0.5 + 0.5 * math.sin(micro_phase + phase_offset * 0.73)
        emergence = _clamp(0.1 + slow * 0.42 + rapid * 0.34 + micro * 0.14, 0.0, 1.0)

        eruption_gate = 0.0
        if tube.family == "cme":
            eruption_gate = _clamp((rapid - 0.7) / 0.3, 0.0, 1.0) * _clamp((micro - 0.6) / 0.4, 0.0, 1.0)
        return emergence, eruption_gate

    def _feature_score(
        self,
        tube: FluxTubeSeed,
        jd: float,
        wall_jd: float,
        activity: float,
    ) -> float:
        emergence, eruption_gate = self._feature_temporal_state(tube, jd, wall_jd)
        region = self.active_regions[tube.region_idx]
        cme_boost = 1.3 if tube.family == "cme" else 1.0
        plume_boost = 1.08 if tube.family == "plume" else 1.0
        base = tube.strength * region.strength * (0.3 + 0.7 * activity) * (0.2 + 0.8 * emergence)
        return base * cme_boost * plume_boost + eruption_gate * (0.2 + 1.4 * tube.strength) * activity

    def _region_polarity_dirs(
        self,
        region: ActiveRegionSeed,
        jd: float,
    ) -> tuple[
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        float,
    ]:
        lat = region.center_lat_rad
        lon = (region.center_lon_rad + _differential_rotation_rad_day(lat) * (jd - J2000_JD)) % (2.0 * math.pi)
        center = _normalize(_vector_from_lat_lon(lat, lon))

        east = _normalize((-math.sin(lon), math.cos(lon), 0.0))
        north = _normalize((-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)))
        axis = _normalize(_add(_scale(east, math.cos(region.tilt_rad)), _scale(north, math.sin(region.tilt_rad))))

        half_sep = max(0.005, region.separation_rad * 0.5)
        offset = math.tan(half_sep)
        positive = _normalize(_add(center, _scale(axis, offset)))
        negative = _normalize(_add(center, _scale(axis, -offset)))
        cycle_number = _solar_cycle_number(jd)
        north_leading_sign = -1.0 if cycle_number % 2 == 1 else 1.0
        leading_polarity_sign = north_leading_sign * region.hemisphere_sign
        return center, negative, positive, axis, leading_polarity_sign

    @staticmethod
    def _jitter_direction(
        direction: tuple[float, float, float],
        jitter_a: float,
        jitter_b: float,
    ) -> tuple[float, float, float]:
        tangent, binormal = _orthonormal_basis(direction)
        return _normalize(
            (
                direction[0] + tangent[0] * jitter_a + binormal[0] * jitter_b,
                direction[1] + tangent[1] * jitter_a + binormal[1] * jitter_b,
                direction[2] + tangent[2] * jitter_a + binormal[2] * jitter_b,
            )
        )

    def _thermodynamic_state(
        self,
        tube: FluxTubeSeed,
        region: ActiveRegionSeed,
        activity: float,
        emergence: float,
        eruption_gate: float,
    ) -> tuple[float, float, float, float, float]:
        # Magnetic field strength in gauss.
        field = 18.0 + 410.0 * region.strength * (0.32 + 0.68 * activity) * (0.3 + 0.7 * emergence)
        if tube.family == "loop":
            field *= 1.05
        elif tube.family == "plume":
            field *= 0.78
        else:
            field *= 1.0 + 0.55 * eruption_gate
        field = _clamp(field, 12.0, 650.0)

        # RTV-like coupling: T ~ B^(2/7)
        temperature_mk = 1.7 * ((field / 100.0) ** (2.0 / 7.0)) * (0.82 + 0.38 * emergence + 0.24 * activity)
        if tube.family == "cme":
            temperature_mk *= 1.0 + 0.35 * eruption_gate
        elif tube.family == "plume":
            temperature_mk *= 0.86
        temperature_mk = _clamp(temperature_mk, 0.55, 9.5)

        # Coarse electron density estimate in m^-3.
        electron_density = (1.8e14 + 8.2e14 * activity + 3.6e14 * emergence) * (0.75 + 0.75 * region.strength)
        if tube.family == "loop":
            electron_density *= 1.45
        elif tube.family == "plume":
            electron_density *= 0.92
        else:
            electron_density *= 1.25 + 2.75 * eruption_gate

        mass_density = max(1e-17, electron_density * PROTON_MASS_KG * 1.18)
        b_tesla = field * 1e-4
        alfven_kms = b_tesla / max(1e-18, math.sqrt(MU0_SI * mass_density)) / 1_000.0
        sound_kms = 152.0 * math.sqrt(max(0.06, temperature_mk))
        return field, temperature_mk, electron_density, alfven_kms, sound_kms

    def _build_feature_arc(
        self,
        tube: FluxTubeSeed,
        jd: float,
        wall_jd: float,
        activity: float,
        emergence: float,
        eruption_gate: float,
        points_count: int,
    ) -> dict[str, Any]:
        region = self.active_regions[tube.region_idx]
        _, negative_dir, positive_dir, pair_axis, leading_polarity_sign = self._region_polarity_dirs(region, jd)

        if tube.polarity_sign >= 0:
            source_base = positive_dir
            sink_base = negative_dir
            source_polarity = "positive"
        else:
            source_base = negative_dir
            sink_base = positive_dir
            source_polarity = "negative"

        source_dir = self._jitter_direction(
            source_base,
            tube.footpoint_jitter_lat_rad,
            tube.footpoint_jitter_lon_rad,
        )
        sink_dir = self._jitter_direction(
            sink_base,
            -0.45 * tube.footpoint_jitter_lat_rad,
            0.45 * tube.footpoint_jitter_lon_rad,
        )
        source_role = "leading" if (tube.polarity_sign * leading_polarity_sign) > 0.0 else "trailing"

        base = _normalize(_add(source_dir, sink_dir))
        tangent, binormal = _orthonormal_basis(base)
        dynamic_phase = ((wall_jd - J2000_JD) / (0.22 + 0.04 * tube.twist)) * 2.0 * math.pi + tube.idx * 0.41

        family = tube.family
        if family == "cme":
            eruption_boost = eruption_gate * (1.2 + 1.55 * activity)
            peak = 1.16 + activity * (1.35 + region.strength * 1.25) + eruption_boost
            width = 0.045 + region.strength * 0.2 + eruption_gate * 0.2
        elif family == "plume":
            peak = 1.15 + activity * (1.55 + region.strength * 0.9) * (0.35 + 0.65 * emergence)
            width = 0.03 + region.strength * 0.14 + emergence * 0.045
        else:
            peak = 1.06 + activity * (1.25 + region.strength * 0.75) * (0.3 + 0.7 * emergence)
            width = 0.02 + region.strength * 0.1 + emergence * 0.03

        peak = _clamp(peak, 1.02, 4.8)

        field_strength_gauss, temperature_mk, electron_density_m3, alfven_speed_kms, sound_speed_kms = self._thermodynamic_state(
            tube,
            region,
            activity,
            emergence,
            eruption_gate,
        )

        if family == "cme":
            base_speed = 20.0 + 300.0 * tube.strength
            activity_speed = activity * (360.0 + tube.strength * 900.0)
            eruption_speed = eruption_gate * (400.0 + 1_800.0 * tube.strength)
            speed_kms = _clamp(
                base_speed + activity_speed + eruption_speed,
                20.0,
                3_500.0,
            )
        elif family == "plume":
            speed_kms = _clamp(
                sound_speed_kms * (0.75 + 0.65 * activity + 0.35 * emergence),
                45.0,
                1_200.0,
            )
        else:
            speed_kms = _clamp(
                sound_speed_kms * (0.38 + 0.34 * activity + 0.26 * emergence),
                20.0,
                650.0,
            )

        arc: list[list[float]] = []
        pair_normal = _normalize(_cross(source_dir, sink_dir))
        if _dot(pair_normal, pair_normal) < 1e-9:
            pair_normal = tangent

        for i in range(points_count):
            s = i / max(1, points_count - 1)
            sw = math.sin(math.pi * s)
            sway = math.sin(dynamic_phase + s * 5.8 + tube.idx * 0.07)
            swirl = tube.chirality * tube.twist * (0.12 + 0.5 * s) * (0.3 + activity * 0.7)
            swirl += sway * 0.14 * (0.2 + emergence * 0.8)

            if family == "loop":
                foot = _slerp(source_dir, sink_dir, s)
                lateral_dir = _normalize(_cross(pair_normal, foot))
                if _dot(lateral_dir, lateral_dir) < 1e-9:
                    lateral_dir = tangent
                binormal_dir = _normalize(_cross(foot, lateral_dir))

                radial = 1.0 + (peak - 1.0) * (sw ** (1.38 + 0.22 * (1.0 - emergence)))
                lateral = width * (0.25 + 0.75 * sw) * math.sin(2.0 * math.pi * s + swirl)
                binormal_offset = width * 0.5 * (0.2 + 0.8 * sw) * math.cos(2.0 * math.pi * s + swirl * 0.75)

            elif family == "plume":
                foot = source_dir
                lateral_dir = _normalize(_cross(pair_axis, source_dir))
                if _dot(lateral_dir, lateral_dir) < 1e-9:
                    lateral_dir = tangent
                binormal_dir = _normalize(_cross(source_dir, lateral_dir))

                radial = 1.0 + (peak - 1.0) * (s**1.34)
                lateral = width * (1.0 - s) * math.sin(6.0 * math.pi * s + swirl)
                binormal_offset = width * 0.42 * (1.0 - s) * math.cos(4.8 * math.pi * s + swirl * 0.8)

            else:  # CME-like eruptive front
                foot = _normalize(_add(source_dir, _scale(base, 0.35)))
                lateral_dir = _normalize(_cross(pair_axis, foot))
                if _dot(lateral_dir, lateral_dir) < 1e-9:
                    lateral_dir = tangent
                binormal_dir = _normalize(_cross(foot, lateral_dir))

                radial = 1.0 + (peak - 1.0) * (s**1.1)
                shell = width * (0.3 + 0.7 * s)
                lateral = shell * math.sin(4.2 * math.pi * s + swirl * 1.5)
                binormal_offset = shell * math.cos(3.3 * math.pi * s + swirl)

            px = foot[0] * radial + lateral_dir[0] * lateral + binormal_dir[0] * binormal_offset
            py = foot[1] * radial + lateral_dir[1] * lateral + binormal_dir[1] * binormal_offset
            pz = foot[2] * radial + lateral_dir[2] * lateral + binormal_dir[2] * binormal_offset
            arc.append([px, py, pz])

        brightness = _clamp(
            0.05
            + 0.26 * region.strength
            + 0.22 * activity
            + 0.24 * emergence
            + 0.08 * (temperature_mk / 5.0)
            + (0.33 * eruption_gate if family == "cme" else 0.0),
            0.02,
            1.0,
        )

        return {
            "id": f"tube-{tube.idx:04d}",
            "kind": family,
            "region_id": region.idx,
            "active_region_id": f"ar-{region.idx:03d}",
            "source_polarity": source_polarity,
            "source_role": source_role,
            "leading_polarity_sign": leading_polarity_sign,
            "polarity": tube.polarity_sign,
            "base_dir": [source_dir[0], source_dir[1], source_dir[2]],
            "paired_dir": [sink_dir[0], sink_dir[1], sink_dir[2]],
            "tangent_dir": [tangent[0], tangent[1], tangent[2]],
            "binormal_dir": [binormal[0], binormal[1], binormal[2]],
            "field_strength_gauss": field_strength_gauss,
            "temperature_mk": temperature_mk,
            "electron_density_m3": electron_density_m3,
            "alfven_speed_kms": alfven_speed_kms,
            "expansion_speed_kms": speed_kms,
            "brightness": brightness,
            "emergence": emergence,
            "peak_extent_solar_radii": peak,
            "arc": arc,
        }

    @staticmethod
    def _synthetic_coronal_holes(activity: float, jd: float) -> dict[str, Any]:
        """Generate plausible synthetic coronal hole placements from activity.

        At solar minimum: large polar coronal holes dominate.
        At solar maximum: polar holes shrink; stochastic equatorial holes appear.
        """
        holes: list[dict[str, Any]] = []
        # Polar holes: always present, shrink at solar max
        polar_extent_lat = math.radians(35.0 * (1.0 - activity * 0.7))
        polar_extent_lon = math.pi  # wrap around full longitude at poles
        polar_area = max(0.01, 0.15 * (1.0 - activity * 0.65))
        if polar_extent_lat > math.radians(5):
            holes.append({
                "center_lat_rad": math.radians(72.0),
                "center_lon_rad": 0.0,
                "extent_lat_rad": round(polar_extent_lat, 4),
                "extent_lon_rad": round(polar_extent_lon, 4),
                "area_fraction": round(polar_area, 5),
                "type": "polar",
            })
            holes.append({
                "center_lat_rad": math.radians(-72.0),
                "center_lon_rad": 0.0,
                "extent_lat_rad": round(polar_extent_lat, 4),
                "extent_lon_rad": round(polar_extent_lon, 4),
                "area_fraction": round(polar_area, 5),
                "type": "polar",
            })

        # Equatorial holes at high activity
        if activity > 0.35:
            rng = Random(int(jd * 100) % 99991)
            eq_count = int(1 + activity * 3)
            for i in range(min(eq_count, 4)):
                center_lat = math.radians(rng.uniform(-30, 30))
                center_lon = math.radians(rng.uniform(-90, 90))
                extent_lat = math.radians(rng.uniform(8, 22) * activity)
                extent_lon = math.radians(rng.uniform(12, 35) * activity)
                area_frac = 0.01 + rng.random() * 0.04 * activity
                holes.append({
                    "center_lat_rad": round(center_lat, 4),
                    "center_lon_rad": round(center_lon, 4),
                    "extent_lat_rad": round(extent_lat, 4),
                    "extent_lon_rad": round(extent_lon, 4),
                    "area_fraction": round(area_frac, 5),
                    "type": "equatorial",
                })

        coverage = sum(h["area_fraction"] for h in holes)
        return {
            "source": "synthetic",
            "coverage_fraction": round(min(0.5, coverage), 4),
            "polar_open_flux_north": round(polar_area if polar_extent_lat > math.radians(5) else 0.0, 4),
            "polar_open_flux_south": round(polar_area if polar_extent_lat > math.radians(5) else 0.0, 4),
            "hole_count": len(holes),
            "holes": holes,
        }

    def _build_parker_spiral(
        self,
        jd: float,
        activity: float,
        line_count: int = 6,
        point_count: int = 80,
        max_extent_au: float = 3.0,
        wind_speed_kms_override: float | None = None,
        coronal_holes: dict[str, Any] | None = None,
        wsa_result: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        omega_sun_rad_day = 2.0 * math.pi / 25.38
        source_surface_radii = 2.5
        source_surface_au = source_surface_radii * SOLAR_RADIUS_AU
        max_radius_au = max(source_surface_au * 1.5, float(max_extent_au))
        lines: list[dict[str, Any]] = []
        safe_line_count = max(1, int(line_count))
        safe_point_count = max(2, int(point_count))
        rotation_phase = ((jd - J2000_JD) / 25.38) * 2.0 * math.pi
        override_wind = (
            _clamp(float(wind_speed_kms_override), 280.0, 900.0)
            if isinstance(wind_speed_kms_override, (float, int)) and math.isfinite(float(wind_speed_kms_override))
            else None
        )

        # Import WSA lookup if available
        has_wsa = wsa_result is not None and isinstance(wsa_result, dict) and wsa_result.get("open_mask") is not None

        # Extract coronal hole boundaries for fallback fast/slow wind assignment
        ch_holes = []
        if isinstance(coronal_holes, dict):
            raw_holes = coronal_holes.get("holes")
            if isinstance(raw_holes, list):
                for h in raw_holes:
                    if isinstance(h, dict):
                        clat = h.get("center_lat_rad")
                        elat = h.get("extent_lat_rad")
                        if isinstance(clat, (float, int)) and isinstance(elat, (float, int)):
                            ch_holes.append((float(clat), float(elat)))

        for i in range(safe_line_count):
            arm_phase = rotation_phase + (2.0 * math.pi * i / safe_line_count)
            sector_wave = math.sin(arm_phase * 2.1 + activity * 1.3)

            # HCS tilt: ~7° at solar minimum → ~75° at solar maximum.
            hcs_tilt_deg = 7.25 + 67.75 * (activity ** 1.8)
            hcs_tilt_rad = math.radians(_clamp(hcs_tilt_deg, 7.0, 75.0))

            # Source surface latitude for this arm
            source_lat = hcs_tilt_rad * math.sin(arm_phase + i * 0.33)

            # ── Determine wind speed ──────────────────────────────────
            in_coronal_hole = False
            wind_speed_source = "empirical"

            if has_wsa:
                # Use WSA model: look up velocity at source surface coordinates
                from sim.pfss_magnetogram import wsa_velocity_at_source_surface
                wsa_v = wsa_velocity_at_source_surface(
                    wsa_result,
                    ss_lat_rad=source_lat,
                    ss_lon_rad=arm_phase % (2.0 * math.pi),
                )
                intrinsic_wind = wsa_v
                in_coronal_hole = wsa_v > 550.0  # WSA fast wind threshold
                wind_speed_source = "wsa_arge_2003"
            else:
                # Fallback: coronal hole heuristic
                if ch_holes:
                    hcs_tilt_rad_check = hcs_tilt_rad
                    for ch_center_lat, ch_extent_lat in ch_holes:
                        is_polar = abs(ch_center_lat) > math.radians(50)
                        if is_polar:
                            polar_coupling = 1.0 - activity * 0.85
                            if i % 3 != 0 and polar_coupling > 0.3:
                                in_coronal_hole = True
                                break
                        else:
                            if abs(source_lat - ch_center_lat) < ch_extent_lat:
                                in_coronal_hole = True
                                break

                if in_coronal_hole:
                    intrinsic_wind = 720.0 + 60.0 * sector_wave
                else:
                    intrinsic_wind = 400.0 + 50.0 * sector_wave

            wind_speed_kms = (
                _clamp(0.58 * override_wind + 0.42 * intrinsic_wind, 280.0, 900.0)
                if override_wind is not None
                else _clamp(intrinsic_wind, 265.0, 860.0)
            )
            wind_speed_au_day = wind_speed_kms / (AU_KM / 86_400.0)
            polarity_sign = 1.0 if i % 2 == 0 else -1.0
            arc: list[list[float]] = []

            for p in range(safe_point_count):
                frac = p / max(1, safe_point_count - 1)
                r_au = source_surface_au + (max_radius_au - source_surface_au) * (frac**1.45)
                delta_r = r_au - source_surface_au
                phi = arm_phase - (omega_sun_rad_day / max(1e-6, wind_speed_au_day)) * delta_r
                lat = hcs_tilt_rad * math.sin(phi + i * 0.33)
                direction = _vector_from_lat_lon(lat, phi)
                r_solar = r_au / SOLAR_RADIUS_AU
                arc.append([direction[0] * r_solar, direction[1] * r_solar, direction[2] * r_solar])

            lines.append(
                {
                    "id": f"spiral-{i:02d}",
                    "polarity": polarity_sign,
                    "source_lat_deg": round(math.degrees(source_lat), 1),
                    "wind_speed_kms": round(wind_speed_kms, 1),
                    "wind_speed_source": wind_speed_source,
                    "in_coronal_hole": in_coronal_hole,
                    "arc": arc,
                }
            )

        mean_wind = sum(float(line["wind_speed_kms"]) for line in lines) / max(1, len(lines))
        return {
            "line_count": len(lines),
            "point_count": safe_point_count,
            "source_surface_radii": source_surface_radii,
            "max_extent_au": max_radius_au,
            "max_extent_solar_radii": max_radius_au / SOLAR_RADIUS_AU,
            "wind_speed_kms": mean_wind,
            "wind_speed_model": "wsa_arge_2003" if has_wsa else "empirical_ch_bimodal",
            "omega_sun_rad_day": omega_sun_rad_day,
            "lines": lines,
        }

    def sample_state(
        self,
        jd: float,
        fidelity: str = "operational",
        max_features: int = 220,
        forcing: str = "synthetic",
        realtime_data: dict[str, Any] | None = None,
        wall_jd: float | None = None,
    ) -> dict[str, Any]:
        fidelity_key = fidelity.strip().lower()
        if fidelity_key not in self.FIDELITY_POINT_COUNT:
            fidelity_key = self.default_fidelity
        points_count = self.FIDELITY_POINT_COUNT[fidelity_key]

        synthetic_activity, cycle_phase = self._activity_index(jd)
        activity, assimilation, wind_speed_kms_override = self._apply_realtime_forcing(
            synthetic_activity,
            forcing,
            realtime_data,
        )
        wall_jd = jd if wall_jd is None else wall_jd
        safe_max_features = max(8, min(2_048, int(max_features)))

        scored: list[tuple[float, FluxTubeSeed, float, float]] = []
        for tube in self.seeds:
            emergence, eruption_gate = self._feature_temporal_state(tube, jd, wall_jd)
            score = self._feature_score(tube, jd, wall_jd, activity)
            scored.append((score, tube, emergence, eruption_gate))
        scored.sort(key=lambda row: row[0], reverse=True)

        # Drive feature count with activity and requested fidelity.
        rapid_scene_phase = ((wall_jd - J2000_JD) / 0.18) * 2.0 * math.pi
        live_variation = 0.5 + 0.5 * math.sin(rapid_scene_phase)
        nominal_count = int(18 + activity * 240 + live_variation * 96)
        feature_count = min(safe_max_features, max(12, nominal_count))
        selected = scored[:feature_count]

        features = []
        for _, tube, emergence, eruption_gate in selected:
            features.append(
                self._build_feature_arc(
                    tube,
                    jd,
                    wall_jd,
                    activity,
                    emergence,
                    eruption_gate,
                    points_count=points_count,
                )
            )

        max_extent = max((feat["peak_extent_solar_radii"] for feat in features), default=1.0)

        if fidelity_key == "preview":
            spiral_points = 48
        elif fidelity_key == "operational":
            spiral_points = 64
        elif fidelity_key == "high":
            spiral_points = 80
        else:
            spiral_points = 96

        # ─── Coronal Hole Extraction / Synthesis ────────────────────────────
        coronal_holes_data: dict[str, Any] | None = None
        if isinstance(realtime_data, dict):
            sdo_aia = realtime_data.get("sdo_aia")
            if isinstance(sdo_aia, dict):
                coronal_holes_data = sdo_aia.get("coronal_holes")
        if not isinstance(coronal_holes_data, dict) or not coronal_holes_data.get("holes"):
            coronal_holes_data = self._synthetic_coronal_holes(activity, jd)

        # ─── PFSS Magnetogram-Driven Field ──────────────────────────────
        # Must run before Parker spiral so WSA velocity map is available.
        if fidelity_key == "preview":
            pfss_lines = 40
            pfss_lmax = 9
        elif fidelity_key == "operational":
            pfss_lines = 80
            pfss_lmax = 12
        elif fidelity_key == "high":
            pfss_lines = 120
            pfss_lmax = 15
        else:
            pfss_lines = 180
            pfss_lmax = 15

        # Trigger PFSS cache (it will fetch GONG or use synthetic fallback appropriately)
        pfss_field_lines = self._pfss_cache.get_or_compute(
            jd=jd,
            activity=activity,
            n_lines=pfss_lines,
            lmax=pfss_lmax,
            gong_timeout_s=3.5,
        )

        # Extract internal WSA result for Parker spiral wind speeds (NumPy grids; not JSON-serializable).
        wsa_result = pfss_field_lines.get("_wsa_result") if isinstance(pfss_field_lines, dict) else None

        parker_spiral = self._build_parker_spiral(
            jd=jd,
            activity=activity,
            line_count=6,
            point_count=spiral_points,
            max_extent_au=3.0,
            wind_speed_kms_override=wind_speed_kms_override,
            coronal_holes=coronal_holes_data,
            wsa_result=wsa_result,
        )

        pfss_public = dict(pfss_field_lines) if isinstance(pfss_field_lines, dict) else pfss_field_lines
        if isinstance(pfss_public, dict):
            pfss_public.pop("_wsa_result", None)

        return {
            "schema": {"name": "solar_physics_state", "version": 1},
            "model": self.model_name,
            "epoch_jd": float(jd),
            "wall_epoch_jd": float(wall_jd),
            "fidelity": fidelity_key,
            "solar_radius_km": SOLAR_RADIUS_KM,
            "solar_radius_au": SOLAR_RADIUS_AU,
            "activity_index": activity,
            "synthetic_activity_index": synthetic_activity,
            "cycle_phase_rad": cycle_phase,
            "data_assimilation": assimilation,
            "surface": {
                "differential_rotation_model": "snodgrass_1983_like",
                "activity_cycle_model": "hathaway_2015_normalized",
                "activity_cycle_params": {
                    "b_months": HATHAWAY_B,
                    "c_asymmetry": HATHAWAY_C,
                    "reference_cycle_start_jd": CYCLE_25_START_JD,
                },
                "estimated_equatorial_rotation_days": 24.47,
                "estimated_polar_rotation_days": 34.3,
                "active_region_count": len(self.active_regions),
            },
            "corona": {
                "feature_count": len(features),
                "max_extent_solar_radii": max_extent,
                "topology_model": "bipolar_active_region_pairs",
                "features": features,
            },
            "coronal_holes": coronal_holes_data,
            "heliosphere": {
                "parker_spiral": parker_spiral,
            },
            "pfss_field_lines": pfss_public,
        }
