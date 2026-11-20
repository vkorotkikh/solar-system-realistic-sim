import { Mesh, ShaderMaterial, SphereGeometry, Vector3, type Texture } from 'three';
import { mapUvGLSL } from './planetShaders';

/** Height of the cloud shell above Earth's smooth surface, about where deep cloud tops sit. */
export const CLOUD_LIFT_KM = 10;
/** Opacity of a fully cloudy pixel: from orbit thick cloud still lets a little ground through. */
export const CLOUD_OPACITY = 0.9;
const EARTH_MEAN_RADIUS_KM = 6371.0088;

const vertexShader = /* glsl */`
varying vec3 vSpherePosition;
void main() {
    vSpherePosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Lit exactly like the ground in planetShaders.ts: Lambert from the same body-frame light
// direction plus 0.05 ambient, written raw, so clouds and ice match and share one day/night edge.
const fragmentShader = /* glsl */`
uniform sampler2D uCloudMap;
uniform vec3 uLightDirection;
varying vec3 vSpherePosition;
${mapUvGLSL}
void main() {
    vec3 up = normalize(vSpherePosition);
    float cover = texture2D(uCloudMap, mapUv(up)).r;
    float diffuse = max(0.0, dot(up, normalize(uLightDirection)));
    gl_FragColor = vec4(vec3(diffuse + 0.05), cover * ${CLOUD_OPACITY.toFixed(3)});
}
`;

/**
 * NASA's Blue Marble cloud map on a see-through sphere just above Earth. A child of the Earth
 * quadtree's group, so it turns with the surface; the tree forwards radius and light to it.
 */
export class CloudShell {
    readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

    constructor(map: Texture, radius: number) {
        // 192 segments sag under 1 km between vertices, well below the 10 km lift.
        this.mesh = new Mesh(new SphereGeometry(1, 192, 96), new ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: { uCloudMap: { value: map }, uLightDirection: { value: new Vector3(1, 0, 0) } },
            transparent: true,
            // Writes no depth, so it never hides what lies behind it.
            depthWrite: false,
            // Beyond ~10 Earth radii the 10 km lift is under one depth step, and the ground's
            // depth cut triangular holes in up to 30% of the clouds (real GPU, 60 radii). An
            // offset of 2 steps closed every hole at 10-60 radii; 4 leaves margin for other GPUs.
            polygonOffset: true,
            polygonOffsetUnits: -4,
        }));
        // Opaque ground always draws first. Among see-through objects the clouds go before the
        // default ones: orbit lines write depth, and drawn first they would cut slits through the
        // clouds. The background layers (belts at -4 and -5, the sky further back) stay behind.
        this.mesh.renderOrder = -1;
        this.setRadius(radius);
    }

    setRadius(radius: number) {
        this.mesh.scale.setScalar(radius * (1 + CLOUD_LIFT_KM / EARTH_MEAN_RADIUS_KM));
    }

    setLightDirection(direction: Vector3) {
        this.mesh.material.uniforms.uLightDirection.value.copy(direction).normalize();
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
