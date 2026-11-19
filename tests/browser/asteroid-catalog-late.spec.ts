import { test, expect } from '@playwright/test';
import { retireWebGlPage } from './webgl-cleanup';

// A slow link used to swap the real catalog for 50,000 invented asteroids for good (audit belts-01).
test.describe.configure({ timeout: 150_000 });
test.beforeEach(({ browserName }) => { test.skip(browserName !== 'chromium', 'Needs the rendered app; real WebGL runs in Chromium'); });
test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

test('a catalog that misses the startup deadline replaces the procedural belt when it arrives', async ({ page }) => {
  const origin = `http://127.0.0.1:${process.env.UI_TEST_PORT || '4175'}`;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/textures/surfaces/')) return route.abort();
    // Hold the 8.8 MB catalog past the 10 s startup deadline.
    if (url.pathname.endsWith('/asteroid_phase1_main_100000.bin')) await new Promise(resolve => setTimeout(resolve, 14_000));
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');

  const status = page.locator('#status-catalog');
  await expect(status).toHaveText('Asteroids: procedural belt until the catalog arrives (still loading after 10 s)', { timeout: 60_000 });
  await expect(status).toHaveAttribute('data-catalog-state', 'verified', { timeout: 60_000 });
  await expect(status).toContainText('integrity checked');
  expect(errors).toEqual([]);
});
