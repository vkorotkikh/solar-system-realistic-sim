import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import alphaCentauriManifest from '../../public/solar-systems/manifests/alpha-centauri.json';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';

interface ManifestOrbit {
  a_au: number;
  e: number;
  i_deg: number;
  ascending_node_deg: number;
  arg_periapsis_deg: number;
  mean_anomaly_deg: number;
  period_days: number;
  epoch_jd: number;
}

const JULIAN_YEAR_DAYS = 365.25;
const J2000_JD = 2_451_545.0;
const J2000_JULIAN_YEAR = 2000.0;
const PUBLISHED_PERIOD_YEARS = 79.91;
const PUBLISHED_PERIASTRON_JULIAN_YEAR = 1955.66;
const POURBAIX_BOFFIN_PARALLAX_ARCSEC = 0.743;

const alphaCentauriB = (
  alphaCentauriManifest.stars as Array<{ id: string; orbit?: ManifestOrbit }>
).find((star) => star.id === 'alpha-centauri-b');

if (!alphaCentauriB?.orbit) {
  throw new Error('alpha-centauri-b orbit is missing from its shipped manifest');
}

const manifestOrbit = alphaCentauriB.orbit;
const productionOrbit: KeplerOrbit = {
  aAu: manifestOrbit.a_au,
  e: manifestOrbit.e,
  iDeg: manifestOrbit.i_deg,
  ascendingNodeDeg: manifestOrbit.ascending_node_deg,
  argPeriapsisDeg: manifestOrbit.arg_periapsis_deg,
  meanAnomalyDeg: manifestOrbit.mean_anomaly_deg,
  periodDays: manifestOrbit.period_days,
  epochJd: manifestOrbit.epoch_jd
};

describe('Alpha Centauri B published visual orbit', () => {
  it('derives its J2000 phase from the published period and periastron epoch', () => {
    const publishedPeriodDays = PUBLISHED_PERIOD_YEARS * JULIAN_YEAR_DAYS;
    const elapsedYearsSincePeriastron = J2000_JULIAN_YEAR - PUBLISHED_PERIASTRON_JULIAN_YEAR;
    const derivedJ2000MeanAnomalyDeg = 360 * elapsedYearsSincePeriastron / PUBLISHED_PERIOD_YEARS;

    expect(manifestOrbit.epoch_jd).toBe(J2000_JD);
    expect(manifestOrbit.period_days).toBeCloseTo(publishedPeriodDays, 10);
    expect(manifestOrbit.mean_anomaly_deg).toBeCloseTo(derivedJ2000MeanAnomalyDeg, 10);
  });

  it('propagates the shipped orbit to the independently calculated J2000 position', () => {
    const position = new Vector3();
    const elapsedDays = J2000_JD - manifestOrbit.epoch_jd;

    expect(propagateKeplerOrbit(productionOrbit, elapsedDays, position)).toBe(true);
    expect(position.x).toBeCloseTo(-14.176213353908755, 10);
    expect(position.y).toBeCloseTo(-12.544964552626967, 10);
    expect(position.z).toBeCloseTo(29.851142355784287, 10);
  });

  it('reproduces the independently calculated four-arcsecond model separation in 2016', () => {
    const position = new Vector3();
    const targetJd = J2000_JD + (2016.0 - J2000_JULIAN_YEAR) * JULIAN_YEAR_DAYS;
    const elapsedDays = targetJd - manifestOrbit.epoch_jd;

    expect(propagateKeplerOrbit(productionOrbit, elapsedDays, position)).toBe(true);

    // For visual-binary elements, x/y span the sky plane. At 0.743 arcsec of
    // parallax, one projected AU subtends 0.743 arcsec. The exact expectation
    // is this manifest model's independently calculated fixture; its coarse
    // external cross-check is the known approximately four-arcsecond minimum.
    const apparentSeparationArcsec = Math.hypot(position.x, position.y)
      * POURBAIX_BOFFIN_PARALLAX_ARCSEC;
    expect(apparentSeparationArcsec).toBeCloseTo(4.0036306940276205, 9);
  });
});
