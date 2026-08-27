#!/usr/bin/env node
/**
 * Moon frame + position regression gate (standalone diagnostic runner).
 *
 * Two defect classes are checked here, because the moons carry two:
 *
 *   FRAME  -- `src/sim/catalog.ts` converts satellite elements from their source
 *             frame (`laplace`, `equatorial`) into the ecliptic frame the propagator
 *             expects. A sign or node-referencing error there is invisible in the UI
 *             today because moons are not rendered (`showMoons = false`), but it
 *             silently corrupts every non-ecliptic moon's position.
 *   RATES  -- `resolveMoonSecularRates` precesses ascendingNode and argPeriapsis, and
 *             `resolveKeplerOrbitAtElapsedDays` must then advance the mean anomaly at
 *             (2*pi/periodDays - varpidot), because periodDays is the SIDEREAL period
 *             and 2*pi/periodDays is therefore already dL/dt. Precessing varpi AND
 *             advancing M at the full rate double-counts the precession.
 *
 * The second class is EXACTLY ZERO at the element epoch and grows linearly with time,
 * which is why this runs over SEVEN epochs rather than J2000 alone. Three quantities
 * are gated per moon (see src/sim/moonFrameCheck.ts):
 *
 *   errKm  -- absolute position error, per epoch; catches everything, but conflates
 *             plane error with phase error and folds at 180 deg of along-track slip
 *   plane  -- angle between modelled and true orbit normals; phase-immune, so it
 *             still bites on moons whose position budget is deliberately loose
 *   drift  -- err(epoch) - err(J2000); cancels the element set's own offset at the
 *             epoch, so it stays sharp on moons whose shipped phase is simply wrong
 *
 * It needs no network: the truth values live in scripts/fixtures/.
 * The same comparison runs inside `npm test` as src/sim/moonFrames.horizons.test.ts.
 *
 *   node scripts/verify-moon-frames.mjs [--verbose] [--json] [--epochs]
 *
 * MOON_FRAMES_CACHE_DIR overrides where the esbuild bundle is written.
 *
 * Exit 0 = every moon within budget.
 * Exit 1 = regression (a moon is outside budget, or missing from the catalog).
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
const PER_EPOCH = process.argv.includes('--epochs');

function cacheDir() {
  // Preferred location keeps the artefact inside the repo it belongs to, but
  // node_modules may be absent, symlinked to a shared tree, or read-only.
  const preferred =
    process.env.MOON_FRAMES_CACHE_DIR ||
    path.join(ROOT, 'node_modules', '.cache', 'verify-moon-frames');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-moon-frames-'));
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
      `export { evaluateMoonFrames, validateFixture, DATA_LIMITED } from ${from('src/sim/moonFrameCheck.ts')};\n`
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

const exp = (v) => (Number.isFinite(v) ? v.toExponential(2) : String(v));

async function main() {
  const fixturePath = path.join(HERE, 'fixtures', 'moon-positions-horizons.json');
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
  const report = sim.evaluateMoonFrames(catalog, sim.propagateKeplerOrbit, fixture);
  const { rows, summaries, missing, ungated, radialWarnings } = report;
  const failedRows = rows.filter((r) => !r.ok);
  const failedDrift = summaries.filter((s) => !s.driftOk);
  const failures = failedRows.length + failedDrift.length + missing.length + (report.utilisationOk ? 0 : 1);

  if (AS_JSON) {
    console.log(JSON.stringify({ ...report, failures }, null, 2));
  } else if (VERBOSE || failures) {
    for (const name of missing) console.error(`  MISSING from catalog: ${name}`);
    for (const name of ungated) console.error(`  NOT GATED (no budget entry): ${name}`);

    const keys = fixture._epochs.map((e) => e.key);
    console.log(`epochs: ${fixture._epochs.map((e) => `${e.key}=${e.label}`).join('\n        ')}\n`);

    console.log('moon        frame        maxErr(km)  worst    drift(km)  driftBudget  maxPlane  verdict');
    for (const s of summaries) {
      const why = s.ok
        ? 'ok'
        : `FAIL (${[!s.positionOk && 'position', !s.planeOk && 'plane', !s.driftOk && 'drift']
            .filter(Boolean)
            .join('+')})`;
      console.log(
        s.name.padEnd(12),
        String(s.frame).padEnd(12),
        exp(s.maxErrKm).padStart(10),
        String(s.worstEpoch).padStart(7),
        exp(s.driftKm).padStart(11),
        exp(s.driftBudgetKm).padStart(12),
        s.maxPlaneDeg.toFixed(2).padStart(9),
        ' ' + why + (s.dataLimited ? '  [data-limited]' : '')
      );
    }
    console.log('');

    if (PER_EPOCH || failedRows.length) {
      console.log('per-epoch position error (km), * = over budget');
      console.log('moon        ' + keys.map((k) => k.padStart(11)).join(''));
      const byMoon = new Map();
      for (const r of rows) {
        if (!byMoon.has(r.name)) byMoon.set(r.name, []);
        byMoon.get(r.name).push(r);
      }
      for (const [name, moonRows] of byMoon) {
        console.log(
          name.padEnd(12) +
            moonRows.map((r) => ((r.positionOk ? ' ' : '*') + exp(r.errKm)).padStart(11)).join('')
        );
      }
      console.log('');
      console.log('per-epoch plane angle (deg), * = over budget');
      console.log('moon        ' + keys.map((k) => k.padStart(11)).join(''));
      for (const [name, moonRows] of byMoon) {
        console.log(
          name.padEnd(12) +
            moonRows.map((r) => ((r.planeOk ? ' ' : '*') + r.planeDeg.toFixed(2)).padStart(11)).join('')
        );
      }
      console.log('');
    }

    console.log(
      `aggregate budget utilisation: ${report.utilisation.toFixed(1)} / ${report.utilisationBudget}` +
        (report.utilisationOk ? '' : '  OVER')
    );
    console.log('');
  }

  if (radialWarnings.length) {
    console.error(
      'fixture radial-magnitude warnings (|r| is frame-invariant, so these point at the\n' +
        'snapshot or the element set, NOT at the frame conversion):\n  ' +
        radialWarnings.join('\n  ') +
        '\n'
    );
  }

  if (failures) {
    const drifting = failedDrift.map((s) => s.name);
    console.error(
      `moon check FAILED: ${failedRows.length} of ${rows.length} moon x epoch rows outside budget, ` +
        `${failedDrift.length} moons outside their drift budget.`
    );
    if (drifting.length) {
      console.error(
        `\nDRIFT failures (${drifting.join(', ')}) mean the error GREW away from the element epoch.\n` +
          'That is a SECULAR RATE defect, not a bad element set -- drift cancels the element\n' +
          "set's own offset at the epoch. The usual cause: src/sim/orbitMath.ts precesses\n" +
          'ascendingNode and argPeriapsis, then advances the mean anomaly at 2*pi/periodDays.\n' +
          'periodDays is the SIDEREAL period, so 2*pi/periodDays is dL/dt, not dM/dt. If you\n' +
          'precess varpi you must subtract varpidot from the mean-anomaly advance, or you\n' +
          'double-count it. See src/sim/planetPositionCheck.ts -- the planets had this exact bug.'
      );
    }
    if (failedRows.some((r) => !r.planeOk)) {
      console.error(
        '\nPLANE failures are phase-immune: see src/sim/catalog.ts\n' +
          '(convertMoonOrbitFrameToEcliptic / orbitNormalFromElements / elementsFromOrbitNormal /\n' +
          'sourcePoleInEcliptic), and note that nodePrecessionYears is a rate about the PARENT pole\n' +
          'while orbitMath.ts applies it to the ECLIPTIC node.'
      );
    }
    process.exit(1);
  }
  if (!AS_JSON) {
    console.log(
      `moon check passed: ${rows.length} moon x epoch rows within budget ` +
        `(${summaries.length} moons x ${fixture._epochs.length} epochs), ` +
        `utilisation ${report.utilisation.toFixed(1)}/${report.utilisationBudget}.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
