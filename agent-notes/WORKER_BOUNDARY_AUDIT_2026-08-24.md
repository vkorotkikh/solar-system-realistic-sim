# Worker boundary audit — `modelWorker.ts` / `modelWorkerContract.ts` / `main.ts`

> **Historical snapshot — not current branch status.** This report is pinned to `44088f8`; later worker-contract and precision changes are intentionally outside its scope.

**Snapshot:** `.../scratchpad/pinned` (`PINNED_SHA=44088f8447a454d343a08f2f69a824929e631afa`, pinned 2026-08-24T07:55:09Z). Real repo untouched; no worktrees, no `.eval/`. All artifacts in `.../scratchpad/out/WORKER/`.

**Method:** every numeric claim below is **executed**, not inferred, unless explicitly marked. Harnesses: `out/WORKER/harness.mjs` (drives the real bundled worker), `fidelity.mjs` / `fidelity2.mjs` (numerics + cost), `mainside.mjs` (emulates main's apply loop).

---

## 1. The contract, precisely

`src/workers/modelWorkerContract.ts` (87 lines) is a **pure leaf module**: its only import is `import type { KeplerOrbit }` (line 1), which erases. It exports 10 types and exactly one value, `buildCatalogIndexContract`.

**Inbound (main → worker)**

| msg | field | type | units / frame | who writes | who reads |
|---|---|---|---|---|---|
| `init` | `catalog.bodies[]` | `{id, parentId?, orbit}` | `orbit.aAu` AU, `periodDays` d, `epochJd` JD, angles deg | main.ts:667 | worker:73-74 |
| | `simStartJd` | number | Julian Date (time scale **unspecified**) | main.ts:668 | worker:75 |
| | `stepMs?` | number | — | **nobody** | **nobody** — dead field |
| | `sequence` | number | monotonic counter | main.ts:669 | worker:76 |
| `tick` | `simState.julianDate` | number | JD | main.ts:709 | worker:97 |
| | `simState.deltaSeconds?` | number | s | **nobody** | worker:103 (dead read) |
| | `simState.stepMs?` | number | ms | main.ts:710 | worker:105 |
| | `simState.metricState?` | `{direction:[n,n,n], sourceDistanceCm, energyErg, timeSec, smbhMassG?}` | cm, erg, s, g | main.ts:696-704 | worker:108-136 |
| | `sequence` | number | monotonic | main.ts:713 | worker:92 |

**Outbound (worker → main)**

| msg | field | type | units / frame | who writes | who reads |
|---|---|---|---|---|---|
| `ready` | `bodyCount` | number | — | worker:80 | **nobody** (main:633-635 ignores it) |
| `state` | `sequence` | number | echo of tick seq | worker:144 | main:640 |
| | `bodies` | **`Float32Array`** | 7 per body: `[index, px,py,pz (AU), vx,vy,vz (AU/day)]` | worker:44-58 | main:736-748 |
| | `tickJd` | number | JD of this snapshot | worker:147 | main:653 → stored, **never used again** |
| | `profilerMs` | number | ms | worker:148 | main:654 → stored, **never used again** |

**Frame / origin / epoch / ownership.** Positions are heliocentric ecliptic in AU, velocities AU/day, origin = the `sun` node (the only body with `orbit === null`, so `worldPosition ≡ (0,0,0)` at rest — `solarSystemModel.ts:114-134`). Time is bare `julianDate`; no TT/TDB/UTC declaration anywhere. **None of this is expressed in the contract** — see F-19 below.

State ownership is split and asymmetric: the worker owns a *second, independent* `SolarSystemModel` over all 434 bodies; main owns its own 434-body model plus 6 `Float32Array` staging lanes (`main.ts:122-127`). Main writes the worker's numbers **back into its own float64 model** (`main.ts:794-812`) — but only for the 10 bodies that have scene nodes (finding W-2).

---

## 2. K-04 — **FIXED**, with before/after byte evidence

The pinned tree contains a **stale checked-in `dist/` from Aug 23 19:05**, which predates the worker rewrite (`modelWorker.ts` mtime Aug 24 03:49). It serves as the pre-fix reference. *(Circumstantial — I cannot prove it is the exact parent commit's build, but its contents match K-04's described pre-fix state exactly.)*

```
# reproduction
cd $SP/pinned && npx vite build --outDir $SP/out/WORKER/dist --emptyOutDir
grep -c 'self\.onmessage' <main index-*.js>
```

| grep on **main** chunk | PRE-fix `dist/assets/index-tNhaOiPb.js` | POST-fix `out/WORKER/dist/assets/index-DR6lWkW8.js` |
|---|---|---|
| `self.onmessage` | **1** | **0** |
| `onmessage` (any) | 2 | **1** (that one is `un.onmessage=` = `modelWorker.onmessage`, main's own receiver — legit) |
| `WorkerGlobalScope` | 0 | 0 (worker chunk: **2**) |
| `model worker init failed` | **1** | **0** |

Pre-fix main chunk, offset 712380 — the worker's handler verbatim on the page:

```js
a[l+6]=o.worldVelocity.z}return a}self.onmessage=n=>{const e=n.data;if(!(!e||typeof e!="object")){
if(e.type==="init"){try{const t=e.catalog;Qs=ip(t),Qi=new Xd(V2(t)),Qi.update(e.simStartJd),
lo=Number(e.sequence);const i={type:"ready",bodyCount:Qs.idByIndex.length};self.postMessage(i)}catch(t){
```

**Two independent mechanisms** now break it, and both are genuinely load-bearing:

1. **Import chain broken.** `main.ts:43` value-imports `buildCatalogIndexContract` from `./workers/modelWorkerContract` — the new leaf module — not from `modelWorker.ts`. The remaining 5 imports on lines 44-49 are `import type`, which erase. Main's chunk therefore references `modelWorker.ts` only as a URL string: `new Worker(new URL("/assets/modelWorker-DZOD98mE.js",import.meta.url)`.
2. **Runtime guard** at `modelWorker.ts:64-65`, which survives minification (`typeof WorkerGlobalScope<"u"&&globalThis instanceof WorkerGlobalScope&&(self.onmessage=...)`, present in the worker chunk, absent from main's).

**Refutation attempt:** I grepped for `applyMetricKinematics` in the new main chunk and found 2 hits — but those are main's own `updateModelLocally` (main.ts:682) and the `SolarSystemModel` method body, not worker leakage. The worker-unique string `model worker init failed` is at 0. Confirmed fixed.

Cost: main chunk shrank only **241 bytes** (848567 → 848326), because main already imports `SolarSystemModel`, `three`, and `smbhPropagation` itself. The value of the fix is the removed double-registration hazard, not bytes. `buildCatalogIndexContract` is now duplicated into both chunks (`fill(-1)` appears once in each) — acceptable, ~200 B.

---

## 3. Executed worker behavior

`node out/WORKER/harness.mjs` (real esbuild bundle of `modelWorker.ts`, `WorkerGlobalScope` shimmed via `Symbol.hasInstance`):

```
OK: self.onmessage installed, isWorkerContext guard passed under shim
catalog bodies = 434

=== 1. init handshake ===
  init seq=1: outbound=[ready({"type":"ready","bodyCount":434})]
=== 2. normal ticks ===
  tick seq=2: outbound=[state(seq=2, tickJd=2460001.5, dtype=Float32Array, len=3038, transfer=true)]
=== 3. record layout ===
  RECORD_SIZE implied = 7 ; records whose index-slot != ordinal: 0
=== 4. stale / duplicate / out-of-order ===
  duplicate seq=3: outbound=[]      <- silently dropped
  stale seq=2:     outbound=[]      <- silently dropped
  jump seq=99:     outbound=[state(seq=99, ...)]
=== 5. malformed ===
  null / number / string / unknown-type / no-simState / non-numeric-jd / no-sequence -> all outbound=[]
  valid tick after malformed batch: outbound=[state(seq=103, ...)]   <- recovers
=== 7. corrupt catalog ===
  init catalog=null:    THREW: model worker init failed: Cannot read properties of null (reading 'bodies')
  init catalog missing: THREW: model worker init failed: Cannot read properties of undefined (reading 'bodies')
  init dangling parent: outbound=[ready({"type":"ready","bodyCount":1})]   <- accepted, no validation
=== 9. exception inside tick ===
  metricState.direction=null: THREW: Cannot read properties of null (reading '0')   <- NOT caught
```

Verdicts: handshake correct; record striding correct and consistent (0/434 index-slot mismatches); monotonic guard on the worker side works; malformed input never crashes and never corrupts state. **`init` throws are rethrown deliberately** → in a real Worker this fires `onerror` → `main.ts:659-663` → `disableModelWorkerIntegration()` → CPU fallback. That path is sound. The `tick` branch has **no** try/catch (unlike `init`), but an uncaught throw reaches the same `onerror`, so main still recovers rather than freezing. **A dangling `parentId` is silently accepted** (`buildCatalogIndexContract` line 78 `?? -1`), no validation, no diagnostic.

---

## 4. Findings

### W-1 — K-39 **still present**: Float32 transport, up to 808 km quantization  ·  High

`src/workers/modelWorker.ts:44`
```ts
const bodies = new Float32Array(bodyCount * MODEL_WORKER_RECORD_SIZE);
```
`src/workers/modelWorkerContract.ts:58` — `bodies: Float32Array;`
`src/main.ts:794-795` — the rounded values are written **back over the float64 model**:
```ts
state.worldPosition.set(wx, wy, wz);
state.worldVelocity.set(vx, vy, vz);
```

**Repro:** `node out/WORKER/harness.mjs` → `dtype=Float32Array`. `node out/WORKER/fidelity2.mjs` for numbers.

**Expected vs actual.** Expected float64 (~1.3 mm at 39 AU). Actual, executed at JD 2460000.5:

| body | r (AU) | transport err | 1 ULP |
|---|---|---|---|
| mercury | 0.455 | 1.9 km | 7.9 km |
| earth | 0.990 | 1.1 km | 16.1 km |
| jupiter | 4.951 | 33.3 km | 84.3 km |
| saturn | 9.811 | 57.5 km | 147.8 km |
| neptune | 29.903 | 28.0 km | 530.9 km |
| **pluto** | **34.709** | **163.1 km** | **545.7 km** |

Scanned over one full Pluto orbit (90,560 d): max |component| 45.319 AU → **1 ULP = 808.2 km**. Constant: `2^-23 × AU_KM = 17.83 km per AU`. Float64 equivalent at 39 AU: **1.295 mm**. Worst body overall: `moon-pluto-styx`, 163.8 km.

Second-order effect — **catastrophic cancellation** when main differences two Float32 heliocentric positions to recover a parent-relative one (`main.ts:775-777`, `799-803`):

```
moon-pluto-charon   sep=   19600 km  err= 143.8 km = 0.734%
moon-mars-phobos    sep=    9379 km  err=   6.4 km = 0.068%
moon-neptune-triton sep=  354800 km  err=  79.0 km = 0.022%
moon-earth-moon     sep=  372506 km  err=   0.7 km = 0.000%
```

**Root cause:** `packModelState` chose `Float32Array` for a payload whose dynamic range is 0–49 AU with metre-scale meaningful precision. Doubling to Float64 costs 12,152 extra bytes/tick (0.70 → 1.39 MB/s at 60 fps) on a **transferred** (zero-copy) buffer.

**Severity High:** it silently degrades the float64 authoritative model to ~7 significant digits for every rendered body, every frame, and there is no way to recover the lost bits. **Reachability:** shipped — `Float32Array(i*T)` is the only allocation in the emitted worker chunk. **Refutation attempt:** at the default 4 d/s warp, 163 km on Pluto is far below one screen pixel, so this is invisible in the current renderer; it matters for the model state, any trajectory planning built on it, and the moon-relative frame above. Not a rendering blocker; genuinely wrong data.

---

### W-2 — F-20 confirmed and **worse than recorded**: 97.7% of the payload is discarded, and 424 moon states go permanently stale  ·  High

`src/main.ts:752-759`
```ts
for (let bodyIndex = 0; bodyIndex < expectedCount; bodyIndex += 1) {
  if (!modelWorkerPositionsDirty[bodyIndex]) continue;
  const body = catalog.bodies[bodyIndex];
  if (!body) continue;
  const node = bodyNodes.get(body.id);
  if (!node) continue;          // <-- 424 of 434 records die here
```
`src/main.ts:381-386` — moon nodes are **never created**:
```ts
const showMoons = false;
for (const body of catalog.bodies) {
  if (body.type === 'moon' && !showMoons) continue;
  createBodyNode(body);
```

**Repro:** `node out/WORKER/mainside.mjs`
```
bodyNodes size (main.ts:381-386): 10 of 434 catalog bodies
records that reach the position/state write: 10
records dropped at main.ts:759: 424 = 97.7% of the 12152-byte payload (11872 bytes/tick discarded)
```

**Numbers (executed, `fidelity.mjs` / `fidelity2.mjs`):**
- Catalog: 434 bodies = 1 star + 8 planets + 1 dwarf + **424 moons**. Rendered set = exactly `sun,mercury,venus,earth,mars,jupiter,saturn,uranus,neptune,pluto`.
- Payload 12,152 B/tick; useful 280 B → **97.70% waste**; **0.70 MB/s** transferred at 60 fps for **16.4 KB/s** of usable data.
- Propagation: 434-body `model.update()` = **0.212 ms/tick**; 10-body = **0.004 ms/tick** → **98.0% wasted** (0.208 ms). Plus `packModelState()` 434 bodies = **0.073 ms/tick**. Total ≈ 0.285 ms/tick, of which ≈0.006 ms is needed.

**New sub-finding the prior F-20 write-up does not contain:** because the moon records are dropped *before* the write-back at `main.ts:791-812`, and because `main.ts:828 if (snapshotApplied) return true` skips `updateModelLocally()` → `model.update()`, the **424 moon `BodyState`s in the main-thread model are frozen at the single startup `model.update()` (main.ts:1031) for the entire session** while the worker path is live. The worker computes them 60×/second; main never receives the benefit and never computes them itself.

**Severity High** on cost/architecture, **Medium** on correctness (the stale moon states are read only by `updateBodyInfoPanel` (main.ts:538) whose `<select>` is populated from `majorBodies` only, so no moon is currently selectable). **Reachability:** shipped and active. **Refutation attempt:** if `showMoons` were ever flipped to `true` the moons would be needed — but it is `const` at module scope (main.ts:381), never reassigned, and node creation happens once at module init, so flipping it at runtime is impossible without a reload. Also `main.ts:788 node.visible = showMoons` is unreachable dead code: no moon ever has a node.

---

### W-3 — No staleness guard whatsoever; `tickJd` is transported for exactly this purpose and ignored  ·  Medium

`src/main.ts:649-655` and `823-830`
```ts
latestModelWorkerState = { type:'state', sequence, bodies,
  tickJd: Number(stateMessage.tickJd),                                  // stored...
  profilerMs: Number.isFinite(stateMessage.profilerMs) ? ... : undefined };
...
if (latestModelWorkerState) { snapshotApplied = applyLatestWorkerSnapshot(); }
if (snapshotApplied) { return true; }
```

**Repro:** `grep -n "tickJd\|profilerMs\|stale\|freshness\|lastApplied" src/main.ts` → only lines 653 and 654 in the whole file; the staleness/freshness grep returns **nothing**.

**Expected vs actual.** Expected: compare `tickJd` against `simState.julianDate` and fall back to `updateModelLocally()` past a threshold. Actual: `tickJd` is `Number()`-converted, stored, and never read again; `latestModelWorkerState` is **never cleared after being applied**, so if the worker stops producing, main re-applies the identical snapshot every frame forever, `updateModelState` returns `true`, `updateModelLocally()` never runs — the scene freezes while `timeController.advanceLocalTime()` and the HUD date keep advancing. This is exactly the "silently freeze on stale state" failure mode.

Measured staleness at max warp (`MAX_TIME_SCALE_DAYS_PER_SEC = 120`, `constants.ts:14`):

```
lag   16.7 ms ->   2.00 simulated days behind
lag    200 ms ->  24.00 simulated days behind
lag   1000 ms -> 120.00 simulated days behind
mercury displacement over 24 sim days: 72,267,479 km = 63.0 deg of arc
```

**Root cause:** the field needed for the check exists in the contract; the consumer never wired it up. **Severity Medium** — the practical trigger (worker producing nothing while `onerror` never fires) is narrow: the executed harness shows the only silent-drop paths are stale/duplicate sequence and non-finite `julianDate`, neither reachable from main's strictly-increasing counter and finite JD. **Refutation attempt:** a thrown exception *does* reach `onerror` → `disableModelWorkerIntegration()` (main.ts:611 nulls `latestModelWorkerState`) → clean CPU fallback, so the common crash case recovers correctly. The freeze is latent, not routine. But there is still **zero** bound on how old an applied snapshot may be.

---

### W-4 — No in-flight / backpressure policy; ticks are dispatched at ~60 Hz, not ~5 Hz  ·  Medium

`src/main.ts:818-822`, `1053-1059`
```ts
function animate(timestamp) {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.max(0, (timestamp - prevTimestamp) / 1_000);
  ...
  updateModelState(deltaSeconds);     // -> dispatchModelWorkerTick every single frame
```
```ts
if (modelWorkerEnabled && modelWorker && modelWorkerReady) {
  dispatchModelWorkerTick(deltaSeconds);
```

**This refutes the prior "at most one tick in flight (~5 Hz)" fact.** `grep -n -i "inFlight\|pending\|throttle" src/main.ts` returns nothing. The only guards on `dispatchModelWorkerTick` are `enabled`/`ready` (main.ts:693) — no outstanding-request counter, no rate limit, no drop-newest/drop-oldest policy. One `postMessage` per rAF frame.

**Consequence:** the worker's inbox is unbounded FIFO. Measured worker cost 0.285 ms/tick vs a 16.7 ms frame budget → ~57× headroom today, so no queue builds in practice. But if the worker ever falls behind (bigger catalog, slower device, GC pause), lag grows linearly and forever, and W-3's missing staleness guard means main will render it without complaint. **Severity Medium** (design defect, currently masked by headroom). **Reachability:** shipped. **Refutation attempt:** the worker's own `sequence <= lastSequence` rejection provides no relief here — every queued tick has a *higher* sequence, so all of them are processed.

---

### W-5 — F-19 confirmed: no `units` / `frame` / `schema_version` / epoch / origin — and `RECORD_SIZE` was left out of the new contract module  ·  Medium

**Repro:**
```
grep -n -i "unit|frame|schema|version|epoch|origin|AU_" src/workers/modelWorkerContract.ts   -> no matches
grep -rn "RECORD_SIZE" src --include=*.ts
  src/main.ts:134                 const MODEL_WORKER_RECORD_SIZE = 7;
  src/workers/modelWorker.ts:18   const MODEL_WORKER_RECORD_SIZE = 7;
```

The commit created a module whose entire purpose is to be the single source of truth for this boundary, and then left the two most drift-prone constants — **record stride (7)** and **element dtype (Float32)** — as independent literals on each side. There are no comments naming AU / AU-per-day / heliocentric-ecliptic / JD anywhere in either worker file. The type `bodies: Float32Array` encodes the dtype in one place but nothing forces the producer's allocation to match it (the producer could switch and only the *value* would drift — see W-6).

**Severity Medium** — latent; the two `7`s agree today (verified: 0/434 stride mismatches). **Refutation attempt:** the length guard `bodies.length !== catalogBodyCount * MODEL_WORKER_RECORD_SIZE` (main.ts:647, 730) would catch a stride change on one side only — it would silently drop *every* snapshot and, per W-3, freeze the scene rather than warn. A stride change is caught; a **dtype** change is not (W-6).

---

### W-6 — Silent truncation: a Float64 payload is downcast to Float32 while the length guard still passes  ·  Medium

`src/main.ts:643-647`
```ts
const bodies = stateMessage.bodies instanceof Float32Array
  ? stateMessage.bodies
  : new Float32Array(stateMessage.bodies ?? 0);

if (bodies.length !== catalogBodyCount * MODEL_WORKER_RECORD_SIZE) return;
```

**Repro (executed):**
```
Float64Array payload -> len 3038 (guard expects 3038 => PASSES) dtype Float32Array
  value 34.70912345678901 became 34.70912170410156  error 262.20 km
ArrayBuffer payload  -> len 6076 (guard FAILS, dropped)
```

**Expected vs actual.** The obvious fix for W-1 is to change `modelWorker.ts:44` to `Float64Array`. Doing *only* that produces no error, no warning, and no dropped frames — `new Float32Array(f64)` performs an **element-wise conversion preserving length**, so 3038 elements still equal 3038, the guard passes, and every value is re-quantized to Float32 with a **262 km** error on a Pluto-scale coordinate. The K-39 fix would appear to work and silently accomplish nothing.

**Root cause:** a defensive coercion whose fallback is lossy rather than rejecting. **Severity Medium** (booby-trap for the fix this audit recommends). **Reachability:** shipped. **Refutation attempt:** today the worker always sends `Float32Array`, so the `else` branch is dead — this is a maintenance hazard, not a live bug.

---

### W-7 — Main has **no** monotonic sequence guard (refutes "guards on both sides")  ·  Medium

`src/main.ts:638-655`
```ts
if (message.type === 'state') {
  const sequence = Number(stateMessage.sequence);
  if (!Number.isFinite(sequence) || sequence < 0) return;
  ...
  latestModelWorkerState = { ... sequence ... };   // unconditional overwrite
```

Main validates only that `sequence` is finite and non-negative. It never compares against the previously accepted sequence, and never stores one. The worker's guard (`modelWorker.ts:93`) is the only ordering enforcement in the system.

**Severity Medium/Low** — a single `MessagePort` delivers FIFO, so with one worker an older snapshot cannot overtake a newer one. It becomes real the moment a second producer, a restarted worker, or a `SharedWorker` is introduced. Stated here mainly to **correct the prior record**: the guard is one-sided.

---

### W-8 — The commit introduced 2 new type errors in the file it rewrote  ·  Low/Medium

`src/workers/modelWorker.ts:64`
```ts
const isWorkerContext = typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope;
```
```
src/workers/modelWorker.ts(64,32): error TS2304: Cannot find name 'WorkerGlobalScope'.
src/workers/modelWorker.ts(64,91): error TS2304: Cannot find name 'WorkerGlobalScope'.
```
Root cause: `tsconfig.json` `"lib": ["ES2022","DOM","DOM.Iterable"]` — **`"WebWorker"` is absent**, and worker sources are inside `include: ["src/**/*.ts"]`. Fix is a `/// <reference lib="webworker" />` or a `declare const WorkerGlobalScope: unknown`. The guard itself is correct at runtime and is essential to the K-04 fix — this is a declaration gap, not a logic bug.

---

### W-9 — the contract's tuple type is not actually enforced at the producer  ·  Low

`src/main.ts:706-712` →
```
src/main.ts(711,7): error TS2322: Type '{ direction: any[]; sourceDistanceCm: any; ... } | null'
  is not assignable to type 'ModelWorkerMetricState | null | undefined'.
```
`ModelWorkerMetricState.direction` is `[number, number, number]` (contract line 20) but main builds `[warpState.direction.x, ...]`, inferred `any[]` because `sunCtrl.getWarpState()` is untyped. So the one place the new contract could have caught a shape error, it doesn't — the error is reported and lives in the 1,300.

---

### W-10 — Six fields written-never-read or read-never-written  ·  Low

| field | status |
|---|---|
| `ModelWorkerInitMessage.stepMs?` | declared; **never written, never read** |
| `ModelWorkerSimState.deltaSeconds?` | **read** (worker:103), **never written** by main (main sends `stepMs` only) |
| `ready.bodyCount` | **written** (worker:80), **never read** — main never cross-checks the worker's 434 against its own `catalogBodyCount` |
| `state.tickJd` | written, stored (main:653), **never used** — see W-3 |
| `state.profilerMs` | written, stored (main:654), **never used** — no profiling surface consumes it |
| `CatalogIndexContract.idToIndex` | a 434-entry `Map` built in **both** main and worker; used only inside `buildCatalogIndexContract`, never afterwards on either side |

Also: the `bodies[base] = bodyIndex` index slot is **100% redundant** — verified 0/434 records where the slot differs from the record ordinal. It costs 434×4 = 1,736 B/tick and is actively harmful (W-11).

---

### W-11 — A skipped record aliases onto body index 0  ·  Low (latent)

`src/workers/modelWorker.ts:48-52`
```ts
const state = localModel.getState(bodyId);
if (!state) continue;              // leaves the whole 7-float record at 0, including the index slot
const base = bodyIndex * MODEL_WORKER_RECORD_SIZE;
bodies[base] = bodyIndex;
```
`src/main.ts:736-749` reads `bodies[record]` as the destination index, so a zeroed record resolves to `bodyIndex = 0` and **writes zeros into body 0 (`sun`) and marks it dirty**, while the intended body is left non-dirty and silently skipped. Executed (`fidelity.mjs`, hole punched at record 5 = `jupiter`): body 5 x = 0 (true 4.7285), `dirty[5]=0`; body 0 clobbered.

**Severity Low:** unreachable today — `contract` and `model` are built from the *same* `message.catalog` in the same `init` block, and `SolarSystemModel`'s constructor seeds `stateById` for every catalog entry, so `getState` cannot return null. Verified: 0 duplicate ids and 0 dangling parents in the shipped catalog. Hardening only: the sentinel should be `-1`, not `0`.

---

### W-12 — `tick` branch has no try/catch (unlike `init`); one error kills the worker for the session  ·  Low

`modelWorker.ts:70-87` wraps `init` in try/catch and rethrows a labelled error; `modelWorker.ts:89-152` wraps nothing. Executed: `metricState.direction = null` throws `Cannot read properties of null (reading '0')` out of `vectorScratch.set(direction[0], ...)` at line 123. In a real Worker this reaches `main.ts:659` → `disableModelWorkerIntegration()` → permanent CPU fallback (`initializeModelWorker()` is called exactly once, main.ts:1032; there is no restart path). That is a *correct* degradation, not a freeze — but the recovery is one-way and the console message is `[modelWorker] stopped: <string>` with no sequence/tickJd context. **Reachability of the trigger:** none from main.ts — `main.ts:696` only builds `metricState` when `warpState.direction` exists, and always as a 3-element array. Hardening.

---

## 5. Typecheck delta

```
cd $SP/pinned && npx tsc --project tsconfig.json --strict --noEmit
total: 1300 errors   (unchanged from the pre-commit 1,300)
```

Per-file for the touched files (**current state**; pre-fix versions unavailable → this half is **blocked** as requested):

| file | errors | type-clean? |
|---|---|---|
| `src/main.ts` | **70** | no |
| `src/workers/modelWorker.ts` | **2** | no — both TS2304 `WorkerGlobalScope`, **both new** (the pre-fix file had no such guard; see the pre-fix bundle, `WorkerGlobalScope` count 0) |
| `src/workers/modelWorkerContract.ts` | **0** | **yes** |
| `src/sim/catalog.ts` | **0** | **yes** |
| `src/sim/solarSystemModel.ts` | 0 | yes |
| `src/sim/orbitMath.ts` | 0 | yes |

`main.ts`'s 70 by code: 23× TS2339 (`Property 'checked'/'value' does not exist on type 'HTMLElement'` — the untyped `dom` object literal at main.ts:72-101), 19× TS18047 (`possibly null` on the same `dom` fields), 11× TS7006 (implicit-any parameters), 5× TS7005, 5× TS2322, 3× TS7034, 2× TS18049, 1× TS7053, 1× TS2345.

**Only 5 of main.ts's 70 errors are in worker code at all** (lines 600-870):
```
main.ts(676,29) TS7006  Parameter 'deltaSeconds' implicitly has an 'any' type.
main.ts(692,34) TS7006  Parameter 'deltaSeconds' implicitly has an 'any' type.
main.ts(711,7)  TS2322  '{ direction: any[]; ... }' not assignable to 'ModelWorkerMetricState | null'
main.ts(818,27) TS7006  Parameter 'deltaSeconds' implicitly has an 'any' type.
main.ts(844,5)  TS2322  Type 'SolarCatalog' is not assignable to type 'SceneCatalogLike'.
```
And **zero** errors in the lines the contract types cover (40-140, 600-670, 720-816) other than those five.

**Assessment.** The commit did **not** fix a measurable number of type errors — the total is identical at 1,300, and the errors that remain in `main.ts` are overwhelmingly the pre-existing `dom` / implicit-any backlog that the commit did not touch. What it actually did: (a) moved the contract types out of `modelWorker.ts` into a new, **fully type-clean** module, which is real structural improvement and is what broke the K-04 import chain; (b) **added 2 new errors** (`modelWorker.ts:64`) that did not exist before. Net type-error delta for the touched files is therefore roughly **+2**, offset somewhere else in the tree by ±2 that I cannot attribute without the pre-fix sources (**blocked**). The honest characterization is **"mostly moved code, plus one genuine architectural fix (K-04), plus two new errors"** — not "fixed high-level frontend typing". The moon-frame half of the commit message is also not visible as a type fix: `main.ts:772-782` and `797-808` implement moon→parent differencing, and they are type-clean, but W-1 shows the arithmetic they perform loses up to 0.73% of the separation for Pluto's moons.

---

## 6. Status of the four prior facts

| prior fact | verdict |
|---|---|
| **K-04 (High)** — worker handler bundled into the main chunk | **FIXED.** `self.onmessage` in main chunk 1 → **0**; `model worker init failed` 1 → **0**; two independent mechanisms (type-only import chain + `WorkerGlobalScope` runtime guard). |
| **F-19 (Medium)** — no `units`/`frame`/`schema_version` | **STILL PRESENT**, unchanged; and the new contract module also omits the record stride and dtype constants (W-5). |
| **F-20 (Medium)** — 434 propagated, 424 moons unrendered | **CONFIRMED and worse**: 97.70% of payload, 98.0% of propagation; 424 records are dropped at `main.ts:759` before write-back, so the moons' main-thread states are also frozen at startup (W-2). The "CPU path does not also run every tick" sub-claim holds — `main.ts:828` early-returns. |
| **K-39 (Medium)** — Float32 transport | **STILL PRESENT**, executed: `dtype=Float32Array`, Pluto 1 ULP 545.7 km now / **808.2 km** at orbital max, and `main.ts:794-795` still overwrites the float64 model (W-1). |
| protocol "one tick in flight, ~5 Hz" | **REFUTED** — one tick per rAF frame (~60 Hz), no in-flight tracking, no throttle (W-4). |
| "monotonic sequence guards on both sides" | **REFUTED** — worker-side only; main has no monotonic guard (W-7). |
| protocol shape `tick{julianDate, stepMs, ...}` flat | **CORRECTED** — the shape is nested under `simState`; a flat tick is silently rejected (harness §6: `flat tick seq=200 -> outbound=[]`). |

## 7. Not run / blocked

- **Pre-fix `tsc` per-file counts** — pre-commit sources unavailable in the pinned snapshot. Used the stale checked-in `dist/` as the only pre-fix reference (bundle-level only).
- **Real browser worker execution** — no Playwright run; the worker was executed under Node with a `WorkerGlobalScope` shim. The `isWorkerContext` guard was verified present and unminified-away in the emitted worker chunk, and absent from the main chunk, but "the guard evaluates true in a real `type: 'module'` worker" is **inferred** from spec (`DedicatedWorkerGlobalScope extends WorkerGlobalScope`), not executed.
- **Actual frame-rate / queue-depth measurement under load** — the 60 Hz dispatch rate is read from `animate()`, and the 0.285 ms/tick worker cost is measured in Node V8, not in a browser worker thread.
