import { defineConfig } from '@playwright/test';

const override = process.env.UI_PRODUCTION_PORT;
const port = override === undefined ? 4185 : Number(override);
if ((override !== undefined && !/^\d+$/.test(override))
  || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('UI_PRODUCTION_PORT must be an integer from 1024 to 65535');
}
const hardwareWebGL = process.env.UI_HARDWARE_WEBGL === '1';

export default defineConfig({
  testDir: './tests/production',
  outputDir: `test-results/production-${port}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Covers software-GPU context creation, app startup and the afterEach WebGL
  // teardown. Under SwiftShader on CI-class CPUs that teardown alone took 31-34 s
  // of a 90 s test, so software runs get headroom; assertion waits stay at 8 s.
  timeout: hardwareWebGL ? 90_000 : 180_000,
  expect: { timeout: 8_000 },
  reporter: [
    ['line'],
    ['html', { outputFolder: `playwright-report/production-${port}`, open: 'never' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'production-chromium',
    use: {
      browserName: 'chromium',
      channel: 'chromium',
      // Headless in hardware mode too: Mesa's D3D12 driver reaches the WSL GPU without a window.
      launchOptions: hardwareWebGL
        ? { args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-angle=gl-egl'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12' } }
        : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] },
    },
  }],
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
