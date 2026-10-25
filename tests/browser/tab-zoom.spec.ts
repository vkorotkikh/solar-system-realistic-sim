import { test, expect } from '@playwright/test';
import { assertNativeTabZoom, captureNativeZoomScreenshot, createTabZoomSession, zoomMetrics } from './tab-zoom';

test.describe('native Chromium tab zoom', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chrome tabs API is Chromium-specific, not Safari/Firefox zoom evidence');
  test.setTimeout(90_000);

  // Catches fixed min-width regressions, lost responsive modality/focus, unreachable
  // clipped controls, and substituting viewport/CSS/pinch emulation for tab zoom.
  for (const factor of [2, 4]) {
    test(`${factor * 100}% genuine tab zoom preserves reflow and keyboard focus`, async ({ baseURL }, info) => {
      if (!baseURL) throw new Error('The browser gate requires a configured local baseURL');
      const session = await createTabZoomSession(info, new URL(baseURL).origin);
      const { page, context } = session;
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let failed = false;
      try {
        await page.goto(baseURL, { waitUntil: 'networkidle' });
        const canvas = page.locator('#space-canvas');
        const panel = page.locator('#control-panel');
        const toggle = page.locator('#panel-toggle');
        const slider = page.locator('#time-scale');
        await expect(panel).toBeVisible();
        await expect(slider).toBeEnabled();
        const before = await zoomMetrics(page);
        expect(before.width).toBe(1280);
        expect(await session.getZoom(page)).toBe(1);
        const renderer = await canvas.evaluate((element: HTMLCanvasElement) => {
          const gl = element.getContext('webgl2');
          const debug = gl?.getExtension('WEBGL_debug_renderer_info');
          return gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null;
        });
        expect(renderer).not.toBeNull();
        if (process.env.UI_HARDWARE_WEBGL === '1') expect(renderer).toMatch(/D3D12.*NVIDIA GeForce RTX/i);

        // Same-origin sibling verifies per-tab isolation, with no second app/GPU.
        const sibling = await context.newPage();
        await sibling.route('**/__zoom_control__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Zoom isolation control</title>' }));
        await sibling.goto(new URL('/__zoom_control__', baseURL).href);
        await page.bringToFront();
        await slider.focus();
        const native = await session.setZoom(page, factor);
        expect(native.settings).toMatchObject({ mode: 'automatic', scope: 'per-tab' });
        await expect.poll(async () => (await zoomMetrics(page)).width).toBe(1280 / factor);
        const zoomed = await zoomMetrics(page);
        assertNativeTabZoom(before, zoomed, factor, native.factor);
        expect(await session.getZoom(sibling)).toBe(1);
        expect((await zoomMetrics(sibling)).dpr).toBe(before.dpr);
        expect(zoomed.scrollWidth).toBeLessThanOrEqual(zoomed.width + 1);
        await expect(panel).toBeHidden();
        await expect(toggle).toBeFocused();

        // Native keyboard activation, not click/DOM event dispatch.
        await toggle.press('Enter');
        await expect(panel).toHaveAttribute('role', 'dialog');
        await expect(panel).toHaveAttribute('aria-modal', 'true');
        expect(await canvas.evaluate((element) => Boolean(element.closest('[inert]')))).toBe(true);
        for (const summary of await panel.locator('details > summary').all()) {
          if (!await summary.evaluate((element) => element.parentElement instanceof HTMLDetailsElement && element.parentElement.open)) {
            await summary.focus();
            await summary.press('Enter');
          }
        }
        await slider.focus();
        const oldValue = await slider.inputValue();
        await slider.press('ArrowRight');
        await expect(slider).not.toHaveValue(oldValue);

        const stops = await panel.locator('button,input,select,summary,[tabindex]').evaluateAll((elements) => elements
          .filter((element): element is HTMLElement => element instanceof HTMLElement && element.tabIndex >= 0
            && !element.matches(':disabled') && element.getClientRects().length > 0
            && getComputedStyle(element).visibility !== 'hidden')
          .map((element) => element.id || `${element.tagName}:${element.textContent?.trim()}`));
        expect(stops).toContain('trigger-agn-shockwave');
        expect(new Set(stops).size).toBe(stops.length);
        await panel.locator('#panel-close').focus();
        const visited = new Set<string>();
        for (let index = 0; index < stops.length; index += 1) {
          const focused = await panel.evaluate((element) => {
            const active = document.activeElement;
            if (!(active instanceof HTMLElement) || !element.contains(active)) throw new Error('Focus escaped the zoomed modal');
            const rect = active.getBoundingClientRect();
            const bounds = element.getBoundingClientRect();
            return { key: active.id || `${active.tagName}:${active.textContent?.trim()}`, left: rect.left,
              right: rect.right, top: rect.top, bottom: rect.bottom, panelLeft: bounds.left,
              panelRight: bounds.right, viewportWidth: innerWidth, viewportHeight: innerHeight,
              overflow: element.scrollWidth - element.clientWidth,
              nativeListbox: active instanceof HTMLSelectElement && active.size > 1 };
          });
          visited.add(focused.key);
          expect(focused.overflow).toBeLessThanOrEqual(1);
          expect(focused.left).toBeGreaterThanOrEqual(Math.max(0, focused.panelLeft) - 1);
          expect(focused.right).toBeLessThanOrEqual(Math.min(focused.panelRight, focused.viewportWidth) + 1);
          if (focused.nativeListbox) {
            // Chromium scrolls a native list's selected row into view, not
            // necessarily its complete border. Require an entire 44px row and
            // verify that keyboard users can still reach both list endpoints.
            expect(Math.min(focused.bottom, focused.viewportHeight) - Math.max(focused.top, 0)).toBeGreaterThanOrEqual(44);
            const list = panel.locator('select:focus');
            const first = await list.locator('option').first().getAttribute('value');
            const last = await list.locator('option').last().getAttribute('value');
            if (first === null || last === null) throw new Error('Body picker options require values');
            await page.keyboard.press('End');
            await expect(list).toHaveValue(last);
            await page.keyboard.press('Home');
            await expect(list).toHaveValue(first);
            await expect(list).toBeFocused();
          } else {
            expect(focused.top).toBeGreaterThanOrEqual(-1);
            expect(focused.bottom).toBeLessThanOrEqual(focused.viewportHeight + 1);
          }
          await page.keyboard.press('Tab');
        }
        expect([...visited].sort()).toEqual([...stops].sort());
        await expect(panel.locator('#panel-close')).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(panel.locator('#trigger-agn-shockwave')).toBeFocused();
        await captureNativeZoomScreenshot(page, info, `native-zoom-${factor * 100}-dialog`);
        await page.keyboard.press('Escape');
        await expect(toggle).toBeFocused();
        await expect(panel).toBeHidden();
        expect(await canvas.evaluate((element) => Boolean(element.closest('[inert]')))).toBe(false);
        await canvas.focus();
        const scrollY = await page.evaluate(() => window.scrollY);
        await canvas.press('ArrowLeft');
        await expect(canvas).toBeFocused();
        expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
        await captureNativeZoomScreenshot(page, info, `native-zoom-${factor * 100}-viewport`);

        await session.setZoom(page, 1);
        await expect.poll(async () => (await zoomMetrics(page)).width).toBe(1280);
        await expect(panel).toBeVisible();
        const reset = await zoomMetrics(page);
        assertNativeTabZoom(before, reset, 1, await session.getZoom(page));
        const evidence = { factor, browserVersion: context.browser()?.version(), renderer, before, zoomed, reset,
          tabZoomSettings: native.settings, keyboardStops: [...visited], siblingZoom: await session.getZoom(sibling) };
        console.log('Native tab zoom evidence:', JSON.stringify(evidence));
        await info.attach('native-tab-zoom', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
        expect(errors).toEqual([]);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        try { await session.close(); }
        catch (error) {
          if (!failed) throw error;
          console.error('Additional zoom-browser cleanup failure:', error);
        }
      }
    });
  }

  test('zoom evidence rejects viewport-only, CSS and pinch substitutes', () => {
    const baseline = { width: 1280, height: 800, outerWidth: 1280, outerHeight: 900,
      dpr: 1, visualScale: 1, rootFontSize: '16px', rootZoom: '1', bodyZoom: '1', scrollWidth: 1280 };
    const nativeMetrics = { ...baseline, width: 640, height: 400, dpr: 2 };
    expect(() => assertNativeTabZoom(baseline, { ...baseline, width: 640, height: 400 }, 2, 1)).toThrow();
    expect(() => assertNativeTabZoom(baseline, { ...baseline, width: 640, height: 400 }, 2, 2)).toThrow();
    expect(() => assertNativeTabZoom(baseline, { ...nativeMetrics, bodyZoom: '2' }, 2, 2)).toThrow();
    expect(() => assertNativeTabZoom(baseline, { ...nativeMetrics, visualScale: 2 }, 2, 2)).toThrow();
  });
});
