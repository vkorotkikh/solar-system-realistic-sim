# Audit of `8f1f051` + `9673bb1` — pinned snapshot `44088f8`

> **Historical snapshot — not current branch status.** This report is pinned to `44088f8`; later server hardening, cache, and endpoint changes are intentionally outside its scope.

**Executed:** full read of `server.py` (1672 lines) and `solar_realtime_data.py` (665 lines); live backend on `127.0.0.1:8052` against a throwaway repo copy; ~50 curl probes; a stubbed-upstream concurrency harness (`out/SRV/sf_test.py`); the 53-test backend suite; read-only `git show` against the real repo to separate this commit from prior ones.

## 1. What the hardening actually does

`+577` in `server.py` is almost entirely **config plumbing + throttles on two solar endpoints**: `_load_env_csv/int/float` loaders, ~25 env-tunable limits, opt-in API keys, two sliding-window rate limiters, four `BoundedSemaphore` guards, request-size enforcers for porkchop/mission-plan, and `asyncio.wait_for(asyncio.to_thread(...))` timeouts. `9673bb1` adds a single-flight map + 4.5 s failure backoff.

Per `git show 8f1f051 --stat`, the commit touched **only** `server.py`, `solar_realtime_data.py`, `test_solar_physics_api.py`. It **did not touch the file-write endpoint**; `_resolve_benchmark_report_path` came from an earlier commit `a201065`.

## 2. F-11 / K-26 file overwrite — **NOT FIXED** (destructive primitive intact)

`benchmark/accuracy.py:358-360` — unchanged, no existence check:
```python
path = Path(output_path)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(markdown, encoding="utf-8")
```
`server.py:1193-1208` — no auth, no rate limit, no concurrency guard.

Executed against the throwaway copy:
```
$ md5sum my-notes/SENTINEL.md          → 6bfc89a0…  ("SENTINEL-DO-NOT-DESTROY-12345")
$ curl -X POST :8052/benchmark/accuracy/report -H 'Content-Type: application/json' \
       -d '{"output_path":"SENTINEL.md"}'
HTTP/1.1 200 OK … "reportPath":"…/throwaway/my-notes/SENTINEL.md"
$ md5sum my-notes/SENTINEL.md          → af1a67ee…  ("# Trajectory Accuracy Benchmark Report")
```
`{"output_path":"a/b/c/d/e/f/g/pwn.md"}` → 200, created all 7 directories. Six requests in a row → `200 200 200 200 200 200` (no throttle).

**Refutation attempts, all confirming containment holds** (and all pre-existing, not new): `../README.md`, `/etc/passwd`, `/etc/passwd.md`, `my-notes/../README.md`, `../../../../../../tmp/pwned.md`, `my-notes/sub/../../README.md` → all **400**; symlink escapes (`link.md` → outside file, `updir/…` → dir symlink) → **400** (`resolve()` follows symlinks before the check). Browser CSRF is now genuinely blocked: preflight from `https://evil.example` → **400**, and simple-request content-types (`text/plain`, `x-www-form-urlencoded`, `multipart/form-data`) → **422**, because `StrictRequestModel(strict=True)` refuses a str body.

**Verdict: PARTIALLY (browser reachability closed by the new CORS allowlist; the primitive itself untouched). Severity: High** — any local process or LAN host can silently destroy the user's `my-notes/*.md` (where this repo's own audit notes live), and one sentinel was destroyed again in this run. Confinement to `my-notes/**/*.md` is real.

## 3. CORS — **FIXED**

`server.py:99-117` replaced `allow_origins=["*"]` with a localhost allowlist.
```
GET /health -H 'Origin: https://evil.example'   → NO access-control-allow-origin
OPTIONS /benchmark/accuracy/report (evil)       → 400 Disallowed CORS origin
OPTIONS /benchmark/accuracy/report (localhost:5173) → 200 + ACAO: http://localhost:5173
```
`_load_env_csv` also refuses `"*"` in the env override (verified: `"https://evil.example,*"` → falls back to defaults). Cosmetic only: `access-control-allow-credentials: true` is still emitted for disallowed origins, but without ACAO the browser discards it — no impact.

## 4. Single-flight / backoff — **works for one key, four defects**

| # | Test | Result |
|---|---|---|
| A | 20 concurrent `latest()`, same key | **13** upstream calls, 1 shared object → **dedupe works (K-12 fixed for identical keys)** |
| B | 20 concurrent `latest(jd=distinct)`, 0.05 s/call | **165** upstream calls → **herd NOT collapsed** |
| C | 10 **serial** `latest(force_refresh=True)` | **85** calls (vs 0 cached) |
| G | `allow_cached_failure=False` | fetch invoked **5/5** vs 1/5 → **backoff bypassed by `force_refresh`** |

- **NEW ISSUE — waiters get 500 (regression from `9673bb1`).** `solar_realtime_data.py:124` sets `wait_timeout_s = self.timeout_s + 0.5` = **4.3 s**, but the leader runs **13 sequential** upstream fetches each with `timeout=3.8 s` (~49 s worst case). Non-leaders can essentially never win. `server.py:802-809` has no exception handling. **Live, unstubbed, 8 concurrent `GET /solar/realtime`:**
  ```
  req5 http=200 t=6.97   req1..4,6..8 http=500 t≈4.40  body: "Internal Server Error"
  ```
  Log: `server.py:804 → solar_realtime_data.py:250 → TimeoutError`. Before this commit all 8 would have succeeded. **Severity: Medium-High** (the frontend polls this endpoint).
- **NOT FIXED — cache ignores `jd` (K-51).** The single-flight *key* is jd-aware (`:120`) but the TTL cache (`:118`, `:129`) is one global slot. `latest(jd=2460000.5)` then `latest(jd=2400000.5)` → **0 new fetches, same object returned**, `request_date_utc = 2023-02-25` for both (should be 1858 for the second). Net effect: distinct-jd requests stampede upstream *and* 19 of 20 results are discarded, then later callers are served the wrong epoch. Live confirmation: a `live_data=true` response carried `sdo_aia.updated = "2023-02-25T00:00:10Z"` with `ok: true`.
- **NOT FIXED — `force_refresh` amplifies (K-51).** `GET /solar/realtime` has **no rate limit, no API key, no guard**; 12 serial requests → `200 ×12`. `?force_refresh=true`: **3.47–5.27 s each** vs **0.0013 s** cached — ~2700× per-request amplification, re-downloading the 2.9 MB SILSO CSV every time (SILSO reported `ok: true`, so the transfer is real). No byte cap anywhere (`response.read()` at `:173/:184/:280`).
- **Low — shared exception re-raise / unbounded failure map.** `:236` re-raises the *same* exception instance to every caller: traceback frames grew 13 → 53 over 26 raises (also a cross-thread mutation of `__traceback__`/`__context__`). `_inflight_failures` has no eviction sweep (contrast `_binary_cache`, capped at 48): 2000 distinct failing keys → **2000 retained entries**, each pinning an exception + traceback. Hard to reach in practice (`_fetch_snapshot` swallows per-source errors so snapshot keys never fail) — latent.
- **Low, latent —** `latest()` returns the shared cache dict, not a copy (`:118`, `:131`): a caller mutation was visible to the next caller. Verified `solar_physics.py` only reads it, so no live impact today.

## 5. New tests — real but narrow, and one stubs out the break

The `+113` lines are 5 tests, all in `test_solar_physics_api.py`, all asserting real behaviour (429 + `Retry-After`, 503 on timeout, 413 on `max_features=4096`). Monkeypatches are module-global rebinds read at call time, so they take effect correctly. Suite: **53 passed**.

Two problems:

- **`test_solar_physics_times_out_with_short_budget` (`:234-254`) encodes the wrong model.** Its `delayed_state` sleeps 0.2 s and finishes on its own; `assert elapsed < 1.0` proves only that the *client* was released. Nothing asserts the worker stopped — and it cannot, because `asyncio.to_thread` is uncancellable (see §7). This test would pass while the server melts.
- **`test_server_validation.py:131-150` monkeypatches away the file write.** `fake_generate_accuracy_report` replaces the writer, so the only test of the endpoint's happy path never writes. It even passes `"reports/api/test_report.md"` — the exact nested-`mkdir` behaviour the fake hides — and asserts only that the resolved path contains `my-notes`. This is the same pattern flagged previously in this repo. (The two *rejection* tests at `:105` and `:118` are genuine; they 400 before reaching the writer.)

Coverage grep across all backend tests: **zero** references to `_singleflight_fetch`, `_inflight`, `_resolve_benchmark_report_path`, CORS/`Origin`/`allow_origins`, `_enforce_porkchop_request_size`, `X-Forwarded-For`, or `SOLAR_PHYSICS_API_KEYS`. The commit's headline feature — the dedupe/backoff in `9673bb1` (28 lines of concurrency code) — ships with **no tests at all**.

## 6. Prior "new issues" list — re-checked

| Item | Verdict | Evidence |
|---|---|---|
| `/solar/physics` ignores unknown query params | **NOT FIXED** | `?jd=2460000.5` → `epoch_jd 2460000.5`; `?julian_date=2460000.5` → `epoch_jd 2461276.83` (wall clock), no warning, 200 |
| Zero-confidence observations still blended | **NOT FIXED** | `solar_physics.py:510,515`. Live: `observed_confidence: 0.0`, `applied: true`, `blend_weight: 0.25` → `activity_index` moved 0.7466 → 0.6601 (−12%) using data the model scores at zero confidence |
| `tof_min_days` has no `gt` | **NOT FIXED** | `server.py:633` `tof_min_days: FiniteFloat = 60.0`. `tof_min_days:-500, tof_max_days:-100` → **200** with an all-failures grid |
| `scan_porkchop_window` accumulates then `points[:500]` | **PARTIALLY** | `lambert.py:277,316,334` unchanged — all cells built and sorted in memory; now capped upstream at 20 000 cells by `_enforce_porkchop_request_size`. *Refutation attempt:* estimator floors (0.5 / 5.0 days) exactly match `scan_porkchop_window`'s hardcoded floors, so **no bypass at default config** |
| Unhandled `RuntimeError` → 500 | **NOT FIXED, and wider** | `ephemeris_service.py:133`. `ephemeris_provider:"spice"` — a value `/trajectory/capabilities` advertises and the request model validates — gives **500** on `/trajectory/lambert`, `/trajectory/porkchop`, **and `/mission/plan`** (the last is new to the list) |

## 7. New issues introduced

**N-1 — Timeout + semaphore give false assurance; abandoned work pins the machine. Severity: High.**
`asyncio.wait_for` cannot cancel `asyncio.to_thread`, and every guarded endpoint releases its semaphore in `finally` *at timeout* (`server.py:947`, `1120`, `1172`, `855`) — so the guard counts waiters, not workers. Measured on `POST /trajectory/porkchop` at 19 900 grid points (just under the cap):
```
2 requests → both 503 "timed out" at t=8.16s
CPU ticks: 8323 → 9160 (at response) → 10734 (+15s) → 13834 (+45s) → 13988 (+90s)
```
~60 s of unkillable CPU bought with 8 s of client time. Four rounds of 2 (≈32 s of client effort) left the server unresponsive:
```
t+15s  /health http=000 t=20.0   (timeout)
t+30s  /health http=000 t=20.0   (timeout)
t+45s  /health http=200 t=0.006  ← orphans finished, CPU flatlined
```
Applies to `/trajectory/porkchop`, `/mission/plan`, `/solar/physics`, `/solar/realtime/aia-tile`. This is exactly what the 8 s budget was meant to prevent.

**N-2 — Rate limiter is bypassable and is itself an unbounded memory sink. Severity: Medium.**
`server.py:296` trusts client-supplied `X-Forwarded-For` with no trusted-proxy config, and the documented run command binds directly (no proxy).
```
45 requests, same identity      → 9 × 429
45 requests, rotating XFF       → 0 × 429
```
`_solar_physics_rate_locks` (`:326`) never evicts stale identities: **5000 rotating identities → 5000 retained entries, ~4.1 MB, all with expired deques, zero 429s.** The limiter grows without bound under the very flood it exists to stop.

**N-3 — `/solar/physics?live_data=true` self-defeating budget.** The 4 s compute timeout is smaller than the provider's own ~49 s worst case, so a cold-cache live request reliably 503s while its orphaned thread completes the fetch anyway (N-1). No test exercises the live path.

**N-4 — `output_path` with a U+0000 NUL byte → 500.** `{"output_path":"ab<U+0000>cd.md"}` → `500 Internal Server Error` (uncaught `ValueError` from `Path.resolve()` in `_resolve_benchmark_report_path`, new code). Body is generic; the traceback goes to the server log only. Cosmetic sibling: `"...md"` is accepted as a `.md` file.

**N-5 — Filesystem paths in responses.** `reportPath` and the 400 detail (`"must resolve under /tmp/.../throwaway/my-notes"`) return absolute paths; `/nearby-systems` returns `catalog_path`; `/solar/realtime/aia-tile` returns `f"AIA tile unavailable: {exc}"`. Info-only, low.

## Posture note (stated once)

This is a locally-run scientific sim: no auth by default (`SOLAR_PHYSICS_API_KEYS` = empty set, so `_require_optional_solar_api_key` is a no-op), `uvicorn.run(host="0.0.0.0", port=8042)` at `server.py:1672`, and the new throttles cover only `/solar/physics` + `/solar/realtime/aia-tile`. `/benchmark/accuracy/report` (writes files), `/solar/realtime` (outbound amplifier), `/benchmark/accuracy`, `/trajectory/*`, `/mission/plan` and `/nearby-systems` have no rate limit. The asymmetry is the story: the read-only physics endpoint got auth hooks, a rate limit, a concurrency guard and a timeout; the endpoint that **deletes the user's notes** got nothing.

**Ranked by the stated criteria:** destroy data → §2 (High). Pin the machine → N-1 (High), N-2 (Medium). Amplify outbound traffic → §4 `force_refresh` + jd-herd (Medium). Correctness → jd-agnostic cache and zero-confidence blending both silently return wrong physics (Medium).

Artifacts: `out/SRV/sf_test.py` (harness), `out/SRV/server.log`, `out/SRV/throwaway/` (all writes landed here).
