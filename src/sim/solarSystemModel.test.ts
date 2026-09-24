import { describe, expect, it } from 'vitest';
import generatedJson from '../data/moonEphemerisChebyshev.json';
import { createSolarSystemCatalog } from './catalog';
import { parseMoonEphemerisArtifact } from './moonEphemeris';
import { SolarSystemModel } from './solarSystemModel';

function titanModel(withEphemeris: boolean): SolarSystemModel {
  const moonEphemerides = withEphemeris
    ? parseMoonEphemerisArtifact(generatedJson).bodies
    : undefined;
  const catalog = createSolarSystemCatalog({ moonEphemerides });
  const included = new Set(['sun', 'saturn']);
  const bodies = catalog.bodies.filter((body) => included.has(body.id) || body.name === 'Titan');
  return new SolarSystemModel({ bodies });
}

describe('SolarSystemModel fitted-state availability', () => {
  it('marks a required moon unavailable outside coverage without publishing a stale state', () => {
    const model = titanModel(true);
    model.update(2_451_545);
    const titanId = model.getBodies().find((body) => body.id.includes('titan'))?.id;
    expect(titanId).toBeDefined();

    const inCoverage = model.getState(titanId!);
    expect(inCoverage?.available).toBe(true);
    const lastValidPosition = inCoverage!.worldPosition.clone();

    model.update(2_469_808.5);
    const unavailable = model.getState(titanId!);
    expect(unavailable?.available).toBe(false);
    expect(unavailable?.worldPosition.toArray()).toEqual(lastValidPosition.toArray());
    expect(model.getWorldPosition(titanId!)).toBeNull();
    expect(model.sampleBodyStateAt(titanId!, 2_469_808.5)).toBeNull();

    model.update(2_451_546);
    expect(model.getState(titanId!)?.available).toBe(true);
    expect(model.getWorldPosition(titanId!)).not.toBeNull();
  });

  it('also fails closed when a required artifact was not injected', () => {
    const model = titanModel(false);
    const titanId = model.getBodies().find((body) => body.id.includes('titan'))?.id;
    expect(titanId).toBeDefined();
    model.update(2_461_000.5);
    expect(model.getState(titanId!)?.available).toBe(false);
    expect(model.getWorldPosition(titanId!)).toBeNull();
  });
});
