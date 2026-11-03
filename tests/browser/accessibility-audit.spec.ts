import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadShell } from './helpers';
import { assertTextContrastReviewed } from './contrast-review';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function loadAuditShell(page: Page) {
  await loadShell(page);
  await page.evaluate(async () => {
    window.__uiFixture.setAutoFrame(false);
    await document.fonts.ready;
  });
}

async function expandPanelDisclosures(page: Page) {
  for (const disclosure of await page.locator('#control-panel .panel-disclosure').all()) {
    if (!(await disclosure.evaluate(node => (node as HTMLDetailsElement).open))) {
      await disclosure.locator('summary').click();
    }
  }
  await expect(page.locator('#trigger-agn-shockwave')).toBeVisible();
}

async function auditDocument(page: Page, info: TestInfo, state: string) {
  // Keep the document scope: hidden/modal ancestry and document-level rules matter.
  // Do not add exclusions, disabled rules, impact filters, or violation baselines.
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  await info.attach(`axe-${state}`, {
    contentType: 'application/json',
    body: JSON.stringify({
      state,
      project: info.project.name,
      browserVersion: page.context().browser()?.version(),
      viewport: page.viewportSize(),
      tags,
      scope: 'full document; production HTML/CSS with existing controller fixture',
      results,
    }, null, 2),
  });
  if (results.incomplete.length > 0) {
    info.annotations.push({
      type: 'accessibility-needs-review',
      description: `${state}: ${results.incomplete.map(rule => rule.id).join(', ')}; inspect attachment`,
    });
  }
  expect(results.testEngine.version, 'Use the reviewed, pinned axe engine').toBe('4.11.1');
  expect(results.passes.length, 'The audit must exercise rendered content').toBeGreaterThan(0);
  const evaluated = [...results.passes, ...results.violations, ...results.incomplete].map(rule => rule.id);
  for (const rule of ['document-title', 'html-has-lang', 'button-name', 'color-contrast']) {
    expect(evaluated, `${rule} must be evaluated, rather than inapplicable`).toContain(rule);
  }
  expect(results.violations, `${state}: automatically detected WCAG violations`).toEqual([]);
  expect(results.incomplete.filter(rule => rule.id === 'aria-prohibited-attr'),
    `${state}: named groups must expose a role that supports their accessible label`).toEqual([]);
  await assertTextContrastReviewed(page, info, state, results);
  // Other incomplete results still require disposition; this is not a manual AT pass.
}

test.describe('rendered accessibility rule contracts', () => {
  test('desktop controls and expanded camera tools', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadAuditShell(page);
    await expect(page.locator('#control-panel')).toBeVisible();
    await expect(page.locator('#control-panel')).not.toHaveAttribute('aria-modal', 'true');
    await expandPanelDisclosures(page);
    await page.locator('#camera-tools summary').click();
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
    await auditDocument(page, info, 'desktop-expanded');
  });

  test('mobile drawer closed exposes expanded camera tools', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadAuditShell(page);
    await expect(page.locator('#control-panel')).toBeHidden();
    await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#camera-tools summary').click();
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
    await auditDocument(page, info, 'mobile-closed');
  });

  test('mobile drawer open exposes all control disclosures', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadAuditShell(page);
    await page.locator('#panel-toggle').click();
    await expect(page.getByRole('dialog', { name: 'Sun Model Lab', exact: true })).toBeVisible();
    await expect(page.locator('#viewport-shell')).toHaveJSProperty('inert', true);
    await expandPanelDisclosures(page);
    await auditDocument(page, info, 'mobile-open');
  });

  for (const viewport of [
    { state: 'desktop-recovery', width: 1440, height: 900 },
    { state: 'mobile-closed-recovery', width: 390, height: 844 },
  ]) {
    test(`${viewport.state} exposes the recovery surface`, async ({ page }, info) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loadAuditShell(page);
      if (viewport.width > 1100) await expandPanelDisclosures(page);
      // Vite loads this additional fixture after loadShell has installed the real
      // panel/explorer/camera controllers. No renderer or actual main.ts startup.
      await page.evaluate(async () => {
        const fixtureUrl = '/tests/browser/fixtures/accessibility-recovery.ts';
        await import(/* @vite-ignore */ fixtureUrl);
      });
      await expect(page.getByRole('region', { name: 'Visualization unavailable', exact: true })).toBeVisible();
      await expect(page.locator('#renderer-unavailable [role="alert"]')).not.toBeEmpty();
      await expect(page.getByRole('button', { name: 'Reload visualization', exact: true })).toBeFocused();
      await expect(page.locator('#space-canvas')).toHaveJSProperty('inert', true);
      await expect(page.locator('#camera-tools')).toBeHidden();
      await auditDocument(page, info, viewport.state);
    });
  }
});
