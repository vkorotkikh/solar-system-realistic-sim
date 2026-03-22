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
from typing import Any

import numpy as np

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
) -> np.ndarray:
    """Generate a synthetic photospheric Br map from activity index.

    Produces a dipole + quadrupole + octupole field with activity-dependent
    amplitudes, plus noise-seeded active regions at butterfly-law latitudes.
    Returns Br on a uniform θ (colatitude) × φ (longitude) grid.
    """
    activity = _clamp(float(activity), 0.0, 1.0)
    theta = np.linspace(0, np.pi, n_lat, endpoint=False) + np.pi / (2 * n_lat)
    phi = np.linspace(0, 2 * np.pi, n_lon, endpoint=False)
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
    """Compute fully normalized associated Legendre functions P_l^m(cos θ).

    Uses the recurrence relation for Schmidt semi-normalized harmonics,
    which is the standard for geomagnetism and solar physics.
    Returns dict[(l, m)] → array of shape (n_theta,).
    """
    n = cos_theta.shape[0]
    sin_theta = np.sqrt(1.0 - cos_theta**2)
    result: dict[tuple[int, int], np.ndarray] = {}

    # P_0^0 = 1
    result[(0, 0)] = np.ones(n)

    for l in range(1, lmax + 1):
        # P_l^l (diagonal)
        if l == 1:
            result[(1, 1)] = sin_theta.copy()
        else:
            result[(l, l)] = result[(l - 1, l - 1)] * sin_theta * math.sqrt((2 * l - 1) / (2 * l))

        # P_l^{l-1} (sub-diagonal)
        result[(l, l - 1)] = cos_theta * math.sqrt(2 * l - 1) * result[(l - 1, l - 1)]

        # P_l^m for m < l-1 (horizontal recurrence)
        for m in range(l - 2, -1, -1):
            a = math.sqrt(((2 * l - 1) * (2 * l + 1)) / ((l - m) * (l + m)))
            b = math.sqrt(((2 * l + 1) * (l + m - 1) * (l - m - 1)) / ((l - m) * (l + m) * (2 * l - 3)))
            result[(l, m)] = a * cos_theta * result[(l - 1, m)]
            if (l - 2, m) in result:
                result[(l, m)] -= b * result[(l - 2, m)]

    return result


def decompose_spherical_harmonics(
    br_map: np.ndarray,
    lmax: int = 15,
) -> tuple[np.ndarray, np.ndarray]:
    """Decompose a Br(θ, φ) map into spherical harmonic coefficients.

    Parameters
    ----------
    br_map : ndarray, shape (n_lat, n_lon)
        Radial magnetic field on a uniform colatitude × longitude grid.
    lmax : int
        Maximum spherical harmonic degree.

    Returns
    -------
    g_lm : ndarray, shape (lmax+1, lmax+1)
        Cosine (g) coefficients.
    h_lm : ndarray, shape (lmax+1, lmax+1)
        Sine (h) coefficients.
    """
    n_lat, n_lon = br_map.shape
    theta = np.linspace(0, np.pi, n_lat, endpoint=False) + np.pi / (2 * n_lat)
    cos_theta = np.cos(theta)
    sin_theta = np.sin(theta)
    d_theta = np.pi / n_lat
    d_phi = 2.0 * np.pi / n_lon

    # Compute Legendre functions
    plm = _associated_legendre(lmax, cos_theta)

    g_lm = np.zeros((lmax + 1, lmax + 1))
    h_lm = np.zeros((lmax + 1, lmax + 1))

    phi = np.linspace(0, 2 * np.pi, n_lon, endpoint=False)

    for l in range(lmax + 1):
        for m in range(l + 1):
            p = plm[(l, m)]  # shape (n_lat,)

            # Integrate over longitude: cos(m*phi) and sin(m*phi)
            cos_m_phi = np.cos(m * phi)  # (n_lon,)
            sin_m_phi = np.sin(m * phi)  # (n_lon,)

            # br_map[i, j] * cos(m*phi_j) summed over j → (n_lat,)
            br_cos = br_map @ cos_m_phi * d_phi  # (n_lat,)
            br_sin = br_map @ sin_m_phi * d_phi  # (n_lat,)

            # Integrate over colatitude with sin(theta) weight
            weight = p * sin_theta * d_theta  # (n_lat,)

            # Normalization factor
            epsilon_m = 1.0 if m == 0 else 2.0
            norm = (2 * l + 1) / (4.0 * np.pi) * epsilon_m

            g_lm[l, m] = norm * np.sum(br_cos * weight)
            h_lm[l, m] = norm * np.sum(br_sin * weight)

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
    with the boundary condition Br = 0 at r_ss.
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
        sin_t = max(1e-10, math.sin(theta))

        # Compute Legendre functions at this colatitude
        plm_vals: dict[tuple[int, int], float] = {}
        dplm_vals: dict[tuple[int, int], float] = {}
        self._legendre_at_point(cos_t, sin_t, plm_vals, dplm_vals)

        br_val = 0.0
        bt_val = 0.0
        bp_val = 0.0

        for l in range(1, self.lmax + 1):
            # Radial basis functions (Altschuler-Newkirk):
            # c_l(r) = (r)^l + ((l+1)/l) * r^{-(l+1)} * (1/r_ss)^{2l+1}
            # But for the standard PFSS: B_r has the form:
            #   B_r(r,θ,φ) = sum_l sum_m [c_l(r)] * P_l^m(cosθ) * (g*cos(mφ)+h*sin(mφ))
            # where c_l(r) = (l+1) * [(r_ss/r)^{l+2} - 1] / [(l+1) + l*(r_ss)^{-(2l+1)}]
            # ... simplified:
            # f_l(r) = (r)^{-(l+2)} * [1 - (r/r_ss)^{2l+1}] / [1 + (l+1)/l * (1/r_ss)^{2l+1}]
            rss = self.r_ss

            # More standard form from Wang & Sheeley (1992):
            # R_l(r) for Br:  (l+1) * [1 - (r/rss)^(2l+1)] / [l + (l+1)*(r/rss)^(2l+1)] * r^{-(l+2)}
            # But simplified using ratio to photosphere (r=1):
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
                bp_val += cl_bp * plm * m * gh_sin / sin_t

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
        """Compute P_l^m and dP_l^m/dθ at a single point."""
        plm[(0, 0)] = 1.0
        dplm[(0, 0)] = 0.0

        for l in range(1, self.lmax + 1):
            # Diagonal: P_l^l
            if l == 1:
                plm[(1, 1)] = sin_t
                dplm[(1, 1)] = cos_t
            else:
                fac = math.sqrt((2 * l - 1) / (2 * l))
                plm[(l, l)] = fac * sin_t * plm[(l - 1, l - 1)]
                dplm[(l, l)] = fac * (cos_t * plm[(l - 1, l - 1)] + sin_t * dplm[(l - 1, l - 1)])

            # Sub-diagonal: P_l^{l-1}
            fac_sub = math.sqrt(2 * l - 1)
            plm[(l, l - 1)] = fac_sub * cos_t * plm[(l - 1, l - 1)]
            dplm[(l, l - 1)] = fac_sub * (-sin_t * plm[(l - 1, l - 1)] + cos_t * dplm[(l - 1, l - 1)])

            # Horizontal recurrence for m < l-1
            for m in range(l - 2, -1, -1):
                a_num = (2 * l - 1) * (2 * l + 1)
                a_den = (l - m) * (l + m)
                a = math.sqrt(a_num / a_den)

                b_num = (2 * l + 1) * (l + m - 1) * (l - m - 1)
                b_den = (l - m) * (l + m) * (2 * l - 3)
                b = math.sqrt(b_num / b_den) if b_den > 0 else 0.0

                plm_prev = plm.get((l - 1, m), 0.0)
                dplm_prev = dplm.get((l - 1, m), 0.0)
                plm_prev2 = plm.get((l - 2, m), 0.0)
                dplm_prev2 = dplm.get((l - 2, m), 0.0)

                plm[(l, m)] = a * cos_t * plm_prev - b * plm_prev2
                dplm[(l, m)] = a * (-sin_t * plm_prev + cos_t * dplm_prev) - b * dplm_prev2


# ─── Field Line Tracer ─────────────────────────────────────────────────────────

def trace_field_lines(
    field: PFSSField,
    n_lines: int = 120,
    max_steps: int = 300,
    step_size: float = 0.02,
    br_map: np.ndarray | None = None,
) -> list[dict[str, Any]]:
    """Trace magnetic field lines from the photosphere through the PFSS domain.

    Seeds footpoints using a Fibonacci spiral biased toward high-|Br| regions
    (active regions). Each line is traced outward via RK4 and classified as
    open (reaches source surface) or closed (returns to photosphere).
    """
    lines: list[dict[str, Any]] = []
    r_ss = field.r_ss
    safe_n = max(8, min(500, int(n_lines)))

    # Generate seed footpoints
    seeds = _generate_seed_footpoints(safe_n, br_map)

    for idx, (theta_0, phi_0) in enumerate(seeds):
        # Start slightly above photosphere
        r_start = 1.005
        x = r_start * math.sin(theta_0) * math.cos(phi_0)
        y = r_start * math.sin(theta_0) * math.sin(phi_0)
        z = r_start * math.cos(theta_0)

        # Determine initial field direction for polarity
        bx, by, bz = field.evaluate_cartesian(x, y, z)
        b_mag = math.sqrt(bx * bx + by * by + bz * bz)
        if b_mag < 1e-12:
            continue

        # Radial component at footpoint determines polarity
        r_hat = (x / r_start, y / r_start, z / r_start)
        br_dot = bx * r_hat[0] + by * r_hat[1] + bz * r_hat[2]
        polarity = 1 if br_dot > 0 else -1

        # Trace direction: follow field outward
        trace_sign = float(polarity)

        arc: list[list[float]] = [[x, y, z]]
        is_open = False

        px, py, pz = x, y, z

        for step in range(max_steps):
            # RK4 integration
            k1x, k1y, k1z = _normalized_field(field, px, py, pz, trace_sign)

            mx, my, mz = px + k1x * step_size * 0.5, py + k1y * step_size * 0.5, pz + k1z * step_size * 0.5
            k2x, k2y, k2z = _normalized_field(field, mx, my, mz, trace_sign)

            mx2, my2, mz2 = px + k2x * step_size * 0.5, py + k2y * step_size * 0.5, pz + k2z * step_size * 0.5
            k3x, k3y, k3z = _normalized_field(field, mx2, my2, mz2, trace_sign)

            ex, ey, ez = px + k3x * step_size, py + k3y * step_size, pz + k3z * step_size
            k4x, k4y, k4z = _normalized_field(field, ex, ey, ez, trace_sign)

            px += step_size * (k1x + 2 * k2x + 2 * k3x + k4x) / 6
            py += step_size * (k1y + 2 * k2y + 2 * k3y + k4y) / 6
            pz += step_size * (k1z + 2 * k2z + 2 * k3z + k4z) / 6

            r = math.sqrt(px * px + py * py + pz * pz)
            arc.append([round(px, 4), round(py, 4), round(pz, 4)])

            if r >= r_ss:
                is_open = True
                break
            elif r <= 1.0 and step > 5:
                # Returned to photosphere — closed loop
                is_open = False
                break

        # Only keep lines with enough points
        if len(arc) < 5:
            continue

        # Convert footpoint to lat/lon
        fp_lat_deg = round(90.0 - math.degrees(theta_0), 1)
        fp_lon_deg = round(math.degrees(phi_0), 1)

        lines.append({
            "id": f"pfss-{idx:03d}",
            "is_open": is_open,
            "polarity": polarity,
            "footpoint_lat_deg": fp_lat_deg,
            "footpoint_lon_deg": fp_lon_deg,
            "arc": arc,
        })

    return lines


def _normalized_field(
    field: PFSSField,
    x: float, y: float, z: float,
    sign: float,
) -> tuple[float, float, float]:
    """Evaluate normalized magnetic field direction at Cartesian point."""
    bx, by, bz = field.evaluate_cartesian(x, y, z)
    mag = math.sqrt(bx * bx + by * by + bz * bz)
    if mag < 1e-15:
        return (0.0, 0.0, 0.0)
    inv = sign / mag
    return (bx * inv, by * inv, bz * inv)


def _generate_seed_footpoints(
    n: int,
    br_map: np.ndarray | None = None,
) -> list[tuple[float, float]]:
    """Generate n footpoint seeds on the photosphere.

    Uses a Fibonacci spiral for uniform coverage, then biases toward
    high-|Br| regions if a magnetogram is provided.
    """
    if br_map is not None and br_map.size > 0:
        return _importance_sample_footpoints(n, br_map)

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
) -> list[tuple[float, float]]:
    """Sample footpoints biased toward high |Br| regions."""
    n_lat, n_lon = br_map.shape
    abs_br = np.abs(br_map)

    # Weight by sin(theta) for area correction + |Br| for importance
    theta_vals = np.linspace(0, np.pi, n_lat, endpoint=False) + np.pi / (2 * n_lat)
    sin_weight = np.sin(theta_vals)[:, np.newaxis]
    weight_map = abs_br * sin_weight + 0.1 * sin_weight  # small uniform floor
    weight_map = weight_map / weight_map.sum()

    flat_weights = weight_map.ravel()
    rng = np.random.RandomState(42)
    indices = rng.choice(len(flat_weights), size=n, replace=True, p=flat_weights)

    seeds: list[tuple[float, float]] = []
    for idx in indices:
        i_lat = idx // n_lon
        i_lon = idx % n_lon
        theta = theta_vals[i_lat] + rng.uniform(-0.5, 0.5) * np.pi / n_lat
        phi = (i_lon + rng.uniform(-0.5, 0.5)) * 2 * np.pi / n_lon
        theta = _clamp(theta, 0.01, np.pi - 0.01)
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
        - 'mean_velocity_kms': mean open-flux velocity.
        - 'fs_map': expansion factor map.
        - 'theta_b_map': boundary distance map (radians).
    """
    r_ss = field.r_ss

    # Build a uniform-in-cos(θ) grid to avoid polar clustering
    cos_theta_arr = np.linspace(1.0 - 1.0 / n_lat, -1.0 + 1.0 / n_lat, n_lat)
    theta_arr = np.arccos(np.clip(cos_theta_arr, -0.999, 0.999))
    phi_arr = np.linspace(0, 2 * np.pi, n_lon, endpoint=False)

    # Output arrays
    open_mask = np.zeros((n_lat, n_lon), dtype=bool)
    fs_map = np.full((n_lat, n_lon), np.nan)
    ss_theta = np.full((n_lat, n_lon), np.nan)  # source surface angular coords
    ss_phi = np.full((n_lat, n_lon), np.nan)

    for i_lat in range(n_lat):
        theta_0 = float(theta_arr[i_lat])
        for i_lon in range(n_lon):
            phi_0 = float(phi_arr[i_lon])

            # Evaluate |B| at footpoint
            r_foot = 1.005
            x0 = r_foot * math.sin(theta_0) * math.cos(phi_0)
            y0 = r_foot * math.sin(theta_0) * math.sin(phi_0)
            z0 = r_foot * math.cos(theta_0)

            bx0, by0, bz0 = field.evaluate_cartesian(x0, y0, z0)
            b_foot = math.sqrt(bx0 * bx0 + by0 * by0 + bz0 * bz0)
            if b_foot < 1e-12:
                continue

            # Polarity for trace direction
            r_hat_x, r_hat_y, r_hat_z = x0 / r_foot, y0 / r_foot, z0 / r_foot
            br_dot = bx0 * r_hat_x + by0 * r_hat_y + bz0 * r_hat_z
            trace_sign = 1.0 if br_dot > 0 else -1.0

            # RK4 trace
            px, py, pz = x0, y0, z0
            reached_ss = False
            for step in range(max_steps):
                k1x, k1y, k1z = _normalized_field(field, px, py, pz, trace_sign)
                mx = px + k1x * step_size * 0.5
                my = py + k1y * step_size * 0.5
                mz = pz + k1z * step_size * 0.5
                k2x, k2y, k2z = _normalized_field(field, mx, my, mz, trace_sign)
                mx2 = px + k2x * step_size * 0.5
                my2 = py + k2y * step_size * 0.5
                mz2 = pz + k2z * step_size * 0.5
                k3x, k3y, k3z = _normalized_field(field, mx2, my2, mz2, trace_sign)
                ex = px + k3x * step_size
                ey = py + k3y * step_size
                ez = pz + k3z * step_size
                k4x, k4y, k4z = _normalized_field(field, ex, ey, ez, trace_sign)

                px += step_size * (k1x + 2 * k2x + 2 * k3x + k4x) / 6
                py += step_size * (k1y + 2 * k2y + 2 * k3y + k4y) / 6
                pz += step_size * (k1z + 2 * k2z + 2 * k3z + k4z) / 6

                r = math.sqrt(px * px + py * py + pz * pz)
                if r >= r_ss:
                    reached_ss = True
                    break
                elif r <= 1.0 and step > 5:
                    break

            if not reached_ss:
                continue

            # This footpoint is open flux
            open_mask[i_lat, i_lon] = True

            # Evaluate |B| at source surface endpoint
            bx_ss, by_ss, bz_ss = field.evaluate_cartesian(px, py, pz)
            b_ss = math.sqrt(bx_ss * bx_ss + by_ss * by_ss + bz_ss * bz_ss)

            # Expansion factor: f_s = (R_sun / R_ss)^2 * |B_foot| / |B_ss|
            if b_ss > 1e-15:
                fs_val = (1.0 / r_ss) ** 2 * b_foot / b_ss
            else:
                fs_val = 100.0  # Very high expansion = very slow wind
            fs_map[i_lat, i_lon] = fs_val

            # Source surface coordinates (for later Parker spiral mapping)
            r_end = math.sqrt(px * px + py * py + pz * pz)
            ss_theta[i_lat, i_lon] = math.acos(_clamp(pz / r_end, -1.0, 1.0))
            ss_phi[i_lat, i_lon] = math.atan2(py, px) % (2 * math.pi)

    # ── Compute boundary distance θ_b ────────────────────────────────────
    # For each open footpoint, find the minimum great-circle distance to
    # any closed footpoint on the grid.
    closed_mask = ~open_mask
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
        # All open (pure coronal hole, unlikely but handle)
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
    """Thread-safe cache for PFSS solutions keyed by Carrington rotation."""

    def __init__(self, max_entries: int = 3):
        self._lock = threading.Lock()
        self._cache: dict[int, dict[str, Any]] = {}
        self._max_entries = max_entries

    def get_or_compute(
        self,
        jd: float,
        activity: float,
        n_lines: int = 120,
        lmax: int = 15,
        gong_timeout_s: float = 6.0,
    ) -> dict[str, Any]:
        """Get cached PFSS result or compute fresh."""
        cr = carrington_rotation_number(jd)

        with self._lock:
            if cr in self._cache:
                return self._cache[cr]

        # Compute outside the lock to avoid blocking
        result = self._compute(cr, activity, jd, n_lines, lmax, gong_timeout_s)

        with self._lock:
            # Evict oldest if at capacity
            while len(self._cache) >= self._max_entries:
                oldest = min(self._cache.keys())
                del self._cache[oldest]
            self._cache[cr] = result

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
        br_map = None

        # Try to fetch GONG synoptic magnetogram
        try:
            gong_map = fetch_gong_synoptic_map(cr, timeout_s=gong_timeout_s)
            if gong_map is not None and gong_map.size > 100:
                br_map = gong_map
                source = f"gong_cr{cr}"
        except Exception:
            pass

        # Fall back to synthetic magnetogram
        if br_map is None:
            br_map = synthetic_magnetogram(activity, jd)
            source = "synthetic"

        # Decompose into spherical harmonics
        effective_lmax = min(lmax, 15)
        g_lm, h_lm = decompose_spherical_harmonics(br_map, lmax=effective_lmax)

        # Solve PFSS
        field = pfss_solve(g_lm, h_lm, lmax=effective_lmax)

        # Trace field lines (for visualization)
        lines = trace_field_lines(field, n_lines=n_lines, br_map=br_map)

        # Compute WSA solar wind velocity map
        wsa_grid_lat = 36  # coarser for speed
        wsa_grid_lon = 72
        wsa_result = compute_wsa_velocity_map(
            field, br_map=br_map,
            n_lat=wsa_grid_lat, n_lon=wsa_grid_lon,
        )

        # Count open vs closed
        open_count = sum(1 for l in lines if l.get("is_open"))
        closed_count = len(lines) - open_count

        return {
            "source": source,
            "carrington_rotation": cr,
            "source_surface_radii": SOURCE_SURFACE_RADII,
            "lmax": effective_lmax,
            "line_count": len(lines),
            "open_line_count": open_count,
            "closed_line_count": closed_count,
            "lines": lines,
            "wsa": {
                "mean_velocity_kms": wsa_result["mean_velocity_kms"],
                "grid_resolution": f"{wsa_grid_lat}x{wsa_grid_lon}",
                "model": "arge_2003",
            },
            "_wsa_result": wsa_result,  # internal, not serialized to JSON
        }

