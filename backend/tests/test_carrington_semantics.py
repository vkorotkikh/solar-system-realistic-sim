from __future__ import annotations

import math
from datetime import datetime, timezone

import astropy.units as u
import pytest
from astropy.time import Time, TimeDelta

from sim.pfss_magnetogram import CARRINGTON_EPOCH_JD, carrington_rotation_number
from sim.solar_time import (
    CARRINGTON_APPROXIMATE_SIDEREAL_PERIOD_DAYS,
    CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS,
    CARRINGTON_ROTATION_1_EPOCH_TT,
    CARRINGTON_SIDEREAL_ROTATION_RATE_DEG_PER_DAY,
    CURRENT_JD_TIME_SCALE,
    current_jd_tdb,
    mean_carrington_rotation_estimate,
    mean_carrington_rotation_number,
    mean_carrington_rotation_start,
    provider_carrington_state_from_crnow,
)


def test_period_names_distinguish_synodic_from_sidereal_rotation() -> None:
    """Catch relabelling 27.2753 days as the sidereal Carrington period."""

    assert CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS == 27.2753
    assert CARRINGTON_SIDEREAL_ROTATION_RATE_DEG_PER_DAY == 14.1844
    assert CARRINGTON_APPROXIMATE_SIDEREAL_PERIOD_DAYS == pytest.approx(
        360.0 / 14.1844,
        rel=0.0,
        abs=1e-14,
    )
    assert CARRINGTON_APPROXIMATE_SIDEREAL_PERIOD_DAYS == pytest.approx(25.38, abs=0.01)


def test_rotation_one_epoch_is_an_explicit_tt_instant() -> None:
    """Catch an unlabeled epoch or accidental interpretation of its JD as UTC/TDB."""

    assert CARRINGTON_ROTATION_1_EPOCH_TT.scale == "tt"
    assert CARRINGTON_ROTATION_1_EPOCH_TT.format == "jd"
    assert CARRINGTON_ROTATION_1_EPOCH_TT.jd == pytest.approx(
        2_398_167.4,
        rel=0.0,
        abs=1e-10,
    )


@pytest.mark.parametrize("rotation", [2242, 1, 0, -3])
def test_mean_rotation_uses_floor_at_each_boundary(rotation: int) -> None:
    """Catch truncation toward zero and off-by-one behavior on either side of an epoch."""

    boundary = mean_carrington_rotation_start(rotation)
    epsilon = TimeDelta(1.0e-6 * u.s)

    assert boundary.scale == "tt"
    assert mean_carrington_rotation_number(boundary - epsilon) == rotation - 1
    assert mean_carrington_rotation_number(boundary) == rotation
    assert mean_carrington_rotation_number(boundary + epsilon) == rotation


def test_one_physical_instant_has_one_mean_rotation_across_scales() -> None:
    """Catch arithmetic on raw UTC/TT/TDB JD numbers instead of physical instants."""

    # Month boundary following the 2024 leap day.
    utc = Time("2024-03-01T00:00:00", scale="utc")
    values = [
        mean_carrington_rotation_estimate(utc),
        mean_carrington_rotation_estimate(utc.tt),
        mean_carrington_rotation_estimate(utc.tdb),
    ]

    assert {item.rotation_number for item in values} == {2281}
    assert max(item.fractional_rotation for item in values) - min(
        item.fractional_rotation for item in values
    ) < 1e-12


def test_same_numeric_jd_with_different_scales_is_not_one_instant() -> None:
    """Catch a scale label being discarded before conversion to TT."""

    same_numeric_jd = 2_460_310.5
    utc_value = mean_carrington_rotation_estimate(
        Time(same_numeric_jd, format="jd", scale="utc")
    )
    tt_value = mean_carrington_rotation_estimate(
        Time(same_numeric_jd, format="jd", scale="tt")
    )
    tdb_value = mean_carrington_rotation_estimate(
        Time(same_numeric_jd, format="jd", scale="tdb")
    )

    assert utc_value.fractional_rotation - tt_value.fractional_rotation > 2.0e-5
    assert not math.isclose(
        tt_value.fractional_rotation,
        tdb_value.fractional_rotation,
        rel_tol=0.0,
        abs_tol=1e-12,
    )


def test_sunpy_cr2242_apparent_start_is_not_relabelled_as_mean_boundary() -> None:
    """Catch promotion of the mean-period search hint to apparent Carrington truth.

    Literal oracle: SunPy 7.1.2 ``carrington_rotation_time(2242)`` returns
    2021-03-17T22:31:37.030 UTC.  The production runtime does not import SunPy.
    """

    apparent_start = Time("2021-03-17T22:31:37.030", scale="utc")
    result = mean_carrington_rotation_estimate(apparent_start)

    assert result.rotation_number == 2242
    assert result.fractional_rotation == pytest.approx(
        2242.0033775530696,
        rel=0.0,
        abs=1e-10,
    )
    assert result.model == "mean_synodic_search_hint_v1"
    assert result.authoritative is False
    assert abs(result.fractional_rotation - 2242.0) > 0.003


def test_gong_crnow_boundary_is_authoritative_over_filename_and_mean_hint() -> None:
    """Catch filtering GONG maps by filename CR or the local mean estimate.

    Literal oracle: archived GONG zqs headers (inspected 2026-09-26):
    ``mrzqs210317t2114c2242_301`` has CRNOW=2241.9967070 and
    ``mrzqs210317t2214c2242_300`` has CRNOW=2242.0012631.  Both filenames and
    CAR_ROT headers remain 2242 across the provider's current-rotation wrap.
    """

    before = provider_carrington_state_from_crnow(2241.9967070)
    after = provider_carrington_state_from_crnow(2242.0012631)

    assert (before.rotation_number, after.rotation_number) == (2241, 2242)
    assert before.current_longitude_deg == pytest.approx(1.18548, abs=1e-7)
    assert after.current_longitude_deg == pytest.approx(359.545284, abs=1e-7)
    assert before.source == after.source == "gong_crnow_v1"
    assert before.authoritative is after.authoritative is True
    assert (
        mean_carrington_rotation_estimate(
            Time("2021-03-17T21:14:00", scale="utc")
        ).rotation_number
        == 2242
    )


def test_current_time_helper_converts_aware_utc_to_labelled_jdtdb() -> None:
    """Catch returning UTC JD under a generic or TDB-labelled field."""

    instant = datetime(2024, 1, 1, tzinfo=timezone.utc)

    assert current_jd_tdb(instant) == pytest.approx(
        2_460_310.5008007395,
        rel=0.0,
        abs=1e-9,
    )
    assert CURRENT_JD_TIME_SCALE == "TDB"
    with pytest.raises(ValueError, match="timezone-aware"):
        current_jd_tdb(datetime(2024, 1, 1))


def test_legacy_range_delegate_returns_jdtdb_for_tt_boundaries() -> None:
    """Catch the compatibility API leaking the epoch's TT number as JDTDB."""

    from sim.pfss_magnetogram import carrington_rotation_jd_range

    start_jd_tdb, end_jd_tdb = carrington_rotation_jd_range(2242)
    start_tt = Time(start_jd_tdb, format="jd", scale="tdb").tt
    end_tt = Time(end_jd_tdb, format="jd", scale="tdb").tt

    assert start_tt.jd == pytest.approx(2_459_291.3473, rel=0.0, abs=1e-9)
    # A scalar float JD has roughly 40-microsecond resolution at contemporary
    # epochs; the compatibility adapter round-trips within that representation.
    assert (end_tt - start_tt).to_value(u.day) == pytest.approx(27.2753, abs=5e-10)


@pytest.mark.filterwarnings("ignore:ERFA function .*dubious year.*")
def test_legacy_delegate_uses_floor_before_the_rotation_one_epoch() -> None:
    """Catch truncation toward zero incorrectly keeping pre-epoch times in CR 1."""

    assert carrington_rotation_number(CARRINGTON_EPOCH_JD - 1.0e-6) == 0
