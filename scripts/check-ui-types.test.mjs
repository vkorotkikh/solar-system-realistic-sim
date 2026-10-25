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
