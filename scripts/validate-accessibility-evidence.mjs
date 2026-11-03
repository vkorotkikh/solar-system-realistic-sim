import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredCases = {
  nvda_chrome: ['desktop_discovery', 'mobile_drawer_closed', 'mobile_drawer_open', 'search_and_announcements', 'real_app_recovery', 'native_zoom_and_text', 'axe_incomplete_review'],
  voiceover_safari_macos: ['desktop_discovery', 'mobile_drawer_closed', 'mobile_drawer_open', 'search_and_announcements', 'real_app_recovery', 'native_zoom_and_text', 'axe_incomplete_review'],
  physical_touch: ['mobile_drawer_closed', 'mobile_drawer_open', 'real_app_recovery', 'physical_touch'],
};
const allCases = new Set(Object.values(requiredCases).flat());
const optionalLane = 'voiceover_touch_ios_optional';
const outcomes = new Set(['PASS', 'FAIL', 'NOT_RUN']);
const hasText = value => typeof value === 'string' && value.trim().length > 0;

/** Checks completeness and consistency of a record, never the truth of observations. */
export function validateEvidence(record, evidenceDirectory) {
  const errors = [], pending = [], failures = [];
  const error = (where, message) => errors.push(`${where}: ${message}`);
  const text = (object, key, where) => { if (!hasText(object[key])) error(where, `${key} must be recorded`); };
  const artifact = (value, where) => {
    if (!hasText(value)) return error(where, 'evidence path must be nonempty');
    try { if (!statSync(resolve(evidenceDirectory, value)).isFile()) error(where, `evidence is not a file: ${value}`); }
    catch { error(where, `evidence file unavailable: ${value}`); }
  };
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Expected a JSON evidence object');
  if (!outcomes.has(record.status)) error('record', 'unknown status');
  if (!['UNEXECUTED_MANUAL_PROTOCOL_TEMPLATE', 'MANUAL_ACCESSIBILITY_EVIDENCE'].includes(record.record_type)) error('record', 'unknown record_type');
  const lanes = Array.isArray(record.lanes) ? record.lanes : [];
  const seenLanes = new Set();
  let hasObservedCase = false;
  for (const lane of lanes) {
    if (!lane || typeof lane !== 'object') { error('lanes', 'expected lane object'); continue; }
    const where = String(lane.id);
    if (seenLanes.has(lane.id)) error(where, 'duplicate lane');
    seenLanes.add(lane.id);
    if (!(lane.id in requiredCases) && lane.id !== optionalLane) error(where, 'unknown lane');
    if (!outcomes.has(lane.status)) error(where, 'unknown status');
    if (record.status === 'PASS' && lane.id in requiredCases && lane.status !== 'PASS') error(where, 'overall PASS requires each required lane status PASS');
    const cases = Array.isArray(lane.cases) ? lane.cases : [];
    const seenCases = new Set();
    let observed = false;
    for (const item of cases) {
      if (!item || typeof item !== 'object') { error(where, 'expected case object'); continue; }
      const key = `${where}/${item.id}`;
      if (seenCases.has(item.id)) error(key, 'duplicate case');
      seenCases.add(item.id);
      if (!allCases.has(item.id)) error(key, 'unknown case');
      if (!outcomes.has(item.outcome)) { error(key, 'unknown outcome'); continue; }
      if (item.outcome === 'NOT_RUN') { text(item, 'reason', key); continue; }
      observed = hasObservedCase = true;
      if (item.outcome === 'FAIL') failures.push(key);
      if (!Array.isArray(item.actions) || !item.actions.length || !item.actions.every(hasText)) error(key, 'record exact actions');
      for (const field of ['expected_observation', 'actual_observation', 'focus_destination']) text(item, field, key);
      if (lane.id !== 'physical_touch') text(item, 'spoken_output', key);
      if (!Array.isArray(item.evidence_paths) || !item.evidence_paths.length) error(key, 'record evidence_paths');
      else item.evidence_paths.forEach(path => artifact(path, key));
    }
    const needed = requiredCases[lane.id] ?? (lane.id === optionalLane && lane.status !== 'NOT_RUN' ? requiredCases.physical_touch : []);
    for (const id of needed) {
      const item = cases.find(item => item?.id === id);
      if (!item) error(`${where}/${id}`, 'required case missing');
      else if (item.outcome === 'NOT_RUN') pending.push(`${where}/${id}`);
    }
    if (observed) {
      if (lane.device_available === false) error(where, 'observed cases contradict device_available false');
      if (lane.environment_kind !== 'physical') error(where, 'executed lanes require environment_kind physical; emulation is not manual evidence');
      for (const field of ['hardware', 'os_version', 'browser_version', 'assistive_technology_version', 'at_settings_keyboard_layout', 'text_scaling', 'viewport_orientation']) text(lane, field, where);
      const zooms = Array.isArray(lane.native_zoom_percent) ? lane.native_zoom_percent : [lane.native_zoom_percent];
      if (!zooms.length || zooms.some(value => !Number.isFinite(value) || value <= 0)) error(where, 'record native_zoom_percent');
      if (cases.some(item => item?.id === 'native_zoom_and_text' && item.outcome === 'PASS') && lane.id !== 'physical_touch') {
        if (![100, 200, 400].every(value => zooms.includes(value))) error(where, 'native zoom case requires recorded 100%, 200% and 400% observations');
      }
      if (lane.id === 'nvda_chrome' && (!/Windows/i.test(lane.os_version ?? '') || !/Chrome/i.test(lane.browser_version ?? '') || !/NVDA/i.test(lane.assistive_technology_version ?? ''))) error(where, 'requires actual Windows, Chrome and NVDA versions');
      if (lane.id === 'voiceover_safari_macos' && (!/macOS|Mac OS/i.test(lane.os_version ?? '') || !/Safari/i.test(lane.browser_version ?? '') || !/VoiceOver/i.test(lane.assistive_technology_version ?? ''))) error(where, 'requires actual macOS, Safari and VoiceOver versions');
      if (lane.id === optionalLane && (!/iOS|iPadOS/i.test(lane.os_version ?? '') || !/Safari/i.test(lane.browser_version ?? '') || !/VoiceOver/i.test(lane.assistive_technology_version ?? ''))) error(where, 'requires actual iOS/iPadOS, Safari and VoiceOver versions');
      if ((lane.id === 'physical_touch' || lane.id === optionalLane) && !['phone', 'tablet'].includes(lane.device_class)) error(where, 'physical touch requires device_class phone or tablet');
    } else text(lane, 'reason', where);
    if (lane.status === 'PASS' && needed.some(id => cases.find(item => item?.id === id)?.outcome !== 'PASS')) error(where, 'PASS lane has incomplete or failed required cases');
    if (cases.some(item => item?.outcome === 'FAIL') && lane.status !== 'FAIL') error(where, 'failed case must remain visible in lane status');
  }
  for (const id of Object.keys(requiredCases)) if (!seenLanes.has(id)) error(id, 'required lane missing');
  if (hasObservedCase) {
    if (record.record_type !== 'MANUAL_ACCESSIBILITY_EVIDENCE') error('record', 'observed results cannot remain an unexecuted template');
    if (!/^[0-9a-f]{40}$/i.test(record.application_commit ?? '')) error('record', 'application_commit must identify the full tested revision');
    for (const field of ['application_url', 'date_time', 'operator']) text(record, field, 'record');
    try { if (!['http:', 'https:'].includes(new URL(record.application_url).protocol)) error('record', 'application_url must use http(s)'); } catch { error('record', 'invalid application_url'); }
    if (!Number.isFinite(Date.parse(record.date_time))) error('record', 'invalid date_time');
  }
  if (!Array.isArray(record.axe_incomplete_dispositions)) error('record', 'axe_incomplete_dispositions must be an array');
  else for (const item of record.axe_incomplete_dispositions) {
    if (!item || item.status !== 'PASS') { error('axe_incomplete_dispositions', 'unresolved review item'); continue; }
    for (const field of ['id', 'state', 'selector', 'method', 'actual_observation']) text(item, field, 'axe_incomplete_dispositions');
    if (!Array.isArray(item.evidence_paths) || !item.evidence_paths.length) error('axe_incomplete_dispositions', 'record evidence_paths');
    else item.evidence_paths.forEach(path => artifact(path, 'axe_incomplete_dispositions'));
  }
  if (record.status === 'PASS' && (pending.length || failures.length)) error('record', 'PASS contradicts required lane outcomes');
  if (failures.length && record.status !== 'FAIL') error('record', 'failed required cases must remain visible in record status');
  const ready = !errors.length && !pending.length && !failures.length && record.status === 'PASS';
  return { ready, status: errors.length ? 'INVALID' : failures.length ? 'FAIL' : ready ? 'PASS' : 'NOT_RUN',
    scope: 'record completeness only; human observations are not independently verified', errors, pending, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/validate-accessibility-evidence.mjs <record.json>');
    const path = resolve(process.argv[2]);
    const result = validateEvidence(JSON.parse(readFileSync(path, 'utf8')), dirname(path));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.errors.length ? 2 : result.ready ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ ready: false, status: 'INVALID', errors: [error.message] }, null, 2));
    process.exitCode = 2;
  }
}
