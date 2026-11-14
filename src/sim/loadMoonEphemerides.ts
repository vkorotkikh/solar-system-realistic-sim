import { parseMoonEphemerisArtifact, type GeneratedMoonChebyshevEphemeris } from './moonEphemeris';
import type { LazyMoonLoaderOptions } from './lazyMoonEphemerides';
import { MAJOR_MOONS } from '../data/planets';

/** Startup waits this long for the 16 extra fits (about 4 MB) before carrying on without them. */
const NAMED_MOON_FIT_BUDGET_MS = 4_000;

/**
 * Fits for every named moon: mean elements alone put Rhea on the wrong side of Saturn.
 * Small moons stay on mean elements, because all 410 shards total 60 MB.
 */
export async function loadNamedMoonEphemerides(lazyOptions?: LazyMoonLoaderOptions, budgetMs = NAMED_MOON_FIT_BUDGET_MS) {
  const { BASE_MOON_EPHEMERIS_KEYS } = await import('./lazyMoonEphemerides');
  const additionalBodyKeys = [...MAJOR_MOONS].map(name => name.toLowerCase())
    .filter(key => !BASE_MOON_EPHEMERIS_KEYS.has(key));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const overBudget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`named-moon fits took longer than ${budgetMs} ms`)), budgetMs);
  });
  try {
    return await Promise.race([loadMoonEphemerides({ additionalBodyKeys, lazyOptions }), overBudget]);
  } catch (error) {
    console.warn('[moons] named-moon fits unavailable; keeping the bundled fits:', error);
    return loadMoonEphemerides();
  } finally {
    clearTimeout(timer);
  }
}

/** Startup waits this long for every moon's fit (410 shards, about 59 MB) before using the named-moon fits. */
const ALL_MOON_FIT_BUDGET_MS = 15_000;

/**
 * Fits for all 423 moons, so none falls back to mean elements (Himalia was millions of km
 * off on them). Falls back to the named-moon fits if the shards fail or overrun the budget.
 */
export async function loadAllMoonEphemerides(
  lazyOptions: LazyMoonLoaderOptions = { maxConcurrentRequests: 8 },
  budgetMs = ALL_MOON_FIT_BUDGET_MS,
  namedBudgetMs = NAMED_MOON_FIT_BUDGET_MS,
) {
  const { createLazyMoonEphemerisLoader } = await import('./lazyMoonEphemerides');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const overBudget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`moon fits took longer than ${budgetMs} ms`)), budgetMs);
  });
  try {
    return await Promise.race([(async () => {
      const manifest = await createLazyMoonEphemerisLoader(lazyOptions).getManifest();
      return loadMoonEphemerides({ additionalBodyKeys: Object.keys(manifest.bodies), lazyOptions });
    })(), overBudget]);
  } catch (error) {
    console.warn('[moons] not every moon fit loaded; using the named-moon fits:', error);
    return loadNamedMoonEphemerides(lazyOptions, namedBudgetMs);
  } finally {
    clearTimeout(timer);
  }
}

/** Called only by consumers that opt into fitted moon propagation. */
export async function loadMoonEphemerides(options: {
  additionalBodyKeys?: readonly string[];
  lazyOptions?: LazyMoonLoaderOptions;
} = {}): Promise<Record<string, GeneratedMoonChebyshevEphemeris>> {
  const [canonical, repairs, native, daphnis, s2023s38] = await Promise.all([
    import('../data/moonEphemerisChebyshev.json'),
    import('../data/moonEphemerisRepairs.json'),
    import('../data/moonEphemerisSpkRepairs.json'),
    import('../data/moonEphemerisDaphnis.json'),
    import('../data/moonEphemerisS2023S38.json')
  ]);
  const original = parseMoonEphemerisArtifact(canonical.default).bodies;
  const bodies = { ...original };
  for (const artifact of [repairs.default, native.default, daphnis.default, s2023s38.default]) {
    const extension = parseMoonEphemerisArtifact(artifact).bodies;
    for (const key of Object.keys(extension)) {
      if (key in bodies) throw new Error(`moon repair would replace existing body ${key}`);
      bodies[key] = extension[key];
    }
  }
  if (options.additionalBodyKeys?.length) {
    const { loadLazyMoonEphemerides } = await import('./lazyMoonEphemerides');
    const additional = await loadLazyMoonEphemerides(options.additionalBodyKeys, options.lazyOptions);
    for (const [key, body] of Object.entries(additional)) {
      if (key in bodies) throw new Error(`lazy moon repair would replace existing body ${key}`);
      bodies[key] = body;
    }
  }
  return bodies;
}
