import { Vector3 } from 'three';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';

export interface CatalogBody {
  id: string;
  parentId?: string | null;
  orbit?: KeplerOrbit | null;
}

export interface SolarSystemCatalog {
  bodies: CatalogBody[];
}

export interface BodyState {
  relativePosition: Vector3;
  relativeVelocity: Vector3;
  worldPosition: Vector3;
  worldVelocity: Vector3;
}

export interface SampledBodyState {
  position: Vector3;
  velocity: Vector3;
  relativePosition: Vector3;
  relativeVelocity: Vector3;
}

function makeZeroState(): BodyState {
  return {
    relativePosition: new Vector3(),
    relativeVelocity: new Vector3(),
    worldPosition: new Vector3(),
    worldVelocity: new Vector3()
  };
}

export class SolarSystemModel {
  private readonly bodies: CatalogBody[];

  private readonly bodyById: Map<string, CatalogBody>;

  private readonly childrenById: Map<string, string[]>;

  private readonly stateById: Map<string, BodyState>;

  private readonly parentById: Map<string, string>;

  private readonly updateOrder: string[];

  private currentJd: number | null;

  constructor(catalog: SolarSystemCatalog) {
    this.bodies = catalog.bodies;
    this.bodyById = new Map(this.bodies.map((body) => [body.id, body]));
    this.childrenById = new Map();
    this.stateById = new Map();
    this.parentById = new Map();

    for (const body of this.bodies) {
      this.stateById.set(body.id, makeZeroState());
      if (body.parentId) {
        this.parentById.set(body.id, body.parentId);
        if (!this.childrenById.has(body.parentId)) {
          this.childrenById.set(body.parentId, []);
        }
        this.childrenById.get(body.parentId)?.push(body.id);
      }
    }

    this.updateOrder = this.buildUpdateOrder();
    this.currentJd = null;
  }

  private buildUpdateOrder(): string[] {
    const order: string[] = [];
    const roots = this.bodies.filter((body) => !body.parentId).map((body) => body.id);

    const stack = [...roots];
    while (stack.length > 0) {
      const id = stack.shift();
      if (!id) break;
      order.push(id);
      const children = this.childrenById.get(id);
      if (children) {
        for (const childId of children) {
          stack.push(childId);
        }
      }
    }

    return order;
  }

  getBody(id: string): CatalogBody | null {
    return this.bodyById.get(id) ?? null;
  }

  getState(id: string): BodyState | null {
    return this.stateById.get(id) ?? null;
  }

  getBodies(): CatalogBody[] {
    return this.bodies;
  }

  update(julianDate: number): void {
    this.currentJd = julianDate;

    for (const bodyId of this.updateOrder) {
      const body = this.bodyById.get(bodyId);
      const state = this.stateById.get(bodyId);
      if (!body || !state) continue;

      if (!body.orbit) {
        state.relativePosition.set(0, 0, 0);
        state.relativeVelocity.set(0, 0, 0);
      } else {
        const elapsedDays = julianDate - body.orbit.epochJd;
        propagateKeplerOrbit(body.orbit, elapsedDays, state.relativePosition, state.relativeVelocity);
      }

      if (body.parentId) {
        const parentState = this.stateById.get(body.parentId);
        if (parentState) {
          state.worldPosition.copy(parentState.worldPosition).add(state.relativePosition);
          state.worldVelocity.copy(parentState.worldVelocity).add(state.relativeVelocity);
        } else {
          state.worldPosition.copy(state.relativePosition);
          state.worldVelocity.copy(state.relativeVelocity);
        }
      } else {
        state.worldPosition.copy(state.relativePosition);
        state.worldVelocity.copy(state.relativeVelocity);
      }
    }
  }

  getWorldPosition(id: string, target: Vector3 = new Vector3()): Vector3 | null {
    const state = this.stateById.get(id);
    if (!state) return null;
    return target.copy(state.worldPosition);
  }

  getWorldVelocity(id: string, target: Vector3 = new Vector3()): Vector3 | null {
    const state = this.stateById.get(id);
    if (!state) return null;
    return target.copy(state.worldVelocity);
  }

  sampleBodyStateAt(
    id: string,
    julianDate: number,
    memo: Map<string, SampledBodyState> = new Map()
  ): SampledBodyState | null {
    const memoKey = `${id}:${julianDate}`;
    if (memo.has(memoKey)) {
      return memo.get(memoKey) ?? null;
    }

    const body = this.bodyById.get(id);
    if (!body) {
      return null;
    }

    const sampled: SampledBodyState = {
      position: new Vector3(),
      velocity: new Vector3(),
      relativePosition: new Vector3(),
      relativeVelocity: new Vector3()
    };

    if (!body.orbit) {
      sampled.position.set(0, 0, 0);
      sampled.velocity.set(0, 0, 0);
      sampled.relativePosition.set(0, 0, 0);
      sampled.relativeVelocity.set(0, 0, 0);
    } else {
      const elapsedDays = julianDate - body.orbit.epochJd;
      propagateKeplerOrbit(body.orbit, elapsedDays, sampled.relativePosition, sampled.relativeVelocity);
      sampled.position.copy(sampled.relativePosition);
      sampled.velocity.copy(sampled.relativeVelocity);

      if (body.parentId) {
        const parent = this.sampleBodyStateAt(body.parentId, julianDate, memo);
        if (parent) {
          sampled.position.add(parent.position);
          sampled.velocity.add(parent.velocity);
        }
      }
    }

    memo.set(memoKey, sampled);
    return sampled;
  }
}
