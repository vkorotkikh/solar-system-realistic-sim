import type { BufferGeometry, Camera, Mesh, Object3D, Vector3 } from 'three';

type LodLevel = 'low' | 'medium' | 'high';
interface SurfaceLodOptions {
  bodyId: string;
  profile?: { lod?: { thresholdsAu?: { high?: number; medium?: number } } } | null;
  lodGeometries?: { low: BufferGeometry; medium?: BufferGeometry; high?: BufferGeometry } | null;
  currentLevel: string;
  surfaceMesh?: Mesh | null;
  cloudMesh?: Mesh | null;
  atmosphereMesh?: Mesh | null;
  extraMeshes?: (Mesh | null | undefined)[];
  bodyNodes: ReadonlyMap<string, Object3D>;
  camera: Camera;
  tempVector: Vector3;
}

export function updateBodySurfaceLod({
  bodyId,
  profile,
  lodGeometries,
  currentLevel,
  surfaceMesh,
  cloudMesh = null,
  atmosphereMesh = null,
  extraMeshes = [],
  bodyNodes,
  camera,
  tempVector
}: SurfaceLodOptions) {
  if (!surfaceMesh || !lodGeometries) return currentLevel;

  const node = bodyNodes.get(bodyId);
  if (!node) return currentLevel;

  node.getWorldPosition(tempVector);
  const distanceToBody = camera.position.distanceTo(tempVector);
  const highThreshold = profile?.lod?.thresholdsAu?.high ?? 0.00025;
  const mediumThreshold = profile?.lod?.thresholdsAu?.medium ?? 0.0012;

  let targetLevel: LodLevel = 'low';
  if (distanceToBody < highThreshold) {
    targetLevel = 'high';
  } else if (distanceToBody < mediumThreshold) {
    targetLevel = 'medium';
  }

  if (targetLevel === currentLevel) return currentLevel;

  const targetGeometry = lodGeometries[targetLevel] ?? lodGeometries.low;
  surfaceMesh.geometry = targetGeometry;
  if (cloudMesh) cloudMesh.geometry = targetGeometry;
  if (atmosphereMesh) atmosphereMesh.geometry = targetGeometry;
  for (const mesh of extraMeshes) {
    if (mesh) {
      mesh.geometry = targetGeometry;
    }
  }

  return targetLevel;
}
