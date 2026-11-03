import { describe, expect, it } from 'vitest';
import { validateEvidence } from './validate-accessibility-evidence.mjs';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const template = JSON.parse(readFileSync(new URL('../agent-notes/ACCESSIBILITY_MANUAL_EVIDENCE_TEMPLATE_2026-10-30.json', import.meta.url), 'utf8'));
const script = new URL('./validate-accessibility-evidence.mjs', import.meta.url);
function run(record, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'solar-manual-evidence-'));
  try {
    writeFileSync(join(dir, 'record.json'), JSON.stringify(record));
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    const result = spawnSync(process.execPath, [script.pathname, join(dir, 'record.json')], { encoding: 'utf8' });
    return { status: result.status, output: JSON.parse(result.stdout || '{}'), stderr: result.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function observedRecord() {
  const record = structuredClone(template);
  Object.assign(record, { record_type: 'MANUAL_ACCESSIBILITY_EVIDENCE', status: 'PASS', application_commit: 'a'.repeat(40), application_url: 'http://localhost:4175', date_time: '2026-11-02T12:00:00Z', operator: 'Named tester' });
  for (const lane of record.lanes.filter(lane => !lane.id.endsWith('_optional'))) {
    Object.assign(lane, { status: 'PASS', environment_kind: 'physical', device_class: lane.id === 'physical_touch' ? 'phone' : 'laptop', hardware: 'Test device', os_version: lane.id === 'nvda_chrome' ? 'Windows 11' : lane.id === 'physical_touch' ? 'Android 16' : 'macOS 15', browser_version: lane.id === 'nvda_chrome' ? 'Chrome 130' : lane.id === 'physical_touch' ? 'Chrome 130' : 'Safari 18', assistive_technology_version: lane.id === 'nvda_chrome' ? 'NVDA 2026.1' : lane.id === 'physical_touch' ? 'disabled' : 'VoiceOver 15', at_settings_keyboard_layout: 'Default; US', native_zoom_percent: [100, 200, 400], text_scaling: 'OS text size 200%', viewport_orientation: '1440x900; portrait and landscape' });
    for (const item of lane.cases) Object.assign(item, { outcome: 'PASS', actions: ['Observed the case on the device'], expected_observation: 'Controls remain reachable', actual_observation: 'Controls remained reachable', spoken_output: 'Recorded spoken output', focus_destination: 'Controls button', evidence_paths: ['observation.txt'] });
  }
  return record;
}

describe('manual accessibility evidence readiness CLI', () => {
  it('retains the unexecuted template as NOT_RUN and exits nonzero', () => {
    const result = run(template);
    expect(result.status).toBe(1);
    expect(result.output.status).toBe('NOT_RUN');
    expect(result.output.ready).toBe(false);
    expect(result.output.errors).toEqual([]);
    expect(result.output.pending).toContain('nvda_chrome/desktop_discovery');
  });
  it('recognizes complete recorded observations without claiming independent certification', () => {
    const result = run(observedRecord(), { 'observation.txt': 'Observed by the named tester.' });
    expect(result.status).toBe(0);
    expect(result.output.ready).toBe(true);
    expect(result.output.scope).toBe('record completeness only; human observations are not independently verified');
  });
  it.each([
    ['Linux WebKit presented as VoiceOver', record => { record.lanes[1].os_version = 'Linux'; record.lanes[1].browser_version = 'Playwright WebKit'; }],
    ['desktop device presented as a phone', record => { record.lanes[2].device_class = 'desktop'; }],
    ['emulated touch presented as physical', record => { record.lanes[2].environment_kind = 'emulated'; }],
    ['missing actual spoken output', record => { record.lanes[0].cases[0].spoken_output = null; }],
    ['missing application revision', record => { record.application_commit = null; }],
    ['missing required lane', record => { record.lanes.splice(0, 1); }],
    ['missing required case', record => { record.lanes[0].cases.splice(0, 1); }],
    ['duplicate case instead of coverage', record => { record.lanes[0].cases[1] = structuredClone(record.lanes[0].cases[0]); }],
    ['unacknowledged observed failure outside required case set', record => { record.lanes[2].status = 'FAIL'; record.lanes[2].cases[0].outcome = 'FAIL'; }],
    ['required lane still NOT_RUN under an overall PASS', record => { record.lanes[0].status = 'NOT_RUN'; }],
    ['observations on an unavailable device', record => { record.lanes[0].device_available = false; }],
    ['unknown outcome', record => { record.lanes[0].cases[0].outcome = 'SKIPPED'; }],
    ['missing evidence artifact', record => { record.lanes[0].cases[0].evidence_paths = ['absent.txt']; }],
    ['unresolved audit review', record => { record.axe_incomplete_dispositions = [{ id: 'color-contrast', status: 'NOT_RUN' }]; }],
  ])('rejects %s', (_, mutate) => {
    const record = observedRecord(); mutate(record);
    const result = run(record, { 'observation.txt': 'Actual observation evidence' });
    expect(result.status).toBe(2);
    expect(result.output.ready).toBe(false);
    expect(result.output.errors.length).toBeGreaterThan(0);
  });
  it('accepts an honest partial record while keeping missing lanes pending', () => {
    const record = observedRecord(); record.status = 'NOT_RUN';
    record.lanes[1] = structuredClone(template.lanes[1]);
    record.lanes[0].status = 'NOT_RUN';
    record.lanes[0].cases[1] = structuredClone(template.lanes[0].cases[1]);
    const result = run(record, { 'observation.txt': 'Actual observed case' });
    expect(result.status).toBe(1);
    expect(result.output.status).toBe('NOT_RUN');
    expect(result.output.errors).toEqual([]);
    expect(result.output.pending).toContain('voiceover_safari_macos/desktop_discovery');
  });
  it('returns structured INVALID errors for a null case', () => {
    const record = observedRecord(); record.lanes[0].cases[0] = null;
    const result = validateEvidence(record, tmpdir());
    expect(result.status).toBe('INVALID');
    expect(result.errors).toContain('nvda_chrome: expected case object');
  });
  it('retains observed failures and never reports readiness', () => {
    const record = observedRecord(); record.status = 'FAIL'; record.lanes[0].status = 'FAIL'; record.lanes[0].cases[0].outcome = 'FAIL';
    const result = run(record, { 'observation.txt': 'Failure reproduction and observation' });
    expect(result.status).toBe(1);
    expect(result.output.status).toBe('FAIL');
    expect(result.output.failures).toContain('nvda_chrome/desktop_discovery');
  });
});
