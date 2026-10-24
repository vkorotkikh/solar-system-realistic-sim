import { spawn } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const COMMANDS = { warp: 'testWarp.js', scale: 'testRealisticScale.mjs', debug: 'get_errors.mjs' };

function runChild(cli, args) {
  return new Promise(resolve => {
    // Own a process group on POSIX; Playwright normally retires its own browser/server.
    const grouped = process.platform !== 'win32';
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: ROOT, env: process.env, stdio: 'inherit', detached: grouped,
    });
    let interrupted = 0;
    let escalation;
    const kill = signal => {
      if (!child.pid) return;
      try {
        if (grouped) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error.code !== 'ESRCH') console.error('Diagnostic child cleanup failed:', error.message);
      }
    };
    const interrupt = signal => {
      if (interrupted) return;
      interrupted = signal === 'SIGINT' ? 130 : 143;
      kill(signal);
      escalation = setTimeout(() => kill('SIGKILL'), 5_000);
    };
    const onInt = () => interrupt('SIGINT');
    const onTerm = () => interrupt('SIGTERM');
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
    child.on('error', error => console.error('Cannot start declared Playwright CLI:', error.message));
    child.once('close', (code, signal) => {
      clearTimeout(escalation);
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
      // Reap any remaining members of this owned group after an interrupted runner closes.
      if (interrupted && grouped) kill('SIGKILL');
      if (signal) console.error(`Diagnostic runner terminated by ${signal}.`);
      resolve(interrupted || code || (signal || code === null ? 1 : 0));
    });
  });
}

export async function runBrowserDiagnostic(scenario, args = process.argv.slice(2)) {
  const name = COMMANDS[scenario];
  if (!name) throw new Error('Unknown fixed browser diagnostic scenario.');
  const usage = `Usage: node ${name} [--output EXISTING_PARENT] | --help | --list`;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage);
    return 0;
  }
  if (args.length === 1 && args[0] === '--list') {
    console.log(scenario);
    return 0;
  }
  if (args.length !== 0 && !(args.length === 2 && args[0] === '--output'
    && args[1] && !args[1].startsWith('-'))) {
    console.error(usage);
    return 2;
  }
  const parent = args.length ? path.resolve(args[1]) : tmpdir();
  try {
    if (!statSync(parent).isDirectory()) throw new Error('not a directory');
  } catch (error) {
    console.error(`Invalid output parent ${parent}: ${error.message}\n${usage}`);
    return 2;
  }
  try {
    // Resolve before allocating artifacts; never install or use an undeclared fallback.
    const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
    const output = mkdtempSync(path.join(parent, `solar-diagnostic-${scenario}-`));
    console.log(`Diagnostic artifacts: ${output}`);
    return await runChild(cli, [
      'test', path.join(ROOT, 'tests/browser/legacy-diagnostics.spec.ts'),
      '--config', path.join(ROOT, 'playwright.config.ts'), '--project', 'chromium',
      '--grep', `\\[TOOL045 ${scenario}\\]$`, '--output', output, '--reporter', 'line',
    ]);
  } catch (error) {
    console.error(`Cannot run ${name}: ${error.message}`);
    return 1;
  }
}
