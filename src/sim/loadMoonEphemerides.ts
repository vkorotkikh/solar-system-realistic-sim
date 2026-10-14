import { parseMoonEphemerisArtifact, type GeneratedMoonChebyshevEphemeris } from './moonEphemeris';

/** Called only by consumers that opt into fitted moon propagation. */
export async function loadMoonEphemerides(): Promise<Record<string, GeneratedMoonChebyshevEphemeris>> {
  const [canonical, repairs] = await Promise.all([
    import('../data/moonEphemerisChebyshev.json'),
    import('../data/moonEphemerisRepairs.json')
  ]);
  const original = parseMoonEphemerisArtifact(canonical.default).bodies;
  const extension = parseMoonEphemerisArtifact(repairs.default).bodies;
  for (const key of Object.keys(extension)) {
    if (key in original) throw new Error(`moon repair would replace canonical body ${key}`);
  }
  return { ...original, ...extension };
}
