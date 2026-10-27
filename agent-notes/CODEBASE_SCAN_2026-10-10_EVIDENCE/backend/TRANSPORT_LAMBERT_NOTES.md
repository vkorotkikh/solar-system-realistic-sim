# Supplemental transport/Lambert probes — 2026-10-10

Source snapshots and commit IDs match the main sweep. `probe_transport_lambert.py` ran separately against main and trajectory using the prepared main pinned Python environment. Both relevant source files have identical SHA-256 hashes across those snapshots (recorded in JSON); numerical Lambert results are identical. CI's source tree is identical to main, so findings apply to all three selected branches. Product code is unchanged. Both runs exit 0, meaning observations captured, not scientific acceptance passed.

## Newly reproduced: near-antiparallel Lambert solutions fail independent endpoint closure

**Suggested P1, high confidence, observed; stable ID assigned by root.** This is distinct from the exact-180° capability boundary and is a confirmed part of the broader SCN-045 verification queue.

**Sources:** `backend/trajectory/lambert.py:499–500` reconstructs angle with `acos(dot/(r1*r2))`; `:651–655` computes A using sine of that reconstructed angle; `:723–731` recovers velocities by dividing by small g; `:733–742` returns TOF root certification without independently checking the endpoint of the returned velocity state.

**Independent reference:** Unit-radius prograde circular orbit with the module's own solar mu. Set `r1=[1,0,0]`, `r2=[cos(theta),sin(theta),0]`, `tof=theta/sqrt(mu)`. Exact initial velocity is `[0,sqrt(mu),0]`; exact final velocity is `sqrt(mu)*[-sin(theta),cos(theta),0]`. These non-collinear cases specify a transfer plane. For every returned solution, a separate real REBOUND IAS15 Sun+massless-particle integration starts at r1 with its returned v1 and propagates for the requested TOF. REBOUND uses `G=mu`, Sun mass=1, AU/day units by direct numeric convention. Thus the target closure test does not rely on the Lambert implementation's own f/g or Stumpff machinery.

| Angle | Initial velocity error versus circular truth | Independent endpoint miss | Reported TOF root residual |
|---|---:|---:|---:|
| 179.99° | 0.000051686 m/s | 2.657 km | 1.1394e-10 day |
| 179.999° | 0.00110419 m/s | 56.785 km | 1.1261e-10 day |
| 179.9999° | 0.81308664 m/s | 41,810.837 km | 1.1238e-10 day |
| 179.99999° | 20.37376992 m/s | 1,046,762.558 km | 1.1235e-10 day |
| 179.999999° | 5,101.243152 m/s | 209,061,472.255 km (~1.398 AU) | 1.1238e-10 day |
| 180.000001° | 5,101.243236 m/s | 209,061,485.438 km | 1.1235e-10 day |

Normal-angle controls and additional nearby cases are retained in both JSONs. E.g. 170° has endpoint miss 0.000243 km. The default root tolerance also allows modest endpoint residuals elsewhere (179°: 129.3 km); those are recorded, not conflated with the severe angular-conditioning defect.

**Expected:** Return velocities that independently reach the requested endpoint within a defined accuracy budget, or return a truthful unsupported/ill-conditioned result. A tiny scalar TOF root residual does not certify the recovered velocity.

**Root cause:** `acos` loses relative accuracy in the small deviation from π; sine of that reconstructed angle is inconsistent with the supplied vector cross product, then division by a near-zero g amplifies the error. The source and symmetric observed failure support this diagnosis. No product fix was attempted.

**Closure:** Numerically stable geometry and velocity recovery near antiparallel configurations, explicit supported geometry limits, and independent endpoint/velocity gates on both sides of π. Preserve root residual and bounded-work contracts, but do not treat them as endpoint accuracy certification. Test several radii and tolerances before setting a supported bound.

## Exact 180° remains a capability boundary

At `r1=[1,0,0]`, `r2=[-1,0,0]`, `tof=pi/sqrt(mu)` (~182.628449 days), the current solver returns `None` through the `abs(A)<1e-12` guard. A circular solution exists once a transfer plane is chosen, but collinear position vectors alone do not uniquely select that plane. This observation is **SCN-045 capability evidence**, not a general wrong-solution bug. Explicit support documentation or a plane-selection API would be needed before demanding this case succeed.

## Horizons transport: one stalled read retains shared capacity after callers time out

**Suggested P2 availability residual / documented design tradeoff; not a reopening of old API-wide starvation.** Sources: `backend/mission/ephemeris_service.py:1174–1191` documents the ownership policy; `:1205–1207` obtains the global guard; `:1232–1242` releases it only after actual transport exit; `:1263–1281` stops the caller at its absolute deadline. `HORIZONS_CONCURRENCY_LIMIT` is one.

**Reproducer:** `probe_transport_lambert.py` replaces urllib's urlopen only within its own process with a local response whose first `.read()` waits on an Event. Each caller owns a real separate PlanningContext. Transport deadlines are 50 ms. There is no network traffic. An unconditional finally releases the Event, restores urlopen, and joins transport threads; the fake read also has a one-second fail-safe.

**Observed sequence (timings vary slightly across repeated runs):**

1. First caller stops at ~50 ms with `EphemerisUpstreamTimeout: Horizons state query exceeded its absolute deadline`; fake transport remains in read.
2. Second independent caller stops at ~50 ms with `Horizons transport capacity was unavailable before the request deadline`. Outbound count remains one; no extra stalled worker is created.
3. Release the Event. The first transport exits and returns its permit. Third caller immediately succeeds (`local-body`), and outbound count becomes two.

**Interpretation:** Request budgets contain caller latency and bound lingering transport count correctly. They cannot reclaim the single remote transport slot from an indefinitely trickling read. This can make Horizons-backed uncached work unavailable while the read persists; it does not demonstrate starvation of unrelated API workers, Kepler work, health, or WebSockets. The stub models a blocked operation and does not simulate actual upstream networking or establish how long a real server can keep it open.

**Closure/decision:** Retain this as an explicit bounded-availability tradeoff, or isolate transport behind an owner that can terminate/recycle it on a total deadline while retaining truthful capacity accounting. A replacement gate must prove both prompt recovery after a persistent read and bounded abandoned work. Do not fix it merely by releasing the permit while the old transport is still running.

## Reproduce

```bash
/tmp/solar-sweep-2026-10-10-j1gnowo_/venv-main/bin/python \
  agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/probe_transport_lambert.py \
  /tmp/solar-sweep-2026-10-10-j1gnowo_/main
```

Use the trajectory snapshot as the final argument for the second branch. Retained results: `transport-lambert-main.json`, `transport-lambert-trajectory.json`.
