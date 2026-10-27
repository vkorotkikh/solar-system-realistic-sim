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

describe('ACBF mapped decoding', () => {
  it('decodes validated row fields directly into mapped consumer records', () => {
    // Literal ACBF bytes keep this oracle independent of the binary writer.
    const bytes = new Uint8Array(12 + 2 * 36);
    bytes.set([65, 67, 66, 70, 1, 0, 36, 0, 2, 0, 0, 0]);
    const view = new DataView(bytes.buffer);
    view.setUint32(12, 42, true);
    view.setFloat32(16, 2451545, true);
    view.setFloat32(20, 2.5, true);
    view.setUint16(24, 65535, true);
    view.setUint16(26, 65535, true);
    view.setUint16(28, 65535, true);
    view.setUint16(30, 32768, true);
    view.setUint16(32, 1, true);
    view.setFloat32(34, 1444, true);
    view.setFloat32(38, 12.5, true);
    view.setUint16(42, 65535, true);
    view.setUint8(44, 2);
    view.setUint32(48, 99, true);
    const seen: number[] = [];
    const parsed = readAsteroidCatalogBinary(bytes.buffer, { maxRecords: 1 }, (record, index) => {
      seen.push(index);
      expect(record).toEqual({
        sourceId: 42, epochJd: 2451545, aAu: 2.5, e: 1, iDeg: 180,
        ascendingNodeDeg: 360, argPeriapsisDeg: 32768 / 65535 * 360,
        meanAnomalyDeg: 1 / 65535 * 360, periodDays: 1444,
        diameterKm: 12.5, albedo: 1, taxonomyIndex: 2,
      });
      return { id: `asteroid-${record.sourceId}`, row: index, radiusKm: record.diameterKm / 2 };
    });
    expect(parsed.header.recordCount).toBe(2);
    expect(parsed.records).toEqual([{ id: 'asteroid-42', row: 0, radiusKm: 6.25 }]);
    expect(seen).toEqual([0]);
  });

  it('rejects truncation before delivering any mapped row even when the selected prefix exists', () => {
    const bytes = new Uint8Array(12 + 36);
    bytes.set([65, 67, 66, 70, 1, 0, 36, 0, 2, 0, 0, 0]);
    const delivered: number[] = [];
    expect(() => readAsteroidCatalogBinary(bytes.buffer, { maxRecords: 1 }, (record, index) => {
      delivered.push(index);
      return record.sourceId;
    })).toThrow(/too small/);
    expect(delivered).toEqual([]);
  });

  it('preserves row order and independent decoded values across mapped callbacks', () => {
    const bytes = new Uint8Array(12 + 3 * 36);
    bytes.set([65, 67, 66, 70, 1, 0, 36, 0, 3, 0, 0, 0]);
    const view = new DataView(bytes.buffer);
    view.setUint32(12, 42, true);
    view.setUint32(48, 99, true);
    view.setUint32(84, 7, true);
    const decoded: PackedAsteroidRecord[] = [];
    const parsed = readAsteroidCatalogBinary(bytes.buffer, {}, (record, index) => {
      decoded.push(record);
      return `${index}:${record.sourceId}`;
    });
    expect(parsed.records).toEqual(['0:42', '1:99', '2:7']);
    expect(decoded.map(record => record.sourceId)).toEqual([42, 99, 7]);
  });
});
