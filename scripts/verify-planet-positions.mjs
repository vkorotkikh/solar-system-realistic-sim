#!/usr/bin/env node
/**
 * Planet-position accuracy gate (standalone diagnostic runner).
 *
 * `src/sim/orbitMath.ts` propagates the JPL Standish mean elements in
 * `src/data/planets.ts` using per-century secular rates. Errors in that
 * propagation are exactly zero at J2000 and grow linearly away from it, so they
 * are invisible to any check performed at the epoch -- and invisible to any check
 * that only asserts the elements changed.
 *
 * This propagates each catalog planet to six epochs spanning 1900-2100 and
 * compares the heliocentric ecliptic-J2000 position against a committed JPL
 * Horizons snapshot. It needs no network: the truth values live in
 * scripts/fixtures/. The fixture targets planet BARYCENTRES (Horizons ids 1..8),
 * which is what the Standish table describes; id 3 is the Earth-Moon barycentre.
 *
 * Two independent quantities are gated per planet (see src/sim/planetPositionCheck.ts):
 *   errKm  -- |r_model - r_horizons| at each epoch, against a per-planet budget;
 *             catches everything, but includes the element set's own J2000 offset,
 *             which forces the outer-planet budgets to be loose
 *   drift  -- worst (errKm - errKm at J2000) over the distant epochs; cancels that
 *             offset, so it stays sharp exactly where the absolute budget goes soft
 * plus an aggregate budget on the summed error over all 48 rows.
 *
 * The same comparison runs inside `npm test` as src/sim/planetPositions.horizons.test.ts.
 * This runner exists for the full table and for debugging without vitest.
 *
 *   node scripts/verify-planet-positions.mjs [--verbose] [--json]
 *
 * PLANET_POSITIONS_CACHE_DIR overrides where the esbuild bundle is written.
 *
 * Exit 0 = every planet within budget at every epoch.
 * Exit 1 = regression (a planet is outside budget, drifting, or missing from the catalog).
 * Exit 2 = the check could not run (missing/malformed fixture, bundle failure).
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { build } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VERBOSE = process.argv.includes('--verbose');
const AS_JSON = process.argv.includes('--json');

function cacheDir() {
  // Preferred location keeps the artefact inside the repo it belongs to, but
  // node_modules may be absent, symlinked to a shared tree, or read-only.
  const preferred =
    process.env.PLANET_POSITIONS_CACHE_DIR ||
    path.join(ROOT, 'node_modules', '.cache', 'verify-planet-positions');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-planet-positions-'));
  }
}

async function loadSim() {
  const dir = cacheDir();
  const entry = path.join(dir, 'entry.mjs');
  const from = (rel) => JSON.stringify(path.join(ROOT, rel));
  fs.writeFileSync(
    entry,
    `export { createSolarSystemCatalog } from ${from('src/sim/catalog.ts')};\n` +
      `export { propagateKeplerOrbit } from ${from('src/sim/orbitMath.ts')};\n` +
      `export { evaluatePlanetPositions, validateFixture } from ${from('src/sim/planetPositionCheck.ts')};\n`
  );
  const outfile = path.join(dir, 'bundle.cjs');
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'error'
  });
  const require = (await import('node:module')).createRequire(import.meta.url);
  return require(outfile);
}

const eng = (v, width) => (Number.isFinite(v) ? v.toExponential(2) : 'n/a').padStart(width);

function printTable(fixture, report) {
  const epochs = fixture._epochs;
  const ids = report.summaries.map((s) => s.id);
  const byId = new Map(ids.map((id) => [id, report.rows.filter((r) => r.id === id)]));

  console.log('|r_model - r_horizons| in km, heliocentric ecliptic J2000, planet barycentres\n');
  console.log(
    'planet  '.padEnd(9) +
      epochs.map((e) => e.label.slice(0, 4).padStart(11)).join('') +
      '     budget      drift   driftTol  verdict'
  );
  for (const summary of report.summaries) {
    const rows = byId.get(summary.id);
    const cells = rows
      .map((r) => (r.ok ? eng(r.errKm, 11) : eng(r.errKm, 10) + '!'))
      .join('');
    const why = summary.ok
      ? 'ok'
      : `FAIL (${[!summary.positionOk && 'err', !summary.driftOk && 'drift'].filter(Boolean).join('+')})`;
    console.log(
      summary.id.padEnd(9) +
        cells +
        eng(summary.budgetKm, 11) +
        eng(summary.driftKm, 11) +
        eng(summary.driftBudgetKm, 11) +
        '  ' +
        why
    );
  }
  console.log(
    '\n' +
      `total over ${report.rows.length} rows: ${report.totalKm.toExponential(4)} km ` +
      `(budget ${report.totalBudgetKm.toExponential(3)} km) ${report.totalOk ? 'ok' : 'FAIL'}`
  );
  console.log('epochs: ' + epochs.map((e) => e.label).join(' | '));
  console.log('"!" marks a row over its per-planet budget.\n');
}

async function main() {
  const fixturePath = path.join(HERE, 'fixtures', 'planet-positions-horizons.json');
  if (!fs.existsSync(fixturePath)) {
    console.error(`missing fixture: ${fixturePath}`);
    process.exit(2);
  }
  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (err) {
    console.error(`unreadable fixture ${fixturePath}: ${err.message}`);
    process.exit(2);
  }

  const sim = await loadSim();

  const fixtureProblems = sim.validateFixture(fixture);
  if (fixtureProblems.length) {
    console.error([`fixture ${fixturePath}:`, ...fixtureProblems].join('\n  '));
    process.exit(2);
  }

  const catalog = sim.createSolarSystemCatalog();
  const report = sim.evaluatePlanetPositions(catalog, sim.propagateKeplerOrbit, fixture);

  const radialWarnings = report.rows.map((r) => r.radialWarning).filter(Boolean);
  const overBudget = report.summaries.filter((s) => !s.ok);
  const failures = overBudget.length + report.missing.length + (report.totalOk ? 0 : 1);

  if (AS_JSON) {
    console.log(JSON.stringify({ ...report, radialWarnings }, null, 2));
  } else if (VERBOSE || failures) {
    for (const id of report.missing) console.error(`  MISSING from catalog: ${id}`);
    printTable(fixture, report);
  }

  if (report.ungated.length) {
    console.error(
      'fixture planets with no budget entry -- these are NOT gated:\n  ' +
        report.ungated.join('\n  ') +
        '\nAdd them to POSITION_BUDGET_KM/DRIFT_BUDGET_KM in src/sim/planetPositionCheck.ts.\n'
    );
  }

  if (radialWarnings.length) {
    console.error(
      'fixture radial-magnitude warnings (|r| depends only on a, e and phase, so these\n' +
        'point at the snapshot -- centre, target or units -- NOT at the propagator):\n  ' +
        radialWarnings.join('\n  ') +
        '\n'
    );
  }

  if (failures) {
    console.error(
      `planet-position check FAILED: ${overBudget.length} of ${report.summaries.length} planets ` +
        `outside budget${report.totalOk ? '' : ', aggregate over budget'}.\n` +
        'This gate measures accuracy against JPL Horizons at six epochs from 1900 to 2100.\n' +
        'A failure that is small at 2000 and large at 1900/2100 is a SECULAR RATE defect in\n' +
        'src/sim/orbitMath.ts (resolveKeplerOrbitAtElapsedDays) -- most likely the mean anomaly\n' +
        'being advanced at the mean-LONGITUDE rate while the periapsis is precessed separately,\n' +
        'which double-counts apsidal precession, or the period being rescaled by (a/a0)^1.5 on\n' +
        'top of a rate that already includes the a-drift. A failure that is uniform across all\n' +
        'six epochs is a J2000 element or frame defect in src/data/planets.ts.'
    );
    process.exit(1);
  }
  if (!AS_JSON) {
    console.log(
      `planet-position check passed: ${report.summaries.length} planets within budget at ` +
        `${fixture._epochs.length} epochs (${report.rows.length} rows, ` +
        `total ${report.totalKm.toExponential(3)} km).`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
