import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseDiagnostics, compareDiagnostics, compilerDiagnostics } from './check-ui-types.mjs';
describe('UI diagnostic identities', () => {
  it('ignores location shifts, permits removals, rejects replacement messages and growth', () => {
    const before=parseDiagnostics('src/a.ts(1,2): error TS7006: legacy\n  continuation');
    expect(compareDiagnostics(parseDiagnostics('src/a.ts(12,4): error TS7006: legacy\n  continuation'),before)).toEqual([]);
    expect(compareDiagnostics(new Map(),before)).toEqual([]);
    expect(compareDiagnostics(parseDiagnostics('src/a.ts(1,2): error TS7006: changed\n  continuation'),before)).toHaveLength(1);
    expect(compareDiagnostics(new Map([...before].map(([key])=>[key,2])),before)).toHaveLength(1);
  });
  it('fails closed on launch failures, unparsed diagnostics and nonzero empty output', () => {
    expect(compilerDiagnostics({status:0,stdout:'',stderr:''})).toEqual(new Map());
    for(const result of [{error:new Error('missing')},{status:2,stdout:'',stderr:''},{status:2,stdout:'error TS1: bad',stderr:''},{status:1,stdout:'fatal',stderr:''}]) expect(()=>compilerDiagnostics(result)).toThrow();
  });
});

// TOOL098 / scoped TOOL097. Found by /qa, 2026-10-24.
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Literal parser fixture; the separate owned reproduction invokes real tsc.
describe('committed strict-zero TypeScript identity baseline', () => {
  const baseline = JSON.parse(readFileSync(
    new URL('../tests/baselines/frontend-types.json', import.meta.url), 'utf8'
  ));
  const identities = new Map(baseline.diagnostics);

  it('does not retain legacy diagnostic identities after strict source reaches zero', () => {
    expect(baseline.diagnostics).toEqual([]);
  });

  it('accepts clean parsed output with the committed baseline', () => {
    expect(compareDiagnostics(parseDiagnostics(''), identities)).toEqual([]);
  });

  it('rejects the exact formerly allowed legacy parser fixture', () => {
    const actual = parseDiagnostics(
      'src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts(1,28): '
      + "error TS7006: Parameter 'deg' implicitly has an 'any' type."
    );
    expect([...actual]).toEqual([[
      "src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts|TS7006|Parameter 'deg' implicitly has an 'any' type.",
      1
    ]]);
    expect(compareDiagnostics(actual, identities)).toHaveLength(1);
  });
});
