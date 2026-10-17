"""Deterministic SCN-041 real-GONG and provider-feature acceptance oracle."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import gzip
import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np

from sim import gong_magnetogram as gong
from sim.magnetogram_grid import MagnetogramGrid
from sim.pfss_magnetogram import (
    compute_pfss_from_coefficients,
    decompose_spherical_harmonics,
)
from solar_reference_comparison import FITS_SHA, _artifact, fits_images


ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "agent-notes/solar-observational-acceptance-2026-10-17"
OBSERVATION = CORPUS / "nso_gong_zqs_202610121744.fits.gz"
PROVIDER_FILENAME = "mrzqs261012t1744c2316_079.fits.gz"
MANIFEST = CORPUS / "manifest.json"
OBSERVATION_SHA256 = "e405550e1f8844bf5556419e7137aa6eb9bce79e0292a628df2c1ece28872ee8"
EXPANDED_SHA256 = "e93f2c4daec232b5c98583d15a589130c3bc588201c25e980455db9aa8144efd"
SOURCE_URL = (
    "https://gong.nso.edu/data/magmap/QR/zqs/202610/mrzqs261012/"
    "mrzqs261012t1744c2316_079.fits.gz"
)
REQUEST_JD_TDB = 2461326.239689611

# Bounded retained-epoch contract. These do not replace any existing numerical
# tolerances or claim speed, solar-cycle, or 1-AU forecast validation.
BUDGET = {
    "coefficient_correlation_min": 0.9999,
    "coefficient_normalized_rmse_max": 0.01,
    "coefficient_max_abs_gauss_max": 0.06,
    "wrong_frame_correlation_max": 0.1,
    "constant_monopole_normalized_rmse_min": 0.04,
    "topology_accuracy_min": 0.96,
    "provider_open_recall_min": 0.74,
    "provider_closed_recall_min": 0.999,
    "matched_feature_cells_min": 240,
    "log_expansion_correlation_min": 0.67,
    "log_expansion_median_abs_max": 0.47,
    "boundary_correlation_min": 0.50,
    "boundary_median_abs_deg_max": 3.5,
}


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pinned_observation_bytes() -> tuple[bytes, bytes]:
    compressed = OBSERVATION.read_bytes()
    if len(compressed) != 243104 or _sha256(compressed) != OBSERVATION_SHA256:
        raise ValueError("Pinned NSO/GONG observation identity mismatch")
    expanded = gzip.decompress(compressed)
    if len(expanded) != 267840 or _sha256(expanded) != EXPANDED_SHA256:
        raise ValueError("Pinned NSO/GONG expanded identity mismatch")
    return compressed, expanded


def load_observed_snapshot() -> gong.MagnetogramSnapshot:
    _, expanded = pinned_observation_bytes()
    return gong.parse_gong_fits(
        expanded,
        context=gong.GongParseContext(
            request_jd_tdb=REQUEST_JD_TDB,
            source_url=SOURCE_URL,
            filename=PROVIDER_FILENAME,
            compressed_sha256=OBSERVATION_SHA256,
            retrieved_at_utc="2026-10-17T19:07:29Z",
            retrieval_timeout_s=20.0,
        ),
    )


def _provider_reference() -> tuple[dict[str, str], np.ndarray, np.ndarray]:
    images = fits_images(_artifact("nasa_wsa_gongz_202610121744.fits", FITS_SHA))
    header, maps = images[0]
    coefficient_header, coefficients = images[3]
    if coefficient_header["UNITS"] != "microTesla":
        raise ValueError("Unexpected provider coefficient units")
    return header, maps, coefficients.transpose(0, 2, 1) * 0.01


def _correlation(left: np.ndarray, right: np.ndarray) -> float:
    left = np.asarray(left, dtype=float).ravel()
    right = np.asarray(right, dtype=float).ravel()
    if left.size < 2 or left.size != right.size or not np.all(np.isfinite(left)) or not np.all(np.isfinite(right)):
        raise ValueError("Correlation inputs must be matched finite vectors")
    return float(np.corrcoef(left, right)[0, 1])


def _coefficient_vectors(coefficients: np.ndarray, degree: int = 15) -> np.ndarray:
    triangular = np.tril(np.ones((degree + 1, degree + 1), dtype=bool))
    triangular[0, 0] = False
    mask = np.broadcast_to(triangular, (2, degree + 1, degree + 1))
    return np.asarray(coefficients[:, : degree + 1, : degree + 1])[mask]


def _absolute_to_provider_native(coefficients: np.ndarray, long0_deg: float) -> np.ndarray:
    native = np.array(coefficients, dtype=float, copy=True)
    angle = math.radians(long0_deg)
    degree = native.shape[1] - 1
    for order in range(degree + 1):
        cosine = math.cos(order * angle)
        sine = math.sin(order * angle)
        g = coefficients[0, :, order]
        h = coefficients[1, :, order]
        native[0, :, order] = g * cosine + h * sine
        native[1, :, order] = -g * sine + h * cosine
    return native


def _raw_map(expanded: bytes) -> np.ndarray:
    with gong.fits.open(io.BytesIO(expanded), memmap=False, do_not_scale_image_data=False) as hdul:
        return np.asarray(hdul[0].data, dtype=float)


def coefficient_acceptance(snapshot: gong.MagnetogramSnapshot) -> dict[str, object]:
    header, _, provider = _provider_reference()
    if (
        header["PROVERS"] != "WSA_V6.2"
        or header["OBSTIME"] != "2026:10:12_17h:44m:00s"
        or int(header["OBSCAR"]) != snapshot.snapshot_id.car_rot
        or float(header["CARRLONG"]) != snapshot.snapshot_id.long0_deg
        or header["FILELIST"] != "mrzql261012t1744c2316_079"
    ):
        raise ValueError("Observed input and provider product identity do not match")
    correction_method_value = float(header["MPCORR"])
    correction_method = 2
    provider_pre_mean_g = float(header["MPOLD"])
    provider_post_mean_g = float(header["MPNEW"])
    derived_pre_mean_g = (
        snapshot.provenance.flux.pre_signed_flux_g_sr / (4.0 * math.pi)
    )
    derived_post_mean_g = (
        snapshot.provenance.flux.post_signed_flux_g_sr / (4.0 * math.pi)
    )
    if (
        not math.isclose(correction_method_value, 2.0, rel_tol=0.0, abs_tol=0.0)
        or not math.isclose(provider_pre_mean_g, 0.19715, rel_tol=0.0, abs_tol=5e-10)
        or not math.isclose(provider_post_mean_g, 5.473e-05, rel_tol=0.0, abs_tol=5e-10)
        or abs(provider_pre_mean_g - derived_pre_mean_g)
        > gong.TRUSTED_SCALED_PRE_MEAN_TOLERANCE_G
        or abs(provider_post_mean_g - derived_post_mean_g)
        > gong.TRUSTED_SCALED_POST_MEAN_TOLERANCE_G
    ):
        raise ValueError("Provider correction metadata does not corroborate map means")

    g_absolute, h_absolute = decompose_spherical_harmonics(
        snapshot.field_gauss, lmax=15, grid=snapshot.grid,
    )
    absolute = np.stack((g_absolute, h_absolute))
    native = _absolute_to_provider_native(absolute, snapshot.snapshot_id.long0_deg)
    actual = _coefficient_vectors(native)
    expected = _coefficient_vectors(provider)
    differences = actual - expected
    normalized_rmse = float(
        np.sqrt(np.mean(differences * differences))
        / np.sqrt(np.mean(expected * expected))
    )

    # Negative controls are independently computed from the native bytes. A
    # constant offset and an omitted Carrington rotation must not pass.
    _, expanded = pinned_observation_bytes()
    raw = _raw_map(expanded)
    relative_grid = MagnetogramGrid(
        snapshot.grid.mu,
        snapshot.grid.phi_rad - math.radians(snapshot.snapshot_id.long0_deg),
        snapshot.grid.row_order,
        snapshot.grid.convention,
    )
    constant = raw - float(np.mean(raw))
    constant_coefficients = np.stack(
        decompose_spherical_harmonics(constant, lmax=15, grid=relative_grid),
    )
    constant_values = _coefficient_vectors(constant_coefficients)
    constant_difference = constant_values - expected
    constant_normalized_rmse = float(
        np.sqrt(np.mean(constant_difference * constant_difference))
        / np.sqrt(np.mean(expected * expected))
    )

    return {
        "degree": 15,
        "samples": int(actual.size),
        "correlation": _correlation(actual, expected),
        "normalized_rmse": normalized_rmse,
        "max_abs_gauss": float(np.max(np.abs(differences))),
        "wrong_frame_correlation": _correlation(_coefficient_vectors(absolute), expected),
        "constant_monopole_normalized_rmse": constant_normalized_rmse,
        "frame_adapter": "absolute_carrington_to_provider_native_minus_long0_v1",
        "provider_correction": {
            "method": correction_method,
            "mpold_g": provider_pre_mean_g,
            "mpnew_g": provider_post_mean_g,
            "derived_pre_mean_g": derived_pre_mean_g,
            "derived_post_mean_g": derived_post_mean_g,
            "pre_mean_tolerance_g": gong.TRUSTED_SCALED_PRE_MEAN_TOLERANCE_G,
            "post_mean_tolerance_g": gong.TRUSTED_SCALED_POST_MEAN_TOLERANCE_G,
            "provider_input_map": header["FILELIST"],
            "retained_observation_product": "zqs",
            "identity_relation": (
                "same_epoch_rotation_left_edge_not_same_product_identifier"
            ),
        },
    }


def _nearest_provider_cells(theta: np.ndarray, phi: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    provider_latitude = np.arange(-89.0, 90.0, 2.0)
    provider_longitude = np.arange(1.0, 360.0, 2.0)
    latitude = 90.0 - np.rad2deg(theta)
    longitude = np.rad2deg(phi) % 360.0
    latitude_index = np.abs(latitude[..., None] - provider_latitude).argmin(axis=-1)
    longitude_distance = np.abs(
        (longitude[..., None] - provider_longitude + 180.0) % 360.0 - 180.0,
    )
    return latitude_index, longitude_distance.argmin(axis=-1)


def _paired_metrics(actual: np.ndarray, reference: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    actual = np.asarray(actual, dtype=float)[mask]
    reference = np.asarray(reference, dtype=float)[mask]
    residual = actual - reference
    return {
        "correlation": _correlation(actual, reference),
        "median_abs": float(np.median(np.abs(residual))),
        "p90_abs": float(np.quantile(np.abs(residual), 0.9)),
        "rmse": float(np.sqrt(np.mean(residual * residual))),
        "bias": float(np.mean(residual)),
        "actual_median": float(np.median(actual)),
        "reference_median": float(np.median(reference)),
    }


def application_wsa_acceptance() -> tuple[dict[str, object], dict[str, object]]:
    header, maps, coefficients = _provider_reference()
    products = compute_pfss_from_coefficients(
        coefficients,
        source_surface_radii=float(header["RADSS"]),
        line_count=8,
        wsa_n_lat=36,
        wsa_n_lon=72,
    )
    wsa = products["_wsa_result"]
    theta, phi = np.meshgrid(wsa["grid_theta"], wsa["grid_phi"], indexing="ij")
    photo_i, photo_j = _nearest_provider_cells(theta, phi)
    provider_topology = maps[6][photo_i, photo_j]
    provider_open = np.isin(provider_topology, (1.0, 2.0, 3.0))
    application_open = wsa["open_mask"]
    application_closed = wsa["closed_mask"]

    source_i, source_j = _nearest_provider_cells(wsa["ss_theta"], wsa["ss_phi"])
    provider_expansion = maps[1][source_i, source_j]
    provider_boundary_deg = maps[5][photo_i, photo_j]
    matched = (
        application_open
        & provider_open
        & np.isfinite(wsa["fs_map"])
        & np.isfinite(wsa["theta_b_map"])
        & (provider_expansion > 0.0)
        & np.isfinite(provider_expansion)
        & (provider_boundary_deg >= 0.0)
        & np.isfinite(provider_boundary_deg)
    )
    open_recall = float(np.mean(application_open[provider_open]))
    closed_recall = float(np.mean(application_closed[~provider_open]))

    metrics: dict[str, object] = {
        "application_api": "compute_pfss_from_coefficients",
        "provider": header["PROVERS"],
        "provider_degree": 90,
        "source_surface_radii": float(header["RADSS"]),
        "grid_shape": [36, 72],
        "matched_feature_cells": int(np.count_nonzero(matched)),
        "topology": {
            "provider_open": int(np.count_nonzero(provider_open)),
            "application_open": int(np.count_nonzero(application_open)),
            "false_open": int(np.count_nonzero(application_open & ~provider_open)),
            "false_closed": int(np.count_nonzero(~application_open & provider_open)),
            "accuracy": float(np.mean(application_open == provider_open)),
            "provider_open_recall": open_recall,
            "provider_closed_recall": closed_recall,
            "balanced_accuracy": (open_recall + closed_recall) / 2.0,
        },
        "log_expansion": _paired_metrics(
            np.log(wsa["fs_map"]), np.log(provider_expansion), matched,
        ),
        "boundary_distance_deg": _paired_metrics(
            np.rad2deg(wsa["theta_b_map"]), provider_boundary_deg, matched,
        ),
        "application_metadata": {
            "model": wsa["model"],
            "calibration_status": wsa["calibration_status"],
            "provider_feature_evidence": wsa.get("provider_feature_evidence"),
            "valid_fraction": wsa["valid_fraction"],
            "indeterminate_fraction": wsa["indeterminate_fraction"],
            "coverage_fraction": wsa["coverage_fraction"],
            "quality_reasons": wsa["quality_reasons"],
        },
    }
    checks = {
        "topology_accuracy": metrics["topology"]["accuracy"] >= BUDGET["topology_accuracy_min"],
        "provider_open_recall": metrics["topology"]["provider_open_recall"] >= BUDGET["provider_open_recall_min"],
        "provider_closed_recall": metrics["topology"]["provider_closed_recall"] >= BUDGET["provider_closed_recall_min"],
        "matched_feature_cells": metrics["matched_feature_cells"] >= BUDGET["matched_feature_cells_min"],
        "log_expansion_correlation": metrics["log_expansion"]["correlation"] >= BUDGET["log_expansion_correlation_min"],
        "log_expansion_median_abs": metrics["log_expansion"]["median_abs"] <= BUDGET["log_expansion_median_abs_max"],
        "boundary_correlation": metrics["boundary_distance_deg"]["correlation"] >= BUDGET["boundary_correlation_min"],
        "boundary_median_abs": metrics["boundary_distance_deg"]["median_abs"] <= BUDGET["boundary_median_abs_deg_max"],
    }
    return metrics, checks


def build_report() -> dict[str, object]:
    snapshot = load_observed_snapshot()
    coefficients = coefficient_acceptance(snapshot)
    wsa, wsa_checks = application_wsa_acceptance()
    coefficient_checks = {
        "coefficient_correlation": coefficients["correlation"] >= BUDGET["coefficient_correlation_min"],
        "coefficient_normalized_rmse": coefficients["normalized_rmse"] <= BUDGET["coefficient_normalized_rmse_max"],
        "coefficient_max_abs": coefficients["max_abs_gauss"] <= BUDGET["coefficient_max_abs_gauss_max"],
        "wrong_frame_negative_control": coefficients["wrong_frame_correlation"] <= BUDGET["wrong_frame_correlation_max"],
        "constant_monopole_negative_control": coefficients["constant_monopole_normalized_rmse"] >= BUDGET["constant_monopole_normalized_rmse_min"],
    }
    checks = {**coefficient_checks, **wsa_checks}
    return {
        "schema": "scn041_observational_acceptance_v2",
        "corpus": "nso-gong-zqs-wsa-v6.2-20261012T1744",
        "observation_sha256": OBSERVATION_SHA256,
        "expanded_observation_sha256": EXPANDED_SHA256,
        "provider_wsa_sha256": FITS_SHA,
        "observed_snapshot_sha256": snapshot.snapshot_id.sha256,
        "flux_balance": asdict(snapshot.provenance.flux),
        "coefficient_frame_acceptance": coefficients,
        "application_wsa_acceptance": wsa,
        "budget": BUDGET,
        "checks": checks,
        "acceptance_passed": all(checks.values()),
        "scope": "One retained real GONG epoch and matched WSA V6.2 provider feature planes; no independent speed output.",
        "limitations": json.loads(MANIFEST.read_text())["limitations"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--require-acceptance", action="store_true")
    options = parser.parse_args()
    report = build_report()
    encoded = json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n"
    if options.output:
        options.output.write_text(encoded)
    print(encoded, end="")
    if options.require_acceptance and not report["acceptance_passed"]:
        raise SystemExit(2)
