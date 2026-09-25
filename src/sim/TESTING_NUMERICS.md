# Numerical test conventions

A regression in this codebase (secular rates 4.8× worse than the code they
replaced; converted moons ~160° from truth; Kuiper perturbers in radial
free-fall) shipped **through a green test suite**. In every case the tests
asserted the wrong thing.

The rule that would have caught them:

> **A numerical test compares against an external oracle committed to the repo.
> It never re-derives the expected value from the same formula it is testing,
> and it never asserts merely that a value *changed*.**

Concretely:

- **Oracle, not recomputation.** Expected positions/velocities come from JPL
  Horizons vectors committed as fixtures (for example,
  `moonFrames.horizons.test.ts`), with the query recorded so the fixture is
  regenerable. A test that recomputes the code's own
  transform and checks the two agree (see the note atop `catalog.test.ts`) proves
  nothing — it agrees by construction.

- **Budgets, not deltas.** Assert "error < N km", not "output changed". The
  secular-rate regression satisfied "changed" perfectly while being far worse.

- **Multiple epochs.** A propagator validated at one date can be tuned to it.
  Both the secular-rate plan and its first fix passed at a single epoch and were
  wrong across the span. Accuracy tests sweep several epochs (see
  `orbitMath.accuracy.test.ts`).

- **Physical invariants for backend state.** e.g. after `kuiper.activate`, every
  massive perturber must be bound (`e < 0.1`) — unit-agnostic, and it fails loudly
  on any future unit drift (`backend/tests/test_kuiper_velocity_units.py`).

- **A new test must be seen red.** Confirm it fails against the unfixed code
  before relying on it; a test that has only ever been green is not evidence.

- **Controls.** Where a code path can be bypassed (Earth's Moon skips the moon
  frame converter), test it as a control: a failure there indicts the harness,
  not the code under test.
