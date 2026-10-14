import '../../../src/style.css';
import { createTimeController } from '../../../src/frontend/app/timeController';
const time = createTimeController({
  dom: { timeDate: document.getElementById('time-date'), timeScaleValue: document.getElementById('time-scale-value') },
  simState: { julianDate: 2451545, timeScaleDaysPerSec: 4, timeScaleDirty: false },
  minTimeScale: -120, maxTimeScale: 120,
  currentJulianDate: () => 2451545,
  formatJulianAsDate: () => '2000-01-01',
});
time.updateHud();
