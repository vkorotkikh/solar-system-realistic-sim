"""Explicit model-frame metadata is not observed Carrington calibration."""
import pytest

from sim.solar_frames import synthetic_geometry_frame, unresolved_observed_geometry_frame
from sim.solar_physics import SolarCoronaPhysicsModel


@pytest.fixture(scope="module")
def state():
    return SolarCoronaPhysicsModel(base_tube_count=64).sample_state(
        2451552.0, fidelity="preview", max_features=8
    )


@pytest.mark.parametrize("layer", ("pfss", "loops", "spots", "parker", "cme", "coronal_holes"))
def test_all_model_layers_declare_their_actual_snapshot_frame(state, layer):
    frame = state["geometry_frames"][layer]
    assert frame == {
        "schema": {"name": "solar_geometry_frame", "version": 1},
        "frame": "SOLAR_EQUATORIAL_J2000", "reference_frame": "IAU_SUN_AT_J2000",
        "reference_epoch_jd_tdb": 2451545.0, "epoch_jd_tdb": 2451552.0,
        "jd_time_scale": "TDB", "origin": "SUN_CENTER", "north_axis": "+Z",
        "handedness": "right", "length_unit": "solar_radius", "direction_unit": "unit_vector",
        "rotation_state": "already_evolved", "source_kind": "synthetic",
        "calibration_status": "unvalidated",
    }


def test_pfss_snapshot_envelope_retains_its_own_frame_and_epoch(state):
    pfss = state["pfss_field_lines"]
    assert pfss["source"] == "synthetic"
    assert pfss["geometry_frame"] == state["geometry_frames"]["pfss"]
    assert pfss["geometry_frame"]["epoch_jd_tdb"] == state["epoch_jd_tdb"]


def test_observed_native_coordinates_are_explicitly_not_scene_eligible():
    frame = unresolved_observed_geometry_frame()
    assert frame["frame"] == "UNRESOLVED_OBSERVED"
    assert frame["source_kind"] == "observed"
    assert frame["rendering_eligible"] is False
    assert "reference_frame" not in frame


@pytest.mark.parametrize("bad", (float("nan"), float("inf"), -float("inf")))
def test_frame_declarations_reject_nonfinite_epochs(bad):
    with pytest.raises(ValueError, match="finite"):
        synthetic_geometry_frame(bad)
