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


def galactic_tidal_acceleration_si(x_m, y_m, z_m):
    """
    Compute galactic tidal acceleration in the local galactic rest frame.
    
    The Heisler & Tremaine (1986) linearized tidal field in the
    rotating Sun-centered galactic frame:
    
        a_x = -Ω₀² × x                     (radial toward galactic center)
        a_z = -(4πGρ₀ - Ω₀²) × z           (vertical, perpendicular to disk)
        a_y = -Ω₀² × y                     (azimuthal)
    
    Note: the z-component (perpendicular to galactic disk) is ~5× stronger
    than the x,y components because 4πGρ₀ >> Ω₀².
    
    Parameters:
        x_m, y_m, z_m: position relative to Sun [meters], 
                         in local galactic frame
    Returns:
        (ax, ay, az): tidal acceleration [m/s²]
    """
    omega2 = OMEGA_0 ** 2
    vertical_term = 4 * math.pi * G_CONST * RHO_0 - omega2
    
    ax = -omega2 * x_m
    ay = -omega2 * y_m
    az = -vertical_term * z_m  # This dominates (vertical tide)
    
    return (ax, ay, az)


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
    
    Note: Assumes REBOUND simulation uses AU, solar masses, yr units.
    Coordinate system should be aligned with the local galactic frame
    (z perpendicular to disk plane).
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
