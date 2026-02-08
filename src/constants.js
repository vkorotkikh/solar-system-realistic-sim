export const AU_KM = 149_597_870.7;
export const AU_M = AU_KM * 1_000;
export const DAY_SECONDS = 86_400;
export const DAY_MILLISECONDS = DAY_SECONDS * 1_000;

// muSun in AU^3/day^2 (Gaussian gravitational constant squared).
export const MU_SUN_AU3_DAY2 = 0.0002959122082855911;
export const G_SI = 6.67430e-11;

export const J2000_JD = 2_451_545.0;

export const DEFAULT_TIME_SCALE_DAYS_PER_SEC = 4;
export const MIN_TIME_SCALE_DAYS_PER_SEC = -120;
export const MAX_TIME_SCALE_DAYS_PER_SEC = 120;

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
];

export function julianDateFromUnixMs(unixMs) {
  return unixMs / DAY_MILLISECONDS + 2_440_587.5;
}

export function unixMsFromJulianDate(jd) {
  return (jd - 2_440_587.5) * DAY_MILLISECONDS;
}

export function currentJulianDate() {
  return julianDateFromUnixMs(Date.now());
}

export function julianDateToDate(jd) {
  return new Date(unixMsFromJulianDate(jd));
}

export function formatJulianAsDate(jd) {
  const date = julianDateToDate(jd);
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${date.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateInputToJulian(value) {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const unixMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return julianDateFromUnixMs(unixMs);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function sanitizeIdPart(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parseEpochDateToJulian(epoch) {
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

export function auPerDayToKmPerSec(value) {
  return (value * AU_KM) / DAY_SECONDS;
}

export function kmPerSecToAuPerDay(value) {
  return (value * DAY_SECONDS) / AU_KM;
}
