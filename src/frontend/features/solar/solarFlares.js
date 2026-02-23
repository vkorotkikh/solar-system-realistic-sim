import {
    AdditiveBlending,
    BackSide,
    Color,
    FrontSide,
    Group,
    Mesh,
    ShaderMaterial,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
    CanvasTexture,
    Vector3,
    Quaternion
} from 'three';
import { AU_M } from '../../../constants.js';

// Average CME speed ~480 km/s. We allow bounds of 200 - 3200.
// Physics note: AU_M is astronomical unit in meters.
// AU/s = (km/s * 1000) / AU_M.
const CME_SPEED_KMS_MIN = 200;
const CME_SPEED_KMS_MAX = 3200;

const CME_VERTEX_SHADER = `
uniform float uElapsedSec;
uniform float uVelocityAuPerSec;
uniform float uStartRadius;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  
  // Expand sphere over time based on physical velocity
  float currentRadius = uStartRadius + uVelocityAuPerSec * uElapsedSec;
  vec3 expandedPos = position * currentRadius;
  
  vec4 worldPos = modelMatrix * vec4(expandedPos, 1.0);
  vWorldPosition = worldPos.xyz;
  
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const CME_FRAGMENT_SHADER = `
uniform float uElapsedSec;
uniform float uIntensity;
uniform vec3 uColor;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float ndotv = abs(dot(vNormal, viewDir));
  
  // Edge brightening (Fresnel effect) to make shell look hollow
  float edge = pow(1.0 - ndotv, 2.5);
  float face = 0.05;
  
  // Opacity decay over time as it expands and diffuses
  float decay = 1.0 / (1.0 + uElapsedSec * 0.08); // Slow fade
  
  // Fade out completely after a certain time/expansion
  float alpha = (edge * 0.9 + face) * uIntensity * decay;
  
  // Cutoff at very low alpha to avoid overdraw
  if (alpha < 0.01) discard;
  
  gl_FragColor = vec4(uColor, alpha);
}
`;

// Shared geometry for all CME shells (half sphere)
let sharedCmeGeometries = {};
function getCmeGeometry(angularWidthRad = Math.PI * 2) {
    // Round to nearest 10° for geometry caching
    const key = Math.round(angularWidthRad * 180 / Math.PI / 10) * 10;
    if (!sharedCmeGeometries[key]) {
        sharedCmeGeometries[key] = new SphereGeometry(1, 32, 16, 0, angularWidthRad, 0, Math.PI * 0.5);
    }
    return sharedCmeGeometries[key];
}

// Generate a soft radial glow texture for the flare sprite
let sharedFlareTexture = null;
function getFlareTexture() {
    if (!sharedFlareTexture) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.15, 'rgba(255, 240, 200, 0.8)');
        grad.addColorStop(0.4, 'rgba(255, 180, 50, 0.3)');
        grad.addColorStop(0.7, 'rgba(255, 100, 20, 0.1)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        sharedFlareTexture = new CanvasTexture(canvas);
    }
    return sharedFlareTexture;
}

/**
 * Creates a Solar Flare and CME event.
 */
export function createSolarFlareEvent({
    latitudeRad,
    longitudeRad,
    sunRadiusAu,
    velocityKms = 489,
    intensity = 0.5,
    angularWidthDeg = 60
}) {
    const group = new Group();

    // 1. Position calculation (spherical to Cartesian)
    const r = sunRadiusAu;
    const y = r * Math.sin(latitudeRad);
    const xzR = r * Math.cos(latitudeRad);
    const x = xzR * Math.cos(longitudeRad);
    const z = -xzR * Math.sin(longitudeRad); // -z is +lon in our orbit frame typically, but let's just match Three's standard

    const position = new Vector3(x, y, z);
    const normal = position.clone().normalize();

    // 2. Flare Sprite (intense flash at surface)
    const flareMaterial = new SpriteMaterial({
        map: getFlareTexture(),
        color: new Color('#ffffff'),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false
    });
    const flareSprite = new Sprite(flareMaterial);
    // Scale based on intensity and sun size
    flareSprite.scale.setScalar(sunRadiusAu * 0.8 * (0.5 + intensity));
    flareSprite.position.copy(position).multiplyScalar(1.02); // Just above surface
    group.add(flareSprite);

    // 3. CME Shell (Expanding half-sphere)
    const cmeMaterial = new ShaderMaterial({
        vertexShader: CME_VERTEX_SHADER,
        fragmentShader: CME_FRAGMENT_SHADER,
        uniforms: {
            uElapsedSec: { value: 0 },
            uVelocityAuPerSec: { value: (velocityKms * 1000) / AU_M },
            uStartRadius: { value: sunRadiusAu },
            uIntensity: { value: intensity },
            uColor: { value: new Color('#ff9c4a') }
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: FrontSide
    });
    const angularWidthRad = angularWidthDeg * Math.PI / 180;
    const cmeMesh = new Mesh(getCmeGeometry(angularWidthRad), cmeMaterial);
    // Orient the half-sphere to point outward along the normal
    const up = new Vector3(0, 1, 0); // standard sphere top
    cmeMesh.quaternion.setFromUnitVectors(up, normal);
    group.add(cmeMesh);

    // Lifecycle state
    let elapsedSec = 0;
    let _expired = false;

    // Duration of surface flare flash (short)
    const flashDurationSec = 15.0 + intensity * 20.0;
    // CME max distance (e.g. 0.3 AU) cut-off
    const cmeMaxDistanceAu = 0.3;
    const velocityAuPerSec = cmeMaterial.uniforms.uVelocityAuPerSec.value;
    const maxLifeTimeSec = (cmeMaxDistanceAu - sunRadiusAu) / Math.max(0.0001, velocityAuPerSec);

    return {
        group,
        longitude: longitudeRad,
        latitude: latitudeRad,
        intensity,

        update(dtSec) {
            if (_expired) return;

            elapsedSec += dtSec;

            // Update CME shader
            cmeMaterial.uniforms.uElapsedSec.value = elapsedSec;

            // Update Flare Sprite — GOES-style Neupert-effect temporal profile:
            // Fast exponential rise (~15% of duration = impulsive phase)
            // followed by slow exponential decay (~85% = gradual phase)
            const impulsiveDuration = flashDurationSec * 0.15;
            const gradualDuration = flashDurationSec * 0.85;
            if (elapsedSec < flashDurationSec) {
                if (elapsedSec < impulsiveDuration) {
                    // Rapid exponential rise (impulsive phase)
                    const t = elapsedSec / impulsiveDuration;
                    flareSprite.material.opacity = intensity * (1.0 - Math.exp(-4.0 * t));
                } else {
                    // Slow exponential decay (gradual phase — Neupert effect)
                    const t = (elapsedSec - impulsiveDuration) / gradualDuration;
                    flareSprite.material.opacity = intensity * Math.exp(-2.5 * t);
                }
            } else {
                flareSprite.material.opacity = 0;
            }

            if (elapsedSec > maxLifeTimeSec) {
                _expired = true;
            }
        },

        isExpired() {
            return _expired;
        },

        dispose() {
            flareSprite.material.dispose();
            cmeMesh.material.dispose();
            group.clear();
        }
    };
}

/**
 * Manager class to handle multiple flare events and auto-spawn them
 */
export class SolarFlareManager {
    constructor(sunGroup) {
        this.sunGroup = sunGroup;
        this.events = [];
        this.maxEvents = 3;
        this.timeSinceLastSpawn = 0;
    }

    update(dtSec, activity, sunRadiusAu) {
        this.timeSinceLastSpawn += dtSec;

        // Probabilistic spawn
        if (this.events.length < this.maxEvents && activity > 0.1) {
            // higher activity = lower threshold
            // E.g. at activity=1.0, mean time between spawns ~ 20s
            const spawnChance = (activity * activity) * 0.05 * dtSec;
            if (Math.random() < spawnChance && this.timeSinceLastSpawn > 10.0) {
                this.spawnRandomFlare(activity, sunRadiusAu);
                this.timeSinceLastSpawn = 0;
            }
        }

        // Update existing
        for (let i = this.events.length - 1; i >= 0; i--) {
            const event = this.events[i];
            event.update(dtSec);
            if (event.isExpired()) {
                event.dispose();
                this.sunGroup.remove(event.group);
                this.events.splice(i, 1);
            }
        }
    }

    spawnRandomFlare(activity, sunRadiusAu) {
        // Spörer's law roughly: active belts between 5 and 35 degrees
        const sign = Math.random() > 0.5 ? 1 : -1;
        const maxLat = 0.05 + activity * 0.55; // 0.05 to ~0.6 rad (34 deg)
        const lat = sign * (Math.random() * (maxLat - 0.08) + 0.08);
        const lon = Math.random() * Math.PI * 2;

        const intensity = 0.3 + Math.random() * 0.7 * activity; // 0.3 to 1.0
        const velocityKms = CME_SPEED_KMS_MIN + Math.random() * Math.random() * (CME_SPEED_KMS_MAX - CME_SPEED_KMS_MIN);

        // CME angular width: 20°-120° (NASA CME catalog range)
        const angularWidthDeg = 20 + Math.random() * 100;

        const flare = createSolarFlareEvent({
            latitudeRad: lat,
            longitudeRad: lon,
            sunRadiusAu,
            velocityKms,
            intensity,
            angularWidthDeg
        });

        this.events.push(flare);
        this.sunGroup.add(flare.group);
    }

    getActiveFlaresParams() {
        // Returns array of up to 3 flare data for the surface shader: [lon, lat, intensity, phase/elapsed]
        const params = [
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0
        ];
        for (let i = 0; i < Math.min(3, this.events.length); i++) {
            const e = this.events[i];
            // Quick way to get elapsed from the opacity of the flare sprite, or just compute an envelope
            // Let's rely on intensity and whether the surface should still glow
            // Actually we need `e.latitude`, `e.longitude`
            params[i * 4 + 0] = e.longitude;
            params[i * 4 + 1] = e.latitude;
            params[i * 4 + 2] = e.intensity;
            params[i * 4 + 3] = 1.0; // In a full implementation, could pass time scale here
        }
        return params;
    }

    dispose() {
        for (const e of this.events) {
            e.dispose();
            this.sunGroup.remove(e.group);
        }
        this.events = [];
    }
}
