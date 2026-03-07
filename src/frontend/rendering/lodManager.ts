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
}) {
  if (!surfaceMesh || !lodGeometries) return currentLevel;

  const node = bodyNodes.get(bodyId);
  if (!node) return currentLevel;

  node.getWorldPosition(tempVector);
  const distanceToBody = camera.position.distanceTo(tempVector);
  const highThreshold = profile?.lod?.thresholdsAu?.high ?? 0.00025;
  const mediumThreshold = profile?.lod?.thresholdsAu?.medium ?? 0.0012;

  let targetLevel = 'low';
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
