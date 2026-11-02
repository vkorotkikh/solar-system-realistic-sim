import type { Page } from '@playwright/test';

/** Context.close() bypasses beforeunload by default. Retire the actual app's
 * RAF, worker and GPU ownership before tearing down its browser fixture so a
 * queued software-GPU frame cannot starve the following test's context setup.
 */
export async function retireWebGlPage(page: Page) {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeunload'));
    const canvas = document.querySelector<HTMLCanvasElement>('#space-canvas');
    canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
}
