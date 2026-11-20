import { parseMoonEphemerisArtifact, type GeneratedMoonChebyshevEphemeris } from './moonEphemeris';
import type { LazyMoonLoaderOptions } from './lazyMoonEphemerides';
import { MAJOR_MOONS } from '../data/planets';

/** Startup waits at most this long for the 410 shards (about 59 MB), then keeps what has arrived. */
const ALL_MOON_FIT_BUDGET_MS = 15_000;

/**
 * Fits for all 423 moons, so none falls back to mean elements (Himalia was millions of km
 * off on them). Named moons are fetched first. Every shard that arrives within the budget
 * is kept, a failed shard is retried once, and no request starts after the budget, so a
 * slow link or one bad shard costs only the moons it did not deliver.
 */
export async function loadAllMoonEphemerides(
  lazyOptions: LazyMoonLoaderOptions = { maxConcurrentRequests: 8 },
  budgetMs = ALL_MOON_FIT_BUDGET_MS,
) {
  const bodies = await loadMoonEphemerides();
  const concurrency = lazyOptions.maxConcurrentRequests ?? 8;
  const fitted: Record<string, GeneratedMoonChebyshevEphemeris> = {};
  const failures: unknown[] = [];
  let open = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>(resolve => { timer = setTimeout(resolve, budgetMs); });
  const fetchAll = async () => {
    const { createLazyMoonEphemerisLoader } = await import('./lazyMoonEphemerides');
    // One worker per loader slot, so no request waits inside the loader past the budget.
    const loader = createLazyMoonEphemerisLoader({ ...lazyOptions, maxConcurrentRequests: concurrency });
    const named = new Set([...MAJOR_MOONS].map(name => name.toLowerCase()));
    const queue = Object.keys((await loader.getManifest()).bodies)
      .filter(key => !(key in bodies))
      .sort((a, b) => Number(named.has(b)) - Number(named.has(a)));
    const worker = async () => {
      while (open && queue.length > 0) {
        const key = queue.shift()!;
        for (let attempt = 1; attempt <= 2 && open; attempt += 1) {
          try {
            Object.assign(fitted, await loader.load([key]));
            break;
          } catch (error) {
            if (attempt === 2) failures.push(error);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  };
  try {
    await Promise.race([fetchAll(), budget]);
  } catch (error) {
    failures.push(error); // the manifest itself: keep the bundled fits
  } finally {
    open = false;
    clearTimeout(timer);
  }
  const loaded = Object.keys(fitted).length;
  if (failures.length > 0 || loaded < 410) {
    console.warn(`[moons] ${loaded} of 410 moon shards loaded within ${budgetMs} ms; the other moons use mean elements.`,
      failures[0] ?? '');
  }
  return { ...bodies, ...fitted };
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
