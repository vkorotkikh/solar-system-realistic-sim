"""
Solar Radiation Pressure & Related Forces — Phase 9

Implements:
- Solar Radiation Pressure (SRP) acceleration
- Poynting-Robertson drag
- β ratio computation for dust/spacecraft
- Yarkovsky effect approximation for asteroids

Physics references:
- Burns et al. (1979) "Radiation forces on small particles in the solar system"
- Bottke et al. (2006) "The Yarkovsky and YORP Effects"
- L☉ = 3.828 × 10²⁶ W (IAU 2015 nominal value)
"""

import math

# Physical constants
L_SUN = 3.828e26        # Solar luminosity [W]
C_LIGHT = 2.998e8       # Speed of light [m/s]
G_CONST = 6.674e-11     # Gravitational constant [m³/(kg·s²)]
M_SUN = 1.989e30        # Solar mass [kg]
AU_M = 1.496e11         # Astronomical unit [m]

# Derived: Solar radiation pressure at 1 AU
# P_rad = L / (4π r² c) ≈ 4.56 × 10⁻⁶ Pa at 1 AU
P_RAD_1AU = L_SUN / (4 * math.pi * AU_M**2 * C_LIGHT)


def compute_beta(area_m2, mass_kg, Cr=1.0):
    """
    Compute the dimensionless β = F_SRP / F_grav ratio.
    
    β > 0.5: particle blown out of the solar system
    β ≈ 1.0: radiation exactly cancels gravity
    β ≈ 5.7e-5: typical value for 1 m² / 1000 kg spacecraft
    
    Parameters:
        area_m2: cross-sectional area [m²]
        mass_kg: mass [kg]
        Cr: radiation pressure coefficient (1.0=absorber, 2.0=perfect reflector)
    
    Returns:
        beta: dimensionless F_SRP/F_grav
    """
    # β = (L☉ × Cr × A) / (4π × G × M☉ × m × c)
    numerator = L_SUN * Cr * area_m2
    denominator = 4 * math.pi * G_CONST * M_SUN * mass_kg * C_LIGHT
    return numerator / denominator


def compute_dust_blowout_size(density_kg_m3=2500, Cr=1.0):
    """
    Compute the blowout grain size (β = 0.5).
    
    Returns the spherical grain diameter whose radiation-pressure ratio is
    β = 0.5. For silicate grains (ρ=2500 kg/m³): diameter ≈ 0.92 μm.
    For ice grains (ρ=1000 kg/m³): diameter ≈ 2.30 μm.
    
    Returns:
        diameter_m: grain diameter at β = 0.5
    """
    # For a sphere: A/m = 3/(2ρD), so β = 3 L Cr / (8 π G M☉ ρ D c)
    # At β=0.5: D = 3 L Cr / (4 π G M☉ ρ c)
    return 3 * L_SUN * Cr / (4 * math.pi * G_CONST * M_SUN * density_kg_m3 * C_LIGHT)


def srp_acceleration(x_au, y_au, z_au, beta):
    """
    Compute solar radiation pressure acceleration vector.
    
    a_SRP = β × GM☉/r² in the anti-sunward direction
    (same magnitude formula as gravity, scaled by β)
    
    Parameters:
        x_au, y_au, z_au: heliocentric position in AU
        beta: F_SRP / F_grav ratio for the body
    
    Returns:
        (ax, ay, az): acceleration in m/s² (in AU-based frame)
    """
    x_m = x_au * AU_M
    y_m = y_au * AU_M
    z_m = z_au * AU_M
    r2 = x_m**2 + y_m**2 + z_m**2
    r = math.sqrt(r2)
    
    if r < 1e6:  # Too close to Sun center
        return (0.0, 0.0, 0.0)
    
    # a = β × GM☉/r², directed radially outward
    a_mag = beta * G_CONST * M_SUN / r2
    
    # Unit vector away from sun
    ax = a_mag * x_m / r
    ay = a_mag * y_m / r
    az = a_mag * z_m / r
    
    return (ax, ay, az)


def poynting_robertson_drag(x_au, y_au, z_au, vx_ms, vy_ms, vz_ms, beta):
    """
    Compute Poynting-Robertson drag acceleration.
    
    Velocity-dependent part of Burns, Lamy & Soter (1979), equation (5).
    Excludes the static outward SRP term, which srp_acceleration supplies.
    Both position and velocity must be relative to the radiation source.
    Reference implementation: REBOUNDx src/radiation_forces.c, equation (5).
    
    Parameters:
        x_au, y_au, z_au: heliocentric position [AU]
        vx_ms, vy_ms, vz_ms: velocity [m/s]
        beta: radiation pressure ratio
    
    Returns:
        (ax, ay, az): PR drag acceleration [m/s²]
    """
    x_m = x_au * AU_M
    y_m = y_au * AU_M
    z_m = z_au * AU_M
    r2 = x_m**2 + y_m**2 + z_m**2
    r = math.sqrt(r2)
    
    if r < 1e6:
        return (0.0, 0.0, 0.0)
    
    # Radial unit vector
    rx, ry, rz = x_m / r, y_m / r, z_m / r
    
    # Radial velocity component
    vr = vx_ms * rx + vy_ms * ry + vz_ms * rz
    
    # a_PR = -(beta GM / r^2 c) [vr r_hat + v]. Radial drag is
    # -2 factor vr; projecting out vr instead would erase radial drag entirely.
    factor = beta * G_CONST * M_SUN / (r2 * C_LIGHT)
    
    ax = -factor * (vr * rx + vx_ms)
    ay = -factor * (vr * ry + vy_ms)
    az = -factor * (vr * rz + vz_ms)
    
    return (ax, ay, az)


def yarkovsky_da_dt(diameter_m, density_kg_m3, albedo, semi_major_au, obliquity_rad=0.0):
    """
    Approximate the Yarkovsky secular drift rate da/dt.
    
    This is the dominant NEO delivery mechanism from the main belt.
    
    Parameters:
        diameter_m: asteroid diameter [m]
        density_kg_m3: bulk density [kg/m³]  
        albedo: Bond albedo [0-1]
        semi_major_au: semi-major axis [AU]
        obliquity_rad: spin axis obliquity (0=prograde, π=retrograde)
    
    Returns:
        da_dt: semi-major axis drift rate [AU/Myr]
    """
    # The full Yarkovsky drift depends on thermal inertia, spin rate,
    # surface conductivity, and seasonal/diurnal lag. We do not model those
    # state variables here, so use a calibrated secular drift envelope that
    # preserves the observed scaling: smaller bodies drift faster, darker and
    # lower-density bodies drift faster, and the sign flips with obliquity.
    diameter_km = max(1e-6, diameter_m / 1_000.0)
    density_scale = 2500.0 / max(1.0, density_kg_m3)
    albedo_scale = max(0.05, 1.0 - max(0.0, min(1.0, albedo)))
    distance_scale = math.sqrt(max(0.2, semi_major_au))
    obliquity_scale = math.cos(obliquity_rad)

    # Empirical calibration: ~2.5e-4 AU/Myr for a 1 km body at 1 AU.
    drift_au_per_myr = 2.5e-4 * albedo_scale * density_scale * obliquity_scale
    drift_au_per_myr /= diameter_km * distance_scale
    return drift_au_per_myr


def rebound_radiation_pressure_callback(reb_sim, *, beta_by_index=None):
    """
    REBOUND additional_forces callback for solar radiation pressure.
    
    To use:
        from functools import partial
        sim.additional_forces = partial(
            rebound_radiation_pressure_callback, beta_by_index={1: 0.001})

    REBOUND passes a ctypes simulation pointer. Ordinary particle Python
    attributes do not survive fresh C-array views, and .params requires
    REBOUNDx. The caller-owned map uses stable indices; rebuild it after any
    particle removal/reordering. Unlisted particles are unaffected. SRP only;
    PR drag is not wired into this callback.
    """
    reb_sim = reb_sim.contents
    beta_by_index = {} if beta_by_index is None else beta_by_index
    sun = reb_sim.particles[0]
    for i in range(1, reb_sim.N):
        p = reb_sim.particles[i]
        beta = beta_by_index.get(i, 0.0)
        if beta == 0.0:
            continue
        
        dx = p.x - sun.x
        dy = p.y - sun.y
        dz = p.z - sun.z
        r2 = dx * dx + dy * dy + dz * dz
        r = math.sqrt(r2)
        
        if r < 1e-10:
            continue
        
        # SRP acceleration (same 1/r² as gravity, scaled by β)
        a_srp = beta * reb_sim.G * sun.m / r2
        p.ax += a_srp * dx / r
        p.ay += a_srp * dy / r
        p.az += a_srp * dz / r
