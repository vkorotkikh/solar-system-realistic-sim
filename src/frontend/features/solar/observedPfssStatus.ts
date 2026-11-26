/**
 * What the observed-field label says and whether the real GONG lines are drawn (ADR 0009).
 *
 * `deriveObservedLabel` is pure: it reads no clock and touches no DOM, so every row of the
 * state table is tested directly. `createObservedLabelRenderer` writes its result with text
 * nodes only, rebuilds only when something other than the offset changed, and speaks each
 * change of state once through a separate status element.
 */
import { julianDateToDate } from '../../../constants';
import { REAL_TIME_DAYS_PER_SEC } from '../../app/timeController';
import type { ObservedPfssClientState, ObservedPfssSidecar } from './observedPfssClient';
import type { SolarDataSourceStatus } from './solarDataStatus';
import { OBSERVED_FIELD_LINE_STYLE } from './solarMagnetics';

export const OBSERVED_CHIP_PHRASE = 'real GONG field lines drawn';
const MAX_MESSAGE_CHARS = 200;

export interface ObservedLabelInputs {
  client: ObservedPfssClientState;
  /** The "Solar magnetic field" switch: the synthetic lines are drawn too. */
  syntheticShown: boolean;
  clockJdTdb: number;
  /** `currentJulianDate()`, which is already TDB. */
  realJdTdb: number;
  paused: boolean;
  timeScaleDaysPerSec: number;
  /** The speed as the time panel writes it, such as "+4.0 d/s". */
  speedText: string;
}

export type ObservedRow = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ObservedLabel {
  row: ObservedRow;
  drawLines: boolean;
  headline: string | null;
  /** Row 8 only; changes with the simulation date and is never announced. */
  offset: string | null;
  jumpButton: boolean;
  sentences: string[];
  legend: boolean;
  caveats: string[];
  facts: string | null;
  details: string[];
  /** The refresh-failed note of rows 7 and 8. */
  note: string | null;
  closing: string | null;
  /** Spoken once each time `stateKey` changes. */
  announcement: string | null;
  stateKey: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `YYYY-MM-DD HH:MM UTC`. */
export function formatUtcMinute(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

const formatUtcClock = (ms: number) => {
  const date = new Date(ms);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

const formatJdTdb = (jdTdb: number) => formatUtcMinute(julianDateToDate(jdTdb).getTime());

/** The offset between the simulation date and the map, floored: minutes below a day, hours from one. */
export function formatMapOffset(clockJdTdb: number, mapJdTdb: number): string {
  const minutes = Math.floor(Math.abs(clockJdTdb - mapJdTdb) * 1440);
  const side = clockJdTdb >= mapJdTdb ? 'before' : 'after';
  const span = minutes < 1440
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
  return `${span} ${side} the simulation date`;
}

/** How long the clock takes to cross the window at this speed, as one rounded whole number. */
export function formatCrossingTime(windowDays: number, daysPerSecond: number): string {
  const seconds = windowDays / Math.abs(daysPerSecond);
  const [value, unit] = seconds < 120 ? [seconds, 'second']
    : seconds < 7_200 ? [seconds / 60, 'minute']
      : seconds < 172_800 ? [seconds / 3_600, 'hour']
        : [seconds / 86_400, 'day'];
  const whole = Math.max(1, Math.round(value));
  return `${whole} ${unit}${whole === 1 ? '' : 's'}`;
}

const signedPercent = (fraction: number) => `${fraction >= 0 ? '+' : '−'}${Math.abs(fraction * 100).toFixed(1)}`;
const degrees = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;

/** An error body's message is shown only when it is a string of at most 200 characters. */
function shownMessage(message: unknown): string | null {
  return typeof message === 'string' && message.length > 0 && message.length <= MAX_MESSAGE_CHARS ? message : null;
}

const mapTime = (sidecar: ObservedPfssSidecar) => formatUtcMinute(Date.parse(sidecar.map_reference_utc));

const emptyLabel = (row: ObservedRow): ObservedLabel => ({
  row, drawLines: false, headline: null, offset: null, jumpButton: false, sentences: [], legend: false,
  caveats: [], facts: null, details: [], note: null, closing: null, announcement: null, stateKey: String(row),
});

export function deriveObservedLabel(inputs: ObservedLabelInputs): ObservedLabel {
  const { client } = inputs;
  if (!client.enabled) return emptyLabel(1);
  const closing = inputs.syntheticShown ? 'Synthetic field shown.' : 'No field layer is drawn.';
  const failure = client.failure;
  const nextTry = client.nextTryMs === null ? null : `${formatUtcClock(client.nextTryMs)} UTC`;
  const simple = (row: ObservedRow, key: string, headline: string, sentences: string[] = []): ObservedLabel => ({
    ...emptyLabel(row), headline, sentences, closing, announcement: headline, stateKey: `${row}:${key}`,
  });

  if (client.awaitingFirst && !client.accepted && !failure) return simple(2, 'loading', 'Observed field: loading.');
  if (failure?.kind === 'not-found') {
    const message = shownMessage(failure.message);
    return simple(3, 'not-found', 'Observed field: no sidecar data (route 404).', message ? [message] : []);
  }
  if (failure?.kind === 'http') {
    const message = shownMessage(failure.message);
    return simple(4, `http-${failure.status}`, `Observed field: sidecar unavailable (HTTP ${failure.status}).`, message ? [message] : []);
  }
  if (failure?.kind === 'unreadable') {
    return simple(4, 'unreadable', 'Observed field: sidecar unreadable (not JSON, or too large).');
  }
  if (failure?.kind === 'invalid') {
    return simple(4, 'invalid', 'Observed field: sidecar invalid (schema check failed). Run the probe again from this checkout.');
  }
  if (failure?.kind === 'frame-check') {
    return simple(5, 'frame-check',
      `Observed field: not drawn. Frame check failed (Δ = ${degrees(failure.deltaDeg)}°). The probe's output has the details.`);
  }
  const sidecar = client.accepted;
  if (!sidecar) {
    const at = failure?.kind === 'transient' ? formatUtcMinute(failure.atMs) : '—';
    return simple(6, 'fetch-failed', `Observed field: fetch failed ${at}; next try ${nextTry ?? '—'}.`);
  }

  const note = failure?.kind === 'transient'
    ? `refresh failed ${formatUtcMinute(failure.atMs)}; showing map ${mapTime(sidecar)}; next try ${nextTry ?? '—'}`
    : null;
  const from = sidecar.valid_from_jd_tdb;
  const until = sidecar.valid_until_jd_tdb;
  const inWindow = (jd: number) => from <= jd && jd <= until;

  if (!inWindow(inputs.clockJdTdb)) {
    const sentences = [
      `No GONG map covers the simulation date. Latest map: ${mapTime(sidecar)}, drawn from ${formatJdTdb(from)} to ${formatJdTdb(until)}.`,
    ];
    const rate = inputs.timeScaleDaysPerSec;
    if (!inputs.paused && rate !== 0 && rate !== REAL_TIME_DAYS_PER_SEC) {
      sentences.push(`The clock is running at ${inputs.speedText}; at that speed it crosses this map's window in about ${formatCrossingTime(until - from, rate)}.`);
    }
    if (inputs.realJdTdb > until) sentences.push("This map's window has ended; run the probe again.");
    const headline = 'Observed field: not drawn.';
    return {
      ...emptyLabel(7), headline, jumpButton: inWindow(inputs.realJdTdb), sentences, note, closing,
      announcement: note ? `${headline} ${note}.` : headline, stateKey: `7:${note ? 'note' : ''}`,
    };
  }

  const counts = sidecar.line_counts;
  const drawn = counts.open + counts.closed;
  const details = [
    'PFSS solution from the NSO/GONG zqs synoptic map, built from about one solar rotation of observations ending at the map time',
    `${drawn} lines drawn, seeded evenly · source surface ${sidecar.source_surface_radii} R☉`,
    ...(counts.unresolved > 0 ? [`${counts.unresolved} of ${drawn + counts.unresolved} traces unresolved and not drawn`] : []),
    `flux correction: polarity scaling (NASA WSA method 2); residual monopole ${sidecar.flux_correction.residual_monopole_g.toPrecision(2)} G`,
    `frame: IAU_SUN body; central meridian agrees with the ephemeris to ${degrees(sidecar.carrington_check.delta_deg)}° (pass within ${sidecar.carrington_check.tolerance_deg}°)`,
    'NASA line budget: not measured for this map (uncorroborated)',
  ];
  const caveats = [
    'Synoptic map: its far side is up to 27 days older. Uncorroborated: not checked against NASA for this map. Other Sun layers are model-only and will not line up with these lines.',
    ...(inputs.syntheticShown ? ['Model field lines are drawn too (cream, green, pink; they pulse).'] : []),
  ];
  const headline = `Real field lines · GONG map of ${mapTime(sidecar)}`;
  return {
    ...emptyLabel(8),
    drawLines: true,
    headline,
    offset: formatMapOffset(inputs.clockJdTdb, sidecar.map_reference_jd_tdb),
    legend: true,
    caveats,
    facts: `degree ${sidecar.degree} · flux corrected ${signedPercent(sidecar.flux_correction.q)}% · frame check passed (${degrees(sidecar.carrington_check.delta_deg)}°)`,
    details,
    note,
    announcement: `Real field lines drawn: GONG map of ${mapTime(sidecar)}.${note ? ` ${note}.` : ''}`,
    stateKey: `8:${note ? 'note' : ''}`,
  };
}

/** The Sun chip while real lines are drawn (G2): its usual text and one fixed phrase. */
export function withObservedChipPhrase(status: SolarDataSourceStatus, drawn: boolean): SolarDataSourceStatus {
  return drawn ? { ...status, text: `${status.text} · ${OBSERVED_CHIP_PHRASE}` } : status;
}

export interface ObservedLabelRenderer {
  render(label: ObservedLabel): void;
}

/**
 * Writes the label into `container` and the announcement into `announcer`. The label is not a
 * live region; `announcer` is a visually hidden `role="status"` element.
 */
export function createObservedLabelRenderer(
  container: HTMLElement,
  announcer: HTMLElement,
  onJump: () => void,
): ObservedLabelRenderer {
  let contentKey: string | null = null;
  let offsetNode: Text | null = null;
  let announcedKey: string | null = null;
  const doc = container.ownerDocument;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.append(doc.createTextNode(text));
    return node;
  };

  function swatch(colour: string, words: string) {
    const item = element('span', 'observed-field-label__legend-item');
    const chip = element('span', 'observed-field-label__swatch');
    chip.style.backgroundColor = colour;
    chip.setAttribute('aria-hidden', 'true');
    item.append(chip, doc.createTextNode(words));
    return item;
  }

  function build(label: ObservedLabel) {
    const nodes: Node[] = [];
    offsetNode = null;
    if (label.headline) {
      const headline = element('p', 'observed-field-label__headline', label.headline);
      if (label.offset !== null) {
        offsetNode = doc.createTextNode(label.offset);
        const offset = element('span', 'observed-field-label__offset');
        offset.append(offsetNode);
        headline.append(doc.createTextNode(' '), offset);
      }
      nodes.push(headline);
    }
    if (label.jumpButton) {
      const button = element('button', 'button button--primary observed-field-label__jump', 'Jump to now and pause');
      button.type = 'button';
      button.addEventListener('click', onJump);
      nodes.push(button);
    }
    for (const sentence of label.sentences) nodes.push(element('p', 'observed-field-label__text', sentence));
    if (label.legend) {
      const legend = element('p', 'observed-field-label__legend');
      legend.append(
        swatch(OBSERVED_FIELD_LINE_STYLE.closed, 'closed'), doc.createTextNode(', '),
        swatch(OBSERVED_FIELD_LINE_STYLE.openOutward, 'open outward'), doc.createTextNode(', '),
        swatch(OBSERVED_FIELD_LINE_STYLE.openInward, 'open inward'),
      );
      nodes.push(legend);
    }
    for (const caveat of label.caveats) nodes.push(element('p', 'observed-field-label__muted', caveat));
    if (label.facts) nodes.push(element('p', 'observed-field-label__facts', label.facts));
    if (label.note) nodes.push(element('p', 'observed-field-label__muted', label.note));
    if (label.details.length) {
      const details = element('details', 'observed-field-label__details');
      details.append(element('summary', '', 'Details'));
      for (const line of label.details) details.append(element('p', 'observed-field-label__muted', line));
      nodes.push(details);
    }
    if (label.closing) nodes.push(element('p', 'observed-field-label__muted', label.closing));
    return nodes;
  }

  return {
    render(label) {
      container.hidden = label.row === 1;
      const key = JSON.stringify({ ...label, offset: label.offset === null ? null : '' });
      if (key !== contentKey) {
        const active = doc.activeElement;
        const jumpWasFocused = Boolean(active && container.contains(active) && active.classList.contains('observed-field-label__jump'));
        container.replaceChildren(...build(label));
        contentKey = key;
        // The button is gone once the jump has worked: keep focus in the label (D7).
        if (jumpWasFocused && !label.jumpButton) container.focus();
      } else if (offsetNode && label.offset !== null && offsetNode.data !== label.offset) {
        offsetNode.data = label.offset;
      }
      if (label.stateKey !== announcedKey) {
        announcedKey = label.stateKey;
        announcer.textContent = label.announcement ?? '';
      }
    },
  };
}
