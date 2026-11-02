/**
 * Adopted sidereal Doppler-feature fit, matching backend solar_active_regions.
 * Snodgrass & Ulrich (1990), ApJ 351:309-316, Table 1 Doppler residuals:
 * (2.972, -0.484, -0.361) microrad/s, approximated in degrees/day here.
 * https://articles.adsabs.harvard.edu/pdf/1990ApJ...351..309S
 * This empirical tracer profile does not calibrate the decorative display clock.
 */
export const SOLAR_ROTATION_COEFFICIENTS_DEG_DAY = [14.713, -2.396, -1.787] as const;
export const SOLAR_ROTATION_REFERENCE = '10.1086/168467';
