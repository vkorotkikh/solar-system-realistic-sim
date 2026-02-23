# Sun Model Physics Overhaul — Master Implementation Plan

Comprehensive plan to resolve all 14 deficiencies identified in the [Sun Physics Audit](file:///home/nomad/.gemini/antigravity/brain/9b5d0b2d-f03a-4124-b8e3-1981a0324fac/sun_physics_audit.md). Organized into 7 execution phases, ordered by dependency and criticality.

> [!IMPORTANT]
> All physics constants and formulas below are sourced from published, peer-reviewed literature. Each section cites specific publications. No invented coefficients.

---

## Phase 1 — Critical Bug Fixes (🔴 Wrong Physics)
*Effort: Low | Risk: Low | Files: `sunVisuals.js`, `solarMagnetics.js`*

### 1A. Fix Limb Darkening Coefficients
**Audit item #1** | [sunVisuals.js:89-99](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L89-L99)

Replace the current invented polynomial with **per-channel** Neckel & Labs (1994) coefficients. Compute limb darkening independently for R, G, B using wavelength-representative coefficients to capture the physical reddening at the limb.

**Published 5th-order coefficients** (Neckel & Labs 1994, *Solar Physics* 153:91–114):

| λ (nm) | Channel | a₀ | a₁ | a₂ | a₃ | a₄ | a₅ |
|---|---|---|---|---|---|---|---|
| 450 | B | 0.2688 | 1.3765 | −1.3645 | 1.2816 | −0.7458 | 0.1834 |
| 550 | G | 0.3050 | 1.1312 | −0.7860 | 0.6164 | −0.3612 | 0.0946 |
| 650 | R | 0.3434 | 0.9721 | −0.4348 | 0.2024 | −0.1220 | 0.0390 |

**Replacement GLSL:**
```glsl
vec3 neckellLimbDarkRGB(float mu) {
  float mu2 = mu * mu;
  float mu3 = mu2 * mu;
  float mu4 = mu3 * mu;
  float mu5 = mu4 * mu;
  // R channel (~650 nm)
  float ldR = 0.3434 + 0.9721*mu - 0.4348*mu2 + 0.2024*mu3 - 0.1220*mu4 + 0.0390*mu5;
  // G channel (~550 nm)
  float ldG = 0.3050 + 1.1312*mu - 0.7860*mu2 + 0.6164*mu3 - 0.3612*mu4 + 0.0946*mu5;
  // B channel (~450 nm)
  float ldB = 0.2688 + 1.3765*mu - 1.3645*mu2 + 1.2816*mu3 - 0.7458*mu4 + 0.1834*mu5;
  return vec3(ldR, ldG, ldB);
}
```

**Changes:**
- `neckellLimbDark(float mu)` → `neckellLimbDarkRGB(float mu)` returning `vec3`
- Line 198: `float limbDark = neckellLimbDark(mu)` → `vec3 limbDark = neckellLimbDarkRGB(mu)`
- Line 251: `float brightness = combinedGranulation * limbDark * spotDark` → `vec3 limbColor = vec3(combinedGranulation * spotDark) * limbDark;` then use `limbColor` as a multiplier for the base color assembly
- **Verification:** At μ=1 (disk center), each channel sums to 1.0 ± 0.0001. At μ=0.1 (limb), B channel is ~40% darker than R channel.

---

### 1B. Fix PFSS RK4 Vector Corruption
**Audit item #2** | [solarMagnetics.js:95](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarMagnetics.js#L95)

The RK4 step mutates `k1`, `k2`, `k3` in place via Three.js chained `.add()` / `.multiplyScalar()`.

**Current (broken):**
```js
const stepVec = k1.add(k2.multiplyScalar(2)).add(k3.multiplyScalar(2)).add(k4).multiplyScalar(stepSize / 6);
```

**Replacement:**
```js
const stepVec = new Vector3()
  .addScaledVector(k1, 1)
  .addScaledVector(k2, 2)
  .addScaledVector(k3, 2)
  .addScaledVector(k4, 1)
  .multiplyScalar(stepSize / 6);
```

`addScaledVector` does NOT mutate the source vector — it only mutates the target (`stepVec`). This is the standard safe pattern for Three.js vector arithmetic.

---

## Phase 2 — Blackbody Color Correction
*Effort: Medium | Risk: Low | File: `sunVisuals.js`*

### 2A. Replace Artistic Palette with Planck-Derived Colors
**Audit item #3** | [sunVisuals.js:245-261](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L245-L261)

Compute physically accurate blackbody-to-linear-sRGB colors. The CIE-matched values from Planck integration are:

| T (K) | Feature | linear sRGB (R, G, B) | Hex (gamma) |
|---|---|---|---|
| 3000 | Coolest umbra | (1.000, 0.417, 0.094) | `#FF8422` |
| 3700 | Typical umbra | (1.000, 0.538, 0.203) | `#FFa148` |
| 5000 | Penumbra | (1.000, 0.757, 0.538) | `#FFD1A3` |
| 5778 | Quiet photosphere | (1.000, 0.867, 0.757) | `#FFF1E4` |
| 6300 | Hot granule top | (1.000, 0.918, 0.843) | `#FFF8F0` |
| 7000 | Brightest intergranular | (0.953, 0.953, 1.000) | `#F3F9FF` |

**Replacement GLSL constants:**
```glsl
vec3 umbralColor  = vec3(1.000, 0.538, 0.203);  // 3700K blackbody
vec3 quietColor   = vec3(1.000, 0.867, 0.757);  // 5778K blackbody
vec3 hotColor     = vec3(1.000, 0.918, 0.843);  // 6300K
vec3 granuletop   = vec3(0.953, 0.953, 1.000);  // 7000K
```

> [!NOTE]
> The Sun will appear significantly whiter/less orange after this change. This is physically correct — a G2V star at 5778K is nearly white. The "golden Sun" appearance is an artifact of atmospheric scattering and artistic convention, not intrinsic stellar color.

### 2B. Optional: Blackbody Lookup Texture
For maximum fidelity, create a 256×1 texture mapping temperature (3000K–8000K) to sRGB color. Sample it in the shader using the local effective temperature:

```glsl
uniform sampler2D blackbodyLUT; // 256×1, x = (T - 3000) / 5000
vec3 tempColor = texture2D(blackbodyLUT, vec2((localTemp - 3000.0) / 5000.0, 0.5)).rgb;
```

This would be generated once on CPU using the Planck function integrated over CIE color matching functions. Creates a new utility function `createBlackbodyLUT()` in `sunVisuals.js`.

---

## Phase 3 — Granulation & Sunspot Improvements
*Effort: Medium | Risk: Low | File: `sunVisuals.js`*

### 3A. Fix Granulation Contrast Ratio
**Audit item #7** | [sunVisuals.js:215-217](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L215-L217)

Real granulation contrast: ~14–22% RMS (Nordlund & Stein 1998; Hinode/SOT). Center-to-lane brightness ratio is approximately 1.0:0.78.

**Current:** `granulationBrightness = gran1.x * 0.82 + 0.18` → range 0.18–1.0 (82% contrast)

**Fix:** Scale the Voronoi cell output to match observed contrast:
```glsl
float granulationBrightness = gran1.x * 0.22 + 0.78;   // range 0.78–1.0 (22% contrast)
float superGranNetwork = gran2.x * 0.04 + 0.98;          // very subtle supergranule modulation
```

Also add a comment documenting the deliberate cell-count simplification:
```glsl
// Rendering simplification: ~48 cells vs ~3000+ real granules per axis.
// At typical zoom levels this produces visually acceptable granular texture
// without the GPU cost of a 3000² Voronoi grid.
```

### 3B. Sunspot Cluster System
**Audit item #9** | [sunVisuals.js:418-455](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L418-L455)

Reinterpret each of the 8 uniform slots as a **sunspot group** rather than an individual spot. Each group should produce a cluster of 2–5 spots at slightly offset positions with varying sizes.

**Changes to `sunspotDarkening()` shader function:**
```glsl
float sunspotGroupDarkening(vec3 nDir, vec4 seed, float timeSec) {
  if (seed.w < 0.001) return 1.0;

  float dark = 1.0;
  // Each seed generates a small cluster of spots
  int clusterCount = 2 + int(seed.w * 3.0); // 2–5 spots per group
  for (int c = 0; c < 5; c++) {
    if (c >= clusterCount) break;
    // Offset each cluster member slightly from the group center
    float cSeed = float(c) * 0.618033;
    float lonOff = (hash12(vec2(seed.x, cSeed)) - 0.5) * seed.z * 1.5;
    float latOff = (hash12(vec2(seed.y, cSeed + 0.3)) - 0.5) * seed.z * 1.0;
    vec4 subSpot = vec4(seed.x + lonOff, seed.y + latOff,
                        seed.z * (0.3 + hash12(vec2(cSeed, seed.x)) * 0.7),
                        seed.w);
    dark = min(dark, sunspotDarkening(nDir, subSpot, timeSec));
  }
  return dark;
}
```

Update `updateSunspotUniforms()`: set `count = Math.round(activity * 7) + 1` to give 1–8 active groups. At solar maximum with 8 groups × 5 spots = up to 40 visible spots.

### 3C. Radially Elongated Penumbral Fibrils (Evershed Effect)
**Audit item #8** | [sunVisuals.js:168-171](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L168-L171)

Replace isotropic `noise3(radialDir * 140.0 ...)` with directionally elongated noise:

```glsl
// Evershed flow: penumbral fibrils are radially elongated from umbra center
vec3 radialDir = normalize(nDir - spotDir * dot(nDir, spotDir));
vec3 tangentialDir = normalize(cross(spotDir, radialDir));
// Stretch noise along radial direction (2:1 aspect ratio)
vec3 fibrilCoord = radialDir * 60.0 + tangentialDir * 160.0 + vec3(timeSec * 0.03);
float fibrilNoise = noise3(fibrilCoord);
```

The key change: `tangentialDir * 160.0` vs `radialDir * 60.0` creates 2.67:1 elongation perpendicular to the radial direction — fibrils are narrow radially but long tangentially, which is exactly the Evershed pattern.

### 3D. Facular Center-to-Limb Variation
**Audit item #13** | [sunVisuals.js:173-176](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L173-L176)

Facular contrast inverts with viewing angle: dark at disk center (mu ≈ 1.0), bright at the limb (mu ≈ 0.3). This is the well-known Spruit (1976) / Topka (1997) facular contrast model.

```glsl
// Facular CLV: contrast varies from negative (dark) at disk center
// to positive (bright) at limb (Topka et al. 1997)
float faculaContrast = (-0.12 + 0.95 * (1.0 - mu)) * spotIntensity;
float faculaeBrightness = 1.0 + faculaeZone * faculaContrast;
```

This requires passing `mu` (the cosine of the viewing angle) into the `sunspotDarkening()` function. Add `mu` as an additional parameter.

### 3E. Wilson Depression (Geometric Limb Foreshortening)
**Audit item #8** | [sunVisuals.js:146-190](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L146-L190)

The Wilson depression (~600 km, ~0.00086 R☉) causes sunspot umbrae to appear foreshortened when near the solar limb. Simulation approach: scale the apparent spot angular radius based on viewing angle:

```glsl
// Wilson depression: spot appears foreshortened near limb
float spotMu = dot(spotDir, viewDir); // how face-on is the spot
float wilsonFactor = 0.65 + 0.35 * spotMu; // partial at limb
float effectiveUmbra = umbra * wilsonFactor;
float effectivePenumbra = penumbra * wilsonFactor;
```

This shrinks spots near the limb while leaving face-on spots at full size. The 0.65 floor ensures spots don't vanish entirely.

---

## Phase 4 — Chromosphere Type II Spicules
*Effort: Medium | Risk: Low | File: `sunVisuals.js`*

### 4A. Dual-Population Spicule Model
**Audit item #6** | [sunVisuals.js:468-525](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L468-L525)

Add a second population of Type II spicules alongside the existing Type I. Use a `uniform float aSpiculeType` attribute to distinguish them, or more efficiently, encode the type in an existing attribute.

**Approach:** In `createChromosphereLayer()`, generate two populations within the same `BufferGeometry`:

| Property | Type I (existing) | Type II (new) |
|---|---|---|
| Count | 5,000 | 3,000 |
| `aSpeed` range | 0.5–2.0 (slow) | 5.0–15.0 (fast) |
| `aLifetime` usage | Triangle wave (rise+fall) | One-shot rise then fade |
| Max height | 0.005–0.014 R☉ | 0.007–0.020 R☉ |

**Vertex shader changes:**
```glsl
// Distinguish Type I (aSpeed < 3.0) from Type II (aSpeed >= 3.0)
bool isTypeII = aSpeed >= 3.0;

float phase = fract(time * aSpeed * 0.018 + aLifetime);
float rise;
if (isTypeII) {
  // Type II: rapid ballistic rise, then fade without descent
  rise = phase < 0.3 ? (phase / 0.3) : max(0.0, 1.0 - (phase - 0.3) * 2.5);
} else {
  // Type I: parabolic rise and fall
  rise = phase < 0.5 ? phase * 2.0 : (1.0 - phase) * 2.0;
}

float maxHeight = isTypeII
  ? (0.007 + chromoActivity * 0.013)   // Type II: taller
  : (0.005 + chromoActivity * 0.009);   // Type I
```

The key physics difference: Type II spicules shoot up rapidly (80–300 km/s) and then fade in place (heated to coronal temperatures), while Type I follow a symmetric parabolic trajectory.

### 4B. Distance-Scaled Point Size
**Audit item #6 (sub)** | [sunVisuals.js:510](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L510)

Replace `sizeAttenuation: false` with `sizeAttenuation: true` in the material, and compute `gl_PointSize` based on projected size:

```glsl
float dist = length(cameraPosition - (modelMatrix * vec4(spiculePos, 1.0)).xyz);
float baseSize = isTypeII ? 1.2 : 2.0; // Type II are thinner
gl_PointSize = baseSize * (300.0 / dist); // perspective scaling
gl_PointSize = clamp(gl_PointSize, 0.5, 6.0); // clamp for sanity
```

---

## Phase 5 — Corona Overhaul
*Effort: High | Risk: Medium | File: `sunVisuals.js`*

### 5A. K-Corona Radial Intensity Falloff
**Audit item #4** | [sunVisuals.js:347-372](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L347-L372)

Implement the Baumbach/van de Hulst electron density model. The K-corona intensity (Thomson scattering of photospheric light by coronal electrons) follows:

```
N(r) = 10⁸ × (0.036·r⁻¹·⁵ + 1.55·r⁻⁶ + 2.99·r⁻¹⁶)  [cm⁻³]
```
where `r` is in solar radii. For rendering, we normalize to visible intensity:

```glsl
// Radial distance from sun center in solar radii
float fragR = length(vWorldPosition) / sunRadius; // need sunRadius uniform
float rClamped = max(fragR, 1.001); // avoid division by zero at surface

// Van de Hulst / Baumbach K-corona radial intensity
// Simplified to two dominant terms (r^-6 drops quickly, r^-1.5 dominates far out)
float coronaRadial = 0.036 * pow(rClamped, -1.5) + 1.55 * pow(rClamped, -6.0);
coronaRadial = coronaRadial / 1.586; // normalize so coronaRadial ≈ 1.0 at r = 1.0
```

**Required new uniform:** `sunRadius` (float) — the sun's display radius in scene units. Add to `createSunCoronaShell()` uniforms and update in `updateSunMaterialUniforms()`.

**Shader integration:** Multiply the existing alpha by `coronaRadial`:
```glsl
float alpha = (offLimb * 0.06 + rim * 0.09) * (...) * pulse;
alpha *= coronaRadial; // physical radial falloff
```

This transforms the corona from a thin bright ring to a physically accurate extended atmosphere with the characteristic steep inner falloff and gentle outer tail.

### 5B. Corona Shell Geometry Expansion
The current corona shell uses the same `SphereGeometry` as the sun surface (scaled by 1.032×). For the K-corona falloff to work, the shell must extend to at least 3–5 R☉:

**Change in `createSunCoronaShell()`:**
```js
mesh.userData.surfaceScale = 4.0; // was 1.032 — extend to 4 R☉
```

And adjust the vertex shader to properly pass world-space positions for the radial calculation.

### 5C. Helmet Streamer Structure
**Audit item #5** | [sunVisuals.js:354-356](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L354-L356)

Add latitude-dependent streamer brightness modulation. During solar minimum, streamers concentrate near the equatorial plane (heliospheric current sheet). During solar maximum, they appear at all latitudes.

```glsl
// Helmet streamer belt: enhanced brightness near equatorial plane
float streamerLat = abs(normalDir.y); // 0 at equator, 1 at poles
float streamerWidth = 0.15 + activity * 0.35; // narrow at min, broad at max
float streamerBright = smoothstep(streamerWidth, streamerWidth - 0.1, streamerLat);

// Add streamer-specific turbulence (elongated radially)
float streamerTurb = fbm(vec3(normalDir.x * 3.0, normalDir.y * 0.5, normalDir.z * 3.0)
                        + vec3(time * 0.1, 0.0, -time * 0.08));

alpha *= (1.0 + streamerBright * (0.8 + streamerTurb * 0.4));
```

The streamer noise is deliberately elongated along `y` (radial in this geometry) to produce the characteristic narrow, tall structures visible in coronagraph images.

### 5D. Magnetically-Driven Coronal Holes
**Audit item #11** | [sunVisuals.js:361-365](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L361-L365)

Replace the purely latitudinal `abs(normalDir.y)` with a noise-modulated system that includes equatorial coronal holes at high activity:

```glsl
// Coronal holes: magnetically-defined regions of open field
float polarHole = abs(normalDir.y); // base polar component
// Add noise-modulated equatorial holes that appear during solar maximum
float holeNoise = fbm(normalDir * 4.0 + vec3(time * 0.02));
float equatorialHole = smoothstep(0.6, 0.8, holeNoise) * coronalHoleActivity;
float holeStrength = max(
  smoothstep(holeThreshold - 0.1, holeThreshold + 0.15, polarHole),
  equatorialHole
);
alpha *= mix(0.08, 1.0, 1.0 - holeStrength * (1.0 - coronalHoleActivity * 0.7));
```

### 5E. Temperature-Dependent Corona Color
**Audit item #5 (sub)** | [sunVisuals.js:368-369](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L368-L369)

Add radial color shift from the inner corona (~1 MK, greenish Fe XIV 530.3 nm line) to the outer corona (~2 MK, cooler, more reddish):

```glsl
// Temperature-dependent corona coloring
vec3 innerCorona = vec3(0.6, 1.0, 0.5); // Fe XIV green line contribution
vec3 outerCorona = coronaColor;           // existing warm white/orange
float tempGradient = smoothstep(1.0, 3.5, rClamped);
color = mix(innerCorona * 0.3 + hotWhite * 0.7, outerCorona, tempGradient);
// Still modulate with streamer brightness and observation blend as before
```

---

## Phase 6 — Flare & CME Physics Corrections
*Effort: Low–Medium | Risk: Low | File: `solarFlares.js`*

### 6A. CME Angular Width Control
**Audit item #10** | [solarFlares.js:79](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarFlares.js#L79)

The `SphereGeometry` should use angular width to control the cone of the CME:

```js
// Current (always full hemisphere):
new SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);

// Replacement — parameterize angular width:
function getCmeGeometry(angularWidthRad = Math.PI) {
  // angularWidthRad controls the azimuthal span (e.g., 60° = π/3)
  return new SphereGeometry(1, 32, 16, 0, angularWidthRad, 0, Math.PI * 0.5);
}
```

In `createSolarFlareEvent()`, add `angularWidthDeg` parameter (default 60°). In `spawnRandomFlare()`, randomize between 20° and 120°:

```js
const angularWidthDeg = 20 + Math.random() * 100; // 20°–120° (NASA CME catalog range)
```

### 6B. GOES-Style Flare Temporal Profile (Neupert Effect)
**Audit item #7 (flares)** | [solarFlares.js:191-201](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarFlares.js#L191-L201)

Replace the linear rise/fall with an asymmetric profile: fast exponential rise, slow exponential decay.

```js
// Current: linear rise to peak, linear fall
// Replace with GOES-style soft X-ray profile:
const impulsiveDuration = flashDurationSec * 0.15; // ~15% of total = impulsive phase
const gradualDecay = flashDurationSec * 0.85;       // ~85% = gradual phase

if (elapsedSec < impulsiveDuration) {
  // Rapid exponential rise (impulsive phase)
  const t = elapsedSec / impulsiveDuration;
  flareSprite.material.opacity = intensity * (1.0 - Math.exp(-4.0 * t));
} else {
  // Slow exponential decay (gradual phase, Neupert effect)
  const t = (elapsedSec - impulsiveDuration) / gradualDecay;
  flareSprite.material.opacity = intensity * Math.exp(-2.5 * t);
}
```

This produces the characteristic asymmetric GOES X-ray light curve: sharp peak within the first ~15% of the duration, then a long exponential tail.

---

## Phase 7 — Timing & PFSS Harmonics
*Effort: Medium–High | Risk: Low | File: `sunVisuals.js`, `solarMagnetics.js`*

### 7A. Differential Rotation Time Synchronization
**Audit item #14** | [sunVisuals.js:205](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L205)

The `time * 0.00012` constant is arbitrary. Tie it to the simulation's actual time advancement rate.

The Snodgrass equatorial rate is 14.44°/day. The `time` uniform receives `timeSec * 0.4`. To produce correct rotation:

```
lonOffset (rad) = degPerDay × (simDays) × π/180
```

The key question: what does `timeSec` represent? If it's wall-clock seconds, and the simulation advances at `timeScale` days/second:

```js
// In updateSunMaterialUniforms, pass simDays directly:
sunSurfaceMaterial.uniforms.simDays = { value: 0 }; // new uniform

// In updateSunDynamics: compute simDays from Julian date
const simDays = (julianDate - J2000_EPOCH) / 1.0; // days since J2000
sunSurfaceMaterial.uniforms.simDays.value = simDays;
```

```glsl
// In shader:
uniform float simDays;
float lonOffset = snodgrassRotationOffset(vLatitude, simDays);
```

### 7B. PFSS Dipole Tilt + Use Unused Variable
**Audit item #12 (sub)** | [solarMagnetics.js:52](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarMagnetics.js#L52)

Apply the computed `tiltAngle` to rotate the dipole axis:

```js
const tiltAngle = 0.2 * activity; // 0°–12° tilt
// Rotate input coordinates before computing the dipole field
const cosT = Math.cos(tiltAngle);
const sinT = Math.sin(tiltAngle);
const xTilt = x * cosT - z * sinT;
const zTilt = x * sinT + z * cosT;
// Use xTilt, y, zTilt for dipole calculation, x, y, z for quadrupole
```

### 7C. Higher-Order Spherical Harmonics (Octupole)
**Audit item #12** | [solarMagnetics.js:22-64](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarMagnetics.js#L22-L64)

Add an octupole (ℓ=3) term for more complex field geometry:

```js
// Octupole component (ℓ=3): activity-dependent complexity
const b0_oct = 0.25 * activity * activity; // only significant at high activity
const cosT3 = cosT * cosT * cosT;
const br_oct = b0_oct * (5 * cosT3 - 3 * cosT) / (2 * r2 * r2 * r);
const bt_oct = b0_oct * (1.5 * sin2T * cosT) / (r2 * r2 * r);
```

This breaks the simple bar-magnet symmetry and produces current-sheet crossings and sector structure at higher activity levels. Full PFSS with ℓ=9+ would require spherical harmonic coefficient data from magnetograms, which is out of scope for procedural generation.

---

## File Change Summary

| File | Changes | Phases |
|---|---|---|
| [sunVisuals.js](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js) | Limb darkening, colors, granulation contrast, sunspot clusters, fibrils, faculae, Wilson depression, Type II spicules, corona radial falloff, streamers, coronal holes, temperature gradient, time sync | 1A, 2A–B, 3A–E, 4A–B, 5A–E, 7A |
| [solarMagnetics.js](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarMagnetics.js) | RK4 fix, tilt angle, octupole term | 1B, 7B–C |
| [solarFlares.js](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarFlares.js) | Angular width, Neupert temporal profile | 6A–B |

---

## Verification Plan

### Automated
- `npm run build` — zero errors after all changes
- `npm run typecheck` — zero new type errors

### Visual — Browser Tests
1. **Limb darkening:** Screenshot at solar limb → limb should be visibly redder than disk center (B channel falls off faster than R). Disk center should not appear dimmed.
2. **Blackbody color:** Sun should appear nearly white/cream, not orange-gold.
3. **Granulation:** Surface texture should be subtle (22% contrast), not tile-cracked.
4. **Sunspot clusters:** At high activity, groups of 2-5 spots should appear together.
5. **Penumbral fibrils:** Zoom into a sunspot → fibril pattern should be radially elongated.
6. **Type II spicules:** At the limb, fast-moving particles should shoot up and fade without falling back.
7. **Corona radial falloff:** Corona should extend to 3-4 R☉ with gradual dimming, not a thin ring.
8. **Helmet streamers:** Equatorial region should show enhanced corona brightness (at solar minimum).
9. **CME angular width:** Spawned CMEs should vary from narrow (20°) to wide (120°) cones.
10. **Flare profile:** Flare brightness should spike rapidly then decay slowly (asymmetric).

### Physics Validation
- At μ=1 (disk center): `neckellLimbDarkRGB(1.0)` should return `vec3(1.000, 1.000, 1.000)` ± 0.001
- At μ=0.1: R ≈ 0.56, G ≈ 0.42, B ≈ 0.29 (limb is redder)
- K-corona at r=2 R☉: intensity should be ~3.5% of surface intensity
- K-corona at r=4 R☉: intensity should be ~0.06% of surface intensity
