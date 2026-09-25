import { describe, expect, it } from 'vitest';
import {
  describeSolarDataStatus,
  renderSolarDataStatus,
  type SolarDataStatusInput
} from './solarDataStatus';
import type { SolarPhysicsFailureKind } from './solarPhysicsClient';

const SUCCESS_MS = Date.UTC(2026, 8, 24, 14, 3, 27);

function input(overrides: Partial<SolarDataStatusInput> = {}): SolarDataStatusInput {
  return {
    lastSuccessMs: 0,
    lastFailure: null,
    timeoutMs: 2_600,
    backendBaseUrl: 'http://localhost:8042',
    pageOrigin: 'http://localhost:4173',
    payload: null,
    observationImage: 'none',
    observationChannel: null,
    ...overrides,
  };
}

function failure(kind: SolarPhysicsFailureKind, httpStatus: number | null = null) {
  return { kind, message: `${kind} failure`, httpStatus, atMs: SUCCESS_MS + 60_000 };
}

describe('describeSolarDataStatus', () => {
  it('starts in the connecting state on the procedural fallback', () => {
    expect(describeSolarDataStatus(input())).toEqual({
      state: 'connecting',
      text: 'Sun: procedural fallback (connecting to solar model server)',
    });
  });

  it.each([
    ['timeout', null, 'solar server did not answer within 2.6 s'],
    ['busy', 503, 'solar server busy, HTTP 503'],
    ['server-timeout', 503, 'solar server ran out of compute time, HTTP 503'],
    ['rate-limited', 429, 'solar server rate limit reached, HTTP 429'],
    ['http', 500, 'solar server error, HTTP 500'],
    ['blocked', null, 'browser blocked the reply: origin http://localhost:4173 not allowed by CORS, or a server error'],
    ['unreachable', null, 'solar server not reachable at http://localhost:8042'],
    ['invalid-response', null, 'solar server sent an invalid response'],
    ['network', null, 'network error: network failure'],
  ] as const)('names the %s failure when the backend has never answered', (kind, httpStatus, reason) => {
    expect(describeSolarDataStatus(input({ lastFailure: failure(kind, httpStatus) }))).toEqual({
      state: 'error',
      text: `Sun: procedural fallback (${reason})`,
    });
  });

  it('reports the forcing mode, observation blend and image once backend data arrives', () => {
    const status = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { data_assimilation: { mode: 'hybrid', applied: true, blend_weight: 0.4178 } },
      observationImage: 'loaded',
      observationChannel: 'aia_193',
    }));
    expect(status).toEqual({
      state: 'backend',
      text: 'Sun: backend solar model (hybrid forcing, observations blended 42%; AIA 193 image) · updated 14:03 UTC',
    });
  });

  it('says so when the backend ran without observations or the image failed', () => {
    const synthetic = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { data_assimilation: { mode: 'synthetic', applied: false } },
    }));
    expect(synthetic.text).toBe('Sun: backend solar model (synthetic forcing, no observations) · updated 14:03 UTC');

    const unavailable = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { data_assimilation: { mode: 'data_driven', applied: false, live_data_available: false } },
      observationImage: 'failed',
      observationChannel: 'aia_171',
    }));
    expect(unavailable.text).toBe(
      'Sun: backend solar model (data-driven forcing, observations unavailable; AIA 171 image failed to load)'
        + ' · updated 14:03 UTC'
    );
  });

  it('marks earlier backend state as stale while refreshes fail', () => {
    const status = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { activity_index: 0.4 },
      lastFailure: failure('busy', 503),
    }));
    expect(status).toEqual({
      state: 'stale',
      text: 'Sun: backend state from 14:03 UTC (refresh failing: solar server busy, HTTP 503)',
    });
  });
});

describe('renderSolarDataStatus', () => {
  it('writes text, title and state, and leaves an unchanged live region alone', () => {
    let writes = 0;
    let text: string | null = null;
    const element = {
      get textContent() { return text; },
      set textContent(value: string | null) { writes += 1; text = value; },
      title: '',
      dataset: {} as DOMStringMap,
    };
    const status = describeSolarDataStatus(input({ lastFailure: failure('timeout') }));

    renderSolarDataStatus(element, status);
    renderSolarDataStatus(element, status);

    expect(writes).toBe(1);
    expect(element.textContent).toBe(status.text);
    expect(element.title).toBe(status.text);
    expect(element.dataset.solarState).toBe('error');
    expect(() => renderSolarDataStatus(null, status)).not.toThrow();
  });
});
