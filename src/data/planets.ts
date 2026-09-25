import { J2000_JD } from '../constants';

export const SUN = {
  id: 'sun',
  name: 'Sun',
  type: 'star',
  massKg: 1.98847e30,
  radiusKm: 696_340,
  color: '#f6d165',
  axialTiltDeg: 7.25,
  rotationPeriodHours: 609.12
};

// J2000 mean elements from NASA/JPL planetary theory values.
//
// The eight planets carry the full JPL Standish "Approximate Positions of the Major Planets"
// Table 1 set (valid 1800 AD - 2050 AD), referenced to epoch J2000 (epochJd = J2000_JD):
//   aAu / e / iDeg / ascendingNodeDeg  are Standish a0, e0, I0, Omega0
//   argPeriapsisDeg                    is varpi0 - Omega0
//   meanAnomalyDeg                     is L0 - varpi0
// and likewise for the per-century rates, where
//   argPeriapsisDegPerCentury          is varpidot - Omegadot
//   meanLongitudeDegPerCentury         is Ldot, the tabulated mean-longitude rate.
// Ldot is what makes the mean anomaly propagate correctly: M(T) = M0 + (Ldot - varpidot) * T.
// Without it the propagator has to fall back on 2*pi/periodDays, which is dL/dt rather than dM/dt
// and therefore double-counts the apsidal precession that is already applied to argPeriapsis.
export const PLANETS = [
  {
    id: 'mercury',
    name: 'Mercury',
    type: 'planet',
    massKg: 3.3011e23,
    radiusKm: 2_439.7,
    color: '#a89a86',
    axialTiltDeg: 0.034,
    rotationPeriodHours: 1_407.6,
    orbit: {
      epochJd: J2000_JD,
      aAu: 0.38709927,
      e: 0.20563593,
      iDeg: 7.00497902,
      ascendingNodeDeg: 48.33076593,
      argPeriapsisDeg: 29.12703035,
      meanAnomalyDeg: 174.79252722,
      periodDays: 87.9691,
      secularRates: {
        meanLongitudeDegPerCentury: 149472.67411175,
        aAuPerCentury: 0.00000037,
        ePerCentury: 0.00001906,
        iDegPerCentury: -0.00594749,
        ascendingNodeDegPerCentury: -0.12534081,
        argPeriapsisDegPerCentury: 0.2858177,
        meanLongitudeDegPerCentury: 149472.67411175
      }
    }
  },
  {
    id: 'venus',
    name: 'Venus',
    type: 'planet',
    massKg: 4.8675e24,
    radiusKm: 6_051.8,
    color: '#d6b481',
    axialTiltDeg: 177.36,
    rotationPeriodHours: -5_832.5,
    orbit: {
      epochJd: J2000_JD,
      aAu: 0.72333566,
      e: 0.00677672,
      iDeg: 3.39467605,
      ascendingNodeDeg: 76.67984255,
      argPeriapsisDeg: 54.92262463,
      meanAnomalyDeg: 50.37663232,
      periodDays: 224.701,
      secularRates: {
        meanLongitudeDegPerCentury: 58517.81538729,
        aAuPerCentury: 0.0000039,
        ePerCentury: -0.00004107,
        iDegPerCentury: -0.0007889,
        ascendingNodeDegPerCentury: -0.27769418,
        argPeriapsisDegPerCentury: 0.28037747,
        meanLongitudeDegPerCentury: 58517.81538729
      }
    }
  },
  {
    id: 'earth',
    name: 'Earth',
    type: 'planet',
    massKg: 5.97237e24,
    radiusKm: 6_371.0,
    equatorialRadiusKm: 6_378.137,
    polarRadiusKm: 6_356.752,
    color: '#4f8fdb',
    axialTiltDeg: 23.439281,
    rotationPeriodHours: 23.9344696,
    // Align Earth day-map prime meridian with the orbital frame used in the scene.
    rotationPhaseDeg: -90,
    orbit: {
      epochJd: J2000_JD,
      aAu: 1.00000261,
      e: 0.01671123,
      iDeg: -0.00001531,
      ascendingNodeDeg: 0,
      argPeriapsisDeg: 102.93768193,
      meanAnomalyDeg: 357.52688973,
      periodDays: 365.256,
      secularRates: {
        meanLongitudeDegPerCentury: 35999.37244981,
        aAuPerCentury: 0.00000562,
        ePerCentury: -0.00004392,
        iDegPerCentury: -0.01294668,
        ascendingNodeDegPerCentury: 0,
        argPeriapsisDegPerCentury: 0.32327364,
        meanLongitudeDegPerCentury: 35999.37244981
      }
    }
  },
  {
    id: 'mars',
    name: 'Mars',
    type: 'planet',
    massKg: 6.4171e23,
    radiusKm: 3_389.5,
    color: '#d16f54',
    axialTiltDeg: 25.19,
    rotationPeriodHours: 24.6229,
    orbit: {
      epochJd: J2000_JD,
      aAu: 1.52371034,
      e: 0.0933941,
      iDeg: 1.84969142,
      ascendingNodeDeg: 49.55953891,
      argPeriapsisDeg: 286.4968315,
      meanAnomalyDeg: 19.39019754,
      periodDays: 686.98,
      secularRates: {
        meanLongitudeDegPerCentury: 19140.30268499,
        aAuPerCentury: 0.00001847,
        ePerCentury: 0.00007882,
        iDegPerCentury: -0.00813131,
        ascendingNodeDegPerCentury: -0.29257343,
        argPeriapsisDegPerCentury: 0.73698431,
        meanLongitudeDegPerCentury: 19140.30268499
      }
    }
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    type: 'planet',
    massKg: 1.8982e27,
    radiusKm: 69_911,
    color: '#c7a06b',
    axialTiltDeg: 3.13,
    rotationPeriodHours: 9.925,
    orbit: {
      epochJd: J2000_JD,
      aAu: 5.202887,
      e: 0.04838624,
      iDeg: 1.30439695,
      ascendingNodeDeg: 100.47390909,
      argPeriapsisDeg: 274.25457074,
      meanAnomalyDeg: 19.66796068,
      periodDays: 4_332.589,
      secularRates: {
        meanLongitudeDegPerCentury: 3034.74612775,
        aAuPerCentury: -0.00011607,
        ePerCentury: -0.00013253,
        iDegPerCentury: -0.00183714,
        ascendingNodeDegPerCentury: 0.20469106,
        argPeriapsisDegPerCentury: 0.00783562,
        meanLongitudeDegPerCentury: 3034.74612775
      }
    }
  },
  {
    id: 'saturn',
    name: 'Saturn',
    type: 'planet',
    massKg: 5.6834e26,
    radiusKm: 58_232,
    color: '#d4bf89',
    axialTiltDeg: 26.73,
    // Approximate north-pole direction in ecliptic longitude (deg).
    spinAxisLongitudeDeg: 79.53,
    rotationPeriodHours: 10.656,
    orbit: {
      epochJd: J2000_JD,
      aAu: 9.53667594,
      e: 0.05386179,
      iDeg: 2.48599187,
      ascendingNodeDeg: 113.66242448,
      argPeriapsisDeg: 338.93645383,
      meanAnomalyDeg: 317.35536592,
      periodDays: 10_759.22,
      secularRates: {
        meanLongitudeDegPerCentury: 1222.49362201,
        aAuPerCentury: -0.0012506,
        ePerCentury: -0.00050991,
        iDegPerCentury: 0.00193609,
        ascendingNodeDegPerCentury: -0.28867794,
        argPeriapsisDegPerCentury: -0.13029422,
        meanLongitudeDegPerCentury: 1222.49362201
      }
    }
  },
  {
    id: 'uranus',
    name: 'Uranus',
    type: 'planet',
    massKg: 8.681e25,
    radiusKm: 25_362,
    color: '#8fd7de',
    axialTiltDeg: 97.77,
    // Approximate north-pole direction in ecliptic longitude (deg).
    spinAxisLongitudeDeg: 257.65,
    rotationPeriodHours: -17.24,
    orbit: {
      epochJd: J2000_JD,
      aAu: 19.18916464,
      e: 0.04725744,
      iDeg: 0.77263783,
      ascendingNodeDeg: 74.01692503,
      argPeriapsisDeg: 96.93735127,
      meanAnomalyDeg: 142.28382821,
      periodDays: 30_685.4,
      secularRates: {
        meanLongitudeDegPerCentury: 428.48202785,
        aAuPerCentury: -0.00196176,
        ePerCentury: -0.00004397,
        iDegPerCentury: -0.00242939,
        ascendingNodeDegPerCentury: 0.04240589,
        argPeriapsisDegPerCentury: 0.36564692,
        meanLongitudeDegPerCentury: 428.48202785
      }
    }
  },
  {
    id: 'neptune',
    name: 'Neptune',
    type: 'planet',
    massKg: 1.02413e26,
    radiusKm: 24_622,
    color: '#4a76d9',
    axialTiltDeg: 28.32,
    rotationPeriodHours: 16.11,
    orbit: {
      epochJd: J2000_JD,
      aAu: 30.06992276,
      e: 0.00859048,
      iDeg: 1.77004347,
      ascendingNodeDeg: 131.78422574,
      argPeriapsisDeg: 273.18053653,
      meanAnomalyDeg: 259.91520804,
      periodDays: 60_189,
      secularRates: {
        meanLongitudeDegPerCentury: 218.45945325,
        aAuPerCentury: 0.00026291,
        ePerCentury: 0.00005105,
        iDegPerCentury: 0.00035372,
        ascendingNodeDegPerCentury: -0.00508664,
        argPeriapsisDegPerCentury: -0.317328,
        meanLongitudeDegPerCentury: 218.45945325
      }
    }
  },
  {
    id: 'pluto',
    name: 'Pluto',
    type: 'dwarf',
    massKg: 1.303e22,
    radiusKm: 1_188.3,
    color: '#b7a38d',
    axialTiltDeg: 122.53,
    rotationPeriodHours: -153.2928,
    orbit: {
      epochJd: J2000_JD,
      aAu: 39.48211675,
      e: 0.2488273,
      iDeg: 17.14001206,
      ascendingNodeDeg: 110.30393684,
      argPeriapsisDeg: 113.76497945,
      meanAnomalyDeg: 14.86012204,
      periodDays: 90_560
    }
  }
];

export const MAJOR_MOON_RADII_KM = {
  Moon: 1_737.4,
  Phobos: 11.08,
  Deimos: 6.2,
  Io: 1_821.6,
  Europa: 1_560.8,
  Ganymede: 2_634.1,
  Callisto: 2_410.3,
  Amalthea: 83.45,
  Himalia: 69.8,
  Elara: 43,
  Pasiphae: 28.9,
  Sinope: 19,
  Lysithea: 18,
  Carme: 23,
  Ananke: 14,
  Leda: 10,
  Thebe: 49.3,
  Adrastea: 8.2,
  Metis: 21.5,
  Titan: 2_574.7,
  Rhea: 763.8,
  Iapetus: 734.5,
  Dione: 561.4,
  Tethys: 531.1,
  Enceladus: 252.1,
  Mimas: 198.2,
  Hyperion: 133,
  Phoebe: 106.6,
  Janus: 89.5,
  Epimetheus: 58.1,
  Helene: 18,
  Titania: 788.9,
  Oberon: 761.4,
  Umbriel: 584.7,
  Ariel: 578.9,
  Miranda: 235.8,
  Triton: 1_353.4,
  Nereid: 170,
  Proteus: 210,
  Larissa: 97,
  Galatea: 88,
  Despina: 75,
  Charon: 606,
  Nix: 23,
  Hydra: 31,
  Kerberos: 9,
  Styx: 5
};

export const MAJOR_MOON_SHAPE_KM = {
  Moon: {
    equatorialRadiusKm: 1_738.1,
    polarRadiusKm: 1_736.0
  }
};

export const MOON_ROTATION_PERIOD_HOURS = {
  // Tidally locked to Mars with period matching each moon's mean orbital period.
  Phobos: 7.6488,
  Deimos: 30.3
};

export const MAJOR_MOONS = new Set([
  'Moon',
  'Phobos',
  'Deimos',
  'Io',
  'Europa',
  'Ganymede',
  'Callisto',
  'Titan',
  'Rhea',
  'Iapetus',
  'Dione',
  'Tethys',
  'Enceladus',
  'Mimas',
  'Titania',
  'Oberon',
  'Umbriel',
  'Ariel',
  'Miranda',
  'Triton',
  'Charon'
]);

// Major asteroid belt objects with J2000 orbital elements.
export const ASTEROID_BELT_OBJECTS = [
  {
    id: 'ceres',
    name: 'Ceres',
    type: 'dwarf',
    massKg: 9.393e20,
    radiusKm: 469.7,
    color: '#8a8a82',
    orbit: {
      epochJd: J2000_JD,
      aAu: 2.7691651,
      e: 0.0760090,
      iDeg: 10.59351,
      ascendingNodeDeg: 80.30553,
      argPeriapsisDeg: 73.59769,
      meanAnomalyDeg: 77.37209,
      periodDays: 1_681.63
    }
  },
  {
    id: 'vesta',
    name: 'Vesta',
    type: 'asteroid',
    massKg: 2.59076e20,
    radiusKm: 262.7,
    color: '#a0998e',
    orbit: {
      epochJd: J2000_JD,
      aAu: 2.3615126,
      e: 0.0887459,
      iDeg: 7.14170,
      ascendingNodeDeg: 103.85141,
      argPeriapsisDeg: 149.85773,
      meanAnomalyDeg: 212.82215,
      periodDays: 1_325.75
    }
  },
  {
    id: 'pallas',
    name: 'Pallas',
    type: 'asteroid',
    massKg: 2.04e20,
    radiusKm: 256,
    color: '#7a7a72',
    orbit: {
      epochJd: J2000_JD,
      aAu: 2.7716515,
      e: 0.2312736,
      iDeg: 34.84099,
      ascendingNodeDeg: 173.08940,
      argPeriapsisDeg: 310.20237,
      meanAnomalyDeg: 259.88584,
      periodDays: 1_686.04
    }
  },
  {
    id: 'hygiea',
    name: 'Hygiea',
    type: 'asteroid',
    massKg: 8.32e19,
    radiusKm: 217,
    color: '#606058',
    orbit: {
      epochJd: J2000_JD,
      aAu: 3.1415207,
      e: 0.1175540,
      iDeg: 3.84168,
      ascendingNodeDeg: 283.20102,
      argPeriapsisDeg: 312.32860,
      meanAnomalyDeg: 156.51580,
      periodDays: 2_033.81
    }
  },
  {
    id: 'juno',
    name: 'Juno',
    type: 'asteroid',
    massKg: 2.67e19,
    radiusKm: 123.3,
    color: '#9a9080',
    orbit: {
      epochJd: J2000_JD,
      aAu: 2.6700936,
      e: 0.2579316,
      iDeg: 12.98211,
      ascendingNodeDeg: 169.91137,
      argPeriapsisDeg: 248.41004,
      meanAnomalyDeg: 115.41562,
      periodDays: 1_592.66
    }
  },
  {
    id: 'psyche',
    name: 'Psyche',
    type: 'asteroid',
    massKg: 2.72e19,
    radiusKm: 111,
    color: '#9f978d',
    orbit: {
      epochJd: J2000_JD,
      aAu: 2.92187,
      e: 0.1398,
      iDeg: 3.095,
      ascendingNodeDeg: 150.03,
      argPeriapsisDeg: 228.15,
      meanAnomalyDeg: 33.56,
      periodDays: 1_824.5
    }
  },
  {
    id: 'eunomia',
    name: 'Eunomia',
    type: 'asteroid',
    massKg: 3.12e19,
    radiusKm: 127,
    color: '#9a8d7f',
    orbit: {
      epochJd: J2000_JD,
      aAu: 2.64385,
      e: 0.1868,
      iDeg: 11.75,
      ascendingNodeDeg: 293.19,
      argPeriapsisDeg: 98.39,
      meanAnomalyDeg: 157.43,
      periodDays: 1_571.3
    }
  },
  {
    id: 'europa52',
    name: 'Europa (52)',
    type: 'asteroid',
    massKg: 2.41e19,
    radiusKm: 156,
    color: '#8b847b',
    orbit: {
      epochJd: J2000_JD,
      aAu: 3.09695,
      e: 0.0985,
      iDeg: 7.48,
      ascendingNodeDeg: 128.62,
      argPeriapsisDeg: 260.12,
      meanAnomalyDeg: 313.21,
      periodDays: 1_991.0
    }
  },
  {
    id: 'interamnia704',
    name: 'Interamnia (704)',
    type: 'asteroid',
    massKg: 3.39e19,
    radiusKm: 166,
    color: '#7e756a',
    orbit: {
      epochJd: J2000_JD,
      aAu: 3.0627,
      e: 0.154,
      iDeg: 17.29,
      ascendingNodeDeg: 282.89,
      argPeriapsisDeg: 95.78,
      meanAnomalyDeg: 349.6,
      periodDays: 1_958.0
    }
  },
  {
    id: 'davida511',
    name: 'Davida (511)',
    type: 'asteroid',
    massKg: 3.8e19,
    radiusKm: 163,
    color: '#7f756b',
    orbit: {
      epochJd: J2000_JD,
      aAu: 3.1662,
      e: 0.1889,
      iDeg: 15.94,
      ascendingNodeDeg: 108.58,
      argPeriapsisDeg: 333.04,
      meanAnomalyDeg: 102.44,
      periodDays: 2_057.4
    }
  },
  {
    id: 'iris7',
    name: 'Iris (7)',
    type: 'asteroid',
    massKg: 1.29e19,
    radiusKm: 107,
    color: '#8f8578',
    orbit: {
      epochJd: J2000_JD,
      aAu: 2.3866,
      e: 0.231,
      iDeg: 5.52,
      ascendingNodeDeg: 259.58,
      argPeriapsisDeg: 145.4,
      meanAnomalyDeg: 185.6,
      periodDays: 1_345.4
    }
  },
  {
    id: 'hebe',
    name: 'Hebe (6)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 92.59,
    color: '#8f877d',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 2.425469295605402,
      e: 0.2022300641713704,
      iDeg: 14.73615054649163,
      ascendingNodeDeg: 138.6147295218171,
      argPeriapsisDeg: 239.6962153510471,
      meanAnomalyDeg: 352.5636680689065,
      periodDays: 1_379.723618278942
    }
  },
  {
    id: 'flora',
    name: 'Flora (8)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 73.75,
    color: '#a49a8f',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 2.201307162677431,
      e: 0.1563337133955282,
      iDeg: 5.890326395333704,
      ascendingNodeDeg: 110.8433741767689,
      argPeriapsisDeg: 285.4267388865241,
      meanAnomalyDeg: 198.9007844696565,
      periodDays: 1_192.942186357289
    }
  },
  {
    id: 'metis',
    name: 'Metis (9)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 95.0,
    color: '#8e8276',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 2.3865665442279,
      e: 0.1225644945880542,
      iDeg: 5.577707856670986,
      ascendingNodeDeg: 68.86978123290572,
      argPeriapsisDeg: 5.895913019112819,
      meanAnomalyDeg: 199.1964699805467,
      periodDays: 1_346.662445922346
    }
  },
  {
    id: 'amphitrite',
    name: 'Amphitrite (29)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 94.78,
    color: '#9b9184',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 2.554121108737986,
      e: 0.07335027403054248,
      iDeg: 6.077438247546309,
      ascendingNodeDeg: 356.2547012430243,
      argPeriapsisDeg: 61.90579763914975,
      meanAnomalyDeg: 145.1081740584724,
      periodDays: 1_490.941681968144
    }
  },
  {
    id: 'euphrosyne',
    name: 'Euphrosyne (31)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 133.54,
    color: '#6c6b65',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 3.161505296070994,
      e: 0.2159206687541511,
      iDeg: 26.3122353347305,
      ascendingNodeDeg: 30.79587827581202,
      argPeriapsisDeg: 61.97076102357662,
      meanAnomalyDeg: 147.8931223815032,
      periodDays: 2_053.238019240071
    }
  },
  {
    id: 'cybele',
    name: 'Cybele (65)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 118.63,
    color: '#7f776d',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 3.407667304335468,
      e: 0.1277298484525094,
      iDeg: 3.564948573195629,
      ascendingNodeDeg: 155.0988086384028,
      argPeriapsisDeg: 104.1394103577884,
      meanAnomalyDeg: 272.6326811780436,
      periodDays: 2_297.651769051524
    }
  },
  {
    id: 'sylvia',
    name: 'Sylvia (87)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 126.53,
    color: '#7c756c',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 3.484518782251748,
      e: 0.09433757216253168,
      iDeg: 10.87247390257978,
      ascendingNodeDeg: 73.01146029932147,
      argPeriapsisDeg: 265.8265584696771,
      meanAnomalyDeg: 94.95962367758351,
      periodDays: 2_375.815118103395
    }
  },
  {
    id: 'camilla',
    name: 'Camilla (107)',
    type: 'asteroid',
    massKg: null,
    radiusKm: 105.19,
    color: '#7b7268',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 3.493091091231003,
      e: 0.0664513680975773,
      iDeg: 9.998659770883721,
      ascendingNodeDeg: 172.5062650612664,
      argPeriapsisDeg: 303.7382556571125,
      meanAnomalyDeg: 332.5445461614998,
      periodDays: 2_384.587667433313
    }
  }
];

// Known Kuiper Belt Objects / trans-Neptunian dwarf planets.
// Orbital elements referenced to J2000 epoch (approximate).
export const KUIPER_BELT_OBJECTS = [
  {
    id: 'eris',
    name: 'Eris',
    type: 'dwarf',
    massKg: 1.66e22,
    radiusKm: 1_163,
    color: '#c7c0b7',
    orbit: {
      epochJd: J2000_JD,
      aAu: 67.864,
      e: 0.4366,
      iDeg: 44.04,
      ascendingNodeDeg: 35.951,
      argPeriapsisDeg: 151.639,
      meanAnomalyDeg: 205.989,
      periodDays: 203_830
    }
  },
  {
    id: 'makemake',
    name: 'Makemake',
    type: 'dwarf',
    massKg: 3.1e21,
    radiusKm: 715,
    color: '#c9b8a0',
    orbit: {
      epochJd: J2000_JD,
      aAu: 45.43,
      e: 0.1613,
      iDeg: 28.984,
      ascendingNodeDeg: 79.382,
      argPeriapsisDeg: 297.24,
      meanAnomalyDeg: 153.27,
      periodDays: 111_845
    }
  },
  {
    id: 'haumea',
    name: 'Haumea',
    type: 'dwarf',
    massKg: 4.006e21,
    radiusKm: 816,
    color: '#d5cdc3',
    orbit: {
      epochJd: J2000_JD,
      aAu: 43.218,
      e: 0.1951,
      iDeg: 28.213,
      ascendingNodeDeg: 122.167,
      argPeriapsisDeg: 239.041,
      meanAnomalyDeg: 205.22,
      periodDays: 103_774
    }
  },
  {
    id: 'sedna',
    name: 'Sedna',
    type: 'dwarf',
    massKg: null,
    radiusKm: 498,
    color: '#d4735e',
    orbit: {
      epochJd: J2000_JD,
      aAu: 506.8,
      e: 0.8496,
      iDeg: 11.929,
      ascendingNodeDeg: 144.514,
      argPeriapsisDeg: 311.122,
      meanAnomalyDeg: 358.117,
      periodDays: 4_163_000
    }
  },
  {
    id: 'quaoar',
    name: 'Quaoar',
    type: 'dwarf',
    massKg: 1.2e21,
    radiusKm: 555,
    color: '#b8a090',
    orbit: {
      epochJd: J2000_JD,
      aAu: 43.694,
      e: 0.0389,
      iDeg: 7.985,
      ascendingNodeDeg: 188.927,
      argPeriapsisDeg: 147.48,
      meanAnomalyDeg: 282.48,
      periodDays: 105_480
    }
  },
  {
    id: 'orcus',
    name: 'Orcus',
    type: 'dwarf',
    massKg: 6.32e20,
    radiusKm: 458,
    color: '#a0a0a0',
    orbit: {
      epochJd: J2000_JD,
      aAu: 39.419,
      e: 0.2271,
      iDeg: 20.573,
      ascendingNodeDeg: 268.799,
      argPeriapsisDeg: 73.1,
      meanAnomalyDeg: 181.735,
      periodDays: 90_470
    }
  },
  {
    id: 'gonggong',
    name: 'Gonggong',
    type: 'dwarf',
    massKg: 1.75e21,
    radiusKm: 615,
    color: '#c47060',
    orbit: {
      epochJd: J2000_JD,
      aAu: 67.485,
      e: 0.501,
      iDeg: 30.739,
      ascendingNodeDeg: 336.859,
      argPeriapsisDeg: 207.667,
      meanAnomalyDeg: 107.46,
      periodDays: 202_370
    }
  },
  {
    id: 'varuna',
    name: 'Varuna (20000)',
    type: 'dwarf',
    massKg: null,
    radiusKm: 450.0,
    color: '#b9a7a0',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 43.17823437208563,
      e: 0.05254516459334936,
      iDeg: 17.13812404484431,
      ascendingNodeDeg: 97.21030234100793,
      argPeriapsisDeg: 273.2206220996139,
      meanAnomalyDeg: 115.0289798413239,
      periodDays: 103_632.4453155141
    }
  },
  {
    id: 'ixion',
    name: 'Ixion (28978)',
    type: 'dwarf',
    massKg: null,
    // Estimated from absolute magnitude H with assumed albedo 0.09.
    radiusKm: 448.1,
    color: '#c2b0a4',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 39.35053706213409,
      e: 0.2442328489971719,
      iDeg: 19.67041190191546,
      ascendingNodeDeg: 71.09295825377649,
      argPeriapsisDeg: 300.6585723831106,
      meanAnomalyDeg: 294.2004612799266,
      periodDays: 90_162.18397151395
    }
  },
  {
    id: 'salacia',
    name: 'Salacia (120347)',
    type: 'dwarf',
    massKg: null,
    // Estimated from absolute magnitude H with assumed albedo 0.09.
    radiusKm: 332.18,
    color: '#b2a6a0',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 42.11465003230769,
      e: 0.1033787261230713,
      iDeg: 23.92712613400163,
      ascendingNodeDeg: 280.2626295339988,
      argPeriapsisDeg: 309.4776964357308,
      meanAnomalyDeg: 133.4611617235804,
      periodDays: 99_827.04623325469
    }
  },
  {
    id: 'varda',
    name: 'Varda (174567)',
    type: 'dwarf',
    massKg: null,
    // Estimated from absolute magnitude H with assumed albedo 0.09.
    radiusKm: 450.17,
    color: '#bfb4aa',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 45.53806201400563,
      e: 0.1430078809328084,
      iDeg: 21.51403329578455,
      ascendingNodeDeg: 184.1214782264865,
      argPeriapsisDeg: 184.9743325694585,
      meanAnomalyDeg: 276.5587616814524,
      periodDays: 112_243.2525750103
    }
  },
  {
    id: 'ms4',
    name: '2002 MS4 (307261)',
    type: 'dwarf',
    massKg: null,
    // Estimated from absolute magnitude H with assumed albedo 0.09.
    radiusKm: 414.36,
    color: '#b7aba1',
    orbit: {
      epochJd: 2_461_000.5,
      aAu: 41.59530825444364,
      e: 0.1486943469086431,
      iDeg: 17.70394926111006,
      ascendingNodeDeg: 216.1862229438626,
      argPeriapsisDeg: 215.2160852937352,
      meanAnomalyDeg: 229.8810349241941,
      periodDays: 97_986.20719954059
    }
  }
];
