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
Set `SOLAR_DELIVERY_FINAL_REV` to the parent's approved full 40-character commit
and `SOLAR_DELIVERY_FINAL_REF` to the approved existing full ref name (for example,
`refs/heads/main` or `refs/remotes/origin/main`). The ref must still resolve to
that exact commit at preparation and capture; a moved or deleted ref requires a
new approved preparation. No particular historical branch is required.
Do not run these commands against the older diagnostic source and label them as
final integration. Preserve the same `RUN_ROOT` across the serving/capture sessions.

Set `SOLAR_DELIVERY_WORKTREE` to the assigned delivery checkout and provide
absolute paths in `SOLAR_DELIVERY_NODE`, `SOLAR_DELIVERY_NPM_CLI`, and
`SOLAR_DELIVERY_CHROMIUM` for the installed Node executable, npm CLI JavaScript
entry point, and Chromium executable. Use the versions declared in `package.json`;
do not install or replace dependencies during a measurement window. The Chromium
path may come from the local Playwright installation's `chromium.executablePath()`.
An executable browser alone does not prove that hardware rendering is available.

Run this shared setup in every preparation, server, and capture shell, using the
same exported inputs. The functions validate source identity without refreshing
refs or modifying the checkout.

```bash
: "${SOLAR_DELIVERY_WORKTREE:?Set the assigned delivery checkout}"
cd "$SOLAR_DELIVERY_WORKTREE" || exit 1
test "$(git rev-parse --show-toplevel)" = "$PWD" || exit 1
: "${SOLAR_DELIVERY_FINAL_REV:?Set the parent-approved final integrated commit}"
: "${SOLAR_DELIVERY_FINAL_REF:?Set the parent-approved full source ref}"
: "${SOLAR_DELIVERY_NODE:?Set the absolute installed Node executable path}"
: "${SOLAR_DELIVERY_NPM_CLI:?Set the absolute installed npm CLI entry-point path}"
: "${SOLAR_DELIVERY_CHROMIUM:?Set the absolute installed Chromium executable path}"
[[ "$SOLAR_DELIVERY_NODE" = /* && -x "$SOLAR_DELIVERY_NODE" ]] || exit 1
[[ "$SOLAR_DELIVERY_NPM_CLI" = /* && -f "$SOLAR_DELIVERY_NPM_CLI" && -r "$SOLAR_DELIVERY_NPM_CLI" ]] || exit 1
[[ "$SOLAR_DELIVERY_CHROMIUM" = /* && -x "$SOLAR_DELIVERY_CHROMIUM" ]] || exit 1
export PATH="$(dirname "$SOLAR_DELIVERY_NODE"):$PATH"
test "$("$SOLAR_DELIVERY_NODE" --version)" = "v$("$SOLAR_DELIVERY_NODE" -p 'require("./package.json").engines.node')" || exit 1
test "$("$SOLAR_DELIVERY_NODE" "$SOLAR_DELIVERY_NPM_CLI" --version)" = "$("$SOLAR_DELIVERY_NODE" -p 'require("./package.json").engines.npm')" || exit 1

assert_delivery_source() {
  [[ "$SOLAR_DELIVERY_FINAL_REV" =~ ^[0-9a-f]{40}$ ]] || return 1
  git check-ref-format "$SOLAR_DELIVERY_FINAL_REF" || return 1
  test "$(git rev-parse --verify --end-of-options "${SOLAR_DELIVERY_FINAL_REV}^{commit}")" = "$SOLAR_DELIVERY_FINAL_REV" || return 1
  test "$(git rev-parse --verify --end-of-options "${SOLAR_DELIVERY_FINAL_REF}^{commit}")" = "$SOLAR_DELIVERY_FINAL_REV" || return 1
  git diff --quiet "$SOLAR_DELIVERY_FINAL_REV" -- . ':!scripts/**' ':!agent-notes/**'
}

assert_delivery_preparation() {
  local runner_revision
  test -n "${RUN_ROOT:-}" && test -d "$RUN_ROOT" || return 1
  test "$(cat "$RUN_ROOT/approved-parent-revision.txt")" = "$SOLAR_DELIVERY_FINAL_REV" || return 1
  test "$(cat "$RUN_ROOT/approved-source-ref.txt")" = "$SOLAR_DELIVERY_FINAL_REF" || return 1
  runner_revision=$(git rev-parse --verify HEAD) || return 1
  test "$(cat "$RUN_ROOT/runner-revision.txt")" = "$runner_revision" || return 1
  test "$(cat "$RUN_ROOT/built-source-revision.txt")" = "$SOLAR_DELIVERY_FINAL_REV" || return 1
  assert_delivery_source
}

assert_delivery_source || exit 1
```

Prepare once, after the shared setup. Keep these pin files unchanged throughout
the run; a later approval or checkout revision needs a new `RUN_ROOT` and build.

```bash
assert_delivery_source || exit 1
export RUN_ROOT="$PWD/artifacts/solar-delivery-final-${SOLAR_DELIVERY_FINAL_REV}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$PWD/artifacts" || exit 1
mkdir "$RUN_ROOT" || exit 1
printf '%s\n' "$SOLAR_DELIVERY_FINAL_REV" > "$RUN_ROOT/approved-parent-revision.txt"
printf '%s\n' "$SOLAR_DELIVERY_FINAL_REF" > "$RUN_ROOT/approved-source-ref.txt"
git rev-parse HEAD > "$RUN_ROOT/runner-revision.txt"
git status --short > "$RUN_ROOT/worktree-status.txt"
git ls-files --others --exclude-standard > "$RUN_ROOT/untracked-files.txt"
printf '%s\n' "$SOLAR_DELIVERY_NODE" "$SOLAR_DELIVERY_NPM_CLI" "$SOLAR_DELIVERY_CHROMIUM" > "$RUN_ROOT/toolchain-paths.txt"
"$SOLAR_DELIVERY_NODE" --version > "$RUN_ROOT/node-version.txt"
"$SOLAR_DELIVERY_NODE" "$SOLAR_DELIVERY_NPM_CLI" --version > "$RUN_ROOT/npm-version.txt"
"$SOLAR_DELIVERY_CHROMIUM" --version > "$RUN_ROOT/chromium-version.txt"
VITE_BACKEND_ORIGIN=http://127.0.0.1:9196 \
  "$SOLAR_DELIVERY_NODE" "$SOLAR_DELIVERY_NPM_CLI" run build > "$RUN_ROOT/build.log" 2>&1 || exit 1
assert_delivery_source || exit 1
test "$(cat "$RUN_ROOT/runner-revision.txt")" = "$(git rev-parse --verify HEAD)" || exit 1
printf '%s\n' "$SOLAR_DELIVERY_FINAL_REV" > "$RUN_ROOT/built-source-revision.txt" || exit 1
assert_delivery_preparation || exit 1
```

Review any untracked application inputs before capture. The source-equality guard
intentionally excludes instrumentation scripts and agent notes, not application
source or build configuration. Record both revisions: the harness `baseCommit`
is the delivery checkout's HEAD; `approved-parent-revision.txt` identifies the
parent source whose application tree was compared. `approved-source-ref.txt`
records the selected ref, and capture rejects changed revision inputs, a changed
runner HEAD, a moved/deleted ref, changed application source, or a preparation
without a successful build marker. Never silently relabel one revision as the
other. Freeze the serving worktree throughout both
captures. Vite embeds `VITE_BACKEND_ORIGIN` at build time; setting it only on the
preview server cannot change the built bundle's backend origin.

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
assert_delivery_preparation || exit 1
env -u SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS -u SOLAR_REALTIME_REQUEST_TIMEOUT_SECONDS \
  SOLAR_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5176,http://127.0.0.1:4176 \
  uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m uvicorn server:app --app-dir backend --host 127.0.0.1 --port 9196 \
  --no-proxy-headers --ws-max-size 16384
```

DEV server, in its own owned session:

```bash
assert_delivery_preparation || exit 1
VITE_BACKEND_ORIGIN=http://127.0.0.1:9196 \
  "$SOLAR_DELIVERY_NODE" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort
```

PREVIEW server, using the final-source build above, in its own owned session:

```bash
assert_delivery_preparation || exit 1
"$SOLAR_DELIVERY_NODE" node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4176 --strictPort
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
: "${RUN_ROOT:?Use the pinned preparation output directory}"
: "${SOLAR_DELIVERY_FINAL_REV:?Use the approved parent revision}"
test "${SOLAR_DELIVERY_HEADFUL_WINDOW:-}" = granted || exit 1
assert_delivery_preparation || exit 1

record_host() {
  local label="$1"
  "$SOLAR_DELIVERY_NODE" --input-type=module -e '
    import os from "node:os";
    const keys = ["OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"];
    console.log(JSON.stringify({utc:new Date().toISOString(),host:os.hostname(),platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,loadAverage:os.loadavg(),totalMemory:os.totalmem(),freeMemory:os.freemem(),threadEnvironment:Object.fromEntries(keys.map(k=>[k,process.env[k]??null]))},null,2));
  ' > "$RUN_ROOT/$label-host.json"
  ps -eo pid,ppid,pcpu,pmem,comm --sort=-pcpu | sed -n '1,16p' > "$RUN_ROOT/$label-processes.txt"
}

capture_delivery() {
  local mode="$1" url="$2" status
  test "${SOLAR_DELIVERY_HEADFUL_WINDOW:-}" = granted || return 1
  assert_delivery_preparation || return 1
  test ! -e "$RUN_ROOT/$mode" || return 1
  record_host "$mode-before"
  if GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
    LD_LIBRARY_PATH="/usr/lib/wsl/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    "$SOLAR_DELIVERY_NODE" scripts/verify-solar-delivery-browser.mjs \
      --mode "$mode" --url "$url" --backend http://127.0.0.1:9196 \
      --chromium "$SOLAR_DELIVERY_CHROMIUM" \
      --out "$RUN_ROOT/$mode" > "$RUN_ROOT/$mode-harness.log" 2>&1; then
    status=0
  else
    status=$?
  fi
  printf '%s\n' "$status" > "$RUN_ROOT/$mode-harness-exit-status.txt"
  record_host "$mode-after"
  if ! assert_delivery_preparation; then
    printf '%s\n' 'Source identity changed during capture; this run is invalid.' >&2
    status=1
  fi
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
