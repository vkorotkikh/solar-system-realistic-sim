# F-02 Verification Report — `ri_ias15` guard in `rebound_nbody.py`

> **Historical snapshot — not current branch status.** This report records a pinned checkout tested on 2026-08-24; later REBOUND initialization and WebSocket changes are outside its scope.

## Headline

**The crash is genuinely fixed. The "silent downgrade" hypothesis is REFUTED — I tried hard to prove precision was lost and could not: results are bit-identical.** But the fix is a dead branch that satisfies its own intent only by coincidence, and the masking test is 100% intact.

Overall verdict: **FIXED (functionally) / NOT FIXED (as engineering)** — split into three findings below.

---

## Finding 1 — The WS crash: **FIXED**

`backend/sim/rebound_nbody.py:70-77`
```python
if self._integrator == "ias15":
    ri_ias15 = getattr(self.sim, "ri_ias15", None)
    if ri_ias15 is not None:
        try:
            ri_ias15.min_dt = 0  # let integrator choose
            ri_ias15.epsilon = 1e-9
        except Exception:
            pass
```

**Reproduction** (server started from pinned copy on 8051):
```bash
cd <pinned>/backend && <venv>/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8051
<venv>/bin/python -u <out>/F02/ws_seek.py
```

**Actual** — both default and explicit `?integrator=ias15` connect, stream, and integrate correctly. Never 1011:
```
===== [A: default (no integrator param)] ws://127.0.0.1:8051/ws/sim =====
  connected: integrator='ias15' fidelity='high' engine='rebound' warnings=[]
  t=0 (J2000)   : jd=2451545.0000 earth_r=0.981872569AU earth_lon= 100.819deg jup_r=4.959902AU
  +0.25 yr      : jd=2451636.3125 earth_r=1.006744643AU earth_lon= 192.488deg jup_r=4.974717AU
  +0.50 yr      : jd=2451727.6250 earth_r=1.019584350AU earth_lon= 280.169deg jup_r=4.993738AU
  +1.00 yr      : jd=2451910.2500 earth_r=0.979315478AU earth_lon= 100.688deg jup_r=5.042646AU
  [A] closed cleanly, never 1011
```
Physics is sound: Earth's radius oscillates 0.979–1.020 AU (matches e=0.0167 → perihelion 0.983 / aphelion 1.017), and heliocentric longitude returns to 100.7° after exactly 1 yr (full 360° revolution). Jupiter moves 4.96→5.04 AU, correct for its 11.86 yr period.

Baseline confirmed still real — the pre-fix line under rebound 5.1.1:
```
AttributeError: 'Simulation' object has no attribute 'ri_ias15'
```

**Severity: resolved** (was High/Blocker).

---

## Finding 2 — Silent downgrade? **REFUTED. No precision lost.**

This was the critical question, and the answer is the opposite of what the hypothesis predicted.

**(a) rebound 5.1.1's IAS15 defaults are exactly the intended values.** In rebound 5.x `sim.integrator` is an `IntegratorConfiguration` with ctypes field-descriptor access:
```
repr(sim.integrator) -> name=ias15, epsilon=1e-09, min_dt=0.0, adaptive_mode=PRS23, ...
```
The library docstring confirms: *"epsilon … The default value is 1e-9"*, *"min_dt … The default value is 0"*. The code wanted `epsilon=1e-9, min_dt=0`. It gets exactly that, from the defaults.

**(b) Measured consequence — bit-identical.** Ran the real 41-body catalog three ways (`numeric.py`):

| mode | eff_epsilon | dE@1yr | dE@100yr | steps@100yr | wall@100yr |
|---|---|---|---|---|---|
| as_shipped (guard no-ops) | 1e-09 | 5.6717e-15 | 3.7160e-15 | 15958 | 3.655s |
| explicit 1e-9 via rebound-5 API | 1e-09 | 5.6717e-15 | 3.7160e-15 | 15958 | 3.895s |
| tight 1e-12 | 1e-12 | 5.4761e-15 | 3.7160e-15 | 42819 | 7.457s |

```
-- t = 100.0 yr --
  as_shipped vs explicit_1e-9 : max|dr| = 0.000000e+00 AU (body=None) BIT-IDENTICAL
  as_shipped vs tight_1e-12   : max|dr| = 3.842351e-12 AU (body=venus)
      earth   |dr| vs explicit_1e-9 : 0.000000e+00 AU  (0.000000e+00 km)
```
Precision actually lost: **exactly zero**. Even a 1000× tighter tolerance buys nothing (3.7160e-15 at 100 yr either way — already at the floating-point roundoff floor) while costing 2.7× the steps.

**(c) The correct rebound-5 API does exist** and is `sim.integrator.epsilon` / `sim.integrator.min_dt` (verified settable: `s.integrator.epsilon = 1e-12` → reads back `1e-12`). Rebound's own test suite uses this form (`sim.integrator.adaptive_mode = "individual"`). The fix did not use it — but since the defaults already match the intent, no capability was lost.

**Refutation attempt (this section IS the refutation):** I set out to prove the fix silently downgrades accuracy. I compared as-shipped against the intent applied through the correct rebound-5 API on the real catalog over 1 yr and 100 yr. `max|dr| = 0.0` exactly and identical step counts — the runs are the same computation. The downgrade hypothesis **fails**. I also checked `sim.copy()` (used by the checkpoint path) preserves integrator config: it does (`epsilon=1e-12` survives the copy).

**Severity: Low** (was projected High). Correctness is intact; only maintainability is affected.

---

## Finding 3 — Dead branch + `except Exception: pass`: **PARTIALLY FIXED**

`backend/sim/rebound_nbody.py:71-72` — under rebound 5.1.1 `getattr(sim,'ri_ias15',None)` is **always `None`**, so the body **never executes**. Verified:
```
getattr(sim,'ri_ias15',None) -> None  => guard body executes: False
epsilon actually in effect  = 1e-09   (from library default, not from this code)
```

**Root cause:** the fix suppresses the `AttributeError` by guarding a rebound-4 attribute name instead of migrating to the rebound-5 `sim.integrator.<field>` API, leaving a permanently-false branch whose stated intent is satisfied only by coincidence with library defaults.

Concrete latent risk — if a maintainer ever tightens the tolerance by editing the guard body, **the edit has no effect**:
```
### 4. DEAD BRANCH RISK: if intent changed to a tighter epsilon, would it apply?
   epsilon after init = 1e-09 (would still be 1e-9; edit has NO effect)
```

On `except Exception: pass`: it is **unreachable** under 5.1.1 (the `is not None` check short-circuits first), so it masks nothing today. On any rebound version where `ri_ias15` *does* exist, it would swallow a genuine tolerance-set failure with no log or warning. It is latent, not active, risk.

**Severity: Medium** — no current numerical impact, but the code lies about what it does and silently ignores future edits.

---

## Finding 4 — Does `/health` still lie? **No — now justified**

```
$ curl -s http://127.0.0.1:8051/health
{"status":"ok","engines":{"rebound":{"available":true,"fidelity":"high"},...}}
$ curl -s http://127.0.0.1:8051/info
{...,"integrators":["ias15","whfast","mercurius"],"default_integrator":"ias15",...}
```
`_rebound_available()` (`backend/server.py`) only checks import-ability, never constructs an IAS15 sim — so it *would* still lie if init were broken. But since the default `ias15` path now genuinely works end-to-end (Finding 1) and runs at full intended precision (Finding 2), `available: true, fidelity: high` is now **accurate**. The weak probe remains a latent reporting gap, not an active falsehood. `whfast` (dE@1yr 2.1339e-12) and `mercurius` (1.8134e-10) also work.

**Severity: Low.**

---

## Finding 5 — Is the mocking test still masking? **YES — FIX MASKS NOTHING, BUT THE TEST STILL DOES**

`backend/tests/test_seek_optimizations.py:37` — the fake IAS15 is **fully intact**:
```python
self.ri_ias15 = _FakeIAS15()
```
plus `:60-62` in `copy()`. The monkeypatch at `:98` (`monkeypatch.setattr(rebound_nbody, "rebound", _FakeReboundModule())`) means the only test touching `REBOUNDEngine(integrator="ias15")` never loads real rebound.

**Definitive proof of masking** — I reverted the fix to the original unguarded code in a scratch copy and reran:
```bash
cp -r <pinned>/backend <out>/F02/revert   # then restore `self.sim.ri_ias15.min_dt = 0`
cd <out>/F02/revert && <venv>/bin/python -m pytest tests/test_seek_optimizations.py -q
```
```
############ SUITE ON REVERTED (PRE-FIX, KNOWN-BROKEN) BACKEND ############
..                                                                       [100%]
2 passed in 0.15s
```
Full-suite comparison, fixed vs. reverted-broken — **identical**:
```
reverted (broken): 6 failed, 47 passed, 1 warning in 2.65s
pinned  (fixed):   6 failed, 47 passed, 1 warning in 2.68s
```
(The 6 failures are `nearby_systems` data-path artifacts of copying `backend/` out of the repo root — present in both, unrelated to F-02.)

**No test opens a real `/ws/sim`** (`grep -rn "websocket_connect" backend/tests/` → nothing; the three files using `TestClient` only hit HTTP routes). **No test constructs a real `rebound.Simulation`** (`grep -rn "rebound.Simulation" backend/tests/` → nothing).

**Root cause:** the sole IAS15 test substitutes a fake rebound module that *does* have `ri_ias15`, so it exercises an API surface the real library does not have.

**Severity: High** — the suite would not catch a re-regression of this exact defect, and gave false green over it once already.

---

## What I ran vs. inferred

**Ran:** live backend on 8051 (killed; port verified free), two WS clients (`ws_probe.py`, `ws_seek.py`), the 3-mode numerical comparison on the real 41-body catalog (`numeric.py`), 7 API/behavior checks (`checks.py`), and the full pytest suite on both fixed and deliberately-reverted copies. **Inferred:** nothing load-bearing. **Blocked:** nothing.

Artifacts (scripts + raw output) in `/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/61f0923f-ccb6-49cc-ba58-5791c93163f9/scratchpad/out/F02/`.

## Recommended remediation

1. Replace the dead branch with the real rebound-5 API and make failure loud:
   ```python
   if self._integrator == "ias15":
       self.sim.integrator.epsilon = 1e-9
       self.sim.integrator.min_dt = 0
   ```
   (no try/except — a failure here should surface, and this is now assertable)
2. Delete `_FakeIAS15`/`_FakeSimulation` from `test_seek_optimizations.py` and drive the seek test against a real `rebound.Simulation`, asserting `sim.integrator.epsilon == 1e-9`.
3. Add one smoke test that opens a real `/ws/sim` with `integrator=ias15` via `TestClient.websocket_connect` and asserts the first frame is `connected`, not `error`.
4. Make `_rebound_available()` actually initialize a 2-body IAS15 sim so `/health` cannot report `fidelity: high` over a broken engine.
