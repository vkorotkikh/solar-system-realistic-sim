import { parseMoonEphemerisArtifact, type GeneratedMoonChebyshevEphemeris } from './moonEphemeris';
import type { LazyMoonLoaderOptions } from './lazyMoonEphemerides';

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
