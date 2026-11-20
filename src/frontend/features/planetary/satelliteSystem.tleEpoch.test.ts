import { expect, it } from 'vitest';
import { PRIMARY_MODELS } from './satellitePropagationCore';
import { parseTleBlock } from './satelliteSystem';

// A TLE epoch is a UTC calendar instant; the app keeps time as JD(TDB) (the JPL time argument).
// Independent expectation: TDB = UTC + (TAI-UTC) + 32.184 s (TT-TAI) + the periodic TDB-TT term (< 1.7 ms),
// with TAI-UTC from the IERS leap-second table: 33 s in 2008, 36 s through 2016-12-31, 37 s from 2017-01-01.
// The UTC Julian dates are calendar arithmetic (JD of 2017-01-01 00:00 UTC is 2457754.5).
const line1 = '1 23455U 94089A   97320.90946019  .00000140  00000-0  10191-3 0  2621';
const line2 = '2 23455  99.0090 272.6745 0008546 223.1686 136.8816 14.11711747148495';

function withChecksum(line: string): string {
  const body = line.slice(0, 68);
  return body + [...body].reduce((sum, char) => sum + (/\d/.test(char) ? Number(char) : char === '-' ? 1 : 0), 0) % 10;
}

function epochJdTdb(epoch: string): number {
  const first = withChecksum(line1.slice(0, 18) + epoch + line1.slice(32));
  const [satellite] = parseTleBlock(`${first}\n${line2}`, 'science', PRIMARY_MODELS.earth);
  return satellite.epochJd;
}

it.each([
  ['2008-01-01 12:00 UTC', '08001.50000000', 2_454_467.0, 33],
  ['2016-12-31 12:00 UTC, before the leap second', '16366.50000000', 2_457_754.0, 36],
  ['2017-01-01 12:00 UTC, after the leap second', '17001.50000000', 2_457_755.0, 37],
  ['2024-01-01 12:00 UTC', '24001.50000000', 2_460_311.0, 37],
])('stores the epoch of a TLE at %s as TDB: UTC + TAI-UTC + 32.184 s', (_label, epoch, utcJd, taiMinusUtcSeconds) => {
  const offsetSeconds = (epochJdTdb(epoch) - utcJd) * 86_400;
  expect(offsetSeconds).toBeCloseTo(taiMinusUtcSeconds + 32.184, 2); // within 5 ms, above the 1.7 ms TDB-TT term
});
