export interface PackedAsteroidRecord {
  sourceId: number;
  epochJd: number;
  aAu: number;
  e: number;
  iDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  periodDays: number;
  diameterKm: number;
  albedo: number;
  taxonomyIndex: number;
}

export interface AsteroidCatalogBinaryHeader {
  magic: string;
  version: number;
  flags: number;
  strideBytes: number;
  recordCount: number;
}

export interface AsteroidCatalogReaderOptions {
  maxRecords?: number;
}

export interface AsteroidCatalogBinary {
  header: AsteroidCatalogBinaryHeader;
  records: PackedAsteroidRecord[];
}

export interface RoundTripTestResult {
  version: number;
  sourceCount: number;
  encodedBytes: number;
  mismatchedRecords: number;
  maxEpochErrorDays: number;
  maxAUError: number;
  maxECCError: number;
  maxAngleErrorDeg: number;
  maxDiameterErrorKm: number;
  maxAlbedoError: number;
  ok: boolean;
}

const MAGIC = 'ACBF';
const MAGIC_BYTES = new Uint8Array([65, 67, 66, 70]); // A C B F
const VERSION = 1;
const HEADER_BYTES = 12;
const STRIDE_BYTES = 36;

const ANGLE_SCALE_U16 = 65535;
const ECENTRICITY_SCALE_U16 = 65535;
const ALBEDO_SCALE_U16 = 65535;

// ACBF v1 is a quantized format, not a lossless scientific ephemeris.
// Float32 round-to-nearest error is at most half an ULP of the source binade.
// u16 round-to-nearest error is at most half the physical interval / 65535.
export const ACBF_QUANTIZATION = Object.freeze({
  eccentricity: 0.5 / ECENTRICITY_SCALE_U16,
  inclinationDeg: 90 / ANGLE_SCALE_U16,
  angleDeg: 180 / ANGLE_SCALE_U16,
  albedo: 0.5 / ALBEDO_SCALE_U16,
});

function float32HalfUlp(value: number): number {
  return Math.max(2 ** -150, 2 ** (Math.floor(Math.log2(Math.abs(value))) - 24));
}

function circularAngleError(a: number, b: number): number {
  const delta = Math.abs(normalizeAngle360(a) - normalizeAngle360(b));
  return Math.min(delta, 360 - delta);
}

function throwIfInvalidBuffer(buffer: ArrayBuffer, expectedBytes: number): void {
  if (buffer.byteLength < expectedBytes) {
    throw new Error(`Asteroid catalog buffer is too small: expected ${expectedBytes}, got ${buffer.byteLength}.`);
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeAngle360(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function packUnsignedShort(value: number, min: number, max: number): number {
  const normalized = clampNumber(value, min, max);
  const ratio = (normalized - min) / (max - min);
  return Math.max(0, Math.min(ANGLE_SCALE_U16, Math.round(ratio * ANGLE_SCALE_U16)));
}

function unpackUnsignedShort(raw: number, min: number, max: number): number {
  const ratio = clampNumber(raw, 0, ANGLE_SCALE_U16) / ANGLE_SCALE_U16;
  return min + ratio * (max - min);
}

function packSourceId(sourceId: number): number {
  if (!Number.isFinite(sourceId)) return 0;
  const rounded = Math.trunc(sourceId);
  if (rounded <= 0) return 0;
  if (rounded >= 0x1_0000_0000) return 0xFFFF_FFFF;
  return (rounded >>> 0);
}

function packTaxonomyIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(index)));
}

function toHeaderView(count: number): DataView {
  const buffer = new ArrayBuffer(HEADER_BYTES);
  const header = new DataView(buffer);
  for (let i = 0; i < MAGIC_BYTES.length; i += 1) {
    header.setUint8(i, MAGIC_BYTES[i]);
  }
  header.setUint8(4, VERSION);
  header.setUint8(5, 0);
  header.setUint8(6, STRIDE_BYTES);
  header.setUint8(7, 0);
  header.setUint32(8, count, true);
  return header;
}

function readHeaderView(buffer: ArrayBuffer): AsteroidCatalogBinaryHeader {
  const header = new DataView(buffer);
  const magic = String.fromCharCode(
    header.getUint8(0),
    header.getUint8(1),
    header.getUint8(2),
    header.getUint8(3)
  );
  if (magic !== MAGIC) {
    throw new Error(`Unsupported catalog magic "${magic}". Expected "${MAGIC}".`);
  }

  const version = header.getUint8(4);
  if (version !== VERSION) {
    throw new Error(`Unsupported catalog version ${version}. Supported version is ${VERSION}.`);
  }

  const strideBytes = header.getUint8(6);
  if (strideBytes !== STRIDE_BYTES) {
    throw new Error(`Unexpected record stride ${strideBytes}. Expected ${STRIDE_BYTES} bytes.`);
  }

  return {
    magic,
    version,
    flags: header.getUint8(5),
    strideBytes,
    recordCount: header.getUint32(8, true)
  };
}

export function writeAsteroidCatalogBinary(records: readonly PackedAsteroidRecord[]): ArrayBuffer {
  const count = records.length;
  const bytes = HEADER_BYTES + count * STRIDE_BYTES;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  const header = toHeaderView(count);
  new Uint8Array(buffer, 0, HEADER_BYTES).set(new Uint8Array(header.buffer));

  const payloadStart = HEADER_BYTES;
  for (let i = 0; i < count; i += 1) {
    const record = records[i];
    const baseOffset = payloadStart + i * STRIDE_BYTES;

    const eClamped = clampNumber(record.e, 0, 1);
    const epoch = clampNumber(record.epochJd, -Infinity, Infinity);
    const aAu = clampNumber(record.aAu, 0.0001, 10_000);
    const iDeg = clampNumber(record.iDeg, 0, 180);
    const asc = normalizeAngle360(record.ascendingNodeDeg);
    const arg = normalizeAngle360(record.argPeriapsisDeg);
    const man = normalizeAngle360(record.meanAnomalyDeg);
    const period = clampNumber(record.periodDays, 1, 10_000_000);
    const diameter = clampNumber(record.diameterKm, 0.001, 1_000_000);
    const albedo = clampNumber(record.albedo, 0, 1);

    const eQ = packUnsignedShort(eClamped, 0, 1);
    const iQ = packUnsignedShort(iDeg, 0, 180);
    const ascQ = packUnsignedShort(asc, 0, 360);
    const argQ = packUnsignedShort(arg, 0, 360);
    const manQ = packUnsignedShort(man, 0, 360);
    const albedoQ = packUnsignedShort(albedo, 0, 1);

    view.setUint32(baseOffset, packSourceId(record.sourceId), true);
    view.setFloat32(baseOffset + 4, epoch, true);
    view.setFloat32(baseOffset + 8, aAu, true);
    view.setUint16(baseOffset + 12, eQ, true);
    view.setUint16(baseOffset + 14, iQ, true);
    view.setUint16(baseOffset + 16, ascQ, true);
    view.setUint16(baseOffset + 18, argQ, true);
    view.setUint16(baseOffset + 20, manQ, true);
    view.setFloat32(baseOffset + 22, period, true);
    view.setFloat32(baseOffset + 26, diameter, true);
    view.setUint16(baseOffset + 30, albedoQ, true);
    view.setUint8(baseOffset + 32, packTaxonomyIndex(record.taxonomyIndex));
    view.setUint8(baseOffset + 33, 0);
    view.setUint16(baseOffset + 34, 0, true);
  }

  return buffer;
}

export function readAsteroidCatalogBinary(
  buffer: ArrayBuffer,
  options: AsteroidCatalogReaderOptions = {}
): AsteroidCatalogBinary {
  throwIfInvalidBuffer(buffer, HEADER_BYTES);
  const header = readHeaderView(buffer);
  const maxBytes = HEADER_BYTES + header.recordCount * header.strideBytes;
  throwIfInvalidBuffer(buffer, maxBytes);

  const recordCount = options.maxRecords == null
    ? header.recordCount
    : Math.max(0, Math.min(options.maxRecords, header.recordCount));
  const view = new DataView(buffer, HEADER_BYTES);
  const records: PackedAsteroidRecord[] = [];
  records.length = recordCount;

  for (let i = 0; i < recordCount; i += 1) {
    const baseOffset = i * header.strideBytes;
    const sourceId = view.getUint32(baseOffset, true);
    const epochJd = view.getFloat32(baseOffset + 4, true);
    const aAu = view.getFloat32(baseOffset + 8, true);
    const e = unpackUnsignedShort(view.getUint16(baseOffset + 12, true), 0, 1);
    const iDeg = unpackUnsignedShort(view.getUint16(baseOffset + 14, true), 0, 180);
    const ascendingNodeDeg = unpackUnsignedShort(view.getUint16(baseOffset + 16, true), 0, 360);
    const argPeriapsisDeg = unpackUnsignedShort(view.getUint16(baseOffset + 18, true), 0, 360);
    const meanAnomalyDeg = unpackUnsignedShort(view.getUint16(baseOffset + 20, true), 0, 360);
    const periodDays = view.getFloat32(baseOffset + 22, true);
    const diameterKm = view.getFloat32(baseOffset + 26, true);
    const albedo = unpackUnsignedShort(view.getUint16(baseOffset + 30, true), 0, 1);
    const taxonomyIndex = view.getUint8(baseOffset + 32);

    records[i] = {
      sourceId,
      epochJd: Number.isFinite(epochJd) ? epochJd : 0,
      aAu: Number.isFinite(aAu) ? aAu : 0,
      e,
      iDeg,
      ascendingNodeDeg,
      argPeriapsisDeg,
      meanAnomalyDeg,
      periodDays: Number.isFinite(periodDays) ? periodDays : 0,
      diameterKm: Number.isFinite(diameterKm) ? diameterKm : 0,
      albedo,
      taxonomyIndex
    };
  }

  return {
    header,
    records
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateDeterministicRecords(count: number, seed = 0x13579bdf): PackedAsteroidRecord[] {
  const rng = mulberry32(seed);
  const records: PackedAsteroidRecord[] = [];
  records.length = count;

  for (let i = 0; i < count; i += 1) {
    const t = i + 1;
    const aAu = 2 + 1.5 * rng();
    const e = 0.001 + rng() * 0.99;
    const iDeg = rng() * 179;
    const ascendingNodeDeg = normalizeAngle360(rng() * 720);
    const argPeriapsisDeg = normalizeAngle360(rng() * 720 - 180);
    const meanAnomalyDeg = normalizeAngle360(rng() * 720 + 40);
    const periodDays = 365.25 * Math.pow(aAu, 1.5);
    const diameterKm = 0.5 + rng() * 200;
    const albedo = 0.04 + rng() * 0.55;

    records[i] = {
      sourceId: t,
      epochJd: 2_451_000 + (i % 12_000) * 0.125 + (rng() * 0.25),
      aAu,
      e,
      iDeg,
      ascendingNodeDeg,
      argPeriapsisDeg,
      meanAnomalyDeg,
      periodDays,
      diameterKm,
      albedo,
      taxonomyIndex: t % 3
    };
  }

  return records;
}

export function asteroidRecordQuantizationFailures(
  a: PackedAsteroidRecord, b: PackedAsteroidRecord,
): (keyof PackedAsteroidRecord)[] {
  const mismatches: (keyof PackedAsteroidRecord)[] = [];
  const check = (field: keyof PackedAsteroidRecord, budget: number, circular = false) => {
    const error = circular ? circularAngleError(a[field], b[field]) : Math.abs(a[field] - b[field]);
    const doubleRounding = Number.EPSILON * Math.max(1, Math.abs(a[field]), Math.abs(b[field]));
    if (!Number.isFinite(a[field]) || !Number.isFinite(b[field]) || error > budget + doubleRounding) {
      mismatches.push(field);
    }
  };
  check('sourceId', 0);
  check('taxonomyIndex', 0);
  for (const field of ['epochJd', 'aAu', 'periodDays', 'diameterKm'] as const) {
    check(field, float32HalfUlp(a[field]));
  }
  check('e', ACBF_QUANTIZATION.eccentricity);
  check('iDeg', ACBF_QUANTIZATION.inclinationDeg);
  check('ascendingNodeDeg', ACBF_QUANTIZATION.angleDeg, true);
  check('argPeriapsisDeg', ACBF_QUANTIZATION.angleDeg, true);
  check('meanAnomalyDeg', ACBF_QUANTIZATION.angleDeg, true);
  check('albedo', ACBF_QUANTIZATION.albedo);
  return mismatches;
}

export function validatePackedCatalogRoundTrip(count: number): RoundTripTestResult {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Expected count > 0, got ${count}.`);
  }
  if (count > 2_000_000) {
    throw new Error(`Round-trip test count too high (${count}); limit is 2_000_000.`);
  }

  const source = generateDeterministicRecords(count);
  const packed = writeAsteroidCatalogBinary(source);
  const parsed = readAsteroidCatalogBinary(packed);

  let mismatched = 0;
  let maxEpochError = 0;
  let maxAUError = 0;
  let maxEError = 0;
  let maxAngleError = 0;
  let maxDiameterError = 0;
  let maxAlbedoError = 0;

  for (let i = 0; i < source.length; i += 1) {
    const sourceRecord = source[i];
    const decoded = parsed.records[i];
    const deltaEpoch = Math.abs(sourceRecord.epochJd - decoded.epochJd);
    const deltaAU = Math.abs(sourceRecord.aAu - decoded.aAu);
    const deltaE = Math.abs(sourceRecord.e - decoded.e);
    const deltaI = Math.abs(sourceRecord.iDeg - decoded.iDeg);
    const deltaAsc = circularAngleError(sourceRecord.ascendingNodeDeg, decoded.ascendingNodeDeg);
    const deltaArg = circularAngleError(sourceRecord.argPeriapsisDeg, decoded.argPeriapsisDeg);
    const deltaM = circularAngleError(sourceRecord.meanAnomalyDeg, decoded.meanAnomalyDeg);
    const deltaP = Math.abs(sourceRecord.periodDays - decoded.periodDays);
    const deltaD = Math.abs(sourceRecord.diameterKm - decoded.diameterKm);
    const deltaAlb = Math.abs(sourceRecord.albedo - decoded.albedo);
    const angleMax = Math.max(deltaI, deltaAsc, deltaArg, deltaM);

    const errors = [
      deltaEpoch,
      deltaAU,
      deltaE,
      angleMax,
      deltaP,
      deltaD,
      deltaAlb
    ];
    if (errors[0] + errors[1] + errors[2] + errors[3] + errors[4] + errors[5] + errors[6] > 0) {
      mismatched += asteroidRecordQuantizationFailures(sourceRecord, decoded).length > 0 ? 1 : 0;
    }
    if (deltaEpoch > maxEpochError) maxEpochError = deltaEpoch;
    if (deltaAU > maxAUError) maxAUError = deltaAU;
    if (deltaE > maxEError) maxEError = deltaE;
    if (angleMax > maxAngleError) maxAngleError = angleMax;
    if (deltaD > maxDiameterError) maxDiameterError = deltaD;
    if (deltaAlb > maxAlbedoError) maxAlbedoError = deltaAlb;
  }

  return {
    version: VERSION,
    sourceCount: source.length,
    encodedBytes: packed.byteLength,
    mismatchedRecords: mismatched,
    maxEpochErrorDays: maxEpochError,
    maxAUError,
    maxECCError: maxEError,
    maxAngleErrorDeg: maxAngleError,
    maxDiameterErrorKm: maxDiameterError,
    maxAlbedoError,
    ok: mismatched === 0
  };
}

export function validatePackedCatalogRoundTrip100k(): RoundTripTestResult {
  return validatePackedCatalogRoundTrip(100_000);
}
