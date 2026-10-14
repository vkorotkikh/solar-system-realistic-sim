import { test, expect } from '@playwright/test';
import { loadShell } from './helpers';
test('production HTML exposes the named controls and native inputs', async ({ page }) => {
  await loadShell(page);
  await expect(page.getByRole('heading', { name: 'Sun Model Lab' })).toBeVisible();
  await expect(page.locator('#panel-close')).toHaveAccessibleName(/(Collapse|Close).*controls/i);
  await expect(page.getByLabel('Find a major body')).toBeVisible();
  await expect(page.getByLabel('Simulation speed')).toHaveAttribute('type', 'range');
});
