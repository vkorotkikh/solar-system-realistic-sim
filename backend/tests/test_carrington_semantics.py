from __future__ import annotations

import inspect
import math
from datetime import datetime, timezone

import astropy.units as u
import pytest
from astropy.time import Time, TimeDelta

import sim.pfss_magnetogram as pfss_magnetogram
import sim.solar_physics as solar_physics
from sim.pfss_magnetogram import CARRINGTON_EPOCH_JD, carrington_rotation_number
from sim.solar_time import (
    CARRINGTON_APPROXIMATE_SIDEREAL_PERIOD_DAYS,
    CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS,
    CARRINGTON_ROTATION_1_EPOCH_TT,
    CARRINGTON_SIDEREAL_ROTATION_RATE_DEG_PER_DAY,
    CURRENT_JD_TIME_SCALE,
    current_jd_tdb,
    jd_tdb_to_utc_datetime,
    mean_carrington_rotation_estimate,
    mean_carrington_rotation_number,
    mean_carrington_rotation_number_from_jd_tdb,
    mean_carrington_rotation_range_jd_tdb,
    mean_carrington_rotation_start,
    provider_carrington_state_from_crnow,
)


# Literal offline oracle corpus generated with SunPy 7.1.2 and Astropy 8.0.1
# (IERS network download disabled) on 2026-09-26. These values are deliberately
# not derived with production helpers. Rows cover an ordinary instant and the
# two sides of leap-month and year boundaries.
_APPARENT_CARRINGTON_SENTINELS = (
    (
        "ordinary",
        2_460_477.0242592595,
        2_460_477.02506,
        2_460_477.0250600064,
        2285.4707504592102,
        2285.4713339867685,
        190.31976476341248,
    ),
    (
        "month_before",
        2_460_370.499988426,
        2_460_370.500789167,
        2_460_370.5007891823,
        2281.565228949517,
        2281.5629907441953,
        157.32333208973472,
    ),
    (
        "month_after",
        2_460_370.5,
        2_460_370.500800741,
        2_460_370.5008007563,
        2281.5652293738594,
        2281.5629911677042,
        157.32317962641724,
    ),
    (
        "year_before",
        2_460_676.499988426,
        2_460_676.500789167,
        2_460_676.5007891655,
        2292.7841706293516,
        2292.7870148712686,
        76.67464634326613,
    ),
    (
        "year_after",
        2_460_676.5,
        2_460_676.500800741,
        2_460_676.5008007395,
        2292.784171053694,
        2292.787015294692,
        76.67449391083257,
    ),
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


@pytest.mark.filterwarnings("ignore:ERFA function .*dubious year.*")
def test_mean_rotation_jd_adapters_round_trip_boundaries() -> None:
    for rotation in range(2200, 2400):
        start_jd_tdb, end_jd_tdb = mean_carrington_rotation_range_jd_tdb(rotation)

        assert (
            mean_carrington_rotation_number_from_jd_tdb(
                math.nextafter(start_jd_tdb, -math.inf)
            )
            == rotation - 1
        )
        assert mean_carrington_rotation_number_from_jd_tdb(start_jd_tdb) == rotation
        assert (
            mean_carrington_rotation_number_from_jd_tdb(
                math.nextafter(start_jd_tdb, math.inf)
            )
            == rotation
        )
        assert (
            mean_carrington_rotation_number_from_jd_tdb(
                math.nextafter(end_jd_tdb, -math.inf)
            )
            == rotation
        )
        assert mean_carrington_rotation_number_from_jd_tdb(end_jd_tdb) == rotation + 1
        assert (
            mean_carrington_rotation_number_from_jd_tdb(
                math.nextafter(end_jd_tdb, math.inf)
            )
            == rotation + 1
        )


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


def test_active_wall_clock_delegate_returns_jdtdb(monkeypatch: pytest.MonkeyPatch) -> None:
    """Catch the server's active wall-clock helper returning a raw UTC-like JD."""

    expected_jd_tdb = 2_460_327.808711578
    monkeypatch.setattr(
        solar_physics,
        "current_jd_tdb",
        lambda: expected_jd_tdb,
        raising=False,
    )

    assert solar_physics.utc_now_to_julian_date() == expected_jd_tdb


def test_jdtdb_to_utc_datetime_matches_literal_cr2242_instant() -> None:
    """Catch Unix-UTC arithmetic being applied directly to a JDTDB value."""

    converted = jd_tdb_to_utc_datetime(2_459_291.4394237916)
    expected = datetime(2021, 3, 17, 22, 31, 37, 30_000, tzinfo=timezone.utc)

    assert converted.tzinfo == timezone.utc
    # A scalar contemporary JD carries roughly 40 microseconds of precision.
    assert abs((converted - expected).total_seconds()) < 50e-6


def test_pfss_has_no_legacy_gong_downloader_and_validates_provider_snapshots() -> None:
    """Keep archive transport outside PFSS and require validated snapshots."""

    legacy_symbols = ("GONG_SYNOPTIC_BASE", "fetch_gong_synoptic_map", "urllib")
    assert all(not hasattr(pfss_magnetogram, symbol) for symbol in legacy_symbols)

    resolver_source = inspect.getsource(
        pfss_magnetogram.PFSSCache._resolve_observed_snapshot
    )
    assert "gong.MagnetogramSnapshot" in resolver_source
    assert "_validate_observed_snapshot_contract(snapshot)" in resolver_source


@pytest.mark.parametrize(
    (
        "_case",
        "utc_jd",
        "tt_jd",
        "tdb_jd",
        "mean_fraction",
        "apparent_fraction",
        "current_longitude_deg",
    ),
    _APPARENT_CARRINGTON_SENTINELS,
)
def test_literal_date_and_calendar_boundary_carrington_sentinels(
    _case: str,
    utc_jd: float,
    tt_jd: float,
    tdb_jd: float,
    mean_fraction: float,
    apparent_fraction: float,
    current_longitude_deg: float,
) -> None:
    """Gate scale conversion and apparent longitude with independent literals."""

    scale_representations = (
        Time(utc_jd, format="jd", scale="utc"),
        Time(tt_jd, format="jd", scale="tt"),
        Time(tdb_jd, format="jd", scale="tdb"),
    )
    estimates = [mean_carrington_rotation_estimate(value) for value in scale_representations]
    provider_state = provider_carrington_state_from_crnow(apparent_fraction)

    for estimate in estimates:
        assert estimate.fractional_rotation == pytest.approx(
            mean_fraction,
            rel=0.0,
            abs=2e-11,
        )
        assert estimate.authoritative is False
    assert provider_state.current_longitude_deg == pytest.approx(
        current_longitude_deg,
        rel=0.0,
        abs=1e-9,
    )
    assert provider_state.rotation_number == math.floor(apparent_fraction)
    assert provider_state.authoritative is True


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
