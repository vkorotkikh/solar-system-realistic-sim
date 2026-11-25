interface TimeControllerDom {
  nowTime?: HTMLElement | null;
  plannerDate?: HTMLInputElement | null;
  plannerArrivalDate?: HTMLInputElement | null;
  timeScale?: HTMLInputElement | null;
  timeScaleValue?: HTMLElement | null;
  /** Checked: the slider runs in hours per second. */
  timeScaleUnit?: HTMLInputElement | null;
  /** Holds the slider's end labels as its first and last child. */
  timeScaleContext?: HTMLElement | null;
  timeDate?: HTMLElement | null;
  sessionLabel?: HTMLElement | null;
}

interface TimeControllerState {
  julianDate: number;
  timeScaleDaysPerSec: number;
  timeScaleDirty: boolean;
  paused?: boolean;
}

export interface TimeController {
  bindUi: () => void;
  advanceLocalTime: (deltaSeconds: number) => void;
  updateHud: () => void;
}

interface CreateTimeControllerArgs {
  dom: TimeControllerDom;
  simState: TimeControllerState;
  minTimeScale: number;
  maxTimeScale: number;
  currentJulianDate: () => number;
  formatJulianAsDate: (julianDate: number) => string;
  plannerArrivalOffsetDays?: number;
  onTimeJump?: () => void;
  signal?: AbortSignal;
}

/** One simulated second per real second. */
export const REAL_TIME_DAYS_PER_SEC = 1 / 86_400;

export type TimeScaleUnit = 'days' | 'hours';

/**
 * Speeds the slider offers, slowest first, in days per second. The slider's
 * value is an index into this list. In days: whole days per second, ±12 h/s
 * and real time. In hours: whole hours per second up to a day per second, and
 * real time. The real-time stop is the only one slow enough for solar physics
 * polls to share a 0.01-day epoch step (PR #32, docs/solar-render-delivery.md).
 */
export function timeScaleStops(min: number, max: number, unit: TimeScaleUnit = 'days'): number[] {
  const stops = [REAL_TIME_DAYS_PER_SEC];
  if (unit === 'hours') {
    for (let hours = -24; hours <= 24; hours++) stops.push(hours / 24);
  } else {
    stops.push(-0.5, 0.5);
    for (let days = Math.ceil(min); days <= max; days++) stops.push(days);
  }
  return stops.filter(rate => rate >= min && rate <= max).sort((a, b) => a - b);
}

function rateLabel(rate: number, unit: TimeScaleUnit): string {
  if (rate === REAL_TIME_DAYS_PER_SEC) return 'Real time';
  const sign = rate > 0 ? '+' : '';
  if (unit === 'hours' || (rate !== 0 && Math.abs(rate) < 1)) return `${sign}${Number((rate * 24).toFixed(1))} h/s`;
  return `${sign}${rate.toFixed(1)} d/s`;
}

export function createTimeController({
  dom,
  simState,
  minTimeScale,
  maxTimeScale,
  currentJulianDate,
  formatJulianAsDate,
  plannerArrivalOffsetDays = 240,
  onTimeJump,
  signal
}: CreateTimeControllerArgs): TimeController {
  let unit: TimeScaleUnit = 'days';
  let stops = timeScaleStops(minTimeScale, maxTimeScale, unit);

  /** Point the slider at the stop nearest the current speed and label its ends. */
  function showStops(): number {
    const current = simState.timeScaleDaysPerSec;
    const nearest = stops.reduce((best, rate, i) => Math.abs(rate - current) < Math.abs(stops[best] - current) ? i : best, 0);
    const slider = dom.timeScale;
    if (slider) {
      slider.min = '0';
      slider.max = `${stops.length - 1}`;
      slider.value = `${nearest}`;
      slider.setAttribute('aria-valuetext', rateLabel(stops[nearest], unit));
    }
    const edge = (rate: number) => unit === 'hours' ? `${Math.abs(Math.round(rate * 24))} h` : `${Math.abs(rate)}`;
    const [first, last] = [dom.timeScaleContext?.firstElementChild, dom.timeScaleContext?.lastElementChild];
    if (first) first.textContent = `\u2212${edge(stops[0])} reverse`;
    if (last) last.textContent = `+${edge(stops[stops.length - 1])} forward`;
    return stops[nearest];
  }

  function bindUi() {
    dom.nowTime?.addEventListener('click', () => {
      simState.julianDate = currentJulianDate();
      if (dom.plannerDate) {
        dom.plannerDate.value = formatJulianAsDate(simState.julianDate);
      }
      if (dom.plannerArrivalDate) {
        dom.plannerArrivalDate.value = formatJulianAsDate(simState.julianDate + plannerArrivalOffsetDays);
      }
      onTimeJump?.();
    }, { signal });

    const setTimeScale = (next: number) => {
      if (next === simState.timeScaleDaysPerSec) return;
      simState.timeScaleDaysPerSec = next;
      simState.timeScaleDirty = true;
    };
    showStops();
    const slider = dom.timeScale;
    slider?.addEventListener('input', () => {
      const nextTimeScale = stops[Number(slider.value)];
      if (nextTimeScale === undefined) return;
      slider.setAttribute('aria-valuetext', rateLabel(nextTimeScale, unit));
      setTimeScale(nextTimeScale);
    }, { signal });

    const unitSwitch = dom.timeScaleUnit;
    unitSwitch?.addEventListener('change', () => {
      unit = unitSwitch.checked ? 'hours' : 'days';
      stops = timeScaleStops(minTimeScale, maxTimeScale, unit);
      // The slider can only sit on a stop, so the speed moves to the nearest one the new unit has.
      setTimeScale(showStops());
    }, { signal });
  }

  function advanceLocalTime(deltaSeconds: number) {
    if (!simState.paused) {
      simState.julianDate += deltaSeconds * simState.timeScaleDaysPerSec;
    }
  }

  function updateHud() {
    const rate = rateLabel(simState.timeScaleDaysPerSec, unit);
    if (dom.timeScaleValue && dom.timeScaleValue.textContent !== rate) dom.timeScaleValue.textContent = rate;
    // The header says what the clock is doing instead of calling the simulation live (H2.10).
    const session = simState.paused ? 'Paused' : `Simulation · ${rate}`;
    if (dom.sessionLabel && dom.sessionLabel.textContent !== session) dom.sessionLabel.textContent = session;
    if (dom.timeDate) {
      const formattedDate = formatJulianAsDate(simState.julianDate);
      if (dom.timeDate.textContent !== formattedDate) dom.timeDate.textContent = formattedDate;
      if ('dateTime' in dom.timeDate && dom.timeDate.dateTime !== formattedDate) {
        (dom.timeDate as HTMLTimeElement).dateTime = formattedDate;
      }
    }
  }

  return {
    bindUi,
    advanceLocalTime,
    updateHud
  };
}
