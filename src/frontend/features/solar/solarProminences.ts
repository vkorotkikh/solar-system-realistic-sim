/**
 * Solar Prominences & Filaments — Phase 8A
 * 
 * Prominences are magnetically suspended plasma arches extending 10-100 Mm above
 * the photosphere at 5,000-8,000K (100× cooler and 100× denser than corona).
 * 
 * At the limb: bright Hα reddish-pink emission
 * On disk: dark absorption ("filament") against photosphere
 * 
 * Physics references:
 * - Height: 10-100 Mm (0.014-0.14 R☉)
 * - Temperature: ~10,000K
 * - Eruption velocity: 600-1000+ km/s
 * - Quiescent lifetime: weeks-months
 * - Active region lifetime: hours-days
 */

import {
    Group,
    Vector3,
    BufferGeometry,
    Float32BufferAttribute,
    ShaderMaterial,
    AdditiveBlending,
    Color,
    Points,
    DoubleSide,
    CatmullRomCurve3
} from 'three';

const AU_M = 1.496e11;

// ─── Prominence Vertex Shader ─────────────────────────────────────────────────
const PROMINENCE_VERTEX_SHADER = `
uniform float time;
uniform float sunRadius;
uniform float opacity;
uniform float eruptionPhase; // 0 = stable, 0..1 = erupting

attribute float aParticlePhase;  // [0,1] position along the arch
attribute float aParticleLayer;  // [0,1] thickness offset

varying float vAlpha;
varying float vArchPos;    // 0 at footpoints, 1 at apex
varying vec3 vWorldPos;

void main() {
  vArchPos = sin(aParticlePhase * 3.14159265); // parabolic arch profile
  
  // Eruption: particles accelerate outward
  float eruptionLift = eruptionPhase * eruptionPhase * 0.3 * vArchPos;
  
  vec3 pos = position;
  // Lift particles outward during eruption
  vec3 outDir = normalize(pos);
  pos += outDir * eruptionLift * sunRadius;
  
  // Slight plasma oscillation
  float oscillation = sin(time * 2.0 + aParticlePhase * 12.0) * 0.001 * sunRadius;
  pos += outDir * oscillation;
  
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
  
  // Distance-scaled point size
  float dist = length(cameraPosition - vWorldPos);
  gl_PointSize = clamp(2.5 * (200.0 / max(dist, 0.001)), 0.8, 8.0);
  
  // Fade with eruption and at footpoints
  vAlpha = opacity * (0.3 + 0.7 * vArchPos) * (1.0 - eruptionPhase * 0.6);
}
`;

// ─── Prominence Fragment Shader ───────────────────────────────────────────────
const PROMINENCE_FRAGMENT_SHADER = `
uniform vec3 prominenceColor;
uniform vec3 sunCenter;         // world-space sun center
uniform float sunRadius;
uniform float isOnDisk;         // 0.0 = off-limb emission, 1.0 = on-disk filament

varying float vAlpha;
varying float vArchPos;
varying vec3 vWorldPos;

void main() {
  if (vAlpha < 0.01) discard;
  
  // Circular particle shape
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float softEdge = 1.0 - smoothstep(0.5, 1.0, d);
  
  // Brighter at arch apex where plasma is densest
  vec3 color = prominenceColor * (0.7 + 0.3 * vArchPos);
  
  gl_FragColor = vec4(color, vAlpha * softEdge);
}
`;

/**
 * Create a catenary-approximation prominence arch between two footpoints.
 * 
 * @param {Object} opts
 * @param {number} opts.footLon1 - longitude of first footpoint (rad)
 * @param {number} opts.footLat1 - latitude of first footpoint (rad)
 * @param {number} opts.footLon2 - longitude of second footpoint (rad)
 * @param {number} opts.footLat2 - latitude of second footpoint (rad)
 * @param {number} opts.maxHeight - peak height in solar radii (0.01-0.15)
 * @param {number} opts.sunDisplayRadius - rendered sun radius in scene units
 * @param {number} opts.particleCount - number of particles along the arch
 * @returns {Object} Prominence object with group, update, isExpired, dispose methods
 */
interface CreateProminenceOpts {
    footLon1: number;
    footLat1: number;
    footLon2: number;
    footLat2: number;
    maxHeight?: number;
    sunDisplayRadius: number;
    particleCount?: number;
    lifetime?: number;
    isQuiescent?: boolean;
    eruptionChance?: number;
}

interface Prominence {
    group: Group;
    footLon1: number;
    footLat1: number;
    footLon2: number;
    footLat2: number;
    maxHeight: number;
    isQuiescent: boolean;
    update(dtSec: number): void;
    isExpired(): boolean;
    dispose(): void;
}

export function createProminence({
    footLon1,
    footLat1,
    footLon2,
    footLat2,
    maxHeight = 0.05,
    sunDisplayRadius,
    particleCount = 200,
    lifetime = 600,
    isQuiescent = true,
    eruptionChance = 0.05
}: CreateProminenceOpts): Prominence {
    const group = new Group();

    // Convert spherical to Cartesian at sun surface
    function sphereToCart(lon: number, lat: number, r: number) {
        return new Vector3(
            r * Math.cos(lat) * Math.cos(lon),
            r * Math.sin(lat),
            -r * Math.cos(lat) * Math.sin(lon)
        );
    }

    const foot1 = sphereToCart(footLon1, footLat1, sunDisplayRadius);
    const foot2 = sphereToCart(footLon2, footLat2, sunDisplayRadius);
    const midpoint = foot1.clone().add(foot2).multiplyScalar(0.5);
    const apex = midpoint.clone().normalize().multiplyScalar(
        sunDisplayRadius * (1.0 + maxHeight)
    );

    // Create smooth catenary-like arch using CatmullRom spline
    const quarterApex1 = foot1.clone().lerp(apex, 0.5);
    quarterApex1.normalize().multiplyScalar(sunDisplayRadius * (1.0 + maxHeight * 0.6));
    const quarterApex2 = foot2.clone().lerp(apex, 0.5);
    quarterApex2.normalize().multiplyScalar(sunDisplayRadius * (1.0 + maxHeight * 0.6));

    const curve = new CatmullRomCurve3([foot1, quarterApex1, apex, quarterApex2, foot2]);
    const archPoints = curve.getPoints(particleCount - 1);

    // Generate particles distributed along the arch with thickness variation
    const positions = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);
    const layers = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
        const t = i / (particleCount - 1);
        const pt = archPoints[i];

        // Add slight random thickness perpendicular to the arch
        const normal = pt.clone().normalize();
        const tangent = i < particleCount - 1
            ? archPoints[i + 1].clone().sub(pt).normalize()
            : pt.clone().sub(archPoints[i - 1]).normalize();
        const perp = new Vector3().crossVectors(normal, tangent).normalize();

        const thickness = 0.003 * sunDisplayRadius * (Math.random() - 0.5); // ±0.3% R☉
        const depthOff = 0.002 * sunDisplayRadius * (Math.random() - 0.5);

        positions[i * 3] = pt.x + perp.x * thickness + normal.x * depthOff;
        positions[i * 3 + 1] = pt.y + perp.y * thickness + normal.y * depthOff;
        positions[i * 3 + 2] = pt.z + perp.z * thickness + normal.z * depthOff;

        phases[i] = t;
        layers[i] = Math.random();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aParticlePhase', new Float32BufferAttribute(phases, 1));
    geometry.setAttribute('aParticleLayer', new Float32BufferAttribute(layers, 1));

    const material = new ShaderMaterial({
        vertexShader: PROMINENCE_VERTEX_SHADER,
        fragmentShader: PROMINENCE_FRAGMENT_SHADER,
        uniforms: {
            time: { value: 0 },
            sunRadius: { value: sunDisplayRadius },
            opacity: { value: 0 },
            eruptionPhase: { value: 0 },
            prominenceColor: { value: new Color(0.9, 0.15, 0.12) }, // Hα reddish-pink
            sunCenter: { value: new Vector3(0, 0, 0) },
            isOnDisk: { value: 0 }
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false
    });

    const points = new Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 5;
    group.add(points);

    let elapsedSec = 0;
    let _expired = false;
    let _erupting = false;
    let _eruptionStart = 0;
    const fadeInTime = 15; // seconds
    const eruptionDuration = 30; // seconds

    return {
        group,
        footLon1, footLat1,
        footLon2, footLat2,
        maxHeight,
        isQuiescent,

        update(dtSec: number) {
            if (_expired) return;
            elapsedSec += dtSec;
            material.uniforms.time.value = elapsedSec;

            // Fade in
            const fadeIn = Math.min(1.0, elapsedSec / fadeInTime);
            // Fade out near end of life
            const fadeOut = Math.max(0, 1.0 - Math.max(0, (elapsedSec - lifetime + 30) / 30));
            material.uniforms.opacity.value = fadeIn * fadeOut * 0.6;

            // Eruption trigger
            if (!_erupting && elapsedSec > lifetime * 0.7 && Math.random() < eruptionChance * dtSec) {
                _erupting = true;
                _eruptionStart = elapsedSec;
            }

            if (_erupting) {
                const eruptT = (elapsedSec - _eruptionStart) / eruptionDuration;
                material.uniforms.eruptionPhase.value = Math.min(1.0, eruptT);
                if (eruptT > 1.0) {
                    _expired = true;
                }
            }

            if (elapsedSec > lifetime && !_erupting) {
                _expired = true;
            }
        },

        isExpired() { return _expired; },

        dispose() {
            geometry.dispose();
            material.dispose();
            group.clear();
        }
    };
}

/**
 * Manages the creation and lifecycle of prominences around the Sun.
 */
export class ProminenceManager {
    sunGroup: Group;
    prominences: Prominence[];
    maxProminences: number;
    timeSinceLastSpawn: number;

    constructor(sunGroup: Group) {
        this.sunGroup = sunGroup;
        this.prominences = [];
        this.maxProminences = 6;
        this.timeSinceLastSpawn = 0;
    }

    update(dtSec: number, activity: number, sunDisplayRadius: number) {
        this.timeSinceLastSpawn += dtSec;

        // Spawn new prominences based on activity
        if (this.prominences.length < this.maxProminences && activity > 0.05) {
            const spawnChance = activity * 0.02 * dtSec;
            if (Math.random() < spawnChance && this.timeSinceLastSpawn > 30) {
                this.spawnProminence(activity, sunDisplayRadius);
                this.timeSinceLastSpawn = 0;
            }
        }

        // Update existing prominences
        for (let i = this.prominences.length - 1; i >= 0; i--) {
            const prom = this.prominences[i];
            prom.update(dtSec);
            if (prom.isExpired()) {
                prom.dispose();
                this.sunGroup.remove(prom.group);
                this.prominences.splice(i, 1);
            }
        }
    }

    spawnProminence(activity: number, sunDisplayRadius: number) {
        const TWO_PI = Math.PI * 2;

        // Two footpoints near each other (prominence spans ~15-60° of arc)
        const baseLon = Math.random() * TWO_PI;
        const sign = Math.random() > 0.5 ? 1 : -1;
        const baseLat = sign * (0.1 + Math.random() * 0.6) * activity;

        const arcSpan = 0.26 + Math.random() * 0.78; // 15-60 degrees
        const footLon1 = baseLon - arcSpan * 0.5;
        const footLat1 = baseLat + (Math.random() - 0.5) * 0.1;
        const footLon2 = baseLon + arcSpan * 0.5;
        const footLat2 = baseLat + (Math.random() - 0.5) * 0.1;

        // Height: 0.01-0.14 R☉ (quiescent can be very tall)
        const maxHeight = 0.02 + Math.random() * 0.12 * (0.5 + activity * 0.5);

        // Quiescent vs active region
        const isQuiescent = Math.random() > activity * 0.6;
        const lifetime = isQuiescent
            ? 300 + Math.random() * 600   // 5-15 min (sim time)
            : 60 + Math.random() * 180;   // 1-4 min (sim time)

        const prominence = createProminence({
            footLon1, footLat1,
            footLon2, footLat2,
            maxHeight,
            sunDisplayRadius,
            lifetime,
            isQuiescent,
            eruptionChance: isQuiescent ? 0.01 : 0.05,
            particleCount: 150 + Math.round(Math.random() * 150)
        });

        this.prominences.push(prominence);
        this.sunGroup.add(prominence.group);
    }

    dispose() {
        for (const prom of this.prominences) {
            prom.dispose();
            this.sunGroup.remove(prom.group);
        }
        this.prominences.length = 0;
    }
}
