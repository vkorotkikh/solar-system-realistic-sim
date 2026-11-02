import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Run from the audited repository root with its pinned dependencies installed.
// All generated bundles/results go to a fresh temporary directory.
const repo = process.cwd();
const evidence = path.dirname(fileURLToPath(import.meta.url));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-review-probes-'));
const { build } = await import(pathToFileURL(path.join(repo, 'node_modules/esbuild/lib/main.js')).href);
const contents = fs.readFileSync(path.join(evidence, 'frontend-defect-probes.entry.ts'), 'utf8')
  .replace(
    '/tmp/solar-remediation-audit-20261029/frontend-defect-probes.json',
    path.join(output, 'frontend-defect-probes.json'),
  );
const bundle = path.join(output, 'frontend-defect-probes.mjs');
await build({
  stdin: { contents, resolveDir: repo, sourcefile: 'frontend-defect-probes.entry.ts', loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
  logLevel: 'silent',
});
await import(pathToFileURL(bundle).href);
