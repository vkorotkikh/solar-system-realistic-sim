# Native Tudat remediation and acceptance evidence

SCN-055 and SCN-077 branch fixes, not a claim of landing on main.

## Real environment

An isolated conda environment at `/tmp/solar-remediation-tudat-20261014` contains
Python 3.12.15, TudatPy 1.0.0, Tudat resources 2.4, NumPy 1.26.4, and pytest
9.1.1. This is a real native runtime, not an injected solver double. Recreate:

```sh
conda create --prefix /tmp/solar-remediation-tudat-20261014 \
  --override-channels -c tudat-team -c conda-forge \
  python=3.12 tudatpy=1.0.0 pytest=9.1.1 --solver libmamba -y
PYTHONPATH=backend SOLAR_REQUIRE_TUDAT=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
  /tmp/solar-remediation-tudat-20261014/bin/python -m pytest --noconftest -q \
  backend/tests/test_tudat_native_runtime.py backend/tests/test_ephemeris_remediation.py \
  -k 'tudat or scn055 or scn077 or saturn or unimplemented' -rs --tb=short
```

Result: **8 passed, 19 deselected**, no skips. Three tests execute real native
propagation; five cover adapter/normalization/configuration contracts. The new
native tests fail, rather than skip, when `SOLAR_REQUIRE_TUDAT=1` is set and
the runtime cannot load. Default Python CI still identifies the optional
environment as missing; that skip is not substituted for this native run.

## Failures exposed and corrected

- TudatPy 1.0 moved the supported dynamics namespace. The old kernel import
  incorrectly reported an installed runtime as absent. Prefer the current
  public interface/dynamics modules, with the older import as a compatibility
  fallback. The old SDK compatibility branch was not executed here.
- Saturn has no spherical-harmonic default in Tudat. The old default engine
  crashed when Saturn was present. Install explicit, fully normalized J2/J4
  coefficients from Iess et al. (2019), Table 1, with its **60,330 km** coefficient
  radius, not the visual 60,268 km radius. GM remains the loaded SPICE value.
- Standard kernels contain Pluto-system target 9, not body-center 999 or its
  GM. Tudat already defaults to the system ephemeris but requests a missing
  body-center GM. The adapter now explicitly pairs the system ephemeris and
  system GM, and serializes `ephemeris_quality` identifying the approximate
  system barycenter. This does not claim resolved Pluto-Charon dynamics.
- The unused SRP option formerly advertised a force it never installed. It
  now raises explicitly, and the module documentation no longer claims SRP
  support. Harmonic configuration is bounded to the implemented degree/order.

## Replacement gates and measured results

- All ten mapped default bodies initialize, advance across chunks, reverse,
  serialize finite states and TDB metadata, and return within a 0.05 m absolute
  state tolerance. Pluto's system approximation is asserted explicitly.
- Native Sun/Earth/Jupiter runs agree across short/long chunks. Reconstructing
  one common origin makes energy invariant to a common position translation.
- A test-only mapping adds the real SPICE Moon as a probe of Earth's harmonic
  field. This is not a new production Moon-selection feature. Harmonics produce
  position differences of 3.576, 14.286, 58.395, 191.991 and 422.205 m versus a
  point-mass control at days 1, 2, 4, 7 and 10. Short and long chunks agree to
  0.001 m, including backward boundary crossings. Exactly one SPICE seed per
  initialized engine is required, so resetting every chunk cannot pass.
- Coefficient sign, normalization, reference radius and unsupported force
  rejection have separate assertions.

The energy diagnostic still excludes harmonic potential terms and is not an
exact conservation oracle for the extended force model. Linear interpolation,
the approximate system representation, limited force set, and bundled kernel
coverage remain model limitations, not precision-ephemeris certification.

Sources: [Tudat migration](https://docs.tudat.space/en/stable/user-guide/project-updates/migration-guide.html),
[default gravity models](https://docs.tudat.space/en/latest/user-guide/state-propagation/environment-setup/default-env-models.html),
[normalized harmonic API](https://py.api.tudat.space/en/latest/dynamics/environment_setup/gravity_field.html),
and [Iess et al. Table 1, PDS copy](https://atmos.nmsu.edu/data_and_services/atmospheres_data/Cassini/logs/Iess-Science-2019.pdf).
