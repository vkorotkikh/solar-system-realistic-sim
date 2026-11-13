interface TimeControllerDom {
  nowTime?: HTMLElement | null;
  plannerDate?: HTMLInputElement | null;
  plannerArrivalDate?: HTMLInputElement | null;
  timeScale?: HTMLInputElement | null;
  timeScaleValue?: HTMLElement | null;
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

/**
 * Speeds the slider offers, slowest first: whole days per second, ±12 h/s and
 * real time. The slider's value is an index into this list. The real-time stop
 * is the only one slow enough for solar physics polls to share a 0.01-day
 * epoch step (PR #32, docs/solar-render-delivery.md).
 */
export function timeScaleStops(min: number, max: number): number[] {
  const stops = [-0.5, REAL_TIME_DAYS_PER_SEC, 0.5];
  for (let days = Math.ceil(min); days <= max; days++) stops.push(days);
  return stops.filter(rate => rate >= min && rate <= max).sort((a, b) => a - b);
}

function rateLabel(rate: number): string {
  if (rate === REAL_TIME_DAYS_PER_SEC) return 'Real time';
  const sign = rate > 0 ? '+' : '';
  if (rate !== 0 && Math.abs(rate) < 1) return `${sign}${Number((rate * 24).toFixed(1))} h/s`;
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
  const stops = timeScaleStops(minTimeScale, maxTimeScale);

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

    const slider = dom.timeScale;
    if (slider) {
      const current = simState.timeScaleDaysPerSec;
      const nearest = stops.reduce((best, rate, i) => Math.abs(rate - current) < Math.abs(stops[best] - current) ? i : best, 0);
      slider.min = '0';
      slider.max = `${stops.length - 1}`;
      slider.value = `${nearest}`;
      slider.setAttribute('aria-valuetext', rateLabel(stops[nearest]));
      slider.addEventListener('input', () => {
        const nextTimeScale = stops[Number(slider.value)];
        if (nextTimeScale === undefined) return;
        slider.setAttribute('aria-valuetext', rateLabel(nextTimeScale));
        if (nextTimeScale !== simState.timeScaleDaysPerSec) {
          simState.timeScaleDaysPerSec = nextTimeScale;
          simState.timeScaleDirty = true;
        }
      }, { signal });
    }
  }

  function advanceLocalTime(deltaSeconds: number) {
    if (!simState.paused) {
      simState.julianDate += deltaSeconds * simState.timeScaleDaysPerSec;
    }
  }

  function updateHud() {
    const rate = rateLabel(simState.timeScaleDaysPerSec);
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
