"""SOL-HOLE-RESEED: consistent seeded synthetic coronal-hole evolution.

Rotation and model-seed tests pin the approved procedural policy, not observed
solar accuracy. Existing physical/observed validation gates remain unchanged.
"""
# Regression: SOL-HOLE-RESEED — request-epoch reseeding changed hole geometry.
# Found by /qa on 2026-10-24.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import json
import math
import socket

import numpy as np
import pytest

from sim.solar_physics import ObservedSolarInputUnavailable, SolarCoronaPhysicsModel

J2000 = 2451545.0
RATE_RAD_DAY = math.radians(14.1844)
PERIOD_DAYS = 360.0 / 14.1844
BEFORE = 2461322.909994213
AFTER = 2461322.9100057874
# Each serialized longitude has half-LSB error <= 5e-5 radians. Pairwise
# difference has <= 1e-4; 1e-9 covers floating evaluation of long phase values.
PAIR_LONGITUDE_ERROR = 1e-4 + 1e-9


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def reject(*args, **kwargs):
        raise AssertionError("network forbidden in owned hole-evolution fixture")
    monkeypatch.setattr(socket, "create_connection", reject)
    monkeypatch.setattr(socket.socket, "connect", reject)


def model(seed=17):
    return SolarCoronaPhysicsModel(seed=seed, base_tube_count=64)


def equatorial(payload):
    return [h for h in payload["holes"] if h["type"] == "equatorial"]


def shape(hole):
    return tuple(hole[k] for k in (
        "center_lat_rad", "extent_lat_rad", "extent_lon_rad", "area_fraction"
    ))


def angle_delta(a, b):
    return math.atan2(math.sin(b - a), math.cos(b - a))


def holes(m, activity=.8, jd=BEFORE):
    return m._synthetic_coronal_holes(activity, jd)


@pytest.mark.parametrize("activity", [0., .35, .36, .8, 1.])
def test_control_existing_polar_law_counts_coverage_and_finite_json(activity):
    data = holes(model(), activity)
    polar = [h for h in data["holes"] if h["type"] == "polar"]
    assert len(polar) == 2
    assert polar[0]["center_lat_rad"] == -polar[1]["center_lat_rad"] == math.radians(72)
    for h in polar:
        assert h["center_lon_rad"] == 0
        assert h["extent_lat_rad"] == round(math.radians(35*(1-.7*activity)), 4)
        assert h["extent_lon_rad"] == round(math.pi, 4)
        assert h["area_fraction"] == round(max(.01, .15*(1-.65*activity)), 5)
    assert len(equatorial(data)) == (min(int(1+3*activity), 4) if activity > .35 else 0)
    assert data["source"] == "synthetic"
    assert data["hole_count"] == len(data["holes"])
    assert data["coverage_fraction"] == round(min(.5, sum(h["area_fraction"] for h in data["holes"])), 4)
    assert data["polar_open_flux_north"] == data["polar_open_flux_south"]
    json.dumps(data, allow_nan=False)


@pytest.mark.parametrize("seed", [17, 31])
@pytest.mark.parametrize("jd", [J2000 - 1.25, BEFORE])
def test_control_fixed_inputs_independent_of_instance_and_request_order(seed, jd):
    first, second = model(seed), model(seed)
    expected = holes(first, jd=jd)
    for other in [jd + 1000, jd - 30, jd + .01, jd]:
        holes(first, jd=other)
    assert holes(first, jd=jd) == expected == holes(second, jd=jd)


def test_control_real_sample_state_emits_holes_with_unvalidated_inertial_frame(monkeypatch):
    m = model()
    # Hold activity to isolate time evolution, but run real sample_state and PFSS.
    monkeypatch.setattr(m, "_activity_index", lambda jd: (.8, 0.))
    state = m.sample_state(BEFORE, fidelity="preview", max_features=8)
    assert state["coronal_holes"] == holes(m)
    frame = state["geometry_frames"]["coronal_holes"]
    assert frame["frame"] == "SOLAR_EQUATORIAL_J2000"
    assert frame["rotation_state"] == "already_evolved"
    assert frame["source_kind"] == "synthetic"
    assert frame["calibration_status"] == "unvalidated"
    assert frame["epoch_jd_tdb"] == BEFORE
    assert state["pfss_field_lines"]["source"] == "synthetic"
    json.dumps(state, allow_nan=False)
    with pytest.raises(ObservedSolarInputUnavailable):
        m.sample_state(BEFORE, fidelity="preview", max_features=8, forcing="data_driven")


def test_control_valid_wsa_speed_is_independent_of_synthetic_hole_geometry():
    wsa = dict(ss_theta=np.array([[math.pi/2]]), ss_phi=np.array([[0.]]),
               velocity_map=np.array([[620.]]), open_mask=np.array([[True]]),
               grid_theta=np.arccos(np.linspace(1-1/180, -1+1/180, 180)),
               grid_phi=np.arange(360)*math.pi/180,
               model="wsa_inspired_v1", source_surface_radii=2.5)
    m = model()
    empty = m._build_parker_spiral(J2000, .8, line_count=1, point_count=2,
                                  coronal_holes={"holes": []}, wsa_result=wsa)
    covering = m._build_parker_spiral(J2000, .8, line_count=1, point_count=2,
        coronal_holes={"holes": [{"center_lat_rad": 0., "extent_lat_rad": 1.}]},
        wsa_result=wsa)
    assert empty == covering
    assert empty["lines"][0]["wind_speed_kms"] == 620.
    assert empty["lines"][0]["wind_speed_source"] == "wsa_inspired_v1"
    assert empty["lines"][0]["wsa_available"] is True


@pytest.mark.parametrize("activity", [.8, .95])
def test_old_one_second_seed_boundary_preserves_latitude_and_shape(activity):
    m = model()
    before, after = equatorial(holes(m, activity, BEFORE)), equatorial(holes(m, activity, AFTER))
    assert len(before) == len(after) == 3
    assert [shape(h) for h in before] == [shape(h) for h in after]


@pytest.mark.parametrize("start,delta", [
    (2461322.9001, .005), (BEFORE, AFTER-BEFORE), (BEFORE, .01),
    (BEFORE, .03), (BEFORE, 1.), (J2000-4., 1.),
    (J2000, PERIOD_DAYS/4), (J2000, PERIOD_DAYS),
    (J2000 + PERIOD_DAYS - .01, .02), (BEFORE, -1.),
])
def test_proposed_rigid_evolution_rotates_in_declared_inertial_frame(start, delta):
    m = model()
    end = start + delta
    before, after = equatorial(holes(m, jd=start)), equatorial(holes(m, jd=end))
    assert len(before) == len(after) == 3
    for a, b in zip(before, after):
        residual = angle_delta(a["center_lon_rad"] + RATE_RAD_DAY*(end-start), b["center_lon_rad"])
        assert abs(residual) <= PAIR_LONGITUDE_ERROR


def test_proposed_templates_follow_model_seed_instead_of_request_epoch():
    assert equatorial(holes(model(17))) != equatorial(holes(model(31)))


def test_old_bucket_edge_alone_does_not_flip_empirical_wind_away_from_boundary():
    m = model()
    payloads = [holes(m, jd=jd) for jd in (BEFORE, AFTER)]
    lines = [m._build_parker_spiral(jd, .8, point_count=2, coronal_holes=h)["lines"][3]
             for jd, h in zip((BEFORE, AFTER), payloads)]
    # Match the existing latitude-only membership, not an invented 2-D topology.
    source_lat = (math.radians(7.25+67.75*.8**1.8)
                  * math.sin((BEFORE-J2000)/25.38*2*math.pi + math.pi + 3*.33))
    margin = min(abs(abs(source_lat-h["center_lat_rad"])-h["extent_lat_rad"])
                 for h in equatorial(payloads[0]))
    assert margin > 1e-5
    assert all(line["wind_speed_source"] == "empirical_ch_bimodal" for line in lines)
    assert lines[0]["in_coronal_hole"] == lines[1]["in_coronal_hole"]
    # Sector-wave derivative <= 60 * 2.1 * 2pi/25.38 per day, plus pairwise
    # 0.1km/s serialized rounding error. No global smoothness claim at real edges.
    speed_bound = .1 + 60*2.1*2*math.pi/25.38*(AFTER-BEFORE) + 1e-8
    assert abs(lines[1]["wind_speed_kms"]-lines[0]["wind_speed_kms"]) <= speed_bound


# Parent-requested compatibility controls. Original25 cases above unchanged.
@pytest.mark.parametrize("low,high,low_count,high_count", [
    (.36, .65, 2, 2), (.65, .67, 2, 3), (.8, 1., 3, 4), (1., .36, 4, 2),
])
def test_supplemental_surviving_template_centers_and_scaled_shape_across_activity(
    low, high, low_count, high_count
):
    m = model()
    left, right = equatorial(holes(m, low, J2000)), equatorial(holes(m, high, J2000))
    assert len(left) == low_count
    assert len(right) == high_count
    assert min(len(left), len(right)) >= 2
    for a, b in zip(left, right):
        assert a["center_lat_rad"] == b["center_lat_rad"]
        assert a["center_lon_rad"] == b["center_lon_rad"]
        for key, degree_min, degree_max in (
            ("extent_lat_rad", 8., 22.), ("extent_lon_rad", 12., 35.)
        ):
            # Normalize by activity; each serialized radian value has at most
            # 5e-5 error. Dividing by activity propagates that same half-LSB.
            allowance = 5e-5/low + 5e-5/high + 1e-12
            assert abs(a[key]/low - b[key]/high) <= allowance
            for value, activity in ((a[key], low), (b[key], high)):
                assert math.radians(degree_min)*activity-5e-5-1e-12 <= value
                assert value <= math.radians(degree_max)*activity+5e-5+1e-12
        # Existing area law is .01 plus a shared amplitude times activity;
        # area is serialized to five decimals, hence half-LSB5e-6.
        allowance = 5e-6/low + 5e-6/high + 1e-12
        assert abs((a["area_fraction"]-.01)/low - (b["area_fraction"]-.01)/high) <= allowance
        for value, activity in ((a["area_fraction"], low), (b["area_fraction"], high)):
            assert .01-5e-6-1e-12 <= value <= .01+.04*activity+5e-6+1e-12


@pytest.mark.parametrize("seed", [-17, 0, 1, 17, 31])
def test_supplemental_j2000_retains_initial_half_circle_longitude_range(seed):
    templates = equatorial(holes(model(seed), 1., J2000))
    assert len(templates) == 4
    for hole in templates:
        # Bound includes only existing four-decimal serialization error.
        assert -math.pi/2-5e-5 <= hole["center_lon_rad"] <= math.pi/2+5e-5
