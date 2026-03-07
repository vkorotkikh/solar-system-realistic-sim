import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial
} from 'three';
import { disposeThreeMaterial } from './textureManager';

const ROUTE_SEGMENTS = 90;

function disposeRouteVisualizationResources(routeGroup) {
  for (const child of routeGroup.children) {
    child.traverse((node) => {
      if (node.geometry && typeof node.geometry.dispose === 'function') {
        node.geometry.dispose();
      }
      disposeThreeMaterial(node.material);
    });
  }
}

export function clearRouteVisualization({ routeGroup, simState, statusRouteElement }) {
  disposeRouteVisualizationResources(routeGroup);
  routeGroup.clear();
  simState.route = null;
  statusRouteElement.textContent = 'Route: none';
}

export function plotRoute({
  routeGroup,
  route,
  bodyById,
  simState,
  statusRouteElement,
  buildTransferCurvePoints
}) {
  disposeRouteVisualizationResources(routeGroup);
  routeGroup.clear();

  route.legs.forEach((leg, index) => {
    const points = buildTransferCurvePoints(leg, ROUTE_SEGMENTS);
    const positions = new Float32Array((ROUTE_SEGMENTS + 1) * 3);

    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    const material = new LineBasicMaterial({
      color: new Color(index % 2 === 0 ? '#ffcc85' : '#e98c5a'),
      linewidth: 1.5,
      transparent: true,
      opacity: 0.95
    });

    const line = new Line(geometry, material);
    line.frustumCulled = false;
    routeGroup.add(line);
  });

  simState.route = route;
  const routeNames = route.bodyRoute.map((bodyId) => bodyById.get(bodyId)?.name ?? bodyId).join(' -> ');
  statusRouteElement.textContent = `Route: ${routeNames}`;
}

export function updateRouteVisualization({
  routeGroup,
  route,
  bodyNodes,
  buildTransferCurvePoints,
  tempStart,
  tempEnd
}) {
  if (!route) return;

  const legs = route.legs;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const line = routeGroup.children[i];
    if (!line) continue;

    const fromNode = bodyNodes.get(leg.fromId);
    const toNode = bodyNodes.get(leg.toId);
    if (!fromNode || !toNode) continue;

    fromNode.getWorldPosition(tempStart);
    toNode.getWorldPosition(tempEnd);

    const updatedLeg = {
      startPosition: tempStart.clone(),
      endPosition: tempEnd.clone()
    };

    const points = buildTransferCurvePoints(updatedLeg, ROUTE_SEGMENTS);
    const posAttr = line.geometry.attributes.position;
    for (let j = 0; j < points.length && j < posAttr.count; j++) {
      posAttr.setXYZ(j, points[j].x, points[j].y, points[j].z);
    }
    posAttr.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }
}
