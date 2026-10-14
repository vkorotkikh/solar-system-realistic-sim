import { describe, expect, it } from 'vitest';
import {
  asteroidRecordQuantizationFailures,
  readAsteroidCatalogBinary,
  validatePackedCatalogRoundTrip100k,
  writeAsteroidCatalogBinary,
  type PackedAsteroidRecord,
} from './asteroidCatalogLoader';

const source: PackedAsteroidRecord = {
  sourceId: 2000001, epochJd: 2461320.125, aAu: 2.769165,
  e: 0.076009, iDeg: 10.594067, ascendingNodeDeg: 80.305531,
  argPeriapsisDeg: 73.597694, meanAnomalyDeg: 359.999999,
  periodDays: 1681.613581, diameterKm: 939.41234, albedo: 0.09123,
  taxonomyIndex: 0,
};

describe('SCN-014 ACBF v1 quantization contract', () => {
  it('round trips 100000 rows within the declared encoding budgets', () => {
    const result = validatePackedCatalogRoundTrip100k();
    expect(result.ok).toBe(true);
    expect(result.mismatchedRecords).toBe(0);
    expect(result.maxEpochErrorDays).toBeLessThanOrEqual(0.125);
    expect(result.maxAngleErrorDeg).toBeLessThanOrEqual(180 / 65535 + 1e-12);
  });

  it('accepts float32 round-to-nearest and circular angle wrap', () => {
    const decoded = readAsteroidCatalogBinary(writeAsteroidCatalogBinary([source])).records[0];
    expect(asteroidRecordQuantizationFailures(source, decoded)).toEqual([]);
    expect(asteroidRecordQuantizationFailures(
      { ...source, meanAnomalyDeg: 359.999999 }, { ...source, meanAnomalyDeg: 0 },
    )).toEqual([]);
  });

  it.each([
    ['epochJd', 0.25], ['aAu', 0.000001], ['periodDays', 0.01],
    ['diameterKm', 0.01], ['e', 2 / 65535], ['iDeg', 180 / 65535],
    ['ascendingNodeDeg', 360 / 65535], ['argPeriapsisDeg', 360 / 65535],
    ['meanAnomalyDeg', 360 / 65535], ['albedo', 2 / 65535],
    ['sourceId', 1], ['taxonomyIndex', 1],
  ] as const)('rejects errors beyond the %s budget', (field, error) => {
    expect(asteroidRecordQuantizationFailures(source, {
      ...source, [field]: source[field] + error,
    })).toContain(field);
  });

  it('rejects nonfinite decoded measurements', () => {
    expect(asteroidRecordQuantizationFailures(source, { ...source, epochJd: NaN }))
      .toContain('epochJd');
  });
});
