import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { retireWebGlPage } from './webgl-cleanup';

// "Today's Sun" stage A1 (ADR 0009, N24, N36): what needs a browser. This spec runs only in the
// chromium-observed project, on a second dev server built with VITE_SOLAR_OBSERVED_PFSS=1. The
// backend route is mocked; the golden sidecar is the contract the backend tests also check.
test.describe.configure({ timeout: 150_000 });
test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

const BACKEND = 'http://127.0.0.1:9142';
const ROUTE = `${BACKEND}/solar/observed/pfss`;
const GOLDEN = JSON.parse(fs.readFileSync(new URL('../../backend/tests/fixtures/observed_pfss/golden_sidecar.json', import.meta.url), 'utf8'));
const CORS = { 'Access-Control-Allow-Origin': '*' };

/** The golden sidecar moved so that its map is an hour old and its window holds the real time (N8). */
function currentSidecar() {
  const mapMs = Date.now() - 3_600_000;
  const mapJdTdb = mapMs / 86_400_000 + 2_440_587.5 + 69.184 / 86_400;
  return {
    ...GOLDEN,
    map_reference_utc: new Date(mapMs).toISOString().replace(/\.\d+Z$/, 'Z'),
    map_reference_jd_tdb: mapJdTdb,
    valid_from_jd_tdb: mapJdTdb - 27.2753,
    valid_until_jd_tdb: mapJdTdb + 27.2753,
  };
}

async function openApp(page: Page, baseURL: string | undefined, answer: { status: number; body: unknown }) {
  const origin = new URL(baseURL!).origin;
  const asked: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === ROUTE) {
      asked.push(url.href);
      return route.fulfill({ status: answer.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(answer.body) });
    }
    if (url.origin !== origin || url.pathname.startsWith('/textures/surfaces/')) return route.abort();
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?uiWidth=900&uiHeight=900&renderScale=0.5&maxPixelRatio=1');
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —', { timeout: 120_000 });
  await page.locator('summary[aria-controls="display-controls"]').click();
  return { errors, asked };
}

const label = (page: Page) => page.locator('#observed-field-label');
const switchOn = (page: Page) => page.locator('label:has(#toggle-observed-field)').click();

test('the flagged build draws a current map: three tiers, legend colours, chip phrase', async ({ page, baseURL }) => {
  const { errors, asked } = await openApp(page, baseURL, { status: 200, body: currentSidecar() });
  await expect(page.locator('#observed-field-control')).toBeVisible();
  await expect(page.locator('#observed-field-control')).toContainText("Real NSO/GONG map; drawn when the simulation date is inside the map's window.");
  // Reachable like the other switches: a 44 px target inside the panel.
  const target = await page.locator('#observed-field-control').boundingBox();
  expect(target!.height).toBeGreaterThanOrEqual(44 - 0.001);
  await expect(page.locator('#observed-field-control')).toBeInViewport();
  expect(asked).toEqual([]);

  await page.locator('#toggle-play').click();
  await page.locator('#now-time').click();
  await switchOn(page);

  await expect(label(page)).toBeVisible();
  await expect(label(page).locator('.observed-field-label__headline')).toHaveText(/^Real field lines · GONG map of \d{4}-\d\d-\d\d \d\d:\d\d UTC (0|1) h \d+ min before the simulation date$/);
  await expect(label(page)).toContainText('degree 12 · flux corrected +4.1% · frame check passed (+0.02°)');
  await expect(label(page)).toContainText('Uncorroborated: not checked against NASA for this map.');
  // D5: the five facts stay visible while the details are closed.
  await expect(label(page).locator('details')).not.toHaveAttribute('open', '');
  const swatches = await label(page).locator('.observed-field-label__swatch').evaluateAll(nodes =>
    nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(swatches).toEqual(['rgb(255, 255, 255)', 'rgb(230, 159, 0)', 'rgb(86, 180, 233)']);
  await expect(page.locator('#observed-field-announcer')).toHaveText(/^Real field lines drawn: GONG map of .+ UTC\.$/);
  // G2: the chip carries the phrase while the lines are drawn, and only then.
  await expect(page.locator('#status-solar')).toContainText(' · real GONG field lines drawn');
  expect(asked).toHaveLength(1);

  await switchOn(page);
  await expect(label(page)).toBeHidden();
  await expect(page.locator('#status-solar')).not.toContainText('real GONG field lines drawn');
  expect(errors).toEqual([]);
});

test('outside the window, the jump button works from the keyboard and leaves focus on the label', async ({ page, baseURL }) => {
  const { errors } = await openApp(page, baseURL, { status: 200, body: currentSidecar() });
  await switchOn(page);
  // The fastest speed leaves a 55-day window in under a second.
  await page.locator('#time-scale').evaluate((slider: HTMLInputElement) => {
    slider.value = slider.max;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const jump = label(page).getByRole('button', { name: 'Jump to now and pause' });
  await expect(jump).toBeVisible({ timeout: 20_000 });
  await expect(label(page)).toContainText('Observed field: not drawn.');
  await expect(label(page)).toContainText("at that speed it crosses this map's window in about");
  // D2: the button comes directly after the headline.
  expect(await label(page).evaluate(node => [...node.children].map(child => child.tagName))).toEqual(
    expect.arrayContaining(['P', 'BUTTON']));
  expect(await label(page).evaluate(node => node.children[1]?.tagName)).toBe('BUTTON');

  const jumpBox = await jump.boundingBox();
  expect(jumpBox!.height).toBeGreaterThanOrEqual(44 - 0.001);
  await jump.focus();
  await page.keyboard.press('Enter');
  await expect(label(page).locator('.observed-field-label__headline')).toHaveText(/^Real field lines · GONG map of /);
  await expect(page.locator('#toggle-play')).toHaveAttribute('aria-pressed', 'true');
  await expect(jump).toHaveCount(0);
  // D7: focus moves to the label's container when the button goes.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('observed-field-label');
  expect(errors).toEqual([]);
});

test('an error body is shown as text, never as markup', async ({ page, baseURL }) => {
  const markup = '<img src=x onerror="window.__observedPwned=1">Run scripts/observed_pfss_probe.py.';
  const { errors } = await openApp(page, baseURL, { status: 503, body: { detail: { code: 'solar_observed_sidecar_unavailable', message: markup, retryable: false } } });
  await switchOn(page);
  await expect(label(page)).toContainText('Observed field: sidecar unavailable (HTTP 503).');
  await expect(label(page)).toContainText(markup);
  await expect(label(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __observedPwned?: number }).__observedPwned)).toBeUndefined();
  // The synthetic field switch is off by default.
  await expect(label(page)).toContainText('No field layer is drawn.');
  expect(errors).toEqual([]);
});
