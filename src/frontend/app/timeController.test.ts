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

// Owner request 2026-11-13, confirmed 2026-11-20: a switch that puts the slider in hours per
// second, so slow phenomena (a GONG map's window, a rotation) stay on screen for minutes.
describe('speed slider unit switch', () => {
  function bound(rate: number, signal?: AbortSignal) {
    const input = slider(); const speed = tracked(); const label = tracked();
    const unit = Object.assign(new EventTarget(), { checked: false });
    const context = { firstElementChild: { textContent: '' }, lastElementChild: { textContent: '' } };
    const state = { julianDate: 10, timeScaleDaysPerSec: rate, timeScaleDirty: false, paused: false };
    const time = createTimeController({
      dom: { timeScale: input as unknown as HTMLInputElement, timeScaleValue: speed.element, sessionLabel: label.element,
        timeScaleUnit: unit as unknown as HTMLInputElement, timeScaleContext: context as unknown as HTMLElement },
      simState: state, minTimeScale: -120, maxTimeScale: 120, currentJulianDate: () => 10, formatJulianAsDate: String, signal });
    time.bindUi();
    const moveTo = (index: number) => { input.value = String(index); input.dispatchEvent(new Event('input')); };
    const setHours = (on: boolean) => { unit.checked = on; unit.dispatchEvent(new Event('change')); };
    const edges = () => [context.firstElementChild.textContent, context.lastElementChild.textContent];
    return { input, speed, label, state, time, moveTo, setHours, edges };
  }

  it('leaves the days scale exactly as it was while the switch is off', () => {
    const f = bound(4);
    expect([f.input.min, f.input.max, f.input.value]).toEqual(['0', '243', stopIndex(4)]);
    expect(f.input.attributes['aria-valuetext']).toBe('+4.0 d/s');
    expect(f.edges()).toEqual(['−120 reverse', '+120 forward']);
    expect(f.state).toMatchObject({ timeScaleDaysPerSec: 4, timeScaleDirty: false });
  });

  it('offers every whole hour per second up to a day per second, plus real time, in hours mode', () => {
    const f = bound(4); f.setHours(true); const rates: number[] = [];
    for (let i = Number(f.input.min); i <= Number(f.input.max); i++) { f.moveTo(i); rates.push(f.state.timeScaleDaysPerSec); }
    const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => (from + k) / 24);
    expect(rates).toEqual([...hours(-24, 0), REAL_TIME_DAYS_PER_SEC, ...hours(1, 24)]);
    expect(timeScaleStops(-120, 120, 'hours')).toEqual(rates);
  });

  it('moves the speed to the nearest stop of the new unit and says so everywhere', () => {
    const f = bound(4); f.setHours(true); f.time.updateHud();
    expect(f.state).toMatchObject({ timeScaleDaysPerSec: 1, timeScaleDirty: true });
    expect(f.input.value).toBe(f.input.max);
    expect(f.input.attributes['aria-valuetext']).toBe('+24 h/s');
    expect(f.speed.element.textContent).toBe('+24 h/s');
    expect(f.label.element.textContent).toBe('Simulation · +24 h/s');
    expect(f.edges()).toEqual(['−24 h reverse', '+24 h forward']);
  });

  it('labels every hours-mode stop in hours, zero and real time included', () => {
    const f = bound(4); f.setHours(true);
    for (const [rate, text] of [[3 / 24, '+3 h/s'], [-7 / 24, '-7 h/s'], [0, '0 h/s'], [REAL_TIME_DAYS_PER_SEC, 'Real time'], [-1, '-24 h/s']] as const) {
      f.state.timeScaleDaysPerSec = rate; f.time.updateHud();
      expect(f.speed.element.textContent).toBe(text);
    }
  });

  it('keeps a speed both units share and restores the days scale when switched back', () => {
    const f = bound(4); f.setHours(true);
    f.moveTo(Number(f.input.max) - 12);
    expect(f.state.timeScaleDaysPerSec).toBe(0.5);
    f.state.timeScaleDirty = false; f.setHours(false); f.time.updateHud();
    expect(f.state).toMatchObject({ timeScaleDaysPerSec: 0.5, timeScaleDirty: false });
    expect([f.input.max, f.input.value]).toEqual(['243', stopIndex(0.5)]);
    expect(f.speed.element.textContent).toBe('+12 h/s');
    expect(f.edges()).toEqual(['−120 reverse', '+120 forward']);
  });

  it('ignores the switch after its owner is cancelled', () => {
    const owner = new AbortController(); const f = bound(4, owner.signal);
    owner.abort(); f.setHours(true);
    expect(f.state).toMatchObject({ timeScaleDaysPerSec: 4, timeScaleDirty: false });
    expect(f.input.max).toBe('243');
  });
});
