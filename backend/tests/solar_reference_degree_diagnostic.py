"""Matched NASA degree convergence with an independent SciPy basis.

This is a diagnostic, not an enabled runtime solver or a calibration claim.
The full degree-90 provider coefficients and RADSS are consumed unchanged.
SciPy is in the pinned test environment, not a new production dependency.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import resource
import time

import numpy as np
from scipy.special import assoc_legendre_p_all

from solar_reference_comparison import BUDGET, FITS_SHA, LINES_SHA, _stats, load_reference
from sim.pfss_magnetogram import PFSSField
from sim.pfss_tracing import trace_field_batch


class IndependentScipyPFSS:
    """Normalized SciPy basis and potential-gradient radial factors.

    Evaluate at most 128 positions per temporary basis allocation, including
    SciPy's negative-order storage. Degree 90's largest basis is 33,732,608
    bytes (2 derivatives * 91 degrees * 181 orders * 128 samples * 8 bytes).
    Output storage remains O(number of caller positions).
    """

    chunk_size = 128

    def __init__(self, coefficients, degree, source_radius):
        if not 1 <= degree <= 90:
            raise ValueError("diagnostic degree must be in [1, 90]")
        self.g, self.h = np.asarray(coefficients, dtype=float)[:, :degree+1, :degree+1]
        self.lmax, self.r_ss = degree, source_radius
        self.evaluations = 0
        self.evaluated_points = 0

    def evaluate_cartesian_batch(self, x, y, z):
        xyz = np.column_stack((x, y, z))
        result = np.empty_like(xyz)
        self.evaluations += 1
        self.evaluated_points += len(xyz)
        for start in range(0, len(xyz), self.chunk_size):
            stop = min(start + self.chunk_size, len(xyz))
            result[start:stop] = self._chunk(xyz[start:stop])
        return tuple(result.T)

    def _chunk(self, xyz):
        r = np.linalg.norm(xyz, axis=1)
        mu = xyz[:, 2] / r
        st = np.sqrt(np.maximum(0, (1 - mu) * (1 + mu)))
        phi = np.arctan2(xyz[:, 1], xyz[:, 0])
        orders = np.arange(self.lmax + 1)
        with np.errstate(invalid="ignore", divide="ignore"):
            basis = assoc_legendre_p_all(self.lmax, self.lmax, mu, norm=True, diff_n=1)
        cosine = np.cos(orders[:, None] * phi)
        sine = np.sin(orders[:, None] * phi)
        br, bt, bp = np.zeros((3, len(r)))
        for degree in range(1, self.lmax + 1):
            m = orders[:degree+1]
            # SciPy normalized P includes CS phase and sqrt((2l+1)/2).
            # Convert to the provider's real Schmidt, no-CS convention.
            normalization = (-1.0)**m * np.sqrt(2 * np.where(m == 0, 1, 2) / (2 * degree + 1))
            p = basis[0, degree, :degree+1] * normalization[:, None]
            dp = np.multiply(-st, basis[1, degree, :degree+1], out=np.zeros_like(p), where=st != 0)
            dp *= normalization[:, None]
            azimuthal = np.divide(m[:, None] * p, st, out=np.zeros_like(p), where=st != 0)
            poles = st == 0
            if poles.any():
                p[:, poles] = 0
                p[0, poles] = mu[poles]**degree
                dp[:, poles] = 0
                azimuthal[1, poles] = math.sqrt(degree * (degree + 1) / 2) * mu[poles]**(degree + 1)
                dp[1, poles] = azimuthal[1, poles] * mu[poles]
            longitude = self.g[degree, :degree+1, None] * cosine[:degree+1] + self.h[degree, :degree+1, None] * sine[:degree+1]
            dlongitude = -self.g[degree, :degree+1, None] * sine[:degree+1] + self.h[degree, :degree+1, None] * cosine[:degree+1]
            # Independently impose Psi(Rss)=0 and Br(1)=Y_lm on a*r^l+b*r^-l-1.
            a = -1 / (degree + (degree + 1) * self.r_ss**(2 * degree + 1))
            b = -a * self.r_ss**(2 * degree + 1)
            radial = -degree * a * r**(degree - 1) + (degree + 1) * b * r**(-degree - 2)
            transverse = -(a * r**(degree - 1) + b * r**(-degree - 2))
            br += radial * np.sum(p * longitude, axis=0)
            bt += transverse * np.sum(dp * longitude, axis=0)
            bp += transverse * np.sum(azimuthal * dlongitude, axis=0)
        cp, sp = np.cos(phi), np.sin(phi)
        return np.column_stack((st * cp * br + mu * cp * bt - sp * bp,
                                st * sp * br + mu * sp * bt + cp * bp,
                                mu * br - st * bt))


def degree_diagnostic():
    header, coefficients, points, starts, counts, labels, epoch = load_reference()
    rss = float(header["RADSS"])
    indices = np.unique(np.concatenate([
        start + np.linspace(0, count - 2, min(5, count - 1), dtype=int)
        for start, count in zip(starts, counts)
    ]))
    midpoints = (points[indices] + points[indices+1]) / 2
    tangent = points[indices+1] - points[indices]
    tangent /= np.linalg.norm(tangent, axis=1)[:, None]
    radii = np.linalg.norm(midpoints, axis=1)
    angular, agreement = {}, {}
    for degree in (15, 30, 64, 90):
        independent = IndependentScipyPFSS(coefficients, degree, rss)
        before = time.perf_counter()
        values = np.column_stack(independent.evaluate_cartesian_batch(*midpoints.T))
        elapsed = time.perf_counter() - before
        norms = np.linalg.norm(values, axis=1)
        if np.any(norms <= 1e-12) or not np.isfinite(values).all():
            raise ValueError("Invalid or weak comparison field; no samples excluded")
        errors = np.rad2deg(np.arccos(np.clip(np.abs(np.sum(values * tangent, axis=1) / norms), 0, 1)))
        angular[str(degree)] = {
            "all": _stats(errors), "radius_lt_1_2": _stats(errors[radii < 1.2]),
            "radius_ge_1_2": _stats(errors[radii >= 1.2]), "evaluation_seconds": elapsed,
        }
        if degree <= 64:
            production = PFSSField(*coefficients[:, :degree+1, :degree+1], degree, rss)
            before = time.perf_counter()
            actual = np.column_stack(production.evaluate_cartesian_batch(*midpoints.T))
            agreement[str(degree)] = {
                "max_relative_vector_error": float(np.max(np.linalg.norm(actual - values, axis=1) / norms)),
                "production_evaluation_seconds": time.perf_counter() - before,
            }
        print(json.dumps({"degree": degree, **angular[str(degree)], "agreement": agreement.get(str(degree))}), flush=True)
    before = time.perf_counter()
    traced = trace_field_batch(independent, points[starts], max_steps=600, step_size=.01)
    elapsed = time.perf_counter() - before
    ref_open = labels != 0
    pred_open, pred_closed = traced.states == "open", traced.states == "closed"
    determinate = pred_open | pred_closed
    topology = {
        "degree": 90, "lines": len(starts), "reference_open": int(ref_open.sum()),
        "reference_closed": int((~ref_open).sum()), "determinate_fraction": float(np.mean(determinate)),
        "open_recall": float(np.mean(pred_open[ref_open])),
        "closed_recall": float(np.mean(pred_closed[~ref_open])),
        "confusion": {"open_as_closed": int(np.sum(ref_open & pred_closed)),
                      "closed_as_open": int(np.sum(~ref_open & pred_open))},
        "indeterminate": int((~determinate).sum()), "trace_seconds": elapsed,
        "max_steps": 600, "step_size_solar_radii": .01,
        "field_evaluations": independent.evaluations - 1,
        "evaluated_positions": independent.evaluated_points - len(midpoints),
    }
    topology["balanced_accuracy"] = (topology["open_recall"] + topology["closed_recall"]) / 2
    both_open = ref_open & pred_open
    provider_end = points[starts[both_open] + counts[both_open] - 1]
    actual_end = traced.endpoints[both_open]
    cosine = np.sum(provider_end * actual_end, axis=1) / (np.linalg.norm(provider_end, axis=1) * np.linalg.norm(actual_end, axis=1))
    topology["open_endpoint_error"] = _stats(np.rad2deg(np.arccos(np.clip(cosine, -1, 1))))
    passed = (angular["90"]["all"]["median_deg"] <= BUDGET["tangent_median_deg"]
              and angular["90"]["all"]["p90_deg"] <= BUDGET["tangent_p90_deg"]
              and topology["balanced_accuracy"] >= BUDGET["balanced_topology_accuracy"]
              and topology["determinate_fraction"] >= BUDGET["determinate_fraction"])
    return {
        "schema": "solar-independent-degree-diagnostic-v1", "input_map": header["FILELIST"],
        "fits_sha256": FITS_SHA, "lines_sha256": LINES_SHA, "source_surface_radii": rss,
        "provider_degree": 90, "provider_line_epoch_seconds": epoch, "tangent_samples": len(indices),
        "frame": "provider-native Cartesian; no fitted angles, signs, or amplitudes",
        "tangent": angular, "independent_vs_production": agreement, "topology_degree90": topology,
        "accuracy_budget": BUDGET, "degree90_diagnostic_accuracy_passed": passed,
        "production_degree": 15, "production_accuracy_budget_passed": False,
        "empirical_speed_calibrated": False, "basis_chunk_size": independent.chunk_size,
        "max_basis_allocation_bytes": 2 * 91 * 181 * independent.chunk_size * 8,
        "process_peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "coverage_limits": ["One GONG-Z epoch; no production degree change.",
                            "Runtime latency must include decomposition, line tracing, and WSA mapping.",
                            "Provider tangents are finite line segments, not exact derivatives.",
                            "This measures PFSS consistency, not observed wind-speed calibration."],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    report = degree_diagnostic()
    options.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps(report, indent=2, allow_nan=False))
