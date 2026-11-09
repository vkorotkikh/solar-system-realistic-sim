import { defineConfig } from '@playwright/test';

const port = Number(process.env.UI_TEST_PORT || 4175);
const hardwareWebGL = process.env.UI_HARDWARE_WEBGL === '1';
// Use full Chromium's headless mode, as the native-zoom gate already does.
// Headless shell stalled in real WEBGL_lose_context calls and later context
// setup on SwiftShader. Keep the real GPU fault and lifecycle checks.
// Hardware runs stay headless as well: ANGLE over Mesa's EGL with its D3D12
// driver reaches the WSL GPU without a window (headed opens on the Windows desktop).
const chromiumUse = { browserName: 'chromium' as const, channel: 'chromium', launchOptions: hardwareWebGL
  ? { args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-angle=gl-egl'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12' } }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] } };
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
    { name: 'chromium', testIgnore: '**/tab-zoom.spec.ts', use: chromiumUse },
    { name: 'chromium-tab-zoom', testMatch: '**/tab-zoom.spec.ts', use: chromiumUse },
    { name: 'firefox', testIgnore: '**/app-smoke.spec.ts', use: { browserName: 'firefox', launchOptions: { firefoxUserPrefs: {
      'webgl.disabled': false, 'webgl.force-enabled': true, 'webgl.enable-webgl2': true,
    } } } },
    { name: 'webkit', testIgnore: '**/app-smoke.spec.ts', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { VITE_BACKEND_ORIGIN: 'http://127.0.0.1:9142' },
  },
});
