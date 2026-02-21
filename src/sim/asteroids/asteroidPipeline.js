// Prototype Implementation of the Realistic Asteroid Pipeline Entrypoint
import { Object3D, Color, Group, Euler, Quaternion, Vector3 } from 'three';
import { propagateKeplerOrbit } from '../physics.js';
import {
    generateAsteroidElement,
    sampleTaxonomy,
    samplePowerLawSize,
    TAXONOMIES
} from './asteroidDistributions.js';
import { createAsteroidInstancedBuckets } from './asteroidGeometry.js';

// Configuration
const POPULATION_COUNTS = {
    'main-belt': 80000,
    'hilda': 5000,
    'trojan-l4': 10000, // Greeks
    'trojan-l5': 10000, // Trojans
    'nea': 2000
};

export class AsteroidSimulationPipeline {
    constructor() {
        this.rootGroup = new Group();
        this.rootGroup.name = 'UltraRealisticAsteroidBelt';

        // Total counts mapped per taxonomy bucket
        this.buckets = {};
        this.activeObjects = [];

        // Used for matrix updates
        this.dummy = new Object3D();
        this.upAxis = new Vector3(0, 0, 1);
    }

    /**
     * Initializes the pipeline, generates elements, populates instanced meshes,
     * inside the Three.js scene.
     */
    async initialize(sceneScaleAu = 1.0) {
        const totalCount = Object.values(POPULATION_COUNTS).reduce((a, b) => a + b, 0);

        // Create the geometry templates and PBR instanced meshes
        this.buckets = createAsteroidInstancedBuckets(totalCount, 3);

        // Flatten the buckets into an array for easy rendering inclusion
        for (const key of Object.keys(this.buckets)) {
            for (const bucket of this.buckets[key]) {
                this.rootGroup.add(bucket.mesh);
            }
        }

        let globalIndex = 0;

        // Generate distributions for all populations
        for (const [populationType, count] of Object.entries(POPULATION_COUNTS)) {
            for (let i = 0; i < count; i++) {
                const element = generateAsteroidElement(populationType);

                // Pick taxonomy based directly on the semi-major axis (aAu)
                const taxonomyClass = sampleTaxonomy(element.aAu);

                // Assign to a random shape bucket within that taxonomic class
                const taxBuckets = this.buckets[taxonomyClass.type];
                const bucketChoice = Math.floor(Math.random() * taxBuckets.length);
                const targetBucket = taxBuckets[bucketChoice];

                const localIndex = targetBucket.mesh.count;
                targetBucket.mesh.count++;

                // Determine size: min 0.5km, max 500km
                // Assuming realistic scale Au means 1 AU = 149.6e6 km. 
                // We'll scale it slightly up so we can see them, as 1km is invisible at 1AU scale.
                // Base size scaled for visual fidelity rather than true 1:1 scale, though 
                // if using true scale, you divide by AU_KM.
                const radiusKm = samplePowerLawSize(0.5, 500, 2.5);
                const renderScale = (radiusKm / 149597870.7) * sceneScaleAu;
                // Boost scale artificially if prototype needs them visible without extreme zoom
                const visualBoost = 1500.0;
                const scaleVal = renderScale * visualBoost;

                // Random starting spin
                const angularVelocity = new Vector3(
                    (Math.random() - 0.5),
                    (Math.random() - 0.5),
                    (Math.random() - 0.5)
                ).normalize().multiplyScalar(0.01 + Math.random() * 0.1);
                // e.g. rads per day, spin barrier implies periods of hours.

                // Assign Taxonomic Color
                const colorOpts = taxonomyClass.colorRange;
                const cHex = colorOpts[Math.floor(Math.random() * colorOpts.length)];
                const color = new Color(cHex);
                color.offsetHSL(0.0, 0.0, (Math.random() - 0.5) * 0.1); // Small variation

                // Must tell InstancedMesh the color
                targetBucket.mesh.setColorAt(localIndex, color);

                // Save object reference to update matrix over time
                this.activeObjects.push({
                    bucket: targetBucket,
                    localIndex: localIndex,
                    element: element,
                    scaleVal: scaleVal,
                    spinAxis: angularVelocity,
                    spinAngle: Math.random() * Math.PI * 2,
                    currentPos: new Vector3()
                });

                globalIndex++;
            }
        }

        // Update color buffers for all buckets
        for (const key of Object.keys(this.buckets)) {
            for (const bucket of this.buckets[key]) {
                if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
            }
        }

        console.log(`Realistic Asteroid Pipeline generated ${globalIndex} bodies.`);
        return this.rootGroup;
    }

    /**
     * Updates all instances on the CPU.
     * NOTE: For 1.5M asteroids, this standard CPU loop will bottleneck. 
     * This logic should be moved to a custom Material/Vertex Shader (GPU) for Phase 2.
     * For the 100k prototype limits, it runs decently.
     */
    update(jd) {
        const epochJd = 2451545.0; // J2000
        const tDays = jd - epochJd;

        for (let i = 0; i < this.activeObjects.length; i++) {
            const obj = this.activeObjects[i];

            // Compute Position using normal Keplerian propagator
            propagateKeplerOrbit(obj.element, tDays, obj.currentPos);

            this.dummy.position.copy(obj.currentPos);

            // Update Rotational Spin
            obj.spinAngle += obj.spinAxis.length() * 0.1; // Rough static delta
            this.dummy.setRotationFromAxisAngle(obj.spinAxis.normalize(), obj.spinAngle);

            // Apply scale
            this.dummy.scale.set(obj.scaleVal, obj.scaleVal, obj.scaleVal);
            this.dummy.updateMatrix();

            obj.bucket.mesh.setMatrixAt(obj.localIndex, this.dummy.matrix);
        }

        // Flag all instanced matrices as dirty
        for (const key of Object.keys(this.buckets)) {
            for (const bucket of this.buckets[key]) {
                bucket.mesh.instanceMatrix.needsUpdate = true;
            }
        }
    }
}
