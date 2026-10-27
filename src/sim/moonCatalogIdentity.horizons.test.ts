import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import artifact from '../data/moonEphemerisRepairs.json';
import moons from '../data/moons.json';
import oracle from '../../backend/tests/fixtures/all_moons_horizons_oracle.json';
import capture from '../../backend/tests/fixtures/neptune_moon_identity_capture.json';
import { createSolarSystemCatalog } from './catalog';
import { parseMoonEphemerisArtifact } from './moonEphemeris';
import { propagateKeplerOrbit } from './orbitMath';
import { decodedCapture } from './moonRepairTestInputs.mjs';

const fitted = parseMoonEphemerisArtifact(artifact).bodies;
const catalog = createSolarSystemCatalog({ moonEphemerides: fitted });
const identities = [['Neso', '813'], ['S2021_N1', '85052']] as const;

describe('independent Neptune moon identities', () => {
  it('keeps target identities, source hashes, coefficients, and runtime objects distinct', () => {
    const neso = fitted.neso;
    const other = fitted.s2021_n1;
    expect(neso.provenance.targetId).toBe('813');
    expect(other.provenance.targetId).toBe('85052');
    expect(neso.sourceRowsSha256).not.toBe(other.sourceRowsSha256);
    expect(neso.heldOutRowsSha256).not.toBe(other.heldOutRowsSha256);
    expect(JSON.stringify(neso.segments)).not.toBe(JSON.stringify(other.segments));
    const bodies = identities.map(([name]) => catalog.bodies.find(body =>
      body.type === 'moon' && body.parentId === 'neptune' && body.name === name)!);
    expect(bodies[0].id).not.toBe(bodies[1].id);
    expect(bodies[0].orbit!.ephemeris).toBe(neso);
    expect(bodies[1].orbit!.ephemeris).toBe(other);
  });

  for (const [name, targetId] of identities) {
    it(`${name}: fresh provider bytes match its own oracle and runtime assignment`, () => {
      const recorded = capture.moonQueries[name];
      const decoded = decodedCapture(recorded.resultUtf8GzipBase64);
      expect(decoded.sha256).toBe(recorded.resultUtf8Sha256);
      const text = decoded.text;
      expect(recorded.query.COMMAND).toBe(targetId);
      expect(recorded.query.CENTER).toBe('500@899');
      expect(text).toContain(`${name} (${targetId})`);
      expect(text).toContain('Neptune (899)');
      expect(text).toContain('Ecliptic of J2000.0');
      const source = text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n').map(line => {
        const fields = line.split(',').map(field => field.trim());
        return { jd_tdb: Number(fields[0]), position_au: fields.slice(2, 5).map(Number),
          velocity_au_per_day: fields.slice(5, 8).map(Number) };
      });
      const row = moons.find(moon => moon.name === name)!;
      expect(row.iauCode).toBe(targetId);
      const reference = (oracle.bodies as Record<string, { states?: typeof source }>)[String(row.id)];
      expect(source).toEqual(reference.states);
      expect(source).toHaveLength(7);
      const body = catalog.bodies.find(body => body.name === name && body.parentId === 'neptune')!;
      for (const state of source) {
        const p = new Vector3(), v = new Vector3();
        expect(propagateKeplerOrbit(body.orbit!, state.jd_tdb - body.orbit!.epochJd, p, v)).toBe(true);
        expect(p.distanceTo(new Vector3(...state.position_au)) * 149597870.7).toBeLessThanOrEqual(500);
        expect(v.distanceTo(new Vector3(...state.velocity_au_per_day)) * 149597870700 / 86400).toBeLessThanOrEqual(10);
      }
    });
  }
});
