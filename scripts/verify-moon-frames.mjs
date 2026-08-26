#!/usr/bin/env node
/**
 * Moon frame-conversion regression gate (standalone diagnostic runner).
 *
 * `src/sim/catalog.ts` converts satellite elements from their source frame
 * (`laplace`, `equatorial`) into the ecliptic frame the propagator expects.
 * A sign or node-referencing error there is invisible in the UI today because
 * moons are not rendered (`showMoons = false`), but it silently corrupts every
 * non-ecliptic moon's position -- historically by up to two orbital radii.
 *
 * This propagates each moon's catalog elements and compares the resulting
 * parent-relative state against a committed JPL Horizons snapshot. It needs no
 * network: the truth values live in scripts/fixtures/.
 *
 * Two independent quantities are gated per moon (see src/sim/moonFrameCheck.ts):
 *   dr/r  -- relative position error; catches everything, but conflates plane
 *            error with phase error
 *   plane -- angle between modelled and true orbit normals; phase-immune, so it
 *            still bites on the moons whose dr/r tolerance is deliberately loose
 *
 * The same comparison runs inside `npm test` as src/sim/moonFrames.horizons.test.ts.
 * This runner exists for the sorted table and for debugging without vitest.
 *
 *   node scripts/verify-moon-frames.mjs [--verbose] [--json]
 *
 * MOON_FRAMES_CACHE_DIR overrides where the esbuild bundle is written.
 *
 * Exit 0 = all moons within tolerance.
 * Exit 1 = regression (a moon is outside tolerance, or missing from the catalog).
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
      `export { evaluateMoonFrames, validateFixture } from ${from('src/sim/moonFrameCheck.ts')};\n`
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

async function main() {
  const fixturePath = path.join(HERE, 'fixtures', 'moon-frames-j2000-horizons.json');
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
  const { rows, missing } = sim.evaluateMoonFrames(catalog, sim.propagateKeplerOrbit, fixture);
  const radialWarnings = rows.map((r) => r.radialWarning).filter(Boolean);
  const failures = rows.filter((r) => !r.ok).length + missing.length;
  const checked = rows.length;

  if (AS_JSON) {
    console.log(JSON.stringify({ checked, failures, missing, radialWarnings, rows }, null, 2));
  } else if (VERBOSE || failures) {
    for (const name of missing) console.error(`  MISSING from catalog: ${name}`);
    console.log('moon         frame        dr/r      sep(deg)  plane(deg)   tol  planeTol  verdict');
    for (const r of rows) {
      const why = r.ok
        ? 'ok'
        : `FAIL (${[!r.positionOk && 'dr/r', !r.planeOk && 'plane'].filter(Boolean).join('+')})`;
      console.log(
        r.name.padEnd(12),
        String(r.frame).padEnd(12),
        r.rel.toFixed(4).padStart(8),
        r.sepDeg.toFixed(2).padStart(9),
        r.planeDeg.toFixed(2).padStart(11),
        r.positionTol.toFixed(2).padStart(6),
        String(r.planeTolDeg).padStart(9),
        ' ' + why
      );
    }
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
    console.error(
      `moon-frame check FAILED: ${failures} of ${checked} moons outside tolerance.\n` +
        'A frame-conversion regression places moons on the wrong side of their parent.\n' +
        'See src/sim/catalog.ts (convertMoonOrbitFrameToEcliptic / orbitNormalFromElements /\n' +
        'elementsFromOrbitNormal / sourcePoleInEcliptic).'
    );
    process.exit(1);
  }
  if (!AS_JSON) console.log(`moon-frame check passed: ${checked} moons within tolerance.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
