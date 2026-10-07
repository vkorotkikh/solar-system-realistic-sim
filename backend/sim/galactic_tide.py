"""
Galactic Tidal Forces — Phase 10

Implements the galactic tidal field as experienced by the solar system.
The galactic tide is the dominant external perturber of the Oort Cloud,
responsible for ~90% of long-period comet injection.

Physics references:
- Heisler & Tremaine (1986) "The influence of the galactic tidal field on
  the Oort comet cloud"
- Levison et al. (2001) "The mass disruption of Oort cloud comets"

Key parameters:
- Ω₀ ≈ 26 km/s/kpc = 8.4 × 10⁻¹⁶ rad/s (Solar orbital angular velocity)
- ρ₀ ≈ 0.1 M☉/pc³ (local disk mass density, Oort limit)

Magnitude comparison:
- At 1 AU: galactic tide ~ 3e-13 m/s², Sun gravity ~ 5.9e-3 → negligible
- At 50,000 AU: galactic tide ~ 3e-13, Sun gravity ~ 2.4e-12 → 13% of gravity
- At 100,000 AU: galactic tide ~ 3e-13, Sun gravity ~ 5.9e-13 → dominant
"""

import math

# Physical constants
G_CONST = 6.674e-11     # m³/(kg·s²)
M_SUN = 1.989e30        # kg
PC_M = 3.086e16         # parsec in meters
AU_M = 1.496e11         # AU in meters

# Galactic parameters
OMEGA_0 = 8.4e-16       # Solar orbital angular velocity [rad/s] (26 km/s/kpc)
RHO_0 = 0.1 * M_SUN / PC_M**3  # Local disk density [kg/m³] ≈ 6.77e-21
KM_S_KPC = 1.0e3 / (1.0e3 * PC_M)  # 1 km/s/kpc in 1/s
OORT_A = 15.3 * KM_S_KPC   # Oort constants (Bovy 2017)
OORT_B = -11.9 * KM_S_KPC

# Heisler & Tremaine (1986) tidal tensor on galactic axes (x radial, y along rotation, z to NGP):
#   a_x = +(A - B)(3A + B) x   -- a radial STRETCH, not a pull toward the Sun
#   a_y = -(A - B)^2 y
#   a_z = -[4 pi G rho_0 - 2(B^2 - A^2)] z
TIDE_XX = (OORT_A - OORT_B) * (3.0 * OORT_A + OORT_B)
TIDE_YY = -((OORT_A - OORT_B) ** 2)
TIDE_ZZ = -(4.0 * math.pi * G_CONST * RHO_0 - 2.0 * (OORT_B**2 - OORT_A**2))


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return [c / n for c in v]


def _radec_to_ecliptic(ra_deg, dec_deg, obliquity_deg=23.4392911):
    ra, dec, eps = (math.radians(a) for a in (ra_deg, dec_deg, obliquity_deg))
    x, y, z = math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)
    return [x, y * math.cos(eps) + z * math.sin(eps), -y * math.sin(eps) + z * math.cos(eps)]


# Galactic axes in ecliptic J2000 coordinates, from the IAU galactic pole and centre (ICRS).
_GAL_Z = _unit(_radec_to_ecliptic(192.85948, 27.12825))
_gc = _radec_to_ecliptic(266.40510, -28.93617)
_GAL_X = _unit([c - sum(a * b for a, b in zip(_gc, _GAL_Z)) * z for c, z in zip(_gc, _GAL_Z)])
_GAL_Y = [_GAL_Z[1] * _GAL_X[2] - _GAL_Z[2] * _GAL_X[1],
          _GAL_Z[2] * _GAL_X[0] - _GAL_Z[0] * _GAL_X[2],
          _GAL_Z[0] * _GAL_X[1] - _GAL_Z[1] * _GAL_X[0]]


def galactic_tidal_acceleration_si(x_m, y_m, z_m):
    """
    Galactic tidal acceleration [m/s^2] for a heliocentric ECLIPTIC J2000 position [m].

    The Heisler & Tremaine (1986) tensor is diagonal on galactic axes, so the position is
    rotated onto them, scaled, and rotated back. Applying the diagonal tensor directly to
    ecliptic coordinates (as this module used to) points the strong vertical tide ~60 deg
    away from the galactic pole.
    """
    r = (x_m, y_m, z_m)
    gx = sum(a * b for a, b in zip(r, _GAL_X)) * TIDE_XX
    gy = sum(a * b for a, b in zip(r, _GAL_Y)) * TIDE_YY
    gz = sum(a * b for a, b in zip(r, _GAL_Z)) * TIDE_ZZ
    return tuple(gx * _GAL_X[i] + gy * _GAL_Y[i] + gz * _GAL_Z[i] for i in range(3))


def galactic_tidal_acceleration_au(x_au, y_au, z_au):
    """
    Same as galactic_tidal_acceleration_si but with AU inputs/outputs.
    
    Returns acceleration in AU/yr² (REBOUND-compatible when using
    AU-year units).
    """
    ax_si, ay_si, az_si = galactic_tidal_acceleration_si(
        x_au * AU_M, y_au * AU_M, z_au * AU_M
    )
    
    # Convert m/s² to AU/yr²
    # 1 AU/yr² = AU_M / (365.25*86400)²
    yr_s = 365.25 * 86400
    factor = yr_s**2 / AU_M  # multiply m/s² by this to get AU/yr²
    
    return (ax_si * factor, ay_si * factor, az_si * factor)


def is_galactic_tide_relevant(r_au):
    """
    Check whether galactic tidal forces are non-negligible at this distance.
    
    Galactic tide becomes relevant (>1% of solar gravity) beyond ~10,000 AU.
    
    Parameters:
        r_au: heliocentric distance in AU
    
    Returns:
        bool: True if galactic tide should be included
    """
    if r_au < 1000:
        return False
    
    # Sun gravity at distance r
    r_m = r_au * AU_M
    a_sun = G_CONST * M_SUN / r_m**2
    
    # Galactic tide (z-direction, strongest component)
    a_tide = (4 * math.pi * G_CONST * RHO_0) * r_m
    
    return a_tide / a_sun > 0.01


def rebound_galactic_tide_callback(reb_sim):
    """
    REBOUND additional_forces callback for galactic tidal field.
    
    Only applies forces to particles beyond 1000 AU from the Sun
    (negligible inside this radius).
    
    Usage:
        reb_sim.additional_forces = rebound_galactic_tide_callback
    
    Note: Assumes REBOUND simulation uses AU, solar masses, yr units, in heliocentric
    ecliptic J2000 coordinates (rotated onto galactic axes internally).
    """
    sun = reb_sim.particles[0]
    
    for i in range(1, reb_sim.N):
        p = reb_sim.particles[i]
        
        # Heliocentric position
        dx = p.x - sun.x
        dy = p.y - sun.y
        dz = p.z - sun.z
        r = math.sqrt(dx*dx + dy*dy + dz*dz)
        
        # Skip inner solar system (negligible there)
        if r < 1000:
            continue
        
        ax, ay, az = galactic_tidal_acceleration_au(dx, dy, dz)
        p.ax += ax
        p.ay += ay
        p.az += az


def combined_forces_callback(reb_sim):
    """
    Combined REBOUND additional_forces callback for both
    radiation pressure and galactic tides.
    
    Dispatches to both force models as appropriate per particle.
    """
    from .radiation_pressure import rebound_radiation_pressure_callback
    
    rebound_radiation_pressure_callback(reb_sim)
    rebound_galactic_tide_callback(reb_sim)


# ─── Sgr A* Direct Gravitational Pull (informational) ────────────────────────
# At 26,000 ly (8 kpc), Sgr A* (4 × 10⁶ M☉) produces:
# a = GM/(8kpc)² ≈ 8.7 × 10⁻¹² m/s²
# This is ~10⁻⁹ × solar gravity at 1 AU and is already subsumed
# within the distributed tidal field above. No separate implementation needed.
SGR_A_STAR_DISTANCE_M = 8000 * PC_M  # ~2.47e20 m
SGR_A_STAR_MASS_KG = 4e6 * M_SUN
SGR_A_STAR_ACCEL = G_CONST * SGR_A_STAR_MASS_KG / SGR_A_STAR_DISTANCE_M**2  # ~8.7e-12 m/s²
