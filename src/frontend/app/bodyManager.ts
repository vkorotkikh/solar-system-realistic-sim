import type { Object3D } from 'three';

export interface SceneBodyLike {
  id: string;
  parentId?: string | null;
  type: string;
  orbit?: { epochJd: number; [key: string]: unknown } | null;
}

export interface SceneBodyStateLike {
  relativePosition: { x: number; y: number; z: number };
  worldPosition: { x: number; y: number; z: number };
}

export interface SceneModelLike {
  getState: (id: string) => SceneBodyStateLike | null;
}

interface SceneCatalogLike {
  bodies: SceneBodyLike[];
}

interface ServerBodyState {
  pos: [number, number, number];
}

interface ServerState {
  jd: number;
  bodies: Record<string, ServerBodyState>;
}

export function mountSceneGraph({
  catalog,
  createBodyNode,
  bodyNodes,
  createOrbitLine,
  solarSystemGroup
}: {
  catalog: SceneCatalogLike;
  createBodyNode: (body: SceneBodyLike) => void;
  bodyNodes: Map<string, Object3D>;
  createOrbitLine: (body: SceneBodyLike) => Object3D | null;
  solarSystemGroup: Object3D;
}) {
  for (const body of catalog.bodies) {
    createBodyNode(body);
  }

  for (const body of catalog.bodies) {
    const node = bodyNodes.get(body.id);
    if (!node) continue;

    if (!body.parentId) {
      solarSystemGroup.add(node);
    } else {
      const parentNode = bodyNodes.get(body.parentId);
      parentNode?.add(node);
    }

    const orbitLine = createOrbitLine(body);
    if (!orbitLine) continue;

    if (body.parentId) {
      bodyNodes.get(body.parentId)?.add(orbitLine);
    } else {
      solarSystemGroup.add(orbitLine);
    }
  }
}

export function updateSceneBodiesFromModel({
  catalog,
  model,
  bodyNodes,
  showMoons
}: {
  catalog: SceneCatalogLike;
  model: SceneModelLike;
  bodyNodes: Map<string, Object3D>;
  showMoons: boolean;
}) {
  for (const body of catalog.bodies) {
    const state = model.getState(body.id);
    const node = bodyNodes.get(body.id);

    if (!state || !node) continue;

    if (body.parentId) {
      if (body.parentId === 'sun') {
        node.position.copy(state.worldPosition as Parameters<typeof node.position.copy>[0]);
      } else {
        const parentState = model.getState(body.parentId);
        if (parentState) {
          node.position.set(
            state.worldPosition.x - parentState.worldPosition.x,
            state.worldPosition.y - parentState.worldPosition.y,
            state.worldPosition.z - parentState.worldPosition.z
          );
          continue;
        }
        node.position.set(state.relativePosition.x, state.relativePosition.y, state.relativePosition.z);
      }
    } else {
      node.position.copy(state.worldPosition as Parameters<typeof node.position.copy>[0]);
    }

    if (body.type === 'moon') {
      node.visible = showMoons;
    }
  }
}

export function applyServerStateToScene({
  state,
  simState,
  catalog,
  bodyNodes,
  propagateKeplerOrbit,
  showMoons
}: {
  state: ServerState | null;
  simState: { julianDate: number };
  catalog: SceneCatalogLike;
  bodyNodes: Map<string, Object3D>;
  propagateKeplerOrbit: (orbit: NonNullable<SceneBodyLike['orbit']>, elapsedDays: number, outPosition: Object3D['position']) => void;
  showMoons: boolean;
}) {
  if (!state || !state.bodies) return;

  simState.julianDate = state.jd;

  for (const body of catalog.bodies) {
    const serverBody = state.bodies[body.id];
    const node = bodyNodes.get(body.id);
    if (!node) continue;

    if (serverBody) {
      if (body.parentId) {
        const parentServer = state.bodies[body.parentId];
        if (parentServer) {
          node.position.set(
            serverBody.pos[0] - parentServer.pos[0],
            serverBody.pos[1] - parentServer.pos[1],
            serverBody.pos[2] - parentServer.pos[2]
          );
        }
      } else {
        node.position.set(serverBody.pos[0], serverBody.pos[1], serverBody.pos[2]);
      }
    } else if (body.parentId && body.orbit) {
      const elapsedDays = state.jd - body.orbit.epochJd;
      propagateKeplerOrbit(body.orbit, elapsedDays, node.position);
    }

    if (body.type === 'moon') {
      node.visible = showMoons;
    }
  }
}
