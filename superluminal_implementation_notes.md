# Implementation Notes for Superluminal Phenomena Modeling — Pass 3
**Date:** 2026-02-23

## 1) Architecture objective
Model apparent superluminal signals as **geometry-first output transforms** with causally safe transport for physical channels:
- Physical transport channels: GW, EM (photons), cosmic rays, neutrino proxies.
- Observer transform layers: light-travel delay, Doppler beaming, and finite beam effects.
- Visualization layer: apparent trajectories and intensities, optionally decoupled from physical transport.

## 2) Recommended computational workflow (top-down)

### 2.1 Phase A: deterministic baseline model
1. Start from source preset (Sgr A*, Cen A, M87, user-defined).
2. Generate intrinsic event tuples:
   - launch time \(t_0\)
   - event location \(\mathbf{r}_0\)
   - intrinsic speed \(\beta\)
   - direction unit vector \(\hat{\mathbf{n}}\)
   - Lorentz factor \(\Gamma\), opening angle, power-law emissivity.
3. Compute apparent speed:
   \[
   \beta_{\mathrm{app}}=\frac{\beta\sin\theta}{1-\beta\cos\theta}
   \]
4. Map observer time:
   \[
   t_{\mathrm{obs}}=t_{\mathrm{em}}+\frac{D-\mathbf{\hat n}\cdot\mathbf r_{\mathrm{em}}}{c}
   \]
5. Compute beamed flux:
   \[
   \delta=[\Gamma(1-\beta\cos\theta)]^{-1},\quad
   F_{\nu,\mathrm{obs}}=\delta^{p}F'_{\nu'}
   \]
   with \(p\in\{2,3\}\) by component type.

### 2.2 Phase B: multi-channel transport coupling
For each channel \(c\in\{\mathrm{EM},\mathrm{GW},\mathrm{CR},\nu\}\), model:
- launch power fraction \(f_c\),
- channel delay kernel \(K_c(t)\),
- attenuation/smearing terms.

Use separable kernels:
[
K_c(t)=A_c\,\mathbb{1}_{t\ge t_0}\left(\frac{t-t_0}{\tau_c}\right)\exp\left(-\frac{t-t_0}{\tau_c}\right)
]

### 2.3 Phase C: calibration loop
1. Compare synthetic observables with:
   - component trajectories,
   - light curve asymmetry,
   - spectral evolution,
   - arrival-lag ordering across channels.
2. Optimize or sample \(\theta\) parameters using:
   - grid sweeps,
   - nested sampling,
   - MCMC (NumPyro/TensorFlow Probability),
   - DifferentialEvolution/particle swarm for cheap toy fits.

## 3) Python workflow (recommended default)

### 3.1 Suggested package stack
- Core: `numpy`, `scipy`, `pydantic`, `astropy`, `matplotlib`, `pandas`.
- Bayesian: `numpyro`, `emcee`, `arviz`.
- Interop: `h5py`, `joblib`, `pyyaml`.

### 3.2 Minimal folder layout
```
data/
  observables/
    mojave_vlbi/
    gw_events/
    neutrino_alerts/
src/
  core/
  transport/
  observables/
  fit/
  plots/
configs/
  source_presets/
  priors/
outputs/
```

### 3.3 Suggested Python implementation steps
1. `src/core/geometry.py`: βapp transform + observer-time map.
2. `src/observables/beaming.py`: flux boosting and PSF convolution.
3. `src/transport/channels.py`: multi-channel kernels and stochastic delays.
4. `src/fit/objective.py`: residual/likelihood functions for trajectories + light curves.
5. `src/run/sweep.py`: YAML-driven parameter sweep and random seeds.

## 4) Julia workflow (optional, high-performance)

### 4.1 Suggested stack
- ODE: `DifferentialEquations.jl`
- Probabilistic: `Turing.jl` or `Soss.jl`
- DataFrames + plotting: `DataFrames.jl`, `StatsPlots.jl`
- Performance: `LoopVectorization.jl`, `StaticArrays.jl`

### 4.2 Use cases
- Fast Monte-Carlo parameter sweeps with deterministic kernels.
- Hamiltonian Monte Carlo for sparse-observable inference.
- Multi-objective posterior on \((\Gamma,\theta,\tau_{\mathrm{EM}},\tau_{\mathrm{CR}})\).

## 5) MHD / GRMHD coupling branch

### 5.1 Code candidates and role
- **HARM**: reference general-relativistic MHD front-end for relativistic jet launching.
- **PLUTO**: classical and RMHD shock/instability benchmark.
- **BHAC**: high-resolution GRMHD for accretion-fed outflows.

### 5.2 Typical integration
1. Run MHD simulation for density \( \rho\), velocity \( \mathbf{u}\), \(B\), pressure.
2. Project slices into synthetic emissivity and Doppler map.
3. Feed projected emissivity into the phase-space transport kernels from Pass 3 baseline.
4. Compare to observed component catalogs and adjust coupling factors.

### 5.3 Synthetic observables from MHD
- total and polarized flux maps,
- apparent proper-motion tracks,
- core-shift proxies,
- light-curve residuals at radio/X-ray bands.

## 6) Diagnostic suite (must-have plots)
1. `beta_app` vs \(t\), with confidence envelope and causality floor.
2. Corner plots of \((\Gamma,\theta,\tau_c,p)\) posterior.
3. Residual maps by channel (EM/GW/CR/neutrino).
4. Speed- versus distance profiles (pattern vs inferred plasma proxy).
5. Orientation-sensitivity scans: likelihood surfaces over \(\theta\).

## 7) Parameter sweep strategy
- Start with low discrepancy parameters:
  - \(\Gamma\in[1.5,80]\),
  - \(\theta\in[0.5^\circ,30^\circ]\),
  - \(f_{\mathrm{channels}}\in[0,1]\) simplex,
  - damping and delay times \(\tau\in[10^{-3},10^4]\) (dimensionless/simulation units).
- Use Latin-hypercube for coarse scans, then adaptive refinement around posterior modes.
- Track identifiability by profile likelihood and prior sensitivity.

## 8) Reproducibility protocol
1. Pin dependency versions (`environment.yml` or `Project.toml` + `Manifest.toml`).
2. Freeze random seeds and store PRNG state in each run manifest.
3. Save per-run metadata:
   - commit hash, config hash, input data version, unit system.
4. Store outputs:
   - posterior samples, model diagnostics, and generated figures with git-tracked manifest.
5. Provide `readme_run.md` per experiment:
   - command line used,
   - parameter bounds,
   - convergence checks.

## 9) Data validation checklist
- Confirm light-cone mapping is causal (no intrinsic channel speed \(>c\)).
- Confirm apparent features can exceed \(c\) only via projection transform.
- Confirm feature classification (ballistic vs accelerating vs standing) is stored in metadata.
- Confirm synthetic observables reproduce first-order slopes of benchmark catalogs.
- Confirm speculative modules (`advanced_mode`) are disabled in default physical mode.

## 10) Suggested next implementation pass
If continuing:
1. Implement pass-fail gates for each model block.
2. Add CLI wrappers for:
   - `simulate --source cenA --mode physical --sweep`.
3. Export calibration cards as markdown + JSON for human review.
