# Research and Implementation Plan: Superluminal Fronts in AGN/SMBH Context

## Objective
Build a simulation architecture for apparent superluminal phenomena that is:
- causally safe,
- physically interpretable,
- multi-messenger aware (GW/EM/CR/neutrino channels),
- adjustable by confidence level (hard physics vs speculative hooks).

## Phase 0: Source and parameter baselines
1. Lock source presets with minimal required constants.
2. Store in code as YAML or JSON-like config with fixed provenance.
3. Include documented priors and confidence labels.

Proposed presets:
- Sgr A*.
- Centaurus A.
- M87.
- Maffei 1.

## Phase 1: Causal kinematics core
1. Implement per-feature geometry transform.
2. Implement apparent speed transform and projection.
3. Add observer-time mapping and light-delay correction.
4. Add visual mode fallback and physical mode output separation.

Deliverables:
- deterministic `beta_app` outputs,
- observed arrival timestamps,
- debug overlay with local/casual speed.

## Phase 2: Multi-channel event scheduler
1. Replace fixed 20 AU/s front behavior with a typed event object.
2. Add delayed kernels for channels:
2.1 GW.
2.2 EM optical/UV/X-ray proxy.
2.3 CR and neutrino proxy.
3. Add channel-specific decay and dilution.

Deliverables:
- one event creates multiple physically distinct observables,
- UI can show causality-safe staggered timeline.

## Phase 3: Jet morphology and transport
1. Add 1--2 component jet model: spine and sheath.
2. Add beaming law and Doppler modulation.
3. Add optional shock compression regions and moving knots.
4. Add toy CR transport equation with adjustable diffusivity.

Deliverables:
- stronger morphological patterns,
- anisotropic lobe/beam evolution,
- delayed CR/neutrino proxy timeline.

## Phase 4: Validation and calibration set
1. Match toy outputs to 4 benchmark signatures:
- apparent superluminal curve shape,
- luminosity rise/decay asymmetry,
- delayed channel onset,
- orientation sensitivity.
2. Compare qualitatively to anchor cases:
- GW170817-like jet delay ladder,
- MOJAVE speed distribution style shape,
- Cen A jet kinematics scale,
- no-superspeed causality checks.

Deliverables:
- benchmark cards and example parameter sets,
- confidence bars and failure flags.

## Phase 5: Optional advanced/speculative module
1. Add toggle `advanced_mode`.
2. Add Gertsenshtein-like coupling term and GW memory proxy as low-amplitude perturbations.
3. Keep disabled by default.

Deliverables:
- explicit experiment mode docs,
- no core behavior dependency.

## Query and research pack for continuation
1. ``Rees 1966 apparent relativistic expansion Nature DOI''
2. ``MOJAVE XVII 2019 public dataset apparent speeds''
3. ``Cen A TANAMI inner parsec jet kinematics''
4. ``GW170817 superluminal jet Nature 2018''
5. ``Bell 1978 diffusive shock acceleration pdf''
6. ``Gertsenshtein effect gravitational to electromagnetic conversion''

## Minimal implementation scope decision
Phase 0 + Phase 1 can be done first and is enough for a visible, causal, educational upgrade.
Phase 2 adds multi-messenger scheduling.
Phase 3 improves scientific credibility substantially.
Phase 4 + 5 are optional follow-on.
