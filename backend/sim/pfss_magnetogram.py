"""Potential Field Source Surface (PFSS) magnetogram solver.

Implements the Altschuler-Newkirk (1969) PFSS model:
  - Ingests GONG synoptic magnetograms (FITS) or generates synthetic ones
  - Decomposes Br(θ, φ) into spherical harmonics up to ℓ_max
  - Solves the potential field between photosphere (r=R☉) and source surface (r=2.5 R☉)
  - Traces field lines via RK4 integration, classifying open vs closed topology

References:
  Altschuler & Newkirk (1969), Solar Physics 9, 131
  Schatten, Wilcox & Ness (1969), Solar Physics 6, 442
"""

from __future__ import annotations

import io
import math
import struct
import threading
import time
import urllib.request
from collections import OrderedDict
from typing import Any

import numpy as np

from .magnetogram_grid import MagnetogramGrid, equal_area_sine_latitude_grid
from .pfss_tracing import safe_norm, trace_field, trace_field_batch
from .spherical_harmonics import (
    HARMONIC_CONVENTION_VERSION,
    schmidt_azimuthal_factor,
    schmidt_legendre,
    schmidt_legendre_with_theta_derivative,
)

# ─── Physical Constants ────────────────────────────────────────────────────────

SOURCE_SURFACE_RADII = 2.5        # Standard PFSS source surface
CARRINGTON_EPOCH_JD = 2398167.4   # JD of Carrington rotation 1 start (1853-11-09)
CARRINGTON_PERIOD_DAYS = 27.2753  # Sidereal Carrington rotation period
GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))  # For Fibonacci spiral seeding

# GONG synoptic magnetogram archive URL pattern
# bqs = "quick synoptic" maps (updated daily, sine-latitude grid)
GONG_SYNOPTIC_BASE = "https://gong.nso.edu/data/magmap/QR/bqs/"


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


# ─── Carrington Rotation ───────────────────────────────────────────────────────

def carrington_rotation_number(jd: float) -> int:
    """Compute the Carrington rotation number for a given Julian Date."""
    return int((float(jd) - CARRINGTON_EPOCH_JD) / CARRINGTON_PERIOD_DAYS) + 1


def carrington_rotation_jd_range(cr: int) -> tuple[float, float]:
    """Return (start_jd, end_jd) for a given Carrington rotation number."""
    start = CARRINGTON_EPOCH_JD + (cr - 1) * CARRINGTON_PERIOD_DAYS
    return start, start + CARRINGTON_PERIOD_DAYS


# ─── Minimal FITS Reader (numpy-only) ─────────────────────────────────────────

def _parse_fits_primary_image(data: bytes) -> np.ndarray | None:
    """Parse a simple FITS file and extract the primary HDU 2D image.

    Only handles the minimal subset needed for GONG synoptic maps:
    single-extension, 2D float/int images.  No astropy needed.
    """
    if len(data) < 2880 or data[:6] != b"SIMPLE":
        return None

    # Parse header blocks (2880-byte records)
    header: dict[str, str] = {}
    offset = 0
    while offset < len(data):
        block = data[offset:offset + 2880]
        if len(block) < 2880:
            break
        offset += 2880
        for i in range(0, 2880, 80):
            card = block[i:i + 80].decode("ascii", errors="replace")
            key = card[:8].strip()
            if key == "END":
                # Header is complete
                break
            if "=" in card[8:10]:
                val = card[10:].split("/")[0].strip().strip("'").strip()
                header[key] = val
        if "END" in [block[i:i + 80].decode("ascii", errors="replace")[:8].strip()
                     for i in range(0, 2880, 80)]:
            break

    try:
        naxis = int(header.get("NAXIS", "0"))
        bitpix = int(header.get("BITPIX", "0"))
        if naxis < 2:
            return None
        naxis1 = int(header.get("NAXIS1", "0"))  # columns (longitude)
        naxis2 = int(header.get("NAXIS2", "0"))  # rows (latitude)
        if naxis1 < 10 or naxis2 < 10:
            return None
    except (ValueError, KeyError):
        return None

    # Determine numpy dtype from BITPIX
    dtype_map = {
        8: np.uint8,
        16: np.int16,
        32: np.int32,
        -32: np.float32,
        -64: np.float64,
    }
    dtype = dtype_map.get(bitpix)
    if dtype is None:
        return None

    nbytes = naxis1 * naxis2 * abs(bitpix) // 8
    if offset + nbytes > len(data):
        return None

    # FITS is big-endian
    arr = np.frombuffer(data[offset:offset + nbytes], dtype=dtype.newbyteorder(">"))
    arr = arr.reshape((naxis2, naxis1)).astype(np.float64)

    # Apply BSCALE and BZERO if present
    bscale = float(header.get("BSCALE", "1.0"))
    bzero = float(header.get("BZERO", "0.0"))
    if bscale != 1.0 or bzero != 0.0:
        arr = arr * bscale + bzero

    return arr


# ─── GONG Data Fetching ───────────────────────────────────────────────────────

def fetch_gong_synoptic_map(cr: int, timeout_s: float = 6.0) -> np.ndarray | None:
    """Fetch a GONG quick-reduce synoptic magnetogram for a Carrington rotation.

    Returns a 2D numpy array of Br (Gauss) on a sine-latitude × longitude grid,
    or None if the data is unavailable.
    """
    # Compute approximate date for this CR to build the archive path
    cr_start_jd = CARRINGTON_EPOCH_JD + (cr - 1) * CARRINGTON_PERIOD_DAYS
    # Convert JD to calendar date for path construction
    unix_s = (cr_start_jd - 2_440_587.5) * 86_400.0
    import datetime as dt
    date = dt.datetime.fromtimestamp(unix_s, tz=dt.timezone.utc)
    yyyymm = date.strftime("%Y%m")

    # GONG bqs directory contains files named like:
    # mrbqs260321t2354c2291_000.fits.gz (or similar patterns)
    # We need to list the directory to find the right file for this CR.
    # Simpler approach: try the GONG magnetogram synoptic fits URL patterns.
    # These are available at:
    # https://gong.nso.edu/data/magmap/QR/bqs/YYYYMM/
    dir_url = f"{GONG_SYNOPTIC_BASE}{yyyymm}/"

    try:
        req = urllib.request.Request(dir_url, method="GET")
        req.add_header("User-Agent", "SolarSim/1.0")
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            listing = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None

    # Parse directory listing for FITS files matching this CR
    import re
    # Look for files with the CR number in the filename
    cr_str = str(cr)
    fits_pattern = re.compile(rf'href="([^"]*c{cr_str}[^"]*\.fits(?:\.gz)?)"', re.IGNORECASE)
    matches = fits_pattern.findall(listing)

    if not matches:
        # Try any FITS file in the directory (latest available)
        fits_any = re.compile(r'href="([^"]*mrbqs[^"]*\.fits(?:\.gz)?)"', re.IGNORECASE)
        matches = fits_any.findall(listing)

    if not matches:
        return None

    # Take the last (most recent) file
    fits_filename = matches[-1]
    fits_url = f"{dir_url}{fits_filename}"

    try:
        req = urllib.request.Request(fits_url, method="GET")
        req.add_header("User-Agent", "SolarSim/1.0")
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            fits_data = resp.read()
    except Exception:
        return None

    # Decompress if gzipped
    if fits_filename.endswith(".gz"):
        import gzip
        try:
            fits_data = gzip.decompress(fits_data)
        except Exception:
            return None

    return _parse_fits_primary_image(fits_data)


# ─── Synthetic Magnetogram ────────────────────────────────────────────────────

def synthetic_magnetogram(
    activity: float,
    jd: float,
    n_lat: int = 180,
    n_lon: int = 360,
    *,
    grid: MagnetogramGrid | None = None,
) -> np.ndarray:
    """Generate a synthetic photospheric Br map from activity index.

    Produces a dipole + quadrupole + octupole field with activity-dependent
    amplitudes, plus noise-seeded active regions at butterfly-law latitudes.
    Defaults to equal-area sine-latitude centers. An explicit grid supplies
    both coordinates and dimensions, overriding n_lat and n_lon.
    """
    activity = _clamp(float(activity), 0.0, 1.0)
    if grid is None:
        grid = equal_area_sine_latitude_grid(n_lat, n_lon)
    theta = np.arccos(grid.mu)
    phi = grid.phi_rad
    theta_grid, phi_grid = np.meshgrid(theta, phi, indexing="ij")
    cos_theta = np.cos(theta_grid)
    sin_theta = np.sin(theta_grid)

    # Dipole: g_1^0 (dominant at solar minimum)
    g10 = 5.0 * (1.0 - activity * 0.6)  # Gauss, weakens at solar max
    br = g10 * cos_theta

    # Dipole tilt: g_1^1 (tilted component, increases at solar max)
    tilt_angle = 0.2 * activity  # ~12° at solar max
    g11 = g10 * math.sin(tilt_angle)
    br += g11 * sin_theta * np.cos(phi_grid)

    # Quadrupole: g_2^0
    g20 = 2.5 * activity
    br += g20 * (3.0 * cos_theta**2 - 1.0) * 0.5

    # Octupole: g_3^0
    g30 = 1.5 * activity**2
    br += g30 * (5.0 * cos_theta**3 - 3.0 * cos_theta) * 0.5

    # Active regions: bipolar pairs at butterfly-diagram latitudes
    rng = np.random.RandomState(int(jd * 100) % 99991)
    n_regions = int(2 + activity * 14)
    for _ in range(n_regions):
        # Spörer's law: latitudes ~5-35° (lower at higher activity)
        lat_deg = rng.uniform(5, 35 - 15 * activity) * (1 if rng.random() > 0.5 else -1)
        lon_deg = rng.uniform(0, 360)
        lat_rad = math.radians(lat_deg)
        lon_rad = math.radians(lon_deg)
        strength = rng.uniform(20, 100) * activity  # Gauss
        width = math.radians(rng.uniform(5, 15))
        separation = math.radians(rng.uniform(3, 8))

        # Positive spot
        d_pos = np.arccos(
            _clamp_arr(
                np.sin(lat_rad + separation / 2) * np.sin(np.pi / 2 - theta_grid) +
                np.cos(lat_rad + separation / 2) * np.cos(np.pi / 2 - theta_grid) *
                np.cos(phi_grid - lon_rad),
                -1.0, 1.0
            )
        )
        br += strength * np.exp(-(d_pos / width)**2)

        # Negative spot
        d_neg = np.arccos(
            _clamp_arr(
                np.sin(lat_rad - separation / 2) * np.sin(np.pi / 2 - theta_grid) +
                np.cos(lat_rad - separation / 2) * np.cos(np.pi / 2 - theta_grid) *
                np.cos(phi_grid - (lon_rad + separation)),
                -1.0, 1.0
            )
        )
        br -= strength * np.exp(-(d_neg / width)**2)

    return br


def _clamp_arr(arr: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip(arr, lo, hi)


# ─── Spherical Harmonic Decomposition ─────────────────────────────────────────

def _associated_legendre(lmax: int, cos_theta: np.ndarray) -> dict[tuple[int, int], np.ndarray]:
    """Legacy delegate for the shared Schmidt quasi-normalized basis."""
    return schmidt_legendre(lmax, cos_theta)


def decompose_spherical_harmonics(
    br_map: np.ndarray,
    lmax: int = 15,
    *,
    grid: MagnetogramGrid,
    condition_limit: float = 1e6,
) -> tuple[np.ndarray, np.ndarray]:
    """Fit real Schmidt harmonics on explicitly supplied pixel centers.

    Uniform-longitude Fourier amplitudes are fitted in latitude by area-
    weighted least squares (NumPy SVD, no normal equations). Each design's
    2-norm condition number must be finite and <= condition_limit. The m=0
    fit includes the monopole; flux-balance policy is outside this projection.
    """
    br_map = grid.validate_map(br_map)
    plm = schmidt_legendre(lmax, grid.mu)
    n_lat, n_lon = br_map.shape
    if n_lat < lmax + 1 or n_lon < 2 * lmax + 1:
        raise ValueError("grid undersamples the requested harmonic degree")
    if not np.isfinite(condition_limit) or condition_limit < 1:
        raise ValueError("condition_limit must be finite and >= 1")
    g_lm = np.zeros((lmax + 1, lmax + 1))
    h_lm = np.zeros((lmax + 1, lmax + 1))
    sqrt_weight = np.sqrt(grid.area_weights)
    for m in range(lmax + 1):
        design = np.column_stack([plm[(l, m)] for l in range(m, lmax + 1)])
        weighted = design * sqrt_weight[:, None]
        condition = np.linalg.cond(weighted, p=2)
        if not np.isfinite(condition) or condition > condition_limit:
            raise ValueError(f"latitude design for m={m} has condition {condition:g} above limit {condition_limit:g}")
        # Factor 2 extracts real Fourier amplitudes for m>0; it is not an
        # extra Schmidt normalization applied to the recovered coefficients.
        factor = (1 if m == 0 else 2) / n_lon
        rhs = np.column_stack((br_map @ np.cos(m * grid.phi_rad),
                               br_map @ np.sin(m * grid.phi_rad))) * factor
        coefficients, _, rank, _ = np.linalg.lstsq(weighted, rhs * sqrt_weight[:, None], rcond=None)
        if rank != design.shape[1]:
            raise ValueError(f"latitude design for m={m} is rank deficient")
        g_lm[m:, m], h_lm[m:, m] = coefficients.T

    return g_lm, h_lm


# ─── PFSS Solver (Altschuler-Newkirk 1969) ────────────────────────────────────

def pfss_solve(
    g_lm: np.ndarray,
    h_lm: np.ndarray,
    lmax: int = 15,
    r_ss: float = SOURCE_SURFACE_RADII,
) -> "PFSSField":
    """Build a PFSS magnetic field evaluator from spherical harmonic coefficients.

    The Altschuler-Newkirk solution gives the potential field between
    r = 1 R☉ (photosphere) and r = r_ss (source surface, default 2.5 R☉),
    with the source-surface boundary condition Btheta = Bphi = 0 at r_ss.
    The radial field remains nonzero in general, allowing radial magnetic
    flux through the source surface. At r=1, Br reconstructs the supplied
    coefficients for degrees 1..lmax (the monopole is excluded).
    """
    return PFSSField(g_lm, h_lm, min(lmax, g_lm.shape[0] - 1), r_ss)


class PFSSField:
    """Evaluates the PFSS potential magnetic field at any point (r, θ, φ)."""

    def __init__(self, g_lm: np.ndarray, h_lm: np.ndarray, lmax: int, r_ss: float):
        self.g = g_lm.copy()
        self.h = h_lm.copy()
        self.lmax = lmax
        self.r_ss = r_ss

    def evaluate(self, r: float, theta: float, phi: float) -> tuple[float, float, float]:
        """Evaluate B(r, θ, φ) → (Br, Bθ, Bφ) in spherical coordinates.

        Units match the input coefficient units (typically Gauss for g_lm).
        """
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)

        # Compute Legendre functions at this colatitude
        plm_vals: dict[tuple[int, int], float] = {}
        dplm_vals: dict[tuple[int, int], float] = {}
        self._legendre_at_point(cos_t, sin_t, plm_vals, dplm_vals)

        br_val = 0.0
        bt_val = 0.0
        bp_val = 0.0

        for l in range(1, self.lmax + 1):
            # B=-grad(Psi), with each unit-coefficient potential mode
            # Psi_l = [r^(-l-1) - r^l/rss^(2l+1)] / D_l * Y_lm,
            # D_l = l+1 + l/rss^(2l+1). Thus Psi_l(rss)=0,
            # Br(1)=Y_lm, and Btheta(rss)=Bphi(rss)=0.
            # Br(rss)=(2l+1)*rss^(-l-2)/D_l * Y_lm is generally nonzero.
            rss = self.r_ss

            r_ratio = r  # r in solar radii, photosphere = 1
            rss_pow = (1.0 / rss) ** (2 * l + 1)

            # c_l: radial decay factor for Br
            # At r=1: c_l = (l+1+l*rss^{-(2l+1)}) / (l+1+l*rss^{-(2l+1)}) = 1 — correct
            denominator = (l + 1) + l * rss_pow
            if abs(denominator) < 1e-30:
                continue

            # Br coefficient
            cl_br = ((l + 1) * r_ratio ** (-(l + 2)) + l * rss_pow * r_ratio ** (l - 1)) / denominator
            # Btheta coefficient
            cl_bt = -(r_ratio ** (-(l + 2)) - rss_pow * r_ratio ** (l - 1)) / denominator
            # Bphi coefficient is similar to Btheta
            cl_bp = cl_bt  # Same radial factor for Bφ

            for m in range(l + 1):
                plm = plm_vals.get((l, m), 0.0)
                dplm = dplm_vals.get((l, m), 0.0)

                cos_mp = math.cos(m * phi)
                sin_mp = math.sin(m * phi)
                glm = self.g[l, m] if l < self.g.shape[0] and m < self.g.shape[1] else 0.0
                hlm = self.h[l, m] if l < self.h.shape[0] and m < self.h.shape[1] else 0.0

                gh_cos = glm * cos_mp + hlm * sin_mp
                gh_sin = -glm * sin_mp + hlm * cos_mp

                br_val += cl_br * plm * gh_cos
                bt_val += cl_bt * dplm * gh_cos
                bp_val += cl_bp * float(schmidt_azimuthal_factor(m, cos_t, plm, dplm)) * gh_sin

        return (br_val, bt_val, bp_val)

    def evaluate_cartesian(self, x: float, y: float, z: float) -> tuple[float, float, float]:
        """Evaluate B at Cartesian position (x, y, z) in solar radii → (Bx, By, Bz)."""
        r = math.sqrt(x * x + y * y + z * z)
        if r < 0.01:
            return (0.0, 0.0, 0.0)
        theta = math.acos(_clamp(z / r, -1.0, 1.0))
        phi = math.atan2(y, x)

        br, bt, bp = self.evaluate(r, theta, phi)

        # Convert spherical → Cartesian
        sin_t = math.sin(theta)
        cos_t = math.cos(theta)
        sin_p = math.sin(phi)
        cos_p = math.cos(phi)

        bx = sin_t * cos_p * br + cos_t * cos_p * bt - sin_p * bp
        by = sin_t * sin_p * br + cos_t * sin_p * bt + cos_p * bp
        bz = cos_t * br - sin_t * bt

        return (bx, by, bz)

    def _legendre_at_point(
        self,
        cos_t: float,
        sin_t: float,
        plm: dict[tuple[int, int], float],
        dplm: dict[tuple[int, int], float],
    ) -> None:
        """Legacy scalar delegate; sin_t is retained only for call compatibility."""
        values, derivatives = schmidt_legendre_with_theta_derivative(self.lmax, cos_t)
        plm.update({key: float(value) for key, value in values.items()})
        dplm.update({key: float(value) for key, value in derivatives.items()})

    def evaluate_cartesian_batch(self, x: np.ndarray, y: np.ndarray, z: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Evaluate B vectorially at Cartesian positions (x, y, z) in solar radii. Returns (Bx, By, Bz)."""
        r = np.sqrt(x * x + y * y + z * z)
        
        # Avoid division by zero at origin
        r_safe = np.where(r < 0.01, 1.0, r)
        theta = np.arccos(np.clip(z / r_safe, -1.0, 1.0))
        phi = np.arctan2(y, x)
        
        br, bt, bp = self._evaluate_batch(r_safe, theta, phi)
        
        # Zero out origin points
        br = np.where(r < 0.01, 0.0, br)
        bt = np.where(r < 0.01, 0.0, bt)
        bp = np.where(r < 0.01, 0.0, bp)
        
        sin_t = np.sin(theta)
        cos_t = np.cos(theta)
        sin_p = np.sin(phi)
        cos_p = np.cos(phi)
        
        bx = sin_t * cos_p * br + cos_t * cos_p * bt - sin_p * bp
        by = sin_t * sin_p * br + cos_t * sin_p * bt + cos_p * bp
        bz = cos_t * br - sin_t * bt
        
        return bx, by, bz

    def _evaluate_batch(self, r: np.ndarray, theta: np.ndarray, phi: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Vectorized B(r, θ, φ) integration."""
        cos_t = np.cos(theta)
        sin_t = np.sin(theta)
        n_points = len(r)
        
        plm_vals, dplm_vals = self._legendre_batch(cos_t, sin_t)

        br_val = np.zeros(n_points)
        bt_val = np.zeros(n_points)
        bp_val = np.zeros(n_points)
        
        for l in range(1, self.lmax + 1):
            # Same -grad(Psi_l) factors and normalization as evaluate().
            rss_pow = (1.0 / self.r_ss) ** (2 * l + 1)
            denominator = (l + 1) + l * rss_pow
            if abs(denominator) < 1e-30:
                continue

            r_ratio_inv_l2 = r ** (-(l + 2))
            r_ratio_l1 = r ** (l - 1)
            
            cl_br = ((l + 1) * r_ratio_inv_l2 + l * rss_pow * r_ratio_l1) / denominator
            cl_bt = -(r_ratio_inv_l2 - rss_pow * r_ratio_l1) / denominator
            cl_bp = cl_bt

            for m in range(l + 1):
                plm = plm_vals.get((l, m))
                dplm = dplm_vals.get((l, m))
                if plm is None:
                    continue

                cos_mp = np.cos(m * phi)
                sin_mp = np.sin(m * phi)
                
                glm = self.g[l, m] if l < self.g.shape[0] and m < self.g.shape[1] else 0.0
                hlm = self.h[l, m] if l < self.h.shape[0] and m < self.h.shape[1] else 0.0
                
                gh_cos = glm * cos_mp + hlm * sin_mp
                gh_sin = -glm * sin_mp + hlm * cos_mp
                
                br_val += cl_br * plm * gh_cos
                bt_val += cl_bt * dplm * gh_cos
                bp_val += cl_bp * schmidt_azimuthal_factor(m, cos_t, plm, dplm) * gh_sin
                
        return br_val, bt_val, bp_val

    def _legendre_batch(self, cos_t: np.ndarray, sin_t: np.ndarray) -> tuple[dict[tuple[int, int], np.ndarray], dict[tuple[int, int], np.ndarray]]:
        """Legacy batch delegate; sin_t is retained only for call compatibility."""
        return schmidt_legendre_with_theta_derivative(self.lmax, cos_t)


# ─── Field Line Tracer ─────────────────────────────────────────────────────────

def trace_field_lines(
    field: PFSSField,
    n_lines: int = 120,
    max_steps: int = 300,
    step_size: float = 0.02,
    br_map: np.ndarray | None = None,
    *,
    grid: MagnetogramGrid | None = None,
) -> list[dict[str, Any]]:
    """Trace magnetic field lines from the photosphere through the PFSS domain.

    Seeds footpoints using a Fibonacci spiral biased toward high-|Br| regions
    (active regions). Each line is traced outward via RK4 and classified as
    open (reaches source surface), closed (returns to photosphere), or
    indeterminate (no validated boundary crossing).
    """
    lines: list[dict[str, Any]] = []
    safe_n = max(8, min(500, int(n_lines)))

    # Generate seed footpoints
    seeds = _generate_seed_footpoints(safe_n, br_map, grid=grid)

    for idx, (theta_0, phi_0) in enumerate(seeds):
        # Start slightly above photosphere
        r_start = 1.005
        x = r_start * math.sin(theta_0) * math.cos(phi_0)
        y = r_start * math.sin(theta_0) * math.sin(phi_0)
        z = r_start * math.cos(theta_0)

        result = trace_field(field, [x, y, z], max_steps=max_steps, step_size=step_size)
        termination = result.termination
        is_open = {"open": True, "closed": False, "indeterminate": None}[termination.state]
        arc = np.round(result.arc, 4).tolist()

        # Convert footpoint to lat/lon
        fp_lat_deg = round(90.0 - math.degrees(theta_0), 1)
        fp_lon_deg = round(math.degrees(phi_0), 1)

        lines.append({
            "id": f"pfss-{idx:03d}",
            "state": termination.state,
            "is_open": is_open,
            "termination_reason": termination.reason,
            "steps": termination.steps,
            "endpoint": result.endpoint.tolist(),
            "endpoint_field": result.endpoint_field.tolist() if result.endpoint_field is not None else None,
            "endpoint_radius_residual": termination.endpoint_radius_residual,
            "polarity": result.polarity,
            "footpoint_lat_deg": fp_lat_deg,
            "footpoint_lon_deg": fp_lon_deg,
            "arc": arc,
        })

    return lines


def _generate_seed_footpoints(
    n: int,
    br_map: np.ndarray | None = None,
    *,
    grid: MagnetogramGrid | None = None,
) -> list[tuple[float, float]]:
    """Generate n footpoint seeds on the photosphere.

    Uses a Fibonacci spiral for uniform coverage, then biases toward
    high-|Br| regions if a magnetogram is provided.
    """
    if br_map is not None:
        if grid is None:
            raise ValueError("magnetogram seeding requires an explicit grid")
        return _importance_sample_footpoints(n, br_map, grid=grid)

    # Uniform Fibonacci spiral
    seeds: list[tuple[float, float]] = []
    for i in range(n):
        # Fibonacci sphere — uniform area distribution
        cos_theta = 1.0 - 2.0 * (i + 0.5) / n
        theta = math.acos(_clamp(cos_theta, -0.999, 0.999))
        phi = GOLDEN_ANGLE * i
        phi = phi % (2 * math.pi)
        seeds.append((theta, phi))
    return seeds


def _importance_sample_footpoints(
    n: int, br_map: np.ndarray,
    *,
    grid: MagnetogramGrid,
) -> list[tuple[float, float]]:
    """Sample footpoints biased toward high |Br| regions."""
    br_map = grid.validate_map(br_map)
    n_lat, n_lon = br_map.shape
    abs_br = np.abs(br_map)

    # Exact cell areas; equal-area maps need no extra sin(theta) factor.
    weight_map = (abs_br + 0.1) * grid.area_weights[:, None]
    weight_map = weight_map / weight_map.sum()

    flat_weights = weight_map.ravel()
    rng = np.random.RandomState(42)
    indices = rng.choice(len(flat_weights), size=n, replace=True, p=flat_weights)

    seeds: list[tuple[float, float]] = []
    edges = grid.mu_edges
    for idx in indices:
        i_lat = idx // n_lon
        i_lon = idx % n_lon
        mu = edges[i_lat] + rng.uniform() * (edges[i_lat + 1] - edges[i_lat])
        theta = math.acos(mu)
        phi = grid.phi_rad[i_lon] + rng.uniform(-0.5, 0.5) * 2 * np.pi / n_lon
        phi = phi % (2 * np.pi)
        seeds.append((float(theta), float(phi)))

    return seeds


# ─── Wang-Sheeley-Arge (WSA) Solar Wind Speed Model ───────────────────────────

def _wsa_velocity(fs: float, theta_b: float) -> float:
    """Arge et al. (2000, 2003) empirical solar wind speed formula.

    Parameters
    ----------
    fs : float
        Flux tube expansion factor (dimensionless, ≥ 1).
    theta_b : float
        Angular distance (radians) from the open footpoint to the nearest
        coronal hole boundary (closed-field region).

    Returns
    -------
    float
        Predicted solar wind speed in km/s, clamped to [265, 850].
    """
    fs_safe = max(1.0, float(fs))
    tb_safe = max(0.0, float(theta_b))

    # Arge+ (2003) refined calibration:
    #   V = 267.5 + 410 / fs^(2/5) * [1 - 0.8 * exp(-(θ_b / 0.045)^3)]
    boundary_term = 1.0 - 0.8 * math.exp(-(tb_safe / 0.045) ** 3)
    v_sw = 267.5 + 410.0 / (fs_safe ** 0.4) * boundary_term

    return _clamp(v_sw, 265.0, 850.0)


def compute_wsa_velocity_map(
    field: PFSSField,
    br_map: np.ndarray | None = None,
    n_lat: int = 45,
    n_lon: int = 90,
    max_steps: int = 300,
    step_size: float = 0.02,
) -> dict[str, Any]:
    """Compute a 2D WSA solar wind velocity map at the source surface.

    Traces a global grid of field lines from the photosphere, classifies them
    as open or closed, computes the flux tube expansion factor and coronal
    hole boundary distance, then applies the Arge (2003) velocity formula.

    Returns
    -------
    dict with keys:
        - 'velocity_map': 2D array (n_lat, n_lon) of V_sw in km/s at the
          source surface (NaN for closed footpoints).
        - 'open_mask': boolean 2D array, True for open flux footpoints.
        - 'closed_mask', 'indeterminate_mask': independently classified masks.
        - 'trace_states', 'trace_endpoints': topology and full-precision endpoints.
        - 'mean_velocity_kms': mean open-flux velocity.
        - 'fs_map': expansion factor map.
        - 'theta_b_map': boundary distance map (radians).
    """
    r_ss = field.r_ss

    # Build a uniform-in-cos(θ) grid to avoid polar clustering
    cos_theta_arr = np.linspace(1.0 - 1.0 / n_lat, -1.0 + 1.0 / n_lat, n_lat)
    theta_arr = np.arccos(np.clip(cos_theta_arr, -0.999, 0.999))
    phi_arr = np.linspace(0, 2 * np.pi, n_lon, endpoint=False)

    theta_grid, phi_grid = np.meshgrid(theta_arr, phi_arr, indexing="ij")
    
    n_points = n_lat * n_lon
    theta_flat = theta_grid.ravel()
    phi_flat = phi_grid.ravel()

    # Initial footpoints at r=1.005
    r_foot = 1.005
    x0 = r_foot * np.sin(theta_flat) * np.cos(phi_flat)
    y0 = r_foot * np.sin(theta_flat) * np.sin(phi_flat)
    z0 = r_foot * np.cos(theta_flat)

    traces = trace_field_batch(
        field, np.column_stack((x0, y0, z0)),
        max_steps=max_steps, step_size=step_size,
    )
    b_foot = safe_norm(traces.initial_fields)
    px, py, pz = traces.endpoints.T
    trace_states = traces.states.reshape(n_lat, n_lon)
    open_mask_flat = traces.states == "open"
    open_mask = open_mask_flat.reshape(n_lat, n_lon)
    closed_mask = trace_states == "closed"
    indeterminate_mask = trace_states == "indeterminate"
    b_ss = safe_norm(traces.endpoint_fields)

    # Expansion factor
    fs_val = np.full(n_points, 100.0)
    valid_b = b_ss > 1e-15
    fs_val[valid_b] = ((1.0 / r_ss) ** 2) * (b_foot[valid_b] / b_ss[valid_b])
    
    # Only confirmed open flux supplies expansion factors.
    fs_val[~open_mask_flat] = np.nan
    fs_map = fs_val.reshape(n_lat, n_lon)

    # Source surface coordinates
    r_end = np.sqrt(px*px + py*py + pz*pz)
    r_end_safe = np.where(r_end < 0.01, 1.0, r_end)
    
    ss_theta_flat = np.arccos(np.clip(pz / r_end_safe, -1.0, 1.0))
    ss_phi_flat = np.arctan2(py, px) % (2.0 * np.pi)
    
    ss_theta_flat[~open_mask_flat] = np.nan
    ss_phi_flat[~open_mask_flat] = np.nan
    
    ss_theta = ss_theta_flat.reshape(n_lat, n_lon)
    ss_phi = ss_phi_flat.reshape(n_lat, n_lon)

    # ── Compute boundary distance θ_b ────────────────────────────────────
    # For each open footpoint, find the minimum great-circle distance to
    # any closed footpoint on the grid.
    theta_b_map = np.full((n_lat, n_lon), np.nan)

    # Precompute Cartesian unit vectors for all grid points
    grid_x = np.sin(theta_arr[:, None]) * np.cos(phi_arr[None, :])  # (n_lat, n_lon)
    grid_y = np.sin(theta_arr[:, None]) * np.sin(phi_arr[None, :])
    grid_z = np.cos(theta_arr[:, None]) * np.ones((1, n_lon))

    # Extract closed-field points as flat arrays
    closed_indices = np.argwhere(closed_mask)
    if closed_indices.shape[0] > 0:
        cx = grid_x[closed_mask]  # (N_closed,)
        cy = grid_y[closed_mask]
        cz = grid_z[closed_mask]

        # For each open footpoint, compute minimum angular distance
        open_indices = np.argwhere(open_mask)
        for oi in range(open_indices.shape[0]):
            i_lat_o, i_lon_o = open_indices[oi]
            ox = grid_x[i_lat_o, i_lon_o]
            oy = grid_y[i_lat_o, i_lon_o]
            oz = grid_z[i_lat_o, i_lon_o]

            # Great-circle distance via dot product: cos(d) = dot(open, closed)
            dots = np.clip(ox * cx + oy * cy + oz * cz, -1.0, 1.0)
            min_dist = float(np.min(np.arccos(dots)))
            theta_b_map[i_lat_o, i_lon_o] = min_dist
    else:
        # Retain the existing no-closed-neighbour default (Task 5 owns WSA policy).
        theta_b_map[open_mask] = math.pi / 2  # Maximum distance

    # ── Apply WSA velocity formula ────────────────────────────────────────
    velocity_map = np.full((n_lat, n_lon), np.nan)
    for i_lat_v in range(n_lat):
        for i_lon_v in range(n_lon):
            if not open_mask[i_lat_v, i_lon_v]:
                continue
            fs_v = fs_map[i_lat_v, i_lon_v]
            tb_v = theta_b_map[i_lat_v, i_lon_v]
            if np.isfinite(fs_v) and np.isfinite(tb_v):
                velocity_map[i_lat_v, i_lon_v] = _wsa_velocity(fs_v, tb_v)

    # Mean velocity for diagnostics
    valid_v = velocity_map[np.isfinite(velocity_map)]
    mean_v = float(np.mean(valid_v)) if valid_v.size > 0 else 400.0

    return {
        "velocity_map": velocity_map,
        "open_mask": open_mask,
        "closed_mask": closed_mask,
        "indeterminate_mask": indeterminate_mask,
        "trace_states": trace_states,
        "trace_endpoints": traces.endpoints.reshape(n_lat, n_lon, 3),
        "trace_termination_reasons": traces.reasons.reshape(n_lat, n_lon),
        "trace_steps": traces.steps.reshape(n_lat, n_lon),
        "trace_endpoint_radius_residuals": traces.endpoint_radius_residuals.reshape(n_lat, n_lon),
        "fs_map": fs_map,
        "theta_b_map": theta_b_map,
        "ss_theta": ss_theta,
        "ss_phi": ss_phi,
        "mean_velocity_kms": round(mean_v, 1),
        "grid_theta": theta_arr,
        "grid_phi": phi_arr,
    }


def wsa_velocity_at_source_surface(
    wsa_result: dict[str, Any],
    ss_lat_rad: float,
    ss_lon_rad: float,
) -> float:
    """Look up the WSA wind speed at a given source-surface coordinate.

    Uses nearest-neighbour lookup on the traced WSA grid.
    If no open flux is nearby, returns a slow-wind fallback (380 km/s).
    """
    ss_theta_target = math.pi / 2.0 - ss_lat_rad  # colatitude
    ss_phi_target = ss_lon_rad % (2.0 * math.pi)

    ss_theta_arr = wsa_result.get("ss_theta")
    ss_phi_arr = wsa_result.get("ss_phi")
    velocity_map = wsa_result.get("velocity_map")
    open_mask = wsa_result.get("open_mask")

    if ss_theta_arr is None or velocity_map is None or open_mask is None:
        return 380.0

    # Convert source surface trace endpoints to Cartesian for distance calc
    target_x = math.sin(ss_theta_target) * math.cos(ss_phi_target)
    target_y = math.sin(ss_theta_target) * math.sin(ss_phi_target)
    target_z = math.cos(ss_theta_target)

    # Gather all open footpoints that have valid source surface coordinates
    n_lat, n_lon = open_mask.shape
    best_dist = 999.0
    best_v = 380.0

    for il in range(n_lat):
        for jl in range(n_lon):
            if not open_mask[il, jl]:
                continue
            s_t = ss_theta_arr[il, jl]
            s_p = ss_phi_arr[il, jl]
            v_val = velocity_map[il, jl]
            if not (np.isfinite(s_t) and np.isfinite(s_p) and np.isfinite(v_val)):
                continue
            sx = math.sin(s_t) * math.cos(s_p)
            sy = math.sin(s_t) * math.sin(s_p)
            sz = math.cos(s_t)
            dot = _clamp(target_x * sx + target_y * sy + target_z * sz, -1.0, 1.0)
            dist = math.acos(dot)
            if dist < best_dist:
                best_dist = dist
                best_v = float(v_val)

    return best_v


# ─── PFSS Cache ────────────────────────────────────────────────────────────────

class PFSSCache:
    """Thread-safe, bounded cache for fully identified PFSS solutions.

    Carrington rotation alone is not a sufficient cache identity.  A synthetic
    fallback also depends on the requested epoch and activity, while the public
    payload depends on the requested trace count and harmonic degree.  The GONG
    timeout can change whether a request uses observed or synthetic input, so it
    is part of the identity as well.

    Identical cache misses share one computation.  Computation remains outside
    the cache lock so unrelated keys can progress independently.
    """

    def __init__(self, max_entries: int = 3):
        self._lock = threading.Lock()
        self._cache: OrderedDict[
            tuple[int, float, float, int, int, float], dict[str, Any]
        ] = OrderedDict()
        self._inflight: dict[
            tuple[int, float, float, int, int, float], dict[str, Any]
        ] = {}
        self._max_entries = max(1, int(max_entries))

    @staticmethod
    def _normalize_key(
        jd: float,
        activity: float,
        n_lines: int,
        lmax: int,
        gong_timeout_s: float,
    ) -> tuple[int, float, float, int, int, float]:
        try:
            normalized_jd = float(jd)
        except (TypeError, ValueError) as exc:
            raise ValueError("jd must be finite") from exc
        if not math.isfinite(normalized_jd):
            raise ValueError("jd must be finite")

        try:
            normalized_activity = float(activity)
        except (TypeError, ValueError) as exc:
            raise ValueError("activity must be finite") from exc
        if not math.isfinite(normalized_activity):
            raise ValueError("activity must be finite")
        normalized_activity = _clamp(normalized_activity, 0.0, 1.0)

        try:
            requested_lines = int(n_lines)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("n_lines must be an integer") from exc
        # trace_field_lines applies these same effective bounds.  Canonicalizing
        # here prevents equivalent requests from occupying distinct cache slots.
        normalized_lines = max(8, min(500, requested_lines))

        try:
            requested_lmax = int(lmax)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("lmax must be a positive integer") from exc
        if isinstance(lmax, float) and not lmax.is_integer():
            raise ValueError("lmax must be a positive integer")
        if requested_lmax < 1:
            raise ValueError("lmax must be a positive integer")
        normalized_lmax = min(requested_lmax, 15)

        try:
            normalized_timeout = float(gong_timeout_s)
        except (TypeError, ValueError) as exc:
            raise ValueError("gong_timeout_s must be finite and positive") from exc
        if not math.isfinite(normalized_timeout) or normalized_timeout <= 0.0:
            raise ValueError("gong_timeout_s must be finite and positive")

        cr = carrington_rotation_number(normalized_jd)
        return (
            cr,
            normalized_jd,
            normalized_activity,
            normalized_lines,
            normalized_lmax,
            normalized_timeout,
        )

    def get_or_compute(
        self,
        jd: float,
        activity: float,
        n_lines: int = 120,
        lmax: int = 15,
        gong_timeout_s: float = 6.0,
    ) -> dict[str, Any]:
        """Get cached PFSS result or compute fresh."""
        key = self._normalize_key(jd, activity, n_lines, lmax, gong_timeout_s)
        cr, normalized_jd, normalized_activity, normalized_lines, normalized_lmax, normalized_timeout = key

        with self._lock:
            cached = self._cache.get(key)
            if cached is not None:
                self._cache.move_to_end(key)
                return cached

            state = self._inflight.get(key)
            if state is None:
                state = {
                    "event": threading.Event(),
                    "value": None,
                    "error": None,
                }
                self._inflight[key] = state
                is_leader = True
            else:
                is_leader = False

        if not is_leader:
            state["event"].wait()
            if state["error"] is not None:
                raise state["error"]
            return state["value"]

        try:
            result = self._compute(
                cr,
                normalized_activity,
                normalized_jd,
                normalized_lines,
                normalized_lmax,
                normalized_timeout,
            )
        except BaseException as exc:
            with self._lock:
                state["error"] = exc
                self._inflight.pop(key, None)
                state["event"].set()
            raise

        with self._lock:
            self._cache[key] = result
            self._cache.move_to_end(key)
            while len(self._cache) > self._max_entries:
                self._cache.popitem(last=False)
            state["value"] = result
            self._inflight.pop(key, None)
            state["event"].set()

        return result

    def _compute(
        self,
        cr: int,
        activity: float,
        jd: float,
        n_lines: int,
        lmax: int,
        gong_timeout_s: float,
    ) -> dict[str, Any]:
        """Compute PFSS field lines for a given Carrington rotation."""
        source = "synthetic"
        # The legacy FITS reader drops WCS and row orientation. Do not infer
        # orientation from its raw array or advertise it as observed input.
        # A later validated FITS/WCS provider will re-enable observed ingestion.
        fallback_reason = "legacy_gong_grid_orientation_unvalidated"
        grid = equal_area_sine_latitude_grid(180, 360)
        br_map = synthetic_magnetogram(activity, jd, grid=grid)

        # Decompose into spherical harmonics
        effective_lmax = min(lmax, 15)
        g_lm, h_lm = decompose_spherical_harmonics(br_map, lmax=effective_lmax, grid=grid)

        # Solve PFSS
        field = pfss_solve(g_lm, h_lm, lmax=effective_lmax)

        # Trace field lines (for visualization)
        lines = trace_field_lines(field, n_lines=n_lines, br_map=br_map, grid=grid)

        # Compute WSA solar wind velocity map
        wsa_grid_lat = 36  # coarser for speed
        wsa_grid_lon = 72
        wsa_result = compute_wsa_velocity_map(
            field, br_map=br_map,
            n_lat=wsa_grid_lat, n_lon=wsa_grid_lon,
        )

        open_count = sum(1 for line in lines if line["state"] == "open")
        closed_count = sum(1 for line in lines if line["state"] == "closed")
        indeterminate_count = sum(1 for line in lines if line["state"] == "indeterminate")

        return {
            "source": source,
            "fallback_reason": fallback_reason,
            "grid_convention": grid.convention,
            "harmonic_convention": HARMONIC_CONVENTION_VERSION,
            "carrington_rotation": cr,
            "source_surface_radii": SOURCE_SURFACE_RADII,
            "lmax": effective_lmax,
            "line_count": len(lines),
            "open_line_count": open_count,
            "closed_line_count": closed_count,
            "indeterminate_line_count": indeterminate_count,
            "lines": lines,
            "wsa": {
                "mean_velocity_kms": wsa_result["mean_velocity_kms"],
                "grid_resolution": f"{wsa_grid_lat}x{wsa_grid_lon}",
                "model": "arge_2003",
            },
            "_wsa_result": wsa_result,  # internal, not serialized to JSON
        }
