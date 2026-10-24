// Regression: FE-STARTUP-ESCAPE — retire partial startup without losing recovery.
// Found by /qa on 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Proposed FE-STARTUP-ESCAPE optional listener-signal contract. This calls the
// actual current time controller; no source replacement or fake implementation.
import { describe, expect, it } from 'vitest';
import { createTimeController } from './timeController';

function fixture(signal?: AbortSignal) {
  const nowTime = new EventTarget();
  const timeScale = Object.assign(new EventTarget(), { value: '2', min: '', max: '' });
  const plannerDate = { value: 'old departure' }, plannerArrivalDate = { value: 'old arrival' };
  const timeScaleValue = { textContent: '' }, timeDate = { textContent: '', dateTime: '' };
  const state = { julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: true };
  const jumps: unknown[] = [];
  const args = {
    dom: { nowTime: nowTime as HTMLElement, timeScale: timeScale as HTMLInputElement,
      plannerDate: plannerDate as HTMLInputElement, plannerArrivalDate: plannerArrivalDate as HTMLInputElement,
      timeScaleValue: timeScaleValue as HTMLElement, timeDate: timeDate as HTMLTimeElement },
    simState: state, minTimeScale: -120, maxTimeScale: 120,
    currentJulianDate: () => 25, formatJulianAsDate: (jd: number) => `JD${jd}`,
    onTimeJump: () => jumps.push({ ...state, departure: plannerDate.value, arrival: plannerArrivalDate.value }),
    ...(signal === undefined ? {} : { signal }),
  };
  const time = createTimeController(args);
  time.bindUi();
  return { time, state, nowTime, timeScale, plannerDate, plannerArrivalDate, jumps, timeScaleValue, timeDate };
}

describe('time controller runtime listener ownership', () => {
  it('legacy omitted signal preserves Now state/date/callback order and default arrival offset', () => {
    const f = fixture(); f.nowTime.dispatchEvent(new Event('click'));
    expect(f.jumps).toEqual([{ julianDate: 25, timeScaleDaysPerSec: 2, timeScaleDirty: false,
      paused: true, departure: 'JD25', arrival: 'JD265' }]);
  });

  it('legacy omitted signal preserves speed input and ignores nonfinite values', () => {
    const f = fixture();
    expect([f.timeScale.min, f.timeScale.max, f.timeScale.value]).toEqual(['-120', '120', '2']);
    f.timeScale.value = '-4'; f.timeScale.dispatchEvent(new Event('input'));
    f.timeScale.value = 'NaN'; f.timeScale.dispatchEvent(new Event('input'));
    expect(f.state).toEqual({ julianDate: 10, timeScaleDaysPerSec: -4, timeScaleDirty: true, paused: true });
    expect(f.jumps).toEqual([]);
  });

  it('legacy omitted signal preserves paused advance and HUD updates', () => {
    const f = fixture(); f.time.advanceLocalTime(5); f.time.updateHud();
    expect(f.state.julianDate).toBe(10);
    expect(f.timeScaleValue.textContent).toBe('+2.0 d/s');
    expect(f.timeDate).toEqual({ textContent: 'JD10', dateTime: 'JD10' });
    expect(f.jumps).toEqual([]);
  });

  it('live signal preserves the same Now action and callback ordering', () => {
    const owner = new AbortController(); const f = fixture(owner.signal);
    try {
      f.nowTime.dispatchEvent(new Event('click'));
      expect(f.jumps).toEqual([{ julianDate: 25, timeScaleDaysPerSec: 2, timeScaleDirty: false,
        paused: true, departure: 'JD25', arrival: 'JD265' }]);
    } finally { owner.abort(); }
  });

  it('live signal preserves the same speed action', () => {
    const owner = new AbortController(); const f = fixture(owner.signal);
    try {
      f.timeScale.value = '-4'; f.timeScale.dispatchEvent(new Event('input'));
      expect(f.state).toEqual({ julianDate: 10, timeScaleDaysPerSec: -4, timeScaleDirty: true, paused: true });
      expect(f.jumps).toEqual([]);
    } finally { owner.abort(); }
  });

  it('aborting listener ownership alone does not reset state or remove direct HUD functionality', () => {
    const owner = new AbortController(); const f = fixture(owner.signal); owner.abort();
    f.time.advanceLocalTime(5); f.time.updateHud();
    expect(f.state).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: true });
    expect(f.timeDate).toEqual({ textContent: 'JD10', dateTime: 'JD10' });
    expect(f.timeScaleValue.textContent).toBe('+2.0 d/s'); expect(f.jumps).toEqual([]);
  });

  it('aborting after bind retires the Now listener even for a synthetic click', () => {
    const owner = new AbortController(); const f = fixture(owner.signal); owner.abort();
    f.nowTime.dispatchEvent(new Event('click'));
    expect(f.state).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: true });
    expect([f.plannerDate.value, f.plannerArrivalDate.value]).toEqual(['old departure', 'old arrival']);
    expect(f.jumps).toEqual([]);
  });

  it('aborting after bind retires the speed listener even for a synthetic input', () => {
    const owner = new AbortController(); const f = fixture(owner.signal); owner.abort();
    f.timeScale.value = '-4'; f.timeScale.dispatchEvent(new Event('input'));
    expect(f.state).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: true });
    expect(f.jumps).toEqual([]);
  });

  it('an already-aborted signal never binds a live Now action', () => {
    const owner = new AbortController(); owner.abort(); const f = fixture(owner.signal);
    f.nowTime.dispatchEvent(new Event('click'));
    expect(f.state.julianDate).toBe(10);
    expect([f.plannerDate.value, f.plannerArrivalDate.value]).toEqual(['old departure', 'old arrival']);
    expect(f.jumps).toEqual([]);
  });

  it('an already-aborted signal never binds a live speed action', () => {
    const owner = new AbortController(); owner.abort(); const f = fixture(owner.signal);
    f.timeScale.value = '-4'; f.timeScale.dispatchEvent(new Event('input'));
    expect(f.state).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: true });
    expect(f.jumps).toEqual([]);
  });
});
