// TOOL-076: SILSO's CC BY-NC 4.0 licence and the other providers' credit lines
// call for attribution on the page that shows the data, not only in notices.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { GENERATED_NOTICES } from './distribution-inventory.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the control panel credits the scientific data providers', () => {
  const panel = html.slice(html.indexOf('<aside id="control-panel"'), html.indexOf('</aside>'));
  const credits = panel.match(/<footer id="data-credits"[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? '';
  for (const provider of [
    'NASA/JPL Solar System Dynamics',
    'NOAA Space Weather Prediction Center',
    'WDC-SILSO, Royal Observatory of Belgium, Brussels',
    'NASA/SDO and the AIA science team',
  ]) {
    assert.ok(credits.replace(/\s+/g, ' ').includes(provider), provider);
  }
  const notice = credits.match(/href="legal\/([^"]+)"/)?.[1];
  assert.ok(notice && GENERATED_NOTICES.has(notice), `credits link a generated notice, got ${notice}`);
});
