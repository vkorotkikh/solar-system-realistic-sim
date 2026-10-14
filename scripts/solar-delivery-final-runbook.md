# Final SCN005 delivery acceptance runbook

Status: prepared, not executed. Wait for Peirce startup, Planck cache, and final
PFSS integration plus the parent's explicit measurement-window clearance.
Do not treat syntax checks or metrics unit tests as production delivery evidence.

## Relay to Peirce

Recipient: `01a13c93-eda4-7b00-b18d-e7d7d4889b9f`.
This acceptance session has no direct agent-messaging tool; the parent must relay
this handoff. Diagnosis commit: `11b3654d179b7fcb8b35da5d925645be94fe8e61`.

The profiled revision was `b8610f4f7d544635a2b30d73491a7deaf635a386`, not the final
integrated parent. The loader files were identical to reviewed parent
`47c1d916945f87227573857ab9df6432b46d8652`. No production changes were made here.

### Clock boundaries and unchanged semantics

These labels describe observation boundaries; they are not claims that the
application already publishes Performance API marks with these names.

| Boundary | Exact event | Interpretation |
| --- | --- | --- |
| Catalog invocation | Existing `initPhaseOneAsteroids()` startup invocation, before the first synchronous scene render | Do not defer this until shader warmup completes or prefetch the work before starting its timer. |
| Catalog load start | Existing loader clock starts before launching binary fetch and metadata fetch/JSON work | Network, queued promise continuations, CPU contention, and intervening main-thread stalls remain in scope. |
| Catalog load end | Existing loader elapsed time is sampled after binary body read, catalog parse, and awaited SHA-256 computation | Preserve this exact `loadMs` definition and the existing 2,000 ms comparison; no subtraction of render stalls. |
| Catalog accepted | Integrity/schema/checksum acceptance has completed successfully and the loader result is available | A separate observation; reaching loader end alone is not proof of acceptance. |
| Catalog installed | Main has installed the accepted catalog population/renderer | Not interchangeable with fetch completion or shader readiness. |
| Catalog first rendered frame | The renderer call containing the accepted catalog has returned, with draw evidence tied to that catalog generation | A separate delivery boundary; JavaScript render return alone is not proof of physical screen presentation. |
| Shader warmup start/end | Actual asynchronous compile invocation and readiness completion for the relevant generation | Diagnostic spans only, not substitutes for any catalog completion boundary. |

Keep navigation-relative timestamps as well as loader-relative timestamps so
moving initialization later cannot hide total startup delay. Do not emit an
acceptance, installation, or first-frame success mark from a `finally` block,
fallback path, obsolete generation, aborted operation, or failed compile.
Keep existing cancellation/disposal/context-loss handling and shader error checks.
An honest loader-budget pass does not, by itself, establish a 2-second first-frame
or full-application startup pass.

### Profile findings

- Three real isolated 100,000-row loads: 123.1, 108.3, 83.3 ms. All used the actual
  3,600,012-byte binary, SHA-256
  `f4debc48eea13a3be43eb69d7d70e8920ece7aa5e7e6dd0490c870bc83cb222a`.
- Two full-app diagnostic profiles: 3,839.9 and 3,516.4 ms, both over 2,000 ms.
- In the second profile, headers arrived at 593.3 ms but the fetch continuation
  ran at 2,802.6 ms. Metadata transfer finished at 595.8 ms; JSON processing
  finished at 4,029.9 ms. Binary body read took 20.1 ms, parsing 54.7 ms, and
  SHA-256 2.9 ms. These are browser-monotonic timestamps, not wall-clock epochs.
- Blocking stack: `getProgramInfoLog` / `getShaderInfoLog` -> Three.js `onFirstUse`
  -> `WebGLProgram.getUniforms` -> `setProgram` -> `WebGLRenderer.render` -> initial
  `startSimulation` render or the next `animate` render.
- Across startup and the following frame: 13 program-log calls totaled 504.2 ms;
  26 shader-log calls totaled 3,135.6 ms. The largest shader-log call, 1,508.9 ms,
  was after catalog loading in the following frame. Do not assign the entire
  combined 3,639.8 ms to the 3,516.4 ms loader span.
- The separate CPU profile attributed about 2,322 ms initial-render self-time
  and 1,626 ms following-frame self-time to `onFirstUse`.
- Original source render calls were `src/main.ts:1203` and `src/main.ts:1248`;
  reviewed parent locations were 1219 and 1252. These are revision-specific,
  not promises about line numbers after Peirce's changes.
- Profiles were headless software SwiftShader, with instrumentation overhead.
  They establish the blocking path, not an RTX 5090 performance result. Recorded
  second-profile load averages were approximately 1.36 -> 1.33; no exclusive CPU
  window was claimed.

Candidate: coordinate actual asynchronous compilation and catalog readiness with
first render, without moving the existing catalog clock start later. Account for
catalog-renderer replacement so a second compilation stall is not merely shifted
into the following frame. Keep shader validation enabled and report unsupported
parallel-compilation behavior honestly. Peirce owns implementation; this runbook
does not certify the candidate as fixed.

## Pin the final source before any measurement

Every command below runs from the assigned delivery worktree. The parent must
first coordinate its refresh to the approved integrated production source; this
runbook deliberately does not merge, fetch, reset, or modify production files.
Set `SOLAR_DELIVERY_FINAL_REV` to the parent's approved full 40-character commit.
Do not run these commands against the older diagnostic source and label them as
final integration. Preserve the same `RUN_ROOT` across the serving/capture sessions.

```bash
cd /home/nomad/ai/projects/worktrees/solar-remediation-20261014-delivery
export PATH="/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH"
: "${SOLAR_DELIVERY_FINAL_REV:?Set the parent-approved final integrated commit}"
test "$(git rev-parse "$SOLAR_DELIVERY_FINAL_REV^{commit}")" = "$SOLAR_DELIVERY_FINAL_REV" || exit 1
test "$(git rev-parse remediation/canonical-register-20261014)" = "$SOLAR_DELIVERY_FINAL_REV" || exit 1
git diff --quiet "$SOLAR_DELIVERY_FINAL_REV" -- . ':!scripts/**' ':!agent-notes/**' || exit 1
export RUN_ROOT="$PWD/artifacts/solar-delivery-final-${SOLAR_DELIVERY_FINAL_REV}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RUN_ROOT"
printf '%s\n' "$SOLAR_DELIVERY_FINAL_REV" > "$RUN_ROOT/approved-parent-revision.txt"
git rev-parse HEAD > "$RUN_ROOT/runner-revision.txt"
git status --short > "$RUN_ROOT/worktree-status.txt"
git ls-files --others --exclude-standard > "$RUN_ROOT/untracked-files.txt"
node --version > "$RUN_ROOT/node-version.txt"
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js --version > "$RUN_ROOT/npm-version.txt"
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run build > "$RUN_ROOT/build.log" 2>&1 || exit 1
```

Review any untracked application inputs before capture. The source-equality guard
intentionally excludes instrumentation scripts and agent notes, not application
source or build configuration. Record both revisions: the harness `baseCommit`
is the delivery checkout's HEAD; `approved-parent-revision.txt` identifies the
parent source whose application tree was compared. Never silently relabel one
as the other. Freeze the serving worktree throughout both captures.

## Owned servers

Use foreground tool sessions for these servers so their exact process/session
ownership is retained. Check that ports 9196, 5176, and 4176 are free or belong to
this delivery session. An occupied port is not permission to terminate another
agent's process. Do not use global `pkill`.

Start a fresh backend for DEV, then terminate only that owned session and start a
new backend for PREVIEW. Do not issue warming physics/realtime API probes. Cold
means first physics attempt with a fresh backend process and browser context,
not purged filesystem/provider caches. Preserve inherited BLAS settings in the
host evidence rather than silently changing them between modes.

```bash
cd /home/nomad/ai/projects/worktrees/solar-remediation-20261014-delivery
env -u SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS -u SOLAR_REALTIME_REQUEST_TIMEOUT_SECONDS \
  SOLAR_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5176,http://127.0.0.1:4176 \
  uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m uvicorn server:app --app-dir backend --host 127.0.0.1 --port 9196 \
  --no-proxy-headers --ws-max-size 16384
```

DEV server, in its own owned session:

```bash
cd /home/nomad/ai/projects/worktrees/solar-remediation-20261014-delivery
export PATH="/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH"
VITE_BACKEND_ORIGIN=http://127.0.0.1:9196 \
  node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort
```

PREVIEW server, using the final-source build above, in its own owned session:

```bash
cd /home/nomad/ai/projects/worktrees/solar-remediation-20261014-delivery
export PATH="/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH"
VITE_BACKEND_ORIGIN=http://127.0.0.1:9196 \
  node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4176 --strictPort
```

Retain each owned server's complete stdout/stderr with its mode. Confirm from
actual browser requests that the backend origin is 9196; environment labels alone
are not proof. Do not accept a fallback-only run or an unrelated old server.

## Five-minute DEV and PREVIEW captures

Wait for explicit parent clearance before either command: the harness is headed.
Do not run DEV and PREVIEW concurrently. Set `SOLAR_DELIVERY_HEADFUL_WINDOW=granted`
only after clearance; this runbook does not grant it. Record the parent's
concurrency statement alongside measured load; a quiet CPU is not assumed.

The shell helpers below record UTC times, host load and memory, CPU model, BLAS
thread environment, and a bounded process CPU snapshot before/after each run.
Process command lines are deliberately excluded from this additional snapshot.
The harness also records host and actual graphics evidence itself.

```bash
cd /home/nomad/ai/projects/worktrees/solar-remediation-20261014-delivery
export PATH="/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH"
: "${RUN_ROOT:?Use the pinned preparation output directory}"
: "${SOLAR_DELIVERY_FINAL_REV:?Use the approved parent revision}"
test "${SOLAR_DELIVERY_HEADFUL_WINDOW:-}" = granted || exit 1

record_host() {
  local label="$1"
  node --input-type=module -e '
    import os from "node:os";
    const keys = ["OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"];
    console.log(JSON.stringify({utc:new Date().toISOString(),host:os.hostname(),platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,loadAverage:os.loadavg(),totalMemory:os.totalmem(),freeMemory:os.freemem(),threadEnvironment:Object.fromEntries(keys.map(k=>[k,process.env[k]??null]))},null,2));
  ' > "$RUN_ROOT/$label-host.json"
  ps -eo pid,ppid,pcpu,pmem,comm --sort=-pcpu | sed -n '1,16p' > "$RUN_ROOT/$label-processes.txt"
}

capture_delivery() {
  local mode="$1" url="$2" status
  test "${SOLAR_DELIVERY_HEADFUL_WINDOW:-}" = granted || return 1
  test "$(git rev-parse remediation/canonical-register-20261014)" = "$SOLAR_DELIVERY_FINAL_REV" || return 1
  git diff --quiet "$SOLAR_DELIVERY_FINAL_REV" -- . ':!scripts/**' ':!agent-notes/**' || return 1
  test ! -e "$RUN_ROOT/$mode" || return 1
  record_host "$mode-before"
  if GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
    LD_LIBRARY_PATH="/usr/lib/wsl/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    node scripts/verify-solar-delivery-browser.mjs \
      --mode "$mode" --url "$url" --backend http://127.0.0.1:9196 \
      --chromium /home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
      --out "$RUN_ROOT/$mode" > "$RUN_ROOT/$mode-harness.log" 2>&1; then
    status=0
  else
    status=$?
  fi
  record_host "$mode-after"
  printf '%s\n' "$status" > "$RUN_ROOT/$mode-exit-status.txt"
  return "$status"
}

# Run with the fresh DEV backend and the DEV server ready.
capture_delivery dev http://127.0.0.1:5176

# Stop only the owned DEV backend, then start a fresh backend for PREVIEW.
# With that fresh backend and the PREVIEW server ready, run separately:
# capture_delivery preview http://127.0.0.1:4176
```

The PREVIEW invocation is intentionally commented out to prevent accidentally
running it against DEV's warm backend. Execute it as a separate coordinated step
after that restart. Do not add a duration-shortening flag or budget override.

## Acceptance report, not a green-label shortcut

- Keep the existing five-minute window (300,000 ms), production physics backend
  deadline (18 s), browser deadline (20 s), and polling (30 s physics, 120 s
  realtime). The existing maximum 25-second drain does not extend request
  deadlines or admit requests initiated after the window cutoff.
- Report every initiated physics/realtime request, including startup, failures,
  pending requests, and timeouts. Cold is the first physics attempt; warm excludes
  only that attempt. Report timed-window and startup denominators separately.
  Earlier 11/11 and 3/3 counts are observations, not forced counts for this run.
- Preserve actual latency distributions, schema/epoch/fallback checks, source-chip
  state, material/uniform delivery evidence, and SHA-256/body evidence. Retain
  failures and incomplete outcomes; do not convert skipped or absent checks to
  passes. Do not replace real API responses with fixtures.
- Check the actual GL renderer. Software fallback cannot establish the requested
  hardware result. Preserve contention evidence if latency fails; request a quiet
  repeat before proposing any production budget change.
- Evaluate catalog `loadMs` against the unchanged 2,000 ms threshold separately
  from solar delivery. Also report catalog acceptance, installation, first-frame,
  and shader spans when Peirce exposes them. A solar delivery pass cannot erase a
  catalog startup failure, and a missing startup observation is not a pass.
- Record exact served/runner revisions and build identity. Recheck source freeze
  after captures; any intervening application changes invalidate a single-revision
  claim and require explicit disclosure or a new coordinated run.
- No WebKit, NVDA, VoiceOver, physical-touch, full-scene GPU, or AIA image-rendering
  pass follows automatically from this solar-delivery harness.
- Close the harness browsers and stop only owned servers; send explicit headful
  quiet-window clearance when finished, including whether any gate failed.
