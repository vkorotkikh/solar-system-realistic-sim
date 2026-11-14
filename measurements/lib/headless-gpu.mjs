import { chromium } from 'playwright';

// Real-GPU WebGL with NO window. Headless Chromium, ANGLE over Mesa's EGL, and Mesa's D3D12
// driver, which reaches the Windows GPU through WSL's /dev/dxg. A headed browser opens on the
// owner's Windows desktop through WSLg and takes keyboard focus, so it is never used here.
// GPU=0 selects the SwiftShader software renderer for comparison.
export const useGpu = process.env.GPU !== '0';

export async function launch(options = {}) {
  const env = { ...process.env, ...(useGpu ? { GALLIUM_DRIVER: 'd3d12' } : {}) };
  // Belt and braces: with no display variables, nothing can reach the WSLg desktop.
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  const args = [...(useGpu ? ['--use-angle=gl-egl'] : []), ...(options.args ?? [])];
  const browser = await chromium.launch({ ...options, headless: true, env, args });
  const page = await browser.newPage();
  try {
    await assertRenderer(page);
  } catch (error) {
    await browser.close();
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
  return browser;
}

// Renderer gate: a GPU run that silently fell back to software must not produce numbers.
export async function assertRenderer(page) {
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'none';
  });
  if (useGpu !== /D3D12/.test(renderer)) throw new Error(`renderer gate: GPU=${useGpu} but the renderer is ${renderer}`);
  return renderer;
}

export const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function loadAverage() {
  return import('node:fs').then(({ readFileSync }) => Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]));
}
