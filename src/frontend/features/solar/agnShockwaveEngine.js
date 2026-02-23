import { Vector3 } from 'three';

// Sagittarius A* approximate direction
export const SAGITTARIUS_A_DIR = new Vector3(-0.05, -0.86, 0.5).normalize();

// Centaurus A approximate direction
export const CENTAURUS_A_DIR = new Vector3(-0.35, -0.45, 0.8).normalize();

/**
 * Creates the simulated FTL Gravitational Wave Tsunami from an AGN.
 * @param {Object} gwDisplayer - The object returned by createGWVisualization
 * @param {Object} sunCtrl - The sun controller to trigger flares upon impact
 */
export function createAgnShockwaveEngine(gwDisplayer, sunCtrl) {
    let isActive = false;
    let timeToImpactSec = 0;

    // FTL reference speed (arbitrary fast speed for dramatic effect)
    let speedAuPerSec = 20.0;
    let currentDistanceAu = 0;
    let direction = SAGITTARIUS_A_DIR.clone();
    let intensity = 1.0;

    return {
        /**
         * Trigger a new shockwave event
         * @param {string} source 'SagittariusA' or 'CentaurusA'
         * @param {number} impactTimeSec Time until the wave hits the sun (0,0,0)
         * @param {number} eventIntensity Strength of the event
         */
        triggerEvent(source = 'SagittariusA', impactTimeSec = 10, eventIntensity = 1.0) {
            isActive = true;
            timeToImpactSec = impactTimeSec;
            intensity = eventIntensity;

            if (source === 'CentaurusA') {
                direction.copy(CENTAURUS_A_DIR);
            } else {
                direction.copy(SAGITTARIUS_A_DIR);
            }

            currentDistanceAu = speedAuPerSec * timeToImpactSec;

            if (gwDisplayer) {
                gwDisplayer.toggle(true);
                gwDisplayer.setParams({
                    frequency: 10.0, // High freq jitter
                    strain: 0.8 * intensity, // Massive exaggerated strain
                    direction: direction,
                    isAgnEvent: 1.0,
                    shockwaveDist: currentDistanceAu
                });
            }
        },

        update(dtSec) {
            if (!isActive) return;

            timeToImpactSec -= dtSec;
            currentDistanceAu = speedAuPerSec * timeToImpactSec;

            if (gwDisplayer) {
                gwDisplayer.setParams({
                    shockwaveDist: currentDistanceAu
                });
            }

            if (timeToImpactSec <= 0 && currentDistanceAu <= 0) {
                this.onImpact();
            }
        },

        onImpact() {
            isActive = false;

            // Trigger an extreme solar flare reaction on all sides
            if (sunCtrl && sunCtrl.triggerMassiveAgnFlare) {
                sunCtrl.triggerMassiveAgnFlare(intensity);
            }

            if (gwDisplayer) {
                setTimeout(() => {
                    gwDisplayer.setParams({ isAgnEvent: 0.0, strain: 0.0 });
                    gwDisplayer.toggle(false);
                }, 4000); // Tsunami passes and dissipates
            }
        },

        isActive() { return isActive; },
        getDistanceAu() { return currentDistanceAu; },
        getTimeToImpact() { return timeToImpactSec; }
    };
}
