"""Representational evidence, not permission to coerce UTC leap seconds.

Known UTC/TAI offsets provide an independent scale-identity oracle. The
rounding interval is derived from adjacent binary64 values, not a tolerance
chosen to make midnight pass. A scalar cannot recover which instant in that
interval the caller originally supplied; two-part JD can preserve it.
"""

import math
from datetime import datetime, timezone

import pytest
from astropy.time import Time

from sim.solar_time import jd_tdb_to_utc_datetime


# UTC midnight, preceding leap second, TAI-UTC after the leap.
LEAP_BOUNDARIES = [
    ("1990-01-01T00:00:00", "1989-12-31T23:59:60", 25),
    ("2012-07-01T00:00:00", "2012-06-30T23:59:60", 35),
    ("2015-07-01T00:00:00", "2015-06-30T23:59:60", 36),
    ("2017-01-01T00:00:00", "2016-12-31T23:59:60", 37),
]


@pytest.mark.parametrize("midnight_tag,leap_tag,tai_offset", LEAP_BOUNDARIES)
def test_scalar_jd_bin_contains_both_midnight_and_a_genuine_leap_instant(
    midnight_tag, leap_tag, tai_offset
):
    midnight = Time(midnight_tag, scale="utc")
    leap = Time(leap_tag + ".99999", scale="utc")
    tai_midnight = Time(midnight_tag[:-2] + f"{tai_offset:02d}", scale="tai")
    assert abs((midnight.tai - tai_midnight).to_value("sec")) < 1e-9
    assert float(leap.utc.ymdhms.second) > 60

    scalar = float(midnight.tdb.jd)
    assert scalar == float(leap.tdb.jd)
    # Adding these half-gaps as ordinary floats would itself round away the
    # interval. Astropy's two-part constructor retains both endpoints.
    lower_gap = (scalar - math.nextafter(scalar, -math.inf)) / 2
    upper_gap = (math.nextafter(scalar, math.inf) - scalar) / 2
    lower = Time(scalar, -lower_gap, format="jd", scale="tdb")
    upper = Time(scalar, upper_gap, format="jd", scale="tdb")
    for instant in (midnight.tdb, leap.tdb):
        assert (instant - lower).to_value("sec") >= 0
        assert (upper - instant).to_value("sec") >= 0

    decoded = Time(scalar, format="jd", scale="tdb")
    error_s = (decoded - midnight.tdb).to_value("sec")
    assert -upper_gap * 86400 <= error_s < 0
    assert abs(error_s) <= math.ulp(scalar) * 86400 / 2
    assert float(decoded.utc.ymdhms.second) > 60


@pytest.mark.parametrize("midnight_tag,leap_tag,tai_offset", LEAP_BOUNDARIES)
def test_two_part_tdb_preserves_the_identity_lost_by_scalar_jd(
    midnight_tag, leap_tag, tai_offset
):
    midnight = Time(midnight_tag, scale="utc").tdb
    leap = Time(leap_tag + ".99999", scale="utc").tdb
    assert midnight.jd1 != leap.jd1 or midnight.jd2 != leap.jd2
    recovered = Time(midnight.jd1, midnight.jd2, format="jd", scale="tdb")
    assert recovered.utc.to_datetime(timezone=timezone.utc) == datetime.fromisoformat(
        midnight_tag
    ).replace(tzinfo=timezone.utc)
    recovered_leap = Time(leap.jd1, leap.jd2, format="jd", scale="tdb")
    with pytest.raises(ValueError, match="leap second"):
        recovered_leap.utc.to_datetime(timezone=timezone.utc)


@pytest.mark.parametrize("midnight_tag,leap_tag,tai_offset", LEAP_BOUNDARIES)
@pytest.mark.parametrize("fraction", [".25", ".5", ".75"])
def test_scalar_adapter_does_not_silently_remap_genuine_leap_second_interiors(
    midnight_tag, leap_tag, tai_offset, fraction
):
    instant = Time(leap_tag + fraction, scale="utc")
    tai_leap = Time(
        midnight_tag[:-2] + f"{tai_offset - 1:02d}" + fraction, scale="tai"
    )
    assert abs((instant.tai - tai_leap).to_value("sec")) < 1e-9
    with pytest.raises(ValueError, match="leap second"):
        jd_tdb_to_utc_datetime(float(instant.tdb.jd))


@pytest.mark.parametrize("utc_tag,tai_offset", [
    ("1990-01-01T12:00:00", 25),
    ("2012-07-01T12:00:00", 35),
    ("2015-07-01T12:00:00", 36),
    ("2017-01-01T12:00:00", 37),
    ("2020-01-01T00:00:00", 37),
    ("2026-10-14T00:00:00", 37),
])
def test_ordinary_scalar_conversion_stays_within_representation_bounds(
    utc_tag, tai_offset
):
    expected = datetime.fromisoformat(utc_tag).replace(tzinfo=timezone.utc)
    utc = Time(utc_tag, scale="utc")
    tai = Time(utc_tag[:-2] + f"{tai_offset:02d}", scale="tai")
    assert abs((utc.tai - tai).to_value("sec")) < 1e-9
    scalar = float(utc.tdb.jd)
    decoded = Time(scalar, format="jd", scale="tdb")
    assert abs((decoded - utc.tdb).to_value("sec")) <= math.ulp(scalar) * 86400 / 2
    # Python datetime has a one-microsecond quantum, hence half a quantum of
    # rounding in addition to the scalar JD's half-ULP. No whole-second snap.
    bound_s = math.ulp(scalar) * 86400 / 2 + 0.5e-6
    assert abs((jd_tdb_to_utc_datetime(scalar) - expected).total_seconds()) <= bound_s


@pytest.mark.parametrize("midnight_tag,leap_tag,tai_offset", LEAP_BOUNDARIES)
def test_leap_start_bin_is_also_ambiguous_even_when_its_center_is_ordinary_utc(
    midnight_tag, leap_tag, tai_offset
):
    leap_start = Time(leap_tag, scale="utc")
    preceding_ordinary = Time(leap_tag[:-2] + "59.99999", scale="utc")
    tai_start = Time(midnight_tag[:-2] + f"{tai_offset - 1:02d}", scale="tai")
    assert abs((leap_start.tai - tai_start).to_value("sec")) < 1e-9
    scalar = float(leap_start.tdb.jd)
    assert scalar == float(preceding_ordinary.tdb.jd)
    decoded = Time(scalar, format="jd", scale="tdb")
    error_s = (decoded - leap_start.tdb).to_value("sec")
    assert -math.ulp(scalar) * 86400 / 2 <= error_s < 0
    assert float(decoded.utc.ymdhms.second) < 60
    upper_gap = (math.nextafter(scalar, math.inf) - scalar) / 2
    upper = Time(scalar, upper_gap, format="jd", scale="tdb")
    assert (upper - leap_start.tdb).to_value("sec") > 0
    assert float(upper.utc.ymdhms.second) >= 60
