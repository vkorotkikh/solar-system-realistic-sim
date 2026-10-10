# ADR 0003: PFSS source-surface boundary

Status: accepted

## Contract

The PFSS shell is `1 <= r <= S`, with radii in solar radii and `S=Rss`
(default 2.5). The photospheric radial field supplies the real Schmidt
coefficients described in ADR 0001. The source surface imposes
`Btheta = Bphi = 0`: the field is radial there. `Br` is generally nonzero,
so magnetic flux can cross the surface. This condition does not preserve
the unsigned photospheric flux: closed field lines can return to the
photosphere. With no monopole, the net signed flux through each sphere is zero.

The solver evaluates degrees 1 through `lmax`; a supplied degree-zero
coefficient is excluded. Its earlier `Br = 0` docstring and several obsolete
formula comments contradicted the already-correct numerical implementation.

## Derivation

For a single unit-amplitude real harmonic `Y_lm(theta, phi)`, write the harmonic
potential as

```
Psi = (a r^l + b r^(-l-1)) Y_lm,       B = -grad(Psi).
```

Choosing the constant source-surface potential to be zero gives
`b = -a S^(2l+1)`. The photospheric condition `Br(1) = Y_lm` then gives

```
a = -1 / [l + (l+1) S^(2l+1)]
b = S^(2l+1) / [l + (l+1) S^(2l+1)].
```

Equivalently, put `q = S^(-2l-1)` and `D = l+1+l q`. Differentiation yields

```
Br     = [(l+1) r^(-l-2) + l q r^(l-1)] / D * Y_lm
Btheta = -[r^(-l-2) - q r^(l-1)] / D * dY_lm/dtheta
Bphi   = -[r^(-l-2) - q r^(l-1)] / D / sin(theta) * dY_lm/dphi.
```

At `r=1`, the radial factor is one. At `r=S`, both tangential factors
vanish while `Br=(2l+1) S^(-l-2)/D * Y_lm`. Scalar and batch evaluators
already implement these factors; this decision changes their documentation,
not their numerical behavior.

## Verification and budgets

`backend/tests/test_pfss_analytic_fields.py` derives its oracle directly from
`a`, `b`, and derivatives of ordinary Legendre polynomials. It calls neither
production radial helpers nor the production Schmidt recurrence for expected
values. Every degree 1..15 is exercised at orders `{0, 1, floor(l/2), l}`
(deduplicated), with cosine and valid sine branches. Tests compare independent
spherical and Cartesian fields at the photosphere, the source surface, and
three interior radii. A deterministic mixed map also passes through explicit
grid decomposition before its photospheric field is reconstructed.

For the source-surface boundary, the absolute tangential RMS and maximum
budgets are `256 * eps * A`, where `eps` is float64 machine precision and
`A` is the injected coefficient amplitude in the caller's field units. The
relative RMS and maximum budgets are `1e-11`, normalized by the corresponding
analytic radial RMS and maximum, with a floor of `eps * A`. This avoids
pointwise division at nodes and contains no implicit gauss normalization.
Nonzero radial values are required explicitly. A 32-by-64 equal-area grid
checks batch fields, with representative scalar boundary checks.

Interior, nonpolar Cartesian central differences test both scalar and batch
divergence and curl. Steps `h`, `h/2`, `h/4`, with
`h=8e-4/max(l,2)` solar radii, must reduce each maximum normalized error by
at least a factor of 2.5 per halving. The final error must be at most `1e-6`,
normalized by local analytic `|B|/r` with the same precision-and-amplitude
floor. The degree-15 final step is approximately `1.333e-5` solar radii.
