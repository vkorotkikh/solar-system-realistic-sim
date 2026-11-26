import { defineConfig } from '@playwright/test';

const port = Number(process.env.UI_TEST_PORT || 4175);
// A second dev server built with the observed-field flag on, for observed-field.spec.ts only (N36).
const observedPort = port + 1;
const vite = (listen: number) => `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${listen} --strictPort`;
const hardwareWebGL = process.env.UI_HARDWARE_WEBGL === '1';
// Use full Chromium's headless mode, as the native-zoom gate already does.
// Headless shell stalled in real WEBGL_lose_context calls and later context
// setup on SwiftShader. Keep the real GPU fault and lifecycle checks.
const chromiumUse = { browserName: 'chromium' as const, channel: 'chromium', headless: !hardwareWebGL, launchOptions: {
  args: hardwareWebGL
    ? ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
} };
export default defineConfig({
  testDir: './tests/browser',
  outputDir: `test-results/${port}`,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: ['**/tab-zoom.spec.ts', '**/observed-field.spec.ts'], use: chromiumUse },
    { name: 'chromium-tab-zoom', testMatch: '**/tab-zoom.spec.ts', use: chromiumUse },
    { name: 'firefox', testIgnore: ['**/app-smoke.spec.ts', '**/observed-field.spec.ts'], use: { browserName: 'firefox', launchOptions: { firefoxUserPrefs: {
      'webgl.disabled': false, 'webgl.force-enabled': true, 'webgl.enable-webgl2': true,
    } } } },
    { name: 'webkit', testIgnore: ['**/app-smoke.spec.ts', '**/observed-field.spec.ts'], use: { browserName: 'webkit' } },
    { name: 'chromium-observed', testMatch: '**/observed-field.spec.ts', use: { ...chromiumUse, baseURL: `http://127.0.0.1:${observedPort}` } },
  ],
  webServer: [{
    command: vite(port),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { VITE_BACKEND_ORIGIN: 'http://127.0.0.1:9142' },
  }, {
    command: vite(observedPort),
    url: `http://127.0.0.1:${observedPort}`,
    reuseExistingServer: false,
    env: { VITE_BACKEND_ORIGIN: 'http://127.0.0.1:9142', VITE_SOLAR_OBSERVED_PFSS: '1' },
  }],
});
