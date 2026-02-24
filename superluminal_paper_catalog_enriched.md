# Superluminal Phenomena Research Catalog — Pass 2 Enrichment
**Date:** 2026-02-23  
**Scope:** Apparent superluminal kinematics in relativistic outflows, multi-messenger coupling, and related mathematical approaches.

## Legend
- **Model assumptions**: what each source assumes at the level of source geometry, transport, and observables.
- **Reproducibility notes**: how to re-run or audit published results with public artifacts (data, code, event pages, tables).
- **Cross-links**: DOI and/or arXiv, with dataset/API links where possible.

## Core geometric and relativistic papers

1. **Rees, M. J. (1966), “Appearance of Relativistically Expanding Radio Sources”**  
   `Nature`, 211, 468–470, DOI: `10.1038/211468a0`.  
   [doi](https://doi.org/10.1038/211468a0) · [nature](https://www.nature.com/articles/211468a0)  
   - **Assumptions:** Ballistic relativistic ejecta plus finite light-travel time geometry; apparent position-trajectory mapping in projection.  
   - **Reproducibility:** Reproduce with VLBI trajectory reconstruction pipeline; source geometry is generic and code-free (closed-form formula validation).

2. **Blandford, C. F.; Rees, M. J. (1977), “Super-luminal expansion in extragalactic radio sources”**  
   `Nature`, 267, 211–216, DOI: `10.1038/267211a0`.  
   [doi](https://doi.org/10.1038/267211a0) · [nature](https://www.nature.com/articles/267211a0)  
   - **Assumptions:** Intrinsically relativistic compact features, small viewing angles, beaming dominance for detectability.  
   - **Reproducibility:** Fit apparent-speeds from component catalogues (e.g., MOJAVE/TANAMI) using the Rees geometry; no hidden tuning parameters.

3. **Blandford, R. D.; Königl, A. (1979), “Relativistic jets as compact radio sources”**  
   `Astrophys. J.`, 232, 34; DOI: `10.1086/157262`.  
   [doi](https://doi.org/10.1086/157262)  
   - **Assumptions:** Conical jet, stationary/propagating disturbances, energy partition and scaling laws in compact jet zones.  
   - **Reproducibility:** Model parameters are directly inferable from VLBI/core-brightness and spectral-index evolution; use Bayesian or grid fits over Lorentz factor, viewing angle, emissivity index.

4. **Urry, C. M.; Padovani, P. (1995), “Unified schemes for radio-loud AGN”**  
   `PASP`, 107, 803–845, DOI: `10.1086/133630`, arXiv: [astro-ph/9506063](https://arxiv.org/abs/astro-ph/9506063).  
   [doi](https://doi.org/10.1086/133630) · [pdf](https://ned.ipac.caltech.edu/level5/Urry1/UrryP_contents.html)  
   - **Assumptions:** Orientation plus relativistic beaming governs class taxonomy across blazar/radio-galaxy families.  
   - **Reproducibility:** Implement source-population priors (parent LF, angle distribution) and verify against class fractions and beaming statistics.

5. **Blandford, R. D.; Znajek, R. L. (1977), “Electromagnetic extraction of energy from Kerr black holes”**  
   `Mon. Not. R. Astron. Soc.`, 179, 433–456, DOI: `10.1093/mnras/179.3.433` (canonical reference for jet-power closure).  
   [doi](https://doi.org/10.1093/mnras/179.3.433)  
   - **Assumptions:** Stationary force-free electrodynamics around spinning BH, magnetically arrested funnel.  
   - **Reproducibility:** Recreate power estimates using BH mass, spin, and magnetic flux with open GRMHD output.

6. **Blandford, R. D.; Payne, D. G. (1982), “Hydromagnetic flows from accretion disks and the production of radio jets”**  
   `MNRAS`, 199, 883–903, DOI: `10.1111/j.1365-2966.1982.tb00044.x`.  
   [doi](https://doi.org/10.1111/j.1365-2966.1982.tb00044.x)  
   - **Assumptions:** Disk-wind launching by large-scale poloidal fields and centrifugal extraction.  
   - **Reproducibility:** Compare required field inclination/strength against GRMHD jet-launch outputs and observed collimation profiles.

## Observational kinematics and benchmarking datasets

7. **Lister et al. (2009), MOJAVE VI**  
   arXiv: [0909.5100](https://arxiv.org/abs/0909.5100), MOJAVE data archive.  
   [arXiv](https://arxiv.org/abs/0909.5100) · [MOJAVE](https://www.cv.nrao.edu/MOJAVE/) · [MOJAVE kinematics notes](https://www.cv.nrao.edu/MOJAVE/kinematicsnotes.html)  
   - **Assumptions:** Bright, parsec-scale feature tracking at 15 GHz, multi-epoch Gaussian component decomposition.  
   - **Reproducibility:** Reconstruct β_app catalog by downloading MOJAVE component tables and epoch FITS maps.

8. **Lister et al. (2019), MOJAVE XVII: Kinematics and Parent-Population Properties**  
   arXiv: [1902.09591](https://arxiv.org/abs/1902.09591).  
   [arXiv](https://arxiv.org/abs/1902.09591)  
   - **Assumptions:** Population-level Monte-Carlo beaming inference with selection effects.  
   - **Reproducibility:** Use published component lists and model assumptions to reproduce speed distributions and parent LF estimates.

9. **Lister et al. (2021), MOJAVE XVIII: Inner Jet Evolution**  
   arXiv: [2108.13358](https://arxiv.org/abs/2108.13358).  
   [arXiv](https://arxiv.org/abs/2108.13358)  
   - **Assumptions:** Time-dependent jet PA drift, non-radial motions, and precessing/instability signatures.  
   - **Reproducibility:** Re-run kinematic fitting with position-angle time series; compare PA-angle distributions with injected-noise null models.

10. **Muller et al. (2014), Cen A inner-jets with TANAMI / VLBI context**  
    A&A, 568, A125; article page: [https://www.aanda.org/articles/aa/full_html/2014/09/aa23948-14/aa23948-14.html](https://www.aanda.org/articles/aa/full_html/2014/09/aa23948-14/aa23948-14.html).  
    [aanda](https://www.aanda.org/articles/aa/full_html/2014/09/aa23948-14/aa23948-14.html)  
    - **Assumptions:** Nearest large-scale radio galaxy as low-distance testbed for parsec-scale dynamics.  
    - **Reproducibility:** Re-analyze VLBI visibilities with public vis products and check inner-jet speed profile with published components.

11. **Event Horizon Telescope constraints on nearby jet geometry (Cen A)**  
    Nature Astronomy, 2021, doi: `10.1038/s41550-021-01417-w`.  
    [doi](https://doi.org/10.1038/s41550-021-01417-w)  
    - **Assumptions:** Sub-parsec core-scale morphology from mm-VLBI closure phases/amplitude, used for base jet opening angle priors.  
    - **Reproducibility:** Use EHT public visibility and calibration products where available; cross-check closure-derived morphology constraints.

## Transients and multi-messenger couplings

12. **Abbott et al. (2017), GW170817 / GRB170817A timing constraints**  
    arXiv: [1710.05834](https://arxiv.org/abs/1710.05834).  
    [arXiv](https://arxiv.org/abs/1710.05834) · [LIGO/Virgo open data](https://www.gw-openscience.org/)  
    - **Assumptions:** c-lag constraints from multi-band counterpart timing; not a superluminal claim but a causality anchor.  
    - **Reproducibility:** Reconstruct time-of-flight posterior using open strain and EM trigger times.

13. **Mooley et al. (2018), “Superluminal motion of a relativistic jet in the neutron-star merger GW170817”**  
    Nature, 561, DOI: `10.1038/s41586-018-0486-3`, arXiv: [1806.09693](https://arxiv.org/abs/1806.09693).  
    [doi](https://doi.org/10.1038/s41586-018-0486-3) · [arXiv](https://arxiv.org/abs/1806.09693)  
    - **Assumptions:** VLBI centroid motion + structured jet interpretation.  
    - **Reproducibility:** Match afterglow and imaging constraints with structured-jet priors (θview, Γ profile).

14. **Aartsen et al. (2018), TXS 0506+056 neutrino association (IceCube)**  
    Science, DOI: `10.1126/science.aat2890`, alert precursor DOI: `10.1126/science.aat1378`.  
    [DOI AAS association](https://doi.org/10.1126/science.aat2890)  
    - **Assumptions:** Sparse-event statistics with temporal correlation between neutrino alerts and blazar flares.  
    - **Reproducibility:** Use public alert + light-curve archive and test chance-coincidence via bootstrap on scrambled windows.

15. **Pierre Auger Collaboration (2007), anisotropy with nearby AGN hypothesis**  
    arXiv: [0712.2843](https://arxiv.org/abs/0712.2843).  
    [arXiv](https://arxiv.org/abs/0712.2843)  
    - **Assumptions:** UHECR sky anisotropy as proxy for high-energy source environments; deflection uncertainties are large.  
    - **Reproducibility:** Re-run directional correlation tests with public event lists and updated exposure maps.

## Particle-acceleration and transport foundations

16. **Bell, A. R. (1978a), “The acceleration of cosmic rays in shock fronts. I”**  
    MNRAS, 182, 147–156, DOI: `10.1093/mnras/182.2.147`.  
    [doi](https://doi.org/10.1093/mnras/182.2.147)  
    - **Assumptions:** Diffusive shock acceleration test-particle limit.  
    - **Reproducibility:** Reproduce spectral slope and diffusion scaling in a toy transport model with finite shock compression.

17. **Bell, A. R. (1978b), “The acceleration of cosmic rays in shock fronts. II”**  
    MNRAS, 182, 443–463, DOI: `10.1093/mnras/182.3.443`.  
    [doi](https://doi.org/10.1093/mnras/182.3.443)  
    - **Assumptions:** Magnetic field amplification and nonlinear corrections for high Mach shocks.  
    - **Reproducibility:** Use 1D shock-grid model with transport + escape boundary conditions.

18. **Strong, Moskalenko, Ptuskin (2007), “Cosmic-Ray Propagation and Interactions in the Galaxy”**  
    `Annu. Rev. Nucl. Part. Sci.`, 57, 285–327, DOI: `10.1146/annurev.nucl.57.090506.123011`.  
    [doi](https://doi.org/10.1146/annurev.nucl.57.090506.123011)  
    - **Assumptions:** Spatial diffusion, energy losses, spallation/secondary production, Galactic transport approximations.  
    - **Reproducibility:** Match source terms and grammage against GALPROP-like transport frameworks.

## Computation, codes, and synthetic-observables infrastructure

19. **Gammie, C. F.; McKinney, J. C.; Tóth, G.; 2003, HARM GRMHD scheme**  
    ApJ, 589, 444–457, DOI: `10.1086/374594`.  
    [doi](https://doi.org/10.1086/374594)  
    - **Assumptions:** Conservative ideal GRMHD on fixed metrics, conservative source terms, divergence control.  
    - **Reproducibility:** Use public HARM code versions and seed a synthetic jet from prescribed disk+corona initial conditions.

20. **Mignone et al. (2007), PLUTO code**  
    ApJS, 170, 228–242, DOI: `10.1086/513316`.  
    [doi](https://doi.org/10.1086/513316)  
    - **Assumptions:** Finite-volume shock-capturing MHD/ RMHD with AMR and multiple physics modules.  
    - **Reproducibility:** Build test suite first (blast waves, Kelvin-Helmholtz); then inject a collimated relativistic jet boundary layer.

21. **Porth et al. (2017), BHAC**  
    `arXiv` / A&A publication, often cited in BHAC documentation and user guide.  
    [repo / docs](https://www.ita.uni-heidelberg.de/~bhac/)  
    - **Assumptions:** General-relativistic MHD framework for BH accretion/jet problems, with AMR and conservative evolution.  
    - **Reproducibility:** Use published parameter files to reproduce magnetized jet benchmarks and convert snapshots to emissivity maps.

22. **Gertsenshtein conversion in modern form**  
    arXiv: [2301.02072](https://arxiv.org/abs/2301.02072) (review/derivation track).  
    - **Assumptions:** Gravitational to electromagnetic mode conversion in strong fields is an optional exotic coupling, generally weak.  
    - **Reproducibility:** Add as post-processing perturbation with explicit flagging so core simulation remains unchanged.

## Frontier/candidate papers I would include next in an extended Pass 2

23. **Meyer et al. (2013), detailed M87 jet flow structure and component evolution**  
    arXiv: [1308.4633](https://arxiv.org/abs/1308.4633).  
    [arXiv](https://arxiv.org/abs/1308.4633)  
    - **Assumptions:** Radial flow stratification and apparent acceleration in structured jets.  
    - **Reproducibility:** Use M87 multi-band kinematics and test multi-zone models against acceleration curves.

24. **Blandford–McKee blast-wave family**  
    Astrophysical fluid self-similar formulation widely used for transient relativistic shocks (not directly the original superluminal source problem, but useful for post-merge afterglows).  
    - **Assumptions:** Self-similar relativistic shock profiles in homogeneous/stratified media.  
    - **Reproducibility:** Useful for afterglow and forward-shock sanity checks.

## Data and archive links used as supporting anchors

- MOJAVE project and kinematics notes:  
  https://www.cv.nrao.edu/MOJAVE/ and https://www.cv.nrao.edu/MOJAVE/kinematicsnotes.html  
- EHT 1st/ongoing public imaging products where available.  
- LIGO/Virgo Open Science Center: https://www.gw-openscience.org/  
- IceCube event and alert streams: https://www.icecube.wisc.edu/  
- Pierre Auger data/analysis pages: https://www.auger.org/  

## Integrity notes for this catalog
- This pass intentionally prioritizes **source-identifiable artifacts** over speculative claims.
- For each key paper, reproducibility notes are kept at three levels: `formula-level` (closed form), `data-level` (public tables/catalogs), and `pipeline-level` (simulation/code dependencies).
- If a DOI is uncertain in older arXiv-era literature, it is explicitly marked with a direct arXiv fallback and should be cross-checked against ADS before publication.
