#!/usr/bin/env node

/**
 * Unified dev launcher — starts both the Vite frontend and the Python backend
 * in a single terminal. Ctrl+C tears down both processes.
 *
 * Usage:
 *   npm run dev:full                          # defaults
 *   npm run dev:full -- --no-backend          # frontend only (same as `npm run dev`)
 *   npm run dev:full -- --backend-port 9000   # custom backend port
 *   npm run dev:full -- --open                # auto-open browser
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import {
  buildBackendArgs,
  buildFrontendArgs,
  buildFrontendEnv,
  displayHost,
  parseDevFullConfig,
} from './dev-full-config.mjs';
import { localViteInvocation, spawnObserved } from './dev-launcher-process.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BACKEND_DIR = resolve(ROOT, 'backend');

const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function prefix(tag, color) {
  return `${color}[${tag}]${COLORS.reset}`;
}

function printHelp() {
  console.log(`
Usage:  npm run dev:full -- [options]

Options:
  --no-backend              Skip starting the Python backend
  --backend-port <port>     Backend port (default: 8042)
  --frontend-port <port>    Vite dev server port (default: 5173)
  --host <host>             Bind address for both servers (default: 127.0.0.1)
  --open                    Open browser automatically
  --help                    Show this help
`);
}

let config;
let frontendEnv;
try {
  config = parseDevFullConfig(process.argv.slice(2), process.env);
  if (!config.help) frontendEnv = buildFrontendEnv(config);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printHelp();
  process.exit(1);
}
if (config.help) {
  printHelp();
  process.exit(0);
}

const children = [];
let shuttingDown = false;

function teardown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${prefix('dev', COLORS.dim)} Shutting down...`);
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(exitCode), 800);
}

process.on('SIGINT', () => teardown(0));
process.on('SIGTERM', () => teardown(0));

function spawnTagged(tag, color, command, args, opts) {
  const pfx = prefix(tag, color);
  const child = spawnObserved(
    command,
    args,
    { ...opts, stdio: ['ignore', 'pipe', 'pipe'] },
    (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${pfx} Failed to start ${command}: ${message}`);
      if (!shuttingDown) teardown(1);
    },
  );
  if (!child) return null;
  children.push(child);

  const pipe = (stream) => {
    stream.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.length > 0) console.log(`${pfx} ${line}`);
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    console.log(`${pfx} Process ended (${reason})`);
    if (!shuttingDown) teardown(code ?? 1);
  });

  return child;
}

console.log(`${prefix('dev', COLORS.green)} Solar System Realistic Sim — unified dev launcher`);
console.log(`${prefix('dev', COLORS.dim)} frontend: http://${displayHost(config.host)}:${config.frontendPort}`);

if (config.backend) {
  if (!existsSync(resolve(BACKEND_DIR, 'server.py'))) {
    console.error(`${prefix('backend', COLORS.red)} backend/server.py not found — is the backend set up?`);
    process.exit(1);
  }

  console.log(`${prefix('dev', COLORS.dim)} backend:  http://${displayHost(config.host)}:${config.backendPort}`);
  console.log();

  spawnTagged(
    'backend',
    COLORS.yellow,
    'python3',
    buildBackendArgs(config),
    { cwd: BACKEND_DIR },
  );
}

if (!shuttingDown) {
  const [, ...viteArgs] = buildFrontendArgs(config);
  const vite = localViteInvocation(viteArgs);
  spawnTagged('frontend', COLORS.cyan, vite.command, vite.args, { cwd: ROOT, env: frontendEnv });
}
