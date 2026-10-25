"""SCN-075: persistent photospheric sources must agree with coronal regions."""
import numpy as np
import math
from dataclasses import replace
import pytest

from sim import solar_physics as solar
from sim.pfss_magnetogram import (
    decompose_spherical_harmonics,
    synthetic_magnetogram,
)
from sim.solar_physics import SolarCoronaPhysicsModel
from sim.solar_active_regions import CYCLE_25_START_JD, CYCLE_DAYS, region_lifetime
from sim.magnetogram_grid import equal_area_sine_latitude_grid


def test_magnetogram_is_continuous_across_old_random_seed_boundary():
    before = synthetic_magnetogram(.8, 2460000.009999, n_lat=60, n_lon=120)
    after = synthetic_magnetogram(.8, 2460000.010001, n_lat=60, n_lon=120)
    relative_change = np.linalg.norm(after - before) / np.linalg.norm(before)
    assert relative_change < 1e-4


@pytest.mark.parametrize(
    ("rotation_fraction", "longitude_roll", "expected_g11", "expected_h11"),
    [
        (0.0, 0, 1.0, 0.0),
        (0.25, 24, 0.0, 1.0),
        (0.5, 48, -1.0, 0.0),
        (-0.25, -24, 0.0, -1.0),
        (1.0, 96, 1.0, 0.0),
    ],
)
def test_synthetic_tilted_dipole_rotates_at_the_sidereal_rate(
    rotation_fraction: float,
    longitude_roll: int,
    expected_g11: float,
    expected_h11: float,
) -> None:
    # Keep the phase oracle independent of the production constants.
    j2000_jd = 2_451_545.0
    sidereal_period_days = 360.0 / 14.1844
    activity = 0.8
    grid = equal_area_sine_latitude_grid(48, 96)
    base = synthetic_magnetogram(
        activity,
        j2000_jd,
        grid=grid,
        active_regions=(),
    )
    phased = synthetic_magnetogram(
        activity,
        j2000_jd + rotation_fraction * sidereal_period_days,
        grid=grid,
        active_regions=(),
    )

    np.testing.assert_allclose(
        phased,
        np.roll(base, longitude_roll, axis=1),
        rtol=0.0,
        atol=2e-9,
    )
    g_lm, h_lm = decompose_spherical_harmonics(
        phased,
        lmax=3,
        grid=grid,
    )
    tilt_amplitude = 5.0 * (1.0 - 0.6 * activity) * math.sin(0.2 * activity)
    assert g_lm[1, 1] == pytest.approx(
        tilt_amplitude * expected_g11,
        abs=2e-9,
    )
    assert h_lm[1, 1] == pytest.approx(
        tilt_amplitude * expected_h11,
        abs=2e-9,
    )
    assert math.hypot(g_lm[1, 1], h_lm[1, 1]) == pytest.approx(
        tilt_amplitude,
        abs=2e-9,
    )
    assert g_lm[1, 0] == pytest.approx(2.6, abs=2e-12)
    assert g_lm[2, 0] == pytest.approx(2.0, abs=2e-12)
    assert g_lm[3, 0] == pytest.approx(0.96, abs=2e-12)


def test_zero_activity_synthetic_background_is_epoch_invariant() -> None:
    grid = equal_area_sine_latitude_grid(30, 60)
    j2000 = synthetic_magnetogram(0.0, 2_451_545.0, grid=grid, active_regions=())
    later = synthetic_magnetogram(0.0, 2_460_000.0, grid=grid, active_regions=())

    np.testing.assert_array_equal(later, j2000)


@pytest.mark.parametrize("envelope", [1.0, 0.5, 0.25, 0.02, 0.0])
def test_region_envelope_scales_feature_score_once_without_changing_alive_phase(
    monkeypatch: pytest.MonkeyPatch,
    envelope: float,
) -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=64)
    tube = replace(model.seeds[0], idx=95, family="cme")
    jd = solar.J2000_JD

    def set_envelope(value: float) -> None:
        monkeypatch.setattr(
            solar,
            "region_lifetime",
            lambda _region, _jd: (value, solar.J2000_JD - 1.0, 50.0),
        )

    set_envelope(1.0)
    intrinsic_phase = model._feature_temporal_state(tube, jd, jd)
    full_score = model._feature_score(tube, jd, jd, 0.8)
    assert intrinsic_phase[0] > 0.0
    assert intrinsic_phase[1] > 0.0

    set_envelope(envelope)
    phase = model._feature_temporal_state(tube, jd, jd)
    score = model._feature_score(tube, jd, jd, 0.8)

    assert phase == pytest.approx(intrinsic_phase if envelope > 0.0 else (0.0, 0.0))
    assert score == pytest.approx(full_score * envelope, rel=1e-12, abs=1e-15)


@pytest.mark.parametrize("envelope", [1.0, 0.5, 0.25, 0.02, 0.0])
def test_region_envelope_fades_cme_outputs_and_geometry_once(
    monkeypatch: pytest.MonkeyPatch,
    envelope: float,
) -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=64)
    tube = replace(model.seeds[0], idx=95, family="cme")
    intrinsic_emergence = 0.6
    intrinsic_eruption = 0.7

    def build(value: float) -> dict[str, object]:
        monkeypatch.setattr(
            solar,
            "region_lifetime",
            lambda _region, _jd: (value, solar.J2000_JD - 1.0, 50.0),
        )
        return model._build_feature_arc(
            tube,
            solar.J2000_JD,
            solar.J2000_JD,
            0.8,
            intrinsic_emergence,
            intrinsic_eruption,
            12,
        )

    full = build(1.0)
    collapsed = build(0.0)
    feature = build(envelope)

    for key in (
        "field_strength_gauss",
        "alfven_speed_kms",
        "expansion_speed_kms",
    ):
        assert feature[key] == pytest.approx(full[key] * envelope, rel=1e-12, abs=1e-15)
    expected_brightness = min(
        1.0,
        max(
            0.02,
            0.05
            + 0.26 * model.active_regions[tube.region_idx].strength
            + 0.22 * 0.8
            + 0.24 * intrinsic_emergence
            + 0.08 * (feature["temperature_mk"] / 5.0)
            + 0.33 * intrinsic_eruption,
        ),
    ) * envelope
    assert feature["brightness"] == pytest.approx(expected_brightness, rel=1e-12)
    assert feature["peak_extent_solar_radii"] - 1.0 == pytest.approx(
        (full["peak_extent_solar_radii"] - 1.0) * envelope,
        rel=1e-12,
        abs=1e-15,
    )
    assert feature["emergence"] == pytest.approx(intrinsic_emergence * envelope)
    assert feature["region_lifetime_envelope"] == envelope

    full_arc = np.asarray(full["arc"])
    collapsed_arc = np.asarray(collapsed["arc"])
    actual_arc = np.asarray(feature["arc"])
    np.testing.assert_allclose(
        actual_arc,
        collapsed_arc + envelope * (full_arc - collapsed_arc),
        rtol=0.0,
        atol=2e-15,
    )
    if envelope == 0.0:
        np.testing.assert_allclose(
            actual_arc,
            np.repeat(actual_arc[:1], len(actual_arc), axis=0),
            rtol=0.0,
            atol=2e-15,
        )
        np.testing.assert_allclose(np.linalg.norm(actual_arc, axis=1), 1.0, atol=2e-15)
    if envelope == 0.02:
        assert feature["field_strength_gauss"] < 12.0


def test_dormant_regions_are_omitted_from_the_serialized_corona(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=64)
    monkeypatch.setattr(
        solar,
        "region_lifetime",
        lambda _region, _jd: (0.0, solar.J2000_JD - 1.0, 50.0),
    )
    monkeypatch.setattr(
        model._pfss_cache,
        "get_or_compute",
        lambda **_kwargs: {"geometry_frame": None, "lines": []},
    )

    state = model.sample_state(
        jd=solar.J2000_JD,
        fidelity="preview",
        max_features=8,
    )

    assert state["corona"]["feature_count"] == 0
    assert state["corona"]["features"] == []
    assert state["corona"]["max_extent_solar_radii"] == 1.0


def test_pfss_snapshot_depends_on_the_coronal_region_seed():
    left = SolarCoronaPhysicsModel(seed=17, base_tube_count=64)
    right = SolarCoronaPhysicsModel(seed=18, base_tube_count=64)
    a = left._pfss_cache._build_synthetic_snapshot(2460000.0, .8)
    b = right._pfss_cache._build_synthetic_snapshot(2460000.0, .8)
    assert a.snapshot_id.sha256 != b.snapshot_id.sha256
    assert not np.array_equal(a.field_gauss, b.field_gauss)


@pytest.mark.parametrize('cycle', [25, 26])
@pytest.mark.parametrize('hemisphere', [-1, 1])
def test_map_polarities_and_feature_footpoints_agree(cycle, hemisphere):
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    region = replace(model.active_regions[0], center_lat_rad=hemisphere * .3,
                     hemisphere_sign=hemisphere, hale_cycle25_leading_polarity=-hemisphere,
                     tilt_rad=hemisphere * .15, strength=.9, separation_rad=.15)
    model.active_regions[0] = region
    jd = CYCLE_25_START_JD + (cycle - 25) * CYCLE_DAYS + 300
    _, birth, lifetime = region_lifetime(region, jd)
    jd = birth + lifetime / 2
    center, negative, positive, axis, leading_sign = model._region_polarity_dirs(region, jd)
    assert leading_sign == hemisphere * (-1 if cycle % 2 else 1)
    leading, trailing = (positive, negative) if leading_sign > 0 else (negative, positive)
    assert np.dot(np.subtract(leading, center), axis) > 0
    assert abs(trailing[2]) > abs(leading[2])  # Joy: following spot is poleward
    grid = equal_area_sine_latitude_grid(180, 360)
    background = synthetic_magnetogram(.8, jd, grid=grid, active_regions=())
    field = synthetic_magnetogram(.8, jd, grid=grid, active_regions=(region,)) - background
    for direction, sign in [(positive, 1), (negative, -1)]:
        lat_index = np.argmin(abs(grid.mu - direction[2]))
        lon = math.atan2(direction[1], direction[0]) % (2 * math.pi)
        lon_index = np.argmin(abs(np.angle(np.exp(1j * (grid.phi_rad - lon)))))
        assert field[lat_index, lon_index] * sign > 20
    tube = replace(model.seeds[0], region_idx=0, footpoint_jitter_lat_rad=0, footpoint_jitter_lon_rad=0)
    emergence, eruption = model._feature_temporal_state(tube, jd, jd)
    feature = model._build_feature_arc(tube, jd, jd, .8, emergence, eruption, 12)
    expected = positive if tube.polarity_sign > 0 else negative
    np.testing.assert_allclose(feature['base_dir'], expected, atol=1e-12)
    assert feature['region_birth_jd_tdb'] == birth
    assert feature['region_lifetime_envelope'] == pytest.approx(1)
    # The reported field and Alfven speed must evolve together, not merely
    # fade the serialized field after thermodynamics were already computed.
    faded_jd = birth + lifetime / 6
    em, er = model._feature_temporal_state(tube, faded_jd, faded_jd)
    faded = model._build_feature_arc(tube, faded_jd, faded_jd, .8, em, er, 12)
    mass_density = faded['electron_density_m3'] * 1.67262192369e-27 * 1.18
    expected_alfven = faded['field_strength_gauss'] * 1e-4 / math.sqrt(4e-7 * math.pi * mass_density) / 1000
    assert faded['alfven_speed_kms'] == pytest.approx(expected_alfven, rel=1e-12)


def test_region_rotation_lifetime_and_cycle_transition_are_continuous():
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    region = model.active_regions[0]
    jd = CYCLE_25_START_JD + CYCLE_DAYS
    before = model._region_polarity_dirs(region, jd - 1e-6)
    after = model._region_polarity_dirs(region, jd + 1e-6)
    # A living old-cycle region must not reverse instantaneously at the epoch.
    assert before[-1] == after[-1]
    np.testing.assert_allclose(before[2], after[2], atol=1e-6)
    lat = region.center_lat_rad
    expected_degrees = 14.713 - 2.396 * math.sin(lat)**2 - 1.787 * math.sin(lat)**4
    first = model._region_polarity_dirs(region, jd)[0]
    later = model._region_polarity_dirs(region, jd + 1)[0]
    angle = (math.atan2(later[1], later[0]) - math.atan2(first[1], first[0])) % (2 * math.pi)
    assert math.degrees(angle) == pytest.approx(expected_degrees, abs=1e-9)
    _, birth, lifetime = region_lifetime(region, jd)
    for boundary in [birth, birth + lifetime]:
        assert region_lifetime(region, boundary - 1e-6)[0] < 1e-12
        assert region_lifetime(region, boundary + 1e-6)[0] < 1e-12
    dormant = birth + lifetime + 1
    assert region_lifetime(region, dormant)[0] == 0
    tube = next(t for t in model.seeds if t.region_idx == region.idx)
    assert model._feature_temporal_state(tube, dormant, dormant) == (0, 0)
    assert model._feature_score(tube, dormant, dormant, .8) == 0
    np.testing.assert_array_equal(
        synthetic_magnetogram(.8, dormant, n_lat=30, n_lon=60, active_regions=(region,)),
        synthetic_magnetogram(.8, dormant, n_lat=30, n_lon=60, active_regions=()),
    )
