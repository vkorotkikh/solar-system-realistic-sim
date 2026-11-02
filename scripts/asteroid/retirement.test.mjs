import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

it('fails the retired acquisition command before any source acquisition with an actionable migration', () => {
  const result = spawnSync(process.execPath, ['--experimental-transform-types', 'scripts/asteroid/catalog_fetcher.ts', '--help'], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('build_asteroid_phase1_dataset.py');
  expect(result.stderr).toContain('--offline --check');
});

it('removes the disconnected resolver that manufactured taxonomy and albedo', () => {
  expect(existsSync(new URL('../../src/data/asteroidTaxonomyResolver.ts', import.meta.url))).toBe(false);
});
