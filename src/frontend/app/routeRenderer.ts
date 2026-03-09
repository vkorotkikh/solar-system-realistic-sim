import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Object3D,
  Vector3,
  type Material,
  type Group
} from 'three';
import { disposeThreeMaterial } from './textureManager';

const ROUTE_SEGMENTS = 90;

interface RouteLeg {
  fromId?: string;
  toId?: string;
  startPosition?: Vector3;
  endPosition?: Vector3;
}

interface RouteLike {
  bodyRoute: string[];
  legs: RouteLeg[];
}

interface RouteNode extends Object3D {
  geometry?: BufferGeometry & { dispose: () => void; attributes: { position: { count: number; setXYZ: (index: number, x: number, y: number, z: number) => void; needsUpdate: boolean } } };
  material?: Material | Material[] | null;
}

interface StatusElementLike {
  textContent: string | null;
}

interface ClearRouteVisualizationArgs {
  routeGroup: Group;
  simState: { route: RouteLike | null };
  statusRouteElement: StatusElementLike;
}

interface PlotRouteArgs extends ClearRouteVisualizationArgs {
  route: RouteLike;
  bodyById: Map<string, { name?: string }>;
  buildTransferCurvePoints: (leg: RouteLeg, segments: number) => Vector3[];
}

interface UpdateRouteVisualizationArgs {
  routeGroup: Group;
  route: RouteLike | null;
  bodyNodes: Map<string, Object3D>;
  buildTransferCurvePoints: (leg: RouteLeg, segments: number) => Vector3[];
  tempStart: Vector3;
  tempEnd: Vector3;
}

function disposeRouteVisualizationResources(routeGroup: Group): void {
  for (const child of routeGroup.children) {
    child.traverse((node) => {
      const routeNode = node as RouteNode;
      if (routeNode.geometry && typeof routeNode.geometry.dispose === 'function') {
        routeNode.geometry.dispose();
      }
      disposeThreeMaterial(routeNode.material);
    });
  }
}

export function clearRouteVisualization({ routeGroup, simState, statusRouteElement }: ClearRouteVisualizationArgs): void {
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
}: PlotRouteArgs): void {
  disposeRouteVisualizationResources(routeGroup);
  routeGroup.clear();

  route.legs.forEach((leg: RouteLeg, index: number) => {
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
  const routeNames = route.bodyRoute.map((bodyId: string) => bodyById.get(bodyId)?.name ?? bodyId).join(' -> ');
  statusRouteElement.textContent = `Route: ${routeNames}`;
}

export function updateRouteVisualization({
  routeGroup,
  route,
  bodyNodes,
  buildTransferCurvePoints,
  tempStart,
  tempEnd
}: UpdateRouteVisualizationArgs): void {
  if (!route) return;

  const legs = route.legs;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const line = routeGroup.children[i] as RouteNode | undefined;
    if (!line?.geometry) continue;
    if (!leg.fromId || !leg.toId) continue;

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
