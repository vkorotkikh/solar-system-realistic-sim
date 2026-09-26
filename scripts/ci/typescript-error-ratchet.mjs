#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..', '..');
const BASELINE_PATH = path.join(ROOT, 'ci', 'typescript-error-baseline.json');
const TSC_PATH = path.join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
);
const TSC_ARGS = [
  '--project',
  'tsconfig.json',
  '--strict',
  '--noEmit',
  '--pretty',
  'false'
];

export function parseDiagnostics(output) {
  const buckets = {};
  let parsedCount = 0;
  let reportedCount = 0;
  for (const line of String(output).split(/\r?\n/u)) {
    if (/error TS\d+:/u.test(line)) reportedCount += 1;
    const match = line.match(/^(.+)\(\d+,\d+\): error TS(\d+):/u);
    if (!match) continue;
    const file = match[1].replaceAll('\\', '/');
    const key = `${file}|TS${match[2]}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
    parsedCount += 1;
  }
  return { buckets, parsedCount, reportedCount };
}

export function compareAgainstBaseline(actual, baseline) {
  const violations = [];
  if (actual.reportedCount !== actual.parsedCount) {
    violations.push(
      `parsed ${actual.parsedCount} of ${actual.reportedCount} TypeScript diagnostics`
    );
  }
  if (actual.parsedCount > baseline.total_error_budget) {
    violations.push(
      `total diagnostics ${actual.parsedCount} exceed budget ${baseline.total_error_budget}`
    );
  }
  for (const [key, count] of Object.entries(actual.buckets)) {
    const budget = baseline.buckets[key];
    if (budget === undefined) {
      violations.push(`new diagnostic bucket ${key} (${count})`);
    } else if (count > budget) {
      violations.push(`diagnostic bucket ${key} grew from ${budget} to ${count}`);
    }
  }
  return violations;
}

function run() {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const version = spawnSync(TSC_PATH, ['--version'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  if (version.status !== 0) {
    throw new Error(`unable to execute pinned TypeScript: ${version.stderr}`);
  }
  const actualVersion = version.stdout.trim().replace(/^Version\s+/u, '');
  if (actualVersion !== baseline.typescript_version) {
    throw new Error(
      `TypeScript ${actualVersion} does not match baseline ${baseline.typescript_version}`
    );
  }

  const result = spawnSync(TSC_PATH, TSC_ARGS, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 2) {
    throw new Error(`TypeScript exited unexpectedly with status ${result.status}`);
  }
  const actual = parseDiagnostics(`${result.stdout}\n${result.stderr}`);
  if (result.status === 0 && actual.reportedCount !== 0) {
    throw new Error('TypeScript reported diagnostics with a successful exit status');
  }
  const violations = compareAgainstBaseline(actual, baseline);
  if (violations.length > 0) {
    process.stderr.write(`TypeScript error ratchet failed:\n- ${violations.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `TypeScript error ratchet passed: ${actual.parsedCount}/${baseline.total_error_budget} `
      + 'legacy diagnostics; no bucket exceeded its baseline.\n'
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  run();
}
