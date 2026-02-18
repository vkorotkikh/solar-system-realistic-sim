export function createTimeController({
  dom,
  simState,
  minTimeScale,
  maxTimeScale,
  currentJulianDate,
  formatJulianAsDate,
  plannerArrivalOffsetDays = 240
}) {
  function bindUi() {
    dom.nowTime?.addEventListener('click', () => {
      simState.julianDate = currentJulianDate();
      if (dom.plannerDate) {
        dom.plannerDate.value = formatJulianAsDate(simState.julianDate);
      }
      if (dom.plannerArrivalDate) {
        dom.plannerArrivalDate.value = formatJulianAsDate(simState.julianDate + plannerArrivalOffsetDays);
      }
    });

    if (dom.timeScale) {
      dom.timeScale.min = `${minTimeScale}`;
      dom.timeScale.max = `${maxTimeScale}`;
      dom.timeScale.value = `${simState.timeScaleDaysPerSec}`;
      dom.timeScale.addEventListener('input', () => {
        const nextTimeScale = Number(dom.timeScale.value);
        if (!Number.isFinite(nextTimeScale)) return;
        if (nextTimeScale !== simState.timeScaleDaysPerSec) {
          simState.timeScaleDaysPerSec = nextTimeScale;
          simState.timeScaleDirty = true;
        }
      });
    }
  }

  function advanceLocalTime(deltaSeconds) {
    if (!simState.paused) {
      simState.julianDate += deltaSeconds * simState.timeScaleDaysPerSec;
    }
  }

  function updateHud() {
    if (dom.timeScaleValue) {
      dom.timeScaleValue.textContent = simState.timeScaleDaysPerSec.toFixed(1);
    }
    if (dom.timeDate) {
      dom.timeDate.textContent = formatJulianAsDate(simState.julianDate);
    }
  }

  return {
    bindUi,
    advanceLocalTime,
    updateHud
  };
}
