// Updated asteroidPipeline.ts configured for GPU Shader injection.
import { Color, Group, Vector3, Matrix4 } from 'three';
import {
    generateAsteroidElement,
    sampleTaxonomy,
    samplePowerLawSize
} from './asteroidDistributions';
import { createAsteroidInstancedBuckets } from './asteroidGeometry';

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
        const reusableSpinAxis = new Vector3();
        const reusableColor = new Color();
        const CHUNK_SIZE = 10_000;

        for (const [populationType, count] of Object.entries(POPULATION_COUNTS)) {
            for (let chunkStart = 0; chunkStart < count; chunkStart += CHUNK_SIZE) {
                const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, count);

                for (let i = chunkStart; i < chunkEnd; i++) {
                    const element = generateAsteroidElement(populationType);
                    const taxonomyClass = sampleTaxonomy(element.aAu);

                    const taxBuckets = this.buckets[taxonomyClass.type];
                    const targetBucket = taxBuckets[Math.floor(Math.random() * taxBuckets.length)];
                    const localIdx = targetBucket.mesh.count;
                    targetBucket.mesh.count++;

                    // 1. Pack Orbit Data
                    targetBucket.oParam1[localIdx * 4 + 0] = element.aAu;
                    targetBucket.oParam1[localIdx * 4 + 1] = element.e;
                    targetBucket.oParam1[localIdx * 4 + 2] = element.iDeg * (Math.PI / 180.0);
                    targetBucket.oParam1[localIdx * 4 + 3] = element.ascendingNodeDeg * (Math.PI / 180.0);

                    targetBucket.oParam2[localIdx * 3 + 0] = element.argPeriapsisDeg * (Math.PI / 180.0);
                    targetBucket.oParam2[localIdx * 3 + 1] = element.meanAnomalyDeg * (Math.PI / 180.0);
                    targetBucket.oParam2[localIdx * 3 + 2] = element.periodDays;

                    // 2. Pack Spin Data — reuse Vector3
                    reusableSpinAxis.set(
                        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
                    ).normalize().multiplyScalar(0.02 + Math.random() * 0.1);

                    targetBucket.sParam[localIdx * 4 + 0] = reusableSpinAxis.x;
                    targetBucket.sParam[localIdx * 4 + 1] = reusableSpinAxis.y;
                    targetBucket.sParam[localIdx * 4 + 2] = reusableSpinAxis.z;
                    targetBucket.sParam[localIdx * 4 + 3] = Math.random() * Math.PI * 2;

                    // 3. Static InstanceMatrix (Scale only)
                    const radiusKm = samplePowerLawSize(0.5, 300, 2.5);
                    const AU_IN_KM = 149597870.7;
                    const baseRenderScale = (radiusKm / AU_IN_KM) * sceneScaleAu;
                    const scaleVal = baseRenderScale * 25000.0;
                    dummyMatrix.makeScale(scaleVal, scaleVal, scaleVal);
                    targetBucket.mesh.setMatrixAt(localIdx, dummyMatrix);

                    // 4. Color — reuse Color object
                    const cHex = taxonomyClass.colorRange[Math.floor(Math.random() * taxonomyClass.colorRange.length)];
                    reusableColor.set(cHex);
                    reusableColor.offsetHSL(0.0, 0.0, (Math.random() - 0.5) * 0.1);
                    targetBucket.mesh.setColorAt(localIdx, reusableColor);

                    globalIndex++;
                }

                // Yield to main thread between chunks to prevent UI freezing
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
