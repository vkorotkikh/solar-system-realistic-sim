# R3/R4 Verification — Analysis and Synthesis

**Under test:** `fix/r3-r4-pfss-dos-and-test-gap` @ `a6f1dba` (6 commits on `origin/sun-focus` = `7baa015`)
**Method:** four independent agents instructed to *refute* (all 4 completed, 0 errors, 256 tool calls), logging incrementally to
[`R3R4_VERIFICATION_LOG_2026-08-25.md`](R3R4_VERIFICATION_LOG_2026-08-25.md) (42 timestamped entries)
**Date:** 2026-08-25

---

## Verdict

> **Do not land this branch as-is.** Every *integration* claim made for it is exactly true, and the
> single-flight mechanics are correct. But the branch **does not achieve its own stated purpose**:
> R3 was supposed to close an unauthenticated CPU DoS on `/solar/physics`, and it does not — it
> converts "everyone gets slow" into "everyone gets 503", which is still denial of service. And the
> R4 tests written to prevent this class of regression **do not bite**: a mutation test reintroduced
> the exact over-admission bug and the suite still reported 8 passed.

Two of the three headline problems are in code I wrote *while fixing* earlier problems on this same
branch. That is the finding worth internalising: each round of self-review caught something real, and
each round also shipped something new. Independent verification was not redundant.

---

## What held up

These were checked and are exactly as claimed:

| Claim | Result |
|---|---|
| pytest 80 (`fd793f4`) → 94 (`7baa015`) → 102 (`a6f1dba`) | ✅ exact, with the identical unrelated `ri_ias15` REBOUND-5 failure at all three revs |
| tsc 344 → 345 | ✅ exact; the +1 is precisely the new `vitest` TS2307 in `catalog.accuracy.test.ts` |
| Over-admission fix (`5d0e4b7`) works | ✅ peak **10-vs-2 before**, **2-vs-2 after** (agent measured a worse "before" than my 6) |
| Semaphore released exactly once on normal paths | ✅ no double release |
| Rate-limit identity map bounded (`a6f1dba`) | ✅ exactly 4096 = cap; genuine repeat caller still 429s on request 37 of 36 |
| Response payload unchanged pre/post R3 | ✅ byte-identical for identical params |
| Single-flight mechanics (checks 1–4) | ✅ 8 threads/1 key → **1** compute; lock never held across compute (0.2 ms wait vs 10.8 s compute); no `_inflight` leak; leader exception re-raised to all followers, key not poisoned |
| Horizons fixtures genuine | ✅ reproduced to **< 1 mm** |
| Branch topology & hygiene | ✅ R1 merged (0/0), R2 2-ahead/2-behind, R3R4 6-ahead/0-behind; file sets disjoint; `git merge 6f385e1` onto `a6f1dba` is clean; other tool's six files untouched; no stray worktrees |
| R3 acceptance NOT met | ✅ my own negative finding independently confirmed |

---

## Critical — R3 does not close the DoS (but the cause is GIL collapse, not slow computes)

> **Read this section as corrected.** Both agents' first latency measurements were taken while other
> agents' abandoned computes were still draining, and both later withdrew them. The clean numbers are
> below. My original "~5 s cold ultra" comment is **~2× optimistic, not 4.6–8.6× wrong**, and the
> claim "`ultra` can never succeed" is **withdrawn** — at concurrency 1 it always succeeds.

**Clean single-request cold latency, idle box** (`AGENT-B` re-measurement):

| preset | cold `_compute` |
|---|---|
| preview | 1.26 s |
| operational *(default)* | 3.95 s |
| high | 3.13 s |
| ultra | 10.49 s |

A sweep of `ultra` across the whole permitted `jd` window (10 points, MIN → MAX) gives min 4.98 s,
median 8.19 s, max 10.97 s — **0 of 10 over the 30 s timeout**.

**The real defect is what concurrency does to that.** The computes are GIL-bound pure Python
(`trace_field_lines`, `compute_wsa_velocity_map`), so they do not merely fail to parallelise — they
collapse superlinearly:

| concurrent `operational` computes | per-request latency |
|---|---|
| 1 | 4.4 s |
| 2 | 11.7 s each — **2.7×** |
| 3 | 15.6–17.4 s — **4.0×** |
| 4 | 130–133 s each — **30× collapse** |

So the semaphore's own limit of 2 is what pushes requests toward the timeout, and beyond it the box
falls off a cliff.

**The lockout is real and remains the headline.** Under shipped defaults, 40 concurrent distinct-`jd`
`ultra` requests yield `{503: 38, 200: 2}`, and while the admitted computes hold their permits
everything else is shed — *including requests whose result is already cached and cost nothing*.
That is still denial of service; only its flavour changed from "everyone slow" to "everyone 503".
(The specific "70.6 s" lockout figure was measured under the contaminated conditions above, so treat
the duration as timing-dependent; the mechanism is not.)

The two failure modes remain two sides of one coin: release the permit on timeout → **unbounded CPU**
(the bug I fixed); hold it → **lockout** (the bug that replaced it). No semaphore *setting* resolves
that — but, contrary to what I concluded, a change of *executor* does.

---

## High — SF-4 is not fixed; the Layer 1 commit message is false

The new cache key is `(carrington_rotation, n_lines, lmax, activity_bucket)` — it **omits `jd`** — but
`_compute` seeds the magnetogram from the raw `jd`:

```python
# pfss_magnetogram.py:238
rng = np.random.RandomState(int(jd * 100) % 99991)
```

So the key and the payload depend on **different inputs**. A Carrington rotation is 27.27 days, and
`int(jd*100)` changes every 14 minutes, so ~2,727 distinct magnetograms share one cache entry.

**Reproduced directly on the shipped fix** (`fix/r3-r4-pfss-dos-and-test-gap`):

```
JD0=2461000.5 (CR 2304)   JD1=2461007.5 (CR 2304)
key(JD0) == key(JD1) == (2304, 40, 9, 10)      <- same key
different magnetogram seed: True                <- different physics

IDENTICAL request jd=2461000.5:
  served alone                      -> open_line_count = 20   (carrington=2304)
  served after a jd=2461007.5 request -> open_line_count = 17   (carrington=2304)
  got the OTHER jd's cached object: True
```

An identical request returns a **different answer depending on call order**, and both responses are
labelled `carrington_rotation=2304`, so a client cannot detect the substitution. That is precisely
SF-4 — the bug commit `4cf940b` claims to fix. Its message asserts "an entry is reused only for a
genuinely identical request"; **that is false as written.** What the commit actually fixed was the
*fidelity* dimension; it left the `jd` dimension, which carries the larger error: the within-rotation
error is **relRMS(Br) ≈ 1.06 — 4.5× the 0.23 activity error the fix went to the trouble of bucketing
at 5%.** The key is fine-grained in the cheap dimension and coarse in the expensive one.

A second-order consequence: `sample_state` builds the Parker spiral from the cached WSA result while
every other field is computed for the requested `jd`, so one response can mix PFSS/WSA for `jd=Y` with
everything else for `jd=X`.

---

## High — the R4 tests do not bite

This is the most serious finding, because R4's entire purpose was to make regressions catchable.

- **Mutation test:** the over-admission regression was reintroduced into `server.py` and
  `test_concurrency_permit_is_held_until_the_work_actually_finishes` **still passed** — 8 passed on the
  mutant. The test is three substring greps plus a self-test of a *locally re-implemented* correct
  pattern; it never exercises the shipped endpoint. It is precisely the tautology
  `TESTING_NUMERICS.md` forbids, in the file written to enforce that rule.
- **0 of 8** Python tests fail on `7baa015` for a *behavioural* reason. Six fail with `AttributeError`
  on a `server.<CONST>` name (weak evidence — absence of a constant, not wrong behaviour), and the two
  that do run real behaviour **pass on the unfixed code** — including the SF-4 determinism test the
  file exists for. SF-4 *is* reproducible pre-R3 (`high` returns `3171417a` or `4d0864c6` depending on
  call order); a one-line-different assertion would catch it.
- **`catalog.accuracy.test.ts` validates exactly one point** (`elapsedDays = 0`). My "the R2 merge is
  invisible to it" claim is true — and *that is the defect*: R2 moves moons by up to **1,239,913 km**
  and the test cannot see it. Both assertions are epoch-fragile: the Moon "control" reads **66.70 %**
  at +1 year against a 5 % budget, and the tripwire's Io reads **0.3439** at +1 year against a `> 0.5`
  threshold.
- **Titan is dead fixture data.** It sits in `HORIZONS_MOONS` asserted by nothing — not in the control
  group, not in `SF6_BROKEN`. Its err/r is **0.4466, below the tripwire's `> 0.5`**. Had it been
  included the tripwire would fail today, which means my 0.5 threshold was fitted to the five moons
  that happen to clear it, with the counter-example carried silently. (Also: Triton is 1.776, not the
  "~1.97" my header claims.)
- **The SF-6 tripwire is a trap.** A *partial* fix (orbit-normal sign only) turns 1 of 5 red while 4
  stay green — it goes red on **progress**, from a test whose name says "remove when SF-6 is fixed"
  and whose header says to delete the block. The likeliest response is deletion, not completion.
- **`TESTING_NUMERICS.md`: 3 of its 6 rules are broken by tests shipped in the same commit series.**
- **`orbitMath.accuracy.test.ts` budgets are fitted to its 4 epochs**, not "1.6× the worst over
  1800–2150" as documented.

---

## Medium / low — defects in the hardening itself

| # | Defect | Note |
|---|---|---|
| 1 | **Permanent permit leak** if `run_in_executor` raises synchronously — the submit is unguarded, so `add_done_callback` is never attached and the permit is never released | in my `5d0e4b7` fix |
| 2 | **Rate limit (36/60 s) is below this app's own frontend poll rate** (up to 66/60 s) — legitimate first-party traffic gets 429 | ported from `main` |
| 3 | **Rate limit is 100 % bypassable** — `X-Forwarded-For` is trusted unconditionally with no trusted-proxy gate | ported from `main` |
| 4 | **Single-flight follower `TimeoutError` escapes as a raw 500** (unmapped exception) | Layer 1 |
| 5 | Follower **fallback bypasses single-flight and never caches** its result — 9/9 computes when forced; 2.38× at `max_entries=1` but **1.00× at the shipped default of 12**, so latent | Layer 1 |
| 6 | Leader killed by `BaseException` leaves the holder empty; every follower then recomputes | low |
| 7 | Rate-limiter eviction sorts the whole map under the lock (515× lock-hold amplification in-process) — **agent later downgraded this**: not visible end-to-end | low |
| 7b | `DEFAULT_INFLIGHT_WAIT_S` (30 s) **equals** `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` (30 s), so the follower `TimeoutError` path is unreachable over HTTP — the endpoint always times out first | design smell |
| 8 | 5 % activity bucketing is defensible alone (worst same-bucket pair: relRMS(Br) 0.23, WSA −12.2 km/s) but indefensible beside the `jd` hole | — |

---

## What I got wrong

Stated plainly, because the pattern matters more than the individual errors:

1. **"~5 s cold ultra compute (measured)"** — wrong by 4.6–8.6×; the real figure is 23–43 s. This is
   now a code comment on the branch justifying a timeout value, so it is actively misleading.
2. **"Layers 1–2 deliver what they can"** — too generous. They do not close the DoS, which was the point.
3. **The R4 tests "would have caught R1 and R2"** — refuted for 3 of the 4 defects they name.
4. **"The moon test is immune to the R2 merge"** — true, and I reported it as reassurance when it is
   evidence the test is blind.

The through-line: I repeatedly validated at a single point (one epoch, one measurement, one fidelity)
and generalised. That is the same error that made R2 wrong twice.

---

## Recommendation

**Do not land `a6f1dba`.** In priority order:

1. **Move the compute to a process — Layer 3 is NOT required for the latency bar.** I concluded the
   50 ms p95 target was "unreachable in-process"; that was **refuted by measurement**. Swapping the
   `ThreadPoolExecutor` for a `ProcessPoolExecutor` (forkserver, ~30 lines) at 40 concurrent `ultra`:

   | arm | idle p95 | 40 concurrent |
   |---|---|---|
   | ThreadPool *(as shipped)* | 1.6 ms | **73.6 ms** — fails |
   | ProcessPool | 1.6 ms | **1.8 ms** — passes |

   Warm-up is 0.24 s once; result pickling is a non-issue (0.27–0.76 MB, 26–72 ms against a 1–10 s
   compute).

   **But it is not a drop-in.** The PFSS cache and memoization live *inside the worker*, so a naive
   swap loses every warm hit: ultra warm goes 0.083 s → 6.24 s, a **75× regression**, and the frontend
   polls this endpoint every 900 ms living almost entirely on warm hits. Layer 1's single-flight
   coalescing is lost across processes too. Viable variants, cheapest first:
   **(a)** one process worker with the concurrency limit set to 1 — cache preserved, `/health` fully
   isolated, computes serialised; **(b)** route by `hash(cache_key) % n_workers` so a rotation always
   lands on the same process. Layer 3 (precompute per rotation) remains the better long-run answer,
   but it is no longer the *only* one.
2. **Fix the timeout comment** to match measured reality (~10 s cold ultra, not ~5 s). The 30 s value
   itself is defensible at concurrency 1; what needs attention is the GIL collapse above.
3. **Make the cache key and the payload depend on the same inputs** — put a quantised `jd`
   (e.g. `int(jd*100)`, matching the seed granularity) in the key, or quantise the `jd` passed to
   `_compute`, or seed the magnetogram from `cr` instead of `jd`. Any of the three closes SF-4; the
   current split does not. Correct the `4cf940b` commit message's claim while doing so.
   Also make `DEFAULT_INFLIGHT_WAIT_S` strictly less than the endpoint timeout.
   *Note for (1):* with GIL-bound work, `max_workers=2` buys no throughput and doubles latency, which
   is what pushes both concurrent requests past the timeout — `max_workers=1` is strictly better until
   the work leaves the process.
4. **Rewrite the R4 tests so they fail on the mutant.** Specifically: drive the real endpoint rather
   than grepping source; assert SF-4 via the order-dependent payload difference that is reproducible
   pre-R3; test the moon/planet accuracy at several epochs, not one; either assert Titan or remove it.
5. **Replace the SF-6 tripwire** with an assertion that goes green on a fix and red on regression —
   e.g. assert the current error *bounds* with a comment pointing at the intended budget, rather than
   asserting the bug persists.
6. Guard the executor submit; map follower `TimeoutError` to 503; gate `X-Forwarded-For` behind a
   trusted-proxy setting; raise the rate limit above the app's own poll rate.

Items 2, 6 are small. Item 1 is a design decision that should be made deliberately rather than
inherited from a deferred plan step.

---

## Provenance

Raw incremental findings, with commands and full numbers, are in
[`R3R4_VERIFICATION_LOG_2026-08-25.md`](R3R4_VERIFICATION_LOG_2026-08-25.md) — 42 entries from
`AGENT-A` (PFSS cache/single-flight), `AGENT-B` (endpoint bounds/over-admission), `AGENT-C` (R4 tests),
`AGENT-D` (integration claims/rate limiter/hygiene). Agents logged as they worked, so the record is
complete even where an agent did not return a final structured result.
