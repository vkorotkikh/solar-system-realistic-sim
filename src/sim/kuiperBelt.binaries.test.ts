import { expect, it } from 'vitest';
import { KBOClass, NAMED_KBOS, generateKuiperBelt } from './kuiperBelt';

it('gives every dynamical class its declared binary fraction across the generated population', () => {
  // Noll+ 2008 class fractions, as declared for the whole generated belt
  // (the backend model applies its fraction to every size as well).
  const declared: Array<[KBOClass, number]> = [
    [KBOClass.Classical, 0.22],
    [KBOClass.ResonanceCandidate, 0.05],
    [KBOClass.Scattered, 0.05],
    [KBOClass.Detached, 0.05],
  ];
  const generated = generateKuiperBelt(5_000, 137).kbos.slice(NAMED_KBOS.length);

  for (const [dynClass, fraction] of declared) {
    const members = generated.filter((kbo) => kbo.dynClass === dynClass);
    const binaries = members.filter((kbo) => kbo.binary != null).length;
    const sigma = Math.sqrt(members.length * fraction * (1 - fraction));
    expect(members.length, KBOClass[dynClass]).toBeGreaterThan(100);
    expect(Math.abs(binaries - members.length * fraction), KBOClass[dynClass]).toBeLessThan(4 * sigma);
  }
});
