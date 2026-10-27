import { test } from 'vitest';
import assert from 'node:assert/strict';
import { distribution, validatePhysics, summarizeRequests, frameClockSegments, activityUniformEvidence } from './solar-delivery-metrics.mjs';

test('a failed, pending, or schema-invalid response cannot inflate delivered fraction', () => {
  const result = summarizeRequests([
    { status: 200, validation: { valid: true }, finishedAt: 2, latencyMs: 50 },
    { status: 200, validation: { valid: false }, finishedAt: 3, latencyMs: 100 },
    { failed: 'net::ERR_ABORTED', finishedAt: 4, latencyMs: 20000 },
    {},
  ]);
  assert.equal(result.attempted, 4);
  assert.equal(result.delivered, 1);
  assert.equal(result.deliveredFraction, 0.25);
  assert.equal(result.pending, 1);
  assert.equal(summarizeRequests([]).deliveredFraction, null);
});

test('latency distribution uses nearest ranks and excludes missing samples', () => {
  assert.deepEqual(distribution([100, undefined, 25, 50, 75]), { count: 4, min: 25, median: 50, p95: 100, p99: 100, max: 100 });
});

test('headers or partial capture alone cannot establish complete delivery', () => {
  const result = summarizeRequests([
    { status: 200, validation: { valid: true } },
    { status: 200, validation: { valid: true }, finishedAt: 3, captureError: 'body unavailable' },
    { status: 200, validation: { valid: true }, finishedAt: 0 },
  ]);
  assert.equal(result.attempted, 3);
  assert.equal(result.delivered, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.deliveredFraction, 1 / 3);
});

test('physics capture rejects a successful HTTP body with wrong epoch or concealed fallback', () => {
  const url = 'http://127.0.0.1:9196/solar/physics?jd_tdb=2461327.5&forcing=hybrid';
  const payload = { schema: { name: 'solar_physics_state', version: 2 }, jd_time_scale: 'TDB',
    epoch_jd_tdb: 2461327.5, wall_epoch_jd_tdb: 2461327.5, activity_index: 0.42,
    forcing: 'hybrid', effective_forcing: 'synthetic', live_data_enabled: false, fallback_reason: 'disabled_unvalidated',
    forcing_status: { requested: 'hybrid', effective: 'synthetic', runtime_eligible: false, fallback_reason: 'disabled_unvalidated' } };
  assert.equal(validatePhysics(payload, url).valid, true);
  assert.deepEqual(validatePhysics({ ...payload, epoch_jd_tdb: 2461328.5 }, url).failures, ['request-epoch']);
  assert.deepEqual(validatePhysics({ ...payload, fallback_reason: undefined }, url).failures, ['fallback-disclosure']);
});

test('frame-clock accounting excludes deliberate jump/pause phase boundaries', () => {
  const result = frameClockSegments([
    { at: 0, phase: 'running-default', rate: '4', simulationDate: '2026-10-14T00:00:00Z', visibility: 'visible' },
    { at: 1000, phase: 'running-default', rate: '4', simulationDate: '2026-10-18T00:00:00Z', visibility: 'visible' },
    { at: 2000, phase: 'now-paused', rate: '4', simulationDate: '2026-10-14T00:00:00Z', visibility: 'visible' },
    { at: 3000, phase: 'now-paused', rate: '4', simulationDate: '2026-10-14T00:00:00Z', visibility: 'visible' },
  ]);
  assert.equal(result.segments.length, 2);
  assert.equal(result.expectedDays, 4);
  assert.equal(result.actualDays, 4);
  assert.equal(result.ratio, 1);
});

test('repeated payloads retain the actual last uploaded activity in every program', () => {
  const uniforms = [1, 2, 3].map((program) => ({ at: 10, program, name: 'activity', value: 0.68 }));
  const evidence = activityUniformEvidence(uniforms, 0.68, 30, 60);
  assert.equal(evidence.matched, true);
  assert.equal(evidence.programs.length, 3);
  assert.ok(evidence.programs.every((program) => program.match.evidence === 'retained-uniform'));
});

test('an overwritten matching value or a different activity-named uniform cannot pass', () => {
  const uniforms = [
    { at: 10, program: 1, name: 'activity', value: 0.68 },
    { at: 20, program: 1, name: 'activity', value: 0.3 },
    { at: 35, program: 2, name: 'coronalHoleActivity', value: 0.68 },
  ];
  assert.equal(activityUniformEvidence(uniforms, 0.68, 30, 60).matched, false);
});

test('all activity programs must match within the original tolerance and response window', () => {
  const uniforms = [
    { at: 31, program: 1, name: 'activity', value: 0.68 },
    { at: 31, program: 2, name: 'activity', value: 0.67 },
    { at: 60, program: 2, name: 'activity', value: 0.68 },
  ];
  assert.equal(activityUniformEvidence(uniforms, 0.68, 30, 60).matched, false);
  assert.equal(activityUniformEvidence(uniforms, 0.68, 30, 61).matched, true);
  assert.equal(activityUniformEvidence([], 0.68, 30, 60).matched, false);
});
