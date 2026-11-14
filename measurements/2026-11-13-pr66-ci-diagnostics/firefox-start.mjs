import { firefox } from 'playwright';
// Does the real app finish starting in headless Firefox? Same prefs as the repo's firefox project.
const [port, label] = process.argv.slice(2);
const browser = await firefox.launch({ headless: true, firefoxUserPrefs: { 'webgl.disabled': false, 'webgl.force-enabled': true, 'webgl.enable-webgl2': true } });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], consoleErrors = [];
page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text().slice(0, 160)); });
const origin = `http://127.0.0.1:${port}`;
await page.route('**/*', route => { const u = new URL(route.request().url()); return (u.origin !== origin || u.pathname.startsWith('/textures/surfaces/')) ? route.abort() : route.continue(); });
const t0 = Date.now();
await page.goto(origin + '/', { waitUntil: 'load' });
let started = false;
try { await page.waitForFunction(() => document.getElementById('status-zoom')?.textContent !== 'Range · —', null, { timeout: 100000 }); started = true; } catch {}
const state = await page.evaluate(() => {
  const c = document.getElementById('space-canvas');
  const g = document.createElement('canvas').getContext('webgl2');
  const e = g?.getExtension('WEBGL_debug_renderer_info');
  return { zoom: document.getElementById('status-zoom')?.textContent, bodies: document.getElementById('status-bodies')?.textContent,
    canvasData: c ? { ...c.dataset } : null, webgl2: Boolean(g), renderer: g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) : null,
    recovery: document.querySelector('[role="alert"]')?.textContent?.trim().slice(0, 120) ?? null };
});
console.log(JSON.stringify({ label, started, seconds: Math.round((Date.now() - t0) / 1000), ...state, pageErrors: errors.slice(0, 4), console: [...new Set(consoleErrors)].slice(0, 6) }));
await browser.close();
