# Implementation Plan: Sgr A* Transient Shockwaves Phase 1

This plan covers the implementation of the first phase of the Supermassive Black Hole (SMBH) Shockwave model: Fermi Bubble renderer and Sgr A transient timeline visualization*.

## Proposed Changes

### 1. `src/frontend/features/galactic/fermiBubbleRenderer.js` [NEW]
* Create a Three.js module to render the Fermi Bubbles and eROSITA Bubbles as translucent volumes above and below the galactic plane.
* Add geometry and custom shaders for the expanding shockwave front.
* Include parameters for scale, age, and energy to match the timeline.

### 2. `src/frontend/features/galactic/sgrATimeline.js` [NEW]
* Create a timeline controller that manages the emission and propagation of the multi-messenger transient.
* Handle different speeds for GWs (c), Multi-wavelength EM (c), and UHECRs / MHD blast waves (<c).
* Connect the timeline to the UI controls to allow scrubbing through the "Years since emission" of a major flare.

### 3. `src/main.js` [MODIFY]
* Import the new fermiBubbleRenderer and sgrATimeline modules.
* Initialize the Fermi Bubbles within the Three.js scene.
* Update the render loop to advance the timeline and update bubble geometry/visuals.

### 4. `index.html` & `index.css` [MODIFY]
* Add the UI for the Sgr A* Outburst Timeline.
* Add a slider for "Years since Emission".
* Add a toggle for compound shockwave propagation visualization.

## Verification Plan

### Manual Verification
1. Start the development server (`npm run dev`).
2. Open the application in the browser.
3. Verify that the Fermi Bubbles are visible in the galactic view.
4. Manipulate the "Years since emission" timeline slider and verify that the multi-components of the shockwave (GW, EM, CR, MHD) expand at their respective speeds in the visualization.
5. Verify that performance is acceptable when the new shaders are active.
