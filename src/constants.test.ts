import { describe, expect, it } from 'vitest';
import {
  DAY_SECONDS,
  formatJulianAsDate,
  julianDateFromUnixMs,
  parseDateInputToJulian,
  tdbJulianDateToUtc,
  utcJulianDateToTdb
} from './constants';

describe('UTC calendar and JDTDB simulation time', () => {
  it('applies TT-UTC plus the periodic TDB correction', () => {
    const utc = julianDateFromUnixMs(Date.UTC(2026, 7, 23, 0, 0, 0));
    const tdb = utcJulianDateToTdb(utc);
    const offsetSeconds = (tdb - utc) * DAY_SECONDS;
    expect(offsetSeconds).toBeGreaterThan(69.182);
    expect(offsetSeconds).toBeLessThan(69.186);
    expect(tdbJulianDateToUtc(tdb)).toBeCloseTo(utc, 10);
  });

  it('round-trips an HTML UTC date without changing its calendar day', () => {
    const jd = parseDateInputToJulian('2026-08-23');
    expect(jd).not.toBeNull();
    expect(formatJulianAsDate(jd!)).toBe('2026-08-23');
  });

  it('keeps the historical leap-second offset at J2000', () => {
    const utc = julianDateFromUnixMs(Date.UTC(2000, 0, 1, 12, 0, 0));
    const offsetSeconds = (utcJulianDateToTdb(utc) - utc) * DAY_SECONDS;
    expect(offsetSeconds).toBeGreaterThan(64.182);
    expect(offsetSeconds).toBeLessThan(64.186);
  });
});
