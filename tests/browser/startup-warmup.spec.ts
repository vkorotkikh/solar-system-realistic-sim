import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Actual WebGL startup ownership regression');
});
test.setTimeout(60_000);

async function instrument(page: Page, mode: 'failed-link' | 'pending' | 'no-parallel') {
  await page.addInitScript(mode => {
    const capture = { completionReads: 0, draws: 0 };
    Object.assign(window, { __warmupTest: capture });
    for (const Constructor of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototype = Constructor.prototype;
      const get = prototype.getProgramParameter;
      prototype.getProgramParameter = function (program: WebGLProgram, parameter: number) {
        if (parameter === 37297) {
          capture.completionReads++;
          if (mode === 'pending') return false;
        }
        if (parameter === this.LINK_STATUS && mode === 'failed-link') return false;
        return get.call(this, program, parameter);
      };
      if (mode === 'no-parallel') {
        const extension = prototype.getExtension;
        prototype.getExtension = function (this: WebGLRenderingContext | WebGL2RenderingContext, name: string) {
          return name === 'KHR_parallel_shader_compile' ? null : Reflect.apply(extension, this, [name]);
        } as typeof extension;
      }
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'] as const) {
        const owner = prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        const draw = owner[name];
        if (!draw) continue;
        owner[name] = function (...args: unknown[]) { capture.draws++; return draw.apply(this, args); };
      }
    }
  }, mode);
}

async function capture(page: Page) {
  return page.evaluate('window.__warmupTest') as Promise<{ completionReads: number; draws: number }>;
}

test('a startup shader failure exposes accessible recovery before any scene draw', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await instrument(page, 'failed-link');
  await page.goto('/');
  await expect(page.locator('#renderer-unavailable')).toBeVisible();
  await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('could not finish preparing');
  await expect(page.locator('#renderer-retry')).toBeFocused();
  await expect(page.locator('#session-label')).toHaveText('Visualization unavailable');
  await expect(page.locator('canvas[aria-hidden="true"]')).toHaveJSProperty('inert', true);
  expect((await capture(page)).draws).toBe(0);
  expect(errors).toEqual([]);
});

test('context loss cancels pending warmup and restoration cannot restart it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await instrument(page, 'pending'); await page.goto('/');
  await page.waitForFunction('window.__warmupTest.completionReads > 0');
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    Object.assign(window, { __restoreWarmupContext: () => extension.restoreContext() });
    extension.loseContext();
  });
  await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('graphics connection was lost');
  const stopped = await capture(page);
  await page.evaluate(() => new Promise<void>(resolve => {
    const canvas = document.querySelector('canvas')!;
    canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true });
    (window as unknown as { __restoreWarmupContext: () => void }).__restoreWarmupContext();
  }));
  await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('available again');
  // Observe beyond several former 10 ms poll intervals to detect unowned work.
  await page.waitForTimeout(60);
  expect(await capture(page)).toEqual(stopped);
  expect(stopped.draws).toBe(0); expect(errors).toEqual([]);
});

test('unload disposes materials only after cancelling pending warmup', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await instrument(page, 'pending'); await page.goto('/');
  await page.waitForFunction('window.__warmupTest.completionReads > 0');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  const stopped = await capture(page);
  await page.waitForTimeout(60);
  expect(await capture(page)).toEqual(stopped);
  expect(stopped.draws).toBe(0); expect(errors).toEqual([]);
});

test('the complete catalog scene still draws without parallel compilation support', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await instrument(page, 'no-parallel'); await page.goto('/');
  await page.waitForFunction('window.__warmupTest.draws > 0');
  await expect(page.locator('#status-catalog')).toContainText('100,000 stored rows');
  await expect(page.locator('#renderer-unavailable')).toBeHidden();
  expect((await capture(page)).completionReads).toBe(0);
  expect(errors).toEqual([]);
});
