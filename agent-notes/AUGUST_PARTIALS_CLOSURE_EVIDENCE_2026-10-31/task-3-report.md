# Task 3 historical implementation report

This readable archival copy preserves the implementation report's claims and
status at the time it was written. Independent review was pending in that report;
see `review-runtime-delivery.md` for subsequent review. These are historical
implementation checks, not final integrated acceptance results.

## Commits and changes

| Finding | Commit | Change |
|---|---|---|
| F-022 | `fef6c5b` | Worker lifecycle ownership and bounded recovery |
| F-023 | `640bf15` | Close-focus labels and background stars |
| F-028 | `08a6d8e` | Hidden Kuiper work and seeded populations |
| F-030 | `692457c` | Runtime ownership ADR |

F-022 extracts a lifecycle-owned controller from main. It uses a 5-second
initialization deadline, a 2-second tick deadline and at most two lifetime
restarts with 500/1000 ms backoff. Replies must match the requested sequence
and JD, satisfy Float64/availability validation and avoid nonfinite coordinates.
Errors, decoding failures and disposal retire the worker and timers while local
propagation remains current. The controller's absence supplied the initial red
case; six controller tests and 31 related worker/main/lifetime tests passed.

An actual-page Playwright case terminated the first real worker on its first
tick, observed its retirement and replacement, then observed subsequent ticks.
The case passed in 15.2 seconds. An initial software-rendering attempt's
8-second polling window was insufficient for a second rendered frame; only the
test observation window was extended to 30 seconds. No production timing gate
was loosened by that change.

F-023 extracts a 40 CSS-pixel sprite-plane label policy with body-radius plus
pixel clearance and screen-up offset. Stars use a direction-only view transform
and far-depth projection, with neither depth writes nor frustum culling. Main
owns geometry and material disposal. Seven numerical cases cover close/distant
scales and Z-up; 14 related tests passed. An actual WebGL pixel case found
identical counts of more than 100 lit stars at far planes 20000 and 0.45, and a
black foreground plane occluded all of them. The case passed in 391 ms.

F-028 suppresses propagation when primary, companion or ancestor visibility
hides the population, without advancing the last published JD. Reveal computes
the current JD once. The backend uses seed 137 by default, validates unsigned
32-bit seeds and produces deterministic repeated activations. Frontend metadata
explicitly calls these synthetic orbit candidates; `ResonanceCandidate` retains
a numeric compatibility alias. The hidden-600-epoch and seed tests failed before
the repair. Ten frontend and 54 native backend tests then passed. The existing
active/test-particle physics oracle now uses a constructor seed instead of
monkeypatching the RNG.

F-030 adds the current composition/ownership ADR and a historical-log header.
No dormant UI was activated.

## Verification scope at handoff

Strict source TypeScript checks passed after each code area. Full integration
gates were still running after the catalog and solar merges when the original
report was written. The plan is
`docs/plans/2026-10-31-close-august-partials.md`; the evidence directory README
distinguishes later final runs from these historical checks.
