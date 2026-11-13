"""Independent UTC/TAI anchors for the strict solar provider time contract."""

import math
from datetime import datetime, timezone

import pytest
from astropy.time import Time

from sim import solar_time


# Literal IERS UTC/TAI offsets after four distinct positive leap insertions.
BOUNDARIES = [
    ("1990-01-01T00:00:00", "1989-12-31T23:59:60", 25),
    ("2012-07-01T00:00:00", "2012-06-30T23:59:60", 35),
    ("2015-07-01T00:00:00", "2015-06-30T23:59:60", 36),
    ("2017-01-01T00:00:00", "2016-12-31T23:59:60", 37),
]


def independent_anchor(midnight, leap, offset, *, fraction=None):
    if fraction is None:
        utc = Time(midnight, scale="utc")
        tai = Time(midnight[:-2] + f"{offset:02d}", scale="tai")
    else:
        utc = Time(leap + fraction, scale="utc")
        tai = Time(midnight[:-2] + f"{offset - 1:02d}" + fraction, scale="tai")
    assert abs((utc.tai - tai).to_value("sec")) < 1e-9
    return utc.tdb


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
@pytest.mark.parametrize("edge", ["start", "end"])
def test_scalar_rounding_bin_crossing_either_leap_boundary_is_typed_rejection(
    midnight, leap, offset, edge,
):
    boundary = independent_anchor(
        midnight, leap, offset, fraction="" if edge == "start" else None,
    )
    with pytest.raises(ValueError) as caught:
        solar_time.jd_tdb_to_utc_datetime(float(boundary.jd))
    assert caught.value.code == "ambiguous_scalar_jd"
    assert "jd_tdb1" in str(caught.value) and "jd_tdb2" in str(caught.value)


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
@pytest.mark.parametrize("fraction", [".25", ".5", ".75"])
def test_scalar_leap_interior_has_typed_unsupported_instant_error(
    midnight, leap, offset, fraction,
):
    instant = independent_anchor(midnight, leap, offset, fraction=fraction)
    with pytest.raises(ValueError, match="leap second") as caught:
        solar_time.jd_tdb_to_utc_datetime(float(instant.jd))
    assert caught.value.code == "unsupported_utc_instant"


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
def test_precise_midnight_and_same_scalar_leap_interior_keep_distinct_identities(
    midnight, leap, offset,
):
    ordinary = independent_anchor(midnight, leap, offset)
    genuine_leap = independent_anchor(midnight, leap, offset, fraction=".99999")
    assert float(ordinary.jd) == float(genuine_leap.jd)
    normal_pair = solar_time.TwoPartJD(float(ordinary.jd1), float(ordinary.jd2))
    leap_pair = solar_time.TwoPartJD(float(genuine_leap.jd1), float(genuine_leap.jd2))
    assert normal_pair != leap_pair
    assert normal_pair.to_time() == ordinary
    assert leap_pair.to_time() == genuine_leap
    assert solar_time.jd_tdb_to_utc_datetime(normal_pair) == datetime.fromisoformat(
        midnight,
    ).replace(tzinfo=timezone.utc)
    with pytest.raises(ValueError) as caught:
        solar_time.jd_tdb_to_utc_datetime(leap_pair)
    assert caught.value.code == "unsupported_utc_instant"


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
def test_two_part_midnight_from_independent_tai_scale_stays_normal(midnight, leap, offset):
    tai = Time(midnight[:-2] + f"{offset:02d}", scale="tai").tdb
    pair = solar_time.TwoPartJD(float(tai.jd1), float(tai.jd2))
    expected = datetime.fromisoformat(midnight).replace(tzinfo=timezone.utc)
    assert solar_time.jd_tdb_to_utc_datetime(pair) == expected


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
@pytest.mark.parametrize("fraction", ["", ".5", ".9999999"])
def test_precise_genuine_leap_rejected_even_if_datetime_would_round_to_midnight(
    midnight, leap, offset, fraction,
):
    instant = independent_anchor(midnight, leap, offset, fraction=fraction)
    pair = solar_time.TwoPartJD(float(instant.jd1), float(instant.jd2))
    with pytest.raises(ValueError) as caught:
        solar_time.jd_tdb_to_utc_datetime(pair)
    assert caught.value.code == "unsupported_utc_instant"


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
def test_precise_ordinary_instant_before_leap_start_remains_ordinary(midnight, leap, offset):
    instant = Time(leap[:-2] + "59.99999", scale="utc").tdb
    pair = solar_time.TwoPartJD(float(instant.jd1), float(instant.jd2))
    expected = datetime.fromisoformat(leap[:-2] + "59.99999").replace(tzinfo=timezone.utc)
    assert solar_time.jd_tdb_to_utc_datetime(pair) == expected


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
def test_neighboring_ordinary_scalar_bins_are_not_snapped_or_rejected(midnight, leap, offset):
    for value in (
        math.nextafter(float(Time(leap, scale="utc").tdb.jd), -math.inf),
        math.nextafter(float(Time(midnight, scale="utc").tdb.jd), math.inf),
    ):
        expected = Time(value, format="jd", scale="tdb").utc.to_datetime(timezone=timezone.utc)
        assert solar_time.jd_tdb_to_utc_datetime(value) == expected


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
@pytest.mark.parametrize("part", [1, 2])
def test_precise_jd_requires_finite_components(bad, part):
    with pytest.raises(ValueError, match="finite"):
        solar_time.TwoPartJD(bad if part == 1 else 2451545.0, bad if part == 2 else 0.0)
