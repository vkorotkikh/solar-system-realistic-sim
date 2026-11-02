import { afterEach, expect, it, vi } from 'vitest';
import { OrbitalSatelliteSystem, parseTleBlock } from './satelliteSystem';
import { PRIMARY_MODELS } from './satellitePropagationCore';

// Literal fixed-width public TLE shape. These tests certify record retention,
// not SGP4 accuracy: the retained model uses mean Kepler elements and optional J2.
const line1 = '1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9990';
const line2 = '2 25544  51.6400 120.0000 0005000  80.0000  40.0000 15.50000000123450';
const parse = (text: string) => parseTleBlock(text, 'stations', PRIMARY_MODELS.earth);
const geo1 = '1 99999U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9990';
const geo2 = '2 99999   0.0100  20.0000 0001000  10.0000  30.0000  1.00270000123450';
afterEach(() => vi.unstubAllGlobals());

it.each([1, 4])('retains all %i complete unnamed sets including the last pair', count => {
  const satellites = parse(Array(count).fill(`${line1}\n${line2}`).join('\n'));
  expect(satellites).toHaveLength(count);
  expect(satellites.every(satellite => satellite.meanMotionRevDay === 15.5)).toBe(true);
});

it('consumes mixed named and unnamed sets once and ignores an incomplete trailing record', () => {
  const satellites = parse(`ISS\n${line1}\n${line2}\n${line1}\n${line2}\nNamed third\n${line1}\n${line2}\n${line1}\n${line2}\nTrailing name\n${line1}`);
  expect(satellites.map(satellite => satellite.name)).toEqual(['ISS', 'Satellite 2', 'Named third', 'Satellite 4']);
});

it('recovers from an orphan line without discarding the following complete pair', () => {
  expect(parse(`2 orphan\n${line1}\n${line2}`)).toHaveLength(1);
});

it('retains distinct unnamed bodies when actual initialization merges stations and GEO feeds', async () => {
  vi.stubGlobal('fetch', async (url: string) => new Response(url === '/stations'
    ? `${line1}\n${line2}` : `${geo1}\n${geo2}`));
  const value = new OrbitalSatelliteSystem({ tleSources: { stations: '/stations', geo: '/geo' } });
  await value.initialize();
  expect(value.satellites.map(satellite => satellite.id)).toEqual(['sat-norad-25544', 'sat-norad-99999']);
  expect(value.satellites.map(satellite => satellite.category)).toEqual(['leo', 'geo']);
});

it('uses catalog identity for named records without merging equal display names', () => {
  const records = parse(`Same name\n${line1}\n${line2}\nSame name\n${geo1}\n${geo2}`);
  expect(records.map(satellite => satellite.id)).toEqual(['sat-norad-25544', 'sat-norad-99999']);
  expect(parse(`Renamed\n${line1}\n${line2}`)[0].id).toBe(records[0].id);
});

it('rejects mismatched line-one and line-two catalog numbers', () => {
  expect(parse(`${line1}\n${geo2}`)).toEqual([]);
});
