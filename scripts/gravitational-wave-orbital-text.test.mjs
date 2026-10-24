// EXO019: callable educational text only; no orbital prediction or renderer.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createGWVisualization } from '../src/frontend/features/solar/gravitationalWaves';

function withGrid(check) {
  const grid = createGWVisualization(2);
  try { check(grid, grid.mesh.material.uniforms); }
  finally { grid.dispose(); }
}

test('control: prior illustrative amplitude qualification stays intact', () => withGrid(grid => {
  assert.match(grid.getInfoText(), /Gravitational Wave Visualization \(Educational\)/);
  assert.ok(grid.getInfoText().includes('Display amplitude: illustrative, not physically calibrated.'));
  assert.doesNotMatch(grid.getInfoText(), /Displayed amplification:\s*[×x]\s*\d/u);
}));

test('control: getter is pure across configured and reset display states', () => withGrid((grid, u) => {
  const initial = grid.getInfoText();
  grid.setParams({ strain: 0.125, frequency: 6 });
  grid.toggle(true);
  grid.update(0.25);
  const snapshot = () => JSON.stringify({uniforms: u, visible: grid.mesh.visible,
    vertex: grid.mesh.material.vertexShader, fragment: grid.mesh.material.fragmentShader});
  const active = snapshot();
  assert.equal(grid.getInfoText(), initial);
  assert.equal(snapshot(), active);
  assert.equal(u.strainAmplitude.value, 0.125);
  grid.reset();
  const reset = snapshot();
  assert.equal(grid.getInfoText(), initial);
  assert.equal(snapshot(), reset);
  assert.equal(u.strainAmplitude.value, 0);
  assert.equal(grid.mesh.visible, false);
}));

test('metadata: omit unsupported Earth-Sun distance and nucleus estimate', () => withGrid(grid => {
  assert.doesNotMatch(grid.getInfoText(), /Earth[-–]Sun distance change|femto(?:meter|metre)s?|atomic nucleus/i);
}));

test('metadata: omit categorical zero-measurable-effect assertion', () => withGrid(grid => {
  assert.doesNotMatch(grid.getInfoText(), /(?:zero|no) measurable effect/i);
}));

test('metadata: state that this grid does not predict orbital-distance changes', () => withGrid(grid => {
  assert.ok(grid.getInfoText().includes('This illustrative grid does not predict orbital-distance changes.'));
}));

test('metadata: omit standalone real-strain value from uncalibrated display', () => withGrid(grid => {
  assert.doesNotMatch(grid.getInfoText(), /Real strain amplitude:/i);
}));
