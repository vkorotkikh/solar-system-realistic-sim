import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { assertRetired } from './catalog_fetcher.fixtures.mjs';

for (const args of [[], ['--dry-run'], ['--source', 'jpl'], ['--source', 'mpc']]) {
  it(`fails the retired command before acquisition/cache/output with actionable migration: ${args}`, () => {
    assertRetired(args);
  });
}

it('removes the disconnected resolver that manufactured taxonomy and albedo', () => {
  expect(existsSync(new URL('../../src/data/asteroidTaxonomyResolver.ts', import.meta.url))).toBe(false);
});

it('removes the unreachable pipeline that assigned taxonomy by semi-major axis', () => {
  expect(existsSync(new URL('../../src/sim/asteroids', import.meta.url))).toBe(false);
});
