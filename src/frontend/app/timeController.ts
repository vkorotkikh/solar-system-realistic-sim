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

    if (dom.timeScale) {
      dom.timeScale.min = `${minTimeScale}`;
      dom.timeScale.max = `${maxTimeScale}`;
      dom.timeScale.value = `${simState.timeScaleDaysPerSec}`;
      dom.timeScale.addEventListener('input', () => {
        const nextTimeScale = Number(dom.timeScale?.value);
        if (!Number.isFinite(nextTimeScale)) return;
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
    const value = simState.timeScaleDaysPerSec;
    const rate = `${value > 0 ? '+' : ''}${value.toFixed(1)} d/s`;
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
