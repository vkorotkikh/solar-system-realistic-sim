// @ts-nocheck
/**
 * AGN Compound Shockwave Engine — Multi-Messenger SMBH Event Simulation
 *
 * Physics-based compound shockwave propagation with 7+ channels:
 *   GW, EM, neutrino, UHECR, CR tsunami, Alfvén/MHD, physical blast wave.
 *
 * Each channel propagates at its physical speed (diffusive, ballistic, or c)
 * with optional apparent superluminal projection in observer frame.
 *
 * Source catalog: Sgr A*, Centaurus A, Maffei 1, M87* (educational).
 * Event presets: from daily flares to Fermi Bubble-class outbursts.
 */

import { Vector3 } from 'three';
import {
    SOURCE_CATALOG, EVENT_PRESETS,
    SGR_A, C_CM_S
} from './smbhPhysicsConstants';
import {
    computeMultiMessengerTimeline,
    yearsToDisplaySeconds,
    apparentBeta,
    dopplerFactor,
    timeCompressionFactor,
    lorentzGamma,
    generateStochasticFlares
} from './smbhPropagation';

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTION VECTORS (scene-space approximations)
// ═══════════════════════════════════════════════════════════════════════════

export const SAGITTARIUS_A_DIR = new Vector3(-0.05, -0.86, 0.5).normalize();
export const CENTAURUS_A_DIR = new Vector3(-0.35, -0.45, 0.8).normalize();
export const MAFFEI_1_DIR = new Vector3(0.23, 0.18, 0.96).normalize();
export const M87_DIR = new Vector3(0.1, 0.9, 0.4).normalize();

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

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

function channelShaderParams(channel: any, elapsedFraction: number) {
    const freqMap: any = {
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
    const strainScale: any = {
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

function isMetricSlipstreamChannel(channel) {
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
export function createAgnShockwaveEngine(gwDisplayer, solarResponder) {
    let isActive = false;
    let elapsedSec = 0;
    let currentDistanceUnits = 0;

    let currentSourceKey = 'SagittariusA';
    let currentSource = SGR_A;
    let currentTimeline = null;
    let currentPhysics = null;
    let currentEnergyErg = 1e56;
    let currentThetaRad = toRadians(35);

    let observerFrameMode = true;
    let shutdownTimer = null;

    let stochasticActive = false;
    let stochasticFlares = [];
    let stochasticElapsed = 0;
    let stochasticIndex = 0;

    const frontStartUnits = 180.0;
    let direction = SAGITTARIUS_A_DIR.clone();

    function clearShutdownTimer() {
        if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; }
    }

    function resetVisuals() {
        if (gwDisplayer) {
            gwDisplayer.setParams({ isAgnEvent: 0.0, strain: 0.0, shockwaveDist: frontStartUnits });
            gwDisplayer.toggle(false);
        }
    }

    function finalizeEvent() {
        isActive = false;
        clearShutdownTimer();
        shutdownTimer = setTimeout(resetVisuals, 2500);
    }

    function triggerSolarResponse(channel) {
        if (!solarResponder) return;
        if (isMetricSlipstreamChannel(channel) || channel.key === 'warpMetric') return; // Warp wave is "silent"
        const amp = channel.baseAmplitude;

        if (channel.key === 'blast' && solarResponder.triggerMassiveAgnFlare) {
            solarResponder.triggerMassiveAgnFlare(Math.max(0.7, amp));
            return;
        }

        if (solarResponder.triggerFlareBurst) {
            const intensityMap = {
                gw: 0.35,
                em: 0.55,
                neutrino: 0.1,
                uhecr: 0.75,
                cr_tsunami: 0.65,
                alfven: 0.4,
                metric_slipstream: 0.0,
                blast: 1.0
            };
            const countMap = {
                gw: 1,
                em: 2,
                neutrino: 0,
                uhecr: 2,
                cr_tsunami: 3,
                alfven: 1,
                metric_slipstream: 0,
                blast: 2
            };
            const intensity = (intensityMap[channel.key] || 0.3) * amp;
            const count = countMap[channel.key] || 1;
            if (count > 0) solarResponder.triggerFlareBurst(Math.max(0.2, intensity), count);
        }
    }

    function emitChannel(channel, elapsedFraction) {
        channel.fired = true;

        // Let the sunController know if the warp wave hit
        if (channel.key === 'warpMetric' && solarResponder.triggerWarpWaveImpact) {
            solarResponder.triggerWarpWaveImpact(currentEnergyErg, SGR_A.massG);
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

    function buildDisplayTimeline(physics, impactTimeSec) {
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
        triggerEvent(source = 'SagittariusA', impactTimeSec = 10, eventIntensity = 1.0, options = {}) {
            const hypothesis = `${options.hypothesis || options.scenario || 'compound'}`.toLowerCase().trim();
            const sourceModel = SOURCE_CATALOG[source] || SGR_A;
            currentSourceKey = source;
            currentSource = sourceModel;

            if (options.preset && EVENT_PRESETS[options.preset]) {
                const preset = EVENT_PRESETS[options.preset];
                currentEnergyErg = preset.energyErg;
            } else {
                currentEnergyErg = options.energyErg || 1e56;
            }

            currentThetaRad = toRadians(options.thetaObsDeg || sourceModel.jetThetaDeg || 35);
            const intensity = clamp(eventIntensity, 0.1, 3.0);

            currentPhysics = computeMultiMessengerTimeline(sourceModel, currentEnergyErg, currentThetaRad, {
                scenario: hypothesis,
                sourceHypothesis: options.sourceHypothesis
            });
            currentTimeline = buildDisplayTimeline(currentPhysics, impactTimeSec);

            for (const ch of currentTimeline.channels) {
                ch.baseAmplitude *= intensity;
                ch.fired = false;
            }

            isActive = true;
            elapsedSec = 0;
            currentDistanceUnits = frontStartUnits;
            direction.copy(SOURCE_DIRECTIONS[source] || SAGITTARIUS_A_DIR);
            clearShutdownTimer();

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
         * Toggle apparent superluminal observer frame mode.
         */
        setObserverFrameMode(enabled) {
            observerFrameMode = Boolean(enabled);
        },

        /**
         * Start/stop continuous stochastic flaring background (H6).
         */
        setStochasticFlaring(enabled) {
            stochasticActive = Boolean(enabled);
            if (enabled) {
                stochasticFlares = generateStochasticFlares(120, 0.3, SGR_A.flarePowerLawIndex);
                stochasticElapsed = 0;
                stochasticIndex = 0;
            }
        },

        /**
         * Main update loop — called every frame.
         */
        update(dtSec) {
            const dt = Math.max(0, Number(dtSec) || 0);
            if (dt <= 0) return;

            if (stochasticActive) {
                stochasticElapsed += dt;
                while (stochasticIndex < stochasticFlares.length &&
                    stochasticFlares[stochasticIndex].time <= stochasticElapsed) {
                    const flare = stochasticFlares[stochasticIndex];
                    const scaledIntensity = Math.log10(flare.energy) / 43;
                    if (solarResponder?.triggerFlareBurst) {
                        solarResponder.triggerFlareBurst(clamp(scaledIntensity, 0.1, 1.5), 1);
                    }
                    stochasticIndex++;
                }
                if (stochasticIndex >= stochasticFlares.length) {
                    stochasticFlares = generateStochasticFlares(120, 0.3, SGR_A.flarePowerLawIndex);
                    stochasticElapsed = 0;
                    stochasticIndex = 0;
                }
            }

            if (!isActive || !currentTimeline) return;

            elapsedSec += dt;

            const frontTravelSec = Math.max(0.001, currentTimeline.frontTravelDisplaySec);
            const h29FrontSpeed = currentPhysics?.h29?.frameSpeedOverC || 1.0;
            const jetBeta = currentSource.jetBetaSpine || currentSource.jetBeta || 0.9;
            const apparentFactor = observerFrameMode
                ? Math.max(1, apparentBeta(jetBeta, currentThetaRad))
                : 1.0;
            const frontSpeed = currentTimeline.isH29Mode
                ? Math.max(apparentFactor, h29FrontSpeed)
                : apparentFactor;
            const frontProgress = clamp((elapsedSec * frontSpeed) / frontTravelSec, 0.0, 1.0);
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

            // Warp propagates at c
            const speed = C_CM_S;

            return {
                energyErg: currentEnergyErg,
                smbhMassG: currentSource.massG,
                positionCm: currentDistanceUnits * 1.496e13, // Rough conversion AU -> cm for scaling
                amplitude: 1.0,
                thickness: 0.05
            };
        }
    };
}
