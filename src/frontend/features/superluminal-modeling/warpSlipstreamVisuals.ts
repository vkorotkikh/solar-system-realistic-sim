import {
    ShaderMaterial,
    PlaneGeometry,
    Mesh,
    Vector3,
    DoubleSide,
    Color
} from 'three';
import { h29DisplayThicknessAu } from './h29DisplayScale';
import { AU_CM } from './smbhPhysicsConstants';

const WARP_VERTEX_SHADER = `
uniform float time;
uniform vec3 propagationDir;   // local ecliptic bearing TO the selected source
uniform float enabled;
uniform float shockwaveDist;   // position of the warp bubble center
uniform float bubbleThickness; // sigma
uniform float stretchAmplitude;

varying vec2 vUv;
varying float vWarpIntensity;

void main() {
    vUv = uv;
    if (enabled < 0.5) {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        return;
    }

    // Distance along propagation axis
    float axisPos = dot(position, propagationDir);
    
    // Normalized coordinate relative to bubble center
    // xi = (x - x_0) / sigma
    float xi = (axisPos - shockwaveDist) / bubbleThickness;
    
    // Soliton profile: sech^2(xi)
    float expXi = exp(xi);
    float coshXi = (expXi + 1.0 / expXi) * 0.5;
    float sech2 = 1.0 / (coshXi * coshXi);
    
    // Illustrative displacement along the source-bearing axis. The incoming
    // center moves toward decreasing distance; xi > 0 is the source-facing side.
    
    // The integral of sech^2 is tanh, which gives a cumulative shift.
    // For visual drama, we pull vertices towards the bubble center.
    float tanhXi = (expXi - 1.0/expXi) / (expXi + 1.0/expXi);
    
    // Vertex displacement vector
    vec3 displacement = propagationDir * (-tanhXi * sech2 * stretchAmplitude * bubbleThickness);
    
    // Apply displacement
    vec3 displaced = position + displacement;
    
    // Illustrative displacement normal to the XY ecliptic, not physical lensing.
    displaced.z += sech2 * stretchAmplitude * 0.2;

    vWarpIntensity = sech2;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const WARP_FRAGMENT_SHADER = `
uniform float enabled;
uniform vec3 warpColor;

varying vec2 vUv;
varying float vWarpIntensity;

void main() {
    if (enabled < 0.5) discard;
    if (vWarpIntensity < 0.01) discard;

    // Grid lines
    vec2 grid = abs(fract(vUv * 20.0 - 0.5) - 0.5) / fwidth(vUv * 20.0);
    float line = min(grid.x, grid.y);
    float gridAlpha = 1.0 - min(line, 1.0);
    
    // Base color is a deep violet/ultraviolet
    vec3 baseCol = warpColor;
    
    // Intense white/violet glow at the peak of the soliton
    vec3 peakCol = vec3(1.0, 0.9, 1.0);
    
    // Mix based on intensity
    vec3 finalColor = mix(baseCol * 0.2, peakCol, pow(vWarpIntensity, 1.5));
    
    // Alpha peaks at the bubble center and has grid lines
    float alpha = (gridAlpha * 0.3 + 0.7) * vWarpIntensity;
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;

/**
 * Creates the H29 Metric-Frame-Dragging Slipstream visualization.
 * Renders an Alcubierre-like warp bubble "smoke ring".
 * 
 * @param {number} size - Grid size in scene units
 */
export function createWarpSlipstreamVisualization(size = 20) {
    const geometry = new PlaneGeometry(size, size, 128, 128);
    // PlaneGeometry already lies in the canonical XY ecliptic, normal +Z.

    const material = new ShaderMaterial({
        vertexShader: WARP_VERTEX_SHADER,
        fragmentShader: WARP_FRAGMENT_SHADER,
        uniforms: {
            time: { value: 0 },
            propagationDir: { value: new Vector3(0, 1, 0) },
            enabled: { value: 0 },
            shockwaveDist: { value: 9999.0 },
            bubbleThickness: { value: 2.0 },
            stretchAmplitude: { value: 15.0 }, // Visual amplitude multiplier
            warpColor: { value: new Color(0.6, 0.1, 1.0) } // Deep violet
        },
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        blending: 2 // Additive
    });

    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 2; // Render on top of GW grid
    mesh.frustumCulled = false;
    mesh.visible = false;

    return {
        mesh,

        update(dtSec: number) {
            if (mesh.visible && Number.isFinite(dtSec) && dtSec > 0) material.uniforms.time.value += dtSec;
        },

        toggle(on: boolean) {
            material.uniforms.enabled.value = on ? 1.0 : 0.0;
            mesh.visible = on;
        },

        reset() {
            mesh.visible = false;
            material.uniforms.enabled.value = 0;
            material.uniforms.time.value = 0;
            material.uniforms.shockwaveDist.value = 9999;
            material.uniforms.stretchAmplitude.value = 0;
        },

        /**
         * Set warp bubble physical state.
         * @param state - { positionCm, amplitude, thickness, direction }
         */
        setWarpState(state: any) {
            if (!state) return;

            if (state.positionCm !== undefined) {
                material.uniforms.shockwaveDist.value = state.positionCm / AU_CM;
            }
            if (state.thickness !== undefined) {
                material.uniforms.bubbleThickness.value = h29DisplayThicknessAu(state.thickness);
            }
            if (state.direction) {
                material.uniforms.propagationDir.value.copy(state.direction);
            }
            if (state.amplitude !== undefined) {
                material.uniforms.stretchAmplitude.value = state.amplitude * 15.0;
            }
        },

        getInfoText() {
            return `H29: The Metric-Frame-Dragging Slipstream
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hypothetical transient Alcubierre-like warp bubble
generated by extreme asymmetric SMBH collapse.

Mechanism: Solitary metric perturbation (ADM shift vector)
Effect: Drags local spacetime metric outward
Velocity: Apparent superluminal translation (no kinetic acceleration)
Result: Solar system stretches radially without pulling planets from their orbits.`;
        },

        dispose() {
            mesh.visible = false;
            mesh.removeFromParent();
            geometry.dispose();
            material.dispose();
        }
    };
}
