import { expect, it } from 'vitest';
import { parseTleBlock } from './satelliteSystem';
import { PRIMARY_MODELS } from './satellitePropagationCore';

// Literal fixed-width public TLE shape. These tests certify record retention,
// not SGP4 accuracy: the retained model uses mean Kepler elements and optional J2.
const line1 = '1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9990';
const line2 = '2 25544  51.6400 120.0000 0005000  80.0000  40.0000 15.50000000123450';
const parse = (text: string) => parseTleBlock(text, 'stations', PRIMARY_MODELS.earth);

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
