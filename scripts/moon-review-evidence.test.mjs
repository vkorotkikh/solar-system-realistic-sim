// Regression: TOOL-112 / N0661 — default unit tests must not overwrite retained review evidence.
// Found during the 2026-10-24 Markdown audit; science cases and candidate assertions are unchanged.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { test as nativeTest } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../', import.meta.url));
let OWNED;
let nodeModuleLinks;
const TEST = 'src/sim/moonSourceExceptionIndependentReview.test.ts';
const ENV = 'SOLAR_MOON_REVIEW_EVIDENCE_DIR';
const DEFAULT = 'artifacts/moon-source-independent-review';
const FILES = ['runtime-daphnis.json', 'runtime-s2023-audit.json', 'runtime-s2023-hyperbolic-endpoints.json'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_HASH = sha(readFileSync(join(REPO, TEST)));
const INPUTS = [
  TEST, 'src/sim/moonEphemeris.ts', 'src/data/moons.json',
  'src/data/moonEphemerisDaphnis.json', 'src/data/moonEphemerisS2023S38.json',
  'backend/tests/fixtures/daphnis_independent_spk_review_oracle.json',
  'backend/tests/fixtures/daphnis_legacy_spk_capture.json',
  'scripts/moon-vector-inputs/s2023_s38/manifest.json',
  'scripts/moon-vector-inputs/s2023_s38/audit.f64.gz',
  'scripts/moon-vector-inputs/s2023_s38/hyperbolic.f64.gz',
  'scripts/moon-vector-inputs/s2023_s38/endpoints.f64.gz',
];
const INPUT_HASHES = new Map(INPUTS.map(path => [path, sha(readFileSync(join(REPO, path)))]));
const MODULES = realpathSync(join(REPO, 'node_modules'));
// An existing shared file is the cleanup sentinel; never create evidence inside dependencies.
const SHARED_SENTINEL = join(MODULES, 'vitest/package.json');
const SHARED_HASH = sha(readFileSync(SHARED_SENTINEL));
const TEMP_ROOT = realpathSync(tmpdir());
const PREFIX = 'solar-moon-review-evidence-';

function test(name, body) {
  nativeTest(name, { concurrent: false, timeout: 30000 }, () => {
    const parent = mkdtempSync(join(TEMP_ROOT, PREFIX));
    const identity = lstatSync(parent);
    OWNED = parent;
    nodeModuleLinks = [];
    try {
      body();
    } finally {
      try {
        const current = lstatSync(parent);
        assert.equal(dirname(parent), TEMP_ROOT);
        assert.ok(basename(parent).startsWith(PREFIX));
        assert.equal(current.isSymbolicLink(), false);
        assert.equal(realpathSync(parent), parent);
        assert.equal(current.dev, identity.dev);
        assert.equal(current.ino, identity.ino);
        // Remove only recorded links, before recursively deleting the owned copied tree.
        for (const link of nodeModuleLinks) {
          assert.equal(dirname(dirname(link)), parent);
          assert.equal(lstatSync(link).isSymbolicLink(), true);
          assert.equal(realpathSync(link), MODULES);
          unlinkSync(link);
        }
        rmSync(parent, { recursive: true, force: false });
        assert.equal(existsSync(parent), false);
      } finally {
        OWNED = undefined;
        nodeModuleLinks = undefined;
        for (const [path, expected] of INPUT_HASHES) {
          assert.equal(sha(readFileSync(join(REPO, path))), expected, path);
        }
        assert.equal(sha(readFileSync(SHARED_SENTINEL)), SHARED_HASH);
      }
      console.log(JSON.stringify({ removedOwnedParent: parent, copiedInputsUnchanged: INPUTS.length, sharedSentinelUnchanged: true }));
    }
  });
}

function mirror() {
  const root = mkdtempSync(join(OWNED, 'fixture-'));
  for (const [path, expected] of INPUT_HASHES) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(REPO, path), target);
    assert.equal(sha(readFileSync(target)), expected, path);
  }
  assert.equal(sha(readFileSync(join(root, TEST))), SOURCE_HASH, 'run the exact current source test');
  const link = join(root, 'node_modules');
  symlinkSync(MODULES, link, process.platform === 'win32' ? 'junction' : 'dir');
  nodeModuleLinks.push(link);
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
  writeFileSync(join(root, 'vitest.config.mjs'), `export default ${JSON.stringify({
    root, cacheDir: join(root, '.vite-cache'),
    test: { include: [TEST], fileParallelism: false, maxWorkers: 1 },
  })};\n`);
  return root;
}

function run(root, override) {
  const env = { ...process.env };
  delete env[ENV];
  if (override !== undefined) env[ENV] = override;
  const result = spawnSync(process.execPath, [join(REPO, 'node_modules/vitest/vitest.mjs'), 'run',
    '--root', root, '--config', join(root, 'vitest.config.mjs'), '--reporter=json',
    '--outputFile', join(root, 'vitest-results.json')], {
    cwd: root, env, encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024,
  });
  writeFileSync(join(root, 'stdout.txt'), result.stdout ?? '');
  writeFileSync(join(root, 'stderr.txt'), result.stderr ?? '');
  assert.equal(result.error, undefined, `owned child error: ${result.error}`);
  assert.equal(result.signal, null, 'owned child must exit normally');
  assert.ok(existsSync(join(root, 'vitest-results.json')), result.stderr);
  const report = JSON.parse(readFileSync(join(root, 'vitest-results.json'), 'utf8'));
  assert.equal(report.numTotalTests, 11, 'all original scientific cases remain collected');
  assert.equal(report.numPendingTests, 0);
  console.log(JSON.stringify({ root, override: override ?? '<unset>', exit: result.status,
    passed: report.numPassedTests, failed: report.numFailedTests, sourceSha256: SOURCE_HASH }));
  assert.equal(sha(readFileSync(join(REPO, TEST))), SOURCE_HASH, 'source must not change mid-probe');
  return { result, report };
}

function scientificPass(runResult) {
  assert.equal(runResult.result.status, 0, runResult.result.stderr);
  assert.equal(runResult.report.numPassedTests, 11);
  assert.equal(runResult.report.numFailedTests, 0);
}

function exportedEvidence(directory) {
  for (const name of FILES) {
    const bytes = readFileSync(join(directory, name), 'utf8');
    assert.ok(bytes.endsWith('\n'));
    const data = JSON.parse(bytes);
    for (const key of ['samples', 'maxPositionKm', 'maxVelocityMPerS', 'worstPositionJd', 'worstVelocityJd']) {
      assert.ok(Number.isFinite(data[key]), `${name}: ${key}`);
    }
    assert.ok(data.samples > 0);
  }
  assert.equal(JSON.parse(readFileSync(join(directory, FILES[1]))).samples, 6891);
  assert.ok(JSON.parse(readFileSync(join(directory, FILES[2]))).runtimeSpecificEnergyKm2S2 > 0);
  assert.equal(existsSync(join(directory, 'accepted-erased-handoff.json')), false);
}

test('explicit relative export retains all science and unrelated retained evidence', () => {
  const root = mirror();
  const relative = 'owned-review-output';
  const target = join(root, relative);
  mkdirSync(target);
  writeFileSync(join(target, 'keep.txt'), 'retained-other-evidence\n');
  scientificPass(run(root, relative));
  exportedEvidence(target);
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'retained-other-evidence\n');
  assert.equal(existsSync(join(root, DEFAULT)), false);
});

test('explicit absolute export preserves filenames and deliberate replacement semantics', () => {
  const root = mirror();
  const target = mkdtempSync(join(OWNED, 'absolute-output-'));
  assert.ok(isAbsolute(target));
  writeFileSync(join(target, FILES[0]), 'caller-requested replacement\n');
  scientificPass(run(root, target));
  exportedEvidence(target);
  assert.equal(existsSync(join(root, DEFAULT)), false);
});

test('explicit export failure remains a test failure, not silent success', () => {
  const root = mirror();
  const target = join(root, 'not-a-directory');
  writeFileSync(target, 'keep-file\n');
  const { result, report } = run(root, target);
  assert.equal(result.status, 1);
  assert.equal(report.numPassedTests, 8);
  assert.equal(report.numFailedTests, 3);
  assert.match(JSON.stringify(report.testResults), /EEXIST|ENOTDIR/);
  assert.equal(readFileSync(target, 'utf8'), 'keep-file\n');
});

test('default run keeps all science but creates no persistent evidence directory', () => {
  const root = mirror();
  scientificPass(run(root));
  assert.equal(existsSync(join(root, DEFAULT)), false, 'default npm-test scope must not create persistent evidence');
});

test('default run leaves retained evidence bytes and mtime unchanged', () => {
  const root = mirror();
  const target = join(root, DEFAULT);
  mkdirSync(target, { recursive: true });
  const previous = FILES.map(name => {
    const path = join(target, name);
    writeFileSync(path, `retained-${name}\n`);
    utimesSync(path, 1_600_000_000, 1_600_000_000);
    return { path, bytes: readFileSync(path), mtimeMs: statSync(path).mtimeMs };
  });
  scientificPass(run(root));
  for (const file of previous) {
    assert.deepEqual(readFileSync(file.path), file.bytes, 'do not overwrite retained review evidence');
    assert.equal(statSync(file.path).mtimeMs, file.mtimeMs);
  }
});

test('empty opt-in value disables output rather than exporting into project root', () => {
  const root = mirror();
  scientificPass(run(root, ''));
  assert.equal(existsSync(join(root, DEFAULT)), false);
  for (const name of FILES) assert.equal(existsSync(join(root, name)), false, `empty override wrote ${name}`);
});
