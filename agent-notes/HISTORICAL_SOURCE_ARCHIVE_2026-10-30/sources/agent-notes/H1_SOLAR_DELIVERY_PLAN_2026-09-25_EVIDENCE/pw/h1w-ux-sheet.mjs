// Build side-by-side comparison sheets of the 1x URL crops, upscaled 4x nearest-neighbour, plus the 1x originals.
import { chromium } from 'playwright';
import fs from 'fs';
const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const Z = `${SP}/h1/verify2/ux/zoom`;
const OPTS = ['current', 'ls-0.04em', 'ls-0.08em-url-only', 'tabular-nums', 'weight600-url', 'system-sans-url', 'mono-url', 'mono-url-1em'];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
for (const vp of ['1440x900', '390x844']) {
  const rows = [];
  for (const t of ['ip8042', 'localhost8042', 'origin4191']) for (const o of OPTS) {
    const f = `${Z}/${vp}-${t}-${o}-x1.png`; if (!fs.existsSync(f)) continue;
    rows.push({ label: `${t} / ${o}`, b64: fs.readFileSync(f).toString('base64') });
  }
  const html = `<html><body style="margin:0;background:#222;color:#eee;font:13px sans-serif">${rows.map((r) => `<div style="display:flex;align-items:center;gap:12px;padding:3px 8px;border-bottom:1px solid #444"><div style="width:220px">${r.label}</div><img src="data:image/png;base64,${r.b64}" style="image-rendering:pixelated;zoom:4"><img src="data:image/png;base64,${r.b64}"></div>`).join('')}</body></html>`;
  const page = await browser.newPage({ viewport: { width: 1000, height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(html); await page.waitForTimeout(300);
  await page.screenshot({ path: `${Z}/sheet-${vp}.png`, fullPage: true });
  await page.close();
}
await browser.close(); console.log('ok');
