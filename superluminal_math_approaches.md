# Mathematical Approaches for Superluminal and Multi-Messenger AGN/SMBH Event Modeling

This document collects practical formalisms you can directly convert into engine code.

## 1) Apparent superluminal motion (geometry and observables)

For a feature moving at speed `v = βc` at angle `θ` to the line of sight:

```math
\beta_{\rm app} = \frac{\beta\sin\theta}{1-\beta\cos\theta},\quad v_{\rm app}=\beta_{\rm app}c
```

This is causal (`β < 1`) but can give `v_app > c` for small `θ`. Practical consequences:
- Brightness is dominated by Doppler boosting near `θ 1/Γ`.
- Large apparent speeds are selection-biased toward jets near line of sight.

Useful identity:

```math
\beta_{\rm app, max}=\sqrt{\Gamma^2-1},\quad \Gamma=(1-\beta^2)^{-1/2}
```

### Doppler factor and flux scaling

```math
\delta = \frac{1}{\Gamma(1-\beta\cos\theta)}
```

Observed intensity scales approximately as `I_obs ~ δ^(p+\alpha) I'` (exact exponent depends on emissivity geometry, usually `p=2` or `3`).

## 2) Kinematic event propagation for multi-channel stack

Represent one source event as a tuple
`E = {t0, D, channels[], environment, orientation}`.

For each channel `i` with effective propagation velocity field `v_i`:

```math
\Delta t_i = \frac{D}{c} + \tau_{\rm delay,i}(E,\text{medium})
```

Where:
- `D/c` is vacuum travel baseline,
- `\tau_delay` includes optical depth, diffusion, acceleration, breakout, and launch-lag terms.

For a shock-like plasma front in inhomogeneous medium, one practical parameterization is:

```math
\frac{\mathrm dR}{\mathrm dt}=u_s(R)=\begin{cases}
c\left(1-\frac{1}{2\Gamma^2(R)}\right), &\text{(relativistic)}\\
\beta_s c, &\text{(non-relativistic constant-\,\Gamma regime)}
\end{cases}
```

Then arrival time to radius `R` is `t(R)=\int dR/u_s(R)`.

## 3) Relativistic jet energy extraction (simplified BZ-style)

A practical engineering form for spin-powered jet power:

```math
P_{\rm BZ}\approx \kappa\,\frac{\Phi_{\rm BH}^2\,\Omega_H^2}{4\pi c}
```

where `Φ_BH` is magnetic flux threading the BH horizon and `Ω_H` horizon angular frequency (`\propto a_* M^{-1}`).

This underpins AGN power presets:
- mass-dependent scaling,
- spin-dependent amplification,
- field-geometry dependence.

## 4) Shock front models

### 4.1 Sedov-Taylor (non-relativistic)

```math
R(t)=\xi\left(\frac{E}{\rho_0}\right)^{1/5}t^{2/5},\quad v_s=\frac{2}{5}\frac{R}{t}
```

### 4.2 Blandford–McKee (ultra-relativistic limit)

For density `ρ∝r^{-k}`, self-similar relativistic shell gives energy-conserving scaling approximately:

```math
\Gamma^2 R^{3-k}\propto E
```

and `R\approx ct(1 - 1/(2(4-k)\Gamma^2))` as the front approaches causal transition.

### 4.3 Transitional correction models

Use corrections for moderate `Γ` regimes where neither BMK nor ST is ideal. Coughlin-style energy-conserving relativistic corrections are useful when `Γ≈1.5–5` and you need smooth interpolation.

## 5) Diffusive and anisotropic CR transport

### Parker transport equation (guiding form)

```math
\frac{\partial f}{\partial t}+\mathbf u\cdot\nabla f-\nabla\cdot(\mathbf K\nabla f) -\frac{1}{3}(\nabla\cdot\mathbf u)p\frac{\partial f}{\partial p}=Q
```

For practical simulation, use a reduced form with:
- `u(r,t)` ambient solar wind flow or shock-frame speed,
- `K` anisotropic diffusion tensor (parallel/perpendicular),
- optional drift terms.

Implementation options:
- finite-volume/FV solver,
- stochastic differential equation equivalent (robust for strong anisotropy).

### Characteristic scaling

Diffusion length estimate:

```math
\ell(E,t)\sim\sqrt{2 K(E) t}
```

Delay at 1D can be approximated:

```math
\Delta t_{\rm CR}\approx \frac{L^2}{2K(E)}
```

Useful for quick event-time spread in toy models.

## 6) Jet front and shock observables in medium

Use shock Mach proxy:

```math
\mathcal M = \frac{v_{\rm rel}}{c_s}
```

For observable compression/radiative proxies use jump-like relations (EOS-dependent):

```math
\frac{\rho_2}{\rho_1}=\frac{(\gamma+1)\mathcal M^2}{(\gamma-1)\mathcal M^2+2}
```

Then generate:
- pressure increase for heating,
- emissivity map modulated by compression/`B` enhancement,
- anisotropic reflection/refraction if medium map used.

## 7) Hypothesis modules (simulation flags)

A clean architecture is three-tiered:

1. **Deterministic causal layer (default)**
   - GW and EM: near-`c` propagation.
   - CR: diffusion kernel with rigidity dependence.
   - shock front: medium-dependent speed law.

2. **Geometric observables layer**
   - `β_app`, `δ`, projection geometry and apparent morphology.

3. **Speculative coupling layer (off by default)**
   - GW-EM memory,
   - very weak GW-plasma coupling terms,
   - exotic conversion coefficients.

Mark this layer as `speculative=true` and keep it excluded from baseline dynamics.

## 8) Suggested numerical implementation pattern

- Convert each approach above into a `ChannelModel` interface with `evaluate(t, state)`.
- Use adaptive timestep by shortest physically relevant timescale:
  - geometric pulse width,
  - transport CFL,
  - diffusion stability scale,
  - shock curvature radius.
- Keep all physical coefficients in source-overrideable JSON presets.

---

This architecture is directly compatible with your existing simulation structure and prevents causality confusion while enabling dramatic visual behavior.
