import { expect, it } from 'vitest';
import canonical from '../data/moonEphemerisChebyshev.json';
import repairs from '../data/moonEphemerisRepairs.json';
import { loadMoonEphemerides } from './loadMoonEphemerides';

it('loads both versioned artifacts without replacing any canonical record', async () => {
  const bodies = await loadMoonEphemerides();
  expect(Object.keys(canonical.bodies).sort()).toEqual(['cordelia', 'iapetus', 'phoebe', 'titan']);
  expect(Object.keys(bodies)).toHaveLength(4 + Object.keys(repairs.bodies).length);
  for (const [key, body] of Object.entries(canonical.bodies)) expect(bodies[key]).toEqual(body);
  for (const [key, body] of Object.entries(repairs.bodies)) expect(bodies[key]).toEqual(body);
});
