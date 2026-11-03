"""SCN-041 sampling and input-identity investigation, not a runtime solver.

All original thresholds and fixtures remain unchanged. An independently
evaluated near-null latitude mode explains why the degree-90 sampled-map
inverse must reject. A cell-constant boundary is explored explicitly as a
different physical assumption, not as a way to pass that inverse's gate.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import math
from pathlib import Path

from astropy.io import fits
import numpy as np
from scipy.special import sph_harm_y

from sim.magnetogram_grid import equal_area_sine_latitude_grid, uniform_colatitude_grid
from sim.pfss_magnetogram import decompose_spherical_harmonics
from solar_observational_acceptance import (
    BUDGET, OBSERVATION_SHA256, _absolute_to_provider_native, _coefficient_vectors,
    _provider_reference, application_wsa_acceptance, load_observed_snapshot,
    pinned_observation_bytes,
)
from solar_reference_comparison import FITS_SHA


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "agent-notes/SCN041_CLOSURE_2026-11-02_EVIDENCE"
LIST_NAME = "mrzql261012t1744c2316_079.lst.gz"
LIST_SHA = "29a0e5c2819c938736f293b7a62325ef43309dfa8224b8c9537d5d4b96bc8e3c"


def independent_design(degree, order, mu):
    """SciPy normalized harmonics converted to real Schmidt/no-CS.

    The unnormalized lpmv API overflows for m=90 before normalization. Keep
    the library basis normalized throughout, independently of our recurrence.
    """
    degrees = np.arange(order, degree + 1)
    scale = (-1.0) ** order * np.sqrt(4 * math.pi * (2 if order else 1) / (2 * degrees + 1))
    basis = sph_harm_y(degrees[:, None], order, np.arccos(np.asarray(mu))[None, :], 0).real
    return (basis * scale[:, None]).T


def cell_constant_projection(field, grid, *, degree=90, quadrature_order=64):
    """Integrate an explicitly piecewise-constant map, with full polar cells.

    This is a test-only alternative boundary assumption. It cannot recover
    the unobserved subpixel field. No sampled-center inverse, no regularizer,
    no degree reduction, and no provider coefficient enters the calculation.
    """
    field = grid.validate_map(field)
    nodes, weights = np.polynomial.legendre.leggauss(quadrature_order)
    lower = np.minimum(grid.mu_edges[:-1], grid.mu_edges[1:])
    upper = np.maximum(grid.mu_edges[:-1], grid.mu_edges[1:])
    mu = ((upper - lower)[:, None] * nodes / 2 + (lower + upper)[:, None] / 2).ravel()
    quadrature = (upper - lower)[:, None] / 2 * weights
    result = np.zeros((2, degree + 1, degree + 1))
    for order in range(degree + 1):
        factor = (1 if order == 0 else 2) / len(grid.phi_rad)
        amplitudes = np.stack((field @ np.cos(order * grid.phi_rad),
                               field @ np.sin(order * grid.phi_rad))) * factor
        design = independent_design(degree, order, mu).reshape(len(grid.mu), quadrature_order, -1)
        # Integral P_lm**2 dmu = 2*(2-delta_m0)/(2l+1).
        inverse_norm = (2 * np.arange(order, degree + 1) + 1) / (2 * (1 if order == 0 else 2))
        # Integrate the finite longitude pixel, not just its center value.
        result[:, order:, order] = np.einsum("iql,ki,iq->kl", design, amplitudes, quadrature) * inverse_norm * np.sinc(order / len(grid.phi_rad))
    return result


def contributor_identity():
    raw = (EVIDENCE / LIST_NAME).read_bytes()
    if hashlib.sha256(raw).hexdigest() != LIST_SHA:
        raise ValueError("contributor list hash mismatch")
    contributors = gzip.decompress(raw).decode("ascii").splitlines()
    with fits.open(io.BytesIO(pinned_observation_bytes()[1]), memmap=False) as hdus:
        header = hdus[0].header
        count = int(header["MAPCOUNT"])
        retained_filelist = header["FILELIST"]
        if count != int(header["NFILETOT"]) or count != len(contributors):
            raise ValueError("contributor count differs from the retained map header")
    provider_filelist = _provider_reference()[0]["FILELIST"]
    if retained_filelist != provider_filelist or LIST_NAME != retained_filelist + ".lst.gz":
        raise ValueError("contributor list identity differs from the retained products")
    return {
        "contributor_list_sha256": LIST_SHA,
        "retained_map_filelist": retained_filelist, "provider_filelist": provider_filelist,
        "contributor_count": len(contributors), "retained_map_count": count,
        "first_contributor": contributors[0], "last_contributor": contributors[-1],
        "list_is_magnetogram_pixel_data": False,
        "claim": "Both products name the same contributor list; this does not establish identical downstream preprocessing.",
    }


def _coefficient_errors(actual, expected, degree):
    left, right = _coefficient_vectors(actual, degree), _coefficient_vectors(expected, degree)
    difference = left - right
    return {"correlation": float(np.corrcoef(left, right)[0, 1]),
            "normalized_rmse": float(np.linalg.norm(difference) / np.linalg.norm(right)),
            "max_abs_gauss": float(np.max(abs(difference)))}


def build_report(*, include_alternative_boundary=False):
    snapshot = load_observed_snapshot()
    grid = snapshot.grid
    design = np.polynomial.legendre.legvander(grid.mu, 90)
    weighted = design * np.sqrt(grid.area_weights[:, None])
    _, singular, vectors = np.linalg.svd(weighted, full_matrices=False)
    invisible = vectors[-1]
    independent = independent_design(90, 0, grid.mu)
    admissions = []
    for degree in (90, 64, 30, 15):
        trial = design[:, :degree + 1] * np.sqrt(grid.area_weights[:, None])
        try:
            decompose_spherical_harmonics(snapshot.field_gauss, degree, grid=grid)
            admission = {"admitted": True}
        except ValueError as exc:
            admission = {"admitted": False, "error": str(exc)}
        admissions.append({"degree": degree, "independent_m0_condition": float(np.linalg.cond(trial)), **admission})
    # Exact cell-averages of the m=0 polynomials also remain ill-conditioned.
    cell_design = np.column_stack([
        np.diff(np.polynomial.legendre.Legendre.basis(degree).integ()(grid.mu_edges))
        / np.diff(grid.mu_edges) for degree in range(91)
    ]) * np.sqrt(grid.area_weights[:, None])
    geometry = []
    for factory, nlat in ((equal_area_sine_latitude_grid, 360),
                          (equal_area_sine_latitude_grid, 720),
                          (uniform_colatitude_grid, 180)):
        trial_grid = factory(nlat, 360)
        trial = np.polynomial.legendre.legvander(trial_grid.mu, 90) * np.sqrt(trial_grid.area_weights[:, None])
        geometry.append({"grid": trial_grid.convention, "n_lat": nlat,
                         "condition": float(np.linalg.cond(trial)), "actual_retained_observation": False})
    report = {
        "schema": "scn041_independent_sampling_investigation_v1",
        "observation_sha256": OBSERVATION_SHA256, "provider_wsa_sha256": FITS_SHA,
        "contributor_identity": contributor_identity(),
        "degree_admission": admissions,
        "sampling_evidence": {
            "matrix": "independent NumPy Legendre Vandermonde, m=0, exact strip-area weights",
            "scipy_basis_max_abs_disagreement": float(np.max(abs(design - independent))),
            "condition_degree90": float(singular[0] / singular[-1]),
            "condition_without_monopole": float(np.linalg.cond(weighted[:, 1:])),
            "condition_of_cell_average_inverse": float(np.linalg.cond(cell_design)),
            "coefficient_vector_l2_norm": float(np.linalg.norm(invisible)),
            "max_sampled_field_gauss": float(np.max(abs(design @ invisible))),
            "north_pole_field_gauss": float(abs(np.polynomial.legendre.legval(1.0, invisible))),
            "closest_pixel_to_pole_deg": float(np.rad2deg(np.arccos(max(abs(grid.mu))))),
            "total_strip_area": float(np.sum(grid.area_weights)),
            "polar_edges": [float(grid.mu_edges[0]), float(grid.mu_edges[-1])],
            "hypothetical_new_sampling": geometry,
        },
        "unchanged_acceptance_budget": BUDGET,
        "original_map_degree90_accepted": admissions[0]["admitted"],
        "production_behavior_changed": False,
        "application_calibrated": False,
        "conclusions": [
            "The degree-90 latitude inverse loses polar information on the retained 180-row equal-sine grid; the independent basis reproduces the rejection.",
            "The monopole and missing polar-area weights are not the cause. Removing l=0 and fitting finite-cell averages remain ill-conditioned.",
            "Different observed sampling can be well-conditioned. Interpolation of the retained samples does not supply those additional observations.",
            "A cell-constant boundary is a different assumed field; its coefficients must not be presented as recovery of the original point-sampled harmonic field.",
        ],
    }
    if include_alternative_boundary:
        _, _, expected = _provider_reference()
        projected = cell_constant_projection(snapshot.field_gauss, grid)
        native = _absolute_to_provider_native(projected, snapshot.snapshot_id.long0_deg)
        coarse = cell_constant_projection(snapshot.field_gauss, grid, quadrature_order=32)
        metrics, checks = application_wsa_acceptance(coefficients_schmidt_gauss=native)
        # The legacy comparator labels a provided coefficient array generically.
        # Disclose its actual boundary assumption in this new diagnostic only.
        metrics["application_input"] = "diagnostic_degree90_integral_of_piecewise_constant_retained_pixels"
        report["alternative_boundary_diagnostic"] = {
            "method": "independent_scipy_cell_constant_integral_v1",
            "production_enabled": False, "original_inverse_condition_gate_passed": False,
            "quadrature_order": 64,
            "quadrature_32_to_64_max_coefficient_change_gauss": float(np.max(abs(projected - coarse))),
            "coefficient_errors": {str(d): _coefficient_errors(native, expected, d) for d in (15, 30, 64, 90)},
            "metrics": metrics, "checks": checks, "feature_budget_passed": all(checks.values()),
        }
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--include-alternative-boundary", action="store_true")
    args = parser.parse_args()
    encoded = json.dumps(build_report(include_alternative_boundary=args.include_alternative_boundary),
                         indent=2, sort_keys=True, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(encoded)
    print(encoded, end="")
