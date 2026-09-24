// src/frontend/features/planetary/quadtreeLOD.ts

import {
    Group,
    PlaneGeometry,
    Vector3,
    Matrix4,
    Mesh,
    Camera,
    ShaderMaterial
} from 'three';
import { createPlanetShaderMaterial } from './planetShaders';

const MAX_LOD_LEVEL = 7; // Approx 2^13 segments across equator, enough to see canyons

// Shared high-density plane for LOD chunks
const SHARED_PLANE_GEOMETRY = new PlaneGeometry(1, 1, 64, 64);

class QuadtreeNode {
    mesh: Mesh | null = null;
    children: QuadtreeNode[] = [];
    isSplit: boolean = false;

    constructor(
        public tree: PlanetQuadtree,
        public faceTransform: Matrix4,
        public level: number,
        public offset: Vector3,
        public size: number
    ) {
        this.evaluate();
    }

    evaluate() {
        const dist = this.distanceToCamera();
        // The closer we are relative to size, the more we subdivide.
        // baseRadius * size is roughly the patch width in world space.
        const threshold = this.tree.baseRadius * this.size * 3.5;

        if (dist < threshold && this.level < MAX_LOD_LEVEL) {
            this.split();
        } else {
            this.merge();
        }

        if (this.isSplit) {
            for (const child of this.children) {
                child.evaluate();
            }
        }
    }

    split() {
        if (this.isSplit) return;
        this.isSplit = true;

        if (this.mesh) {
            this.tree.group.remove(this.mesh);
        }

        const nextSize = this.size * 0.5;
        const nextLevel = this.level + 1;

        // 4 quadrants
        const offsets = [
            new Vector3(-nextSize * 0.5, nextSize * 0.5, 0),
            new Vector3(nextSize * 0.5, nextSize * 0.5, 0),
            new Vector3(-nextSize * 0.5, -nextSize * 0.5, 0),
            new Vector3(nextSize * 0.5, -nextSize * 0.5, 0),
        ];

        for (const o of offsets) {
            const childOffset = this.offset.clone().add(o);
            this.children.push(new QuadtreeNode(this.tree, this.faceTransform, nextLevel, childOffset, nextSize));
        }
    }

    merge() {
        if (!this.isSplit) {
            if (!this.mesh) {
                this.createMesh();
            }
            return;
        }

        this.isSplit = false;
        for (const child of this.children) {
            child.destroy();
        }
        this.children = [];
        this.createMesh();
    }

    createMesh() {
        if (this.mesh) return;

        // Calculate chunk transform mapping local space [-0.5, 0.5] to correct offset
        const scale = this.size;
        const matrix = new Matrix4();

        // Translate to face offset
        matrix.makeTranslation(this.offset.x, this.offset.y, this.offset.z);
        // Scale to size
        matrix.scale(new Vector3(scale, scale, 1.0));
        // Apply face orientation
        matrix.premultiply(this.faceTransform);

        this.mesh = new Mesh(SHARED_PLANE_GEOMETRY, this.tree.material);
        this.mesh.applyMatrix4(matrix);
        this.mesh.frustumCulled = false; // Trusting standard frustum isn't easy with extreme displacement

        this.tree.group.add(this.mesh);
    }

    distanceToCamera() {
        // Calculate center of chunk on sphere
        const centerLocal = this.offset.clone();
        centerLocal.applyMatrix4(this.faceTransform);
        const centerSphere = centerLocal.normalize().multiplyScalar(this.tree.baseRadius);

        // Apply parent transform to get world space
        const centerWorld = centerSphere.applyMatrix4(this.tree.group.matrixWorld);

        return centerWorld.distanceTo(this.tree.camera.position);
    }

    destroy() {
        if (this.mesh) {
            this.tree.group.remove(this.mesh);
            this.mesh = null;
        }
        for (const child of this.children) {
            child.destroy();
        }
    }
}

export class PlanetQuadtree {
    group: Group;
    faces: QuadtreeNode[] = [];
    material: ShaderMaterial;

    constructor(
        public planetId: string,
        public baseRadius: number,
        public camera: Camera
    ) {
        this.group = new Group();
        this.material = createPlanetShaderMaterial(planetId, baseRadius);

        this.initFaces();
    }

    initFaces() {
        const faceTransforms = [
            // +Z
            new Matrix4().makeTranslation(0, 0, 0.5),
            // -Z
            new Matrix4().makeRotationY(Math.PI).setPosition(0, 0, -0.5),
            // +X
            new Matrix4().makeRotationY(Math.PI / 2).setPosition(0.5, 0, 0),
            // -X
            new Matrix4().makeRotationY(-Math.PI / 2).setPosition(-0.5, 0, 0),
            // +Y
            new Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.5, 0),
            // -Y
            new Matrix4().makeRotationX(Math.PI / 2).setPosition(0, -0.5, 0)
        ];

        for (let transform of faceTransforms) {
            // Root face spans [-0.5, 0.5] natively without scaling geometry locally, wait no:
            // The PlaneGeometry spans [-0.5, 0.5]. So size 1 perfectly covers the face!
            this.faces.push(new QuadtreeNode(this, transform, 0, new Vector3(0, 0, 0), 1.0));
        }
    }

    update() {
        for (const face of this.faces) {
            face.evaluate();
        }
    }

    setLightDirection(dir: Vector3) {
        this.material.uniforms.uLightDirection.value.copy(dir).normalize();
    }
}
