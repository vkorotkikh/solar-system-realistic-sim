export const AU_KM: number = 149_597_870.7;
export const AU_M: number = AU_KM * 1_000;
export const DAY_SECONDS: number = 86_400;
export const DAY_MILLISECONDS: number = DAY_SECONDS * 1_000;

// muSun in AU^3/day^2 (Gaussian gravitational constant squared).
export const MU_SUN_AU3_DAY2: number = 0.0002959122082855911;
export const G_SI: number = 6.67430e-11;

export const J2000_JD: number = 2_451_545.0;

export const DEFAULT_TIME_SCALE_DAYS_PER_SEC: number = 4;
export const MIN_TIME_SCALE_DAYS_PER_SEC: number = -120;
export const MAX_TIME_SCALE_DAYS_PER_SEC: number = 120;

export const MAJOR_BODY_IDS = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto'
] as const;

export type MajorBodyId = (typeof MAJOR_BODY_IDS)[number];

export function julianDateFromUnixMs(unixMs: number): number {
  return unixMs / DAY_MILLISECONDS + 2_440_587.5;
}

export function unixMsFromJulianDate(jd: number): number {
  return (jd - 2_440_587.5) * DAY_MILLISECONDS;
}

// UTC effective dates and TAI-UTC after each leap-second step. The ephemeris
// coverage begins in 2000, but retaining the complete post-1972 table makes date
// input and TLE epochs well-defined. No leap second has been introduced since
// 2017-01-01; future dates necessarily use the latest announced value.
const TAI_MINUS_UTC_STEPS: ReadonlyArray<readonly [number, number]> = [
  [Date.UTC(1972, 0, 1), 10], [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12], [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14], [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16], [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18], [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20], [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22], [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24], [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26], [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28], [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30], [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32], [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34], [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36], [Date.UTC(2017, 0, 1), 37]
];

function taiMinusUtcSeconds(utcJd: number): number {
  const unixMs = unixMsFromJulianDate(utcJd);
  let offset = 10;
  for (const [effectiveMs, nextOffset] of TAI_MINUS_UTC_STEPS) {
    if (unixMs < effectiveMs) break;
    offset = nextOffset;
  }
  return offset;
}

/** Low-order Fairhead/Bretagnon approximation, adequate to about 0.1 ms. */
function tdbMinusTtSeconds(ttJd: number): number {
  const meanAnomalyRad =
    ((357.53 + 0.9856003 * (ttJd - J2000_JD)) * Math.PI) / 180;
  return 0.001657 * Math.sin(meanAnomalyRad) + 0.000022 * Math.sin(2 * meanAnomalyRad);
}

/** Convert a UTC-labelled Julian date to the JDTDB time coordinate used by JPL. */
export function utcJulianDateToTdb(utcJd: number): number {
  const ttJd = utcJd + (taiMinusUtcSeconds(utcJd) + 32.184) / DAY_SECONDS;
  return ttJd + tdbMinusTtSeconds(ttJd) / DAY_SECONDS;
}

/** Convert JDTDB back to UTC for calendar display and HTML date inputs. */
export function tdbJulianDateToUtc(tdbJd: number): number {
  // Two fixed-point iterations resolve both the leap-second step and the
  // millisecond periodic TDB-TT term by far more precision than Date supports.
  let utcJd = tdbJd - (37 + 32.184) / DAY_SECONDS;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const ttJd = utcJd + (taiMinusUtcSeconds(utcJd) + 32.184) / DAY_SECONDS;
    utcJd = tdbJd - (taiMinusUtcSeconds(utcJd) + 32.184 + tdbMinusTtSeconds(ttJd)) / DAY_SECONDS;
  }
  return utcJd;
}

export function currentJulianDate(): number {
  return utcJulianDateToTdb(julianDateFromUnixMs(Date.now()));
}

export function julianDateToDate(jd: number): Date {
  return new Date(unixMsFromJulianDate(tdbJulianDateToUtc(jd)));
}

export function formatJulianAsDate(jd: number): string {
  const date = julianDateToDate(jd);
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${date.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateInputToJulian(value: string | null | undefined): number | null {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const unixMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return utcJulianDateToTdb(julianDateFromUnixMs(unixMs));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sanitizeIdPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parseEpochDateToJulian(epoch: string): number {
  // JPL table dates are formatted like YYYY-MM-DD.d where d can include a day fraction.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?$/.exec(epoch);
  if (!match) {
    return J2000_JD;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayInteger = Number(match[3]);
  const fractionalText = match[4] || '';
  const dayFraction = fractionalText.length > 0 ? Number(`0.${fractionalText}`) : 0;

  const unixMs = Date.UTC(year, month - 1, dayInteger, 0, 0, 0, 0);
  const jd = julianDateFromUnixMs(unixMs);
  return jd + dayFraction;
}

export function auPerDayToKmPerSec(value: number): number {
  return (value * AU_KM) / DAY_SECONDS;
}

export function kmPerSecToAuPerDay(value: number): number {
  return (value * DAY_SECONDS) / AU_KM;
}
