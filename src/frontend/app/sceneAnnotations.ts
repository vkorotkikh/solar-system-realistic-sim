import {
  BufferGeometry, Float32BufferAttribute, PerspectiveCamera, Points,
  ShaderMaterial, Sprite, Vector3,
} from 'three';

const viewPosition = new Vector3();
const screenUp = new Vector3();
const targetPosition = new Vector3();

/** Labels have a constant CSS-pixel footprint, with clearance outside the
 * displayed body. No AU-sized minimum overwhelms a realistically scaled moon.
 */
export function updateBodyLabel(sprite: Sprite, worldCenter: Vector3, radiusAu: number,
  camera: PerspectiveCamera, viewportHeight: number): boolean {
  viewPosition.copy(worldCenter).applyMatrix4(camera.matrixWorldInverse);
  const depth = -viewPosition.z;
  if (depth <= 0) return false;
  const unitsPerPixel = 2 * depth * Math.tan(camera.fov * Math.PI / 360)
    / (Math.max(1, viewportHeight) * camera.zoom);
  const height = 40 * unitsPerPixel;
  sprite.scale.set(height * 4, height, 1);
  screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  targetPosition.copy(worldCenter).addScaledVector(screenUp,
    Math.max(0, radiusAu) + (8 + 20) * unitsPerPixel);
  if (sprite.parent) sprite.parent.worldToLocal(targetPosition);
  sprite.position.copy(targetPosition);
  return true;
}

/** Decorative directions, not a distance catalog. Projection always places
 * points on the far depth plane, independently of the physical scene's clip
 * range. Direction-only view transforms avoid camera-position subtraction.
 */
export function createBackgroundStars(count = 6000, random = Math.random) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = random() * Math.PI * 2;
    const z = random() * 2 - 1;
    const radial = Math.sqrt(1 - z * z);
    positions[i * 3] = radial * Math.cos(theta);
    positions[i * 3 + 1] = radial * Math.sin(theta);
    positions[i * 3 + 2] = z;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      uniform float pixelRatio;
      void main() {
        vec3 direction = mat3(modelViewMatrix) * position;
        gl_Position = projectionMatrix * vec4(direction, 1.0);
        gl_Position.z = gl_Position.w;
        gl_PointSize = 1.2 * pixelRatio;
      }`,
    fragmentShader: `
      void main() {
        if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
        gl_FragColor = vec4(1.0);
      }`,
    depthWrite: false,
  });
  const stars = new Points(geometry, material);
  stars.frustumCulled = false;
  stars.renderOrder = -1000;
  stars.onBeforeRender = renderer => { material.uniforms.pixelRatio.value = renderer.getPixelRatio(); };
  return stars;
}
