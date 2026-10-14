"""A usable spectral solver is not authority to enable observed forcing."""
import pytest

from sim import pfss_magnetogram
from sim.solar_physics import ObservedSolarInputUnavailable
from sim.solar_process_worker import execute_solar_physics_job


@pytest.mark.parametrize("live_data", [False, True])
@pytest.mark.parametrize("fidelity", ["high", "ultra"])
def test_observed_worker_stays_closed_before_any_pfss_work(monkeypatch, live_data, fidelity):
    def forbidden(*args, **kwargs):
        raise AssertionError("unvalidated observed forcing entered PFSS")

    monkeypatch.setattr(pfss_magnetogram.PFSSCache, "get_or_compute", forbidden)
    monkeypatch.setattr(pfss_magnetogram, "compute_pfss_from_coefficients", forbidden)
    with pytest.raises(ObservedSolarInputUnavailable, match="disabled_unvalidated"):
        execute_solar_physics_job({
            "epoch_jd_tdb": 2461326.238888889, "fidelity": fidelity,
            "max_features": 256, "forcing": "data_driven", "live_data": live_data,
        })


@pytest.mark.parametrize("extra", ["coefficients_schmidt_gauss", "geometry_validated",
                                    "source_surface_radii", "native_spectral_boundary"])
def test_worker_payload_cannot_promote_native_spectral_input(extra):
    with pytest.raises(ValueError, match="invalid shape"):
        execute_solar_physics_job({
            "epoch_jd_tdb": 2461326.238888889, "fidelity": "high",
            "max_features": 256, "forcing": "synthetic", "live_data": False,
            extra: True,
        })
