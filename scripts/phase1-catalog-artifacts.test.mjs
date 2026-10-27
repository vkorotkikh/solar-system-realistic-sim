import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPhase1AsteroidCatalog } from '../src/sim/phase1AsteroidCatalog.ts';
import { generateAsteroidBelt } from '../src/sim/asteroidBelt.ts';

afterEach(() => vi.unstubAllGlobals());

it('loads the real 100k artifact and renders exactly its largest 50k source identities', async () => {
  const bytes = readFileSync(new URL('../public/data/asteroid-phase1/asteroid_phase1_main_100000.bin', import.meta.url));
  const catalog = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const metadata = readFileSync(new URL('../public/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json', import.meta.url), 'utf8');
  vi.stubGlobal('fetch', vi.fn(async url => new Response(url.endsWith('.bin') ? catalog : metadata)));
  const result = await loadPhase1AsteroidCatalog({
    url: '/artifact/catalog.bin', metaUrl: '/artifact/catalog.json', maxRecords: 100_000, cache: false,
  });
  expect(result.accepted).toBe(true);
  expect(result.taxonomyCheck.completeness).toBeCloseTo(1367 / 100000, 10);
  const population = generateAsteroidBelt(50_000, 42, { deterministicAsteroids: result.asteroids, includeNamed: false });
  expect(population.count).toBe(50_000);
  expect(population.asteroids.map(a => a.sourceId)).toEqual(result.asteroids.slice(0, 50_000).map(a => a.sourceId));
  expect(new Set(population.asteroids.map(a => a.sourceId)).size).toBe(50_000);
  expect(population.asteroids[49_999].diameterKm).toBeCloseTo(4.662, 5);
  expect(population.asteroids.filter(a => a.taxonomy === 255)).toHaveLength(48_667);
  expect(population.asteroids.filter(a => a.albedo === null)).toHaveLength(85);
});
