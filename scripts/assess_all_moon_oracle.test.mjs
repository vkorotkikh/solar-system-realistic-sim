import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateMoonOracleIdentities } from './assess_all_moon_oracle.mjs';

const raw = JSON.parse(readFileSync(new URL('../src/data/moons.json', import.meta.url), 'utf8'));
const oracleBytes = readFileSync(new URL('../backend/tests/fixtures/all_moons_horizons_oracle.json', import.meta.url));
const oracle = JSON.parse(oracleBytes);
const withBodies = bodies => ({ ...oracle, bodies });
const withReference = (id, patch) => withBodies({ ...oracle.bodies, [id]: { ...oracle.bodies[id], ...patch } });

describe('active moon identity accounting against the historical oracle', () => {
  it('keeps the pinned 424-row evidence and explicitly accounts for retired Puck378', () => {
    expect(createHash('sha256').update(oracleBytes).digest('hex'))
      .toBe('71943bc60c7c542a8e4845c86cad2812382bd5d29a44db4e9af32f0f4ce8ad5c');
    const rows = structuredClone(raw), capture = structuredClone(oracle);
    function freeze(value) {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    }
    const accounting = validateMoonOracleIdentities(freeze(rows), freeze(capture));
    expect(accounting).toEqual({ historicalOracleCount: 424, retiredOracleRecords: [
      { catalogId: 378, activeCatalogId: 388, name: 'Puck', parent: 'Uranus', targetId: '715' },
    ] });
    expect(rows).toEqual(raw);
    expect(capture).toEqual(oracle);
    expect(capture.bodies['378'].states).toEqual(capture.bodies['388'].states);
    expect(validateMoonOracleIdentities([...raw].reverse(), oracle)).toEqual(accounting);
  });

  it('rejects every missing active reference even when historical row count stays 424', () => {
    for (const row of raw) {
      const bodies = { ...oracle.bodies };
      delete bodies[row.id];
      bodies['99999'] = { ...oracle.bodies[row.id], catalog_id: 99999 };
      expect(Object.keys(bodies)).toHaveLength(424);
      expect(() => validateMoonOracleIdentities(raw, withBodies(bodies)), `missing ${row.id}`)
        .toThrow(/Missing historical moon identity/);
    }
  });

  it.each(['catalog_id', 'name', 'planet', 'horizons_target_id'])(
    'rejects mismatched %s for every active identity, including supplemented records', field => {
      for (const row of raw) {
        expect(() => validateMoonOracleIdentities(raw, withReference(row.id, { [field]: 'wrong identity' })), `${row.id}.${field}`)
          .toThrow(/Historical moon identity mismatch/);
      }
    });

  it.each([
    ['duplicate catalog ID', rows => { rows[1] = { ...rows[1], id: rows[0].id }; }],
    ['duplicate physical identity', rows => { rows[1] = { ...rows[1], planet: rows[0].planet, iauCode: rows[0].iauCode }; }],
    ['string catalog ID', rows => { rows[0] = { ...rows[0], id: String(rows[0].id) }; }],
    ['numeric target ID', rows => { rows[0] = { ...rows[0], iauCode: Number(rows[0].iauCode) }; }],
    ['blank target ID', rows => { rows[0] = { ...rows[0], iauCode: '' }; }],
    ['unknown parent', rows => { rows[0] = { ...rows[0], planet: 'Owned parent' }; }],
  ])('rejects %s in the active catalog', (_label, mutate) => {
    const rows = raw.map(row => ({ ...row }));
    mutate(rows);
    expect(() => validateMoonOracleIdentities(rows, oracle)).toThrow(/Invalid|Duplicate/);
  });

  it('rejects fewer or more than 423 active rows', () => {
    expect(() => validateMoonOracleIdentities(raw.slice(1), oracle)).toThrow(/423/);
    expect(() => validateMoonOracleIdentities([...raw, raw[0]], oracle)).toThrow(/423/);
  });

  it.each([
    ['catalog ID coercion', { catalog_id: '21' }],
    ['target ID coercion', { horizons_target_id: 519 }],
    ['display alias substitution', { name: 'Megaclite' }],
  ])('rejects historical %s', (_label, patch) => {
    expect(() => validateMoonOracleIdentities(raw, withReference(21, patch))).toThrow(/Historical moon identity mismatch/);
  });

  it.each(['COMMAND', 'CENTER'])('rejects a conflicting %s in captured provider queries', field => {
    const query = { ...oracle.bodies['21'].query, [field]: 'wrong' };
    expect(() => validateMoonOracleIdentities(raw, withReference(21, { query }))).toThrow(/Historical moon query mismatch/);
  });

  it('requires query identity for captured and partial references', () => {
    for (const id of [21, 121]) {
      expect(() => validateMoonOracleIdentities(raw, withReference(id, { query: undefined })))
        .toThrow(/Historical moon query mismatch/);
    }
  });

  it('retains explicitly unavailable provider evidence but checks any supplied query identity', () => {
    expect(oracle.bodies['392'].status).toBe('unavailable');
    expect(oracle.bodies['392'].query).toBeUndefined();
    expect(() => validateMoonOracleIdentities(raw, oracle)).not.toThrow();
    expect(() => validateMoonOracleIdentities(raw, withReference(392, { query: { COMMAND: '715', CENTER: '500@799' } })))
      .toThrow(/Historical moon query mismatch/);
  });

  it.each([
    ['retired source row', { id: 378 }],
    ['retired ephemeris', { ephemeris: 'URA182' }],
  ])('rejects reinstating the %s for active Puck', (_label, patch) => {
    const rows = raw.map(row => row.id === 388 ? { ...row, ...patch } : row);
    expect(() => validateMoonOracleIdentities(rows, oracle)).toThrow(/Active Puck must be row 388 \/ URA184/);
  });

  it('rejects missing, replaced, or additional historical-only records', () => {
    const missing = { ...oracle.bodies }; delete missing['378'];
    const replaced = { ...missing, '99999': { ...oracle.bodies['378'], catalog_id: 99999 } };
    const extra = { ...oracle.bodies, '99999': { ...oracle.bodies['378'], catalog_id: 99999 } };
    for (const bodies of [missing, replaced, extra]) {
      expect(() => validateMoonOracleIdentities(raw, withBodies(bodies))).toThrow(/Retired historical moon identities/);
    }
  });

  it.each(['catalog_id', 'name', 'planet', 'horizons_target_id'])(
    'rejects a retired Puck record with mismatched %s', field => {
      expect(() => validateMoonOracleIdentities(raw, withReference(378, { [field]: 'wrong' })))
        .toThrow(/Historical moon identity mismatch/);
    });

  it('rejects a changed historical count declaration', () => {
    expect(() => validateMoonOracleIdentities(raw, { ...oracle, expected_catalog_count: 423 })).toThrow(/Historical oracle must retain 424/);
  });
});
