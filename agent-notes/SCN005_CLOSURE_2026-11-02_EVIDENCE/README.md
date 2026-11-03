# SCN-005 bounded startup repair — 2026-11-02

Two scoped repairs are implemented and verified. **The measured planetary shader
startup bottleneck is reduced; a universal usable-scene/compositor startup bound
is not certified.** No acceptance budget was raised, and the canonical tracker is
owned by the integration coordinator.

- Base: `4f97dce442cffb46fa9add8fb3a674534dd2333e`.
- Backend fix: `e928de3`, adapted from `789a69c` after reproducing its original
  defect and its cancellation regression.
- Planetary shader fix: `6224572`.
- Worktree: `/home/nomad/ai/projects/worktrees/solar-scn005-closure-20261102`.
- Machine-readable measurements, source/build identities and limitations:
  [result.json](result.json).

## What changed

The process supervisor no longer discards a completed result just because child
interpreter teardown takes more than 250 ms. Short joins continue until the
**original absolute job deadline**, checking owner cancellation between joins.
Existing terminate/kill/reap, quarantine and capacity accounting remain intact.
The one-shot deadline join in `789a69c` was not copied: a deliberately lingering
child made shutdown take 4.9 seconds and remained alive after owner cancellation.
The adapted implementation passes both regressions.

Each procedural planet's identity is immutable after material creation. Its
shader now receives that identity as a compile-time define, letting the driver
exclude the other planets' noise branches before compiling repeated terrain and
normal evaluations. The original uniform path remains in the exported shader for
standalone diagnostics. All octave counts, terrain formulas, normal calculations,
geometry, material settings and visual features are unchanged. The optional EGL
gate now compiles the actual specialized production material.

`src/main.ts`, the Sun surface, solar wind, coronal ejections, all catalog assets,
AA, DPR and the 100,000-source / 50,000-display workload are unchanged.

## Diagnosis and measured improvement

The retained October 30 evidence showed native GL submission work but had not
identified an application-controlled cause. Fresh user-only native CPU sampling
found Mesa NIR optimizer work and NVIDIA driver/compiler work. Symbolization is
retained in [native-symbols.log](native-symbols.log). The 18-second native sampling
window includes post-fence work; its totals are not exclusive stall attribution.

A diagnostic `readPixels` after every first-frame object isolated **8,213.9 ms**
at the first planetary material, compared with **239.9 ms** for the Sun surface
and **140.2 ms** for the corona. This intentionally serializes rendering and is a
diagnostic, not an acceptance timing. The production patch addresses only the
identified planetary material.

Fresh-browser paired captures used actual application DEV and independently
compiled PREVIEW, real local assets and the live backend. No response mocks or
source-entry replacement was used. The baseline changes only `planetShaders.ts`
back to the exact base revision; all other application code, including the new
backend fix, is identical between arms.

| Mode | Original shader fence observations (ms) | Specialized shader fence observations (ms) | Median reduction |
|---|---|---|---|
| DEV | 7,983.7 / 8,295.0 / 8,005.8 | 5,196.5 / 5,897.9 / 5,427.7 | 32.2% |
| PREVIEW | 8,855.2 / 7,783.0 / 8,078.9 | 5,308.4 / 5,107.0 / 5,831.1 | 34.3% |

The unchanged catalog metric was 420.3–524.7 ms in the candidate captures, under
its original 2,000 ms budget. Every paired run retained 50,000 + 5,000 + 83
instances, 41 initial draw calls, 619,144 triangles, 4x MSAA, DPR 1 and a
928x900 drawing buffer on **RTX 5090 / ANGLE / WSL D3D12**. No page errors occurred.
The current catalog hash is recorded in `result.json`; it is the current base
asset, not a claim that October's older asset hash is still current.

A trusted native `+` event during pending GPU work reached its handler after
2.1 ms and changed the camera HUD 0.3 ms later. The event was handled at 2,390.1 ms;
the first fence was observed at 5,808.5 ms. This proves input/HUD responsiveness,
not presentation of the resulting camera frame.

These are browser-monotonic submission/fence observations, **not compositor
presentation timestamps**. Browser network caches were disabled and each capture
used a fresh browser; driver/OS caches were not reset. Other machine workloads
were not globally controlled. The backend was shared across serial captures;
these are not new cold-backend five-minute delivery gates. No arbitrary full-scene
performance budget or broader SCN-005 completion is inferred.

## Fidelity and rejected prototype

[planet-fidelity.html](planet-fidelity.html) renders production materials against
frozen base-revision shader strings in [planet-baseline-shaders.json](planet-baseline-shaders.json).
The 36 cases cover Earth/Moon/Mars, display/physical scales, equator/pole/tilted
views, relief/flat settings and 4x MSAA. The final
[fidelity-source.json](fidelity-source.json) has **35 byte-identical cases**;
the remaining Moon tilted-flat case differs in **one of 3,686,400 sampled channels
by 1/255**. The strict byte-equality comparator correctly exits 1, and that result
is retained. No bit-for-bit whole-scene identity is claimed.

A separate diagnostic uniform-loop-bound prototype retained the original octave
cap and reduced a pilot further, but produced greater numerical pixel differences
(maximum 13 in one channel). It was **rejected and is absent from production**.
The tests and documented acceptance thresholds were not changed to hide either
strict-comparison result.

## Verification

| Check | Result |
|---|---|
| Original slow-child-exit reproduction | Fails on base as expected |
| Expanded base reproductions | 3 failures / 1 pass: completed result, premature deadline, cancellation semantics |
| Original `789a69c` long-join negative control | Both shutdown and owner-cancellation checks fail |
| Process ownership, endpoint, quarantine, worker contract and parent death | **123 passed**; 2 installed dependency deprecation warnings |
| Identity test red phase | **4 expected failures**, 4 passes before material specialization |
| Identity / quadtree / warmup green phase | **29 passed** |
| Actual specialized EGL geometry | **2 passed**, llvmpipe, original geometry limits |
| Strict source TypeScript | PASS |
| Vite compiled artifact | PASS; existing >500 kB chunk warning retained |
| RTX 5090 actual startup / assembled asteroid shader | **5 passed**, including no-KHR, failed-link recovery and context/unload cancellation |

Toolchain: Node 22.23.2, Playwright 1.64.0, Chrome for Testing 156.0.8078.4,
Three 0.182.0, Vite 7.3.7, Python 3.12.13 with the exact CI requirements and
[resolved package freeze](python-freeze.txt). The frontend clean-install lockfile
matches SHA-256 `6f54638d28e8ed20cb8e036a52ca75f1c0687594af7bd82f3f123edcd6182702`.
Vite's cache was isolated in `/tmp/solar-scn005-vite-cache-20261102`.
The integration coordinator owns the combined full suites and distribution build.

## Raw evidence and reproduction

The raw capture filenames listed by `result.json` are retained byte-for-byte in
[raw-evidence.tar.gz](raw-evidence.tar.gz), with hashes in
[raw-manifest.json](raw-manifest.json). This includes early diagnostic runs,
prototype timings and fidelity failures, native maps/samples, all 12 paired
captures and the trusted-input arm. Test logs (trailing whitespace normalized for readability) and the final
reference comparison remain directly readable beside this file; original log
bytes are also retained in the archive.

`diagnose.mjs` observes the actual application using Three's existing devtools
hook; its optional `DIAG_SPECIALIZE`, `DIAG_LOOP_BOUND`, `DIAG_PER_OBJECT`,
`DIAG_NATIVE` and `DIAG_PROFILE` modes are diagnostic only. All were unset for
final paired captures. `native-sample.c` is an evidence-side profiler, never
application code. `planet-fidelity.mjs` defaults to the real source candidate;
`?pilot` and `?pilot&specialize-only` are retained rejected/prototype comparisons.

For a source-compatible local rerun, use the pinned Node binary, start the live
backend with CORS for owned ports 5445/5446, then Vite DEV on 5445 or its built
preview on 5446. Set `GALLIUM_DRIVER=d3d12`,
`MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib` and run:

```sh
node agent-notes/SCN005_CLOSURE_2026-11-02_EVIDENCE/diagnose.mjs continuous http://127.0.0.1:5445/ rerun-dev
node agent-notes/SCN005_CLOSURE_2026-11-02_EVIDENCE/planet-fidelity.mjs rerun-fidelity
```

Owned DEV, PREVIEW, backend, browsers and sampler were stopped after verification.
No original-checkout edits, shared branch changes, push, merge or deployment were
performed by this agent.
