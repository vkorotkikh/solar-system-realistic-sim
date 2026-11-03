import { describe, expect, it } from 'vitest';
import { createTimeController } from './timeController';
function tracked() {
  let text = ''; let date = ''; const writes = { text: 0, date: 0 };
  return { writes, element: {
    get textContent() { return text; }, set textContent(value: string) { text = value; writes.text++; },
    get dateTime() { return date; }, set dateTime(value: string) { date = value; writes.date++; },
  } as unknown as HTMLTimeElement };
}
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
    expect(label.element.textContent).toBe('Simulation · -0.5 d/s');
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
    const timeScale = Object.assign(new EventTarget(), { value: '2', min: '', max: '' });
    const speed = tracked(), date = tracked(), jumps: number[] = [];
    const state = { julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false, paused: false };
    const time = createTimeController({
      dom: { timeScale: timeScale as HTMLInputElement, timeScaleValue: speed.element, timeDate: date.element },
      simState: state, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => 10, formatJulianAsDate: String, onTimeJump: () => jumps.push(state.julianDate)
    });
    time.bindUi(); time.advanceLocalTime(2);
    timeScale.value = '-3'; timeScale.dispatchEvent(new Event('input'));
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
    const timeScale = Object.assign(new EventTarget(), { value: '2', min: '', max: '' });
    const simState = { julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false };
    const controller = createTimeController({
      dom: { nowTime: nowTime as HTMLElement, timeScale: timeScale as HTMLInputElement },
      simState, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => 25, formatJulianAsDate: String, signal: owner.signal, onTimeJump: () => jumps.push(simState.julianDate),
    });
    controller.bindUi(); owner.abort();
    nowTime.dispatchEvent(new Event('click'));
    timeScale.value = '-4'; timeScale.dispatchEvent(new Event('input'));
    expect(simState).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false });
    expect(jumps).toEqual([]);
  });
});
