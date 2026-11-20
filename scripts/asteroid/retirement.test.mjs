import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { assertRetired } from './catalog_fetcher.fixtures.mjs';

// The retired entrypoint never parses its arguments; one bare run and one with every legacy flag,
// both over legacy caches and published outputs, cover the refusal. Native Node, no transform (TOOL-051).
const LEGACY_FILES = {
  'cache/vcatalog-fetcher-ts-1.0.0-jpl-main.json': 'broken JSON; must never be read',
  'cache/vcatalog-fetcher-ts-1.0.0-mpcorb.txt': '--------\nlegacy MPC fixture\n',
  'output/asteroid_raw_snapshot.json': 'old raw\n\0preserve',
  'output/asteroid_raw_snapshot.provenance.json': 'old provenance\n\0preserve',
};
for (const args of [[], ['--source', 'jpl,mpc', '--cache-dir', 'cache', '--output-dir', 'output', '--dry-run', '--write', '--help']]) {
  it(`fails the retired command before acquisition/cache/output with actionable migration: ${args}`, () => {
    assertRetired(args, LEGACY_FILES);
  });
}

it('removes the disconnected resolver that manufactured taxonomy and albedo', () => {
  expect(existsSync(new URL('../../src/data/asteroidTaxonomyResolver.ts', import.meta.url))).toBe(false);
});

it('removes the unreachable pipeline that assigned taxonomy by semi-major axis', () => {
  expect(existsSync(new URL('../../src/sim/asteroids', import.meta.url))).toBe(false);
});
