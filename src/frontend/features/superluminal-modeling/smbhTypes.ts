/** Physical inputs shared by catalog sources and custom propagation models. */
export interface SmbhSource {
    readonly key: string;
    readonly label: string;
    readonly massMsun: number;
    readonly massG: number;
    readonly distanceCm: number;
    readonly distanceLy: number;
    readonly spinEstimate?: number;
    readonly jetBeta?: number;
    readonly jetBetaSpine?: number;
    readonly bFieldHorizonG?: number;
    readonly rSchwarzschildCm?: number;
}

export type MessengerChannelKey =
    | 'gw' | 'em' | 'neutrino' | 'uhecr' | 'cr_tsunami' | 'alfven' | 'blast'
    | 'metric_slipstream' | 'warpMetric';

export type ChannelPropagation =
    | 'lightspeed' | 'near_ballistic' | 'diffusive' | 'alfven' | 'sedov_taylor' | 'h29_metric';

interface ChannelProperties {
    key: MessengerChannelKey;
    label: string;
    baseAmplitude: number;
    color: readonly [number, number, number];
    energyFraction: number;
    description: string;
}

/** Transport branches that use an energy cannot be constructed without one. */
export type ChannelDefinition = ChannelProperties & (
    | { propagation: 'near_ballistic' | 'diffusive'; referenceEnergyEV: number }
    | { propagation: 'lightspeed' | 'alfven' | 'sedov_taylor' | 'h29_metric'; referenceEnergyEV?: never }
);

export type MessengerChannel = ChannelDefinition & {
    arrivalTimeSec: number;
    arrivalTimeYr: number;
    delayAfterGW_yr: number;
    fired: boolean;
};

export interface PropagationOptions {
    scenario?: string;
    mode?: string;
    hypothesis?: string;
    model?: string;
}

/** Hypothetical display-model metadata, not a measured metric solution. */
export interface H29SlipstreamMeta {
    enabled: true;
    mode: 'H29';
    shiftStrength: number;
    frameSpeedOverC: number;
    delayCompression: number;
    frontArrivalSec: number;
    frontArrivalYr: number;
    wakeThickness: number;
}

export interface MetricFrameDragPeak {
    peak: number;
    r0: number;
    sigmaBase: number;
}

export interface StochasticFlare {
    time: number;
    energy: number;
}

export interface MultiMessengerTimeline {
    source: SmbhSource;
    energyErg: number;
    thetaObsRad: number;
    channels: MessengerChannel[];
    lightTravelTimeSec: number;
    lightTravelTimeYr: number;
    relativistic: {
        jetBeta: number;
        apparentBeta: number;
        dopplerFactor: number;
        fluxBoost: number;
        timeCompressionFactor: number;
        lorentzGamma: number;
    };
    gwPhysics: {
        strainAtSun: number;
        memoryStrain: number;
        displacementAtAU_cm: number;
        memoryDisplacementAtAU_cm: number;
    };
    heliosphereResponse: {
        blastVelocityCmS: number;
        pressureFactor: number;
        compressedHeliopauseAU: number;
        equilibriumTimeSec: number;
        compressionRatio: number;
    };
    blastWave: {
        transitionRadiusCm: number;
        transitionRadiusKpc: number;
        arrivalVelocityCmS: number;
        arrivalVelocityKmS: number;
        arrivalMach: number;
    };
    gertsenshtein: {
        ismConversionProb: number;
        nearSourceProb: number;
    };
    h29: H29SlipstreamMeta | null;
}
