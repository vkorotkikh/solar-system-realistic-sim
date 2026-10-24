import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// Regression: TOOL-051 — native Node cannot strip constructor parameter properties.
// Found by /qa on 2026-10-24; tracked in the consolidated Markdown issue audit.
// Keep the real native entrypoint: a transformed import would hide this failure.
const script = fileURLToPath(new URL('./catalog_fetcher.ts', import.meta.url));
const fetchGuardSource = `globalThis.fetch = () => { process.stderr.write('TOOL051_UNEXPECTED_FETCH\\n'); process.exit(91); };`;
const fetchGuard = `data:text/javascript,${encodeURIComponent(fetchGuardSource)}`;

for (const flag of ['--help', '-h']) {
  it(`prints native ${flag} without acquisition or filesystem output`, () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tool051-help-'));
    try {
      const result = spawnSync(process.execPath, ['--import', fetchGuard, script, flag], {
        cwd,
        env: { PATH: dirname(process.execPath), LANG: 'C.UTF-8', TZ: 'UTC' },
        encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
      });
      const diagnostics = JSON.stringify({ command: [process.execPath, '--import', '<fetch guard>', script, flag],
        error: result.error?.message, signal: result.signal, status: result.status, stdout: result.stdout, stderr: result.stderr });
      expect(readdirSync(cwd), `Unexpected writes retained at ${cwd}`).toEqual([]);
      expect(result.error, diagnostics).toBeUndefined();
      expect(result.signal, diagnostics).toBeNull();
      expect(result.status, diagnostics).toBe(0);
      expect(result.stdout).toContain('Usage: node scripts/asteroid/catalog_fetcher.ts [options]');
      for (const option of ['--source <jpl|mpc|jpl,mpc>', '--cache-dir <path>', '--output-dir <path>', '--dry-run']) {
        expect(result.stdout).toContain(option);
      }
      expect(result.stdout).not.toMatch(/Starting cycle|Total rows before dedupe|Wrote raw snapshot|Wrote provenance/);
      expect(result.stderr).not.toContain('TOOL051_UNEXPECTED_FETCH');
    } finally {
      // Never erase unexpected content: failed output assertions retain their
      // owned directory for inspection; ordinary help leaves it empty.
      if (readdirSync(cwd).length === 0) rmdirSync(cwd);
    }
  });
}
