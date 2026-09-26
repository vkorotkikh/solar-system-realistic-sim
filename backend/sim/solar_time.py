"""Scale-aware solar time and Carrington mean-rotation utilities.

The mean Carrington rotation functions in this module are deliberately limited
to archive-search hints.  Provider metadata (for example, GONG ``CRNOW``) is
authoritative for an observed product's Carrington identity.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

import astropy.units as u
from astropy.time import Time, TimeDelta

CARRINGTON_ROTATION_1_EPOCH_JD_TT = 2_398_167.4
CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS = 27.2753
CARRINGTON_SIDEREAL_ROTATION_RATE_DEG_PER_DAY = 14.1844
CARRINGTON_APPROXIMATE_SIDEREAL_PERIOD_DAYS = (
    360.0 / CARRINGTON_SIDEREAL_ROTATION_RATE_DEG_PER_DAY
)
CURRENT_JD_TIME_SCALE = "TDB"

MEAN_CARRINGTON_MODEL = "mean_synodic_search_hint_v1"
GONG_CRNOW_MODEL = "gong_crnow_v1"

CARRINGTON_ROTATION_1_EPOCH_TT = Time(
    CARRINGTON_ROTATION_1_EPOCH_JD_TT,
    format="jd",
    scale="tt",
)


@dataclass(frozen=True)
class MeanCarringtonEstimate:
    """Non-authoritative mean-period estimate used only as an archive hint."""

    rotation_number: int
    fractional_rotation: float
    model: str = MEAN_CARRINGTON_MODEL
    authoritative: bool = False


@dataclass(frozen=True)
class ProviderCarringtonState:
    """Carrington state copied from validated provider ``CRNOW`` metadata."""

    rotation_number: int
    fractional_rotation: float
    current_longitude_deg: float
    source: str = GONG_CRNOW_MODEL
    authoritative: bool = True


def _require_scalar_time(when: Time) -> Time:
    if not isinstance(when, Time):
        raise TypeError("when must be an astropy.time.Time with an explicit scale")
    if not when.isscalar:
        raise ValueError("when must be a scalar time")
    if not math.isfinite(float(when.jd)):
        raise ValueError("when must be finite")
    return when


def mean_carrington_rotation_estimate(when: Time) -> MeanCarringtonEstimate:
    """Estimate the mean Carrington rotation at a scale-aware instant.

    This linear model is suitable for bounded archive discovery only.  It is
    neither an apparent-Sun ephemeris nor provider product identity.
    """

    scalar_time = _require_scalar_time(when)
    elapsed_days = (scalar_time.tt - CARRINGTON_ROTATION_1_EPOCH_TT).to_value(u.day)
    fractional_rotation = elapsed_days / CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS + 1.0
    return MeanCarringtonEstimate(
        rotation_number=math.floor(fractional_rotation),
        fractional_rotation=float(fractional_rotation),
    )


def mean_carrington_rotation_number(when: Time) -> int:
    """Return the integer part of the mean-synodic archive-search hint."""

    return mean_carrington_rotation_estimate(when).rotation_number


def mean_carrington_rotation_start(rotation_number: int) -> Time:
    """Return a mean rotation boundary as an explicitly TT ``Time``."""

    if isinstance(rotation_number, bool) or not isinstance(rotation_number, int):
        raise TypeError("rotation_number must be an integer")
    elapsed_days = (rotation_number - 1) * CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS
    return CARRINGTON_ROTATION_1_EPOCH_TT + TimeDelta(elapsed_days, format="jd")


def mean_carrington_rotation_range_jd_tdb(rotation_number: int) -> tuple[float, float]:
    """Return mean start/end boundaries converted from TT to explicit JDTDB."""

    start_tt = mean_carrington_rotation_start(rotation_number)
    end_tt = mean_carrington_rotation_start(rotation_number + 1)
    return float(start_tt.tdb.jd), float(end_tt.tdb.jd)


def mean_carrington_rotation_number_from_jd_tdb(jd_tdb: float) -> int:
    """Return the mean rotation search hint for an explicitly JDTDB input."""

    return mean_carrington_rotation_number(Time(float(jd_tdb), format="jd", scale="tdb"))


def provider_carrington_state_from_crnow(crnow: float) -> ProviderCarringtonState:
    """Interpret validated GONG ``CRNOW`` as provider-authoritative state."""

    fractional_rotation = float(crnow)
    if not math.isfinite(fractional_rotation):
        raise ValueError("CRNOW must be finite")
    rotation_number = math.floor(fractional_rotation)
    phase = fractional_rotation - rotation_number
    current_longitude_deg = (-360.0 * phase) % 360.0
    if math.isclose(current_longitude_deg, 360.0, rel_tol=0.0, abs_tol=1e-12):
        current_longitude_deg = 0.0
    return ProviderCarringtonState(
        rotation_number=rotation_number,
        fractional_rotation=fractional_rotation,
        current_longitude_deg=current_longitude_deg,
    )


def current_jd_tdb(now_utc: datetime | None = None) -> float:
    """Return the current (or injected) aware UTC instant as JDTDB."""

    instant = now_utc if now_utc is not None else datetime.now(timezone.utc)
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("now_utc must be timezone-aware")
    normalized_utc = instant.astimezone(timezone.utc)
    return float(Time(normalized_utc, scale="utc").tdb.jd)
