import { describe, expect, it } from 'vitest';
import { KUIPER_BELT_OBJECTS } from '../data/planets';
import { generateKuiperBelt, NAMED_KBOS, propagateKBOPositions } from './kuiperBelt';

const SOURCE_EPOCH_JD = 2_461_000.5;

const HORIZONS_ROWS = [
  {
    id: 'eris',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 67.99639935320742,
      e: 0.4369651041795099,
      iDeg: 43.86893139068314,
      ascendingNodeDeg: 36.0271731547851,
      argPeriapsisDeg: 150.7321829638727,
      meanAnomalyDeg: 211.4496226780759,
      periodDays: 204798.7496024734,
    },
    positionAu: [85.23368478727113, 39.42833049414339, -17.53813135116977],
  },
  {
    id: 'makemake',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 45.51068333601364,
      e: 0.1604252103708474,
      iDeg: 29.03230610125816,
      ascendingNodeDeg: 79.26892160912695,
      argPeriapsisDeg: 297.0756686869052,
      meanAnomalyDeg: 169.3199425473393,
      periodDays: 112142.0424076039,
    },
    positionAu: [-45.99276460101166, -8.962884955149995, 24.15537138575346],
  },
  {
    id: 'haumea',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 43.00550070466122,
      e: 0.1957749348643283,
      iDeg: 28.2084058575333,
      ascendingNodeDeg: 121.7972912148725,
      argPeriapsisDeg: 240.8882499146523,
      meanAnomalyDeg: 222.327773674086,
      periodDays: 103011.1983717244,
    },
    positionAu: [-37.07939768787798, -23.53588354029835, 23.5557720505645],
  },
  {
    id: 'sedna',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 549.5557484700445,
      e: 0.8613012757344123,
      iDeg: 11.9259170100237,
      ascendingNodeDeg: 144.4787538737016,
      argPeriapsisDeg: 311.0097768302501,
      meanAnomalyDeg: 358.6073191231379,
      periodDays: 4705611.401375764,
    },
    positionAu: [39.50017908257998, 71.045180447026, -17.05980403651381],
  },
  {
    id: 'quaoar',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 43.1476797896999,
      e: 0.03583878345045522,
      iDeg: 7.991371294756977,
      ascendingNodeDeg: 188.9632801280419,
      argPeriapsisDeg: 163.9231380423773,
      meanAnomalyDeg: 291.4818848560664,
      periodDays: 103522.463310922,
    },
    positionAu: [7.694073838614142, -41.50956274192028, 5.924540783299121],
  },
  {
    id: 'orcus',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 39.33577773786809,
      e: 0.2217299048615294,
      iDeg: 20.5555257981466,
      ascendingNodeDeg: 268.3859440319268,
      argPeriapsisDeg: 73.72224931783963,
      meanAnomalyDeg: 188.1114996171732,
      periodDays: 90111.46262610896,
    },
    positionAu: [-43.8463865719779, 10.37668823664831, -16.54501950892766],
  },
  {
    id: 'gonggong',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 66.8932285981878,
      e: 0.5031647192772432,
      iDeg: 30.86624793783273,
      ascendingNodeDeg: 336.8400983527928,
      argPeriapsisDeg: 206.6408306823951,
      meanAnomalyDeg: 111.3923083021873,
      periodDays: 199835.0499342,
    },
    positionAu: [81.52941434449006, -37.33157272303469, -1.349370309646854],
  },
  {
    id: 'varuna',
    orbit: {
      epochJd: SOURCE_EPOCH_JD,
      aAu: 43.17823437208563,
      e: 0.05254516459334936,
      iDeg: 17.13812404484431,
      ascendingNodeDeg: 97.21030234100793,
      argPeriapsisDeg: 273.2206220996139,
      meanAnomalyDeg: 115.0289798413239,
      periodDays: 103632.4453155141,
    },
    positionAu: [-27.80257116421313, 33.64007986002165, 7.203644014139416],
  },
] as const;

const EXPECTED_METADATA = [
  { dynClass: 2, surfaceColor: 0, diameterKm: 2326, albedo: 0.96, color: 0xc7c0b7, irregularity: 0.02 },
  { dynClass: 0, surfaceColor: 1, diameterKm: 1430, albedo: 0.81, color: 0xc9b8a0, irregularity: 0.03 },
  { dynClass: 0, surfaceColor: 0, diameterKm: 1632, albedo: 0.51, color: 0xd5cdc3, irregularity: 0.08 },
  { dynClass: 3, surfaceColor: 1, diameterKm: 996, albedo: 0.32, color: 0xd4735e, irregularity: 0.05 },
  { dynClass: 0, surfaceColor: 1, diameterKm: 1110, albedo: 0.11, color: 0xb8a090, irregularity: 0.04 },
  { dynClass: 1, surfaceColor: 0, diameterKm: 916, albedo: 0.23, color: 0xa0a0a0, irregularity: 0.04 },
  { dynClass: 2, surfaceColor: 1, diameterKm: 1230, albedo: 0.14, color: 0xc47060, irregularity: 0.03 },
  { dynClass: 0, surfaceColor: 1, diameterKm: 900, albedo: 0.09, color: 0xb9a7a0, irregularity: 0.06 },
] as const;

describe('named KBO Horizons elements at JD 2461000.5 (B020)', () => {
  it('uses every authoritative source field, including period, for all eight active rows', () => {
    expect(NAMED_KBOS).toHaveLength(HORIZONS_ROWS.length);
    for (const [index, row] of HORIZONS_ROWS.entries()) {
      expect(NAMED_KBOS[index].orbit, row.id).toStrictEqual(row.orbit);
    }
  });

  it('propagates all eight active rows within 1e-5 AU of independent Horizons vectors', () => {
    const population = generateKuiperBelt(HORIZONS_ROWS.length, 137);
    const positions = new Float32Array(population.count * 3);
    propagateKBOPositions(population.kbos, SOURCE_EPOCH_JD, positions);

    for (const [index, row] of HORIZONS_ROWS.entries()) {
      const offset = index * 3;
      const errorAu = Math.hypot(
        positions[offset] - row.positionAu[0],
        positions[offset + 1] - row.positionAu[1],
        positions[offset + 2] - row.positionAu[2],
      );
      expect(errorAu, `${row.id} position error (AU)`).toBeLessThan(1e-5);
    }
  });

  it('keeps the duplicate catalog rows synchronized with the active order', () => {
    const duplicates = KUIPER_BELT_OBJECTS.slice(0, HORIZONS_ROWS.length);
    expect(duplicates.map(body => body.id)).toStrictEqual(HORIZONS_ROWS.map(row => row.id));
    for (const [index, row] of HORIZONS_ROWS.entries()) {
      expect(duplicates[index].orbit, row.id).toStrictEqual(row.orbit);
      expect(duplicates[index].orbit).toStrictEqual(NAMED_KBOS[index].orbit);
    }
  });

  it('preserves named-object order and non-orbit metadata', () => {
    const population = generateKuiperBelt(HORIZONS_ROWS.length, 137);
    expect(population.count).toBe(HORIZONS_ROWS.length);
    expect(population.binaryCount).toBe(0);
    expect(population.kbos).toStrictEqual(NAMED_KBOS);
    expect(NAMED_KBOS.map(({ orbit: _orbit, ...metadata }) => metadata))
      .toStrictEqual(EXPECTED_METADATA);
  });
});
