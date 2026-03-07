// Updated asteroidGeometry.ts configured for GPU Shader injection.
import {
    IcosahedronGeometry,
    MeshStandardMaterial,
    Color,
    Vector3,
    InstancedMesh,
    InstancedBufferAttribute,
    DynamicDrawUsage,
    StaticDrawUsage
} from 'three';
import { TAXONOMIES } from './asteroidDistributions';
import { patchAsteroidMaterial, type AsteroidShaderUniforms } from './asteroidShaders';

export interface AsteroidBucket {
    mesh: InstancedMesh;
    capacity: number;
    oParam1: Float32Array;
    oParam2: Float32Array;
    sParam: Float32Array;
}

export type AsteroidBucketMap = Record<string, AsteroidBucket[]>;

export function generateAsteroidGeometry(detail = 1, distortionAmount = 0.35) {
    const geometry = new IcosahedronGeometry(1.0, detail);
    const positionAttribute = geometry.attributes.position;
    const vertex = new Vector3();

    const scaleX = 1.0 + (Math.random() - 0.5) * 0.4;
    const scaleY = 1.0 + (Math.random() - 0.5) * 0.4;
    const scaleZ = 1.0 + (Math.random() - 0.5) * 0.4;

    for (let i = 0; i < positionAttribute.count; i++) {
        vertex.fromBufferAttribute(positionAttribute, i);
        vertex.x *= scaleX;
        vertex.y *= scaleY;
        vertex.z *= scaleZ;
        const scalar = 1.0 + (Math.random() - 0.5) * distortionAmount;
        vertex.multiplyScalar(scalar);
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
    return geometry;
}

export function createAsteroidInstancedBuckets(
    totalAsteroids: number,
    shapesPerTaxonomy: number,
    shaderUniforms: AsteroidShaderUniforms
): AsteroidBucketMap {
    const buckets: AsteroidBucketMap = {};
    const taxKeys = Object.keys(TAXONOMIES) as (keyof typeof TAXONOMIES)[];
    const maxPerMesh = Math.ceil(totalAsteroids / (taxKeys.length * shapesPerTaxonomy));

    for (const key of taxKeys) {
        const tax = TAXONOMIES[key];
        buckets[key] = [];

        for (let i = 0; i < shapesPerTaxonomy; i++) {
            const geom = generateAsteroidGeometry(1, 0.4);

            // Setup the geometry to hold our custom orbital buffers
            geom.setAttribute('aOrbitParams1', new InstancedBufferAttribute(new Float32Array(maxPerMesh * 4), 4));
            geom.setAttribute('aOrbitParams2', new InstancedBufferAttribute(new Float32Array(maxPerMesh * 3), 3));
            geom.setAttribute('aSpinParams', new InstancedBufferAttribute(new Float32Array(maxPerMesh * 4), 4));

            const mat = new MeshStandardMaterial({
                color: new Color('#ffffff'),
                roughness: tax.roughness,
                metalness: tax.metalness,
                flatShading: true
            });

            // Inject the Keplerian orbit shader
            patchAsteroidMaterial(mat, shaderUniforms);

            const iMesh = new InstancedMesh(geom, mat, maxPerMesh);
            // Now the matrix only holds Scale + local offset, not global world pos. It can be static!
            iMesh.instanceMatrix.setUsage(StaticDrawUsage);

            iMesh.count = 0;
            // Because the position is pushed globally by the shader, we must disable standard frustum culling
            // Alternatively, we set the bounding sphere to encapsulate the whole inner solar system
            iMesh.frustumCulled = false;

            buckets[key].push({
                mesh: iMesh,
                capacity: maxPerMesh,
                // Keep tracking arrays for easy populating
                oParam1: geom.attributes.aOrbitParams1.array as Float32Array,
                oParam2: geom.attributes.aOrbitParams2.array as Float32Array,
                sParam: geom.attributes.aSpinParams.array as Float32Array
            });
        }
    }

    return buckets;
}
