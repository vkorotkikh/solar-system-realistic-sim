# Evidence for `CODEBASE_AUDIT_2026-09-24.md`

Audited commit `941865211f20d9535f6ffeec3a0321395fbfb344`. Everything here was produced in a disposable
worktree; nothing in the repository was modified. Horizons truth was retrieved 2026-09-24T22:20:00Z.

## Layout
| Path | What it is |
|---|---|
| `logs/00-versions.log` | git status/HEAD, node, npm, python versions |
| `logs/01…06-*` | `npm ci`, `npm ls --all`, `npm run typecheck` (246 errors), `vite build`, `npm test`, `npm audit` (+ JSON) |
| `logs/07-pip-freeze-*.txt` | resolved Python set before/after adding `httpx` |
| `logs/08-pytest-no-httpx.log` / `09-pytest.log` | fresh-install collection failure / 176 passed |
| `logs/10-compile.log`, `11-pip-audit.log`, `14-pycov.log`, `15-jscov.log` | compile, CVE scan, coverage |
| `logs/12-regen-asteroids.log`, `13-ephem-check.log`, `16-update-moons.log` | dataset regeneration and live ephemeris check |
| `logs/server-8042.access.log`, `server-8055.tracebacks.log` | backend access log during the browser runs; unhandled task exceptions |
| `horizons_2026-09-24.json` | all truth vectors (planets heliocentric, SSB, EMB, 26 moons) |
| `results/*.json` | per-check numeric results (see file names) |
| `scripts/` | every harness used (below) |
| `screenshots/` | real-GPU view, responsive layouts, WebGL-disabled page |

## Re-running
```bash
# 1. Disposable worktree + toolchain (see report Appendix A)
git worktree add --detach /tmp/wt 941865211f20d9535f6ffeec3a0321395fbfb344 && cd /tmp/wt && npm ci
python3.12 -m venv /tmp/venv && /tmp/venv/bin/pip install -r backend/requirements.txt httpx

# 2. Frontend harness bundle (drives the REAL model and the REAL worker module in Node)
mkdir -p /tmp/h && cp scripts/{shim.ts,entry.ts,entry2.ts,*.js} /tmp/h/   # from this directory
#   entry*.ts import the app as '@wt/src/...'; --alias points @wt at the worktree root:
NODE_PATH=/tmp/wt/node_modules npx esbuild /tmp/h/entry.ts  --bundle --format=cjs --platform=node --alias:@wt=/tmp/wt --outfile=/tmp/h/b.cjs
NODE_PATH=/tmp/wt/node_modules npx esbuild /tmp/h/entry2.ts --bundle --format=cjs --platform=node --alias:@wt=/tmp/wt --outfile=/tmp/h/b2.cjs
cd /tmp/h && SP=<this directory> node planets.js      # planets vs Horizons + CPU≡worker check
SP=<this directory> node moons.js                     # 26 moons vs Horizons
SP=<this directory> node utc_emb_moongate.js           # M-2, M-3, M-22
SP=<worktree root> node gpu.js                         # M-1 float32 shader replica

# 3. Backend checks (run from /tmp/wt/backend)
python <evidence>/scripts/pfss_check.py                # H-2
python <evidence>/scripts/fanout.py                    # H-3 fan-out
python <evidence>/scripts/mga_search.py                # M-4 + flyby v∞
python <evidence>/scripts/lam_hyperbolic.py            # L-1
python <evidence>/scripts/jpl_frame_lambda.py <evidence>/horizons_2026-09-24.json ../src/data/moons.json   # M-23
python lam.py                                          # Lambert closure (needs SP pointing at the worktree parent)
# in a SEPARATE venv with `pip install lamberthub`:
python <evidence>/scripts/lam_xcheck.py <evidence>/results/lam_repo.json

# 4. Live-server checks (backend on :8042 with defaults)
PORT=8042 python <evidence>/scripts/xff.py             # M-6
PORT=8042 python <evidence>/scripts/ws_lockout.py      # M-5 (≈ 4 min)
PYTHONPATH=<evidence>/scripts-dir-containing-sitecustomize uvicorn server:app --port 8061   # H-3 slow upstream
#   (rename scripts/sitecustomize_slow_upstream.py to sitecustomize.py in its own directory first)

# 5. Browser (Playwright 1.63; headed; real GPU needs GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA on WSLg)
SP=<scratch> URL=http://127.0.0.1:5173/ TAG=dev-gpu-dpr1 DPR=1 EXT=12 REQUIRE_GPU=1 node scripts/core.mjs
SP=<scratch> node scripts/battery.mjs ; SP=<scratch> node scripts/a11y.mjs ; SP=<scratch> node scripts/heapdiff.mjs
```
`core.mjs` aborts unless the WebGL renderer string contains "NVIDIA", which prevents the llvmpipe fallback from
being mistaken for a GPU measurement (this happened once during the audit and was discarded).
