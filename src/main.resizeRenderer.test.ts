// Found by /qa on 2026-10-24; regression for unchanged renderer pixel ratio.
// FE-DPR-REDUNDANT / FE-004 / R0286 / F-27: actual main resize entrypoint.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Value: protects=unchanged DPR avoids setter writes; fails_when=ratio setter is unconditional;
// why_new=existing frame tests do not count renderer mutations; seam=none;
// no_claim=GPU allocation/performance (recording renderer; native Three probe is separate).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { PerspectiveCamera } from 'three';
import { renderPixelRatio, type RuntimeUiConfig } from './frontend/app/runtimeConfig';

const mainPath = new URL('./main.ts', import.meta.url);

function loadResize(bindings: Record<string, unknown>): () => void {
  const source = ts.createSourceFile('main.ts', readFileSync(mainPath, 'utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  let declaration: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'resizeRenderer') declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!declaration) throw new Error('Actual main resizeRenderer declaration not found');
  const emitted = ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${emitted}; return resizeRenderer;`)(...Object.values(bindings)) as () => void;
}

function fixture({ ratio = 2, dpr = 2, scale = 1, max = 2 } = {}) {
  const canvas = { clientWidth: 600, clientHeight: 400, width: Math.floor(600 * ratio), height: Math.floor(400 * ratio) };
  const camera = new PerspectiveCamera(50, 1.5, 0.1, 100);
  const projection = vi.spyOn(camera, 'updateProjectionMatrix');
  const startup = new AbortController();
  const recovery = { available: true };
  const window = { devicePixelRatio: dpr };
  const runtimeUiConfig: RuntimeUiConfig = { backendOrigin: '', uiWidth: null, uiHeight: null, renderScale: scale, maxPixelRatio: max };
  let currentRatio = ratio, width = 600, height = 400;
  const renderer = {
    getPixelRatio: vi.fn(() => currentRatio),
    setSize: vi.fn((nextWidth: number, nextHeight: number, _updateStyle: boolean) => {
      width = nextWidth; height = nextHeight;
      canvas.width = Math.floor(width * currentRatio); canvas.height = Math.floor(height * currentRatio);
    }),
    // The native probe independently checks this installed Three call chain.
    setPixelRatio: vi.fn((value: number) => { currentRatio = value; renderer.setSize(width, height, false); }),
  };
  const run = loadResize({ startup, recovery, dom: { canvas }, camera, window, runtimeUiConfig, renderPixelRatio, renderer });
  return { run, canvas, camera, projection, startup, recovery, window, renderer, externalRatio: (value: number) => { currentRatio = value; } };
}

describe('actual main renderer resize pixel-ratio ownership', () => {
  it.each([
    { label: 'one', ratio: 1, dpr: 1 },
    { label: 'two', ratio: 2, dpr: 2 },
    { label: 'fractional', ratio: 1.25, dpr: 1.25 },
    { label: 'capped', ratio: 2, dpr: 4 },
    { label: 'scaled', ratio: 1, dpr: 2, scale: 0.5 },
  ])('leaves unchanged $label ratio and dimensions untouched', options => {
    const f = fixture(options);
    for (let index = 0; index < 3; index++) f.run();
    expect(f.renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(f.renderer.setSize).not.toHaveBeenCalled();
    expect(f.projection).not.toHaveBeenCalled();
    expect([f.canvas.width, f.canvas.height]).toEqual([Math.floor(600 * options.ratio), Math.floor(400 * options.ratio)]);
  });

  it('resizes changed CSS dimensions without resetting the unchanged ratio', () => {
    const f = fixture(); f.canvas.clientWidth = 800; f.run();
    expect(f.renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(f.renderer.setSize.mock.calls).toEqual([[800, 400, false]]);
    expect([f.canvas.width, f.canvas.height, f.camera.aspect]).toEqual([1600, 800, 2]);
    expect(f.projection).toHaveBeenCalledOnce();
  });

  it('repairs a changed camera aspect without resetting the unchanged ratio', () => {
    const f = fixture(); f.camera.aspect = 1; f.run();
    expect(f.renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(f.renderer.setSize.mock.calls).toEqual([[600, 400, false]]);
    expect(f.camera.aspect).toBe(1.5); expect(f.projection).toHaveBeenCalledOnce();
  });

  it('repairs a drifted physical buffer without resetting the unchanged ratio', () => {
    const f = fixture(); f.canvas.width = 3; f.run();
    expect(f.renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(f.renderer.setSize.mock.calls).toEqual([[600, 400, false]]);
    expect([f.canvas.width, f.canvas.height]).toEqual([1200, 800]);
  });

  it('updates a changed ratio and its physical buffer', () => {
    const f = fixture({ ratio: 1, dpr: 2 }); f.run();
    expect(f.renderer.setPixelRatio.mock.calls).toEqual([[2]]);
    expect(f.renderer.setSize.mock.calls).toEqual([[600, 400, false]]);
    expect([f.canvas.width, f.canvas.height, f.camera.aspect]).toEqual([1200, 800, 1.5]);
    expect(f.projection).not.toHaveBeenCalled();
  });

  it('updates changed ratio and CSS size together using the existing size and projection behavior', () => {
    const f = fixture({ ratio: 1, dpr: 2 }); f.canvas.clientWidth = 800; f.run();
    expect(f.renderer.setPixelRatio.mock.calls).toEqual([[2]]);
    expect(f.renderer.setSize.mock.calls).toEqual([[600, 400, false], [800, 400, false]]);
    expect([f.canvas.width, f.canvas.height, f.camera.aspect]).toEqual([1600, 800, 2]);
    expect(f.projection).toHaveBeenCalledOnce();
  });

  it('compares the current renderer ratio on each call rather than caching a prior desired ratio', () => {
    const f = fixture(); f.run(); f.externalRatio(1); f.run();
    expect(f.renderer.setPixelRatio.mock.calls).toEqual([[2]]);
    expect([f.canvas.width, f.canvas.height]).toEqual([1200, 800]);
  });

  it.each(['aborted', 'unavailable', 'zero-width', 'zero-height'] as const)('preserves the %s no-mutation gate', gate => {
    const f = fixture({ ratio: 1, dpr: 2 });
    if (gate === 'aborted') f.startup.abort();
    if (gate === 'unavailable') f.recovery.available = false;
    if (gate === 'zero-width') f.canvas.clientWidth = 0;
    if (gate === 'zero-height') f.canvas.clientHeight = 0;
    f.run();
    expect(f.renderer.getPixelRatio).not.toHaveBeenCalled();
    expect(f.renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(f.renderer.setSize).not.toHaveBeenCalled();
    expect(f.projection).not.toHaveBeenCalled();
    expect([f.canvas.width, f.canvas.height, f.camera.aspect]).toEqual([600, 400, 1.5]);
  });
});
