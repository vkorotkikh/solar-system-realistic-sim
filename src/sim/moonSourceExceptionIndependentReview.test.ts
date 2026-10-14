/** Independent runtime/source review. Expected rejection failures are not skips. */
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { parseMoonEphemerisArtifact, propagateMoonEphemeris } from './moonEphemeris';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVIDENCE = resolve(ROOT, 'artifacts/moon-source-independent-review');
const AU_KM = 149597870.7;
const DAY = 86400;
const readJson = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const artifacts = {
  daphnis: readJson('src/data/moonEphemerisDaphnis.json'),
  s2023_s38: readJson('src/data/moonEphemerisS2023S38.json'),
};
const manifest = readJson('scripts/moon-vector-inputs/s2023_s38/manifest.json');
type BodyKey = keyof typeof artifacts;
type NativeRow = { jdTdb: number; positionKm: number[]; velocityKmS: number[] };

function record(name: string, data: unknown) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(resolve(EVIDENCE, name), `${JSON.stringify(data, null, 2)}\n`);
}

function pinnedRows(name: string): NativeRow[] {
  const entry = manifest.sets[name];
  const packed = readFileSync(resolve(ROOT, 'scripts/moon-vector-inputs/s2023_s38', entry.path));
  expect(createHash('sha256').update(packed).digest('hex')).toBe(entry.gzipSha256);
  const bytes = gunzipSync(packed);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.rowsSha256);
  expect(bytes.length).toBe(entry.rowCount * 56);
  return Array.from({ length: entry.rowCount }, (_, index) => {
    const row = Array.from({ length: 7 }, (_, column) => bytes.readDoubleLE(index * 56 + column * 8));
    return { jdTdb: row[0], positionKm: row.slice(1, 4), velocityKmS: row.slice(4, 7) };
  });
}

function measure(key: BodyKey, rows: NativeRow[], artifact = artifacts[key]) {
  const body = parseMoonEphemerisArtifact(artifact).bodies[key];
  let maxPositionKm = 0, maxVelocityMPerS = 0, worstPositionJd = 0, worstVelocityJd = 0;
  for (const row of rows) {
    const p = new Vector3(), v = new Vector3();
    expect(propagateMoonEphemeris(body, row.jdTdb, p, v), `${key} ${row.jdTdb}`).toBe(true);
    const pe = p.multiplyScalar(AU_KM).distanceTo(new Vector3(...row.positionKm));
    const ve = v.multiplyScalar(AU_KM / DAY).distanceTo(new Vector3(...row.velocityKmS)) * 1000;
    if (pe > maxPositionKm) { maxPositionKm = pe; worstPositionJd = row.jdTdb; }
    if (ve > maxVelocityMPerS) { maxVelocityMPerS = ve; worstVelocityJd = row.jdTdb; }
  }
  return { samples: rows.length, maxPositionKm, maxVelocityMPerS, worstPositionJd, worstVelocityJd };
}

describe('independent original-source runtime acceptance', () => {
  it('Daphnis: direct original-SPK states, fresh dates, both handoff sides, and exact right-hand epochs', () => {
    const oracle = readJson('artifacts/moon-source-independent-review/native-oracle.json');
    const capture = readJson('backend/tests/fixtures/daphnis_legacy_spk_capture.json');
    expect(oracle.kernelSha256).toBe(capture.sha256);
    expect(oracle.freshRandomEpochs).toBe(192);
    const result = measure('daphnis', oracle.rows);
    record('runtime-daphnis.json', result);
    expect(result.maxPositionKm).toBeLessThanOrEqual(136.5);
    expect(result.maxVelocityMPerS).toBeLessThanOrEqual(10);
  });

  it('S2023_S38: actual runtime against every pinned post-selection audit state', () => {
    const rows = pinnedRows('audit');
    expect(rows).toHaveLength(6891);
    const result = measure('s2023_s38', rows);
    record('runtime-s2023-audit.json', result);
    expect(result.maxPositionKm).toBeLessThanOrEqual(500);
    expect(result.maxVelocityMPerS).toBeLessThanOrEqual(10);
  });

  it('S2023_S38: hyperbolic osculation and exact coverage endpoints remain Cartesian states', () => {
    const rows = [...pinnedRows('hyperbolic'), ...pinnedRows('endpoints')];
    const result = measure('s2023_s38', rows);
    expect(result.maxPositionKm).toBeLessThanOrEqual(500);
    expect(result.maxVelocityMPerS).toBeLessThanOrEqual(10);
    const body = parseMoonEphemerisArtifact(artifacts.s2023_s38).bodies.s2023_s38;
    const p = new Vector3(), v = new Vector3();
    expect(propagateMoonEphemeris(body, rows[0].jdTdb, p, v)).toBe(true);
    p.multiplyScalar(AU_KM); v.multiplyScalar(AU_KM / DAY);
    const energy = v.lengthSq() / 2 - 3.793120623436167e7 / p.length();
    expect(energy).toBeGreaterThan(0);
    record('runtime-s2023-hyperbolic-endpoints.json', { ...result, runtimeSpecificEnergyKm2S2: energy });
  });

  for (const key of ['daphnis', 's2023_s38'] as const) {
    it(`${key}: uncovered and non-finite dates fail without changing either output`, () => {
      const body = parseMoonEphemerisArtifact(artifacts[key]).bodies[key];
      for (const jd of [body.coverageStartJd - 1e-6, body.coverageEndJd + 1e-6, NaN, Infinity, -Infinity]) {
        const p = new Vector3(1, 2, 3), v = new Vector3(4, 5, 6);
        expect(propagateMoonEphemeris(body, jd, p, v)).toBe(false);
        expect(p.toArray()).toEqual([1, 2, 3]);
        expect(v.toArray()).toEqual([4, 5, 6]);
      }
    });
  }
});

describe('source-exception parser rejection regressions', () => {
  const mutations: Array<[string, BodyKey, (body: any) => void]> = [
    ['target contradicts the selected body', 's2023_s38', b => { b.provenance.targetId = '65272'; }],
    ['center contradicts Saturn', 's2023_s38', b => { b.provenance.centerId = '599'; }],
    ['legacy source qualification removed', 'daphnis', b => { delete b.sourceDomain; }],
    ['post-selection audit exceeds unchanged position cap', 's2023_s38', b => { b.validation.postSelectionCrossValidation.positionErrorKm.max = 501; }],
    ['post-selection audit admitted to model selection', 's2023_s38', b => { b.validation.postSelectionCrossValidation.usedForFitOrSubdivision = true; }],
  ];
  for (const [name, key, mutate] of mutations) {
    it(`rejects ${name}`, () => {
      const artifact = structuredClone(artifacts[key]);
      mutate(artifact.bodies[key]);
      expect(() => parseMoonEphemerisArtifact(artifact)).toThrow();
    });
  }

  it('rejects erased Daphnis handoffs even when continuity is relabeled true', () => {
    const artifact = structuredClone(artifacts.daphnis);
    delete artifact.bodies.daphnis.sourceDiscontinuities;
    artifact.bodies.daphnis.validation.boundaryContinuity.runtimeStateContinuous = true;
    const oracle = readJson('artifacts/moon-source-independent-review/native-oracle.json');
    const rows = oracle.rows.filter((row: NativeRow) => row.jdTdb === 2455197.5);
    expect(rows).toHaveLength(1);
    let accepted = false;
    try { parseMoonEphemerisArtifact(artifact); accepted = true; } catch { /* Correct fail-closed result. */ }
    if (accepted) {
      record('accepted-erased-handoff.json', {
        parserAccepted: true, qualificationEvidenceStillListsNativeHandoffs: true,
        unchangedCaps: { positionKm: 136.5, velocityMPerS: 10 },
        actualRuntimeError: measure('daphnis', rows, artifact),
      });
    }
    expect(() => parseMoonEphemerisArtifact(artifact)).toThrow();
  });
});
