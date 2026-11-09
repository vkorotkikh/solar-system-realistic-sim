import { test, expect, type Page } from '@playwright/test';
import { retireWebGlPage } from './webgl-cleanup';

// These layers vanished without a test noticing in the 2026-02-23 refactor (04e99a4).
// Report: agent-notes/MAIN_JS_REMOVAL_REPORT_04e99a4_2026-11-08.md
test.describe.configure({ timeout: 150_000 });
test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

async function openApp(page: Page) {
  const origin = `http://127.0.0.1:${process.env.UI_TEST_PORT || '4175'}`;
  // Same-origin assets only, so CelesTrak and the backend are unreachable. The large
  // Moon and Mars maps are not needed to check the wiring.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/textures/surfaces/')) return route.abort();
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —', { timeout: 120_000 });
  return errors;
}

const bodyCount = async (page: Page) => Number((await page.locator('#status-bodies').textContent())!.replace(/\D/g, ''));
const flip = (page: Page, id: string) => page.locator(`label:has(#${id})`).click();

test('moons, belts and satellites switches show and hide their layers', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('summary[aria-controls="display-controls"]').click();
  for (const id of ['toggle-moons', 'toggle-asteroids', 'toggle-kuiper']) await expect(page.locator(`#${id}`)).toBeChecked();
  await expect(page.locator('#toggle-earth-satellites')).not.toBeChecked();
  await expect(page.locator('#body-match-count')).toHaveText('433 bodies');

  await flip(page, 'toggle-moons');
  await expect(page.locator('#body-match-count')).toHaveText('10 bodies');
  await flip(page, 'toggle-moons');
  await expect(page.locator('#body-match-count')).toHaveText('433 bodies');

  const all = await bodyCount(page);
  await flip(page, 'toggle-asteroids');
  await expect.poll(() => bodyCount(page)).toBeLessThan(all);
  await flip(page, 'toggle-asteroids');
  await flip(page, 'toggle-kuiper');
  await expect.poll(() => bodyCount(page)).toBe(all - 5_000);
  await flip(page, 'toggle-kuiper');
  await expect.poll(() => bodyCount(page)).toBe(all);

  await page.locator('#body-search').fill('Europa');
  await page.locator('#body-list').selectOption({ label: 'Europa · Moon' });
  await page.locator('#focus-body').click();
  await expect(page.locator('#status-focus')).toHaveText('Focused · Europa');

  // CelesTrak is blocked here, so this also exercises the built-in fallback orbits.
  await flip(page, 'toggle-earth-satellites');
  await expect(page.locator('#toggle-earth-satellites')).toBeChecked();
  await page.waitForTimeout(1_000);
  expect(errors).toEqual([]);
});

test('Moon quick views and the mission planner work without a backend', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('summary[aria-controls="navigation-controls"]').click();
  await page.locator('#focus-moon-llo').click();
  await expect(page.locator('#toggle-realistic-scale')).toBeChecked();
  await expect(page.locator('#status-focus')).toHaveText('Following · Moon');
  await expect(page.locator('#status-zoom')).toHaveText(/^Range · 18\d\d km$/);

  await page.locator('summary[aria-controls="planner-controls"]').click();
  await expect(page.locator('#planner-from')).toHaveValue('earth');
  await expect(page.locator('#planner-to')).toHaveValue('mars');
  await expect(page.locator('#status-route')).toBeHidden();
  await page.locator('#plan-optimal').click();
  await expect(page.locator('#planner-output')).toContainText('Route: Earth -> Mars', { timeout: 30_000 });
  await expect(page.locator('#planner-output')).toContainText('offline fallback');
  await expect(page.locator('#status-route')).toHaveText('Route: Earth -> Mars');
  await page.locator('#clear-route').click();
  await expect(page.locator('#planner-output')).toHaveText('No plotted route.');
  await expect(page.locator('#status-route')).toBeHidden();
  expect(errors).toEqual([]);
});
