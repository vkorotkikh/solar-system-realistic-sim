// EXO019: callable display metadata only; no renderer or physical calibration.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Vector3 } from 'three';
import { createGWVisualization } from '../src/frontend/features/solar/gravitationalWaves';
import { createAgnShockwaveEngine } from '../src/frontend/features/superluminal-modeling/agnShockwaveEngine';

function withGrid(check) {
  const grid = createGWVisualization(2);
  try { check(grid, grid.mesh.material.uniforms); }
  finally { grid.dispose(); }
}

function assertIllustrativeMetadata(text) {
  // Reject a numerical promise, not every legitimate mention of amplification.
  assert.doesNotMatch(text, /Displayed amplification:\s*[×x]\s*\d/u);
  assert.match(text, /illustrative/i);
  assert.match(text, /not physically calibrated/i);
  assert.match(text, /educational/i);
}

test('control: existing visual defaults remain display-only and hidden', () => withGrid((grid, u) => {
  assert.equal(u.strainAmplitude.value, 0.05);
  assert.equal(u.frequency.value, 50);
  assert.equal(u.enabled.value, 0);
  assert.equal(grid.mesh.visible, false);
  assert.equal(grid.mesh.geometry.parameters.width, 2);
  assert.equal(grid.mesh.geometry.parameters.height, 2);
  assert.match(grid.getInfoText(), /educational/i);
}));

test('control: setParams preserves supplied values and copies the direction', () => withGrid((grid, u) => {
  const direction = new Vector3(1, 0, 0);
  grid.setParams({ frequency: 12, strain: 0.025, direction, isAgnEvent: 1, shockwaveDist: 7 });
  assert.equal(u.frequency.value, 12);
  assert.equal(u.strainAmplitude.value, 0.025);
  assert.equal(u.isAgnEvent.value, 1);
  assert.equal(u.shockwaveDist.value, 7);
  assert.notEqual(u.propagationDir.value, direction);
  direction.set(0, 1, 0);
  assert.deepEqual(u.propagationDir.value.toArray(), [1, 0, 0]);
}));

test('control: reading metadata changes neither shader nor visual state', () => withGrid((grid, u) => {
  grid.setParams({ strain: 0.125, frequency: 6 });
  grid.toggle(true);
  grid.update(0.25);
  const before = JSON.stringify({ uniforms: u, visible: grid.mesh.visible,
    vertex: grid.mesh.material.vertexShader, fragment: grid.mesh.material.fragmentShader });
  assert.equal(grid.getInfoText(), grid.getInfoText());
  assert.equal(JSON.stringify({ uniforms: u, visible: grid.mesh.visible,
    vertex: grid.mesh.material.vertexShader, fragment: grid.mesh.material.fragmentShader }), before);
}));

test('control: actual AGN trigger and reset keep existing visual amplitudes', () => withGrid((grid, u) => {
  const engine = createAgnShockwaveEngine(grid, null, { random: () => 0.5 });
  try {
    engine.triggerEvent('SagittariusA', 8, 1);
    assert.equal(u.strainAmplitude.value, 0.025);
    assert.equal(grid.mesh.visible, true);
    engine.reset();
    assert.equal(u.strainAmplitude.value, 0);
    assert.equal(u.enabled.value, 0);
    assert.equal(grid.mesh.visible, false);
    grid.getInfoText();
    assert.equal(u.strainAmplitude.value, 0);
    assert.equal(grid.mesh.visible, false);
  } finally { engine.dispose(); }
}));

test('metadata: default display does not claim a calibrated fixed amplification', () => withGrid((grid, u) => {
  assert.equal(u.strainAmplitude.value, 0.05);
  assertIllustrativeMetadata(grid.getInfoText());
}));

test('metadata: configurable amplitude does not retain the fixed amplification claim', () => withGrid((grid, u) => {
  grid.setParams({ strain: 0.025 });
  assert.equal(u.strainAmplitude.value, 0.025);
  assertIllustrativeMetadata(grid.getInfoText());
}));

test('metadata: zero after reset does not retain the fixed amplification claim', () => withGrid((grid, u) => {
  grid.toggle(true);
  grid.reset();
  assert.equal(u.strainAmplitude.value, 0);
  assertIllustrativeMetadata(grid.getInfoText());
}));

test('metadata: native AGN channel amplitudes remain explicitly illustrative', () => withGrid((grid, u) => {
  const engine = createAgnShockwaveEngine(grid, null, { random: () => 0.5 });
  try {
    engine.triggerEvent('SagittariusA', 8, 1);
    assert.equal(u.strainAmplitude.value, 0.025);
    const gw = engine.getTimeline().channels.find(channel => channel.key === 'gw');
    assert.ok(gw);
    assert.ok(gw.arrivalDisplaySec > 0);
    engine.update(gw.arrivalDisplaySec);
    assert.equal(engine.getTimeline().channels.find(channel => channel.key === 'gw').fired, true);
    assert.ok(Number.isFinite(u.strainAmplitude.value));
    assert.notEqual(u.strainAmplitude.value, 0.025);
    assertIllustrativeMetadata(grid.getInfoText());
  } finally { engine.dispose(); }
}));
