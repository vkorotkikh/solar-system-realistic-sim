# Preload cost, 2026-11-14

**Question.** The owner asked to preload as much as possible, with CPU, RAM and GPU memory
no concern. PR #66 now preloads fitted positions for all 423 moons (410 shards, 60 MB) and
the Moon and Mars surface maps (14.7 MB). What does that cost at startup, and does anything
stall afterwards?

**Run.** Two Vite dev servers, one per checkout (see the top-level README), then:

```bash
node startup.mjs baseline=http://127.0.0.1:4201/ preload=http://127.0.0.1:4202/ \
  preload-nofits=http://127.0.0.1:4202/ preload-nomaps=http://127.0.0.1:4202/ 4
```

An arm whose label contains `nofits` loads only the 21 named moons' fits; `nomaps` gives the
map loader no targets. Both switches patch the served `main.ts` in the browser, so one build
serves all three preload arms.

**Metrics,** per cold start:

- **First picture:** after the first render, `readPixels` forces the frame to finish. `render()` returning is not enough: the GPU can still be working.
- **30 frames:** when the 30th animation frame arrives.
- **Worst frame in the next 8 s:** the longest gap between frames, which shows stalls such as texture uploads.
- **Moon fits:** how many loaded, and when.
- **Maps ready:** when both maps were applied.
- **Worker:** the init message size as JSON, how long sending it blocked the main thread, and when the worker reported ready.

**Results,** headless on the RTX 5090 (D3D12), medians, `output-arms.txt` (four runs, load
average 2–3) and `output-worker.txt` (three runs, load average 1.5):

| Arm | First picture | Moon fits | Worst frame next 8 s | Worker init message | Worker ready after its message |
|---|---:|---:|---:|---:|---:|
| Baseline | 4.69 s | 29 | 17 ms | 12 MB | 0.11 s |
| Maps only | 5.40 s | 29 | 17 ms | 12 MB | |
| All fits only | 5.72 s | 423 | 17 ms | 74 MB | |
| Both | 6.54 s | 423 | 17 ms | 74 MB | 0.42–0.59 s |

**Findings.**

- Preloading both costs about 1.85 s before the first picture: 0.71 s for the maps and
  1.03 s for the fits, which add up.
- Nothing stalls afterwards: the maps are on the GPU before the first frame.
- All fits are loaded by 0.84 s. Sending the 74 MB init message blocks the main thread
  for about 140 ms. The worker is ready 0.4 to 0.6 s later, well inside its 5 s deadline.
- Likely ways to win the time back, not tried: decode the maps off the main thread
  (`ImageBitmapLoader`), and verify and parse the shards in a worker.

**Side finding: `networkidle`.** With the fits preloaded, the 200% tab-zoom test timed out on
the software renderer because `page.goto(..., { waitUntil: 'networkidle' })` never settled.
`network-timeline.mjs` records every request for a while after load:

```bash
GPU=0 node network-timeline.mjs http://127.0.0.1:4202/ 40
```

On SwiftShader the preload build left exactly one request open for the whole run, the model
worker's script (`modelWorker.ts?worker_file`), although the worker reported ready. The
baseline build closed it, and so did both builds on the GPU. Playwright therefore never saw
the network go idle. PR #66 changed the test to wait for the app's own readiness instead.
