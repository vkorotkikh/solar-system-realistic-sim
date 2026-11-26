import { describe, expect, it } from 'vitest';
import golden from '../../../../backend/tests/fixtures/observed_pfss/golden_sidecar.json';
import { REAL_TIME_DAYS_PER_SEC } from '../../app/timeController';
import type { ObservedPfssClientState, ObservedPfssFailure, ObservedPfssSidecar } from './observedPfssClient';
import {
  deriveObservedLabel,
  formatCrossingTime,
  formatMapOffset,
  formatUtcMinute,
  OBSERVED_CHIP_PHRASE,
  withObservedChipPhrase,
  type ObservedLabelInputs,
} from './observedPfssStatus';
import type { SolarDataSourceStatus } from './solarDataStatus';

const SIDECAR = golden as unknown as ObservedPfssSidecar;
const MAP_JD = SIDECAR.map_reference_jd_tdb; // 2026-10-12 17:44 UTC
const NEXT_TRY = Date.UTC(2026, 9, 12, 18, 30);
const FAILED_AT = Date.UTC(2026, 9, 12, 18, 0);

function state(overrides: Partial<ObservedPfssClientState> = {}): ObservedPfssClientState {
  return { enabled: true, awaitingFirst: false, accepted: SIDECAR, failure: null, nextTryMs: NEXT_TRY, ...overrides };
}
function inputs(overrides: Partial<ObservedLabelInputs> = {}): ObservedLabelInputs {
  return {
    client: state(), syntheticShown: true, clockJdTdb: MAP_JD + 0.5, realJdTdb: MAP_JD + 1,
    paused: true, timeScaleDaysPerSec: 4, speedText: '+4.0 d/s', ...overrides,
  };
}
const failed = (failure: ObservedPfssFailure, accepted: ObservedPfssSidecar | null = null) =>
  inputs({ client: state({ failure, accepted }) });

describe('the state table: one test per row', () => {
  it('row 1: switch off shows nothing and draws nothing', () => {
    const label = deriveObservedLabel(inputs({ client: state({ enabled: false, accepted: null, nextTryMs: null }) }));
    expect(label).toMatchObject({ row: 1, drawLines: false, headline: null, closing: null, announcement: null });
  });

  it('row 2: loading until the first response', () => {
    const label = deriveObservedLabel(inputs({ client: state({ awaitingFirst: true, accepted: null }) }));
    expect(label).toMatchObject({ row: 2, drawLines: false, headline: 'Observed field: loading.' });
  });

  it('row 3: a 404, with the error body message', () => {
    const label = deriveObservedLabel(failed({ kind: 'not-found', message: 'Set SOLAR_OBSERVED_PFSS_SIDECAR on the backend and restart it.' }));
    expect(label).toMatchObject({ row: 3, drawLines: false, headline: 'Observed field: no sidecar data (route 404).' });
    expect(label.sentences).toEqual(['Set SOLAR_OBSERVED_PFSS_SIDECAR on the backend and restart it.']);
  });

  it('row 4: any other status, an unreadable body and an invalid file each have their text', () => {
    expect(deriveObservedLabel(failed({ kind: 'http', status: 503, message: 'Run scripts/observed_pfss_probe.py.' })))
      .toMatchObject({ row: 4, headline: 'Observed field: sidecar unavailable (HTTP 503).', sentences: ['Run scripts/observed_pfss_probe.py.'] });
    expect(deriveObservedLabel(failed({ kind: 'http', status: 'redirect', message: null })))
      .toMatchObject({ row: 4, headline: 'Observed field: sidecar unavailable (HTTP redirect).', sentences: [] });
    expect(deriveObservedLabel(failed({ kind: 'unreadable' })))
      .toMatchObject({ row: 4, headline: 'Observed field: sidecar unreadable (not JSON, or too large).' });
    expect(deriveObservedLabel(failed({ kind: 'invalid' })))
      .toMatchObject({ row: 4, headline: 'Observed field: sidecar invalid (schema check failed). Run the probe again from this checkout.' });
  });

  it('row 5: a failed frame check', () => {
    expect(deriveObservedLabel(failed({ kind: 'frame-check', deltaDeg: 31.2 }))).toMatchObject({
      row: 5, drawLines: false,
      headline: "Observed field: not drawn. Frame check failed (Δ = +31.20°). The probe's output has the details.",
    });
  });

  it('row 6: a fetch failure with nothing accepted', () => {
    expect(deriveObservedLabel(failed({ kind: 'transient', atMs: FAILED_AT }))).toMatchObject({
      row: 6, drawLines: false, headline: 'Observed field: fetch failed 2026-10-12 18:00 UTC; next try 18:30 UTC.',
    });
  });

  it('row 7: outside the window', () => {
    const label = deriveObservedLabel(inputs({ clockJdTdb: MAP_JD + 40, realJdTdb: MAP_JD + 40 }));
    expect(label).toMatchObject({ row: 7, drawLines: false, headline: 'Observed field: not drawn.', jumpButton: false });
    expect(label.sentences[0]).toBe(
      'No GONG map covers the simulation date. Latest map: 2026-10-12 17:44 UTC, drawn from 2026-09-15 11:07 UTC to 2026-11-09 00:20 UTC.');
    // The window's edges are TDB Julian dates; the label converts them to UTC (69 s apart in 2026).
  });

  it('row 8: drawn, with the three tiers', () => {
    const label = deriveObservedLabel(inputs());
    expect(label).toMatchObject({
      row: 8, drawLines: true, legend: true,
      headline: 'Real field lines · GONG map of 2026-10-12 17:44 UTC',
      offset: '12 h 0 min before the simulation date',
      facts: 'degree 12 · flux corrected +4.1% · frame check passed (+0.02°)',
      closing: null,
    });
    expect(label.caveats[0]).toBe('Synoptic map: its far side is up to 27 days older. Uncorroborated: not checked against NASA for this map. Other Sun layers are model-only and will not line up with these lines.');
    expect(label.details).toEqual([
      'PFSS solution from the NSO/GONG zqs synoptic map, built from about one solar rotation of observations ending at the map time',
      '24 lines drawn, seeded evenly · source surface 2.5 R☉',
      'flux correction: polarity scaling (NASA WSA method 2); residual monopole 9.7e-17 G',
      'frame: IAU_SUN body; central meridian agrees with the ephemeris to +0.02° (pass within 2°)',
      'NASA line budget: not measured for this map (uncorroborated)',
    ]);
  });
});

describe('row precedence and retention', () => {
  it('lets a route error win over an accepted sidecar, and loading lose to any answer', () => {
    expect(deriveObservedLabel(failed({ kind: 'not-found', message: null }, SIDECAR)).row).toBe(3);
    expect(deriveObservedLabel(inputs({ client: state({ awaitingFirst: true, failure: { kind: 'invalid' }, accepted: null }) })).row).toBe(4);
  });

  it('shows the refresh-failed note on rows 7 and 8 when a transient failure kept the map', () => {
    const transient = { kind: 'transient', atMs: FAILED_AT } as const;
    const note = 'refresh failed 2026-10-12 18:00 UTC; showing map 2026-10-12 17:44 UTC; next try 18:30 UTC';
    expect(deriveObservedLabel(failed(transient, SIDECAR))).toMatchObject({ row: 8, note });
    expect(deriveObservedLabel({ ...failed(transient, SIDECAR), clockJdTdb: MAP_JD + 40 })).toMatchObject({ row: 7, note });
    expect(deriveObservedLabel(inputs()).note).toBeNull();
  });

  it('draws within the window, both ends included, and not a minute outside', () => {
    const minute = 1 / 1440;
    for (const [clock, drawn] of [
      [SIDECAR.valid_from_jd_tdb, true], [SIDECAR.valid_until_jd_tdb, true],
      [SIDECAR.valid_from_jd_tdb - minute, false], [SIDECAR.valid_until_jd_tdb + minute, false],
    ] as const) {
      expect(deriveObservedLabel(inputs({ clockJdTdb: clock })).drawLines).toBe(drawn);
    }
  });

  // G1: the window is one mean synodic rotation either side, and it is data (N8).
  it('draws 27 days either side of the map and not 28, and follows the file when its window changes', () => {
    for (const [days, drawn] of [[27, true], [-27, true], [28, false], [-28, false]] as const) {
      expect(deriveObservedLabel(inputs({ clockJdTdb: MAP_JD + days })).drawLines).toBe(drawn);
    }
    const narrow = { ...SIDECAR, valid_from_jd_tdb: MAP_JD, valid_until_jd_tdb: MAP_JD + 1.5 };
    expect(deriveObservedLabel(inputs({ client: state({ accepted: narrow }), clockJdTdb: MAP_JD + 2 })).row).toBe(7);
  });
});

describe('row 7 variants (D3, D11, G1)', () => {
  const outside = (overrides: Partial<ObservedLabelInputs>) =>
    deriveObservedLabel(inputs({ clockJdTdb: MAP_JD + 40, ...overrides }));

  it('offers the jump button only while the real time is inside the window', () => {
    expect(outside({ realJdTdb: MAP_JD + 3 }).jumpButton).toBe(true);
    expect(outside({ realJdTdb: MAP_JD + 40 }).jumpButton).toBe(false);
    expect(outside({ realJdTdb: SIDECAR.valid_from_jd_tdb - 0.01 }).jumpButton).toBe(false);
  });

  it('says the window has ended only when the real time is after it', () => {
    const ended = "This map's window has ended; run the probe again.";
    expect(outside({ realJdTdb: MAP_JD + 40 }).sentences).toContain(ended);
    expect(outside({ realJdTdb: MAP_JD + 3 }).sentences).not.toContain(ended);
  });

  it('gives the crossing time for a running clock, and not when paused, stopped or at Real time', () => {
    const running = outside({ paused: false, timeScaleDaysPerSec: 4, speedText: '+4.0 d/s' }).sentences;
    expect(running).toContain("The clock is running at +4.0 d/s; at that speed it crosses this map's window in about 14 seconds.");
    const hourly = outside({ paused: false, timeScaleDaysPerSec: 1 / 24, speedText: '+1 h/s' }).sentences;
    expect(hourly).toContain("The clock is running at +1 h/s; at that speed it crosses this map's window in about 22 minutes.");
    for (const quiet of [{ paused: true }, { paused: false, timeScaleDaysPerSec: 0 }, { paused: false, timeScaleDaysPerSec: REAL_TIME_DAYS_PER_SEC }]) {
      expect(outside(quiet).sentences.some(sentence => sentence.startsWith('The clock is running'))).toBe(false);
    }
  });

  it('ends rows 2 to 7 with what is drawn instead', () => {
    expect(outside({ syntheticShown: true }).closing).toBe('Synthetic field shown.');
    expect(outside({ syntheticShown: false }).closing).toBe('No field layer is drawn.');
    expect(deriveObservedLabel(failed({ kind: 'invalid' })).closing).toBe('Synthetic field shown.');
  });

  it('mentions the model lines in row 8 only when both switches are on', () => {
    const both = 'Model field lines are drawn too (cream, green, pink; they pulse).';
    expect(deriveObservedLabel(inputs({ syntheticShown: true })).caveats).toContain(both);
    expect(deriveObservedLabel(inputs({ syntheticShown: false })).caveats).not.toContain(both);
  });
});

describe('formatting', () => {
  it('writes the offset in hours and minutes below a day and in days and hours from one (G1)', () => {
    expect(formatMapOffset(MAP_JD + 23 / 24 + 59 / 1440, MAP_JD)).toBe('23 h 59 min before the simulation date');
    expect(formatMapOffset(MAP_JD + 1439.7 / 1440, MAP_JD)).toBe('23 h 59 min before the simulation date');
    expect(formatMapOffset(MAP_JD + 1, MAP_JD)).toBe('1 d 0 h before the simulation date');
    expect(formatMapOffset(MAP_JD + 26.99, MAP_JD)).toBe('26 d 23 h before the simulation date');
    expect(formatMapOffset(MAP_JD - 0.25, MAP_JD)).toBe('6 h 0 min after the simulation date');
  });

  it('rounds the crossing time to whole seconds, minutes, hours or days', () => {
    const window = 2 * 27.2753;
    expect(formatCrossingTime(window, 4)).toBe('14 seconds');
    expect(formatCrossingTime(window, -1 / 24)).toBe('22 minutes');
    expect(formatCrossingTime(window, 1 / 86_400 * 120)).toBe('11 hours');
    expect(formatCrossingTime(window, 1 / 86_400 * 2)).toBe('27 days');
    expect(formatCrossingTime(1, 2)).toBe('1 second');
  });

  it('writes times as YYYY-MM-DD HH:MM UTC', () => {
    expect(formatUtcMinute(Date.UTC(2026, 0, 2, 3, 4, 59))).toBe('2026-01-02 03:04 UTC');
  });
});

describe('error-body messages (X9)', () => {
  it('appends a message of at most 200 characters and ignores longer ones and other types', () => {
    const of = (message: unknown) => deriveObservedLabel(failed({ kind: 'not-found', message: message as string })).sentences;
    expect(of('x'.repeat(200))).toEqual(['x'.repeat(200)]);
    expect(of('x'.repeat(201))).toEqual([]);
    expect(of(null)).toEqual([]);
    expect(of({ text: 'object' })).toEqual([]);
    expect(of('<b>markup</b>')).toEqual(['<b>markup</b>']);
  });
});

describe('announcements (D6)', () => {
  it('change with the state and never with the offset', () => {
    const a = deriveObservedLabel(inputs({ clockJdTdb: MAP_JD + 0.5 }));
    const b = deriveObservedLabel(inputs({ clockJdTdb: MAP_JD + 0.6 }));
    expect(a.offset).not.toBe(b.offset);
    expect(a.stateKey).toBe(b.stateKey);
    expect(a.announcement).toBe('Real field lines drawn: GONG map of 2026-10-12 17:44 UTC.');
    const noted = deriveObservedLabel(failed({ kind: 'transient', atMs: FAILED_AT }, SIDECAR));
    expect(noted.stateKey).not.toBe(a.stateKey);
    const outside = deriveObservedLabel(inputs({ clockJdTdb: MAP_JD + 40 }));
    expect(outside.stateKey).not.toBe(a.stateKey);
  });
});

describe('the Sun chip while real lines are drawn (G2)', () => {
  const status: SolarDataSourceStatus = {
    state: 'backend', text: 'Sun: backend solar model (synthetic forcing, observations disabled until validated)',
    announcementKey: 'backend', announcement: 'Sun data from backend.', remedy: null, observedAtMs: 7,
  };
  it('appends one fixed phrase in row 8 and changes nothing else', () => {
    expect(OBSERVED_CHIP_PHRASE).toBe('real GONG field lines drawn');
    expect(withObservedChipPhrase(status, true)).toEqual({ ...status, text: `${status.text} · real GONG field lines drawn` });
    expect(withObservedChipPhrase(status, false)).toBe(status);
  });
});
