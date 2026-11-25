/**
 * The seventh solar group, `observed_pfss`: real NSO/GONG field lines from the sidecar
 * (ADR 0009). The lines are fixed to the rotating body (IAU_SUN), so the group is oriented at
 * the display epoch on every frame and turns with the Sun.
 */
import { Group } from 'three';
import type { ObservedPfssSidecar } from './observedPfssClient';
import { applySolarGeometryFrame } from './solarFrame';
import {
  createMagneticFieldLinesFromPFSS,
  disposeMagneticFieldGroup,
  OBSERVED_FIELD_LINE_STYLE,
} from './solarMagnetics';

export interface ObservedFieldLayer {
  readonly group: Group;
  setSidecar(sidecar: ObservedPfssSidecar | null): void;
  /** Rebuild at a new display radius of the Sun; the enlarged and true scales differ. */
  setScale(sunRadiusAu: number): void;
  /** Whether the label is in its Drawn row. */
  setDrawn(drawn: boolean): void;
  update(jdTdb: number): void;
  dispose(): void;
}

export function createObservedFieldLayer(initialSunRadiusAu: number): ObservedFieldLayer {
  const group = new Group();
  group.name = 'observed_pfss';
  group.userData.solarLayer = 'observed_pfss';
  group.userData.bodyId = 'sun-observed-field';
  group.visible = false;
  let sidecar: ObservedPfssSidecar | null = null;
  let sunRadiusAu = initialSunRadiusAu;
  let drawn = false;

  function clear() {
    for (const child of [...group.children]) {
      disposeMagneticFieldGroup(child);
      child.removeFromParent();
    }
  }

  function rebuild() {
    clear();
    // Activity only seeds the synthetic jitter, which the observed style turns off.
    if (sidecar) group.add(createMagneticFieldLinesFromPFSS(sidecar, sunRadiusAu, 0, undefined, OBSERVED_FIELD_LINE_STYLE));
    group.visible = drawn && sidecar !== null;
  }

  return {
    group,
    setSidecar(next) {
      if (next === sidecar) return;
      sidecar = next;
      rebuild();
    },
    setScale(next) {
      if (next === sunRadiusAu) return;
      sunRadiusAu = next;
      rebuild();
    },
    setDrawn(next) {
      drawn = next;
      group.visible = drawn && sidecar !== null;
    },
    update(jdTdb) {
      applySolarGeometryFrame(group, { inputFrame: 'IAU_SUN', jdTdb });
    },
    dispose() {
      clear();
      sidecar = null;
      group.visible = false;
      group.removeFromParent();
    },
  };
}
