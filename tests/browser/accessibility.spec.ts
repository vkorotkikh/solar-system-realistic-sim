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
