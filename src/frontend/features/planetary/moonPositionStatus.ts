import { J2000_JD } from '../../../constants';
import { orbitPropagationQualityAt, type KeplerOrbit } from '../../../sim/orbitMath';

/**
 * Status-bar text for moons that are not at a fitted position on this date, or
 * null when all of them are. This is the reader of the quality label: outside
 * the fitted years most moons run on mean elements and the required ones hide.
 */
export function moonPositionStatusText(
  moonOrbits: readonly KeplerOrbit[],
  julianDate: number
): string | null {
  let approximate = 0;
  let hidden = 0;
  let outside: KeplerOrbit['ephemeris'];
  for (const orbit of moonOrbits) {
    const quality = orbitPropagationQualityAt(orbit, julianDate);
    if (quality === 'jpl-fitted-ephemeris') continue;
    if (quality.startsWith('state-unavailable')) hidden += 1;
    else approximate += 1;
    if (quality.endsWith('outside-coverage') || quality.endsWith('outside-ephemeris-coverage')) {
      outside = orbit.ephemeris;
    }
  }
  if (approximate + hidden === 0) return null;

  const counts = [
    approximate ? `${approximate} approximate` : '',
    hidden ? `${hidden} hidden` : ''
  ].filter(Boolean).join(', ');
  // Julian years from J2000: the fits end at 2050-01-01 00:00 TDB, which is still 2049 in UTC.
  const year = (jd: number) => 2000 + Math.round((jd - J2000_JD) / 365.25);
  const reason = outside
    ? `fits cover ${year(outside.coverageStartJd)}–${year(outside.coverageEndJd)}`
    : 'fitted positions not loaded';
  return `Moons · ${counts} · ${reason}`;
}
