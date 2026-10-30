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


describe('time UI listener lifetime', () => {
  it.each([false, true])('ignores synthetic Now and speed events after cancellation (preaborted=%s)', preaborted => {
    const owner = new AbortController();
    if (preaborted) owner.abort();
    const nowTime = new EventTarget();
    const timeScale = Object.assign(new EventTarget(), { value: '2', min: '', max: '' });
    const simState = { julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false };
    const controller = createTimeController({
      dom: { nowTime: nowTime as HTMLElement, timeScale: timeScale as HTMLInputElement },
      simState, minTimeScale: -120, maxTimeScale: 120,
      currentJulianDate: () => 25, formatJulianAsDate: String, signal: owner.signal,
    });
    controller.bindUi(); owner.abort();
    nowTime.dispatchEvent(new Event('click'));
    timeScale.value = '-4'; timeScale.dispatchEvent(new Event('input'));
    expect(simState).toEqual({ julianDate: 10, timeScaleDaysPerSec: 2, timeScaleDirty: false });
  });
});
