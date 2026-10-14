import { parseMoonEphemerisArtifact, type GeneratedMoonChebyshevEphemeris } from './moonEphemeris';

/** Called only by consumers that opt into fitted moon propagation. */
export async function loadMoonEphemerides(): Promise<Record<string, GeneratedMoonChebyshevEphemeris>> {
  const [canonical, repairs, native] = await Promise.all([
    import('../data/moonEphemerisChebyshev.json'),
    import('../data/moonEphemerisRepairs.json'),
    import('../data/moonEphemerisSpkRepairs.json')
  ]);
  const original = parseMoonEphemerisArtifact(canonical.default).bodies;
  const bodies = { ...original };
  for (const artifact of [repairs.default, native.default]) {
    const extension = parseMoonEphemerisArtifact(artifact).bodies;
    for (const key of Object.keys(extension)) {
      if (key in bodies) throw new Error(`moon repair would replace existing body ${key}`);
      bodies[key] = extension[key];
    }
  }
  return bodies;
}
