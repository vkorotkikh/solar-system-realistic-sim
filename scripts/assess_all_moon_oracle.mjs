// All-catalog diagnostic. Captured reference coverage is not an accuracy verdict.
// Run: node scripts/assess_all_moon_oracle.mjs > agent-notes/<assessment>.json
import { build } from 'esbuild';

const source = `
import { Vector3 } from 'three';
import rawMoons from './src/data/moons.json';
import rawEphemerides from './src/data/moonEphemerisChebyshev.json';
import repairs from './src/data/moonEphemerisRepairs.json';
import oracle from './backend/tests/fixtures/all_moons_horizons_oracle.json';
import spk75052 from './backend/tests/fixtures/uranus_75052_spk_capture.json';
import daphnisLegacy from './backend/tests/fixtures/daphnis_legacy_spk_capture.json';
import { createSolarSystemCatalog } from './src/sim/catalog.ts';
import { parseMoonEphemerisArtifact } from './src/sim/moonEphemeris.ts';
import { propagateKeplerOrbit, orbitPropagationQualityAt } from './src/sim/orbitMath.ts';
const catalog = createSolarSystemCatalog({moonEphemerides: {
  ...parseMoonEphemerisArtifact(rawEphemerides).bodies,
  ...parseMoonEphemerisArtifact(repairs).bodies
}});
if (Object.keys(oracle.bodies).length !== rawMoons.length) throw new Error('Oracle capture is incomplete');
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
  const body = catalog.bodies.find(b => b.type === 'moon' && b.name === raw.name && b.parentId === raw.planet.toLowerCase());
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
console.log(JSON.stringify({schemaVersion:1,
  scope:'all_catalog_moons_independent_reference_comparison_not_accuracy_certification',
  referenceFixture:'backend/tests/fixtures/all_moons_horizons_oracle.json',
  expectedCatalogCount:rawMoons.length,
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
  records}, null, 2));
`;
const bundle = await build({stdin: {contents: source, resolveDir: process.cwd()},
  bundle: true, write: false, platform: 'node', format: 'esm'});
await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
