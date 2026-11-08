import {
  BufferGeometry, Float32BufferAttribute, PerspectiveCamera, Points,
  ShaderMaterial, Sprite, Vector3,
} from 'three';

const viewPosition = new Vector3();
const screenUp = new Vector3();
const targetPosition = new Vector3();
const labelCentre = new Vector3();

const LABEL_HEIGHT_PX = 40;
const LABEL_WIDTH_PX = 4 * LABEL_HEIGHT_PX;

/** Labels have a constant CSS-pixel footprint, with clearance outside the
 * displayed body. No AU-sized minimum overwhelms a realistically scaled moon.
 * The clearance is measured from the sphere's limb, not its radius, and the
 * label is hidden once the camera reaches the surface.
 */
export function updateBodyLabel(sprite: Sprite, worldCenter: Vector3, radiusAu: number,
  camera: PerspectiveCamera, viewportHeight: number): boolean {
  viewPosition.copy(worldCenter).applyMatrix4(camera.matrixWorldInverse);
  const depth = -viewPosition.z;
  const radius = Math.max(0, radiusAu);
  if (depth <= radius) return false;
  const unitsPerPixel = 2 * depth * Math.tan(camera.fov * Math.PI / 360)
    / (Math.max(1, viewportHeight) * camera.zoom);
  const height = LABEL_HEIGHT_PX * unitsPerPixel;
  sprite.scale.set(height * (LABEL_WIDTH_PX / LABEL_HEIGHT_PX), height, 1);
  screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  // The limb is at angular radius asin(r/d), which is r*d/sqrt(d^2-r^2) in the
  // centre's depth plane and grows without bound as the camera nears the body.
  const limb = radius * depth / Math.sqrt(depth * depth - radius * radius);
  targetPosition.copy(worldCenter).addScaledVector(screenUp, limb + (8 + 20) * unitsPerPixel);
  if (sprite.parent) sprite.parent.worldToLocal(targetPosition);
  sprite.position.copy(targetPosition);
  return true;
}

export interface LabelRect { x0: number; y0: number; x1: number; y1: number }
/** `wasShown` is the label's visibility in the previous frame; omit it when unknown. */
export interface ProjectedLabel { id: string; rect: LabelRect; radiusAu: number; wasShown?: boolean }

/** Clearance a hidden label needs before it reappears (see declutterLabels). */
const LABEL_HYSTERESIS_PX = 8;

/** Screen rectangle (CSS pixels, y down) that a label's text occupies, read
 * from the sprite's position after updateBodyLabel has placed it. The sprite is
 * 160x40 px but its text is narrower, so the box is the sprite shrunk to the
 * measured text extent (sprite.userData.inkFraction = [width, height] as
 * fractions of the sprite, set where the label canvas is drawn). Without a
 * measurement the text is taken as half the sprite in each direction.
 */
export function labelScreenRect(sprite: Sprite, camera: PerspectiveCamera, viewportHeight: number): LabelRect {
  const [fx, fy] = (sprite.userData.inkFraction as [number, number] | undefined) ?? [0.5, 0.5];
  const width = viewportHeight * camera.aspect;
  sprite.getWorldPosition(labelCentre).project(camera);
  const cx = (labelCentre.x + 1) / 2 * width;
  const cy = (1 - labelCentre.y) / 2 * viewportHeight;
  const hw = LABEL_WIDTH_PX * fx / 2, hh = LABEL_HEIGHT_PX * fy / 2;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

/** Returns the ids of the labels to show: a label is hidden when its rectangle
 * overlaps one already placed by a higher-priority body. Priority, highest first:
 *   1. the focused (or selected) body, which is therefore never hidden;
 *   2. the Sun;
 *   3. every other body by physical radius, largest first, then by input
 *      (catalog) order. Radius is the real one, so the order does not change
 *      when the scale mode is toggled.
 * Greedy, with spatial hysteresis against flicker: a label shown last frame
 * stays shown until its box actually overlaps a placed one, but a label hidden
 * last frame returns only once it clears every placed box by
 * LABEL_HYSTERESIS_PX. A label hovering at an edge therefore changes state at
 * most once per crossing instead of every frame.
 */
export function declutterLabels(labels: readonly ProjectedLabel[], focusedId?: string | null): Set<string> {
  const tier = (id: string) => (id === focusedId ? 0 : id === 'sun' ? 1 : 2);
  const ranked = [...labels].sort((a, b) => tier(a.id) - tier(b.id) || b.radiusAu - a.radiusAu); // stable
  const placed: LabelRect[] = [];
  const shown = new Set<string>();
  for (const { id, rect, wasShown } of ranked) {
    const m = wasShown === false ? LABEL_HYSTERESIS_PX : 0;
    if (placed.some(p => rect.x0 - m < p.x1 && p.x0 < rect.x1 + m && rect.y0 - m < p.y1 && p.y0 < rect.y1 + m)) continue;
    placed.push(rect);
    shown.add(id);
  }
  return shown;
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
