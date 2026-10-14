export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (fraction) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
  return { count: sorted.length, min: sorted[0] ?? null, median: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) ?? null };
}

export function validatePhysics(payload, url) {
  const requested = new URL(url).searchParams;
  const failures = [];
  if (payload?.schema?.name !== 'solar_physics_state' || payload.schema.version !== 2) failures.push('schema');
  if (payload?.jd_time_scale !== 'TDB') failures.push('time-scale');
  if (!Number.isFinite(payload?.epoch_jd_tdb) || Math.abs(payload.epoch_jd_tdb - Number(requested.get('jd_tdb'))) > 5e-9) failures.push('request-epoch');
  if (!Number.isFinite(payload?.wall_epoch_jd_tdb)) failures.push('wall-epoch');
  if (!Number.isFinite(payload?.activity_index) || payload.activity_index < 0 || payload.activity_index > 1) failures.push('activity');
  if (payload?.forcing !== requested.get('forcing')) failures.push('requested-forcing');
  if (payload?.effective_forcing !== 'synthetic' || payload?.live_data_enabled !== false) failures.push('effective-forcing');
  if (payload?.forcing_status?.requested !== payload?.forcing || payload?.forcing_status?.effective !== 'synthetic' || payload?.forcing_status?.runtime_eligible !== false) failures.push('forcing-status');
  if (payload?.forcing === 'hybrid' && (payload?.fallback_reason !== 'disabled_unvalidated' || payload?.forcing_status?.fallback_reason !== 'disabled_unvalidated')) failures.push('fallback-disclosure');
  return { valid: failures.length === 0, failures };
}

export function summarizeRequests(records) {
  const statuses = {};
  for (const record of records) {
    const key = record.failed ? `failed:${record.failed}` : String(record.status ?? 'pending');
    statuses[key] = (statuses[key] ?? 0) + 1;
  }
  const delivered = records.filter((record) => record.status === 200 && record.validation?.valid
    && Number.isFinite(record.finishedAt) && !record.failed && !record.captureError).length;
  return { attempted: records.length, delivered, deliveredFraction: records.length ? delivered / records.length : null,
    pending: records.filter((record) => !Number.isFinite(record.finishedAt) && !record.failed).length,
    statuses, latencyMs: distribution(records.map((record) => record.latencyMs)) };
}

// Uniform values persist until overwritten. Three.js deliberately omits GL
// uploads when the value is unchanged, including repeated paused-epoch replies.
export function activityUniformEvidence(uniforms, activity, from, until) {
  const slots = new Map();
  for (const uniform of uniforms) {
    if (uniform.name !== 'activity' || !Number.isFinite(uniform.value)
      || !Number.isFinite(uniform.at) || uniform.at >= until) continue;
    const slot = slots.get(uniform.program) ?? { prior: null, changes: [] };
    if (uniform.at < from) slot.prior = uniform;
    else slot.changes.push(uniform);
    slots.set(uniform.program, slot);
  }
  const programs = [...slots].map(([program, slot]) => {
    const candidates = [...slot.changes, ...(slot.prior ? [slot.prior] : [])];
    const match = candidates.find((uniform) => Math.abs(uniform.value - activity) <= 0.005);
    return { program, match: match ? { ...match,
      evidence: match.at < from ? 'retained-uniform' : 'uniform-upload',
      evaluatedAt: Math.max(from, match.at) } : null,
      minimumDifference: candidates.length ? Math.min(...candidates.map((uniform) => Math.abs(uniform.value - activity))) : null };
  });
  return { matched: programs.length > 0 && programs.every((program) => program.match), programs };
}

export function frameClockSegments(samples) {
  const segments = [];
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    if (before.phase !== after.phase || !before.simulationDate || !after.simulationDate) continue;
    const wallSeconds = (after.at - before.at) / 1000;
    const actualDays = (Date.parse(after.simulationDate) - Date.parse(before.simulationDate)) / 86_400_000;
    const expectedDays = before.phase === 'running-default' ? Number(before.rate) * wallSeconds : 0;
    if (wallSeconds > 0) segments.push({ phase: before.phase, wallSeconds, actualDays, expectedDays,
      ratio: expectedDays ? actualDays / expectedDays : null, visible: before.visibility === 'visible' && after.visibility === 'visible' });
  }
  const moving = segments.filter((segment) => segment.expectedDays !== 0);
  const actualDays = moving.reduce((sum, segment) => sum + segment.actualDays, 0);
  const expectedDays = moving.reduce((sum, segment) => sum + segment.expectedDays, 0);
  return { segments, actualDays, expectedDays, ratio: expectedDays ? actualDays / expectedDays : null };
}
