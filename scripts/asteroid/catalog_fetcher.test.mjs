import { test } from 'vitest';
import { assertRetired } from './catalog_fetcher.fixtures.mjs';

// TOOL-051: keep real native Node execution (no transform hiding syntax errors).
// Retirement replaces help success with an actionable nonzero migration message.
for (const flag of ['--help', '-h']) {
  test(`native ${flag} refuses before acquisition or filesystem output`, () => {
    assertRetired([flag]);
  });
}
