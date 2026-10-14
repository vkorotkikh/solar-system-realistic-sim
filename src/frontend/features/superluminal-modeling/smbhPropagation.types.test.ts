import { describe, expect, expectTypeOf, it } from 'vitest';
import { CHANNEL_DEFS } from './smbhPhysicsConstants';
import {
  apparentBeta, computeMultiMessengerTimeline, crDiffusionCoefficient,
  generateStochasticFlares, heliosphereEquilibriumTime, metricFrameDragPeak
} from './smbhPropagation';
import type {
  ChannelDefinition, MetricFrameDragPeak, MultiMessengerTimeline, PropagationOptions,
  SmbhSource, StochasticFlare
} from './smbhTypes';

describe('explicit SMBH propagation contracts', () => {
  it('exposes numerical inputs and complete typed outputs at the public boundary', () => {
    expectTypeOf(apparentBeta).toEqualTypeOf<(beta: number, thetaRad: number) => number>();
    expectTypeOf(computeMultiMessengerTimeline).toEqualTypeOf<(
      source: SmbhSource, energyErg: number, thetaObsRad?: number, options?: PropagationOptions
    ) => MultiMessengerTimeline>();
    expectTypeOf(metricFrameDragPeak).returns.toEqualTypeOf<MetricFrameDragPeak>();
    expectTypeOf(generateStochasticFlares).returns.toEqualTypeOf<StochasticFlare[]>();
    // These compile-time assertions are checked by strict tsc, not Vitest alone.
    const channels: readonly ChannelDefinition[] = CHANNEL_DEFS;
    for (const channel of channels) {
      if (channel.propagation === 'near_ballistic' || channel.propagation === 'diffusive') {
        expectTypeOf(channel.referenceEnergyEV).toEqualTypeOf<number>();
        expect(channel.referenceEnergyEV).toBeGreaterThan(0);
      }
    }
    expect(apparentBeta(0.8, Math.PI / 2)).toBeCloseTo(0.8, 12);
  });

  it.each(['compound', 'h29'])('supports a source without optional jet/field estimates (%s)', scenario => {
    const source: SmbhSource = {
      key: 'custom', label: 'Test source', massMsun: 1e6, massG: 1.989e39,
      distanceCm: 9.461e17, distanceLy: 1
    };
    const timeline = computeMultiMessengerTimeline(source, 1e54, 0.5, { scenario });
    expect(timeline.source).toBe(source);
    expect(timeline.channels.every(channel => Number.isFinite(channel.arrivalTimeSec))).toBe(true);
    expect(timeline.relativistic.jetBeta).toBe(0.9);
    expect(timeline.h29?.mode ?? null).toBe(scenario === 'h29' ? 'H29' : null);
  });

  it('accepts non-default numerical transport and equilibrium parameters', () => {
    for (const index of [0.3, 0.4, 0.5]) {
      expect(crDiffusionCoefficient(1e9, 1, index) / 2.8e28).toBeCloseTo(1, 12);
    }
    // 60 AU at 30 km/s, using the existing 1.496e8 km/AU approximation.
    expect(heliosphereEquilibriumTime(4, 30)).toBe(299_200_000);
  });
});
