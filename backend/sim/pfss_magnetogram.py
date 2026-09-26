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
from .solar_time import (
    CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS,
    CARRINGTON_ROTATION_1_EPOCH_JD_TT,
    mean_carrington_rotation_range_jd_tdb,
    mean_carrington_rotation_number_from_jd_tdb,
)
from .spherical_harmonics import (
    HARMONIC_CONVENTION_VERSION,
    schmidt_azimuthal_factor,
    schmidt_legendre,
    schmidt_legendre_with_theta_derivative,
)

# ─── Physical Constants ────────────────────────────────────────────────────────

SOURCE_SURFACE_RADII = 2.5        # Standard PFSS source surface
# Compatibility aliases. New code should import the scale/period-explicit names
# from ``solar_time``.
CARRINGTON_EPOCH_JD = CARRINGTON_ROTATION_1_EPOCH_JD_TT
CARRINGTON_PERIOD_DAYS = CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS
GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))  # For Fibonacci spiral seeding

WSA_MODEL_VERSION = "wsa_inspired_v1"
WSA_CALIBRATION_STATUS = "unvalidated"
WSA_LOOKUP_MAX_CELL_DIAGONALS = 2.0
WSA_RADIAL_FIELD_FLOOR = 1e-15

# GONG synoptic magnetogram archive URL pattern
# bqs = "quick synoptic" maps (updated daily, sine-latitude grid)
GONG_SYNOPTIC_BASE = "https://gong.nso.edu/data/magmap/QR/bqs/"


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


# ─── Carrington Rotation ───────────────────────────────────────────────────────

def carrington_rotation_number(jd: float) -> int:
    """Return a mean Carrington rotation search hint for an explicit JDTDB."""

    return mean_carrington_rotation_number_from_jd_tdb(jd)


def carrington_rotation_jd_range(cr: int) -> tuple[float, float]:
    """Return mean ``(start_jd_tdb, end_jd_tdb)`` compatibility boundaries."""

    return mean_carrington_rotation_range_jd_tdb(cr)


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


# ─── Versioned WSA-inspired solar-wind mapping ────────────────────────────────

def _wsa_velocity(fs: float, theta_b: float) -> float:
    """Evaluate the repository's unvalidated ``wsa_inspired_v1`` relation.

    This is deliberately not labelled as the operational WSA model.  It is a
    bounded visualization relation using an expansion factor and a coronal-hole
    boundary distance.  The exact constants and limitations are recorded in
    ``docs/adr/0004-wsa-inspired-semantics.md``.
    """
    try:
        fs_value = float(fs)
        theta_value = float(theta_b)
    except (TypeError, ValueError) as exc:
        raise ValueError("WSA-inspired inputs must be numeric") from exc
    if not math.isfinite(fs_value) or fs_value <= 0:
        raise ValueError("expansion factor must be finite and positive")
    if not math.isfinite(theta_value) or not 0 <= theta_value <= math.pi:
        raise ValueError("boundary distance must be finite and in [0, pi]")

    # Versioned repository relation (angles in radians, output in km/s):
    #   V = 267.5 + 410 / max(1, fs)^0.4
    #                  * [1 - 0.8 exp(-(theta_b / 0.045)^3)]
    fs_for_relation = max(1.0, fs_value)
    boundary_term = 1.0 - 0.8 * math.exp(-(theta_value / 0.045) ** 3)
    v_sw = 267.5 + 410.0 / (fs_for_relation ** 0.4) * boundary_term
    return _clamp(v_sw, 265.0, 850.0)


def _unit_vectors(theta: np.ndarray, phi: np.ndarray) -> np.ndarray:
    sin_theta = np.sin(theta)
    return np.column_stack((
        sin_theta * np.cos(phi),
        sin_theta * np.sin(phi),
        np.cos(theta),
    ))


def _great_circle_distances(target: np.ndarray, candidates: np.ndarray) -> np.ndarray:
    """Stable angular distances from one unit vector to many unit vectors."""
    dots = np.clip(candidates @ target, -1.0, 1.0)
    cross_norms = safe_norm(np.cross(candidates, target))
    return np.arctan2(cross_norms, dots)


def _open_closed_boundary_midpoints(
    states: np.ndarray,
    phi_arr: np.ndarray,
) -> np.ndarray:
    """Return edge midpoints that separate confirmed open and closed cells."""
    n_lat, n_lon = states.shape
    points: list[tuple[float, float]] = []

    def is_boundary(left: object, right: object) -> bool:
        return {str(left), str(right)} == {"open", "closed"}

    # Latitude edges lie at the exact equal-area mu boundaries.
    for i_lat in range(n_lat - 1):
        theta_edge = math.acos(_clamp(1.0 - 2.0 * (i_lat + 1) / n_lat, -1.0, 1.0))
        for i_lon in range(n_lon):
            if is_boundary(states[i_lat, i_lon], states[i_lat + 1, i_lon]):
                points.append((theta_edge, float(phi_arr[i_lon])))

    # Longitude is periodic.  The midpoint after the final cell wraps to zero.
    delta_phi = 2.0 * math.pi / n_lon
    for i_lat in range(n_lat):
        theta_north = math.acos(
            _clamp(1.0 - 2.0 * i_lat / n_lat, -1.0, 1.0),
        )
        theta_south = math.acos(
            _clamp(1.0 - 2.0 * (i_lat + 1) / n_lat, -1.0, 1.0),
        )
        theta_midpoint = 0.5 * (theta_north + theta_south)
        for i_lon in range(n_lon):
            next_lon = (i_lon + 1) % n_lon
            if is_boundary(states[i_lat, i_lon], states[i_lat, next_lon]):
                phi_midpoint = (
                    float(phi_arr[i_lon]) + 0.5 * delta_phi
                ) % (2.0 * math.pi)
                points.append((theta_midpoint, phi_midpoint))

    if not points:
        return np.empty((0, 3), dtype=float)
    coordinates = np.asarray(points, dtype=float)
    return _unit_vectors(coordinates[:, 0], coordinates[:, 1])


def _local_equal_area_cell_diagonal(theta: float, n_lat: int, n_lon: int) -> float:
    """Great-circle diagonal of the equal-area row containing ``theta``."""
    mu = math.cos(theta)
    row = min(n_lat - 1, max(0, int(math.floor((1.0 - mu) * n_lat / 2.0))))
    theta_north = math.acos(_clamp(1.0 - 2.0 * row / n_lat, -1.0, 1.0))
    theta_south = math.acos(_clamp(1.0 - 2.0 * (row + 1) / n_lat, -1.0, 1.0))
    delta_phi = 2.0 * math.pi / n_lon
    cosine = (
        math.cos(theta_north) * math.cos(theta_south)
        + math.sin(theta_north) * math.sin(theta_south) * math.cos(delta_phi)
    )
    return math.acos(_clamp(cosine, -1.0, 1.0))


def _validated_wsa_samples(
    wsa_result: dict[str, Any],
) -> tuple[np.ndarray, np.ndarray, int, int] | None:
    """Extract finite, shape-consistent source-surface samples and grid size."""
    if wsa_result.get("model") != WSA_MODEL_VERSION:
        return None
    try:
        raw_theta = np.asarray(wsa_result.get("ss_theta"))
        raw_phi = np.asarray(wsa_result.get("ss_phi"))
        raw_velocity = np.asarray(wsa_result.get("velocity_map"))
        open_mask = np.asarray(wsa_result.get("open_mask"))
        raw_grid_theta = np.asarray(wsa_result.get("grid_theta"))
        raw_grid_phi = np.asarray(wsa_result.get("grid_phi"))
    except (TypeError, ValueError):
        return None
    numeric_kinds = {"f", "i", "u"}
    if (
        raw_theta.dtype.kind not in numeric_kinds
        or raw_phi.dtype.kind not in numeric_kinds
        or raw_velocity.dtype.kind not in numeric_kinds
        or raw_grid_theta.dtype.kind not in numeric_kinds
        or raw_grid_phi.dtype.kind not in numeric_kinds
        or open_mask.dtype.kind != "b"
    ):
        return None
    ss_theta = raw_theta.astype(float, copy=False)
    ss_phi = raw_phi.astype(float, copy=False)
    velocity = raw_velocity.astype(float, copy=False)
    grid_theta = raw_grid_theta.astype(float, copy=False)
    grid_phi = raw_grid_phi.astype(float, copy=False)
    if (
        ss_theta.ndim != 2
        or not ss_theta.size
        or ss_phi.shape != ss_theta.shape
        or velocity.shape != ss_theta.shape
        or open_mask.shape != ss_theta.shape
        or grid_theta.ndim != 1
        or grid_phi.ndim != 1
        or not grid_theta.size
        or not grid_phi.size
        or not np.isfinite(grid_theta).all()
        or not np.isfinite(grid_phi).all()
    ):
        return None
    expected_theta = np.arccos(np.linspace(
        1.0 - 1.0 / grid_theta.size,
        -1.0 + 1.0 / grid_theta.size,
        grid_theta.size,
    ))
    expected_phi = np.arange(grid_phi.size, dtype=float) * 2.0 * math.pi / grid_phi.size
    if (
        not np.allclose(grid_theta, expected_theta, rtol=0, atol=1e-12)
        or not np.allclose(grid_phi, expected_phi, rtol=0, atol=1e-12)
    ):
        return None
    valid = (
        open_mask
        & np.isfinite(ss_theta)
        & np.isfinite(ss_phi)
        & np.isfinite(velocity)
        & (ss_theta >= 0)
        & (ss_theta <= math.pi)
        & (velocity >= 265.0)
        & (velocity <= 850.0)
    )
    if not valid.any():
        return None
    vectors = _unit_vectors(ss_theta[valid], np.mod(ss_phi[valid], 2.0 * math.pi))
    return vectors, velocity[valid], int(grid_theta.size), int(grid_phi.size)


def _source_surface_coverage_fraction(
    ss_theta: np.ndarray,
    ss_phi: np.ndarray,
    velocity_map: np.ndarray,
    open_mask: np.ndarray,
    theta_arr: np.ndarray,
    phi_arr: np.ndarray,
) -> float:
    sample_result = {
        "model": WSA_MODEL_VERSION,
        "ss_theta": ss_theta,
        "ss_phi": ss_phi,
        "velocity_map": velocity_map,
        "open_mask": open_mask,
        "grid_theta": theta_arr,
        "grid_phi": phi_arr,
    }
    prepared = _validated_wsa_samples(sample_result)
    if prepared is None:
        return 0.0
    candidates, _, n_lat, n_lon = prepared
    target_theta, target_phi = np.meshgrid(theta_arr, phi_arr, indexing="ij")
    flat_theta = target_theta.ravel()
    targets = _unit_vectors(flat_theta, target_phi.ravel())
    caps = np.asarray([
        WSA_LOOKUP_MAX_CELL_DIAGONALS * _local_equal_area_cell_diagonal(float(theta), n_lat, n_lon)
        for theta in flat_theta
    ])
    covered = np.zeros(len(targets), dtype=bool)
    # Bound peak temporary memory while retaining stable atan2 distances.
    for start in range(0, len(targets), 128):
        stop = min(start + 128, len(targets))
        batch = targets[start:stop]
        dots = np.clip(batch @ candidates.T, -1.0, 1.0)
        cross_norms = safe_norm(np.cross(batch[:, None, :], candidates[None, :, :]))
        distances = np.arctan2(cross_norms, dots)
        covered[start:stop] = np.min(distances, axis=1) <= caps[start:stop] + 1e-14
    return float(np.count_nonzero(covered) / covered.size)


def compute_wsa_velocity_map(
    field: PFSSField,
    br_map: np.ndarray | None = None,
    n_lat: int = 45,
    n_lon: int = 90,
    max_steps: int = 300,
    step_size: float = 0.02,
) -> dict[str, Any]:
    """Compute a versioned WSA-inspired velocity map at the source surface.

    Traces a global grid of field lines from the photosphere, classifies them
    as open, closed, or indeterminate; evaluates radial expansion at exact
    shell boundaries; and applies ``wsa_inspired_v1`` only where all required
    quantities are available.

    Returns
    -------
    dict with keys:
        - 'velocity_map': 2D array (n_lat, n_lon) of V_sw in km/s at the
          source surface (NaN for closed footpoints).
        - 'open_mask': boolean 2D array, True for open flux footpoints.
        - 'closed_mask', 'indeterminate_mask': independently classified masks.
        - 'trace_states', 'trace_endpoints': topology and full-precision endpoints.
        - 'mean_velocity_kms': nullable mean of valid mapped velocities.
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

    # Trace from the exact photospheric boundary.  The tracing engine rejects
    # the inward r=1 self-hit and records only physical shell crossings.
    photosphere_vectors = _unit_vectors(theta_flat, phi_flat)

    traces = trace_field_batch(
        field, photosphere_vectors,
        max_steps=max_steps, step_size=step_size,
    )
    px, py, pz = traces.endpoints.T
    trace_states = traces.states.reshape(n_lat, n_lon)
    open_mask_flat = traces.states == "open"
    open_mask = open_mask_flat.reshape(n_lat, n_lon)
    closed_mask = trace_states == "closed"
    indeterminate_mask = trace_states == "indeterminate"
    # Expansion uses signed radial components at exact boundaries.  Tangential
    # magnitude is intentionally irrelevant; absolute values enter only in the
    # positive ratio after finite/nonzero validation.
    fs_val = np.full(n_points, np.nan)
    photosphere_fields = np.asarray(
        field.evaluate_cartesian_batch(*photosphere_vectors.T), dtype=float,
    ).T
    br_photosphere = np.sum(photosphere_fields * photosphere_vectors, axis=1)
    br_source_surface = np.full(n_points, np.nan)
    if open_mask_flat.any():
        open_endpoints = traces.endpoints[open_mask_flat]
        open_radii = safe_norm(open_endpoints)
        open_unit = np.full_like(open_endpoints, np.nan)
        np.divide(open_endpoints, open_radii[:, None], out=open_unit, where=(open_radii > 0)[:, None])
        open_fields = np.asarray(
            field.evaluate_cartesian_batch(*open_endpoints.T), dtype=float,
        ).T
        br_source_surface[open_mask_flat] = np.sum(open_fields * open_unit, axis=1)
    valid_radial = (
        open_mask_flat
        & np.isfinite(br_photosphere)
        & np.isfinite(br_source_surface)
        & (np.abs(br_photosphere) > WSA_RADIAL_FIELD_FLOOR)
        & (np.abs(br_source_surface) > WSA_RADIAL_FIELD_FLOOR)
    )
    fs_val[valid_radial] = (
        (1.0 / r_ss) ** 2
        * np.abs(br_photosphere[valid_radial])
        / np.abs(br_source_surface[valid_radial])
    )
    fs_val[~np.isfinite(fs_val) | (fs_val <= 0)] = np.nan
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
    # For each open footpoint, find the minimum great-circle distance to an
    # edge midpoint separating adjacent confirmed-open/confirmed-closed cells.
    # Indeterminate cells cannot create either side of a boundary.
    theta_b_map = np.full((n_lat, n_lon), np.nan)
    boundary_vectors = _open_closed_boundary_midpoints(trace_states, phi_arr)
    if boundary_vectors.size:
        for i_lat_o, i_lon_o in np.argwhere(open_mask):
            target = _unit_vectors(
                np.asarray([theta_arr[i_lat_o]]), np.asarray([phi_arr[i_lon_o]]),
            )[0]
            theta_b_map[i_lat_o, i_lon_o] = float(
                np.min(_great_circle_distances(target, boundary_vectors)),
            )

    # ── Apply WSA velocity formula ────────────────────────────────────────
    velocity_map = np.full((n_lat, n_lon), np.nan)
    for i_lat_v in range(n_lat):
        for i_lon_v in range(n_lon):
            if not open_mask[i_lat_v, i_lon_v]:
                continue
            fs_v = fs_map[i_lat_v, i_lon_v]
            tb_v = theta_b_map[i_lat_v, i_lon_v]
            if np.isfinite(fs_v) and np.isfinite(tb_v):
                velocity_map[i_lat_v, i_lon_v] = _wsa_velocity(float(fs_v), float(tb_v))

    # Availability and quality are part of the result contract; absence never
    # turns into the historic 380/400 km/s defaults.
    valid_v = velocity_map[np.isfinite(velocity_map)]
    mean_v = round(float(np.mean(valid_v)), 1) if valid_v.size else None
    quality_reasons: list[str] = []
    if not boundary_vectors.size:
        quality_reasons.append("no_open_closed_boundary")
    if np.any(open_mask_flat & ~valid_radial):
        quality_reasons.append("invalid_radial_field")
    if indeterminate_mask.any():
        quality_reasons.append("indeterminate_traces")
    valid_fraction = float(valid_v.size / n_points)
    indeterminate_fraction = float(np.count_nonzero(indeterminate_mask) / n_points)
    coverage_fraction = _source_surface_coverage_fraction(
        ss_theta, ss_phi, velocity_map, open_mask, theta_arr, phi_arr,
    )
    if valid_v.size == 0:
        quality_reasons.append("no_valid_wsa_speed")
    elif coverage_fraction < 1.0:
        quality_reasons.append("incomplete_source_surface_coverage")

    return {
        "model": WSA_MODEL_VERSION,
        "calibration_status": WSA_CALIBRATION_STATUS,
        "formula": "267.5 + 410/max(1,fs)^0.4*(1-0.8*exp(-(theta_b/0.045)^3))",
        "angle_units": "radian",
        "velocity_units": "km/s",
        "source_surface_radii": float(r_ss),
        "boundary_distance_method": "adjacent_open_closed_edge_midpoints_v1",
        "lookup_max_cell_diagonals": WSA_LOOKUP_MAX_CELL_DIAGONALS,
        "valid_fraction": valid_fraction,
        "indeterminate_fraction": indeterminate_fraction,
        "coverage_fraction": coverage_fraction,
        "quality_reasons": quality_reasons,
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
        "mean_velocity_kms": mean_v,
        "grid_theta": theta_arr,
        "grid_phi": phi_arr,
    }


def wsa_velocity_at_source_surface(
    wsa_result: dict[str, Any],
    ss_lat_rad: float,
    ss_lon_rad: float,
) -> float | None:
    """Return a nearby finite WSA-inspired sample, or ``None`` if uncovered."""
    if not isinstance(wsa_result, dict):
        return None
    try:
        latitude = float(ss_lat_rad)
        longitude = float(ss_lon_rad)
    except (TypeError, ValueError):
        return None
    if (
        not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not -math.pi / 2.0 <= latitude <= math.pi / 2.0
    ):
        return None
    prepared = _validated_wsa_samples(wsa_result)
    if prepared is None:
        return None
    candidates, velocities, n_lat, n_lon = prepared
    theta_target = math.pi / 2.0 - latitude
    phi_target = longitude % (2.0 * math.pi)
    target = _unit_vectors(np.asarray([theta_target]), np.asarray([phi_target]))[0]
    distances = _great_circle_distances(target, candidates)
    nearest = int(np.argmin(distances))
    max_distance = (
        WSA_LOOKUP_MAX_CELL_DIAGONALS
        * _local_equal_area_cell_diagonal(theta_target, n_lat, n_lon)
    )
    if float(distances[nearest]) > max_distance + 1e-14:
        return None
    return float(velocities[nearest])


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

        # Compute the versioned WSA-inspired visualization velocity map.
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
                "model": wsa_result.get("model", WSA_MODEL_VERSION),
                "calibration_status": wsa_result.get(
                    "calibration_status", WSA_CALIBRATION_STATUS,
                ),
                "valid_fraction": wsa_result.get("valid_fraction", 0.0),
                "indeterminate_fraction": wsa_result.get(
                    "indeterminate_fraction", 1.0,
                ),
                "coverage_fraction": wsa_result.get("coverage_fraction", 0.0),
                "quality_reasons": list(wsa_result.get(
                    "quality_reasons", ["wsa_result_metadata_incomplete"],
                )),
                "source_surface_radii": wsa_result.get(
                    "source_surface_radii", float(field.r_ss),
                ),
                "boundary_distance_method": wsa_result.get(
                    "boundary_distance_method", "unavailable",
                ),
                "lookup_max_cell_diagonals": wsa_result.get(
                    "lookup_max_cell_diagonals", WSA_LOOKUP_MAX_CELL_DIAGONALS,
                ),
            },
            "_wsa_result": wsa_result,  # internal, not serialized to JSON
        }
