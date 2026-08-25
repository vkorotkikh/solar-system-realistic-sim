/**
 * Accuracy regression tests for secular-rate propagation.
 *
 * Why these exist: the secular-rate feature shipped with a defect the other
 * orbitMath tests cannot see. They assert only that elements and positions
 * *changed*, never that they got *closer to reality*, so they stayed green while
 * planet positions became several times worse than the fixed-element propagation
 * they replaced.
 *
 * The bar here is an independent oracle - JPL Horizons vectors - at SEVERAL
 * epochs. An earlier revision of this file checked a single date and was later
 * shown to have been calibrated to it: the propagator passed there and failed at
 * the element epoch itself. Any future budget change should be justified across
 * the whole span below, not at one favourable date.
 *
 * Fixture provenance
 *   JPL Horizons API, EPHEM_TYPE=VECTORS, CENTER=500@10 (Sun body centre),
 *   REF_PLANE=ECLIPTIC (J2000), OUT_UNITS=AU-D, VEC_CORR=NONE.
 *   Body ids 199/299/399/499/599/699/799/899. Retrieved 2026-08-24.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PLANETS } from '../data/planets';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';

const AU_KM = 149_597_870.7;

interface HorizonsEpoch {
  label: string;
  jd: number;
  positionsAu: Record<string, [number, number, number]>;
}

/** Heliocentric ecliptic-J2000 positions (AU) - see fixture provenance above. */
const EPOCHS: HorizonsEpoch[] = [
  {
    label: '1900',
    jd: 2415020.5,
    positionsAu: {
      mercury: [-0.387378609, -0.162654648, 0.022390165],
      venus: [0.699854229, -0.193680511, -0.043047060],
      earth: [-0.196887534, 0.963352354, 0.000213942],
      mars: [0.435367264, -1.352511632, -0.039079726],
      jupiter: [-3.016039428, -4.460192848, 0.085804467],
      saturn: [-0.366966830, -10.058351623, 0.191583929],
      uranus: [-6.479284811, -17.853432035, 0.017764138],
      neptune: [1.514870538, 29.825574243, -0.649114445]
    }
  },
  {
    label: 'J2000',
    jd: 2451545.0,
    positionsAu: {
      mercury: [-0.130093605, -0.447287618, -0.024598307],
      venus: [-0.718302296, -0.032654308, 0.041014182],
      earth: [-0.177135099, 0.967241687, -0.000004085],
      mars: [1.390715922, -0.013416318, -0.034467663],
      jupiter: [4.001177436, 2.938575782, -0.101785283],
      saturn: [6.406410428, 6.569988452, -0.369075973],
      uranus: [14.431855276, -13.734323402, -0.238141767],
      neptune: [16.812047606, -24.991763253, 0.127222512]
    }
  },
  {
    label: '2026*',
    jd: 2461275.5,
    positionsAu: {
      mercury: [-0.208324937, 0.251798490, 0.039684790],
      venus: [0.269323779, -0.675829957, -0.024824859],
      earth: [0.871695995, -0.512706627, 0.000028178],
      mars: [0.631951035, 1.369345143, 0.013200834],
      jupiter: [-3.260004488, 4.170966586, 0.055611924],
      saturn: [9.309522714, 1.553075770, -0.397623591],
      uranus: [9.068071450, 17.204778405, -0.053681530],
      neptune: [29.843998062, 1.257211697, -0.713633122]
    }
  },
  {
    label: '2100',
    jd: 2488069.5,
    positionsAu: {
      mercury: [0.238741605, -0.356557347, -0.051025379],
      venus: [0.687529794, 0.227829945, -0.036451424],
      earth: [-0.157407133, 0.970677744, -0.000218218],
      mars: [0.609655774, 1.380752260, 0.014123580],
      jupiter: [-5.373760305, -0.908479910, 0.123887764],
      saturn: [-9.153087248, -3.078992753, 0.418239969],
      uranus: [18.865058172, 6.548936231, -0.219657636],
      neptune: [-29.059227419, 8.235187481, 0.500193398]
    }
  }
];

/**
 * Per-planet ceilings in km, held across every epoch above. Each is ~1.6x the
 * worst error the corrected propagator produces over 1800-2150, so it has real
 * headroom yet still fails the defects this file exists to catch:
 * the double-counted drift (which reached ~7.5e6 km on Neptune) and the
 * period-derived mean-anomaly rate (which left Mercury ~2.3e5 km out).
 *
 * Saturn and Uranus are deliberately loose: JPL's 1800-2050 table alone omits
 * the Jupiter-Saturn great-inequality terms, so a few million km there is the
 * element set's floor, not this propagator's error.
 */
const MAX_ERROR_KM: Record<string, number> = {
  mercury: 10_000,
  venus: 20_000,
  earth: 20_000,
  mars: 120_000,
  jupiter: 1_840_000,
  saturn: 9_930_000,
  uranus: 13_080_000,
  neptune: 4_670_000,
};

/** Worst per-epoch total the corrected propagator produces, plus headroom. */
const MAX_TOTAL_ERROR_KM = 16_000_000;

function errorKm(id: string, epoch: HorizonsEpoch): number {
  const planet = (PLANETS as any[]).find((p) => p.id === id);
  if (!planet?.orbit) throw new Error(`no orbit for ${id}`);
  const actual = new Vector3();
  propagateKeplerOrbit(planet.orbit, epoch.jd - planet.orbit.epochJd, actual);
  const [x, y, z] = epoch.positionsAu[id];
  return actual.distanceTo(new Vector3(x, y, z)) * AU_KM;
}

describe('secular-rate propagation accuracy vs JPL Horizons', () => {
  for (const epoch of EPOCHS) {
    describe(`epoch ${epoch.label}`, () => {
      it.each(Object.keys(epoch.positionsAu))('places %s within its error budget', (id: string) => {
        expect(errorKm(id, epoch)).toBeLessThan(MAX_ERROR_KM[id]);
      });

      it('keeps the eight-planet total within budget', () => {
        const total = Object.keys(epoch.positionsAu).reduce((sum, id) => sum + errorKm(id, epoch), 0);
        expect(total).toBeLessThan(MAX_TOTAL_ERROR_KM);
      });
    });
  }
});

/**
 * Positions for an orbit carrying NO secular rates, captured from the propagator
 * *before* the secular-rate correction landed. Comparing against these committed
 * numbers - rather than against the current function with an empty rates block -
 * is what makes this a real invariant instead of a tautology.
 */
const RATE_FREE_EXPECTED: Array<[number, number, number, number]> = [
  [0, 3.996002574, 2.948330826, -0.101356336],
  [365.25, 1.794533284, 4.718132630, -0.059553585],
  [36525, -5.368076606, -0.925691519, 0.123607034],
  [-36525, -3.025740100, -4.449933705, 0.085916582],
  [365250, -4.527320671, 2.875814815, 0.089125960]
];

describe('bodies without secular rates are unaffected', () => {
  it('matches the pre-correction propagator exactly', () => {
    // Asteroids and KBOs carry no rates at all. (Moons DO carry them - see
    // catalog.ts resolveMoonSecularRates - so they are intentionally not covered here.)
    const orbit: KeplerOrbit = {
      epochJd: 2_451_545.0,
      aAu: 5.2,
      e: 0.048,
      iDeg: 1.3,
      ascendingNodeDeg: 100.5,
      argPeriapsisDeg: 273.9,
      meanAnomalyDeg: 20.02,
      periodDays: 4332.59
    };

    for (const [elapsedDays, x, y, z] of RATE_FREE_EXPECTED) {
      const actual = new Vector3();
      propagateKeplerOrbit(orbit, elapsedDays, actual);
      expect(actual.x).toBeCloseTo(x, 9);
      expect(actual.y).toBeCloseTo(y, 9);
      expect(actual.z).toBeCloseTo(z, 9);
    }
  });
});
