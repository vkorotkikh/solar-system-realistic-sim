# Task 5 implementation report for F-029 retained APIs

Reconstructed implementation report, archived on 2026-11-01. Historical test
results are attributed to the independent review; final validation remains
separate. See README.md for commit mapping and evidence status.

Reconstructed on 2026-11-01 from the eight integrated commits below and the
existing independent retained-API review. The original implementation turn was
stopped before its report was written. This report records implemented behavior
and attributed historical evidence; it does not claim a new test run or final
acceptance of the integrated branch.

Implementation source: `/home/nomad/ai/projects/worktrees/solar-partials-apis-20261031`.
Initial reviewed source range: `40a9830..93e5064`. Final source implementation:
`58ee0e1`. Integrated implementation HEAD: `8b4d320`.

## Commits

| Source commit | Integrated commit | Change |
|---|---|---|
| `9d455bb` | `e8387d8` | Retain complete mixed named and unnamed TLE records |
| `5cdab12` | `b026c21` | Bound worker interpolation by orbital period and display epoch |
| `ce24b9a` | `3ea320d` | Validate optional DOM capabilities before binding side effects |
| `93e5064` | `581b162` | Add orbital-elements and TDB seek contracts to SimulationClient |
| `a2f95e6` | `eb7977a` | Fence incoming state against reentrant seek observers |
| `37140fb` | `7e49b5f` | Deduplicate TLE records by validated catalog identity |
| `b9ebcc0` | `7abcce1` | Reject malformed snapshots before any marker mutation |
| `58ee0e1` | `8b4d320` | Commit handshake readiness and incoming state before observers |

## Implemented behavior

The TLE iterator consumes each complete two-line or named three-line record once,
including a final unnamed pair. It skips orphan lines and incomplete trailing
records without dropping a following valid pair. Literal-input regressions cover
one and four unnamed records, mixed records, incomplete tails and orphan recovery.
The review follow-up separates display names from identity: both TLE lines must
carry matching catalog identifiers, and satellite IDs use `sat-norad-<catalogId>`.
An initialization-level test merges stations and GEO feeds with distinct unnamed
records; additional tests cover equal display names and mismatched identifiers.

Worker snapshot lead and accepted interpolation span are capped at one 256th of
the shortest finite positive period in the batch. Snapshots must cover the
requested display JD and match the current J2 setting and satellite count.
Before any marker write, the consumer checks finite epochs, complete Float32
endpoint lengths and every endpoint coordinate. Invalid, stale or out-of-range
snapshots return false so `update()` uses direct propagation at the requested JD.
The worker response now carries its J2 setting. Regression cases include forward
and backward lead, an obsolete multi-orbit chord, mode changes and a corrupt
later record that must leave all existing markers untouched before fallback.

The retained DOM binder declares feature toggles optional and the remote
connect/backend/status controls an all-or-none group. It checks all required and
supplied interactive elements, status elements and quick-view bindings before
installing listeners. The higher-level input handler performs the same preflight
before binding time or planner controllers. Capability tests exercise minimal
bindings, complete remote controls and early failure without controller effects.

`SimulationClient` supports finite TDB seeks and orbital-elements requests only
on a ready transport. It validates the required finite AU/degree orbital fields
and optional true anomaly and period fields, exposes confirmed JD and element
callbacks/caches, and clears epoch-dependent caches after a successful seek.
A seek send is not treated as server acknowledgement; the confirmed JD changes
only with accepted server state. Session replacement, disconnect and stale
timeout clear auxiliary caches. Socket and epoch-operation checks prevent
observer-triggered seeks or session changes from restoring obsolete caches.
The final commit publishes handshake readiness and incoming state before calling
observers, allowing an initial JD observer to send a seek immediately.

These commits change retained APIs and their tests, without activating them in
the default page. Ownership and activation requirements remain in
`docs/adr/0006-runtime-composition-and-retained-apis.md` and the supported product
policies.

## Historical verification and review

The initial independent review at source `93e5064` reports **36 tests passed in
four files**: `simulationClient.test.ts`, `uiBindings.capabilities.test.ts`,
`satelliteSystem.tle.test.ts`, and `satelliteSystem.interpolation.test.ts`.
That passing test result did not establish closure: independent production-code
probes found reentrant seek cache restoration, cross-feed unnamed identity loss,
and malformed snapshot acceptance. Those findings led to the three follow-up
commits ending at source `b9ebcc0` / integrated `7abcce1`.

The scoped rereview replayed all three original probes and marked those findings
addressed. The corrupt two-record snapshot left its sentinel buffer unchanged,
then direct propagation produced finite positions. Actual multi-feed
initialization retained both catalog identities. The reentrant state observer
left invalidated caches empty until a new server state arrived.

During that rereview the worktree contained a new failing handshake-order
regression: **38 passed and 1 failed** was the reported evolving-tree result,
not the clean `b9ebcc0` test inventory. The final handshake commit adds the
corresponding readiness-order repair and regression. No passing run at
`58ee0e1` / `8b4d320` is inferred from the presence of that test. The coordinator
owns the final focused rereview, full integration gates and closure verdict.

No tests were run to reconstruct this report. The reviewed implementation and
regression definitions were read directly from Git; historical execution claims
above are attributed to `review-retained-apis.md` as it existed during this
reconstruction. That review remains owned by its reviewer and is not frozen by
this report.

## Scientific and acceptance limits

Satellite propagation remains mean Kepler elements with optional secular J2;
this work adds no SGP4 implementation or observational accuracy claim. The
7000 km circular analytic fixture checks interpolation error below 0.55 km
within the period bound, consistent with a midpoint chord error of about
0.527 km. That is a circular-orbit example, not a universal eccentric-orbit
error bound. Parser retention and identity tests do not certify orbital accuracy.
No browser activation of the dormant UI or new physical-model acceptance is
claimed. Final F-029 closure requires the independently recorded final review.
