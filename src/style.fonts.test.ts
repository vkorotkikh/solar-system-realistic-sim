import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

it('loads every typeface from same-origin files', () => {
  // FE-017: a third-party font import discloses each visit to the font host and
  // fails offline or under a strict content security policy.
  expect(css).not.toMatch(/@import\s+url\(\s*['"]?https?:/i);
  const sources = [...css.matchAll(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/g)].map((match) => match[1]);
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) {
    expect(source, source).toMatch(/^\/fonts\//);
    expect(existsSync(new URL(`../public${source}`, import.meta.url)), source).toBe(true);
  }
});
