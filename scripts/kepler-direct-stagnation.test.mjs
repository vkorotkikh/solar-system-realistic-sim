// Direct-helper refinement contract: a valid huge budget must not hide a repeated-state cycle.
// Child isolation is only a safety guard. Actual bundled exported solveKepler executes unchanged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(`${ROOT}/package.json`);
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const built = require('esbuild').buildSync({
  entryPoints: [`${ROOT}/src/sim/orbitMath.ts`], absWorkingDir: ROOT,
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22',
  metafile: true, logLevel: 'silent', packages: 'external',
});
assert.equal(built.outputFiles.length, 1);
const bundle = built.outputFiles[0].text;
const pins = Object.fromEntries(Object.keys(built.metafile.inputs).map(path => [path, sha(`${ROOT}/${path}`)]));

function invoke(args) {
  const suffix = `\nconsole.log(JSON.stringify({stage:'entered'}));\ntry { const returned = module.exports.solveKepler(...${JSON.stringify(args)}); console.log(JSON.stringify({stage:'settled', returned, finite:Number.isFinite(returned)})); }\ncatch(error) { console.log(JSON.stringify({stage:'settled', isError:error instanceof Error, name:error.name})); }\n`;
  const child = spawnSync(process.execPath, ['-e', "const fs=require('node:fs');new Function('module','exports','require',fs.readFileSync(0,'utf8'))(module,module.exports,require);"], {
    cwd: ROOT, input: bundle + suffix, timeout: 2000, killSignal: 'SIGKILL',
    encoding: 'utf8', maxBuffer: 32768,
  });
  const observations = child.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  let reaped = false;
  if (child.pid) {
    try { process.kill(child.pid, 0); } catch (error) { reaped = error.code === 'ESRCH'; }
  }
  console.log(JSON.stringify({ args, pid: child.pid, exitCode: child.status,
    signal: child.signal, error: child.error?.code ?? null, observations, reaped, pins }));
  assert.equal(reaped, true, 'owned child is gone after settlement or safety termination');
  for (const [path, hash] of Object.entries(pins)) assert.equal(sha(`${ROOT}/${path}`), hash);
  assert.equal(child.stderr, '');
  assert.equal(observations[0]?.stage, 'entered', 'actual module was loaded and exported call reached');
  assert.equal(child.error, undefined, 'solver must settle, not hit the owned child safety timeout');
  assert.equal(child.status, 0, 'child must exit normally');
  assert.equal(observations.length, 2);
  assert.equal(observations[1].stage, 'settled');
  return observations[1];
}

for (const [name, args] of [
  ['ordinary unattainable precision', [.1, .99, 1e-20, Number.MAX_SAFE_INTEGER]],
  ['near-unity unattainable precision', [1e-20, 1 - 2 ** -53, 1e-30, Number.MAX_SAFE_INTEGER]],
  ['control: large unrepresentable whole result', [1e9, .99, 1e-9, Number.MAX_SAFE_INTEGER]],
]) test(`${name} rejects repeated-state stagnation even with a huge valid budget`, () => {
  assert.equal(invoke(args).isError, true);
});

test('control: a huge valid budget still returns an accurate ordinary solution', () => {
  const result = invoke([.1, .99, 1e-9, Number.MAX_SAFE_INTEGER]);
  assert.equal(result.finite, true);
  // Independent original28 root rounded to nearest binary64; EPSILON conservatively
  // covers its rounding and this subtraction, far below the unchanged1e-9 request.
  assert.ok(Math.abs(result.returned - 0.8316604237910568) + Number.EPSILON < 1e-9);
});

test('control: a huge valid budget preserves the exact finite-boundary analytic return', () => {
  const result = invoke([Number.MAX_VALUE, .99, 1, Number.MAX_SAFE_INTEGER]);
  assert.equal(result.finite, true);
  assert.equal(result.returned, Number.MAX_VALUE);
});
