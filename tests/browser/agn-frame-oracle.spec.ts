import { expect, test } from '@playwright/test';

// The production GW and H29 event shaders, rendered in isolation by the SCN-042 oracle
// (scripts/oracles/agn-frame-browser.ts) and measured in pixels against independent
// fixtures. scripts/verify-agn-frame-browser.mjs records the same checks as evidence on
// a named hardware GPU; this gate runs them on every push with the configured renderer.
interface Check { name: string; pass: boolean; actual: unknown; requirement: string }
interface OracleResult { gpu: { renderer: string; vendor: string; version: string }; checks: Check[]; glError: number }
type OracleWindow = Window & { runAgnFrameOracle?: () => OracleResult };

test.skip(({ browserName }) => browserName !== 'chromium', 'The shader oracle targets Chromium WebGL');

test('the GW and H29 event grids render where the independent oracle predicts', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/scripts/oracles/agn-frame.html');
  await page.waitForFunction(() => typeof (window as OracleWindow).runAgnFrameOracle === 'function');
  const result = await page.evaluate(() => (window as OracleWindow).runAgnFrameOracle!());
  await info.attach('agn-frame-oracle', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

  expect(result.checks.map(check => check.name)).toEqual(expect.arrayContaining([
    'grid-plane:H29', 'h29-normal-axis', 'local-world-invariance:H29', 'reset-no-submission:H29',
    'grid-plane:GW', 'gw-strain-axes', 'local-world-invariance:GW', 'reset-no-submission:GW',
  ]));
  for (const check of result.checks) {
    const detail = `${check.name}: ${check.requirement}\n${JSON.stringify(check.actual)}`;
    // The GW grid's 0.5 % changed-pixel bound was set on an RTX 5090, which measured 0.48 %.
    // SwiftShader rasterizes the same moved grid with 0.67 % changing. The defect this check
    // exists for, the pre-SCN-042 shader, changed 17.5 %, so software GL keeps the MAE bound
    // and allows 1 %. Hardware runs keep the oracle's own verdict.
    if (check.name === 'local-world-invariance:GW' && /swiftshader|llvmpipe|softpipe/i.test(result.gpu.renderer)) {
      const actual = check.actual as { meanAbsoluteByteError: number; changedPixelFraction: number };
      expect(actual.meanAbsoluteByteError, detail).toBeLessThan(0.25);
      expect(actual.changedPixelFraction, detail).toBeLessThan(0.01);
      continue;
    }
    expect(check.pass, detail).toBe(true);
  }
  expect(result.glError).toBe(0);
  expect(errors).toEqual([]);
});
