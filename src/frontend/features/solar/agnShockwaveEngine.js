import { Vector3 } from 'three';

// Sagittarius A* approximate direction
export const SAGITTARIUS_A_DIR = new Vector3(-0.05, -0.86, 0.5).normalize();

// Centaurus A approximate direction
export const CENTAURUS_A_DIR = new Vector3(-0.35, -0.45, 0.8).normalize();

// Maffei 1 (nearest giant elliptical; quiescent / hypothetical AGN scenario)
export const MAFFEI_1_DIR = new Vector3(0.23, 0.18, 0.96).normalize();

const SOURCE_MODELS = {
    SagittariusA: {
        key: 'SagittariusA',
        label: 'Sagittarius A*',
        direction: SAGITTARIUS_A_DIR,
        massSolar: 4.0e6,
        distanceLy: 26_673, // 8.2 kpc
        relativeFlux: 1.0,
        // Sgr A* is not a blazar aligned to us; keep apparent boost modest.
        jetBeta: 0.90,
        jetThetaDeg: 35,
        channelDelayYears: {
            em: 4,
            uhecr: 25_000,
            mhd: 5_000_000
        }
    },
    CentaurusA: {
        key: 'CentaurusA',
        label: 'Centaurus A',
        direction: CENTAURUS_A_DIR,
        massSolar: 5.5e7,
        distanceLy: 12_400_000, // 3.8 Mpc
        relativeFlux: 0.7,
        // Tuned to near-observed superluminal apparent motions (order-unity c multiples).
        jetBeta: 0.95,
        jetThetaDeg: 15,
        channelDelayYears: {
            em: 30,
            uhecr: 8_000_000,
            mhd: 25_000_000
        }
    },
    Maffei1: {
        key: 'Maffei1',
        label: 'Maffei 1 (Hypothetical SMBH Outburst)',
        direction: MAFFEI_1_DIR,
        // SMBH mass is unmeasured; this remains an indirect estimate range.
        massSolar: 3.0e8,
        distanceLy: 9_300_000, // 2.85 Mpc
        relativeFlux: 0.15,
        jetBeta: 0.92,
        jetThetaDeg: 20,
        channelDelayYears: {
            em: 50,
            uhecr: 11_000_000,
            mhd: 35_000_000
        }
    }
};

const CHANNEL_CONFIG = [
    { key: 'gw', label: 'Gravitational Wave Packet', amplitude: 0.2 },
    { key: 'em', label: 'High-Energy EM Burst', amplitude: 0.5 },
    { key: 'uhecr', label: 'UHECR / Particle Front', amplitude: 0.75 },
    { key: 'mhd', label: 'MHD / Pressure Shock', amplitude: 1.0 }
];

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

/**
 * Apparent superluminal factor:
 * beta_app = beta * sin(theta) / (1 - beta * cos(theta))
 * This does not violate relativity; it is geometric projection.
 */
function computeApparentSpeedFactor(beta, thetaDeg) {
    const b = clamp(Number(beta) || 0, 0, 0.999999);
    const theta = toRadians(thetaDeg);
    const denom = 1.0 - b * Math.cos(theta);
    if (denom < 1e-6) return 1.0;
    const betaApp = (b * Math.sin(theta)) / denom;
    if (!Number.isFinite(betaApp)) return 1.0;
    return Math.max(1.0, betaApp);
}

/**
 * Log-time compression keeps real ordering while making million-year offsets
 * visible in seconds for interactive rendering.
 */
function yearsToDisplaySeconds(years, scaleSec = 2.2, referenceYears = 1.0) {
    const y = Math.max(0, Number(years) || 0);
    const base = Math.max(1e-6, Number(referenceYears) || 1.0);
    return Math.max(0.2, scaleSec * Math.log10(1.0 + y / base));
}

function buildTimeline(source, intensity) {
    const gwYears = source.distanceLy;
    const emYears = gwYears + source.channelDelayYears.em;
    const uhecrYears = gwYears + source.channelDelayYears.uhecr;
    const mhdYears = gwYears + source.channelDelayYears.mhd;

    const yearByChannel = {
        gw: gwYears,
        em: emYears,
        uhecr: uhecrYears,
        mhd: mhdYears
    };

    const channels = CHANNEL_CONFIG.map((def) => {
        const arrivalYears = yearByChannel[def.key];
        return {
            ...def,
            fired: false,
            arrivalYears,
            arrivalDisplaySec: yearsToDisplaySeconds(arrivalYears),
            effectiveAmplitude: clamp(def.amplitude * intensity * source.relativeFlux, 0.05, 2.0)
        };
    });

    const gwChannel = channels.find((c) => c.key === 'gw');
    const gwArrivalDisplaySec = gwChannel ? gwChannel.arrivalDisplaySec : 8.0;
    const finalArrivalDisplaySec = channels.reduce((mx, ch) => Math.max(mx, ch.arrivalDisplaySec), 0);

    return {
        channels,
        gwArrivalDisplaySec,
        totalDisplaySec: finalArrivalDisplaySec + 4.0
    };
}

function scaleTimelineDisplaySeconds(timeline, targetGwArrivalSec) {
    const requested = Number(targetGwArrivalSec);
    if (!Number.isFinite(requested) || requested <= 0) return;
    if (!timeline.gwArrivalDisplaySec || timeline.gwArrivalDisplaySec <= 0) return;
    const factor = requested / timeline.gwArrivalDisplaySec;
    for (const channel of timeline.channels) {
        channel.arrivalDisplaySec *= factor;
    }
    timeline.gwArrivalDisplaySec *= factor;
    timeline.totalDisplaySec *= factor;
}

/**
 * Creates a physically motivated multi-messenger SMBH event engine.
 *
 * Reality model:
 * - Signals propagate at or below c in their local frame.
 * - Apparent superluminal motion is exposed only as an observer-frame
 *   rendering effect from relativistic projection.
 *
 * Backward-compatible trigger signature:
 *   triggerEvent(source, impactTimeSec, eventIntensity)
 * where impactTimeSec maps to the displayed GW-arrival time via time compression.
 *
 * @param {Object} gwDisplayer - The object returned by createGWVisualization
 * @param {Object} solarResponder - flare callbacks used when channels arrive
 */
export function createAgnShockwaveEngine(gwDisplayer, solarResponder) {
    let isActive = false;
    let elapsedSec = 0;
    let currentDistanceUnits = 0;
    let currentSource = SOURCE_MODELS.SagittariusA;
    let currentTimeline = buildTimeline(currentSource, 1.0);
    let observerFrameMode = true;
    let shutdownTimer = null;

    const frontStartUnits = 180.0;
    let direction = currentSource.direction.clone();

    function clearShutdownTimer() {
        if (shutdownTimer) {
            clearTimeout(shutdownTimer);
            shutdownTimer = null;
        }
    }

    function resetVisuals() {
        if (gwDisplayer) {
            gwDisplayer.setParams({
                isAgnEvent: 0.0,
                strain: 0.0,
                shockwaveDist: frontStartUnits
            });
            gwDisplayer.toggle(false);
        }
    }

    function finalizeEvent() {
        isActive = false;
        clearShutdownTimer();
        shutdownTimer = setTimeout(() => {
            resetVisuals();
        }, 2500);
    }

    function triggerSolarResponse(channel) {
        if (!solarResponder) return;
        const amp = channel.effectiveAmplitude;
        if (channel.key === 'gw' && solarResponder.triggerFlareBurst) {
            solarResponder.triggerFlareBurst(Math.max(0.2, amp * 0.35), 1);
            return;
        }
        if (channel.key === 'em' && solarResponder.triggerFlareBurst) {
            solarResponder.triggerFlareBurst(Math.max(0.3, amp * 0.55), 2);
            return;
        }
        if (channel.key === 'uhecr' && solarResponder.triggerFlareBurst) {
            solarResponder.triggerFlareBurst(Math.max(0.45, amp * 0.75), 2);
            return;
        }
        if (channel.key === 'mhd' && solarResponder.triggerMassiveAgnFlare) {
            solarResponder.triggerMassiveAgnFlare(Math.max(0.7, amp));
        }
    }

    function emitChannel(channel) {
        channel.fired = true;
        triggerSolarResponse(channel);

        if (!gwDisplayer) return;
        if (channel.key === 'gw') {
            gwDisplayer.toggle(true);
            gwDisplayer.setParams({
                frequency: 12.0,
                strain: 0.04 * channel.effectiveAmplitude,
                direction,
                isAgnEvent: 1.0
            });
            return;
        }
        if (channel.key === 'em') {
            gwDisplayer.setParams({
                frequency: 18.0,
                strain: 0.06 * channel.effectiveAmplitude
            });
            return;
        }
        if (channel.key === 'uhecr') {
            gwDisplayer.setParams({
                frequency: 9.0,
                strain: 0.08 * channel.effectiveAmplitude
            });
            return;
        }
        if (channel.key === 'mhd') {
            gwDisplayer.setParams({
                frequency: 5.0,
                strain: 0.10 * channel.effectiveAmplitude
            });
        }
    }

    return {
        /**
         * Trigger a new shockwave event
         * @param {string} source 'SagittariusA' | 'CentaurusA' | 'Maffei1'
         * @param {number} impactTimeSec Display seconds until GW front reaches center
         * @param {number} eventIntensity Strength of the event
         */
        triggerEvent(source = 'SagittariusA', impactTimeSec = 10, eventIntensity = 1.0) {
            const sourceModel = SOURCE_MODELS[source] || SOURCE_MODELS.SagittariusA;
            currentSource = sourceModel;
            currentTimeline = buildTimeline(sourceModel, clamp(eventIntensity, 0.1, 3.0));
            scaleTimelineDisplaySeconds(currentTimeline, impactTimeSec);

            isActive = true;
            elapsedSec = 0;
            currentDistanceUnits = frontStartUnits;
            direction.copy(sourceModel.direction);
            clearShutdownTimer();

            for (const channel of currentTimeline.channels) {
                channel.fired = false;
            }

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

        setObserverFrameMode(enabled) {
            observerFrameMode = Boolean(enabled);
        },

        update(dtSec) {
            if (!isActive) return;

            const dt = Math.max(0, Number(dtSec) || 0);
            if (dt <= 0) return;
            elapsedSec += dt;

            const gwArrivalSec = Math.max(0.001, currentTimeline.gwArrivalDisplaySec);
            const apparentFactor = observerFrameMode
                ? computeApparentSpeedFactor(currentSource.jetBeta, currentSource.jetThetaDeg)
                : 1.0;
            const frontProgress = clamp((elapsedSec * apparentFactor) / gwArrivalSec, 0.0, 1.0);
            currentDistanceUnits = frontStartUnits * (1.0 - frontProgress);

            if (gwDisplayer) {
                gwDisplayer.setParams({
                    shockwaveDist: currentDistanceUnits
                });
            }

            for (const channel of currentTimeline.channels) {
                if (!channel.fired && elapsedSec >= channel.arrivalDisplaySec) {
                    emitChannel(channel);
                }
            }

            if (elapsedSec >= currentTimeline.totalDisplaySec) {
                finalizeEvent();
            }
        },

        isActive() { return isActive; },
        getDistanceAu() { return currentDistanceUnits; }, // legacy name
        getTimeToImpact() { return Math.max(0, currentTimeline.gwArrivalDisplaySec - elapsedSec); },
        getCurrentSource() { return currentSource.key; },
        getTimeline() {
            return {
                source: currentSource.key,
                sourceLabel: currentSource.label,
                channels: currentTimeline.channels.map((ch) => ({
                    key: ch.key,
                    label: ch.label,
                    fired: ch.fired,
                    arrivalYears: ch.arrivalYears,
                    arrivalDisplaySec: ch.arrivalDisplaySec
                }))
            };
        }
    };
}
