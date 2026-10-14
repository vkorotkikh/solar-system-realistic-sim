import type { Page } from '@playwright/test';
export async function loadShell(page: Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/src/main.ts', route => route.fulfill({
    contentType: 'application/javascript', body: "import '/tests/browser/fixtures/ui-shell.ts'",
  }));
  await page.goto('/');
}
