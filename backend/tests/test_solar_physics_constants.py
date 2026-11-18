"""Shipped solar constants checked against closed forms, not against themselves.

Audit finding solar-physics-01 (2026-11-17 record): nine one-line changes to these
constants each left the full backend suite green.  Every expected value below is
derived here from a physical relation or from the source the code cites.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from sim import solar_active_regions, solar_physics, solar_time
from sim.magnetogram_grid import equal_area_sine_latitude_grid
from sim.pfss_magnetogram import PFSSSolutionConfig, synthetic_magnetogram
from sim.solar_physics import SolarCoronaPhysicsModel
from sim.solar_process_worker import execute_solar_physics_job

AU_KM = 149_597_870.7  # IAU 2012
SOLAR_RADIUS_KM = 695_700.0  # IAU 2015 nominal
SECONDS_PER_DAY = 86_400.0
# Parker arms co-rotate at the sidereal rate (docs/solar-rotation-and-display.md).
OMEGA_SIDEREAL_RAD_DAY = math.radians(solar_time.CARRINGTON_SIDEREAL_ROTATION_RATE_DEG_PER_DAY)
JD = 2_461_362.5


@pytest.fixture(scope="module")
def worker_state() -> dict:
    return execute_solar_physics_job(
        {"epoch_jd_tdb": JD, "fidelity": "operational", "max_features": 220,
         "forcing": "synthetic", "live_data": False}
    )


def _arm_polar(arc: list[list[float]]) -> tuple[np.ndarray, np.ndarray]:
    """Heliocentric distance [au] and unwrapped longitude [rad] of each arc point."""
    xyz = np.asarray(arc, dtype=float)
    return (
        np.linalg.norm(xyz, axis=1) * SOLAR_RADIUS_KM / AU_KM,
        np.unwrap(np.arctan2(xyz[:, 1], xyz[:, 0])),
    )


def test_parker_arms_wind_up_at_the_closed_form_rate(worker_state: dict) -> None:
    # Parker (1958): a parcel leaving the corotating source at speed v is wound back by
    # phi = Omega * dr / v, so the pitch angle obeys tan(psi) = Omega * r / v.
    spiral = worker_state["heliosphere"]["parker_spiral"]
    r_ss_au = spiral["source_surface_radii"] * SOLAR_RADIUS_KM / AU_KM
    assert len(spiral["lines"]) >= 4
    for line in spiral["lines"]:
        v_au_day = line["wind_speed_kms"] * SECONDS_PER_DAY / AU_KM
        r_au, lon = _arm_polar(line["arc"])
        assert r_au[0] < 1.0 < r_au[-1]

        winding = lon[0] - np.interp(1.0, r_au, lon)  # source surface -> 1 au
        expected = OMEGA_SIDEREAL_RAD_DAY * (1.0 - r_ss_au) / v_au_day
        assert winding == pytest.approx(expected, rel=1e-3), line["id"]

        k = int(np.searchsorted(r_au, 1.0))
        slope = (lon[k - 1] - lon[k]) / (r_au[k] - r_au[k - 1])  # -dphi/dr
        assert math.atan(slope * 1.0) == pytest.approx(
            math.atan(OMEGA_SIDEREAL_RAD_DAY * 1.0 / v_au_day), rel=1e-3
        ), line["id"]


def test_parker_footpoints_corotate_at_the_sidereal_rate() -> None:
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    first = model._build_parker_spiral(JD, 0.5, point_count=2)
    later = model._build_parker_spiral(JD + 1.0, 0.5, point_count=2)
    for a, b in zip(first["lines"], later["lines"]):
        advance = math.atan2(b["arc"][0][1], b["arc"][0][0]) - math.atan2(a["arc"][0][1], a["arc"][0][0])
        assert advance % math.tau == pytest.approx(OMEGA_SIDEREAL_RAD_DAY, rel=1e-3)
    assert first["omega_sun_rad_day"] == pytest.approx(OMEGA_SIDEREAL_RAD_DAY, rel=1e-3)


def test_default_source_surface_is_the_adr_0003_value(worker_state: dict) -> None:
    # docs/adr/0003-pfss-source-surface-boundary.md: "S=Rss (default 2.5)" solar radii.
    adr_0003_default = 2.5
    pfss = worker_state["pfss_field_lines"]
    spiral = worker_state["heliosphere"]["parker_spiral"]

    assert PFSSSolutionConfig().source_surface_radii == adr_0003_default
    assert pfss["source_surface_radii"] == adr_0003_default
    assert spiral["source_surface_radii"] == adr_0003_default
    # Observable consequences: open lines end on it, Parker arms start on it.
    open_lines = [line for line in pfss["lines"] if line["state"] == "open"]
    assert open_lines
    for line in open_lines:
        assert math.hypot(*line["endpoint"]) == pytest.approx(adr_0003_default, abs=1e-6)
    for line in spiral["lines"]:
        assert math.hypot(*line["arc"][0]) == pytest.approx(adr_0003_default, rel=1e-9)


def test_display_field_lines_start_on_the_photosphere(worker_state: dict) -> None:
    # Footpoints are seeded on the photosphere (r = 1 R_sun); tracing needs only a
    # hair of clearance, far below 1 %.
    lines = worker_state["pfss_field_lines"]["lines"]
    assert len(lines) >= 20
    for line in lines:
        assert 1.0 <= math.hypot(*line["arc"][0]) < 1.01, line["id"]


def _max_source_latitude_deg(activity: float) -> float:
    # Parker source latitude is tilt * sin(phase): its extreme over many arms is the tilt.
    spiral = SolarCoronaPhysicsModel(base_tube_count=64)._build_parker_spiral(
        JD, activity, line_count=360, point_count=2
    )
    return max(abs(line["source_lat_deg"]) for line in spiral["lines"])


def test_current_sheet_tilt_follows_the_documented_activity_curve() -> None:
    # Documented contract (solar_physics.py): "~7 deg at solar minimum -> ~75 deg at solar
    # maximum".  The exponent between them is a tuning choice with no independent
    # source; the contract asserted is the slow rise (tilt stays low until activity is
    # high), i.e. below the straight line joining the end points.
    tilt = {a: _max_source_latitude_deg(a) for a in (0.0, 0.25, 0.5, 0.75, 1.0)}
    assert 7.0 <= tilt[0.0] <= 8.0
    assert tilt[1.0] == pytest.approx(75.0, abs=0.5)
    assert all(tilt[a] < tilt[b] for a, b in zip(tilt, list(tilt)[1:]))
    assert tilt[0.5] < 0.5 * (tilt[0.0] + tilt[1.0]) - 5.0


def _loop_state(model: SolarCoronaPhysicsModel, lifetime_envelope: float = 1.0):
    tube = max(
        (t for t in model.seeds if t.family == "loop"),
        key=lambda t: model.active_regions[t.region_idx].strength,
    )
    region = model.active_regions[tube.region_idx]
    return model._thermodynamic_state(tube, region, 0.8, 0.7, 0.0, lifetime_envelope)


def test_feature_temperature_scales_as_field_to_the_two_sevenths() -> None:
    # "RTV-like coupling: T ~ B^(2/7)": a field ratio of 2^(7/2) must double T.
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    field_hi, temp_hi, *_ = _loop_state(model)
    field_lo, temp_lo, *_ = _loop_state(model, lifetime_envelope=2.0 ** -3.5)

    assert 0.55 < temp_lo < temp_hi < 9.5  # clamps inactive, so the law is what is measured
    assert field_hi / field_lo == pytest.approx(2.0 ** 3.5, rel=1e-12)
    assert temp_hi / temp_lo == pytest.approx(2.0, rel=1e-12)


def test_feature_sound_speed_is_the_adiabatic_ideal_gas_value() -> None:
    # c_s = sqrt(gamma k T / (mu m_p)), gamma = 5/3, mu = 0.6 for the fully ionised corona
    # (about 152 km/s at 1 MK).
    gamma, mu = 5.0 / 3.0, 0.6
    k_b, m_p = 1.380649e-23, 1.67262192369e-27
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    for envelope in (1.0, 0.3):
        _, temperature_mk, _, _, sound_kms = _loop_state(model, envelope)
        expected_kms = math.sqrt(gamma * k_b * temperature_mk * 1e6 / (mu * m_p)) / 1e3
        assert sound_kms == pytest.approx(expected_kms, rel=0.01)


def test_active_region_cycle_is_the_solar_physics_cycle() -> None:
    assert solar_active_regions.CYCLE_DAYS == solar_physics._cycle_length_days()
    assert solar_active_regions.CYCLE_DAYS == pytest.approx(solar_physics.SOLAR_CYCLE_DAYS, rel=1e-3)
    assert solar_active_regions.CYCLE_25_START_JD == solar_physics.CYCLE_25_START_JD


def test_polar_field_reverses_once_per_solar_physics_cycle() -> None:
    # Hale: the polar field flips sign every activity cycle and passes through zero in
    # between.  The cycle length is solar_physics', not the magnetogram module's copy.
    grid = equal_area_sine_latitude_grid(36, 72)
    cos_theta = grid.mu

    def axial_dipole(jd: float) -> float:
        br = synthetic_magnetogram(0.0, jd, grid=grid, active_regions=())
        return float(np.sum(grid.area_weights * br.mean(axis=1) * cos_theta)
                     / np.sum(grid.area_weights * cos_theta**2))

    start = solar_physics.CYCLE_25_START_JD
    cycle = solar_physics._cycle_length_days()
    g_start = axial_dipole(start)
    assert abs(g_start) > 1.0
    assert axial_dipole(start + cycle / 2) / g_start == pytest.approx(0.0, abs=1e-3)
    assert axial_dipole(start + cycle) / g_start == pytest.approx(-1.0, abs=1e-4)
