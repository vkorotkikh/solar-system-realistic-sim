import type { Page } from '@playwright/test';
export async function loadShell(page: Page) {
  await page.route(/\/src\/main\.ts(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript', body: "import '/tests/browser/fixtures/ui-shell.ts'",
  }));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__uiFixture));
}
