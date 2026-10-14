// src/frontend/features/planetary/quadtreeLOD.ts

import {
    Group,
    PlaneGeometry,
    Vector3,
    Matrix4,
    Mesh,
    Camera,
    ShaderMaterial,
    Sphere,
    Float32BufferAttribute,
    type Object3D
} from 'three';
import { createPlanetShaderMaterial } from './planetShaders';

const MAX_LOD_LEVEL = 7; // Approx 2^13 segments across equator, enough to see canyons

// All patches share one GPU geometry. Inward skirts seal the T-junctions where
// a fine spherical edge meets a coarser chord (even with zero terrain relief).
function createChunkGeometry(): PlaneGeometry {
    const segments = 64;
    const stride = segments + 1;
    const geometry = new PlaneGeometry(1, 1, segments, segments);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const positions = Array.from(position.array);
    const uvs = Array.from(uv.array);
    const indices = Array.from(geometry.getIndex()!.array);
    const boundary: number[] = [];
    // Counterclockwise boundary in face-local XY, without duplicated corners.
    for (let x = 0; x <= segments; x++) boundary.push(segments * stride + x);
    for (let y = segments - 1; y >= 0; y--) boundary.push(y * stride + segments);
    for (let x = segments - 1; x >= 0; x--) boundary.push(x);
    for (let y = 1; y < segments; y++) boundary.push(y * stride);
    const skirt = new Float32Array(position.count + boundary.length);
    skirt.fill(1, position.count);
    boundary.forEach((vertex, i) => {
        positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
        uvs.push(uv.getX(vertex), uv.getY(vertex));
        const next = (i + 1) % boundary.length;
        indices.push(vertex, position.count + i, boundary[next]);
        indices.push(boundary[next], position.count + i, position.count + next);
    });
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aSkirt', new Float32BufferAttribute(skirt, 1));
    geometry.deleteAttribute('normal'); // The shader derives surface normals.
    geometry.setIndex(indices);
    return geometry;
}

const SHARED_PLANE_GEOMETRY = createChunkGeometry();

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
        // Start with coverage. Evaluate only after the tree has a current body
        // transform and camera position, not while its group is still detached.
        this.createMesh();
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
            this.mesh = null;
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
        // Patch coordinates belong BEFORE spherical projection. The mesh itself
        // stays in the planet frame so modelViewMatrix cannot translate/scale the
        // already projected sphere a second time.
        this.mesh.userData.bodyId = this.tree.planetId;
        this.mesh.onBeforeRender = () => {
            this.tree.material.uniforms.uPatchToCube.value.copy(matrix);
            this.tree.material.uniforms.uSkirtDepth.value =
                this.tree.baseRadius * this.size * 0.02 +
                2 * Math.abs(this.tree.material.uniforms.uDisplacementScale.value);
            // All patches share one material; upload this draw's patch even when
            // Three reuses the previous material/program.
            this.tree.material.uniformsNeedUpdate = true;
        };
        this.mesh.frustumCulled = false; // Trusting standard frustum isn't easy with extreme displacement

        this.tree.group.add(this.mesh);
    }

    distanceToCamera() {
        // Calculate center of chunk on sphere
        const centerLocal = this.offset.clone();
        centerLocal.applyMatrix4(this.faceTransform);
        const centerSphere = centerLocal.normalize().multiplyScalar(this.tree.baseRadius);

        return centerSphere.distanceTo(this.tree.cameraLocalPosition);
    }

    destroy() {
        if (this.mesh) {
            this.tree.group.remove(this.mesh);
            this.mesh = null;
        }
        for (const child of this.children) {
            child.destroy();
        }
        this.children = [];
        this.isSplit = false;
    }
}

export class PlanetQuadtree {
    group: Group;
    faces: QuadtreeNode[] = [];
    material: ShaderMaterial;
    readonly cameraLocalPosition = new Vector3();

    constructor(
        public planetId: string,
        public baseRadius: number,
        public camera: Camera
    ) {
        if (!Number.isFinite(baseRadius) || baseRadius <= 0) {
            throw new RangeError('Planet radius must be finite and positive');
        }
        this.group = new Group();
        this.group.userData.bodyId = planetId;
        this.material = createPlanetShaderMaterial(planetId, baseRadius);

        // A deliberate mean-radius sphere pick proxy. CPU plane triangles do
        // not describe a shader-displaced surface. This keeps identity and hit
        // distance independent of patch count, without allocating a hidden mesh.
        const pickSphere = new Sphere();
        const hitPoint = new Vector3();
        this.group.raycast = (raycaster, intersections) => {
            for (let object: Object3D | null = this.group; object; object = object.parent) {
                if (!object.visible) return;
            }
            this.group.updateWorldMatrix(true, false);
            pickSphere.center.set(0, 0, 0);
            pickSphere.radius = this.baseRadius;
            pickSphere.applyMatrix4(this.group.matrixWorld);
            if (!raycaster.ray.intersectSphere(pickSphere, hitPoint)) return;
            const distance = raycaster.ray.origin.distanceTo(hitPoint);
            if (distance < raycaster.near || distance > raycaster.far) return;
            intersections.push({ distance, point: hitPoint.clone(), object: this.group });
        };

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
        this.group.updateWorldMatrix(true, false);
        this.camera.getWorldPosition(this.cameraLocalPosition);
        this.group.worldToLocal(this.cameraLocalPosition);
        this.material.uniforms.uCameraPositionLocal.value.copy(this.cameraLocalPosition);
        for (const face of this.faces) {
            face.evaluate();
        }
    }

    setRadius(radius: number) {
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new RangeError('Planet radius must be finite and positive');
        }
        const ratio = radius / this.baseRadius;
        this.baseRadius = radius;
        this.material.uniforms.uRadius.value = radius;
        this.material.uniforms.uDisplacementScale.value *= ratio;
        this.update();
    }

    setLightDirection(dir: Vector3) {
        this.material.uniforms.uLightDirection.value.copy(dir).normalize();
    }
}
