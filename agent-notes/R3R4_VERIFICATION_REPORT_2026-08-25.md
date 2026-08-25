# R3/R4 Verification — Analysis and Synthesis

**Under test:** `fix/r3-r4-pfss-dos-and-test-gap` @ `a6f1dba` (6 commits on `origin/sun-focus` = `7baa015`)
**Method:** four independent agents instructed to *refute*, logging incrementally to
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

## Critical — R3 does not close the DoS

**Two unauthenticated requests deny `/solar/physics` for 70.6 s**, and requests whose result is
*already cached* are refused along with everything else.

Measured cold latency on an **idle 32-core box** — against my code comment claiming "~5 s (measured)":

| preset | direct `_compute` | full `GET` |
|---|---|---|
| preview | 5.67 s | 8.21 s |
| operational *(endpoint default)* | 16.37 s | 15.62 s |
| high | 36.21 s | 20.35 s |
| ultra | 43.04 s | 23.18 s |

**My "~5 s" figure was wrong by 4.6–8.6×.** Two agents measured this independently and agree.

The mechanism is a genuine architectural bind:

- The computes are **GIL-bound pure Python** (`trace_field_lines`, `compute_wsa_velocity_map`), so the
  executor's two threads buy **no parallelism, only 2× latency**. Two concurrent cold `ultra`
  requests both exceed the 30 s timeout and 503.
- My over-admission fix (correctly) holds each permit until the work truly ends. So the two abandoned
  computes keep both permits for their full duration, and everything else — *including a free cache
  hit* — is shed instantly with 503.

So the two failure modes are two sides of one coin: release the permit on timeout and you get
**unbounded CPU** (the bug I fixed); hold it and you get **lockout** (the bug that replaced it).
Neither is acceptable, and no semaphore setting resolves it.

**`ultra` can never succeed at all**: cold ultra is 43–55 s against a 30 s timeout.

**Conclusion: Layer 3 is not optional.** Getting PFSS off the request path (precompute per Carrington
rotation, serve only from cache) or into a separate *process* is the only thing that fixes this. My
earlier framing — "Layers 1–2 deliver what they can" — was too generous: what they deliver does not
include closing the DoS.

---

## High — SF-4 is not actually fixed

The new cache key is `(carrington_rotation, n_lines, lmax, activity_bucket)`. It **omits `jd`**.
A Carrington rotation is 27.27 days, so every `jd` inside one rotation shares an entry.

The agent quantified the inconsistency: **the error introduced by ignoring `jd` within a rotation is
4.5× larger than the activity error the fix went to the trouble of bucketing at 5%.** Bucketing
activity while ignoring a bigger term is incoherent — the key is finer in the cheap dimension and
coarse in the expensive one.

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

1. **Decide the PFSS architecture before more patching.** Layers 1–2 cannot close the DoS. Either do
   Layer 3 (precompute per rotation, request path serves cache only, with an explicit
   `pfss_stale` flag) or move the compute to a `ProcessPoolExecutor`. Everything else here is
   secondary to that choice.
2. **Fix the timeout comment and value** to match measured reality, and decide what `ultra` means if a
   cold compute is 43 s.
3. **Add `jd` to the cache key** (or justify the rotation-granularity in writing, with the measured
   within-rotation error next to the activity error).
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
