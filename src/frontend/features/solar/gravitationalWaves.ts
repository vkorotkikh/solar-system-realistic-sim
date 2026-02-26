// @ts-nocheck
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

const GW_VERTEX_SHADER = `
uniform float time;
uniform float frequency;       // Hz
uniform float strainAmplitude; // exaggerated strain
uniform vec3 propagationDir;   // wave propagation direction
uniform float enabled;         // 0.0 = off, 1.0 = on
uniform float isAgnEvent;      // AGN shockwave mode
uniform float shockwaveDist;   // Current distance of shockwave from origin

varying vec2 vUv;
varying float vDistortion;
varying float vAgnGlow;

void main() {
  vUv = uv;
  
  // Wave phase based on position along propagation axis and time
  float phasePos = dot(position, propagationDir) * 0.5;
  float phase = time * frequency * 6.28318 + phasePos;
  
  // + polarization: stretch x, squeeze y
  float hPlus = strainAmplitude * sin(phase) * enabled;
  
  // If AGN event, compute shockwave front
  float axisPos = dot(position, propagationDir);
  vAgnGlow = 0.0;
  if (isAgnEvent > 0.5) {
      // Scale space drastically behind the shockwave front
      float distBehind = axisPos - shockwaveDist;
      if (distBehind < 0.0) {
          // Sharp compression at the front, exponential decay behind
          hPlus += strainAmplitude * exp(distBehind * 0.5) * sin(time * 20.0);
          
          // High energy particle glow at the wavefront boundary
          if (distBehind > -2.0) {
              vAgnGlow = 1.0 - (abs(distBehind) / 2.0);
          }
      } else {
          // Flat ahead of the tsunami
          hPlus = 0.0;
      }
  }
  
  vec3 displaced = position;
  displaced.x *= (1.0 + hPlus);
  displaced.z *= (1.0 - hPlus);
  // Add some vertical FTL turbulence
  if (isAgnEvent > 0.5 && axisPos < shockwaveDist) {
      displaced.y += sin(position.x * 5.0 + time * 10.0) * exp((axisPos - shockwaveDist) * 0.5);
  }
  
  vDistortion = abs(hPlus);
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const GW_FRAGMENT_SHADER = `
uniform float enabled;
uniform float isAgnEvent;
uniform vec3 waveColor;

varying vec2 vUv;
varying float vDistortion;
varying float vAgnGlow;

void main() {
  if (enabled < 0.5) discard;
  
  // Grid lines
  vec2 grid = abs(fract(vUv * 20.0 - 0.5) - 0.5) / fwidth(vUv * 20.0);
  float line = min(grid.x, grid.y);
  float gridAlpha = 1.0 - min(line, 1.0);
  
  // Color distorted regions
  vec3 color = mix(waveColor * 0.3, waveColor, vDistortion * 10.0);
  float alpha = gridAlpha * 0.4 + vDistortion * 2.0;
  
  // AGN Tsunami gamma-ray glowing front
  if (isAgnEvent > 0.5 && vAgnGlow > 0.01) {
      color = mix(color, vec3(1.0, 0.9, 1.0) * 2.0, vAgnGlow); // Blinding white/purple
      alpha += vAgnGlow * 2.5;
  }
  
  gl_FragColor = vec4(color, alpha * 0.5);
}
`;

/**
 * Creates a gravitational wave visualization grid.
 * 
 * @param {number} size - Grid size in scene units
 * @returns {Object} GW visualization object with mesh, update, toggle methods
 */
export function createGWVisualization(size = 10) {
    const geometry = new PlaneGeometry(size, size, 64, 64);
    geometry.rotateX(-Math.PI / 2); // Lay flat on ecliptic plane

    const material = new ShaderMaterial({
        vertexShader: GW_VERTEX_SHADER,
        fragmentShader: GW_FRAGMENT_SHADER,
        uniforms: {
            time: { value: 0 },
            frequency: { value: 50 },           // Hz (LIGO band)
            strainAmplitude: { value: 0.05 },     // Hugely exaggerated (real: 10⁻²¹)
            propagationDir: { value: new Vector3(0, 1, 0) }, // From "above" ecliptic
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

    return {
        mesh,

        /**
         * Update gravitational wave animation.
         * @param {number} dtSec - delta time in seconds
         */
        update(dtSec) {
            material.uniforms.time.value += dtSec;
        },

        /**
         * Toggle GW visualization on/off.
         * @param {boolean} on
         */
        toggle(on) {
            material.uniforms.enabled.value = on ? 1.0 : 0.0;
            mesh.visible = on;
        },

        /**
         * Set GW parameters.
         * @param {Object} params
         */
        setParams({ frequency, strain, direction, isAgnEvent, shockwaveDist }) {
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
            geometry.dispose();
            material.dispose();
        }
    };
}
