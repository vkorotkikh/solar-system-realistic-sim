import {
    AdditiveBlending,
    Color,
    FrontSide,
    Group,
    Mesh,
    Quaternion,
    ShaderMaterial,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
    CanvasTexture,
    Vector3
} from 'three';
import { AU_M } from '../../../constants';
import type { SolarPhysicsStatePayload } from './solarPhysicsClient';
import { coronalToDisplay } from './solarDisplayScale';

const CME_SPEED_KMS_MIN = 20;
const CME_SPEED_KMS_MAX = 3500;

function clampUnit(value: unknown): number {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

interface DirectionSample {
    x: number;
    y: number;
    z: number;
}

function normalizeDirection(sample: unknown): DirectionSample | null {
    if (!Array.isArray(sample) || sample.length !== 3) return null;
    const x = Number(sample[0]);
    const y = Number(sample[1]);
    const z = Number(sample[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    const len = Math.hypot(x, y, z);
    if (len < 1e-6) return null;
    return { x: x / len, y: y / len, z: z / len };
}

function directionToLatLon(direction: DirectionSample | null): { latitudeRad: number; longitudeRad: number } | null {
    if (!direction) return null;
    return {
        latitudeRad: Math.asin(Math.max(-1, Math.min(1, direction.y))),
        longitudeRad: Math.atan2(-direction.z, direction.x)
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

const sharedCmeGeometries: Record<number, SphereGeometry> = {};
function getCmeGeometry(angularWidthRad = Math.PI * 2): SphereGeometry {
    const key = Math.round(angularWidthRad * 180 / Math.PI / 10) * 10;
    if (!sharedCmeGeometries[key]) {
        const quantizedWidthRad = key * Math.PI / 180;
        sharedCmeGeometries[key] = new SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, quantizedWidthRad * 0.5);
    }
    return sharedCmeGeometries[key];
}

let sharedFlareTexture: CanvasTexture | null = null;

function createFallbackFlareCanvasTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    return new CanvasTexture(canvas);
}

function getFlareTexture(): CanvasTexture {
    if (!sharedFlareTexture) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            sharedFlareTexture = createFallbackFlareCanvasTexture();
            return sharedFlareTexture;
        }
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

export interface CreateSolarFlareEventParams {
    featureId?: string | null;
    latitudeRad: number;
    longitudeRad: number;
    sunRadiusAu: number;
    velocityKms?: number;
    intensity?: number;
    angularWidthDeg?: number;
    /** How far out the CME grows, in solar radii from the Sun's centre. */
    peakExtentSolarRadii?: number;
}

export interface SolarFlareEventHandle {
    group: Group;
    readonly surfaceSprite: Sprite;
    featureId: string | null;
    readonly longitude: number;
    readonly latitude: number;
    intensity: number;
    velocityKms: number;
    getSurfaceEnvelope(): number;
    update(dtSec: number): void;
    isExpired(): boolean;
    dispose(): void;
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
    angularWidthDeg = 60,
    peakExtentSolarRadii = 4.74
}: CreateSolarFlareEventParams): SolarFlareEventHandle {
    const group = new Group();

    const r = sunRadiusAu;
    const y = r * Math.sin(latitudeRad);
    const xzR = r * Math.cos(latitudeRad);
    const x = xzR * Math.cos(longitudeRad);
    const z = -xzR * Math.sin(longitudeRad);

    const position = new Vector3(x, y, z);
    const normal = position.clone().normalize();

    const flareMaterial = new SpriteMaterial({
        map: getFlareTexture(),
        color: new Color('#ffffff'),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: true
    });
    const flareSprite = new Sprite(flareMaterial);
    flareSprite.scale.setScalar(sunRadiusAu * 0.8 * (0.5 + intensity));
    flareSprite.position.copy(position).multiplyScalar(1.02);

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
    const angularWidthRadVal = angularWidthDeg * Math.PI / 180;
    const cmeMesh = new Mesh(getCmeGeometry(angularWidthRadVal), cmeMaterial);
    const up = new Vector3(0, 1, 0);
    cmeMesh.quaternion.setFromUnitVectors(up, normal);
    group.add(cmeMesh);

    let elapsedSec = 0;
    let _expired = false;
    let disposed = false;

    const flashDurationSec = 15.0 + intensity * 20.0;
    // The CME grows to its peak extent over the flare's flash, a time-lapse: at its real speed it
    // would barely move on screen for hours and hold one of the manager's four event slots. The
    // old fixed 0.3 AU limit sat inside the enlarged Sun (0.3755 AU), so every event expired on
    // its first frame and no flare was ever visible at the default scale.
    const cmeMaxDistanceAu = coronalToDisplay(Math.max(1, peakExtentSolarRadii), sunRadiusAu);
    const maxLifeTimeSec = flashDurationSec;
    cmeMaterial.uniforms.uVelocityAuPerSec.value = (cmeMaxDistanceAu - sunRadiusAu) / flashDurationSec;

    return {
        group,
        surfaceSprite: flareSprite,
        featureId,
        // Keep the surface anchor owned by this event, independent of later payloads.
        get longitude() { return longitudeRad; },
        get latitude() { return latitudeRad; },
        intensity,
        velocityKms,

        getSurfaceEnvelope() {
            const mat = flareSprite.material as SpriteMaterial;
            return Math.max(0, Math.min(1, mat.opacity / Math.max(0.001, intensity)));
        },

        update(dtSec: number) {
            if (_expired) return;

            elapsedSec += dtSec;

            cmeMaterial.uniforms.uElapsedSec.value = elapsedSec;

            const mat = flareSprite.material as SpriteMaterial;
            const impulsiveDuration = flashDurationSec * 0.15;
            const gradualDuration = flashDurationSec * 0.85;
            if (elapsedSec < flashDurationSec) {
                if (elapsedSec < impulsiveDuration) {
                    const t = elapsedSec / impulsiveDuration;
                    mat.opacity = intensity * (1.0 - Math.exp(-4.0 * t));
                } else {
                    const t = (elapsedSec - impulsiveDuration) / gradualDuration;
                    mat.opacity = intensity * Math.exp(-2.5 * t);
                }
            } else {
                mat.opacity = 0;
            }

            if (elapsedSec > maxLifeTimeSec) {
                _expired = true;
            }
        },

        isExpired() {
            return _expired;
        },

        dispose() {
            if (disposed) return;
            disposed = true;
            _expired = true;
            flareSprite.removeFromParent();
            group.removeFromParent();
            flareSprite.material.dispose();
            cmeMesh.material.dispose();
            group.clear();
        }
    };
}

type CoronaFeatureRecord = Record<string, unknown>;

/**
 * Manager class to handle multiple flare events and auto-spawn them
 */
export class SolarFlareManager {
    readonly sunGroup: Group;
    readonly surfaceGroup: Group;
    events: SolarFlareEventHandle[];
    maxEvents: number;
    timeSinceLastSpawn: number;
    featureCooldowns: Map<string, number>;
    lastPhysicsDrivenSpawnSec: number;

    constructor(sunGroup: Group, surfaceGroup: Group) {
        this.sunGroup = sunGroup;
        this.surfaceGroup = surfaceGroup;
        this.events = [];
        this.maxEvents = 4;
        this.timeSinceLastSpawn = 0;
        this.featureCooldowns = new Map();
        this.lastPhysicsDrivenSpawnSec = -Infinity;
    }

    update(dtSec: number, activity: number, sunRadiusAu: number, physicsState: SolarPhysicsStatePayload | null = null, timeSec = 0) {
        this.timeSinceLastSpawn += dtSec;
        let usedPhysicsDrivers = false;

        if (physicsState && Number.isFinite(timeSec)) {
            usedPhysicsDrivers = this.syncFromPhysicsState(physicsState, sunRadiusAu, timeSec, activity) > 0;
        }

        const coronaFeatures = physicsState?.corona?.features;
        const hasBackendCmes = Array.isArray(coronaFeatures)
            && coronaFeatures.some((feature: CoronaFeatureRecord) => `${feature?.kind ?? ''}`.toLowerCase() === 'cme');
        if (
            this.events.length < this.maxEvents
            && activity > 0.1
            && (!hasBackendCmes || !usedPhysicsDrivers)
            && (timeSec - this.lastPhysicsDrivenSpawnSec > 18 || !Number.isFinite(timeSec))
        ) {
            const spawnChance = (activity * activity) * 0.028 * dtSec;
            if (Math.random() < spawnChance && this.timeSinceLastSpawn > 10.0) {
                this.spawnRandomFlare(activity, sunRadiusAu);
                this.timeSinceLastSpawn = 0;
            }
        }

        for (let i = this.events.length - 1; i >= 0; i--) {
            const event = this.events[i];
            event.update(dtSec);
            if (event.isExpired()) {
                event.dispose();
                this.events.splice(i, 1);
            }
        }
    }

    syncFromPhysicsState(physicsState: SolarPhysicsStatePayload, sunRadiusAu: number, timeSec: number, activity = 0.5) {
        const features = Array.isArray(physicsState?.corona?.features) ? physicsState.corona!.features as CoronaFeatureRecord[] : [];
        if (features.length === 0 || this.events.length >= this.maxEvents) return 0;

        const candidates = features
            .filter((feature) => `${feature?.kind ?? ''}`.toLowerCase() === 'cme')
            .map((feature: CoronaFeatureRecord) => {
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

    spawnFeatureFlare(feature: CoronaFeatureRecord, sunRadiusAu: number, activity = 0.5, featureScore = 0.6) {
        const direction = normalizeDirection(feature?.base_dir) ?? normalizeDirection(Array.isArray(feature?.arc) ? feature.arc[0] : undefined);
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
            angularWidthDeg,
            peakExtentSolarRadii: peakExtent
        });

        this.addEvent(flare);
    }

    spawnRandomFlare(activity: number, sunRadiusAu: number) {
        const sign = Math.random() > 0.5 ? 1 : -1;
        const maxLat = 0.05 + activity * 0.55;
        const lat = sign * (Math.random() * (maxLat - 0.08) + 0.08);
        const lon = Math.random() * Math.PI * 2;

        const intensity = 0.3 + Math.random() * 0.7 * activity;
        const velocityKms = CME_SPEED_KMS_MIN + Math.random() * Math.random() * (CME_SPEED_KMS_MAX - CME_SPEED_KMS_MIN);

        const angularWidthDeg = 20 + Math.random() * 100;

        const flare = createSolarFlareEvent({
            latitudeRad: lat,
            longitudeRad: lon,
            sunRadiusAu,
            velocityKms,
            intensity,
            angularWidthDeg
        });

        this.addEvent(flare);
    }

    private addEvent(flare: SolarFlareEventHandle) {
        // Capture the surface orientation at launch; only the sprite keeps rotating.
        const fixedWorld = this.sunGroup.getWorldQuaternion(new Quaternion());
        const surfaceWorld = this.surfaceGroup.getWorldQuaternion(new Quaternion());
        flare.group.quaternion.copy(fixedWorld.invert().multiply(surfaceWorld));
        this.sunGroup.add(flare.group);
        this.surfaceGroup.add(flare.surfaceSprite);
        this.events.push(flare);
    }

    getActiveFlaresParams(): number[] {
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
        }
        this.events = [];
    }
}
