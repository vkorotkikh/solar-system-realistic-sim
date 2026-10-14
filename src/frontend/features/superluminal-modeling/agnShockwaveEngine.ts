/**
 * AGN Compound Shockwave Engine — Multi-Messenger SMBH Event Simulation
 *
 * Physics-based compound shockwave propagation with 7+ channels:
 *   GW, EM, neutrino, UHECR, CR tsunami, Alfvén/MHD, physical blast wave.
 *
 * Each channel propagates at its physical speed (diffusive, ballistic, or c).
 *
 * Source catalog: Sgr A*, Centaurus A, Maffei 1, M87* (educational).
 * Event presets: from daily flares to Fermi Bubble-class outbursts.
 */

import { Vector3 } from 'three';
import { clamp } from '../../../constants';
import {
    SOURCE_CATALOG, EVENT_PRESETS,
    SGR_A, CEN_A, MAFFEI_1, M87, C_CM_S
} from './smbhPhysicsConstants';
import {
    computeMultiMessengerTimeline,
    yearsToDisplaySeconds,
    generateStochasticFlares
} from './smbhPropagation';
import type { SourceKey } from './sourceCoordinates';
import type { createGWVisualization } from '../solar/gravitationalWaves';

type Physics = ReturnType<typeof computeMultiMessengerTimeline>;
type Channel = Physics['channels'][number];
type DisplayChannel = Channel & { arrivalDisplaySec: number };
type Source = (typeof SOURCE_CATALOG)[SourceKey];
type GwDisplayer = Pick<ReturnType<typeof createGWVisualization>, 'toggle' | 'setParams'>
    & Partial<Pick<ReturnType<typeof createGWVisualization>, 'reset'>>;

interface SolarResponder {
    triggerFlareBurst?: (intensity: number, count: number) => void;
    triggerMassiveAgnFlare?: (intensity: number) => void;
    triggerWarpWaveImpact?: (energyErg: number, smbhMassG: number) => void;
}

export interface AgnEventOptions {
    energyErg?: number;
    thetaObsDeg?: number;
    preset?: string;
    hypothesis?: string;
    scenario?: string;
}

interface DisplayTimeline {
    channels: DisplayChannel[];
    gwArrivalDisplaySec: number;
    frontTravelDisplaySec: number;
    isH29Mode: boolean;
    totalDisplaySec: number;
}

interface AgnPreset {
    sourceKey: string;
    energyErg: number;
    hypothesis?: string;
}

function isSourceKey(key: string): key is SourceKey {
    return Object.hasOwn(SOURCE_CATALOG, key);
}

/** Shared UI/engine dispatch: a named preset owns its source and model. */
export function resolveAgnSelection(source: string, options: AgnEventOptions = {}) {
    const key = options.preset;
    const preset: AgnPreset | null = key && Object.hasOwn(EVENT_PRESETS, key)
        ? EVENT_PRESETS[key as keyof typeof EVENT_PRESETS] : null;
    const selectedSource = preset?.sourceKey ?? source;
    const sourceKey: SourceKey = isSourceKey(selectedSource) ? selectedSource : 'SagittariusA';
    const hypothesis = preset
        ? (preset.hypothesis ?? 'compound')
        : `${options.hypothesis ?? options.scenario ?? 'compound'}`.toLowerCase().trim();
    return { sourceKey, source: SOURCE_CATALOG[sourceKey], hypothesis, energyErg: preset?.energyErg ?? options.energyErg ?? 1e56 };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE DIRECTIONS (mean ecliptic J2000, shared with canonical model axes)
// ═══════════════════════════════════════════════════════════════════════════

export const SAGITTARIUS_A_DIR = new Vector3(...SGR_A.direction).normalize();
export const CENTAURUS_A_DIR = new Vector3(...CEN_A.direction).normalize();
export const MAFFEI_1_DIR = new Vector3(...MAFFEI_1.direction).normalize();
export const M87_DIR = new Vector3(...M87.direction).normalize();

const SOURCE_DIRECTIONS = {
    SagittariusA: SAGITTARIUS_A_DIR,
    CentaurusA: CENTAURUS_A_DIR,
    Maffei1: MAFFEI_1_DIR,
    M87: M87_DIR
};
const H29_CHANNELS = new Set(['metric_slipstream', 'warpMetric']);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function toRadians(deg: number) {
    return (deg * Math.PI) / 180;
}

function channelShaderParams(channel: Channel, elapsedFraction: number) {
    const freqMap: Readonly<Record<string, number | undefined>> = {
        gw: 12,
        em: 18,
        neutrino: 15,
        uhecr: 9,
        cr_tsunami: 6,
        alfven: 7,
        blast: 5,
        metric_slipstream: 3,
        warpMetric: 2
    };
    const strainScale: Readonly<Record<string, number | undefined>> = {
        gw: 0.04,
        em: 0.06,
        neutrino: 0.02,
        uhecr: 0.08,
        cr_tsunami: 0.07,
        alfven: 0.05,
        blast: 0.10,
        metric_slipstream: 0.18,
        warpMetric: 0.25
    };
    return {
        frequency: freqMap[channel.key] || 10,
        strain: (strainScale[channel.key] || 0.05) * channel.baseAmplitude * (1 + elapsedFraction * 0.5)
    };
}

function isMetricSlipstreamChannel(channel: Channel) {
    return H29_CHANNELS.has(channel?.key);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the AGN compound shockwave engine.
 *
 * @param {Object} gwDisplayer     - from createGWVisualization()
 * @param {Object} solarResponder  - flare callback interface:
 *   { triggerFlareBurst(intensity, count), triggerMassiveAgnFlare(intensity) }
 */
export function createAgnShockwaveEngine(
    gwDisplayer: GwDisplayer | null,
    solarResponder: SolarResponder | null,
    { random = Math.random, onReset }: { random?: () => number; onReset?: () => void } = {}
) {
    let isActive = false;
    let elapsedSec = 0;
    let currentDistanceUnits = 0;

    let currentSourceKey: SourceKey = 'SagittariusA';
    let currentSource: Source = SGR_A;
    let currentTimeline: DisplayTimeline | null = null;
    let currentPhysics: Physics | null = null;
    let currentEnergyErg = 1e56;
    let currentThetaRad = toRadians(35);

    let stochasticActive = false;
    let stochasticFlares: ReturnType<typeof generateStochasticFlares> = [];
    let stochasticElapsed = 0;
    let stochasticIndex = 0;
    const stochasticWindowSec = 120;

    const frontStartUnits = 180.0;
    let direction = SAGITTARIUS_A_DIR.clone();

    function resetVisuals() {
        if (gwDisplayer) {
            gwDisplayer.reset?.();
            gwDisplayer.setParams({ isAgnEvent: 0.0, strain: 0.0, shockwaveDist: frontStartUnits });
            gwDisplayer.toggle(false);
        }
        onReset?.();
    }

    function finalizeEvent() {
        isActive = false;
        resetVisuals();
    }

    function resetEvent() {
        finalizeEvent();
        currentTimeline = null;
        currentPhysics = null;
        elapsedSec = 0;
        currentDistanceUnits = frontStartUnits;
    }

    function nextStochasticWindow() {
        stochasticFlares = generateStochasticFlares(stochasticWindowSec, 0.3, SGR_A.flarePowerLawIndex,
            undefined, undefined, random);
        stochasticIndex = 0;
    }

    function triggerSolarResponse(channel: Channel) {
        if (!solarResponder) return;
        if (isMetricSlipstreamChannel(channel) || channel.key === 'warpMetric') return; // Warp wave is "silent"
        const amp = channel.baseAmplitude;

        if (channel.key === 'blast' && solarResponder.triggerMassiveAgnFlare) {
            solarResponder.triggerMassiveAgnFlare(Math.max(0.7, amp));
            return;
        }

        if (solarResponder.triggerFlareBurst) {
            const intensityMap: Readonly<Record<string, number | undefined>> = {
                gw: 0.35,
                em: 0.55,
                neutrino: 0.1,
                uhecr: 0.75,
                cr_tsunami: 0.65,
                alfven: 0.4,
                metric_slipstream: 0.0,
                blast: 1.0
            };
            const countMap: Readonly<Record<string, number | undefined>> = {
                gw: 1,
                em: 2,
                neutrino: 0,
                uhecr: 2,
                cr_tsunami: 3,
                alfven: 1,
                metric_slipstream: 0,
                blast: 2
            };
            const intensity = (intensityMap[channel.key] ?? 0.3) * amp;
            const count = countMap[channel.key] ?? 1;
            if (count > 0) solarResponder.triggerFlareBurst(Math.max(0.2, intensity), count);
        }
    }

    function emitChannel(channel: DisplayChannel, elapsedFraction: number) {
        channel.fired = true;

        // Let the sunController know if the warp wave hit
        if (isMetricSlipstreamChannel(channel) && solarResponder?.triggerWarpWaveImpact) {
            solarResponder.triggerWarpWaveImpact(currentEnergyErg, currentSource.massG);
        }

        triggerSolarResponse(channel);

        if (!gwDisplayer) return;

        if (channel.key === 'gw' || channel.key === 'warpMetric') {
            gwDisplayer.toggle(true);
        }

        const params = channelShaderParams(channel, elapsedFraction);
        gwDisplayer.setParams({
            frequency: params.frequency,
            strain: params.strain,
            direction,
            isAgnEvent: 1.0
        });
    }

    function buildDisplayTimeline(physics: Physics, impactTimeSec: number): DisplayTimeline {
        const channels = physics.channels.map(ch => {
            const displaySec = yearsToDisplaySeconds(ch.arrivalTimeYr);
            return { ...ch, arrivalDisplaySec: displaySec };
        });

        const gwChannel = channels.find(c => c.key === 'gw');
        const slipstreamChannel = channels.find(c => c.key === 'metric_slipstream' || c.key === 'warpMetric');
        const gwArrivalDisplaySec = gwChannel ? gwChannel.arrivalDisplaySec : 8.0;
        const frontAnchorSec = (slipstreamChannel ? slipstreamChannel.arrivalDisplaySec : gwArrivalDisplaySec);

        if (impactTimeSec > 0 && frontAnchorSec > 0) {
            const factor = impactTimeSec / frontAnchorSec;
            for (const ch of channels) ch.arrivalDisplaySec *= factor;
        }

        const scaledGW = gwChannel ? gwChannel.arrivalDisplaySec : impactTimeSec;
        const scaledFront = slipstreamChannel ? slipstreamChannel.arrivalDisplaySec : scaledGW;
        return {
            channels,
            gwArrivalDisplaySec: scaledGW,
            frontTravelDisplaySec: scaledFront,
            isH29Mode: Boolean(slipstreamChannel),
            totalDisplaySec: channels.reduce((mx, ch) => Math.max(mx, ch.arrivalDisplaySec), 0) + 4.0
        };
    }

    // ═════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═════════════════════════════════════════════════════════════════════

    return {
        /**
         * Trigger a compound shockwave event.
         *
         * @param {string} source         - 'SagittariusA' | 'CentaurusA' | 'Maffei1' | 'M87'
         * @param {number} impactTimeSec  - display seconds until GW front reaches center
         * @param {number} eventIntensity - overall intensity multiplier (0.1–3.0)
         * @param {Object} [options]      - optional overrides
         * @param {number} [options.energyErg]    - event energy (erg)
         * @param {number} [options.thetaObsDeg]  - observer angle (degrees)
         * @param {string} [options.preset]       - EVENT_PRESETS key
         * @param {string} [options.hypothesis]   - 'compound' | 'h29'
         * @param {string} [options.scenario]     - alias for hypothesis
         */
        triggerEvent(source = 'SagittariusA', impactTimeSec = 10, eventIntensity = 1.0, options: AgnEventOptions = {}) {
            resetEvent();
            const selection = resolveAgnSelection(source, options);
            const sourceModel = SOURCE_CATALOG[selection.sourceKey];
            currentSourceKey = selection.sourceKey;
            currentSource = sourceModel;
            currentEnergyErg = selection.energyErg;
            currentThetaRad = toRadians(options.thetaObsDeg ?? sourceModel.jetThetaDeg ?? 35);
            const intensity = clamp(eventIntensity, 0.1, 3.0);

            currentPhysics = computeMultiMessengerTimeline(sourceModel, currentEnergyErg, currentThetaRad, {
                scenario: selection.hypothesis
            });
            currentTimeline = buildDisplayTimeline(currentPhysics, impactTimeSec);

            for (const ch of currentTimeline.channels) {
                ch.baseAmplitude *= intensity;
                ch.fired = false;
            }

            isActive = true;
            elapsedSec = 0;
            currentDistanceUnits = frontStartUnits;
            direction.copy(SOURCE_DIRECTIONS[currentSourceKey]);

            if (gwDisplayer) {
                gwDisplayer.toggle(true);
                gwDisplayer.setParams({
                    frequency: 8.0,
                    strain: 0.025,
                    direction,
                    isAgnEvent: 1.0,
                    shockwaveDist: currentDistanceUnits
                });
            }
        },

        /**
         * Deprecated compatibility API; the no-op UI control has been removed. When a radial front
         * reaches the observer does not depend on the frame, and apparent superluminal speed is a
         * transverse (sky-plane) effect.
         */
        setObserverFrameMode(_enabled: boolean) {},

        /**
         * Start/stop continuous stochastic flaring background (H6).
         */
        setStochasticFlaring(enabled: boolean) {
            if (stochasticActive === Boolean(enabled)) return;
            stochasticActive = Boolean(enabled);
            if (enabled) {
                nextStochasticWindow();
                stochasticElapsed = 0;
            }
        },

        /**
         * Main update loop — called every frame.
         */
        update(dtSec: number) {
            const dt = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0;
            if (dt <= 0) return;

            if (stochasticActive) {
                stochasticElapsed += dt;
                // Keep the entire window, including its quiet tail; retain overshoot
                // across windows so a batched update matches many smaller updates.
                while (true) {
                    const windowTime = Math.min(stochasticElapsed, stochasticWindowSec);
                    while (stochasticIndex < stochasticFlares.length && stochasticFlares[stochasticIndex].time <= windowTime) {
                        const flare = stochasticFlares[stochasticIndex++];
                        const scaledIntensity = Math.log10(flare.energy) / 43;
                        solarResponder?.triggerFlareBurst?.(clamp(scaledIntensity, 0.1, 1.5), 1);
                    }
                    if (stochasticElapsed < stochasticWindowSec) break;
                    stochasticElapsed -= stochasticWindowSec;
                    nextStochasticWindow();
                }
            }

            if (!isActive || !currentTimeline) return;

            elapsedSec += dt;

            // frontTravelDisplaySec is the display arrival of the front's own channel (GW, or the H29
            // slipstream whose arrival already includes frameSpeedOverC), so the front hits the Sun
            // exactly when that channel fires. Arrival at the observer is frame-invariant: the
            // transverse apparent speed b*sin(t)/(1 - b*cos(t)) is a sky-plane projection and must not
            // scale this radial front.
            const frontTravelSec = Math.max(0.001, currentTimeline.frontTravelDisplaySec);
            // Allow front to propagate past the origin (frontProgress from 0.0 to 2.0)
            const frontProgress = clamp(elapsedSec / frontTravelSec, 0.0, 2.0);
            currentDistanceUnits = frontStartUnits * (1.0 - frontProgress);

            if (gwDisplayer) {
                gwDisplayer.setParams({ shockwaveDist: currentDistanceUnits });
            }

            for (const channel of currentTimeline.channels) {
                if (!channel.fired && elapsedSec >= channel.arrivalDisplaySec) {
                    emitChannel(channel, elapsedSec / currentTimeline.totalDisplaySec);
                }
            }

            if (elapsedSec >= currentTimeline.totalDisplaySec) {
                finalizeEvent();
            }
        },

        isActive() { return isActive; },
        reset: resetEvent,
        dispose() { stochasticActive = false; stochasticFlares = []; resetEvent(); },
        getDistanceAu() { return currentDistanceUnits; },
        getTimeToImpact() {
            if (!currentTimeline) return 0;
            return Math.max(0, (currentTimeline.frontTravelDisplaySec || currentTimeline.gwArrivalDisplaySec) - elapsedSec);
        },
        getCurrentSource() { return currentSourceKey; },

        /**
         * Get current physics computation results.
         */
        getPhysics() { return currentPhysics; },

        /**
         * Get full timeline state for UI rendering.
         */
        getTimeline() {
            if (!currentTimeline) return null;
            return {
                source: currentSourceKey,
                sourceLabel: currentSource.label,
                energyErg: currentEnergyErg,
                channels: currentTimeline.channels.map(ch => ({
                    key: ch.key,
                    label: ch.label,
                    color: ch.color,
                    fired: ch.fired,
                    arrivalTimeYr: ch.arrivalTimeYr,
                    delayAfterGW_yr: ch.delayAfterGW_yr,
                    arrivalDisplaySec: ch.arrivalDisplaySec
                })),
                h29: currentPhysics?.h29,
                relativistic: currentPhysics?.relativistic,
                heliosphereResponse: currentPhysics?.heliosphereResponse,
                gwPhysics: currentPhysics?.gwPhysics,
                blastWave: currentPhysics?.blastWave
            };
        },

        getEventPresets() { return EVENT_PRESETS; },
        getSourceCatalog() { return SOURCE_CATALOG; },

        /**
         * Get current warp state for the H29 Warp Wave visualization/physics.
         */
        getWarpState() {
            if (!isActive || !currentTimeline || !currentTimeline.isH29Mode) return null;

            const slipstreamChannel = currentTimeline.channels.find(c => c.key === 'warpMetric' || c.key === 'metric_slipstream');
            const frontArrivalDisplaySec = slipstreamChannel ? slipstreamChannel.arrivalDisplaySec : 8.0;
            const physicalArrivalSec = slipstreamChannel ? slipstreamChannel.arrivalTimeSec : currentSource.distanceCm / C_CM_S;
            // time compression between simulation display seconds and physical seconds since the event at Sgr A*
            const timeCompression = physicalArrivalSec / frontArrivalDisplaySec;
            const currentPhysicalTimeSec = Math.max(0.1, elapsedSec * timeCompression);

            return {
                direction,
                energyErg: currentEnergyErg,
                smbhMassG: currentSource.massG,
                sourceDistanceCm: currentSource.distanceCm,
                timeSec: currentPhysicalTimeSec,
                positionCm: currentDistanceUnits * 1.496e13, // Rough conversion AU -> cm for simple visual scaling
                amplitude: 1.0, // base physical amplitude handled by smbhPropagation, this is just a modifier
                thickness: 0.05
            };
        }
    };
}
