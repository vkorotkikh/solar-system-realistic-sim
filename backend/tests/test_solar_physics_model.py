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
