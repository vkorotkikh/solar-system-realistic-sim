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
import { AU_M } from '../../../constants';

// Average CME speed ~480 km/s. We allow a broad physical envelope for quiet-to-extreme CMEs.
// Physics note: AU_M is astronomical unit in meters.
// AU/s = (km/s * 1000) / AU_M.
const CME_SPEED_KMS_MIN = 20;
const CME_SPEED_KMS_MAX = 3500;

function clampUnit(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeDirection(sample) {
    if (!Array.isArray(sample) || sample.length !== 3) return null;
    const x = Number(sample[0]);
    const y = Number(sample[1]);
    const z = Number(sample[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    const len = Math.hypot(x, y, z);
    if (len < 1e-6) return null;
    return { x: x / len, y: y / len, z: z / len };
}

function directionToLatLon(direction) {
    if (!direction) return null;
    return {
        latitudeRad: Math.asin(Math.max(-1, Math.min(1, direction.y))),
        longitudeRad: Math.atan2(direction.z, direction.x)
    };
}

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
    featureId = null,
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
        featureId,
        longitude: longitudeRad,
        latitude: latitudeRad,
        intensity,
        velocityKms,
        getSurfaceEnvelope() {
            return Math.max(0, Math.min(1, flareSprite.material.opacity / Math.max(0.001, intensity)));
        },

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
        this.maxEvents = 4;
        this.timeSinceLastSpawn = 0;
        this.featureCooldowns = new Map();
        this.lastPhysicsDrivenSpawnSec = -Infinity;
    }

    update(dtSec, activity, sunRadiusAu, physicsState = null, timeSec = 0) {
        this.timeSinceLastSpawn += dtSec;
        let usedPhysicsDrivers = false;

        if (physicsState && Number.isFinite(timeSec)) {
            usedPhysicsDrivers = this.syncFromPhysicsState(physicsState, sunRadiusAu, timeSec, activity) > 0;
        }

        // Probabilistic fallback when no strong backend-driven eruptive feature is available.
        const hasBackendCmes = Array.isArray(physicsState?.corona?.features)
            && physicsState.corona.features.some((feature) => `${feature?.kind ?? ''}`.toLowerCase() === 'cme');
        if (
            this.events.length < this.maxEvents
            && activity > 0.1
            && (!hasBackendCmes || !usedPhysicsDrivers)
        ) {
            // higher activity = lower threshold
            // E.g. at activity=1.0, mean time between fallback spawns ~ 35s
            const spawnChance = (activity * activity) * 0.028 * dtSec;
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

    syncFromPhysicsState(physicsState, sunRadiusAu, timeSec, activity = 0.5) {
        const features = Array.isArray(physicsState?.corona?.features) ? physicsState.corona.features : [];
        if (features.length === 0 || this.events.length >= this.maxEvents) return 0;

        const candidates = features
            .filter((feature) => `${feature?.kind ?? ''}`.toLowerCase() === 'cme')
            .map((feature) => {
                const brightness = clampUnit(Number(feature?.brightness) || 0);
                const emergence = clampUnit(Number(feature?.emergence) || brightness);
                const extent = clampUnit((Number(feature?.peak_extent_solar_radii) - 1.0) / 3.8);
                return {
                    feature,
                    score: brightness * 0.52 + emergence * 0.28 + extent * 0.20
                };
            })
            .filter((candidate) => candidate.score > Math.max(0.38, 0.56 - activity * 0.14))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);

        let spawned = 0;
        for (const candidate of candidates) {
            if (this.events.length >= this.maxEvents) break;
            const id = `${candidate.feature?.id ?? candidate.feature?.active_region_id ?? `cme-${spawned}`}`;
            const nextEligible = Number(this.featureCooldowns.get(id) ?? -Infinity);
            if (timeSec < nextEligible) continue;
            this.spawnFeatureFlare(candidate.feature, sunRadiusAu, activity, candidate.score);
            this.featureCooldowns.set(id, timeSec + 16 + (1 - candidate.score) * 42);
            this.lastPhysicsDrivenSpawnSec = timeSec;
            this.timeSinceLastSpawn = 0;
            spawned += 1;
        }

        for (const [id, nextEligible] of this.featureCooldowns.entries()) {
            if (Number(nextEligible) < timeSec - 120) {
                this.featureCooldowns.delete(id);
            }
        }
        return spawned;
    }

    spawnFeatureFlare(feature, sunRadiusAu, activity = 0.5, featureScore = 0.6) {
        const direction = normalizeDirection(feature?.base_dir) ?? normalizeDirection(feature?.arc?.[0]);
        const latLon = directionToLatLon(direction);
        if (!latLon) {
            this.spawnRandomFlare(activity, sunRadiusAu);
            return;
        }

        const brightness = clampUnit(Number(feature?.brightness) || featureScore);
        const emergence = clampUnit(Number(feature?.emergence) || brightness);
        const peakExtent = Math.max(1, Number(feature?.peak_extent_solar_radii) || 1);
        const intensity = Math.max(
            0.22,
            Math.min(1.4, 0.18 + brightness * 0.7 + emergence * 0.32 + activity * 0.12)
        );
        const velocityKms = Math.max(
            CME_SPEED_KMS_MIN,
            Math.min(CME_SPEED_KMS_MAX, Number(feature?.expansion_speed_kms) || (250 + featureScore * 1_400))
        );
        const angularWidthDeg = Math.max(
            24,
            Math.min(140, 24 + (peakExtent - 1) * 28 + brightness * 34)
        );

        const flare = createSolarFlareEvent({
            featureId: `${feature?.id ?? feature?.active_region_id ?? 'solar-feature'}`,
            latitudeRad: latLon.latitudeRad,
            longitudeRad: latLon.longitudeRad,
            sunRadiusAu,
            velocityKms,
            intensity,
            angularWidthDeg
        });

        this.events.push(flare);
        this.sunGroup.add(flare.group);
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
        const ranked = this.events
            .slice()
            .sort((a, b) => {
                const aScore = (a.getSurfaceEnvelope?.() ?? 1) * (Number(a.intensity) || 0);
                const bScore = (b.getSurfaceEnvelope?.() ?? 1) * (Number(b.intensity) || 0);
                return bScore - aScore;
            });
        for (let i = 0; i < Math.min(3, ranked.length); i++) {
            const e = ranked[i];
            const envelope = e.getSurfaceEnvelope?.() ?? 1;
            params[i * 4 + 0] = e.longitude;
            params[i * 4 + 1] = e.latitude;
            params[i * 4 + 2] = e.intensity * envelope;
            params[i * 4 + 3] = envelope;
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
