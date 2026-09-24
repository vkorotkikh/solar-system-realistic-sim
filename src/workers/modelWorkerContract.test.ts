import { describe, expect, it } from 'vitest';
import { createSolarSystemCatalog } from '../sim/catalog';
import {
  buildCatalogIndexContract,
  buildModelWorkerCatalog,
  isValidModelWorkerStateArray,
  MODEL_WORKER_ELEMENT_TYPE,
  MODEL_WORKER_POSITION_UNIT,
  MODEL_WORKER_RECORD_SIZE,
  MODEL_WORKER_REFERENCE_FRAME,
  MODEL_WORKER_STATE_SCHEMA_VERSION,
  MODEL_WORKER_VELOCITY_UNIT
} from './modelWorkerContract';

describe('model worker state-vector boundary', () => {
  const sourceBodies = [
    { id: 'sun', type: 'star', parentId: null, orbit: null },
    { id: 'earth', type: 'planet', parentId: 'sun', orbit: null },
    { id: 'moon', type: 'moon', parentId: 'earth', orbit: null },
    { id: 'pluto', type: 'dwarf', parentId: 'sun', orbit: null }
  ];

  it('excludes hidden moons while preserving full-catalog source indices', () => {
    const catalog = buildModelWorkerCatalog(sourceBodies);
    const contract = buildCatalogIndexContract(catalog);

    expect(contract.idByIndex).toEqual(['sun', 'earth', 'pluto']);
    expect(Array.from(contract.sourceIndexByIndex)).toEqual([0, 1, 3]);
    expect(Array.from(contract.parentIndexByIndex)).toEqual([-1, 0, 0]);
  });

  it('can include moons when rendering support is deliberately enabled', () => {
    const catalog = buildModelWorkerCatalog(sourceBodies, { includeMoons: true });
    const contract = buildCatalogIndexContract(catalog);

    expect(contract.idByIndex).toEqual(['sun', 'earth', 'moon', 'pluto']);
    expect(Array.from(contract.parentIndexByIndex)).toEqual([-1, 0, 1, 0]);
  });

  it('accepts only the declared float64 record shape without lossy coercion', () => {
    const bodyCount = 1;
    const precisePlutoCoordinateAu = 34.70912345678901;
    const payload = new Float64Array(bodyCount * MODEL_WORKER_RECORD_SIZE);
    payload[0] = precisePlutoCoordinateAu;

    expect(isValidModelWorkerStateArray(payload, bodyCount)).toBe(true);
    expect(payload[0]).toBe(precisePlutoCoordinateAu);
    expect(
      isValidModelWorkerStateArray(
        new Float32Array(bodyCount * MODEL_WORKER_RECORD_SIZE),
        bodyCount
      )
    ).toBe(false);
  });

  it('publishes one explicit schema, frame, units, stride, and dtype', () => {
    expect(MODEL_WORKER_STATE_SCHEMA_VERSION).toBe(1);
    expect(MODEL_WORKER_RECORD_SIZE).toBe(6);
    expect(MODEL_WORKER_ELEMENT_TYPE).toBe('float64');
    expect(MODEL_WORKER_POSITION_UNIT).toBe('AU');
    expect(MODEL_WORKER_VELOCITY_UNIT).toBe('AU/day');
    expect(MODEL_WORKER_REFERENCE_FRAME).toBe('heliocentric_ecliptic_j2000');
  });

  it('keeps the shipped hidden-moon payload below 512 bytes per tick', () => {
    const sourceCatalog = createSolarSystemCatalog();
    const workerCatalog = buildModelWorkerCatalog(sourceCatalog.bodies);
    const payloadBytes = workerCatalog.bodies.length * MODEL_WORKER_RECORD_SIZE * Float64Array.BYTES_PER_ELEMENT;

    expect(sourceCatalog.bodies.length).toBe(434);
    expect(workerCatalog.bodies.length).toBe(10);
    expect(payloadBytes).toBe(480);
  });
});
