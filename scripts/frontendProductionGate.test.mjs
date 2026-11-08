import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

function loadProductionConfig(port, hardwareWebGL) {
  const env = { ...process.env };
  delete env.UI_PRODUCTION_PORT;
  delete env.UI_HARDWARE_WEBGL;
  if (port !== undefined) env.UI_PRODUCTION_PORT = port;
  if (hardwareWebGL !== undefined) env.UI_HARDWARE_WEBGL = hardwareWebGL;
  return spawnSync(process.execPath, ['--input-type=module', '-e',
    "const { default: config } = await import('./playwright.production.config.ts'); console.log(JSON.stringify(config));"],
  { cwd: root, env, encoding: 'utf8', timeout: 10_000 });
}

function configFor(port, hardwareWebGL) {
  const result = loadProductionConfig(port, hardwareWebGL);
  expect(result.status, `Compiled-artifact config must load: ${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout);
}

describe('compiled frontend acceptance gate', () => {
  it('exposes the dedicated production config through npm', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts['test:production']).toBe('playwright test --config=playwright.production.config.ts');
  });

  it('typechecks the production config and acceptance specs', () => {
    const config = ts.getParsedCommandLineOfConfigFile(`${root}/tsconfig.ui-tests.json`, {}, {
      ...ts.sys, onUnRecoverableConfigFileDiagnostic: diagnostic => { throw new Error(String(diagnostic.messageText)); },
    });
    expect(config.fileNames).toContain(`${root}playwright.production.config.ts`);
    expect(config.fileNames).toContain(`${root}tests/production/frontend.spec.ts`);
  });

  it('runs only compiled preview on the default isolated origin without building or reusing a server', () => {
    const config = configFor();
    expect(config.webServer).toMatchObject({
      command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4185 --strictPort',
      url: 'http://127.0.0.1:4185', reuseExistingServer: false,
    });
    expect(config.use.baseURL).toBe('http://127.0.0.1:4185');
    expect(config.testDir).toBe('./tests/production');
    expect(config.outputDir).toBe('test-results/production-4185');
    expect(config.projects.map(project => project.name)).toEqual(['production-chromium']);
    expect(config.projects[0].use).toMatchObject({ browserName: 'chromium', channel: 'chromium' });
    expect(config).toMatchObject({ workers: 1, retries: 0 });
    expect(config.use).toMatchObject({ trace: 'retain-on-failure', screenshot: 'only-on-failure' });
    expect(config.reporter).toEqual([
      ['line'], ['html', { outputFolder: 'playwright-report/production-4185', open: 'never' }],
    ]);
  });

  it('gives software-GL tests teardown headroom without loosening assertion waits', () => {
    // Hosted runners render through SwiftShader, where afterEach WebGL teardown alone took
    // 31-34 s of a 90 s test under a 2-core squeeze. Assertions keep their strict wait.
    expect(configFor()).toMatchObject({ timeout: 180_000, expect: { timeout: 8_000 } });
    expect(configFor(undefined, '1')).toMatchObject({ timeout: 90_000, expect: { timeout: 8_000 } });
    const spec = readFileSync(new URL('../tests/production/frontend.spec.ts', import.meta.url), 'utf8');
    expect(spec, 'a spec-level timeout would silently override the renderer-aware config').not.toMatch(/describe\.configure\(\{[^}]*timeout/);
  });

  it.each(['1024', '4197', '65535'])('uses validated override %s for preview, browser and artifacts', port => {
    const config = configFor(port);
    expect(config.webServer.command).toBe(`node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`);
    expect(config.webServer.url).toBe(`http://127.0.0.1:${port}`);
    expect(config.use.baseURL).toBe(`http://127.0.0.1:${port}`);
    expect(config.outputDir).toBe(`test-results/production-${port}`);
    expect(config.reporter[1][1].outputFolder).toBe(`playwright-report/production-${port}`);
  });

  it.each(['', '0', '1023', '65536', '4185.5', 'nope', ' 4185', '4.185e3'])('rejects invalid override %j instead of silently falling back', port => {
    const result = loadProductionConfig(port);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('UI_PRODUCTION_PORT must be an integer from 1024 to 65535');
  });
});
