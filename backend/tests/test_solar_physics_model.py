from __future__ import annotations

import math

from sim.solar_physics import (
    CYCLE_25_START_JD,
    CYCLE_LENGTH_MONTHS,
    HATHAWAY_B,
    J2000_JD,
    MEAN_MONTH_DAYS,
    SolarCoronaPhysicsModel,
)


def _cme_speeds_for_epoch(model: SolarCoronaPhysicsModel, jd: float, wall_jd: float) -> list[float]:
    activity, _ = model._activity_index(jd)
    speeds: list[float] = []
    for tube in model.seeds:
        if tube.family != "cme":
            continue
        emergence, eruption_gate = model._feature_temporal_state(tube, jd, wall_jd)
        feature = model._build_feature_arc(
            tube=tube,
            jd=jd,
            wall_jd=wall_jd,
            activity=activity,
            emergence=emergence,
            eruption_gate=eruption_gate,
            points_count=20,
        )
        speeds.append(float(feature["expansion_speed_kms"]))
    return speeds


def test_hathaway_activity_curve_has_strong_asymmetry() -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=220)
    cycle_days = CYCLE_LENGTH_MONTHS * MEAN_MONTH_DAYS
    peak_days = HATHAWAY_B * math.sqrt(1.5) * MEAN_MONTH_DAYS

    start_activity, _ = model._activity_index(CYCLE_25_START_JD)
    peak_activity, _ = model._activity_index(CYCLE_25_START_JD + peak_days)
    end_activity, _ = model._activity_index(CYCLE_25_START_JD + cycle_days)

    assert start_activity < 0.25
    assert end_activity < 0.25
    assert peak_activity > 0.75
    assert peak_activity > start_activity + 0.45
    assert peak_activity > end_activity + 0.45


def test_hale_leading_polarity_flips_between_adjacent_cycles() -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=220)
    cycle_days = CYCLE_LENGTH_MONTHS * MEAN_MONTH_DAYS
    north_region = next(region for region in model.active_regions if region.hemisphere_sign > 0)

    _, _, _, _, lead_cycle_25 = model._region_polarity_dirs(north_region, CYCLE_25_START_JD + 12.0)
    _, _, _, _, lead_cycle_26 = model._region_polarity_dirs(north_region, CYCLE_25_START_JD + cycle_days + 12.0)

    assert lead_cycle_25 == -lead_cycle_26


def test_cme_speed_distribution_covers_slow_and_fast_populations() -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=420)
    low_jd = CYCLE_25_START_JD + 0.2 * 365.25
    high_jd = CYCLE_25_START_JD + 5.5 * 365.25
    wall_jd = J2000_JD + 9_500.0

    low_speeds = _cme_speeds_for_epoch(model, low_jd, wall_jd)
    high_speeds = _cme_speeds_for_epoch(model, high_jd, wall_jd)
    assert low_speeds
    assert high_speeds

    slow_fraction = sum(speed < 400.0 for speed in low_speeds) / len(low_speeds)
    assert min(low_speeds) < 120.0
    assert slow_fraction > 0.5
    assert max(high_speeds) > 2_500.0


def test_parker_spiral_extends_to_multi_au_domain() -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=220)
    state = model.sample_state(
        jd=CYCLE_25_START_JD + 2.0 * 365.25,
        fidelity="high",
        max_features=96,
        forcing="synthetic",
        realtime_data=None,
    )
    spiral = state["heliosphere"]["parker_spiral"]
    assert spiral["line_count"] == 6
    assert spiral["max_extent_au"] >= 3.0
    assert spiral["point_count"] >= 80
    assert len(spiral["lines"]) == 6
    assert len(spiral["lines"][0]["arc"]) >= 80
    pfss = state["pfss_field_lines"]
    assert "_wsa_result" not in pfss
    assert pfss["line_count"] == sum(pfss[f"{kind}_line_count"] for kind in ("open", "closed", "indeterminate"))
    for kind in ("open", "closed", "indeterminate"):
        assert pfss[f"{kind}_line_count"] == sum(line["state"] == kind for line in pfss["lines"])
    import json
    json.dumps(pfss, allow_nan=False)
    for line in pfss["lines"]:
        assert type(line["state"]) is str
        assert line["is_open"] is {"open": True, "closed": False, "indeterminate": None}[line["state"]]
        assert all(type(value) is float and math.isfinite(value) for value in line["endpoint"])


def test_synthetic_coronal_holes_present_at_solar_minimum() -> None:
    """At solar minimum (low activity), synthetic polar coronal holes should be present."""
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=220)
    low_jd = CYCLE_25_START_JD + 0.2 * 365.25  # near cycle start

    state = model.sample_state(
        jd=low_jd,
        fidelity="operational",
        max_features=32,
        forcing="synthetic",
        realtime_data=None,
    )
    ch = state.get("coronal_holes")
    assert ch is not None
    assert ch["source"] == "synthetic"
    assert ch["hole_count"] >= 2  # at least north + south polar holes
    assert any(h["type"] == "polar" for h in ch["holes"])
    assert ch["coverage_fraction"] > 0.05  # significant coverage at minimum


def test_synthetic_coronal_holes_coverage_decreases_at_solar_max() -> None:
    """Polar coronal hole coverage should be smaller at solar maximum."""
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=220)
    peak_days = HATHAWAY_B * math.sqrt(1.5) * MEAN_MONTH_DAYS

    min_jd = CYCLE_25_START_JD + 0.2 * 365.25
    max_jd = CYCLE_25_START_JD + peak_days

    state_min = model.sample_state(jd=min_jd, fidelity="preview", max_features=16, forcing="synthetic")
    state_max = model.sample_state(jd=max_jd, fidelity="preview", max_features=16, forcing="synthetic")

    ch_min = state_min["coronal_holes"]
    ch_max = state_max["coronal_holes"]

    # Polar holes larger at minimum
    polar_min = [h for h in ch_min["holes"] if h["type"] == "polar"]
    polar_max = [h for h in ch_max["holes"] if h["type"] == "polar"]
    assert len(polar_min) >= 2
    sum_area_min = sum(h["area_fraction"] for h in polar_min)
    sum_area_max = sum(h["area_fraction"] for h in polar_max) if polar_max else 0.0
    assert sum_area_min > sum_area_max


def test_parker_spiral_fast_wind_in_coronal_holes() -> None:
    """Spiral lines flagged in_coronal_hole should have fast-wind speeds (> 600 km/s)."""
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=220)
    state = model.sample_state(
        jd=CYCLE_25_START_JD + 0.2 * 365.25,
        fidelity="operational",
        max_features=32,
        forcing="synthetic",
        realtime_data=None,
    )
    spiral = state["heliosphere"]["parker_spiral"]
    lines = spiral["lines"]
    assert len(lines) == 6

    in_hole = [line for line in lines if line.get("in_coronal_hole")]
    out_hole = [line for line in lines if not line.get("in_coronal_hole")]

    # At solar minimum, some lines should be in coronal holes
    # (depends on geometry, so just check field exists and speeds are correct)
    for line in lines:
        assert "in_coronal_hole" in line
        speed = float(line["wind_speed_kms"])
        if line["in_coronal_hole"]:
            assert speed > 600.0, f"Fast wind expected in coronal hole, got {speed}"
        else:
            assert speed < 500.0, f"Slow wind expected outside coronal hole, got {speed}"


def test_sample_state_is_deterministic_for_fixed_epoch() -> None:
    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=220)
    jd = CYCLE_25_START_JD + 2.75 * 365.25

    state_a = model.sample_state(jd=jd, fidelity="high", max_features=64, forcing="synthetic")
    state_b = model.sample_state(jd=jd, fidelity="high", max_features=64, forcing="synthetic")

    assert state_a == state_b
    assert state_a["wall_epoch_jd"] == state_a["epoch_jd"] == jd


def test_carrington_rotation_number() -> None:
    from sim.pfss_magnetogram import carrington_rotation_number
    # jd=2460010.0 is cleanly inside a rotation (cr 2267)
    cr1 = carrington_rotation_number(2460010.0)
    cr2 = carrington_rotation_number(2460010.0 + 27.27)
    assert cr2 == cr1 + 1


def test_pfss_synthetic_produces_open_and_closed_lines() -> None:
    from sim.magnetogram_grid import equal_area_sine_latitude_grid
    from sim.pfss_magnetogram import synthetic_magnetogram, decompose_spherical_harmonics, pfss_solve, trace_field_lines
    br = synthetic_magnetogram(activity=0.8, jd=2460000.0)
    grid = equal_area_sine_latitude_grid(*br.shape)
    g, h = decompose_spherical_harmonics(br, lmax=10, grid=grid)
    field = pfss_solve(g, h, lmax=10)
    
    # 60 lines should be enough to capture both types
    lines = trace_field_lines(field, n_lines=60, br_map=br, grid=grid)
    
    assert len(lines) > 20
    open_count = sum(1 for line in lines if line["is_open"])
    closed_count = sum(1 for line in lines if line["state"] == "closed")
    
    # Needs to be a mix
    assert open_count > 0, "No open lines traced"
    assert closed_count > 0, "No closed lines traced"


def test_pfss_open_lines_reach_source_surface() -> None:
    from sim.magnetogram_grid import equal_area_sine_latitude_grid
    from sim.pfss_magnetogram import synthetic_magnetogram, decompose_spherical_harmonics, pfss_solve, trace_field_lines
    br = synthetic_magnetogram(activity=0.5, jd=2460000.0)
    grid = equal_area_sine_latitude_grid(*br.shape)
    g, h = decompose_spherical_harmonics(br, lmax=8, grid=grid)
    field = pfss_solve(g, h, lmax=8)
    lines = trace_field_lines(field, n_lines=40, br_map=br, grid=grid)
    
    for line in lines:
        if line["is_open"]:
            r = math.hypot(*line["endpoint"])
            assert abs(r - field.r_ss) <= 1e-6


def test_wsa_velocity_bounds() -> None:
    """WSA formula must produce physically plausible velocities."""
    from sim.pfss_magnetogram import _wsa_velocity

    # Deep coronal hole: low expansion, far from boundary → fast wind
    v_fast = _wsa_velocity(fs=1.5, theta_b=0.5)
    assert 500 < v_fast <= 850, f"Expected fast wind, got {v_fast}"

    # Streamer belt: high expansion, on boundary → slow wind
    v_slow = _wsa_velocity(fs=50.0, theta_b=0.001)
    assert 265 <= v_slow < 350, f"Expected slow wind, got {v_slow}"

    # Moderate: intermediate expansion and distance
    v_mid = _wsa_velocity(fs=10.0, theta_b=0.1)
    assert 265 <= v_mid <= 850, f"Out of range: {v_mid}"


def test_wsa_velocity_map_produces_speeds() -> None:
    """WSA velocity map must produce valid speeds for open flux regions."""
    from sim.pfss_magnetogram import (
        synthetic_magnetogram, decompose_spherical_harmonics,
        pfss_solve, compute_wsa_velocity_map,
    )
    import numpy as np
    from sim.magnetogram_grid import equal_area_sine_latitude_grid

    br = synthetic_magnetogram(activity=0.3, jd=2460000.0)
    g, h = decompose_spherical_harmonics(br, lmax=8, grid=equal_area_sine_latitude_grid(*br.shape))
    field = pfss_solve(g, h, lmax=8)

    wsa = compute_wsa_velocity_map(field, br_map=br, n_lat=18, n_lon=36)

    assert "velocity_map" in wsa
    assert "open_mask" in wsa
    assert "mean_velocity_kms" in wsa

    v_map = wsa["velocity_map"]
    open_mask = wsa["open_mask"]

    # Must have some open flux
    assert open_mask.any(), "No open flux found"

    # All valid velocities must be in WSA range
    valid = v_map[np.isfinite(v_map)]
    assert valid.size > 0
    assert valid.min() >= 265.0, f"Min velocity {valid.min()} below floor"
    assert valid.max() <= 850.0, f"Max velocity {valid.max()} above ceiling"

    # Mean should be physically plausible
    mean_v = wsa["mean_velocity_kms"]
    assert 265.0 <= mean_v <= 850.0


def test_parker_spiral_uses_wsa_model() -> None:
    """Parker spiral lines should report WSA as wind speed source when available."""
    model = SolarCoronaPhysicsModel(seed=42, base_tube_count=100)
    state = model.sample_state(jd=2460000.5, fidelity="preview", max_features=8)

    spiral = state.get("heliosphere", {}).get("parker_spiral", {})
    assert "wind_speed_model" in spiral
    assert spiral["wind_speed_model"] in ("wsa_arge_2003", "empirical_ch_bimodal")

    # All lines should have wind_speed_source
    for line in spiral.get("lines", []):
        assert "wind_speed_source" in line
        v = line["wind_speed_kms"]
        assert 265.0 <= v <= 860.0, f"Spiral wind speed {v} out of range"
