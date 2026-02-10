import { J2000_JD } from '../constants.js';

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
      periodDays: 87.9691
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
      periodDays: 224.701
    }
  },
  {
    id: 'earth',
    name: 'Earth',
    type: 'planet',
    massKg: 5.97237e24,
    radiusKm: 6_371.0,
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
      periodDays: 365.256
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
      periodDays: 686.98
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
      periodDays: 4_332.589
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
    rotationPeriodHours: 10.656,
    orbit: {
      epochJd: J2000_JD,
      aAu: 9.53667594,
      e: 0.05386179,
      iDeg: 2.48599187,
      ascendingNodeDeg: 113.66242448,
      argPeriapsisDeg: 338.93645383,
      meanAnomalyDeg: 317.35536592,
      periodDays: 10_759.22
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
    rotationPeriodHours: -17.24,
    orbit: {
      epochJd: J2000_JD,
      aAu: 19.18916464,
      e: 0.04725744,
      iDeg: 0.77263783,
      ascendingNodeDeg: 74.01692503,
      argPeriapsisDeg: 96.93735127,
      meanAnomalyDeg: 142.28382821,
      periodDays: 30_685.4
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
      periodDays: 60_189
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
  }
];
