#!/usr/bin/env node

import { spawn } from 'node:child_process';

function printHelp() {
  console.log(`Usage:
  npm run dev:ui -- [options]

Options:
  --width <px>             Override viewport shell width in pixels
  --height <px>            Override viewport shell height in pixels
  --render-scale <factor>  Internal render scale multiplier (0.5 - 3.0)
  --max-pixel-ratio <num>  Pixel ratio cap (1.0 - 4.0)
  --host <host>            Vite host (default: 127.0.0.1)
  --port <port>            Vite port (default: 5173)
  --open                   Open browser automatically
  --help                   Show this help
`);
}

function parsePositiveNumber(name, raw, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: "${raw}" (expected ${min}..${max})`);
  }
  return value;
}

const argv = process.argv.slice(2);
const config = {
  width: null,
  height: null,
  renderScale: null,
  maxPixelRatio: null,
  host: '127.0.0.1',
  port: 5173,
  open: false
};

try {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '--open') {
      config.open = true;
    } else if (arg === '--width') {
      config.width = parsePositiveNumber('width', next(), 640, 10_000);
    } else if (arg === '--height') {
      config.height = parsePositiveNumber('height', next(), 360, 10_000);
    } else if (arg === '--render-scale') {
      config.renderScale = parsePositiveNumber('render-scale', next(), 0.5, 3.0);
    } else if (arg === '--max-pixel-ratio') {
      config.maxPixelRatio = parsePositiveNumber('max-pixel-ratio', next(), 1.0, 4.0);
    } else if (arg === '--host') {
      config.host = next();
    } else if (arg === '--port') {
      config.port = parsePositiveNumber('port', next(), 1, 65535);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
} catch (error) {
  console.error(`[dev:ui] ${(error && error.message) || error}`);
  printHelp();
  process.exit(1);
}

const env = { ...process.env };
if (config.width !== null) env.VITE_UI_WIDTH = String(config.width);
if (config.height !== null) env.VITE_UI_HEIGHT = String(config.height);
if (config.renderScale !== null) env.VITE_RENDER_SCALE = String(config.renderScale);
if (config.maxPixelRatio !== null) env.VITE_MAX_PIXEL_RATIO = String(config.maxPixelRatio);

const viteArgs = ['vite', '--host', config.host, '--port', String(config.port)];
if (config.open) {
  viteArgs.push('--open');
}

console.log(
  `[dev:ui] host=${config.host} port=${config.port}` +
    ` width=${config.width ?? 'auto'} height=${config.height ?? 'auto'}` +
    ` renderScale=${config.renderScale ?? '1.0'} maxPixelRatio=${config.maxPixelRatio ?? '2.0'}`
);

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npxCmd, viteArgs, {
  stdio: 'inherit',
  env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
