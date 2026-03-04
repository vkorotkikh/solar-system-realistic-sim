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

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

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
  --host <host>             Bind address for both servers (default: 0.0.0.0)
  --open                    Open browser automatically
  --help                    Show this help
`);
}

const argv = process.argv.slice(2);
const config = {
  backend: true,
  backendPort: 8042,
  frontendPort: 5173,
  host: '0.0.0.0',
  open: false,
};

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  const next = () => {
    const v = argv[++i];
    if (v === undefined) { console.error(`Missing value for ${arg}`); process.exit(1); }
    return v;
  };
  if (arg === '--help') { printHelp(); process.exit(0); }
  else if (arg === '--no-backend') config.backend = false;
  else if (arg === '--backend-port') config.backendPort = Number(next());
  else if (arg === '--frontend-port') config.frontendPort = Number(next());
  else if (arg === '--host') config.host = next();
  else if (arg === '--open') config.open = true;
  else { console.error(`Unknown argument: ${arg}`); printHelp(); process.exit(1); }
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
  const child = spawn(command, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);

  const pfx = prefix(tag, color);
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
console.log(`${prefix('dev', COLORS.dim)} frontend: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.frontendPort}`);

if (config.backend) {
  if (!existsSync(resolve(BACKEND_DIR, 'server.py'))) {
    console.error(`${prefix('backend', COLORS.red)} backend/server.py not found — is the backend set up?`);
    process.exit(1);
  }

  console.log(`${prefix('dev', COLORS.dim)} backend:  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.backendPort}`);
  console.log();

  spawnTagged('backend', COLORS.yellow, 'python3', [
    '-m', 'uvicorn', 'server:app',
    '--host', config.host,
    '--port', String(config.backendPort),
    '--reload',
  ], { cwd: BACKEND_DIR });
}

const viteArgs = [
  'vite',
  '--host', config.host,
  '--port', String(config.frontendPort),
];
if (config.open) viteArgs.push('--open');

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
spawnTagged('frontend', COLORS.cyan, npxCmd, viteArgs, { cwd: ROOT });
