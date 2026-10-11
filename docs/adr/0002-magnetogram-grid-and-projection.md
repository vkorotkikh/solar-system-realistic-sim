# ADR 0002: Explicit magnetogram geometry and stable projection

Status: Accepted

## Problem

The previous projector interpreted all rows as uniformly spaced colatitude.
A unit axial dipole sampled on known equal-area sine-latitude centers then
produced `g10 = 0.750038` at 180 latitude rows. Array dimensions alone cannot
identify coordinates or row orientation. The legacy GONG reader also discards
FITS/WCS metadata, so its output cannot establish either a validated row order
or observed-input provenance.

## Decision

Every decomposition requires a `MagnetogramGrid`. Its `mu` values are
`sin(latitude) = cos(colatitude)`; its longitude centers increase uniformly
through one full period, with an optional phase offset. Latitude centers must
match the declared equal-area sine-latitude or uniform-colatitude geometry.
Both north-to-south and south-to-north row order are supported explicitly;
reversing coordinates and rows yields the same physical coefficients.
Factories default to north-to-south. Coordinate arrays are defensively copied
onto immutable bytes-backed storage; even enabling their write flag is rejected.

The synthetic generator defaults to equal-area centers. An explicitly supplied
grid determines its coordinates and dimensions. Its degree-zero component is
not subtracted. A separate flux-balance policy remains future work.

For each order, longitude projection obtains the real Fourier amplitudes:
`C0 = mean(Br)`, `Cm = 2 mean(Br cos(m phi))`, and
`Sm = 2 mean(Br sin(m phi))` for `m > 0`. Latitude coefficients then minimize
the area-weighted residual using NumPy SVD least squares. The latitude basis is
the shared `schmidt-quasi-normalized-no-cs-v1` basis from ADR 0001. There is no
post-Schmidt epsilon multiplier; the Fourier amplitude factor above is required
by the longitude basis and does not repeat harmonic normalization.

Equal-area rows receive constant strip width `2/n_lat`; uniform-colatitude rows
receive exact strip widths `cos(theta_edge_i) - cos(theta_edge_i+1)`. A common
longitude-cell width cancels from the fit. Weighted design matrices must have
finite 2-norm condition numbers no greater than the configured limit (default
`1e6`), and full column rank. Sampling requires at least `lmax+1` latitude rows
and `2*lmax+1` longitude columns. Nonfinite maps and mismatched shapes fail.
The axisymmetric solve includes `l=0`; it does not silently rebalance flux.

Importance seeding uses the same exact cell areas, a small uniform floor, and
uniform jitter in each cell's `mu` interval. Equal-area cells receive no extra
`sin(theta)` factor. Supplying a magnetogram for seeding requires its grid.

## GONG containment and consequences

The production cache currently uses explicit synthetic input with
`fallback_reason = legacy_gong_grid_orientation_unvalidated`. It bypasses the
legacy fetch rather than assigning an invented row order to raw fetched arrays.
Known GONG-style CEA coordinates are supported and tested as explicit input,
but those tests do not validate the legacy FITS reader or a real GONG product.
A later bounded Astropy/WCS provider must supply validated coordinates before
observed ingestion is re-enabled. The NumPy-only scientific runtime is retained.

Result metadata contains convention strings, never a NumPy grid object.
The WSA output grid is independently constructed by its existing evaluator;
its unused `br_map` argument does not imply that it consumes input-grid metadata.

## Verification

Independent polynomial differentiation synthesizes every real cosine/sine mode
through degree 15 on both supported geometries. Recovery, leakage, and isolated
reconstruction are bounded by `1e-10`; mixed reconstruction RMS by `1e-9`.
A non-band-limited cubic-to-dipole fit checks weighted residual optimality:
exact mode recovery alone cannot distinguish correct from incorrect positive
latitude weights. Further tests cover immutability, row reversal, longitude
phase, finite/shape validation, sampling and condition limits, synthetic
generation, area-weighted seeding, and the unvalidated-GONG fallback.
