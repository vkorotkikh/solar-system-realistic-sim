# Architecture & Implementation Plan: SMBH Multi-Messenger Shockwaves

**Date:** 2026-02-23
**Objective:** A detailed, step-by-step architectural blueprint to simultaneously implement Analytical Physics (Python Backend) and 3D Visualization (Three.js Frontend) for the compound SMBH shockwaves into the `solar-system-realistic-sim` codebase.

---

## Phase 1: Foundational Architecture & Directory Setup

We will create dedicated directories in both the backend and frontend to isolate this highly experimental physics system from the core solar system mechanics.

**Backend Structure:** `backend/sim/galactic/`
*   `__init__.py`
*   `smbh_constants.py`: Masses, distances, historical event timelines (Sgr A*, Cen A).
*   `transient_generator.py`: Generates outburst events (Energy, Lorentz factor, jet angle).
*   `multi_messenger_prop.py`: Calculates arrival times and attenuation for GW, EM, UHECR, and MHD shocks.
*   `uhecr_diffusion.py`: 1D Monte Carlo/analytic diffusion model for cosmic rays.
*   `api_endpoints.py`: Websocket/HTTP endpoints to stream wavefront data to the frontend.

**Frontend Structure:** `src/frontend/features/galactic_events/`
*   `GalacticEventController.js`: Orchestrates the timeline and triggers UI/Scene updates.
*   `CompoundWaveVisualizer.js`: Handles the multi-messenger rendering logic.
*   `SuperluminalJetShader.js`: Custom WebGL shader for relativistic beaming and apparent motion.
*   `FermiBubbleRenderer.js`: Volumetric/translucent rendering of the MHD shock structures.
*   `UHECRParticleSystem.js`: Renders the high-energy particle shower arriving at the heliosphere.

---

## Phase 2: Python Backend Implementation (Analytical Physics)

### Step 2.1: The `smbh_constants.py` Module
Define the critical astrophysical data:
*   Sgr_A: `mass_Msun = 4.0e6`, `dist_kpc = 8.178`, `seyfert_flare_time_mya = 3.5`.
*   Cen_A: `mass_Msun = 5.5e7`, `dist_Mpc = 3.8`, `jet_angle_deg = 70`.
*   M87: `mass_Msun = 6.5e9`, `dist_Mpc = 16.4`, `jet_angle_deg = 18`.

### Step 2.2: The `transient_generator.py` Module
Implement a class `SMBHOutburst` that takes parameters: Total Energy ($E_{tot}$), duration, and partition fractions ($E_{GW}, E_{EM}, E_{CR}, E_{MHD}$). It generates a distinct `eventId`.

### Step 2.3: `multi_messenger_prop.py` (The Heart of H1)
Write propagation solvers for the 4 components:
1.  **GW/EM:** `travel_time = Distance / c`. Return instantaneous arrival arrays. Include a Gertsenshtein coupling decay factor $f(r)$ that is high near $r<1$ pc and vanishes at $r>1$ pc (supporting H2).
2.  **UHECR:** Implement a delay function reflecting intergalactic/galactic magnetic field deflection $\Delta t \approx (Distance/c) \times (1 + \delta_{B})$.
3.  **MHD Shock:** Implement Sedov-Taylor expansion: $R(t) = \xi_0 (E / \rho_0)^{1/5} t^{2/5}$. Calculate the exact position of the shockfront at `current_sim_time`.

### Step 2.4: API Integration
Create an endpoint (e.g., `/api/galactic_events/current_status`) that the frontend queries. It returns JSON specifying exact radii of the MHD shock, the current UHECR flux level, and active GW/EM transients.

---

## Phase 3: Three.js Frontend Implementation (3D Visualization)

### Step 3.1: The Event Controller
Create `GalacticEventController.js` to poll the backend. It maintains a state object of active wavefronts and their distances from Sgr A*.

### Step 3.2: Render Fermi Bubbles (The Historical Shock)
In `FermiBubbleRenderer.js`:
*   Use `THREE.InstancedMesh` or a custom shader on a double-sphere geometry.
*   Implement a soft particle/fresnel shader to give them X-ray/Gamma-ray translucency.
*   Position them at `[0, ±radius, 0]` relative to the galactic center coordinate, dynamically sizing based on backend Sedov-Taylor radius.

### Step 3.3: Superluminal Apparent Motion (H3)
In `SuperluminalJetShader.js`:
*   When a new jet event is triggered, visualize a beam from the SMBH.
*   Write a vertex position shader that scales the length of the jet beam using the formula: $\beta_{app} = \beta \sin\theta / (1 - \beta \cos\theta)$.
*   Because the frontend operates in "simulation time", we apply a time-compression multiplier to the jet animation speed, making it cross the screen faster than light-speed markers.

### Step 3.4: UHECR Particle Showers (H4)
In `UHECRParticleSystem.js`:
*   For Centaurus A (located far outside the Milky Way model), instantiate a directional particle emitter.
*   Use `THREE.Points` with a high-intensity glow texture.
*   Animate them permeating the solar system boundary, modulating the intensity based on the backend flux calculations.

---

## Phase 4: Integration and "The Compound Visual"

To tie it all together, we need a special "Compound Transient UI Mode":
1.  **Time-Scrubbing UI:** A slider allowing the user to scrub from T-0 (The Sgr A* Seyfert Flare) to T+25 Million Years.
2.  **Visual Staggering:** 
    *   At T-0, a burst of light and a spacetime ripple (using the existing `gravitationalWaves.js`, but centered on Sgr A*) expand at *c*.
    *   At T+10,000 yr, a haze of high-energy particles diffuses outward, engulfing the system.
    *   At T+5,000,000 yr, the slow-moving Fermi Bubble meshes become visible, expanding outward.
3.  **Heliosphere Reaction:** Connect the incoming UHECR flux and MHD pressure to the solar system's heliopause radius (if modeled), showing a compression of the solar wind cavity when the waves hit.

---

## Summary of Execution Strategy

We are **simultaneously** building the math for the multi-messenger propagation on the backend to feed physically accurate parameters (speeds, radii, fluxes) to the frontend, which will translate those parameters into four distinct visual systems (GW ripples, EM flashes, UHECR particle grids, and Volumetric MHD Bubbles).

This directly answers the prompt to expand the architecture step-by-step while honoring the 5 hypotheses grounded in reality.
