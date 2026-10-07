import { AU_KM } from '../../../constants';
import { SUN } from '../../../data/planets';

/** The Sun's physical radius, matching the catalog's realistic-scale radius. */
export const SOLAR_RADIUS_AU = SUN.radiusKm / AU_KM;

/**
 * Share of a structure's height above the surface kept when the Sun is drawn enlarged (owner
 * decision D3). At the default scale the Sun is about 81 times its real size, so true heights
 * multiplied by the display radius would send loops past Mars.
 */
const ENLARGED_HEIGHT_SCALE = 0.15;

/**
 * Display distance from the Sun's centre, in AU, of a coronal point `r` solar radii out, when
 * the Sun is drawn with radius `sunRadiusAu`. Physical at realistic scale.
 */
export function coronalToDisplay(r: number, sunRadiusAu: number): number {
  const enlarged = sunRadiusAu > 2 * SOLAR_RADIUS_AU;
  return sunRadiusAu * (1 + (r - 1) * (enlarged ? ENLARGED_HEIGHT_SCALE : 1));
}
