# SCN-005 production-budget browser delivery, 2026-10-14

The final five-minute DEV and five-minute production PREVIEW delivery gates
passed on the assigned delivery worktree. This is bounded delivery evidence,
not closure of the canonical register or the broader GPU/science release gates.

Application base: `fc3b6a0f34e1da2ff720ba7ea55d28cfd27e0c93`, consisting of the
assigned `842c3c5` base plus a local cherry-pick of the parent's AIA epoch fix
`938bca0dd2d71d8bc9ffdb49e8bd9d17d380f975`. The parent already has that fix.
Harness commit: `4ce724b4ddbc2fa6623bf95f345779827afb4255`.
No `main.ts`, `sunController.ts`, scientific threshold, request budget, or
canonical master tracker was edited by this delivery task.

## Actual browser results

| Run | UTC observation window | Physics | Warm physics | Realtime | Activity state | Cold / warm median / warm p95, seconds | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Initial DEV | 22:44:11.412-22:49:11.412 | 11/11 | 10/10 | 3/3 | Old matcher 7/11 | 10.468 / 9.855 / 11.658 | FAIL: harness uniform accounting |
| PREVIEW | 22:50:54.451-22:55:54.451 | 11/11 | 10/10 | 3/3 | 11/11, all three activity programs | 12.193 / 9.841 / 11.692 | PASS, exit 0 |
| Final DEV | 22:56:22.468-23:01:22.468 | 11/11 | 10/10 | 3/3 | 11/11, all three activity programs | 8.863 / 9.206 / 12.696 | PASS, exit 0 |

Each run observed exactly 300,000 ms. Its denominator includes one startup
physics request plus ten requests initiated inside the timed window. Warm
excludes only that first request. Realtime has one startup and two subsequent
requests. Failed, pending, incomplete, and schema-invalid requests cannot count
as delivered. A bounded outcome drain admits no requests initiated after the
cutoff and does not extend application deadlines. No admitted requests remained
pending. The final runs have a delivered fraction of 1.0 against the existing
0.95 gate. These are ten warm samples per run, not twenty cycles, and their
nearest-rank p95/p99 are the sample maximum, not population tail estimates.

Each run used a fresh backend process and fresh browser context. "Cold" means
the first physics request in those processes; OS, Vite, disk, and network caches
were not purged. The scenario pauses at Now for 60 seconds, runs at the default
4 days/second for 120 seconds, then returns to Now and pauses for 120 seconds.
Each final run observed six distinct requested-epoch transitions.

The actual app requested `fidelity=high&max_features=180&forcing=hybrid&live_data=true`.
Physics cadence remained 30 seconds, with the production 18-second backend and
20-second browser deadlines. Realtime cadence remained 120 seconds, with the
12-second backend and 15-second browser deadlines. Backend timeout overrides
were unset; only the exact CORS origins were configured for this local run.

## Schema, fallback, and material evidence

All final physics bodies validated `solar_physics_state` v2, TDB request/response
epoch agreement, finite bounded activity, and explicit requested/effective
forcing. They disclosed `effective_forcing=synthetic`, `live_data_enabled=false`,
and `fallback_reason=disabled_unvalidated`. The visible chip published backend
activity with procedural features and the observations-disabled explanation.
No backend-geometry enablement or independently validated geometry is claimed.

Realtime endpoint/context schemas validated. The actual provider snapshots
reported SWPC, SILSO, and AIA metadata acquisition success; GONG remained
unattempted and `disabled_unvalidated`. SILSO was current for its monthly
publication coverage and explicitly not realtime eligible. AIA retained its
unvalidated spatial-projection declaration. There were **zero observation-image
requests**: successful metadata delivery is not observed image rendering.

The initial DEV command failed because its matcher demanded a fresh GL upload
for every response. The four unmatched replies repeated an already uploaded
value. Three.js caches unchanged uniforms. The fix reconstructs the last
uploaded state per program and also considers subsequent uploads before the
next response. It preserves the original 0.005 tolerance and requires every
captured `activity` program to match. Negative tests reject overwritten values,
different activity-named uniforms, mismatching programs, late matches, and
missing evidence. The original failed report and a separate reanalysis remain
unaltered in the evidence archive. Both final gates were rerun live; the failed
command was not relabeled as a successful run.

Instrumentation passively records requests, responses, animation-frame timing,
GL uniform calls, visibility, and the production DOM. It does not route mock
responses, replace the clock, change scene settings, or enable scientific flags.

## Host and contention

Host Athena: WSL2 `6.18.33.2-microsoft-standard-WSL2`, AMD Ryzen 9 9950X3D,
32 logical CPUs, 100,975,398,912 bytes RAM, NVIDIA driver 610.88. Actual renderer:
`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)`.
Node 22.23.2, npm 10.9.8, Chromium 153, Python 3.12.13; browser viewport 1280x900.

This was a shared CPU host. A parent full-backend job was observed during the
initial run; the parent subsequently reported it finished. Other agents could
run moon fitting or focused tests. One-minute load averages at start/end were
3.23/8.69 (initial DEV), 19.23/5.54 (PREVIEW), and 4.79/8.35 (final DEV), on the
32-logical-CPU host. These timings must not be interpreted as an isolated
performance comparison. The parent avoided headed browsers throughout. No
latency gate failed, so no CPU quiet-window retry or budget change was needed.
Explicit headed-browser clearance was sent after final Chromium exit. Owned
backend and Vite processes were then stopped by exact PID and verified cwd;
other agents' processes were not stopped.

## Tests and remaining limitations

| Check | Result |
| --- | --- |
| Normal `npm test` with pinned Node/npm | 570 passed, 2 skipped, 0 failed; 55 passed files, 1 skipped file |
| Delivery metrics assertions inside that suite | 8 passed, 0 skipped |
| AIA epoch and realtime cache pytest files | 99 passed, 0 skipped |
| `npm run typecheck:ratchet` | PASS, zero diagnostics |
| Production build with the measured backend origin | PASS; existing main-chunk-size warning retained |
| Captured-body integrity and physics-schema replay | 42/42 stored bodies matched byte length and SHA-256; physics schemas revalidated |
| Evidence gzip integrity | PASS |

The two skipped tests are the existing opt-in EGL planetary shader cases in
`scripts/planetShaderGeometry.test.mjs`; they are not counted as passes. The
parent's later full-scene GPU gate after the lifecycle handoff is separate.
The initial broad `node --test scripts/*.test.mjs` invocation was incompatible
with the repository's Vitest suites (six collection failures). The prior-agent
metrics file also initially caused one Vitest collection failure because it
imported `node:test`. Switching that file to Vitest made all eight cases part of
the normal passing suite; both initial logs are retained.

**Remaining real performance warning:** catalog startup exceeded its unchanged
2,000 ms budget in every run: 6,900.5 ms initial DEV, 8,106.5 ms PREVIEW,
6,086.2 ms final DEV. This is handed to the `main.ts`/lifecycle owner, not hidden
by the solar delivery pass. Frame capture includes startup/drain; maximum
intervals were 8,737.3 ms PREVIEW and 6,602.5 ms final DEV despite a 16.7 ms
median. This is not a whole-app startup or frame-rate acceptance pass. The
displayed-date frame-clock ratios (~1.0012) use whole-day DOM dates and are
diagnostic, not a scientific clock-accuracy certification.

WebKit was not rerun; the previously reported missing GLES runtime remains
unresolved by this task. No NVDA, VoiceOver, physical-touch, multi-tab,
fault-injection, 20-cycle, or broad scientific validation pass is claimed.

## Reproduction and evidence

Run from `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-delivery`.
Use the pinned toolchain directory in `PATH`, quoted because the inherited WSL
path contains spaces, and the explicit npm CLI under that directory.

```sh
export PATH="/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH"
export GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA
export LD_LIBRARY_PATH=/usr/lib/wsl/lib

env -u SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS -u SOLAR_REALTIME_REQUEST_TIMEOUT_SECONDS \
  SOLAR_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5176,http://127.0.0.1:4176 \
  uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m uvicorn server:app --app-dir backend --host 127.0.0.1 --port 9196 \
  --no-proxy-headers --ws-max-size 16384

# Separate terminals, same worktree; restart only the owned backend between modes.
VITE_BACKEND_ORIGIN=http://127.0.0.1:9196 node node_modules/vite/bin/vite.js \
  --host 127.0.0.1 --port 5176 --strictPort
VITE_BACKEND_ORIGIN=http://127.0.0.1:9196 node \
  /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4176 --strictPort

node scripts/verify-solar-delivery-browser.mjs --mode dev \
  --url http://127.0.0.1:5176 --backend http://127.0.0.1:9196 --out artifacts/solar-delivery/dev-confirmed
node scripts/verify-solar-delivery-browser.mjs --mode preview \
  --url http://127.0.0.1:4176 --backend http://127.0.0.1:9196 --out artifacts/solar-delivery/preview

node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js test
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run typecheck:ratchet
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -q backend/tests/test_solar_aia_epoch_coverage.py \
  backend/tests/test_solar_realtime_data_cache.py --tb=short
```

`solar-delivery-2026-10-14/summary.json` contains compact request-level results,
host loads, provider/fallback status, report hashes, and harness source hashes.
`solar-delivery-2026-10-14/evidence.tar.gz` retains all three reports, raw
responses, GL/frame traces, screenshots, initial reanalysis, and test logs.
Archive SHA-256:
`92c5d17f4f369b4ff082bc255a5b20bf648afa76f6ae97d18c0349c59e9f164a`.

The archive contains the original `dev/` failure, successful `preview/` and
`dev-confirmed/` runs, and verification logs. Extract into a separate directory
when reviewing so that the original measurement directories remain untouched.
