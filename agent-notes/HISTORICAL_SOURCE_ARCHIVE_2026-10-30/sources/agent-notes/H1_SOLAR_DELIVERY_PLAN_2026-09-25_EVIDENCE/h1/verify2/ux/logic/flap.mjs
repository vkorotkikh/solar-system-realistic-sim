import { describeSolarDataStatus, SolarDataAnnouncer } from './solarDataStatus.mjs';
const base = { lastSuccessMs: 0, lastFailure: null, timeoutMs: 2600, backendBaseUrl: 'http://127.0.0.1:8042', pageOrigin: 'http://127.0.0.1:4191', payload: null, displayedImageChannel: null, failedImageChannel: null };
const P = { data_assimilation: { mode: 'hybrid', applied: true, blend_weight: 0.4123 } };
const el = { textContent: '' }; const a = new SolarDataAnnouncer(el);
// intermittent 503/429 while connected: success, fail, success, fail ... (retry after 6 s on failure, 0.9 s after success)
let t = 0, last = 0; const log = [];
for (let i = 0; i < 12; i++) {
  const ok = i % 2 === 0;
  if (ok) last = Date.UTC(2026, 8, 25, 14, 3, 0) + t;
  const st = describeSolarDataStatus({ ...base, lastSuccessMs: last, payload: P, lastFailure: ok ? null : { kind: i % 4 === 1 ? 'busy' : 'rate-limited', message: '', httpStatus: 503, atMs: t } });
  if (a.observe(st)) log.push(`${(t / 1000).toFixed(1)}s ${el.textContent}`);
  t += ok ? 900 + 2600 : 6000;
}
console.log('announcements in', (t / 1000).toFixed(1), 's:', log.length); for (const l of log) console.log('  ', l);
// error-family alternation (timeout, blocked, timeout, blocked...) from never-connected
const el2 = { textContent: '' }; const b = new SolarDataAnnouncer(el2); const log2 = [];
for (const k of ['timeout', 'blocked', 'timeout', 'blocked', 'blocked', 'unreachable', 'network', 'unreachable']) { const st = describeSolarDataStatus({ ...base, lastFailure: { kind: k, message: '', httpStatus: null, atMs: 0 } }); if (b.observe(st)) log2.push(`${k}: ${el2.textContent}`); }
console.log('error alternation announcements:', log2.length); for (const l of log2) console.log('  ', l);
// longest texts
const kinds = ['timeout','busy','server-timeout','rate-limited','http','server-error','blocked','unreachable','invalid-response','network'];
for (const k of kinds) { const e = describeSolarDataStatus({ ...base, lastFailure: { kind: k, message: '', httpStatus: k === 'http' ? 500 : k === 'rate-limited' ? 429 : 503, atMs: 0 } }); const s = describeSolarDataStatus({ ...base, lastSuccessMs: Date.UTC(2026,8,25,14,3), payload: P, lastFailure: { kind: k, message: '', httpStatus: k === 'http' ? 500 : 503, atMs: 0 } }); console.log(k.padEnd(17), e.text.length, '|', e.text, '||', e.announcement, '|| stale len', s.text.length); }
