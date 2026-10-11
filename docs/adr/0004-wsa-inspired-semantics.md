# ADR 0004: WSA-Inspired Expansion, Availability, and Delivery Semantics

Status: accepted for the scientific-core remediation tranche

## Decision

The repository exposes its empirical wind mapping as `wsa_inspired_v1`. It is
not described as the operational Wang-Sheeley-Arge model and its calibration
status is `unvalidated`. The implementation does not yet contain the complete
Schatten/current-sheet and heliospheric propagation stages or an independent
calibration corpus required to make that claim.

For a field line confirmed `open`, the expansion factor is evaluated from the
signed radial field at its exact shell intersections:

```text
Br(x) = B(x) dot x_hat
fs = (Rsun / Rss)^2 * abs(Br(Rsun)) / abs(Br(Rss))
```

Both boundary fields must be finite and have magnitude greater than the
declared numerical floor. Tangential field magnitude never enters `fs`.
Closed and indeterminate traces, invalid boundary fields, and non-positive or
non-finite ratios remain unavailable (`NaN` in internal arrays).

The versioned visualization relation is:

```text
V [km/s] = 267.5 + 410 / max(1, fs)^0.4
           * (1 - 0.8 * exp(-(theta_b / 0.045 rad)^3))
```

Its output is bounded to `[265, 850] km/s`. Non-finite or out-of-domain inputs
are rejected; they are never coerced into a plausible speed.

`theta_b` is the minimum great-circle distance from an open seed center to the
midpoint of a grid edge separating adjacent, confirmed-open and
confirmed-closed cells. Longitude wraps. An indeterminate cell is neither side
of a boundary. Consequently an all-open, all-closed, neutral, exhausted, or
open/closed map separated only by indeterminate cells has no usable boundary
and produces no WSA-inspired speed.

Source-surface delivery uses nearest-neighbor interpolation only within two
local target-cell diagonals of the equal-area grid. Great-circle distances use
`atan2(|a cross b|, a dot b)`. A missing, malformed, non-finite, or more distant
sample returns `None`; it never returns the historical 380 km/s fallback.

The result publishes:

- nullable `mean_velocity_kms`;
- `valid_fraction`, `indeterminate_fraction`, and source-surface
  `coverage_fraction`;
- model, calibration, units, boundary method, lookup radius, and explicit
  quality reasons.

Parker visualization may use the existing independently named
`empirical_ch_bimodal` fallback where WSA-inspired coverage is absent. Every
arm reports its actual source and WSA availability. A realtime blend is named
as a blend. No empirical fallback is labelled WSA-derived.

## Consequences

Sparse or topologically unresolved maps now return less WSA-inspired data.
This is intentional: availability is evidence, not a value to invent. Internal
maps retain `NaN` for vectorized scientific processing, while serialized public
metadata uses JSON-safe `null` and finite fractions.

The formula remains useful only as a visualization approximation until a
pinned independent reference/calibration tranche supplies a corpus and error
budget. Model-version identity and persistent-artifact invalidation belong to
the subsequent scientific identity/cache work.
