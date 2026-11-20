import { describe, expect, it } from 'vitest';
import { createTimeController, REAL_TIME_DAYS_PER_SEC, timeScaleStops } from './timeController';
function tracked() {
  let text = ''; let date = ''; const writes = { text: 0, date: 0 };
  return { writes, element: {
    get textContent() { return text; }, set textContent(value: string) { text = value; writes.text++; },
    get dateTime() { return date; }, set dateTime(value: string) { date = value; writes.date++; },
  } as unknown as HTMLTimeElement };
}
function slider(value = '') {
  const attributes: Record<string, string> = {};
  return Object.assign(new EventTarget(), { value, min: '', max: '', attributes,
    setAttribute(name: string, next: string) { attributes[name] = next; } });
}
const stopIndex = (rate: number) => String(timeScaleStops(-120, 120).indexOf(rate));
describe('time HUD output', () => {
  it('only writes changed formatted speed/date/dateTime values', () => {
    const speed = tracked(); const date = tracked();
    const state = { julianDate: 10.1, timeScaleDaysPerSec: 4, timeScaleDirty: false, paused: false };
    const time = createTimeController({ dom: { timeScaleValue: speed.element, timeDate: date.element }, simState: state,
      minTimeScale: -120, maxTimeScale: 120, currentJulianDate: () => 10, formatJulianAsDate: n => String(Math.floor(n)) });
    time.updateHud(); state.julianDate = 10.2; time.updateHud();
    expect(speed.writes.text).toBe(1); expect(date.writes).toEqual({ text: 1, date: 1 });
    for (const rate of [0, -4, 8]) { state.timeScaleDaysPerSec = rate; time.updateHud(); expect(speed.element.textContent).toBe(`${rate > 0 ? '+' : ''}${rate.toFixed(1)} d/s`); }
    state.paused = true; time.advanceLocalTime(1); expect(state.julianDate).toBe(10.2);
    state.paused = false; state.timeScaleDaysPerSec = -2; time.advanceLocalTime(1); time.updateHud();
    expect(date.element.dateTime).toBe('8'); expect(date.writes).toEqual({ text: 2, date: 2 });
  });
});

describe('honest session header (H2.10)', () => {
  it('names the simulation rate, or that it is paused, writing only on change', () => {
    const label = tracked();
    const state = { julianDate: 10, timeScaleDaysPerSec: 4, timeScaleDirty: false, paused: false };
    const time = createTimeController({ dom: { sessionLabel: label.element }, simState: state,
      minTimeScale: -120, maxTimeScale: 120, currentJulianDate: () => 10, formatJulianAsDate: String });
    time.updateHud(); time.updateHud();
    expect(label.element.textContent).toBe('Simulation · +4.0 d/s'); expect(label.writes.text).toBe(1);
    state.timeScaleDaysPerSec = -0.5; time.updateHud();
    expect(label.element.textContent).toBe('Simulation · -12 h/s');
    state.paused = true; time.updateHud();
    expect(label.element.textContent).toBe('Paused');
  });
});

// SDEL-060 / R0052 Now integration. Found by /qa on 2026-10-24.
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
describe('explicit Now time jump', () => {
  it('notifies once per click after the epoch and both planner dates agree, without changing pause or speed', () => {
    const nowTime = new EventTarget();
    const plannerDate = { value: 'old departure' }, plannerArrivalDate = { value: 'old arrival' };
    const state = { julianDate: 1, timeScaleDaysPerSec: -4, timeScaleDirty: false, paused: true };
    let now = 10;
    const snapshots: unknown[] = [];
    const time = createTimeController({
      dom: { nowTime: nowTime as HTMLElement, plannerDate: plannerDate as HTMLInputElement, plannerArrivalDate: plannerArrivalDate as HTMLInputElement },
      simState: state, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => now, formatJulianAsDate: jd => `JD${jd}`, plannerArrivalOffsetDays: 12,
      onTimeJump: () => snapshots.push({ ...state, departure: plannerDate.value, arrival: plannerArrivalDate.value })
    });
    time.bindUi(); expect(snapshots).toEqual([]);
    nowTime.dispatchEvent(new Event('click'));
    now = 11; nowTime.dispatchEvent(new Event('click'));
    expect(snapshots).toEqual([
      { julianDate: 10, timeScaleDaysPerSec: -4, timeScaleDirty: false, paused: true, departure: 'JD10', arrival: 'JD22' },
      { julianDate: 11, timeScaleDaysPerSec: -4, timeScaleDirty: false, paused: true, departure: 'JD11', arrival: 'JD23' }
    ]);
  });

  it('still performs Now with the default planner offset when the optional callback is omitted', () => {
    const nowTime = new EventTarget();
    const plannerDate = { value: '' }, plannerArrivalDate = { value: '' };
    const state = { julianDate: 1, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: false };
    const time = createTimeController({
      dom: { nowTime: nowTime as HTMLElement, plannerDate: plannerDate as HTMLInputElement, plannerArrivalDate: plannerArrivalDate as HTMLInputElement },
      simState: state, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => 10, formatJulianAsDate: jd => `JD${jd}`
    });
    time.bindUi(); nowTime.dispatchEvent(new Event('click'));
    expect(state).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: false });
    expect([plannerDate.value, plannerArrivalDate.value]).toEqual(['JD10', 'JD250']);
  });

  it('notifies even when planner fields are absent', () => {
    const nowTime = new EventTarget(); const jumps: number[] = [];
    const state = { julianDate: 1, timeScaleDaysPerSec: 0, timeScaleDirty: false, paused: true };
    const time = createTimeController({
      dom: { nowTime: nowTime as HTMLElement }, simState: state, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => 10, formatJulianAsDate: String, onTimeJump: () => jumps.push(state.julianDate)
    });
    time.bindUi(); nowTime.dispatchEvent(new Event('click'));
    expect(jumps).toEqual([10]);
  });

  it('does not notify on ordinary advance, speed input, or repeated HUD updates', () => {
    const timeScale = slider();
    const speed = tracked(), date = tracked(), jumps: number[] = [];
    const state = { julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: false };
    const time = createTimeController({
      dom: { timeScale: timeScale as unknown as HTMLInputElement, timeScaleValue: speed.element, timeDate: date.element },
      simState: state, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => 10, formatJulianAsDate: String, onTimeJump: () => jumps.push(state.julianDate)
    });
    time.bindUi(); time.advanceLocalTime(2);
    timeScale.value = stopIndex(-3); timeScale.dispatchEvent(new Event('input'));
    time.updateHud(); time.updateHud();
    expect(state).toEqual({ julianDate: 14, timeScaleDaysPerSec: -3, timeScaleDirty: true, paused: false });
    expect(jumps).toEqual([]);
    expect(speed.writes.text).toBe(1); expect(date.writes).toEqual({ text: 1, date: 1 });
  });
});

describe('time UI listener lifetime', () => {
  it.each([false, true])('ignores synthetic Now and speed events after cancellation (preaborted=%s)', preaborted => {
    const jumps: number[] = [];
    const owner = new AbortController();
    if (preaborted) owner.abort();
    const nowTime = new EventTarget();
    const timeScale = slider();
    const simState = { julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false };
    const controller = createTimeController({
      dom: { nowTime: nowTime as HTMLElement, timeScale: timeScale as unknown as HTMLInputElement },
      simState, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => 25, formatJulianAsDate: String, signal: owner.signal, onTimeJump: () => jumps.push(simState.julianDate),
    });
    controller.bindUi(); owner.abort();
    nowTime.dispatchEvent(new Event('click'));
    timeScale.value = stopIndex(-4); timeScale.dispatchEvent(new Event('input'));
    expect(simState).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false });
    expect(jumps).toEqual([]);
  });
});

// PR #32: the 0.01-day epoch grid lets polls share a step only below 28.8x real
// time, so the slider gets a real-time stop, plus ±12 h/s, between its whole days.
describe('speed slider stops', () => {
  function bound(rate: number) {
    const input = slider(); const speed = tracked(); const label = tracked();
    const state = { julianDate: 10, timeScaleDaysPerSec: rate, timeScaleDirty: false, paused: false };
    const time = createTimeController({
      dom: { timeScale: input as unknown as HTMLInputElement, timeScaleValue: speed.element, sessionLabel: label.element },
      simState: state, minTimeScale: -120, maxTimeScale: 120, currentJulianDate: () => 10, formatJulianAsDate: String });
    time.bindUi();
    const moveTo = (index: number) => { input.value = String(index); input.dispatchEvent(new Event('input')); };
    return { input, speed, label, state, time, moveTo };
  }

  it('offers every whole day per second plus ±12 h/s and one real-time stop, in order', () => {
    const f = bound(4); const rates: number[] = [];
    for (let i = Number(f.input.min); i <= Number(f.input.max); i++) { f.moveTo(i); rates.push(f.state.timeScaleDaysPerSec); }
    const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
    expect(rates).toEqual([...days(-120, -1), -0.5, 0, REAL_TIME_DAYS_PER_SEC, 0.5, ...days(1, 120)]);
    expect(REAL_TIME_DAYS_PER_SEC * 86_400).toBe(1);
  });

  it('starts at the current rate and names its position for screen readers', () => {
    const f = bound(4);
    f.moveTo(Number(f.input.value));
    expect(f.state).toMatchObject({ timeScaleDaysPerSec: 4, timeScaleDirty: false });
    expect(f.input.attributes['aria-valuetext']).toBe('+4.0 d/s');
    f.moveTo(Number(stopIndex(REAL_TIME_DAYS_PER_SEC)));
    expect(f.state).toMatchObject({ timeScaleDaysPerSec: REAL_TIME_DAYS_PER_SEC, timeScaleDirty: true });
    expect(f.input.attributes['aria-valuetext']).toBe('Real time');
  });

  it('labels the sub-day stops in hours and the real-time stop by name', () => {
    const f = bound(4);
    for (const [rate, text] of [[0.5, '+12 h/s'], [-0.5, '-12 h/s'], [REAL_TIME_DAYS_PER_SEC, 'Real time'], [1, '+1.0 d/s']] as const) {
      f.state.timeScaleDaysPerSec = rate; f.time.updateHud();
      expect(f.speed.element.textContent).toBe(text);
    }
    expect(f.label.element.textContent).toBe('Simulation · +1.0 d/s');
    f.state.timeScaleDaysPerSec = REAL_TIME_DAYS_PER_SEC; f.time.updateHud();
    expect(f.label.element.textContent).toBe('Simulation · Real time');
  });
});
