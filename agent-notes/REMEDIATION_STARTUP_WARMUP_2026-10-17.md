# SCN-005: complete-catalog shader warmup, 2026-10-17

## Outcome and scope

The unchanged **2,000 ms catalog fetch-to-parse/hash metric passes 3/3 fresh
DEV browser runs** on the observed RTX 5090 configuration: 162.2, 182.3 and
165.1 ms, versus 6,031.4, 5,595.3 and 5,668.3 ms before startup coordination.
All runs accepted the same 100,000 source and parsed rows and SHA-256.

**SCN-005 remains partial/open.** Observed completion of the first full-scene
GPU fence remains approximately 6.5–6.9 seconds. This patch does not certify
complete-scene responsiveness, PREVIEW startup, a five-minute delivery gate,
or release acceptance. The catalog timer is not a replacement for usable
rendering. No new complete-scene budget is introduced.

Base for the startup comparison: `8605903`, which contains loader `e9bec92`
and the renderer author's `1cbf273` shader repair (cherry-picked as `8605903`).
The comparison is against the same repaired shader and mapped loader on both
sides. Root independently reviewed the main/helper/recovery changes before
integration. No backend or dormant SimulationClient source was modified.

## Root cause and implementation

Initial synchronous rendering blocked the main thread while catalog response
continuations were waiting. The catalog request still starts at its original
location. Startup now retains its adoption promise, installs lifecycle and
cleanup ownership, awaits adoption or the existing explicitly reported failure
fallback, then warms the **final full scene** before drawing and starting the
frame lifecycle. Successful startup still uses 50,000 selected asteroid
instances from the verified 100,000 source rows, 5,000 Kuiper instances, and the
same default planet/scene content. There is no procedural preview or postponed
catalog acceptance.

The final-scene ordering also prevents catalog adoption from disposing and
replacing an asteroid material while compilation is checking that material.
Late catalog results cannot mutate a stopped/disposed visualization.

`renderer.compileAsync()` in the pinned Three.js implementation was inspected.
Its internal timer polls `properties.get(material).currentProgram` without a
cancellation path. Disposal clears that cache; context restoration replaces it.
A naked async call therefore cannot supply the required ownership guarantee.

The small `rendererWarmup.ts` helper instead uses the public `renderer.compile`,
`renderer.info.programs`, and native WebGL program handles/completion API. It
snapshots programs after final catalog adoption and compilation, polls
`KHR_parallel_shader_compile` readiness with an owned timer, and checks all
links after readiness. Abort, context loss, failure or timeout clears polling
and its abort listener. Normal Three shader checks remain enabled. Without KHR,
native link checks provide an explicit synchronous fallback.

The 30-second timeout bounds asynchronous polling only. Synchronous compilation
and native no-KHR link calls cannot be preempted by a JavaScript timer; this is
not a universal hard graphics-startup deadline. Context loss and unload abort
before renderer resources are disposed. The existing lifecycle refuses late or
duplicate start after disposal. Compile/link failures use the existing
accessible recovery surface, stopped state, disabled controls and reload action.

## Actual-browser measurement

Three fresh Chromium processes per arm used a new browser context, disabled
HTTP cache, 1280x900 viewport, production antialiasing and normal app content.
Driver-level shader cache was not reset. The actual main module was instrumented
only to observe catalog acceptance/adoption and wrap `renderer.render`; no
shader, model, source count, time, response body or startup condition was replaced.
The optional solar backend was absent, so its existing explicit procedural-data
fallback appeared in both arms. It is not a successful backend-delivery claim.

The wrapper records render submission and places a real WebGL fence after the
first render containing the adopted catalog. The completion column is the time
at which JavaScript observed the fence signalled, measured from navigation.
It includes callback scheduling delay and is an **upper bound on GPU completion**,
not a compositor presentation timestamp. In particular, later synchronous work
can delay its observation. It prevents an intercepted first RAF callback or a
fast render submission from being mislabeled as complete usable startup.

| Run | Catalog load ms | First full render submission ms | Full-scene fence observed ms |
| --- | ---: | ---: | ---: |
| Baseline 0 | 6,031.4 | 7,092.6 | 7,128.0 |
| Baseline 1 | 5,595.3 | 6,675.8 | 6,711.7 |
| Baseline 2 | 5,668.3 | 6,763.7 | 6,799.0 |
| Candidate 0 | 162.2 | 1,875.4 | 6,543.3 |
| Candidate 1 | 182.3 | 1,948.3 | 6,872.0 |
| Candidate 2 | 165.1 | 1,891.0 | 6,918.5 |

All six complete-scene observations contain **41 draw calls, 619,144 triangles,
14,360 points and 1,143 lines**, 50,000 asteroid instances and 5,000 Kuiper
instances. Native WebGL error is zero and no page errors occurred. The unchanged
catalog hash is `f4debc48eea13a3be43eb69d7d70e8920ece7aa5e7e6dd0490c870bc83cb222a`.
The hardware identity is
`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)`;
KHR parallel compilation and antialiasing are present.

Baseline load averages ranged approximately 2.55–2.61 / 5.89–6.13 / 6.51–6.60;
candidate averages 2.39–3.07 / 4.76–4.80 / 6.01–6.04. Root coordinated this
team's browser window, but independent host processes existed: no machine-wide
exclusive-resource claim is made. A preceding llvmpipe probe was diagnostic and
is excluded from the hardware comparison. The successful-path measurements
precede a catch-only fix preserving rejection when a compiler throws `undefined`;
that fix is covered by regression tests, not a relabeled timing rerun.

## Failure-path and correctness proof

The helper tests were written before implementation. With only synchronous
compilation, **7 of 9 failed** for the missing waiting/ownership/failure behavior.
A later explicit `throw undefined` test exposed a settlement ambiguity and was
observed failing before the callback-based settlement correction.

Final helper coverage checks every compiled program, no early link checks,
no-KHR fallback, failed links, already-aborted startup, cancellation before
resource disposal, bounded async polling, context loss, compiler throws
(including `null`/`undefined`), and late/duplicate readiness after lifecycle
disposal. Existing lifecycle visibility, generation and disposal tests remain.

Five actual-main Chromium hardware tests passed in **18.7 seconds**:

- Assembled asteroid shader with production antialiasing: both stages compile,
  link succeeds, MSAA samples=4, native WebGL error=0.
- Injected native link failure: accessible recovery alert and focused reload
  action; canvas inert/aria-hidden; no scene draws and no unhandled page error.
- Real context loss during forced-pending warmup, followed by restoration:
  polling stops; no animation starts or unhandled page error occurs.
- Unload during pending warmup: materials are disposed after cancellation;
  no subsequent polling/draw or unhandled page error.
- Native KHR support hidden by the test: the real complete catalog scene still
  draws with explicit synchronous fallback.

An initial restoration test incorrectly reacquired `WEBGL_lose_context` after
context loss, when `getExtension` returns null. The harness now retains the
native extension object obtained before loss. Assertions were not weakened.

## Validation and reproduction

Pinned Node **22.23.2**, existing unchanged lockfile/dependencies:

- Complete default frontend: **759 passed, 413 skipped**, 73 files passed and
  one skipped. The 411 moon and two opt-in EGL skips remain explicit.
- Strict source TypeScript: exit 0.
- Strict browser-test TypeScript: exit 0.
- Production build: exit 0, 69 modules, main 971.33 kB / 250.08 kB gzip;
  existing >500 kB warning remains.
- `git diff --check`: exit 0.

```sh
export PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH
env -u PLANET_SHADER_GPU_TEST node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit --strict --pretty false
node node_modules/typescript/bin/tsc -p tsconfig.ui-tests.json --noEmit
node node_modules/vite/bin/vite.js build
UI_TEST_PORT=5198 UI_HARDWARE_WEBGL=1 GALLIUM_DRIVER=d3d12   MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA LD_LIBRARY_PATH=/usr/lib/wsl/lib   node node_modules/@playwright/test/cli.js test tests/browser/startup-warmup.spec.ts   tests/browser/asteroid-shader.spec.ts --project=chromium --reporter=line
```

Immediate raw artifacts remain under `/tmp/scn005-browser-hardware-{baseline,candidate}-20261017.json`,
corresponding screenshots, and `/tmp/scn005-startup-*-20261017.log`. The harness
below preserves reproducibility without relying on those temporary paths.
Start Vite on 127.0.0.1:5197 at the named baseline/candidate revision, save this
script as `/tmp/scn005-browser-startup-20261017.mjs`, and run:

```sh
GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA   LD_LIBRARY_PATH=/usr/lib/wsl/lib   node /tmp/scn005-browser-startup-20261017.mjs hardware-candidate
```

```js
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
const { chromium } = await import(pathToFileURL(process.cwd()+'/node_modules/@playwright/test/index.mjs'));
const label=process.argv[2]; const results=[];
for(let i=0;i<3;i++){
 const browser=await chromium.launch({executablePath:'/home/nomad/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless:false,args:['--no-sandbox','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl']});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}); const page=await context.newPage(); const errors=[];const warnings=[];
 page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push(m.text());});
 const cdp=await context.newCDPSession(page); await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await page.route('**/src/main.ts*',async route=>{
  const response=await route.fetch();let source=await response.text();
  const needle='const backendBaseUrl = () => runtimeUiConfig.backendOrigin;';if(!source.includes(needle))throw new Error('capture anchor missing');
  source=source.replace(needle,needle+`
  window.__startupProbe={createdAt:performance.now(),renders:0};
  const actualRender=renderer.render.bind(renderer);
  renderer.render=(...args)=>{
    const result=actualRender(...args);const p=window.__startupProbe;const at=performance.now();p.renders++;
    p.firstRenderAt??=at;
    if(p.catalogAdoptedAt && !p.firstFullRenderAt){
      p.firstFullRenderAt=at;p.asteroidInstances=asteroidPop.count;p.kuiperInstances=kuiperPop.count;p.renderStats={...renderer.info.render};
      const gl=renderer.getContext();const debug=gl.getExtension('WEBGL_debug_renderer_info');
      p.graphics={renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,antialias:gl.getContextAttributes().antialias,parallelCompile:!!gl.getExtension('KHR_parallel_shader_compile')};
      const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
      const finish=()=>{const state=gl.clientWaitSync(sync,0,0);if(state===gl.CONDITION_SATISFIED||state===gl.ALREADY_SIGNALED){p.fullSceneGpuCompleteAt=performance.now();p.webglError=gl.getError();gl.deleteSync(sync);}else if(state===gl.WAIT_FAILED){p.fenceError=true;gl.deleteSync(sync);}else setTimeout(finish,1);};finish();
    }
    return result;
  };
  `);
  const catalogAnchor=source.match(/const gate = (catalog\d*)\.acceptance;/);if(!catalogAnchor)throw new Error('catalog capture anchor missing');const catalogVar=catalogAnchor[1];
  source=source.replace(catalogAnchor[0],`${catalogAnchor[0]}window.__startupProbe.catalog={loadMs:${catalogVar}.loadMs,budgetMs:${catalogVar}.loadLatencyBudgetMs,passed:gate.latency.passed,accepted:${catalogVar}.accepted,sourceCount:${catalogVar}.sourceCount,loadedCount:${catalogVar}.loadedCount,checksum:${catalogVar}.checksumActual};`);
  source=source.replace('refreshAsteroidBeltRenderer(phaseOnePopulation);','refreshAsteroidBeltRenderer(phaseOnePopulation);window.__startupProbe.catalogAdoptedAt=performance.now();');
  await route.fulfill({response,body:source});
 });
 const loadStart=loadavg();await page.goto('http://127.0.0.1:5197/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__startupProbe?.fullSceneGpuCompleteAt||window.__startupProbe?.fenceError,{timeout:60000});
 const report=await page.evaluate(()=>({ ...window.__startupProbe,status:document.getElementById('status-catalog').textContent}));
 await page.screenshot({path:`/tmp/scn005-browser-${label}-${i}-20261017.png`});
 results.push({run:i,...report,errors,warnings,loadStart,loadEnd:loadavg()});
 console.log(JSON.stringify(results.at(-1)));
 }finally{await browser.close();}
}
await writeFile(`/tmp/scn005-browser-${label}-20261017.json`,JSON.stringify(results,null,2)+'\n');
```
