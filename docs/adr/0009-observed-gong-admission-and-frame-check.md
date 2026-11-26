# ADR 0009: Real GONG maps under WSA method 2, the frame check and the drawing window

Status: Accepted. Stage A1 of "Today's Sun". Adds to ADR 0005 (the GONG provider) and ADR 0007
(the fit); the default behaviour of both is unchanged.

## Problem

A real NSO/GONG zqs map could not reach a potential-field solve. The parser admits a map only
when its flux imbalance is at rounding level, or when it is the one retained 2026-10-12 map with
NASA's corroboration, and a 5% cap sits ahead of that. Of 76 real maps surveyed from 2019 to
2026, none is at rounding level and nine exceed 5%; the largest is 8.3%. Flux imbalance in a
synoptic map is a measurement artefact that every pipeline corrects. It is not a defect of one
map.

Nothing checked, either, that a map's Carrington longitudes are the body frame the display draws
in.

## Decision

1. **Flux policy.** `parse_gong_fits(flux_policy="wsa-method-2")` balances a map as NASA's WSA
   does (`MPCORR` method 2). With `q` the signed flux over the unsigned flux, positive pixels are
   scaled by `1/(1+q)` and negative ones by `1/(1-q)`, which sets both polarity fluxes to their
   arithmetic mean. The snapshot records `q`, both scale factors, the cap and the residual
   monopole, carries the policy version `wsa-method-2-polarity-scale-v1` and the quality flag
   `flux-balanced-wsa-method-2`, and claims no provider corroboration.
2. **Cap.** `|q|` above 0.10 is refused as `flux_unbalanced`, with `q` and the cap in the
   refusal; exactly 0.10 is admitted. The cap is the owner's policy constant, a guard against a
   defective map. It is provisional and is not derived from a study: it sits above every
   imbalance in the survey, so a map beyond it is unprecedented in that record.
3. **Default unchanged.** The default policy, `roundoff-or-trusted`, is today's behaviour and
   gives the retained map the same snapshot id. Nothing in the server passes the new keyword. The
   new policy version is not an implemented cache policy, so `PFSSCache` refuses such snapshots
   until stage A2 extends its validator.
4. **Frame check.** A map is drawn in IAU_SUN body coordinates only when its own central meridian
   (`current_central_meridian_deg`, from `CRNOW`) agrees within 2° with the sub-Earth longitude in
   IAU_SUN at the map's reference time. The direction is geometric, from astropy's built-in
   ephemeris, with no light-time correction (about 0.08°). `iau_sun_to_ecliptic_matrix` is the
   Python twin of `solarFrameToEclipticMatrix('IAU_SUN', jd)` and is tested against the same
   CSPICE fixture.
5. **Drawing window.** A map is drawn while the simulation date is within one mean synodic
   rotation, 27.2753 days, of its reference time, before or after (the owner's decision of
   2026-11-20). The sidecar file carries the two dates and the client only compares them, so the
   window is data.
6. **Delivery in stage A1.** `scripts/observed_pfss_probe.py` fetches the newest map, solves it
   offline and writes one sidecar file. `GET /solar/observed/pfss` serves that file when
   `SOLAR_OBSERVED_PFSS_SIDECAR` names it, and answers 404 otherwise. `/solar/physics`, the frame
   contract, the supervisor and the ready cache are untouched.

## Evidence

- **The two scalings give the same lines.** Method 2 is the existing bounded scaling times the
  uniform factor `1/(1-q²)`, 0.7% at the survey's largest imbalance; a test pins the identity. It
  is used because it is the scale NASA's own coefficients carry.
- **The fit reproduces NASA.** ADR 0007's fit matches NASA's WSA coefficients to 0.22% on average
  over seven maps and 0.52% at worst over ten. Three maps never seen before meet NASA's line
  budget at degrees 80 and 90.
- **Frame check on real maps.** On ten maps from 2019-12 to 2026-11 the difference ranged from
  −0.67° to +0.78° with the sign right on all ten; the spread is jitter in `CRNOW` against its
  minute-resolution timestamp. A wrong sign or zero point would show as tens of degrees. The
  retained map gives +0.02°.
- **A live run, 2026-11-21.** The map of 05:14 UTC has `q` = +5.2%, which the default policy
  refuses. The frame difference was −0.18°. At degree 90 the fit took 0.02 s and the solve 3.6 s
  on a Ryzen 9 9950X3D; 200 lines are 172 kB of JSON and 57 kB gzipped.
- **What the frame check does not test.** It fixes the zero point and the sense of rotation. The
  pixel array's longitude axis and its north-south order rest on
  `test_matches_nasa_coefficients_from_the_same_map`, which compares the fit with NASA's
  coefficients for one map.

## Not decided here

- Stage A2, which would fetch and solve inside the backend, and corroboration of each map
  against NASA's same-day product. Until then the app's label says "uncorroborated".
- The cap's final value. The flux-policy study and an answer from NSO or the sunkit-magex
  maintainers may lower it.
- NASA's ready-made field lines as a labelled backup for a map this solve refuses or fails on.
  That belongs to phase C.
