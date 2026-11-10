# ADR 0007: Solve from NASA WSA's magnetogram projection

Status: Accepted. Supersedes ADR 0002's latitude least-squares fit for the solve;
ADR 0002's explicit grid geometry still applies.

## Problem

The least-squares fit on the 180-row equal-area grid collapses above degree ~40 on
real GONG zqs maps. It splits zero into a large monopole plus a cancelling polar
combination, and the evaluator rightly drops the monopole, keeping the polar part.
The fitted monopole is 0.03 G at degree 40, 19.6 G at degree 64 and 102 G at degree 72
(the map's true value is 1e-16 G). Coefficient error against NASA reaches 56–87% at
degree 50 and 26–44x at degree 64. The `1e6` condition gate admits fits up to degree 72,
so it does not catch this. Reaching the matched NASA line budget needs degree 80–90.

## Decision

`project_spherical_harmonics` follows NASA's WSA pipeline, and the solve uses it:

1. Average the piecewise-constant input over WSA's 2-degree uniform-latitude cells:
   exact area overlap in latitude, adjacent pixel pairs in longitude (90 x 180 cells).
   The last zqs row spans 81.45–90 degrees, so the polar cells are copies of it. Nothing
   is extrapolated.
2. Sum `g_lm = (2l+1)/(4 pi) * sum(Br P_lm cos(m phi) sin(theta) dtheta dphi)`, and `h_lm`
   with `sin(m phi)`, using the ADR 0001 basis. The monopole is included and is the map's
   area mean.

Nothing is inverted, so there is no condition number to gate and no monopole split can
occur. Coefficients do not depend on the requested degree. The fit takes 0.6 ms at degree
15 and 9 ms at degree 90. `PFSS_DECOMPOSITION_VERSION` names the method, so cached
solutions from the old fit cannot be reused.

This ADR does not raise any degree. The grid `lmax` cap of 15 and the fidelity table are
unchanged. (ADR 0008 later raised the cap, and `high`/`ultra`, to 40.) The runtime fits a synthetic map, and observed input stays `disabled_unvalidated`.

## What this does and does not claim

It reproduces NASA's product. It does not recover a band-limited field, and it does not
supply polar information the input grid lacks; a mode the grid cannot see stays unseen
rather than being amplified or recovered.

Known approximations, shared with NASA: cell averaging attenuates a mode by up to about
`(l * 2 deg)^2 / 24`, and midpoint quadrature is not exactly orthogonal, so a unit dipole
leaks `(2l+1) * dtheta^2 / 24` into odd degree `l`. NASA's own degree-90 field reproduces
its own 2-degree input to only 16–21% RMS. At degree 15 this fit attenuates more than least
squares, which recovers a band-limited sample to `1e-10`. Real maps are not band-limited,
and NASA's product is the reference.

`decompose_spherical_harmonics` stays as the documented alternative, with its gate and
scientific counterexamples. The solve no longer calls it.

## Verification

Seven real GONG maps with their matched NASA WSA products and traced lines: 2019-12-01
(minimum, WSA 4.5), 2023-06-15 (rising, 5.4), 2024-10-15 (maximum, 5.4), 2025-09-10 (6.2),
2026-10-12 and two from 2026-10-14 (6.2). Offline results:

- Coefficient error against NASA is 0.03–0.5% at every degree tested.
- Line statistics equal those of NASA's own coefficients (±0.05 degrees) on every map.
- The line budget is met at degree 80 and 90 on all six maps from 2023 on, and at degree 72
  on three of them. On the weak-field 2019 minimum, 3 of 296 lines are indeterminate, one
  more than the budget allows, with NASA's own coefficients too.
- SCN-041 feature checks at degree 90 fail 0–6 of 8 depending on epoch, identically for
  NASA's own coefficients. Those gaps are in the feature pipeline, not the field model.

`backend/tests/test_pfss_projection.py` pins the retained 2026-10-12 epoch: coefficients,
monopole, line budget and feature budget, plus normalization, row order, longitude phase
and input validation. Old and new `/solar/physics` responses, six epoch and fidelity
cases: same seeds, no open/closed changes, lines move at most 0.007 solar radii at the 95th
percentile, mean WSA speed moves at most 1.2 km/s, response time unchanged.

The blocking R3/R4 lane (`ci/r3-r4-science-verification.json`) runs three of these tests:
the unit-dipole amplitude, the (3, 2) mode and the degree-90 NASA match. Two mutants of
`project_spherical_harmonics` must fail there: equal-area weights for the uniform-latitude
cells, and an extra factor of 2 on the m > 0 coefficients. The lane's least-squares mutants
still guard `decompose_spherical_harmonics`.

## Consequences

Any degree above ~40 is now reachable by policy alone, at the cost of evaluation time: 9.5 s
per solve at degree 80 and 12 s at degree 90 on a Ryzen 9 9950X3D, against an 18 s compute
timeout. That decision belongs with enabling observed input.

NASA balances flux by setting both polarities to their arithmetic mean (`MPCORR = 2`,
`B+/(1+q)` and `B-/(1-q)`); `gong_magnetogram` uses the harmonic mean (`B+(1-q)` and
`B-(1+q)`). They differ by the uniform factor `1/(1-q^2)`, at most 0.3% on these maps, and
no line statistic moves. The admission policy is left as it is.
