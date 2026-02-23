# Mathematical Approaches for Superluminal-like Front Modeling

## 1) Causal light-travel geometry (core model)
For a compact feature launched at speed `v` with angle `theta` to the line of sight, the apparent transverse speed is

`beta_app = (beta * sin(theta)) / (1 - beta * cos(theta))`

where `beta = v / c`.

From the measured apparent speed, lower bounds and priors follow:

- `Gamma_min = sqrt(1 + beta_app^2)`.
- Maximum apparent speed occurs near `theta ≈ 1/Gamma`.
- Apparent motion is an output transform, not local information speed.

This model is stable, cheap, and should be your mandatory base layer.

## 2) Doppler boosting and observables
Doppler factor

`delta = [Gamma * (1 - beta * cos(theta))]^-1`

with beaming law for flux density

`S_nu_obs = delta^(k - alpha) * S_nu'
`

where `k` is often 2 (continuous jet) or 3 (moving blob), and `alpha` is spectral index.

Use this to couple viewing geometry to visible front contrast.

## 3) Pattern speed versus plasma speed
Let `beta_p` be pattern velocity and `beta_b` be bulk plasma velocity.

- For conical shocks/knots, use independent priors for `beta_p` and `beta_b`.
- Use Bayesian inference to decide if `|beta_p - beta_b|` is required by observations.
- This solves the common mismatch between VLBI centroids and physically plausible flow speeds.

A simple Gaussian-knot transport is practical:

`F_obs(t,nu)=Σ_i A_i(t,nu) * K(beta_app_i, delta_i, t_obs-delay_i)`

where each component `i` carries a profile `A_i`.

## 4) Jet spine-sheath structure and light profile
Represent each transverse zone `j` as

`S_j(t) = ∫ j_nu(theta_j, beta_j, delta_j, s_j) dA_j`

A two-zone spine-sheath approximation yields direction-dependent `beta_app`, useful to reproduce limb brightening and knot acceleration.

## 5) Radiative transfer for moving fronts
Use standard transfer along a ray for each emitting cell:

`dI_nu/ds = -kappa_nu I_nu + j_nu`

and map source time to observer time with

`t_obs = t_em + (D - n·r_em)/c`

This is where curved wavefronts and viewing-dependent morphology are generated.

## 6) CR and neutrino transport channels
For each event channel `c` (CR, neutrino, radio electrons):

`
\partial_t f_c + \mathbf{v} \cdot \nabla f_c = 
\nabla \cdot (\mathbf{D} \nabla f_c) + \frac{1}{3}(\nabla \cdot \mathbf{u})
\frac{\partial f_c}{\partial \ln p} + Q_c - L_c
`

with channel-specific:

- diffusion tensor `D(E,r)` (can start isotropic scalar `D = D0 (E/E0)^a`),
- loss terms `L_c` (synchrotron, adiabatic, hadronic, photo-pion as needed),
- source term `Q_c` tied to jet/shock dissipation.

Outputs for UI: particle fluence proxy and delayed arrival windows with broad spread.

## 7) Shock acceleration proxy
For nonrelativistic test-particle shock acceleration,

`spectrum p^{-s}` with `s = (r+2)/(r-1)`

where `r` is shock compression ratio.

For simulation usability use a maximum energy bound:

`E_max ≈ Z e B R beta`

or equivalently confinement-time-limited formulas in local units.

## 8) Event scheduling mathematics
Represent a source activation event as a tuple:

`E = {t0, pos, orientation, jet_power(t), channel_energy_fractions}`

Propagate channel states:

`state_c(t) = state_c0 * exp(-(t-t0)/tau_c) * response_c(t,delay)`

For a toy but coherent model, use channel-dependent `tau_c` and a propagation kernel:

`K_c(t) = H(t) * (t/tau_c) * exp(-t/tau_c)`

with `H` as Heaviside.

## 9) Inverse step: parameter fitting
Given synthetic-to-observed residual:

`L = Σ_t Σ_ν (X_model(t,ν;θ) - X_obs(t,ν))^2 / σ^2`

fit parameters `θ` by:

- Bayesian posterior over `Γ, theta, tau, tau_c, E_channel`,
- simple MCMC or particle swarm in low dimension.

This gives physically interpretable sliders in the UI.

## 10) Recommended computational stack for `solar-system-realistic-sim`
1. Geometry kernel for `beta_app` and delay mapping.
2. Channel scheduler with causality guardrails.
3. Optional MHD-lite perturbation field on top of ballistic kinematics.
4. Transport module for CR/neutrinos.
5. Speculative module in feature flag `advanced_mode`.

## Reference anchors for each module
- Relativistic geometry and beaming: Nature 211468a0, Nature 267211a0.
- Jet kinematics/statistics: MOJAVE VI and XVII.
- Transport and anisotropy: Auger and UHECR literature.
- Shock acceleration and transport: Bell 1978, Strong et al.
- Couplings: Gertsenshtein derivations, GW memory papers.
