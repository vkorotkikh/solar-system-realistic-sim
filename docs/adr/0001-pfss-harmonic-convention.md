# ADR 0001: PFSS harmonic convention

Accepted 2026-09-26.

The three legacy basis implementations used the same incorrect mixture of
normalizations. In particular they returned `P2(0.5)=-0.6339110704739678`,
instead of the ordinary Legendre value `-0.125`.

The production convention is `schmidt-quasi-normalized-no-cs-v1`:

```text
Pbar_l^m(mu) = sqrt((2-delta_m0) (l-m)!/(l+m)!) P_l^m(mu)
mu = cos(theta), theta in [0, pi], P has no Condon-Shortley phase
```

This leaves zonal modes unchanged and gives `Pbar_1^1=sin(theta)`. The
latitude norm is `2/(2l+1)` for `m=0` and `4/(2l+1)` for `m>0`. Combined
with the longitude cosine/sine norm, each nonzero real mode has surface
norm `4*pi/(2l+1)`. These norms follow by applying our factorial scaling
to the unnormalized orthogonality in [DLMF 14.17.6](https://dlmf.nist.gov/14.17#E6).
There is no additional `epsilon_m=2` in the projection using this basis.
Removing that duplicate factor is coupled to the basis correction; explicit
grid geometry and stable multi-mode projection remain a separate task.

`backend/sim/spherical_harmonics.py` owns the NumPy-only recurrence. For
`m < l-1` its coefficients are `(2l-1)/sqrt(l*l-m*m)` and
`sqrt(((l-1)**2-m*m)/(l*l-m*m))`. The analytic theta derivative differentiates
the same recurrence, avoiding a singular division. Inputs retain their
arbitrary NumPy shape, including scalar and empty arrays; degrees outside
the integer range 0..64 and nonfinite or out-of-range mu raise `ValueError`.
The three legacy entry points delegate to it; their retained `sin_t`
arguments do not override the shared basis's cosine input.

At the poles `Pbar_l^0(+1)=1`, `Pbar_l^0(-1)=(-1)^l`, and all `m>0`
values vanish. Only `m=1` has a nonzero theta derivative: its north value
is `sqrt(l(l+1)/2)` and south value is `(-1)^l sqrt(l(l+1)/2)`.
The shared azimuthal helper evaluates `m*Pbar/sin(theta)` using the analytic
`dPbar/dtheta / mu` limit for `m=1`, and zero for other orders at the poles.
This replaces the evaluator's sine floor and applies even when a tiny
angle's cosine rounds to an exact endpoint. Radial factors are unchanged.

The checked-in oracle is generated independently by SciPy `special.lpmv`.
SciPy includes the Condon-Shortley phase, which the generator removes with
`(-1)^m` before applying the factorial normalization. See the
[SciPy 1.18 lpmv definition](https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.lpmv.html).
Derivative references use the unnormalized lpmv degree identity, not the
production differentiated recurrence. The locked generator requires
Python 3.12.13, NumPy 2.5.2, and SciPy 1.18.0, and records those versions,
its own SHA-256, and the numerical payload SHA-256. Tests only read JSON
and never import SciPy.

```bash
/home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python scripts/generate_pfss_harmonic_fixture.py --check
```

Regeneration must be explicit (`--write`), followed by review of changes;
`--check` performs a byte-for-byte comparison without altering the fixture.
Blocking tests cover every mode through degree 15 at the five prescribed
mu values, 64-point quadrature orthogonality, scalar/batch equality,
derivatives, pole limits, and Cartesian continuity from several longitudes.
Degree 64 is a supported API bound, not a claim of production truncation
or convergence certification.
