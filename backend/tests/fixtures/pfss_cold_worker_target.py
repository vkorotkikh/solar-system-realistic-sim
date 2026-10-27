"""Cold-process acceptance target; never installed as an HTTP worker target."""
from __future__ import annotations

import json
import os
from pathlib import Path
import resource
import time


def execute(payload):
    started = time.perf_counter()
    from sim import process_supervisor, solar_process_worker
    from sim.pfss_magnetogram import compute_pfss_from_coefficients

    native = os.environ.get("SCN041_COLD_NATIVE", "1") == "1"
    metrics = {"native_spectral_fixture": native, "solver_calls": 0}
    original_model = solar_process_worker.SolarCoronaPhysicsModel
    if native:
        from solar_reference_comparison import load_reference

        decoding = time.perf_counter()
        header, coefficients, *_ = load_reference()
        metrics["reference_decode_seconds"] = time.perf_counter() - decoding
        metrics["degree"] = coefficients.shape[1] - 1
        metrics["source_surface_radii"] = float(header["RADSS"])

        class NativeBoundaryCache:
            def get_or_compute(self, jd, activity, n_lines=120, lmax=15, **kwargs):
                del jd, activity, lmax, kwargs
                solving = time.perf_counter()
                products = compute_pfss_from_coefficients(
                    coefficients, source_surface_radii=float(header["RADSS"]),
                    line_count=n_lines,
                )
                metrics["solver_calls"] += 1
                metrics["solver_seconds"] = time.perf_counter() - solving
                metrics["display_lines"] = products["line_count"]
                metrics["wsa_grid"] = products["wsa"]["grid_resolution"]
                return products

        class NativeBoundaryModel(original_model):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self._pfss_cache = NativeBoundaryCache()

        solar_process_worker.SolarCoronaPhysicsModel = NativeBoundaryModel
    try:
        result = solar_process_worker.execute_solar_physics_job(payload)
    finally:
        solar_process_worker.SolarCoronaPhysicsModel = original_model
    metrics["target_seconds"] = time.perf_counter() - started

    # Observe the actual supervisor envelope after its normal encoding, rather
    # than returning a smaller benchmark surrogate or estimating JSON size.
    original_encode = process_supervisor._encode_envelope

    def measured_encode(envelope):
        encoded = original_encode(envelope)
        metrics["wire_bytes"] = len(encoded)
        metrics["child_peak_rss_kib"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        metrics["through_encoding_seconds"] = time.perf_counter() - started
        Path(os.environ["SCN041_COLD_METRICS"]).write_text(
            json.dumps(metrics, allow_nan=False), encoding="ascii"
        )
        return encoded

    process_supervisor._encode_envelope = measured_encode
    return result
