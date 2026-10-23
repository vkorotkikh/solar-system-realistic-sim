/**
 * NOTE (R4): several tests in this file re-implement the frame-conversion math
 * they check (raDecToEquatorialUnit, crossProduct, the plane->ecliptic rotation
 * are recomputed locally and asserted equal to the code's output). That is
 * tautological -- it agrees with the implementation by construction and passed
 * while converted moon positions were ~2 orbital radii wrong (SF-9). Treat these
 * as STRUCTURAL/consistency checks only. Accuracy is pinned by the multi-epoch
 * JPL Horizons oracle in moonFrames.horizons.test.ts, never by recomputing the formula.
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

describe('moon-aware display radii (B024)', () => {
  const visibleParentRadii = {
    earth: 0.001670210938369994,
    mars: 0.00004073420277632334,
    jupiter: 0.0005561576485727347,
    saturn: 0.0005804895456977919,
    uranus: 0.00021618456097450325,
    neptune: 0.00020942811454067043,
    pluto: 0.0000851616399377,
  } as const;
  const hiddenParentRadii = {
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

  it('defaults to the existing visible-moon parent constraints', () => {
    const defaultCatalog = createSolarSystemCatalog();
    const visibleCatalog = createSolarSystemCatalog({ moonsVisible: true });

    for (const [id, expected] of Object.entries(visibleParentRadii)) {
      expect(radius(defaultCatalog, id), `${id} default`).toBeCloseTo(expected, 15);
      expect(radius(visibleCatalog, id), `${id} explicit visible`).toBeCloseTo(expected, 15);
    }
  });

  it('restores only moon-hosting parent radii when moons are hidden', () => {
    const visibleCatalog = createSolarSystemCatalog({ moonsVisible: true });
    const hiddenCatalog = createSolarSystemCatalog({ moonsVisible: false });

    for (const [id, expected] of Object.entries(hiddenParentRadii)) {
      expect(radius(hiddenCatalog, id), `${id} hidden`).toBeCloseTo(expected, 15);
      expect(radius(hiddenCatalog, id), `${id} must no longer be moon-clamped`)
        .toBeGreaterThan(radius(visibleCatalog, id));
    }
    for (const [id, expected] of [
      ['sun', 0.3755114512235279],
      ['mercury', 0.02074519414225859],
      ['venus', 0.03267319268146289],
    ] as const) {
      expect(radius(hiddenCatalog, id), `${id} hidden`).toBeCloseTo(expected, 15);
      expect(radius(hiddenCatalog, id), `${id} unaffected`)
        .toBe(radius(visibleCatalog, id));
    }
  });

  it('retains every moon record and the Earth barycentric correction in hidden mode', () => {
    const visibleCatalog = createSolarSystemCatalog({ moonsVisible: true });
    const hiddenCatalog = createSolarSystemCatalog({ moonsVisible: false });
    const visibleMoons = visibleCatalog.bodies.filter(body => body.type === 'moon');
    const hiddenMoons = hiddenCatalog.bodies.filter(body => body.type === 'moon');

    expect(hiddenCatalog.bodies.map(body => body.id)).toEqual(
      visibleCatalog.bodies.map(body => body.id),
    );
    expect(hiddenCatalog.bodies.map(({ displayRadiusAu: _displayRadiusAu, ...body }) => body))
      .toEqual(visibleCatalog.bodies.map(({ displayRadiusAu: _displayRadiusAu, ...body }) => body));
    expect(hiddenMoons).toHaveLength(424);
    expect(hiddenMoons).toEqual(visibleMoons);
    expect(hiddenCatalog.jumpBodyIds).toEqual(visibleCatalog.jumpBodyIds);
    expect(hiddenCatalog.plannerBodyIds).toEqual(visibleCatalog.plannerBodyIds);

    const earth = hiddenCatalog.bodies.find(body => body.id === 'earth')!;
    const moon = hiddenCatalog.bodies.find(body => (
      body.parentId === 'earth' && body.name === 'Moon'
    ))!;
    expect(earth.orbit?.barycentreCompanion?.orbit).toBe(moon.orbit);
    expect(earth.orbit?.barycentreCompanion?.massFraction).toBe(0.01215058);
  });
});
