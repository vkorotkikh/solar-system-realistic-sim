// /qa 2026-10-24 — Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import { afterEach, expect, it, vi } from 'vitest';
import type { Phase1CatalogLoadOptions } from './phase1AsteroidCatalog';

// FE-ASSET-BASE / FE-025, R1029/R1130. These are literal URL contracts, not
// independent scientific certification of the catalog or its population.
// Installed Vite build config resolves both empty base and './' to BASE_URL './'.
const baseCases = [
  ['root', '/', '/data/asteroid-phase1/asteroid_phase1_main_100000.bin', '/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json'],
  ['subpath', '/observatory/', '/observatory/data/asteroid-phase1/asteroid_phase1_main_100000.bin', '/observatory/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json'],
  ['nested', '/nested/solar/', '/nested/solar/data/asteroid-phase1/asteroid_phase1_main_100000.bin', '/nested/solar/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json'],
  ['relative or configured-empty base', './', './data/asteroid-phase1/asteroid_phase1_main_100000.bin', './data/asteroid-phase1/asteroid_phase1_main_100000.meta.json'],
  ['absolute CDN', 'https://assets.example.invalid/solar/', 'https://assets.example.invalid/solar/data/asteroid-phase1/asteroid_phase1_main_100000.bin', 'https://assets.example.invalid/solar/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json'],
  ['nested without trailing slash', '/nested/solar', '/nested/solar/data/asteroid-phase1/asteroid_phase1_main_100000.bin', '/nested/solar/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json'],
  ['absolute CDN without trailing slash', 'https://assets.example.invalid/solar', 'https://assets.example.invalid/solar/data/asteroid-phase1/asteroid_phase1_main_100000.bin', 'https://assets.example.invalid/solar/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json'],
] as const;

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
async function moduleAt(base: string) {
  vi.resetModules(); vi.stubEnv('BASE_URL', base);
  return import('./phase1AsteroidCatalog');
}
async function requestedUrls(base: string, options: Phase1CatalogLoadOptions = {}, expectedFetches = 2) {
  const module = await moduleAt(base);
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response('', { status: 503, statusText: 'Owned URL selection probe' }));
  vi.stubGlobal('fetch', fetcher);
  await expect(module.loadPhase1AsteroidCatalog({ cache: false, ...options })).rejects.toMatchObject({ code: 'network-failed' });
  expect(fetcher).toHaveBeenCalledTimes(expectedFetches);
  for (const [, init] of fetcher.mock.calls) {
    expect(init?.cache).toBe('no-cache');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  return fetcher.mock.calls.map(([input]) => input);
}

for (const [name, base, binary, metadata] of baseCases) {
  it(`exports application-owned asset URLs for ${name}`, async () => {
    const module = await moduleAt(base);
    expect([module.PHASE1_CATALOG_URL, module.PHASE1_CATALOG_META_URL]).toEqual([binary, metadata]);
  });
  it(`uses application-owned asset URLs in actual loader requests for ${name}`, async () => {
    expect(await requestedUrls(base)).toEqual([binary, metadata]);
  });
}

for (const [name, url, metaUrl] of [
  ['absolute external', 'https://catalog.example.invalid/specific.bin', 'https://catalog.example.invalid/specific.json'],
  ['origin root', '/chosen/catalog.bin', '/chosen/catalog.json'],
  ['document relative', 'chosen/catalog.bin', 'chosen/catalog.json'],
] as const) {
  it(`retains ${name} caller overrides without prefixing either`, async () => {
    expect(await requestedUrls('/observatory/', { url, metaUrl })).toEqual([url, metaUrl]);
  });
}

it('retains an empty binary URL and the existing empty metadata opt-out', async () => {
  expect(await requestedUrls('/observatory/', { url: '', metaUrl: '' }, 1)).toEqual(['']);
});

it('a binary override does not suppress the independently based metadata default', async () => {
  expect(await requestedUrls('/observatory/', { url: '/chosen/catalog.bin' })).toEqual([
    '/chosen/catalog.bin', '/observatory/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json',
  ]);
});
it('a metadata override does not suppress the independently based binary default', async () => {
  expect(await requestedUrls('/observatory/', { metaUrl: '/chosen/catalog.json' })).toEqual([
    '/observatory/data/asteroid-phase1/asteroid_phase1_main_100000.bin', '/chosen/catalog.json',
  ]);
});


