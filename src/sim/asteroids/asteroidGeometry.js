// Prototype implementation for Asteroid 3D Models and Materials

import {
    IcosahedronGeometry,
    MeshStandardMaterial,
    Color,
    Vector3,
    InstancedMesh,
    DynamicDrawUsage,
    Object3D
} from 'three';
import { TAXONOMIES } from './asteroidDistributions.js';

/**
 * Procedurally generates a low-poly asteroid shape.
 * Achieved by displacing the vertices of an icosahedron.
 */
export function generateAsteroidGeometry(detail = 1, distortionAmount = 0.35) {
    const geometry = new IcosahedronGeometry(1.0, detail);
    const positionAttribute = geometry.attributes.position;
    const vertex = new Vector3();

    // Create a potato-like primary distortion by scaling axes non-uniformly first
    const scaleX = 1.0 + (Math.random() - 0.5) * 0.4;
    const scaleY = 1.0 + (Math.random() - 0.5) * 0.4;
    const scaleZ = 1.0 + (Math.random() - 0.5) * 0.4;

    for (let i = 0; i < positionAttribute.count; i++) {
        vertex.fromBufferAttribute(positionAttribute, i);

        // Non-uniform base stretch
        vertex.x *= scaleX;
        vertex.y *= scaleY;
        vertex.z *= scaleZ;

        // Per-vertex random noise for rubble-pile rockiness
        const scalar = 1.0 + (Math.random() - 0.5) * distortionAmount;
        vertex.multiplyScalar(scalar);

        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Picks a random color within the given taxonomy's array.
 */
export function randomTaxonomyColor(taxObj) {
    const colors = taxObj.colorRange;
    const hex = colors[Math.floor(Math.random() * colors.length)];
    const color = new Color(hex);

    // Slight luminance shift for extra variety
    const shift = (Math.random() - 0.5) * 0.1;
    color.offsetHSL(0, 0, shift);
    return color;
}

/**
 * Pre-computes and returns a mapping of InstancedMeshes.
 * We create one or more InstancedMeshes per Taxonomic class to allow 
 * for unique PBR properties (metalness/roughness) and base geometry variance.
 * 
 * @param {number} totalAsteroids - The total expected count of objects limit.
 * @param {number} shapesPerTaxonomy - How many distinct base shapes per taxonomy group.
 */
export function createAsteroidInstancedBuckets(totalAsteroids, shapesPerTaxonomy = 3) {
    const buckets = {};
    const taxKeys = Object.keys(TAXONOMIES);

    // Distribute max capacities evenly among the meshes for now.
    // In a real pipeline, we'd count exactly how many of each we generated.
    const maxPerMesh = Math.ceil(totalAsteroids / (taxKeys.length * shapesPerTaxonomy));

    for (const key of taxKeys) {
        const tax = TAXONOMIES[key];
        buckets[key] = [];

        for (let i = 0; i < shapesPerTaxonomy; i++) {
            // 1. Generate unique shape
            const geom = generateAsteroidGeometry(1, 0.4);

            // 2. Map material
            const mat = new MeshStandardMaterial({
                color: new Color('#ffffff'), // White base, instances will recolor via setColorAt
                roughness: tax.roughness,
                metalness: tax.metalness,
                flatShading: true
            });

            // 3. Create InstancedMesh
            const iMesh = new InstancedMesh(geom, mat, maxPerMesh);
            // We'll update the matrix attributes dynamically in the render loop on the GPU
            iMesh.instanceMatrix.setUsage(DynamicDrawUsage);
            // If we update color on load, its a static attribute
            // iMesh.instanceColor.setUsage(StaticDrawUsage); 

            // Initially hide the excess instances by setting count to 0
            iMesh.count = 0;

            buckets[key].push({
                mesh: iMesh,
                capacity: maxPerMesh
            });
        }
    }

    return buckets;
}
