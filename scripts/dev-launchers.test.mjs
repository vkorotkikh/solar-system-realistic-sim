import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SOURCE_SCRIPTS = dirname(fileURLToPath(import.meta.url));
const temporaryRoots = [];
const ownedPids = new Set();

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function poll(check, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

async function readJsonWhenPresent(path, timeoutMs = 1_000) {
  return poll(async () => {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  }, timeoutMs);
}

async function makeFakeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'solar-dev-launchers-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'backend'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'vite', 'bin'), { recursive: true });
  await writeFile(join(root, 'backend', 'server.py'), '');

  for (const name of [
    'dev-full.mjs',
    'dev-full-config.mjs',
    'dev-launcher-process.mjs',
    'run-ui-dev.mjs',
  ]) {
    try {
      await copyFile(join(SOURCE_SCRIPTS, name), join(root, 'scripts', name));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return root;
}

function fakeViteSource(mode, longLived) {
  return `${longLived ? `#!${process.execPath}\n` : ''}const fs = require('node:fs');
const marker = process.env.B033_CHILD_STATE;
const record = (state) => fs.writeFileSync(marker, JSON.stringify({
  mode: ${JSON.stringify(mode)}, state, pid: process.pid, args: process.argv.slice(2),
}));
${longLived ? `process.once('SIGTERM', () => { record('terminated'); process.exit(0); });
record('started');
setTimeout(() => { record('timed-out'); process.exit(0); }, 10_000);` : `record('started');`}
`;
}

async function installFakeVite(root, { longLived = false } = {}) {
  await writeFile(
    join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    fakeViteSource('local-vite', longLived),
  );
}

async function installFakeNpx(root) {
  const bin = join(root, 'bin');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'npx'), fakeViteSource('npx-wrapper', true), { mode: 0o755 });
  return bin;
}

async function installDelayedBackendError(root) {
  const preload = join(root, 'delayed-backend-error.cjs');
  await writeFile(preload, `
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const { PassThrough } = require('node:stream');
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  if (command !== 'python3') return originalSpawn.call(this, command, args, options);
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  const deadline = Date.now() + 2_000;
  const timer = setInterval(() => {
    if (!fs.existsSync(process.env.B033_CHILD_STATE) && Date.now() < deadline) return;
    clearInterval(timer);
    const error = new Error('spawn python3 ENOENT');
    Object.assign(error, { code: 'ENOENT', path: 'python3', syscall: 'spawn python3' });
    child.emit('error', error);
  }, 10);
  return child;
};
require('node:module').syncBuiltinESMExports();
`);
  return preload;
}

function runLauncher(root, script, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', script), ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 5_000);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

afterEach(async () => {
  for (const pid of ownedPids) {
    if (isAlive(pid)) process.kill(pid, 'SIGKILL');
  }
  ownedPids.clear();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('development launcher child ownership', () => {
  it.each([
    ['dev:full', 'dev-full.mjs', ['--no-backend', '--frontend-port', '53191'], '53191'],
    ['dev:ui', 'run-ui-dev.mjs', ['--port', '53192'], '53192'],
  ])('%s invokes the local Vite CLI without npx', async (_label, script, args, port) => {
    const root = await makeFakeRoot();
    const markerPath = join(root, 'vite-state.json');
    const emptyPath = join(root, 'empty-path');
    await mkdir(emptyPath);
    await installFakeVite(root);

    const result = await runLauncher(root, script, args, {
      PATH: emptyPath,
      B033_CHILD_STATE: markerPath,
    });
    const marker = await readJsonWhenPresent(markerPath);

    expect(result).toMatchObject({ code: 0, signal: null, timedOut: false });
    expect(marker).toMatchObject({ mode: 'local-vite', state: 'started' });
    expect(marker.args).toEqual(['--host', '127.0.0.1', '--port', port, '--strictPort']);
  });

  it.skipIf(process.platform === 'win32')(
    'dev:full handles a missing backend executable and tears down its frontend sibling',
    async () => {
      const root = await makeFakeRoot();
      const markerPath = join(root, 'frontend-state.json');
      const fakePath = await installFakeNpx(root);
      const preload = await installDelayedBackendError(root);
      await installFakeVite(root, { longLived: true });

      const result = await runLauncher(root, 'dev-full.mjs', ['--frontend-port', '53193'], {
        PATH: fakePath,
        B033_CHILD_STATE: markerPath,
        NODE_OPTIONS: `--require=${preload}`,
      });
      const marker = await readJsonWhenPresent(markerPath);
      if (marker?.pid) ownedPids.add(marker.pid);
      const combined = `${result.stdout}\n${result.stderr}`;

      expect(result).toMatchObject({ code: 1, signal: null, timedOut: false });
      expect(combined).toMatch(/Failed to start .*spawn python3 ENOENT/s);
      expect(combined).not.toContain("Unhandled 'error' event");
      expect(result.stdout).toContain('Shutting down');
      expect(marker).toMatchObject({ mode: 'local-vite', state: 'terminated' });
      expect(marker.pid).toEqual(expect.any(Number));
      expect(await poll(() => !isAlive(marker.pid))).toBe(true);
    },
    10_000,
  );

  it('dev:ui reports a synchronous spawn failure without an uncaught stack', async () => {
    const root = await makeFakeRoot();
    const preload = join(root, 'throw-spawn.cjs');
    await installFakeVite(root);
    await writeFile(preload, `
const childProcess = require('node:child_process');
childProcess.spawn = () => {
  const error = new Error('forced spawn EINVAL');
  error.code = 'EINVAL';
  throw error;
};
require('node:module').syncBuiltinESMExports();
`);

    const result = await runLauncher(root, 'run-ui-dev.mjs', ['--port', '53194'], {
      NODE_OPTIONS: `--require=${preload}`,
    });
    const combined = `${result.stdout}\n${result.stderr}`;

    expect(result).toMatchObject({ code: 1, signal: null, timedOut: false });
    expect(combined).toContain('[dev:ui] Failed to start Vite: forced spawn EINVAL');
    expect(combined).not.toContain("Unhandled 'error' event");
  });

  it('dev:ui reports a deferred child error without an unhandled event', async () => {
    const root = await makeFakeRoot();
    const preload = join(root, 'async-spawn-error.cjs');
    await installFakeVite(root);
    await writeFile(preload, `
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
childProcess.spawn = () => {
  const child = new EventEmitter();
  process.nextTick(() => child.emit('error', new Error('forced async spawn ENOENT')));
  return child;
};
require('node:module').syncBuiltinESMExports();
`);

    const result = await runLauncher(root, 'run-ui-dev.mjs', ['--port', '53195'], {
      NODE_OPTIONS: `--require=${preload}`,
    });
    const combined = `${result.stdout}\n${result.stderr}`;

    expect(result).toMatchObject({ code: 1, signal: null, timedOut: false });
    expect(combined).toContain('[dev:ui] Failed to start Vite: forced async spawn ENOENT');
    expect(combined).not.toContain("Unhandled 'error' event");
  });
});
