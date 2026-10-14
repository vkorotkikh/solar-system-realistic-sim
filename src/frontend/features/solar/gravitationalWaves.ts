/**
 * Gravitational Wave Spacetime Visualization — Phase 12 (Experimental)
 * 
 * EDUCATIONAL ONLY: Gravitational waves have NO measurable effect on solar system dynamics.
 * Peak strain from binary black hole mergers: h ~ 10⁻²¹
 * This stretches the Earth-Sun distance by ~0.15 femtometers (smaller than an atomic nucleus).
 * 
 * This module provides a hugely exaggerated visualization of GW spacetime distortion
 * for educational purposes only.
 * 
 * LIGO sensitivity band: 10-1000 Hz
 * Strain amplitude: h ~ 10⁻²¹ (amplified by 10¹⁸ for visualization)
 */

import {
    GridHelper,
    ShaderMaterial,
    PlaneGeometry,
    Mesh,
    Vector3,
    DoubleSide,
    Color
} from 'three';

interface GwParams {
    frequency?: number;
    strain?: number;
    /** Unit bearing TO the source in the grid's Sun-centered ecliptic frame. */
    direction?: Vector3;
    isAgnEvent?: number;
    shockwaveDist?: number;
}

interface GwVisualization {
    mesh: Mesh;
    update: (dtSec: number) => void;
    toggle: (on: boolean) => void;
    reset: () => void;
    setParams: (params: GwParams) => void;
    getInfoText: () => string;
    dispose: () => void;
}

const GW_VERTEX_SHADER = `
uniform float time;
uniform float frequency;       // Hz
uniform float strainAmplitude; // exaggerated strain
uniform vec3 propagationDir;   // local source bearing; incoming motion is opposite
uniform float enabled;         // 0.0 = off, 1.0 = on
uniform float isAgnEvent;      // AGN shockwave mode
uniform float shockwaveDist;   // Current distance of shockwave from origin

varying vec2 vUv;
varying float vDistortion;
varying vec3 vGridPosition;    // undeformed local ecliptic position, NOT world space

void main() {
  vUv = uv;
  
  float axisPos = dot(position, propagationDir);
  float phasePos = axisPos * 0.5;
  float phase = time * frequency * 6.28318 + phasePos;
  
  float hPlus = strainAmplitude * sin(phase) * enabled;
  
  // If AGN event, compute shockwave front
  if (isAgnEvent > 0.5) {
      // The front distance decreases toward the Sun. The passed side faces
      // the source, so a negative behind-coordinate means axisPos > distance.
      float distBehind = shockwaveDist - axisPos;
      if (distBehind < 0.0) {
          // Sharp compression at the front, exponential decay behind
          float envelope = exp(distBehind * 0.4);
          hPlus += strainAmplitude * 1.5 * envelope * sin(distBehind * 8.0 - time * 15.0);
      } else {
          // Flat ahead of the tsunami
          hPlus = 0.0;
      }
  }
  
  vec3 displaced = position;
  displaced.x *= (1.0 + hPlus);
  displaced.y *= (1.0 - hPlus);
  
  // Illustrative out-of-ecliptic ripple, not a physical GW polarization tensor.
  if (isAgnEvent > 0.5 && axisPos > shockwaveDist) {
      float distBehind = shockwaveDist - axisPos;
      float envelope = exp(distBehind * 0.5);
      displaced.z += sin(position.x * 2.0 + position.y * 1.5 + time * 12.0) * envelope * 2.5 * strainAmplitude;
  }
  
  vDistortion = abs(hPlus);
  
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vGridPosition = position;
  
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const GW_FRAGMENT_SHADER = `
uniform float enabled;
uniform float isAgnEvent;
uniform vec3 waveColor;
uniform vec3 propagationDir;
uniform float shockwaveDist;
uniform float time;

varying vec2 vUv;
varying float vDistortion;
varying vec3 vGridPosition;

// Simple random function
float hash12(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
  if (enabled < 0.5) discard;
  
  // Grid lines
  vec2 grid = abs(fract(vUv * 40.0 - 0.5) - 0.5) / fwidth(vUv * 40.0);
  float line = min(grid.x, grid.y);
  float gridAlpha = 1.0 - min(line, 1.0);
  
  // Color distorted regions
  vec3 color = mix(waveColor * 0.3, waveColor, clamp(vDistortion * 10.0, 0.0, 1.0));
  float alpha = gridAlpha * 0.4 + vDistortion * 2.0;
  
  // AGN Tsunami gamma-ray glowing front
  if (isAgnEvent > 0.5) {
      float axisPos = dot(vGridPosition, propagationDir);
      float distBehind = shockwaveDist - axisPos;
      
      float agnGlow = 0.0;
      if (distBehind < 0.0 && distBehind > -3.0) {
          agnGlow = pow(1.0 - (abs(distBehind) / 3.0), 2.0);
      }
      
      float streaks = hash12(vGridPosition.xy + vec2(time));
      agnGlow *= 0.7 + 0.3 * streaks;
      
      if (agnGlow > 0.01) {
          // Violet (0.5, 0.0, 1.0) mixing into Light Blue (0.4, 0.8, 1.0) and Ultraviolet/Deep Violet
          vec3 extremeColor = mix(vec3(0.4, 0.0, 0.8), vec3(0.4, 0.8, 1.0), agnGlow);
          color = mix(color, extremeColor, agnGlow * 1.5);
          alpha += agnGlow * 3.0;
      }
  }
  
  gl_FragColor = vec4(color, min(alpha * 0.6, 1.0));
}
`;

/**
 * Creates a gravitational wave visualization grid.
 * 
 * @param {number} size - Grid size in scene units
 * @returns {Object} GW visualization object with mesh, update, toggle methods
 */
export function createGWVisualization(size = 10): GwVisualization {
    const geometry = new PlaneGeometry(size, size, 384, 384);
    // PlaneGeometry already lies in XY, the canonical J2000 ecliptic (+Z north).
    // Parent transforms affect presentation only; phase/glow share this local frame.

    const material = new ShaderMaterial({
        vertexShader: GW_VERTEX_SHADER,
        fragmentShader: GW_FRAGMENT_SHADER,
        uniforms: {
            time: { value: 0 },
            frequency: { value: 50 },           // Hz (LIGO band)
            strainAmplitude: { value: 0.05 },     // Hugely exaggerated (real: 10⁻²¹)
            propagationDir: { value: new Vector3(0, 1, 0) }, // Local ecliptic source bearing
            enabled: { value: 0 },               // Off by default
            isAgnEvent: { value: 0.0 },          // AGN mode off
            shockwaveDist: { value: 9999.0 },
            waveColor: { value: new Color(0.3, 0.6, 1.0) }  // Blue-ish
        },
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        blending: 2 // Additive blending for better glowing effect
    });

    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    mesh.visible = false;

    return {
        mesh,

        /**
         * Update gravitational wave animation.
         * @param {number} dtSec - delta time in seconds
         */
        update(dtSec: number) {
            if (mesh.visible && Number.isFinite(dtSec) && dtSec > 0) material.uniforms.time.value += dtSec;
        },

        /**
         * Toggle GW visualization on/off.
         * @param {boolean} on
         */
        toggle(on: boolean) {
            material.uniforms.enabled.value = on ? 1.0 : 0.0;
            mesh.visible = on;
        },

        reset() {
            mesh.visible = false;
            material.uniforms.enabled.value = 0;
            material.uniforms.time.value = 0;
            material.uniforms.isAgnEvent.value = 0;
            material.uniforms.strainAmplitude.value = 0;
            material.uniforms.shockwaveDist.value = 9999;
        },

        /**
         * Set GW parameters.
         * @param {Object} params
         */
        setParams({ frequency, strain, direction, isAgnEvent, shockwaveDist }: GwParams) {
            if (frequency !== undefined) material.uniforms.frequency.value = frequency;
            if (strain !== undefined) material.uniforms.strainAmplitude.value = strain;
            if (direction) material.uniforms.propagationDir.value.copy(direction);
            if (isAgnEvent !== undefined) material.uniforms.isAgnEvent.value = isAgnEvent;
            if (shockwaveDist !== undefined) material.uniforms.shockwaveDist.value = shockwaveDist;
        },

        /**
         * Get info text for UI tooltip.
         */
        getInfoText() {
            return `Gravitational Wave Visualization (Educational)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Real strain amplitude: h ≈ 10⁻²¹
Displayed amplification: ×10¹⁸
Earth-Sun distance change: ~0.15 femtometers
(smaller than an atomic nucleus)

This visualization is HUGELY exaggerated for educational purposes.
Real gravitational waves have zero measurable effect on solar system dynamics.

Source: LIGO/Virgo Collaboration
Detection band: 10-1000 Hz`;
        },

        dispose() {
            mesh.visible = false;
            mesh.removeFromParent();
            geometry.dispose();
            material.dispose();
        }
    };
}
