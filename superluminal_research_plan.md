# Research & Implementation Plan (phased)

Because this is a large topic, this is split into a multi-stage plan with explicit deliverables, risk checks, and source-query prompts.

## Stage 0 — Scope lock and citation baseline

**Goal:** freeze the target physical layers and confidence taxonomy.

- [ ] Define source presets explicitly: `Sgr A*`, `Centaurus A`, `M87`, `Maffei 1`.
- [ ] Lock model tags: `observational`, `phenomenological`, `speculative`.
- [ ] Freeze key geometry equations: apparent superluminal and Doppler factor.
- [ ] Confirm data APIs/asset formats for MOJAVE, IceCube, PAO, PTA releases.

### Query prompts to run next
- `"MOJAVE component speeds table API 2019"`
- `"NANOGrav 15-year HD curve data release details"`
- `"IceCube TXS 0506+056 public alert data release"`
- `"Auger latest UHECR anisotropy update catalog"`

## Stage 1 — Causal event core (conservative default)

**Goal:** replace current one-off animation trigger with a channelized event kernel.

- [ ] Implement `Event` schema: launch time, duration, energy budget, source geometry, jet angle.
- [ ] Add channel structs:
  - `GW`, `EM`, `CR`, `MHDFront`, `Neutrino`
- [ ] Add arrival-time model per channel:
  - near-`c` baseline + channel-specific delay term.
- [ ] Add simple transport defaults:
  - `CR` with diffusion coefficient scaling in rigidity
  - `MHDFront` with medium-dependent speed law
  - optional launch lag terms

### Outputs for stage 1
- stable deterministic simulation with time-offset signatures
- debug panel showing channel-specific delay curve

## Stage 2 — Observable-layer superluminal module

**Goal:** model apparent pattern speeds separately from physical transport.

- [ ] Add `beta_app` formula and Doppler boosting module.
- [ ] Render apparent feature motion independent of causal channel speed.
- [ ] Tie jet orientation jitter to apparent morphology only.

### Validation checks
- reproduces typical `~`1–50`c` AGN apparent ranges with plausible `Γ, θ` combinations
- maintains causality in transport layer.

## Stage 3 — Source presets and medium maps

**Goal:** create repeatable scientific presets for multi-source scenarios.

- [ ] `SgrA`, `CenA`, `M87`, `Maffei1` JSON preset records.
- [ ] Add optional medium map (`density`, `B-field proxy`) for differential front response.
- [ ] Add refractive/reflective/ram-pressure terms for front distortion (no unbounded physical claims).

## Stage 4 — Advanced transport realism (optional)

**Goal:** move from toy transport to physically richer but still stable modules.

- [ ] Add Parker-equation based CR transport module (1D radial + rigidity channel at first).
- [ ] Add jet-breakout and shock-energy bookkeeping (shock compression proxy, heating proxy).
- [ ] Add neutrino flux proxy from hadronic channel (user-triggerable).

## Stage 5 — Speculative coupling sandbox

**Goal:** isolate experimental effects only.

- [ ] Add optional GWs-to-plasma coupling/feedback flag off by default.
- [ ] Add memory-like strain pulse kernels in a disabled mode.
- [ ] Print explicit warnings when enabled.

## Stage 6 — Observational calibration

**Goal:** calibrate against known datasets and annotate what is matched.

- [ ] Compare against MOJAVE apparent speed envelope.
- [ ] Compare delay ordering with GW170817-like toy sequence.
- [ ] Verify AGN channel mapping with TXS 0506+056 neutrino timeline and PAO/UHECR anisotropy heuristics.

## Deliverables

1. Code: source presets + channelized event stack + dual-layer rendering.
2. Documentation: this paper catalog + math approach docs + model assumptions.
3. QA checklist: causality, numerical stability, and interpretation bounds.

## Hard constraints to keep

- Never let apparent motion override causal transport equations.
- Never enable speculative couplings in default mode.
- Keep every new term traceable to a source or clearly marked assumption.
