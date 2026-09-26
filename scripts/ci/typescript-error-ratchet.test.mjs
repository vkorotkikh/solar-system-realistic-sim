import { describe, expect, it } from 'vitest';

import {
  compareAgainstBaseline,
  parseDiagnostics
} from './typescript-error-ratchet.mjs';


describe('TypeScript legacy-error ratchet', () => {
  it('groups diagnostics without depending on line movement', () => {
    const parsed = parseDiagnostics([
      'src/a.ts(1,2): error TS7006: first',
      'src/a.ts(9,3): error TS7006: second',
      '  continuation text',
      'src/b.ts(4,5): error TS2339: third'
    ].join('\n'));

    expect(parsed).toEqual({
      parsedCount: 3,
      reportedCount: 3,
      buckets: {
        'src/a.ts|TS7006': 2,
        'src/b.ts|TS2339': 1
      }
    });
  });

  it('allows reductions but rejects new or larger buckets', () => {
    const baseline = {
      total_error_budget: 3,
      buckets: {
        'src/a.ts|TS7006': 2,
        'src/b.ts|TS2339': 1
      }
    };

    expect(compareAgainstBaseline({
      parsedCount: 1,
      reportedCount: 1,
      buckets: { 'src/a.ts|TS7006': 1 }
    }, baseline)).toEqual([]);
    expect(compareAgainstBaseline({
      parsedCount: 3,
      reportedCount: 3,
      buckets: { 'src/a.ts|TS7006': 3 }
    }, baseline)).toContain(
      'diagnostic bucket src/a.ts|TS7006 grew from 2 to 3'
    );
    expect(compareAgainstBaseline({
      parsedCount: 1,
      reportedCount: 1,
      buckets: { 'src/new.ts|TS7006': 1 }
    }, baseline)).toContain(
      'new diagnostic bucket src/new.ts|TS7006 (1)'
    );
  });

  it('fails closed when a diagnostic cannot be assigned to a file bucket', () => {
    const parsed = parseDiagnostics('error TS5083: Cannot read file missing.json');

    expect(compareAgainstBaseline(parsed, {
      total_error_budget: 240,
      buckets: {}
    })).toContain('parsed 0 of 1 TypeScript diagnostics');
  });
});
