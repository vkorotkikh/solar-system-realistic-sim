# ADR 0008: PFSS degree 40 for high and ultra fidelity

Status: Accepted. Amends ADR 0007, which changed the fit and left every degree at 15.

## Problem

The runtime fits the synthetic magnetogram, whose active regions are Gaussian spots about
2 degrees wide. On that map 50–53% of the mean-square surface field lies above degree 15 and
under 1% above degree 40 (measured for 2026-11-08 and for the 2024-10 maximum). `PFSSSolutionConfig`
silently clamps `lmax` to 15, so the solve discarded half of what the app's own generator put in,
and the fidelity table could not ask for more.

## Decision

- `PFSSSolutionConfig` clamps `lmax` to 40 instead of 15. It stays a clamp (`min`), as before.
- The fidelity table requests degree 40 for `high` and `ultra`. `preview` (9) and `operational`
  (12) are unchanged.

Nothing else moves: the response carries the degree it used, the frontend contract has no degree
field, and the gzip `render-v1` body the browser receives grows by under 3% (largest measured
388 kB, at `ultra`, against its 512 KiB cap).

## Evidence

Display lines (120) on the synthetic map, degree 40 against 15: 8–9 change between open and
closed, and lines move by 0.08 solar radii at the median and 0.63–1.27 at the 95th percentile.
Degree 80 against 40: one line changes, median move 0.005 solar radii. So 40 recovers what the
generator contains, and higher degrees add nothing visible on this input.

Cost of the worker job at `high` on a Ryzen 9 9950X3D with single-threaded BLAS: 1.85 s at
degree 15, 6.0 s at 40, 13.3 s at 72. The compute deadline is 18 s (hard maximum 19 s; the
browser waits 20 s) and CI's runner measured about 2.4 times slower than that machine, so degree
40 lands near 14 s there and 72 would not fit. The 36×72 WSA speed map is about 85% of a solve.
The nine backend test files that request `high` or `ultra` take 102 s instead of 70 s.

## Not decided here

Degrees 72–90, which the matched NASA line budget needs on real magnetograms, wait for observed
input and for a solve that runs ahead of the request instead of inside its deadline. Real-map
admission is covered in ADR 0007's consequences.
