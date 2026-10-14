import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export function parseDiagnostics(output) {
  const identities = new Map();
  let identity = null;
  const flush = () => { if (identity !== null) identities.set(identity, (identities.get(identity) || 0) + 1); };
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^(.+)\(\d+,\d+\): error (TS\d+): (.*)$/);
    if (match) { flush(); identity = `${match[1].replaceAll('\\', '/').replace(root, '')}|${match[2]}|${match[3]}`; }
    else if (line.trim()) {
      if (identity === null || !/^\s/.test(line)) throw new Error(`Unparsed compiler output: ${line}`);
      identity += `\n${line.trimEnd()}`;
    }
  }
  flush(); return identities;
}
export function compareDiagnostics(actual, baseline) {
  return [...actual].filter(([key, count]) => count > (baseline.get(key) || 0)).map(([key, count]) => `${key}: ${count} > ${baseline.get(key) || 0}`);
}
export function compilerDiagnostics(result) {
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 2) throw new Error(`Compiler exit ${result.status}`);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const parsed = parseDiagnostics(output);
  if ((result.status === 0) !== (parsed.size === 0)) throw new Error('Compiler output/exit mismatch');
  return parsed;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(readFileSync(new URL('../tests/baselines/frontend-types.json', import.meta.url), 'utf8'));
  const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
  const version = spawnSync(process.execPath, [tsc, '--version'], { encoding: 'utf8' });
  if (version.status !== 0 || version.stdout.trim() !== `Version ${baseline.typescript}`) throw new Error('TypeScript version mismatch');
  const actual = compilerDiagnostics(spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--noEmit', '--pretty', 'false'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const failures = compareDiagnostics(actual, new Map(baseline.diagnostics));
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log(`UI type delta passed: ${[...actual.values()].reduce((a,b)=>a+b,0)} legacy diagnostics; no new or increased identities.`);
}
