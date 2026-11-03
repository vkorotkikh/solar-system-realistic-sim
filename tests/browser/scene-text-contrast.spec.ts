import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { retireWebGlPage } from './webgl-cleanup';
import { assertTextContrastReviewed } from './contrast-review';

// A renderer-free shell cannot establish contrast over moving scene imagery.
// Keep production startup/rendering and constrain only external service access.
test.describe.configure({ timeout: 90_000 });
test.skip(({ browserName }) => browserName !== 'chromium', 'Real WebGL runs in Chromium; all engines run the separate shell audit.');
test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

async function captureContrast(page: Page, info: TestInfo, state: string) {
  const bounds = await page.locator('.frame-indicator, .interaction-hint, #status-bar > span, #panel-toggle').evaluateAll(nodes => {
    const parse = (value: string) => {
      const channels = value.match(/[\d.]+/g)!.map(Number);
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    return nodes.filter(node => {
      const style = getComputedStyle(node);
      return node.getBoundingClientRect().width > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }).map(node => {
      const style = getComputedStyle(node);
      const foreground = parse(style.color);
      const background = parse(style.backgroundColor);
      // For these light-text surfaces, bound the entire RGB scene cube:
      // minimum possible text luminance (black scene) / maximum possible
      // background luminance (white scene). This is conservative even for
      // semitransparent text, without selecting convenient screenshot pixels.
      const darkestBackground = background.slice(0, 3).map(value => value * background[3]);
      const brightestBackground = darkestBackground.map(value => value + 255 * (1 - background[3]));
      const darkestText = foreground.slice(0, 3).map((value, index) => value * foreground[3] + darkestBackground[index] * (1 - foreground[3]));
      return { selector: node.id ? `#${node.id}` : `.${node.className}`, foreground: style.color,
        background: style.backgroundColor, backgroundImage: style.backgroundImage,
        conservativeContrast: (luminance(darkestText) + .05) / (luminance(brightestBackground) + .05) };
    });
  });
  await info.attach(`scene-contrast-${state}`, { body: JSON.stringify(bounds, null, 2), contentType: 'application/json' });
  expect(bounds.length).toBeGreaterThan(4);
  for (const bound of bounds) {
    expect(bound.backgroundImage, `${bound.selector}: no unmeasured image layer`).toBe('none');
    expect(bound.conservativeContrast, `${state} ${bound.selector}: text contrast across any RGB scene backdrop`).toBeGreaterThanOrEqual(4.5);
  }
}

async function audit(page: Page, info: TestInfo, state: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  await info.attach(`actual-app-axe-${state}`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.violations).toEqual([]);
  await assertTextContrastReviewed(page, info, state, results);
}

test('actual rendered desktop and mobile text retains contrast over any scene', async ({ page }, info) => {
  const origin = new URL(info.project.use.baseURL ?? `http://127.0.0.1:${process.env.UI_TEST_PORT || 4175}`).origin;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.fulfill({ status: 503, contentType: 'application/json', body: '{}', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('/?renderScale=0.5&maxPixelRatio=1');
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —', { timeout: 60_000 });
  await expect(page.locator('#renderer-unavailable')).toBeHidden();
  await expect(page.locator('#status-catalog')).toHaveAttribute('data-catalog-state', /verified|fallback|error/, { timeout: 30_000 });
  await captureContrast(page, info, 'desktop');
  await audit(page, info, 'desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#control-panel')).toBeHidden();
  await captureContrast(page, info, 'mobile-closed');
  await audit(page, info, 'mobile-closed');
  await page.locator('#panel-toggle').click();
  await expect(page.getByRole('dialog', { name: 'Sun Model Lab', exact: true })).toBeVisible();
  await audit(page, info, 'mobile-open');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-toggle')).toBeFocused();
  await page.locator('#camera-tools summary').click();
  const before = await page.locator('#status-zoom').textContent();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('#status-zoom')).not.toHaveText(before!);
  await info.attach('actual-app-accessibility-tree', { body: await page.locator('body').ariaSnapshot(), contentType: 'text/plain' });
});
