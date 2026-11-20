import { describe, expect, it } from 'vitest';
import { createAgnShockwaveEngine } from './agnShockwaveEngine';
import { EVENT_PRESETS } from './smbhPhysicsConstants';

// The engine hands a shock that actually reaches the Sun to the solar responder as one massive AGN flare
// (the blast channel), and every other channel as ordinary flare bursts. A blast wave carries a shock only
// when it moves faster than the sound speed of the medium it crosses (Mach > 1, the module's own
// blastWave.arrivalMach), so the cases below are the presets whose blast is supersonic by that physics.
// Whether subsonic presets should fire at all is a separate finding (exotic-planetary-12) and is not asserted.
function runEvent(preset: string) {
  const massive: number[] = [];
  const bursts: Array<{ intensity: number; count: number }> = [];
  const engine = createAgnShockwaveEngine(null, {
    triggerMassiveAgnFlare: (intensity: number) => massive.push(intensity),
    triggerFlareBurst: (intensity: number, count: number) => bursts.push({ intensity, count }),
  });
  engine.triggerEvent('SagittariusA', 10, 1, { preset });
  const mach = engine.getPhysics()!.blastWave.arrivalMach;
  const blastFiredAtMassiveCount: number[] = [];
  for (let step = 0; step < 4000 && engine.isActive(); step++) {
    const before = engine.getTimeline()!.channels.find(channel => channel.key === 'blast')!.fired;
    engine.update(0.02);
    const after = engine.getTimeline()?.channels.find(channel => channel.key === 'blast')?.fired ?? true;
    if (!before && after) blastFiredAtMassiveCount.push(massive.length);
  }
  return { massive, bursts, mach, blastFiredAtMassiveCount };
}

const supersonicPresets = Object.keys(EVENT_PRESETS).filter(preset => runEvent(preset).mach > 1);

describe('blast channel to massive AGN flare', () => {
  it('has a preset whose blast wave is supersonic', () => {
    expect(supersonicPresets.length).toBeGreaterThan(0);
  });

  it.each(supersonicPresets)('%s: the arriving blast fires exactly one massive flare, at least as strong as any ordinary burst', preset => {
    const { massive, bursts, blastFiredAtMassiveCount } = runEvent(preset);
    expect(massive).toHaveLength(1);
    expect(blastFiredAtMassiveCount).toEqual([1]); // the flare is raised in the update that fires the blast channel
    expect(massive[0]).toBeGreaterThan(0);
    expect(massive[0]).toBeGreaterThanOrEqual(Math.max(0, ...bursts.map(burst => burst.intensity)));
  });
});
