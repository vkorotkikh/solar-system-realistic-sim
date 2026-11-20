/**
 * Catalog, provenance, wiring and display regressions, not general astronomical
 * accuracy evidence. Earlier copied-transform assertions agreed with the frame
 * implementation by construction (SF-9); those assertions have been removed.
 * moonFrames.horizons.test.ts compares position, velocity, plane and drift with
 * committed multi-epoch JPL Horizons snapshots for its covered fixture bodies
 * and declared budgets. That gate does not certify every catalog moon.
 */
import { describe, expect, it } from 'vitest';
import rawMoonEphemerides from '../data/moonEphemerisChebyshev.json';
import {
  createSolarSystemCatalog,
  resolveMoonSecularRates,
  resolveMoonRotationPeriodHours
} from './catalog';
import { parseMoonEphemerisArtifact } from './moonEphemeris';

const moonEphemerides = parseMoonEphemerisArtifact(rawMoonEphemerides).bodies;

describe('moon catalog realism', () => {

  it('applies synchronous rotation defaults to major moons', () => {
    expect(resolveMoonRotationPeriodHours({ name: 'Moon', periodDays: 27.322 })).toBeCloseTo(27.322 * 24, 8);
    expect(resolveMoonRotationPeriodHours({ name: 'Europa', periodDays: 3.525463 })).toBeCloseTo(3.525463 * 24, 8);
    expect(resolveMoonRotationPeriodHours({ name: 'Triton', periodDays: 5.876854 })).toBeCloseTo(-(5.876854 * 24), 8);
  });

  it('converts published moon precession periods into secular orbit rates', () => {
    const rates = resolveMoonSecularRates({
      apsisPrecessionYears: 4_000,
      nodePrecessionYears: 2_000
    });

    expect(rates?.argPeriapsisDegPerCentury).toBeCloseTo(9, 12);
    expect(rates?.ascendingNodeDegPerCentury).toBeCloseTo(-18, 12);
  });

  it('carries precession rates into the moon orbit catalog', () => {
    const catalog = createSolarSystemCatalog();
    const moon = catalog.bodies.find((body) => body.name === 'Moon');
    const phobos = catalog.bodies.find((body) => body.name === 'Phobos');

    expect(moon?.rotationPeriodHours).toBeCloseTo(27.322 * 24, 8);
    expect(moon?.orbit?.secularRates?.argPeriapsisDegPerCentury).toBeGreaterThan(0);
    expect(moon?.orbit?.secularRates?.ascendingNodeDegPerCentury).toBeLessThan(0);

    expect(phobos?.orbitFrameSource).toBe('laplace');
    // Native source angles are retained so their rates are applied about the
    // Laplace pole before the Cartesian state is rotated to ecliptic J2000.
    expect(phobos?.orbit?.argPeriapsisDeg).toBeCloseTo(216.3, 6);
    expect(phobos?.orbit?.sourceFrameBasis).toBeDefined();
    expect(phobos?.orbit?.secularRates?.argPeriapsisDegPerCentury).toBeGreaterThan(0);
    expect(phobos?.orbit?.secularRates?.ascendingNodeDegPerCentury).toBeLessThan(0);
  });

  it('attaches provenance-backed fitted ephemerides to the corrected moon set', () => {
    const catalog = createSolarSystemCatalog({ moonEphemerides });
    for (const [name, targetId, source] of [
      ['Titan', '606', 'sat441l'],
      ['Iapetus', '608', 'sat441l'],
      ['Phoebe', '609', 'sat441l'],
      ['Cordelia', '706', 'ura184_merged']
    ] as const) {
      const moon = catalog.bodies.find((body) => body.name === name);
      expect(moon?.orbit?.ephemeris?.provenance.targetId).toBe(targetId);
      expect(moon?.orbit?.ephemerisRequired).toBe(true);
      expect(moon?.orbit?.ephemeris?.provenance.sourceEphemeris).toBe(source);
      expect(moon?.orbitEphemerisSource).toBe(source);
      expect(moon?.orbit?.ephemeris?.coverageStartJd).toBeLessThanOrEqual(2_451_545);
      expect(moon?.orbit?.ephemeris?.coverageEndJd).toBeGreaterThan(2_461_000);
    }
  });

  it('does not attach the optional fitted artifact unless a caller injects it', () => {
    const catalog = createSolarSystemCatalog();
    const titan = catalog.bodies.find((body) => body.name === 'Titan');
    expect(titan?.orbit?.ephemeris).toBeUndefined();
    expect(titan?.orbit?.ephemerisRequired).toBe(true);
    expect(catalog.bodies.find((body) => body.name === 'Rhea')?.orbit?.ephemerisRequired).toBe(false);
  });
});

describe('display radii with moons shown (B024)', () => {
  // Planets keep their enlarged display radii; the page moves each moon out by its
  // parent's enlargement instead (owner decision 2026-11-08), so no moon orbit clamps a planet.
  const enlargedRadii = {
    sun: 0.24599820128898311,
    mercury: 0.02074519414225859,
    venus: 0.03267319268146289,
    earth: 0.03352378856871639,
    mars: 0.024452153279414884,
    jupiter: 0.1110508910364973,
    saturn: 0.10135149135557898,
    uranus: 0.06688689557753447,
    neptune: 0.0659038754550899,
    pluto: 0.014478125569285549,
  } as const;

  function radius(catalog: ReturnType<typeof createSolarSystemCatalog>, id: string): number {
    return catalog.bodies.find(body => body.id === id)!.displayRadiusAu;
  }

  it('keeps every planet at its enlarged display radius', () => {
    const catalog = createSolarSystemCatalog();

    for (const [id, expected] of Object.entries(enlargedRadii)) {
      expect(radius(catalog, id), id).toBeCloseTo(expected, 15);
    }
  });

  it('retains every unique runtime moon and the Earth barycentric correction', () => {
    const catalog = createSolarSystemCatalog();

    expect(catalog.bodies.filter(body => body.type === 'moon')).toHaveLength(423);

    const earth = catalog.bodies.find(body => body.id === 'earth')!;
    const moon = catalog.bodies.find(body => (
      body.parentId === 'earth' && body.name === 'Moon'
    ))!;
    expect(earth.orbit?.barycentreCompanion?.orbit).toBe(moon.orbit);
    expect(earth.orbit?.barycentreCompanion?.massFraction).toBe(0.01215058);
  });
});
