// Updated asteroidPipeline.js configured for GPU Shader injection.
import { Object3D, Color, Group, Vector3, Matrix4 } from 'three';
import {
    generateAsteroidElement,
    sampleTaxonomy,
    samplePowerLawSize
} from './asteroidDistributions.js';
import { createAsteroidInstancedBuckets } from './asteroidGeometry.js';

// Configuration: Massive counts for GPU phase
const POPULATION_COUNTS = {
    'main-belt': 1_200_000,
    'hilda': 100_000,
    'trojan-l4': 300_000,
    'trojan-l5': 300_000,
    'nea': 25_000
};

export class AsteroidSimulationPipeline {
    constructor() {
        this.rootGroup = new Group();
        this.rootGroup.name = 'UltraRealisticAsteroidBeltGPU';
        this.buckets = {};

        // Shared uniforms across all asteroid materials
        this.shaderUniforms = {
            uTimeDays: { value: 0 },
            uViewScaleAu: { value: 1.0 } // Should be the same scale used to convert AU to screen units
        };
    }

    async initialize(sceneScaleAu = Math.pow(10, 8)) {
        this.shaderUniforms.uViewScaleAu.value = sceneScaleAu;

        const totalCount = Object.values(POPULATION_COUNTS).reduce((a, b) => a + b, 0);
        this.buckets = createAsteroidInstancedBuckets(totalCount, 4, this.shaderUniforms);

        for (const key of Object.keys(this.buckets)) {
            for (const bucket of this.buckets[key]) {
                this.rootGroup.add(bucket.mesh);
            }
        }

        let globalIndex = 0;
        const dummyMatrix = new Matrix4();

        for (const [populationType, count] of Object.entries(POPULATION_COUNTS)) {
            for (let i = 0; i < count; i++) {
                const element = generateAsteroidElement(populationType);
                const taxonomyClass = sampleTaxonomy(element.aAu);

                const taxBuckets = this.buckets[taxonomyClass.type];
                const targetBucket = taxBuckets[Math.floor(Math.random() * taxBuckets.length)];
                const localIdx = targetBucket.mesh.count;
                targetBucket.mesh.count++;

                // 1. Pack Orbit Data
                // aOrbitParams1: aAu, e, i, Omega
                targetBucket.oParam1[localIdx * 4 + 0] = element.aAu;
                targetBucket.oParam1[localIdx * 4 + 1] = element.e;
                targetBucket.oParam1[localIdx * 4 + 2] = element.iDeg * (Math.PI / 180.0);
                targetBucket.oParam1[localIdx * 4 + 3] = element.ascendingNodeDeg * (Math.PI / 180.0);

                // aOrbitParams2: omega, M0, period
                targetBucket.oParam2[localIdx * 3 + 0] = element.argPeriapsisDeg * (Math.PI / 180.0);
                targetBucket.oParam2[localIdx * 3 + 1] = element.meanAnomalyDeg * (Math.PI / 180.0);
                targetBucket.oParam2[localIdx * 3 + 2] = element.periodDays;

                // 2. Pack Spin Data
                const spinAxis = new Vector3(
                    (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)
                ).normalize().multiplyScalar(0.02 + Math.random() * 0.1); // Rate

                targetBucket.sParam[localIdx * 4 + 0] = spinAxis.x;
                targetBucket.sParam[localIdx * 4 + 1] = spinAxis.y;
                targetBucket.sParam[localIdx * 4 + 2] = spinAxis.z;
                targetBucket.sParam[localIdx * 4 + 3] = Math.random() * Math.PI * 2; // Initial phase

                // 3. Static InstanceMatrix (Scale only, since translation is in Shader)
                // Adjust sample sizing rules. A realistic scale is very small;
                const radiusKm = samplePowerLawSize(0.5, 300, 2.5);
                const AU_IN_KM = 149597870.7;
                const baseRenderScale = (radiusKm / AU_IN_KM) * sceneScaleAu;
                // Increase scalar so they are visible on screen
                const scaleVal = baseRenderScale * 25000.0;
                dummyMatrix.makeScale(scaleVal, scaleVal, scaleVal);
                targetBucket.mesh.setMatrixAt(localIdx, dummyMatrix);

                // 4. Color
                const cHex = taxonomyClass.colorRange[Math.floor(Math.random() * taxonomyClass.colorRange.length)];
                const color = new Color(cHex);
                color.offsetHSL(0.0, 0.0, (Math.random() - 0.5) * 0.1);
                targetBucket.mesh.setColorAt(localIdx, color);

                globalIndex++;
            }
        }

        // Upload all buffers to the GPU
        for (const key of Object.keys(this.buckets)) {
            for (const bucket of this.buckets[key]) {
                if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
                bucket.mesh.instanceMatrix.needsUpdate = true;

                bucket.mesh.geometry.attributes.aOrbitParams1.needsUpdate = true;
                bucket.mesh.geometry.attributes.aOrbitParams2.needsUpdate = true;
                bucket.mesh.geometry.attributes.aSpinParams.needsUpdate = true;
            }
        }

        console.log(`[GPU Asteroids] Generated and offloaded ${globalIndex} bodies to the GPU.`);
        return this.rootGroup;
    }

    /**
     * Extremely lightweight CPU update loop. 
     * Array iteration has been fully eliminated. Only updating uniforms.
     */
    update(jd) {
        const epochJd = 2451545.0; // J2000
        this.shaderUniforms.uTimeDays.value = jd - epochJd;
    }
}
