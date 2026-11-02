// All-catalog diagnostic. Captured reference coverage is not an accuracy verdict.
// Run: node scripts/assess_all_moon_oracle.mjs > agent-notes/<assessment>.json
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Match active source identities before using any capture or provider supplement.
 * The 424-row capture is historical evidence: only Puck378 is retired, and its
 * replacement is the active Puck388/URA184 source, never a fallback to row378.
 */
export function validateMoonOracleIdentities(rawMoons, oracle) {
  if (!Array.isArray(rawMoons) || rawMoons.length !== 423) {
    throw new Error('Active moon catalog must contain exactly 423 unique identities');
  }
  if (!oracle || typeof oracle.bodies !== 'object' || !oracle.bodies || Array.isArray(oracle.bodies)) {
    throw new Error('Invalid historical moon oracle');
  }
  const parentCenters = { Earth: '399', Mars: '499', Jupiter: '599', Saturn: '699', Uranus: '799', Neptune: '899', Pluto: '999' };
  const ids = new Set(), identities = new Set();
  function matchReference(raw) {
    if (!Object.hasOwn(oracle.bodies, String(raw.id))) {
      throw new Error(`Missing historical moon identity: ${raw.id}`);
    }
    const reference = oracle.bodies[raw.id];
    if (!reference || reference.catalog_id !== raw.id || reference.name !== raw.name
      || reference.planet !== raw.planet || reference.horizons_target_id !== raw.iauCode) {
      throw new Error(`Historical moon identity mismatch: ${raw.id}`);
    }
    // Unavailable provider evidence has no query (currently Uranus75052). It
    // still must match every identity field before an SPK supplement is used.
    if (reference.query !== undefined || reference.status !== 'unavailable') {
      if (reference.query?.COMMAND !== raw.iauCode || reference.query?.CENTER !== `500@${parentCenters[raw.planet]}`) {
        throw new Error(`Historical moon query mismatch: ${raw.id}`);
      }
    }
  }
  for (const raw of rawMoons) {
    if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 0
      || typeof raw.name !== 'string' || !raw.name.trim()
      || typeof raw.iauCode !== 'string' || !raw.iauCode.trim()
      || !Object.hasOwn(parentCenters, raw.planet)) {
      throw new Error('Invalid active moon identity');
    }
    const key = JSON.stringify([raw.planet, raw.iauCode]);
    if (ids.has(String(raw.id)) || identities.has(key)) {
      throw new Error(`Duplicate active moon identity: ${raw.id}`);
    }
    ids.add(String(raw.id)); identities.add(key);
    if (raw.id === 378 || raw.id === 388 || (raw.planet === 'Uranus' && raw.iauCode === '715')) {
      if (raw.id !== 388 || raw.planet !== 'Uranus' || raw.name !== 'Puck'
        || raw.iauCode !== '715' || raw.ephemeris !== 'URA184') {
        throw new Error('Active Puck must be row 388 / URA184');
      }
    }
    matchReference(raw);
  }
  if (!ids.has('388')) throw new Error('Active Puck must be row 388 / URA184');
  const historicalIds = Object.keys(oracle.bodies);
  const retiredIds = historicalIds.filter(id => !ids.has(id));
  if (retiredIds.length !== 1 || retiredIds[0] !== '378') {
    throw new Error('Retired historical moon identities must be exactly Puck row 378');
  }
  matchReference({ id: 378, planet: 'Uranus', name: 'Puck', iauCode: '715' });
  if (historicalIds.length !== 424 || oracle.expected_catalog_count !== 424) {
    throw new Error('Historical oracle must retain 424 captured catalog records');
  }
  return { historicalOracleCount: historicalIds.length, retiredOracleRecords: [
    { catalogId: 378, activeCatalogId: 388, name: 'Puck', parent: 'Uranus', targetId: '715' },
  ] };
}

const source = `
import { Vector3 } from 'three';
import rawMoons from './src/data/moons.json';
import rawEphemerides from './src/data/moonEphemerisChebyshev.json';
import repairs from './src/data/moonEphemerisRepairs.json';
import native from './src/data/moonEphemerisSpkRepairs.json';
import oracle from './backend/tests/fixtures/all_moons_horizons_oracle.json';
import spk75052 from './backend/tests/fixtures/uranus_75052_spk_capture.json';
import daphnisLegacy from './backend/tests/fixtures/daphnis_legacy_spk_capture.json';
import { createSolarSystemCatalog } from './src/sim/catalog.ts';
import { moonDisplayName } from './src/sim/moonDisplayName.ts';
import { parseMoonEphemerisArtifact } from './src/sim/moonEphemeris.ts';
import { propagateKeplerOrbit, orbitPropagationQualityAt } from './src/sim/orbitMath.ts';
export function assess(validateIdentities) {
const oracleAccounting = validateIdentities(rawMoons, oracle);
const catalog = createSolarSystemCatalog({moonEphemerides: {
  ...parseMoonEphemerisArtifact(rawEphemerides).bodies,
  ...parseMoonEphemerisArtifact(repairs).bodies,
  ...parseMoonEphemerisArtifact(native).bodies
}});
const records = rawMoons.map(raw => {
  let reference = String(raw.iauCode) === '75052' ? {
    status: 'captured', provider: 'NASA/JPL NAIF SPK',
    states: spk75052.states.map(s => ({jd_tdb:s.jdTdb, position_au:s.positionAu, velocity_au_per_day:s.velocityAuDay}))
  } : oracle.bodies[String(raw.id)];
  if (String(raw.iauCode) === '635') {
    const live = reference;
    reference = {status: 'captured', provider: 'Horizons plus legacy SAT393 SPK',
      quality: daphnisLegacy.source_quality, liveProviderMissingJdTdb: live.missing_jd_tdb,
      states: daphnisLegacy.states.map(row => live.states.find(s => s.jd_tdb === row.jd_tdb) ?? row)};
  }
  const body = catalog.bodies.find(b => b.type === 'moon' && b.name === moonDisplayName(raw) && b.parentId === raw.planet.toLowerCase());
  if (!body?.orbit) throw new Error('Missing catalog orbit: ' + raw.name);
  const record = {catalogId: raw.id, name: raw.name, parent: raw.planet, targetId: raw.iauCode,
    referenceStatus: reference.status, referenceProvider: reference.provider ?? 'NASA/JPL Horizons',
    referenceQuality: reference.quality ?? 'provider_numerical_ephemeris',
    liveProviderMissingJdTdb: reference.liveProviderMissingJdTdb,
    catalogSemimajorAxisKm: raw.aKm, samples: []};
  if (reference.status === 'partial') {
    record.referenceError = reference.error;
    record.missingJdTdb = reference.missing_jd_tdb;
  }
  if (!['captured', 'partial'].includes(reference.status)) return {...record, referenceError: reference.error};
  for (const truth of reference.states) {
    const p = new Vector3(), v = new Vector3();
    const quality = orbitPropagationQualityAt(body.orbit, truth.jd_tdb);
    let available = false;
    let failure;
    try { available = propagateKeplerOrbit(body.orbit, truth.jd_tdb-body.orbit.epochJd, p, v); }
    catch (error) { failure = String(error); }
    if (!available || ![...p.toArray(), ...v.toArray()].every(Number.isFinite)) {
      record.samples.push({jdTdb: truth.jd_tdb, modelQuality: quality, status: 'model_unavailable', failure});
      continue;
    }
    const positionErrorKm = p.distanceTo(new Vector3(...truth.position_au))*149597870.7;
    const velocityErrorMs = v.distanceTo(new Vector3(...truth.velocity_au_per_day))*149597870700/86400;
    record.samples.push({jdTdb: truth.jd_tdb, modelQuality: quality, status: 'compared', positionErrorKm,
      velocityErrorMs, positionErrorOverSemimajorAxis: positionErrorKm/raw.aKm});
  }
  const compared = record.samples.filter(s => s.status === 'compared');
  if (compared.length) {
    record.maxPositionErrorKm = Math.max(...compared.map(s=>s.positionErrorKm));
    record.maxVelocityErrorMs = Math.max(...compared.map(s=>s.velocityErrorMs));
    record.maxPositionErrorOverSemimajorAxis = record.maxPositionErrorKm/raw.aKm;
  }
  return record;
});
const samples = records.flatMap(r=>r.samples);
return {schemaVersion:1,
  scope:'all_catalog_moons_independent_reference_comparison_not_accuracy_certification',
  referenceFixture:'backend/tests/fixtures/all_moons_horizons_oracle.json',
  expectedCatalogCount:rawMoons.length,
  ...oracleAccounting,
  capturedBodies:records.filter(r=>r.referenceStatus==='captured').length,
  partiallyCapturedBodies:records.filter(r=>r.referenceStatus==='partial').length,
  bodiesWithAnyReference:records.filter(r=>['captured','partial'].includes(r.referenceStatus)).length,
  unavailableReferenceBodies:records.filter(r=>!['captured','partial'].includes(r.referenceStatus)).length,
  referenceGaps:records.filter(r=>r.referenceStatus!=='captured').length,
  bodiesUsingLegacyReferenceSupplement:records.filter(r=>r.liveProviderMissingJdTdb?.length).length,
  comparedSamples:samples.filter(s=>s.status==='compared').length,
  modelUnavailableSamples:samples.filter(s=>s.status==='model_unavailable').length,
  // Descriptive severity counters, not chosen acceptance tolerances.
  bodiesWithErrorAboveOneSemimajorAxis:records.filter(r=>r.maxPositionErrorOverSemimajorAxis>1).length,
  bodiesWithErrorAboveTenPercentSemimajorAxis:records.filter(r=>r.maxPositionErrorOverSemimajorAxis>0.1).length,
  records};
}
`;
export async function assessAllMoonOracle() {
  const bundle = await build({stdin: {contents: source, resolveDir: process.cwd()},
    bundle: true, write: false, platform: 'node', format: 'esm'});
  const module = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  return module.assess(validateMoonOracleIdentities);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await assessAllMoonOracle(), null, 2));
}
