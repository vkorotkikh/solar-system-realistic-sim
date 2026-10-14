import { defineConfig } from '@playwright/test';

const port = Number(process.env.UI_TEST_PORT || 4175);
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
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    } } },
    { name: 'firefox', testIgnore: '**/app-smoke.spec.ts', use: { browserName: 'firefox' } },
    { name: 'webkit', testIgnore: '**/app-smoke.spec.ts', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { VITE_BACKEND_ORIGIN: 'http://127.0.0.1:9142' },
  },
});
