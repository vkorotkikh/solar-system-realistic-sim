import { test, expect } from '@playwright/test';
import { loadShell } from './helpers';
test('mobile drawer isolates the viewport and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await loadShell(page);
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#control-panel')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#panel-close')).toBeFocused();
  await expect(page.locator('#viewport-shell')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape'); await expect(page.locator('#panel-toggle')).toBeFocused();
});
test('195px viewport reflows the production page', async ({ page }) => {
  await page.setViewportSize({ width: 195, height: 422 }); await loadShell(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [1101, 1440]) {
  test(`desktop camera hint remains above wrapped live status at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await loadShell(page);
    // Real successful-catalog / unavailable-backend strings seen after startup,
    // longer than the fixture's initial status. Exercise layout with settled data.
    await page.locator('#status-catalog').evaluate(node => {
      node.textContent = 'Asteroids: Phase-1 integrity checked (100,000 stored rows, SHA-256); largest-first prefix, not representative; scientific accuracy not certified';
    });
    await page.locator('#status-solar').evaluate(node => {
      node.textContent = 'Sun: procedural fallback (solar server sent an invalid response)';
    });
    const hint = await page.locator('.interaction-hint').boundingBox();
    const status = await page.locator('#status-bar').boundingBox();
    expect(hint).not.toBeNull(); expect(status).not.toBeNull();
    expect(hint!.y + hint!.height, 'Wrapped status must not paint over camera instructions').toBeLessThanOrEqual(status!.y);
    await expect(page.locator('.pointer-hint')).toBeVisible();
    await expect(page.locator('#status-catalog')).toBeVisible();
  });
}
