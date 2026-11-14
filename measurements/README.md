# Measurements

Scripts written to measure, test or evaluate something about the app: startup timings,
solver throughput, browser diagnostics. They back numbers quoted in reports, pull requests
and specs, so anyone can rerun them.

This branch (`lab/measurements`) is never merged into `main`. Nothing here ships, runs in
CI or is imported by the app.

## Layout

```
measurements/
├── lib/                          shared helpers
│   └── headless-gpu.mjs          headless Chromium on the real GPU, with a renderer check
└── YYYY-MM-DD-topic/             one folder per experiment
    ├── README.md                 the question, how to run it, what it found
    ├── *.mjs / *.py              the scripts
    └── output*.txt               raw output of the runs the findings quote
```

## Rules

- **Headless browsers only.** On the owner's WSL machine a headed browser opens on the
  Windows desktop and takes keyboard focus. Use `lib/headless-gpu.mjs`, which strips
  `DISPLAY` and `WAYLAND_DISPLAY` and never sets `headless: false`.
- **Check the renderer.** `launch()` fails unless the WebGL renderer is D3D12 (or SwiftShader
  with `GPU=0`), so a run that silently fell back to software produces no numbers.
- **Check the load first.** Run `uptime`. At a load average of 32 the same build's startup
  swung from 4.4 to 9.8 s; numbers from a busy machine compare only with arms that ran
  alongside them.
- **Compare like with like.** Alternate the arms run by run, use a fresh browser per run,
  report medians, and keep headless and headed numbers apart: they differ by seconds.
- **Record the context** with each output: commit, Node and Python versions, load average.
- **Never weaken the app to measure it.** Instrument by patching the served module in the
  browser (see `2026-11-14-preload-cost/startup.mjs`), not by editing the checkout.

## Running

Browser scripts import `playwright`, so run them from a checkout of this branch whose
`node_modules` is installed (a symlink to another checkout's `node_modules` works). Start
a Vite dev server of the checkout under test, for example:

```bash
VITE_BACKEND_ORIGIN=http://127.0.0.1:9142 node node_modules/vite/bin/vite.js \
  --host 127.0.0.1 --port 4202 --strictPort
```

The dead backend origin keeps the backend out of the measurement. Two dev servers sharing
one `node_modules` need separate Vite cache directories (`--config` with `cacheDir`).

Python scripts import the backend, so run them from the `backend/` directory of the checkout
under test, with an environment built from its `backend/requirements.txt`.

## Experiments

| Folder | Question |
|---|---|
| `2026-11-12-planner-capabilities` | What can the existing route planner do, how fast, and why does Mission plan never pass? |
| `2026-11-13-pr66-ci-diagnostics` | Why did PR #66 fail the tab-zoom walk and the Firefox project? |
| `2026-11-14-preload-cost` | What does preloading every moon fit and the surface maps cost at startup? |

Scripts behind the earlier figures of 2026-11-08 (`pixels.mjs`, `worker.mjs` and others)
lived in a scratch directory that a reboot wiped; `2026-11-14-preload-cost/startup.mjs`
replaces the startup and worker measurements.
