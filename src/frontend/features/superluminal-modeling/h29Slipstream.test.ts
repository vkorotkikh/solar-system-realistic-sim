import { describe, expect, it } from 'vitest';
import { createAgnShockwaveEngine } from './agnShockwaveEngine';
import { computeMultiMessengerTimeline } from './smbhPropagation';
import { EVENT_PRESETS, SOURCE_CATALOG } from './smbhPhysicsConstants';

// Every expected value below was derived by hand from the catalog inputs and the documented
// strength heuristic in a separate script, never by running this code:
//   strength   = clamp01(0.05 + 1.05 * spin * energy * (0.42 + 0.58 * cos(theta)) * mass)
//   energy     = clamp01((log10 E[erg] - 40) / 18)
//   mass       = 1 / (1 + 0.22 * max(1, log10 M[Msun]))
//   spin       = the source's spin estimate, else its jet speed
//   frameSpeed = 1 + 12 * strength^1.55; the front arrives at lightTime / frameSpeed
//   amplitude  = min(1, strength * trigger intensity)
// Retuning the heuristic is a decision; it must come with new hand-derived values here.
const DEG = Math.PI / 180;
const sgrA = SOURCE_CATALOG.SagittariusA;
const strength = (energyErg: number, thetaDeg = 35) =>
  computeMultiMessengerTimeline(sgrA, energyErg, thetaDeg * DEG, { scenario: 'h29' }).h29!.shiftStrength;

describe('H29 slipstream strength against independent references', () => {
  it('the warp preset front outruns light by the factor of 2.04 found in the September audit', () => {
    // CODEBASE_AUDIT_2026-09-06 B-M7-BET-2 independently derived ~2.04c for this preset and
    // a front 13,591 yr ahead of light over 26,675 yr. At today's 8.178 kpc the same inputs
    // give 13,589.5 yr ahead over 26,673.1 yr.
    const preset = EVENT_PRESETS.SgrA_WarpWave_H29;
    const timeline = computeMultiMessengerTimeline(SOURCE_CATALOG[preset.sourceKey], preset.energyErg, 35 * DEG,
      { scenario: preset.hypothesis });
    expect(timeline.h29!.shiftStrength).toBeCloseTo(0.20624631870774895, 12);
    expect(timeline.h29!.frameSpeedOverC).toBeCloseTo(2.0386754448832125, 12);
    expect(timeline.lightTravelTimeYr).toBeCloseTo(26673.06856967527, 6);
    expect(timeline.h29!.frontArrivalYr).toBeCloseTo(13083.528639451124, 6);
  });

  // The panel triggers each source with these impact times and intensities.
  it.each([
    ['the warp preset', 'SagittariusA', 8, 1.4, { preset: 'SgrA_WarpWave_H29' }, 0.2887448461908485],
    ['Sgr A*', 'SagittariusA', 8, 1.4, { hypothesis: 'h29' }, 0.3081063120763661],
    ['Centaurus A', 'CentaurusA', 9.5, 1.1, { hypothesis: 'h29' }, 0.40566896913710493],
    ['Maffei 1', 'Maffei1', 10.5, 0.7, { hypothesis: 'h29' }, 0.23746043117575497],
    ['M87', 'M87', 12, 0.5, { hypothesis: 'h29' }, 0.16880602836128375],
  ])('a panel trigger of %s displays the hand-derived amplitude', (_label, source, time, intensity, options, amplitude) => {
    const engine = createAgnShockwaveEngine(null, null);
    engine.triggerEvent(source, time, intensity, options);
    expect(engine.getWarpState()!.amplitude).toBeCloseTo(amplitude, 12);
  });

  it('a negligible event keeps the 5 % floor, and energy above 1e58 erg adds nothing', () => {
    expect(strength(1e40)).toBe(0.05);
    expect(strength(1e58)).toBeCloseTo(0.2413354293470799, 12);
    expect(strength(1e62)).toBe(strength(1e58));
  });

  it('a jet seen edge-on drives a weaker slipstream than one seen face-on', () => {
    expect(strength(1e56, 0)).toBeCloseTo(0.24000601258802406, 12);
    expect(strength(1e56, 90)).toBeCloseTo(0.12980252528697012, 12);
  });
});

describe('the Sun when the H29 front arrives', () => {
  // The implementation plan makes the passage "silent": distances shift without flare
  // activity. The front arrives together with the gravitational wave and the neutrinos.
  it('flares only for the co-arriving gravitational wave, never for the warp front itself', () => {
    const flares: string[] = [];
    const engine = createAgnShockwaveEngine(null, {
      triggerFlareBurst: (_intensity, count) => flares.push(`burst of ${count}`),
      triggerMassiveAgnFlare: () => flares.push('massive flare'),
    });
    engine.triggerEvent('SagittariusA', 8, 1.4, { preset: 'SgrA_WarpWave_H29' });
    const fired = () => engine.getTimeline()!.channels.filter(channel => channel.fired).map(channel => channel.key);
    let steps = 0;
    while (!fired().includes('metric_slipstream')) {
      expect(flares, 'no flare before the front arrives').toEqual([]);
      engine.update(0.001);
      expect(++steps).toBeLessThan(9000);
    }
    expect(fired().sort()).toEqual(['gw', 'metric_slipstream', 'neutrino']);
    expect(flares, 'one burst: the wave flares the Sun once and neutrinos do not').toEqual(['burst of 1']);
  });
});
