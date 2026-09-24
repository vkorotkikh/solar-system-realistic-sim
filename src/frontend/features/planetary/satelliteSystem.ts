import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  Vector3
} from 'three';
import {
  AU_KM,
  J2000_JD,
  julianDateFromUnixMs,
  utcJulianDateToTdb
} from '../../../constants';
import {
  PRIMARY_MODELS,
  meanMotionFromSemimajorAxis,
  propagateAroundPrimary,
  semimajorAxisFromMeanMotion,
  type PrimaryModel,
  type PropagatedSatellite
} from './satellitePropagationCore';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const DAY_SECONDS = 86_400;

const DEFAULT_TLE_SOURCES_EARTH = {
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  geo: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle'
};
const SATELLITE_ICON_TEXTURES = new Map<string, CanvasTexture>();

interface SatelliteCatalogEntry {
  id?: string;
  name?: string;
  category?: string;
  epochJd?: number;
  aKm?: number;
  altitudeKm?: number;
  e?: number;
  iDeg?: number;
  ascendingNodeDeg?: number;
  argPeriapsisDeg?: number;
  meanAnomalyDeg?: number;
  meanMotionRevDay?: number;
  periodHours?: number;
  periodDays?: number;
  frame?: string;
}

interface MarkerPixelSize {
  min: number;
  preferred: number;
  max: number;
}

interface MarkerColorOverrides {
  default?: string;
  [category: string]: string | undefined;
}

interface NormalizedSatellite extends PropagatedSatellite {
  id: string;
  name: string;
  category: string;
  meanMotionRevDay: number;
}

interface SatelliteWorkerSnapshot {
  jd0: number;
  jd1: number;
  positions0: Float32Array;
  positions1: Float32Array;
  count: number;
}

interface SatelliteWorkerReadyMessage {
  type: 'ready';
  count: number;
}

interface SatelliteWorkerSnapshotMessage {
  type: 'snapshot';
  jd0: number;
  jd1: number;
  count: number;
  positions0: Float32Array | ArrayLike<number>;
  positions1: Float32Array | ArrayLike<number>;
}

type SatelliteWorkerMessage = SatelliteWorkerReadyMessage | SatelliteWorkerSnapshotMessage;

interface SatelliteViewState {
  camera?: { fov: number; position: Vector3 };
  viewportHeight?: number;
}

interface OrbitalSatelliteSystemOptions {
  primaryId?: string;
  maxGeoCount?: number;
  showOrbits?: boolean;
  useJ2?: boolean;
  tleSources?: Record<string, string> | null;
  catalogSatellites?: SatelliteCatalogEntry[];
  useInstancing?: boolean;
  useWorkerPropagation?: boolean;
  workerLeadSeconds?: number;
  workerCadenceMs?: number;
  maxOrbitLines?: number;
  markerStyle?: string;
  markerPixelSize?: Partial<MarkerPixelSize> | null;
  markerBaseScaleAu?: number | null;
  markerColorOverrides?: MarkerColorOverrides | null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function tleEpochToJulian(epochYearTwoDigits: number, dayOfYearFloat: number): number {
  const twoDigitYear = Number(epochYearTwoDigits);
  const year = twoDigitYear >= 57 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
  const dayWhole = Math.floor(dayOfYearFloat);
  const dayFraction = dayOfYearFloat - dayWhole;
  const startMs = Date.UTC(year, 0, 1, 0, 0, 0, 0);
  const unixMs = startMs + (dayWhole - 1 + dayFraction) * DAY_SECONDS * 1_000;
  return utcJulianDateToTdb(julianDateFromUnixMs(unixMs));
}

function sanitizeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function normalizeCatalogSatellite(entry: SatelliteCatalogEntry, primaryModel: PrimaryModel): NormalizedSatellite | null {
  const name = `${entry.name ?? 'Satellite'}`.trim();
  const id = entry.id ? `${entry.id}` : `sat-${sanitizeId(name)}`;
  const category = `${entry.category ?? 'science'}`;
  const periodHours = Number(entry.periodHours);
  const periodDays = Number(entry.periodDays);
  const altitudeKm = Number(entry.altitudeKm);
  const providedMeanMotionRevDay = typeof entry.meanMotionRevDay === 'number' && Number.isFinite(entry.meanMotionRevDay)
    ? entry.meanMotionRevDay
    : null;
  const providedAKm = typeof entry.aKm === 'number' && Number.isFinite(entry.aKm)
    ? entry.aKm
    : null;

  const meanMotionRevDay = providedMeanMotionRevDay
    ?? (
      Number.isFinite(periodHours)
        ? 24 / periodHours
        : Number.isFinite(periodDays)
          ? 1 / periodDays
          : null
    );

  const aKm = providedAKm
    ?? (
      Number.isFinite(altitudeKm)
        ? primaryModel.equatorialRadiusKm + altitudeKm
        : typeof meanMotionRevDay === 'number'
          ? semimajorAxisFromMeanMotion(meanMotionRevDay, primaryModel.muKm3S2)
          : null
    );

  if (typeof aKm !== 'number' || !Number.isFinite(aKm) || aKm <= 0) {
    return null;
  }

  const resolvedMeanMotion = typeof meanMotionRevDay === 'number' && Number.isFinite(meanMotionRevDay)
    ? meanMotionRevDay
    : meanMotionFromSemimajorAxis(aKm, primaryModel.muKm3S2);

  if (typeof resolvedMeanMotion !== 'number' || !Number.isFinite(resolvedMeanMotion) || resolvedMeanMotion <= 0) {
    return null;
  }

  const eccentricity = typeof entry.e === 'number' && Number.isFinite(entry.e)
    ? Math.max(0, Math.min(0.9999, entry.e))
    : 0;
  const inclinationDeg = typeof entry.iDeg === 'number' && Number.isFinite(entry.iDeg) ? entry.iDeg : 0;
  const ascendingNodeDeg = typeof entry.ascendingNodeDeg === 'number' && Number.isFinite(entry.ascendingNodeDeg)
    ? entry.ascendingNodeDeg
    : 0;
  const argPeriapsisDeg = typeof entry.argPeriapsisDeg === 'number' && Number.isFinite(entry.argPeriapsisDeg)
    ? entry.argPeriapsisDeg
    : 0;
  const meanAnomalyDeg = typeof entry.meanAnomalyDeg === 'number' && Number.isFinite(entry.meanAnomalyDeg)
    ? entry.meanAnomalyDeg
    : 0;

  return {
    id,
    name,
    category,
    epochJd: Number.isFinite(entry.epochJd) ? Number(entry.epochJd) : J2000_JD,
    aKm,
    e: eccentricity,
    iRad: inclinationDeg * DEG_TO_RAD,
    raanRad: ascendingNodeDeg * DEG_TO_RAD,
    argPeriapsisRad: argPeriapsisDeg * DEG_TO_RAD,
    meanAnomalyRad: meanAnomalyDeg * DEG_TO_RAD,
    meanMotionRevDay: resolvedMeanMotion,
    meanMotionRadSec: (resolvedMeanMotion * TWO_PI) / DAY_SECONDS,
    frame: `${entry.frame ?? 'ecliptic'}`.toLowerCase()
  };
}

function parseTleElements(
  name: string,
  line1: string,
  line2: string,
  category: string,
  primaryModel: PrimaryModel
): NormalizedSatellite | null {
  const epochYear = Number(line1.slice(18, 20));
  const epochDay = Number(line1.slice(20, 32));
  const iDeg = Number(line2.slice(8, 16));
  const raanDeg = Number(line2.slice(17, 25));
  const e = Number(`0.${line2.slice(26, 33).trim()}`);
  const argPerigeeDeg = Number(line2.slice(34, 42));
  const meanAnomalyDeg = Number(line2.slice(43, 51));
  const meanMotionRevDay = Number(line2.slice(52, 63));

  if (
    !Number.isFinite(epochYear)
    || !Number.isFinite(epochDay)
    || !Number.isFinite(iDeg)
    || !Number.isFinite(raanDeg)
    || !Number.isFinite(e)
    || !Number.isFinite(argPerigeeDeg)
    || !Number.isFinite(meanAnomalyDeg)
    || !Number.isFinite(meanMotionRevDay)
    || meanMotionRevDay <= 0
  ) {
    return null;
  }

  const meanMotionRadSec = (meanMotionRevDay * TWO_PI) / DAY_SECONDS;
  const aKm = Math.cbrt(primaryModel.muKm3S2 / (meanMotionRadSec * meanMotionRadSec));

  return {
    id: `sat-${sanitizeId(name)}`,
    name,
    category,
    epochJd: tleEpochToJulian(epochYear, epochDay),
    aKm,
    e,
    iRad: iDeg * DEG_TO_RAD,
    raanRad: raanDeg * DEG_TO_RAD,
    argPeriapsisRad: argPerigeeDeg * DEG_TO_RAD,
    meanAnomalyRad: meanAnomalyDeg * DEG_TO_RAD,
    meanMotionRevDay,
    meanMotionRadSec,
    frame: 'equatorial'
  };
}

function parseTleBlock(tleText: string, category: string, primaryModel: PrimaryModel): NormalizedSatellite[] {
  const lines = tleText
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  const satellites: NormalizedSatellite[] = [];

  for (let i = 0; i < lines.length - 2; i += 1) {
    let name = lines[i];
    let line1 = lines[i + 1];
    let line2 = lines[i + 2];

    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      line1 = lines[i];
      line2 = lines[i + 1];
      name = `Satellite ${satellites.length + 1}`;
      i += 1;
    }

    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) {
      continue;
    }

    const parsed = parseTleElements(name, line1, line2, category, primaryModel);
    if (parsed) {
      satellites.push(parsed);
    }

    i += 2;
  }

  return satellites;
}

function fallbackByPrimary(primaryId: string): SatelliteCatalogEntry[] {
  if (primaryId === 'moon') {
    return [
      {
        name: 'LRO (fallback)',
        category: 'science',
        aKm: 1_837.4,
        e: 0.012,
        iDeg: 89.7,
        ascendingNodeDeg: 125,
        argPeriapsisDeg: 80,
        meanAnomalyDeg: 40,
        meanMotionRevDay: 12.7,
        frame: 'ecliptic'
      }
    ];
  }
  if (primaryId === 'mars') {
    return [
      {
        name: 'MRO (fallback)',
        category: 'science',
        aKm: 3_789.5,
        e: 0.01,
        iDeg: 93.0,
        ascendingNodeDeg: 250,
        argPeriapsisDeg: 90,
        meanAnomalyDeg: 35,
        meanMotionRevDay: 11.4,
        frame: 'equatorial'
      }
    ];
  }

  return [
    {
      name: 'ISS (fallback)',
      category: 'leo',
      aKm: 6_788,
      e: 0.00057,
      iDeg: 51.64,
      ascendingNodeDeg: 31.2,
      argPeriapsisDeg: 145.3,
      meanAnomalyDeg: 325.7,
      meanMotionRevDay: 15.49,
      frame: 'equatorial'
    },
    {
      name: 'GOES-16 (fallback)',
      category: 'geo',
      aKm: 42_164,
      e: 0.0002,
      iDeg: 0.02,
      ascendingNodeDeg: 75.3,
      argPeriapsisDeg: 90,
      meanAnomalyDeg: 10,
      meanMotionRevDay: 1.0027,
      frame: 'equatorial'
    },
    {
      name: 'GOES-18 (fallback)',
      category: 'geo',
      aKm: 42_164,
      e: 0.00025,
      iDeg: 0.03,
      ascendingNodeDeg: 95.1,
      argPeriapsisDeg: 85,
      meanAnomalyDeg: 186,
      meanMotionRevDay: 1.0027,
      frame: 'equatorial'
    }
  ];
}

async function fetchTleText(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed TLE fetch (${response.status})`);
  }
  return response.text();
}

function pickEarthSatellites(
  stationSatellites: NormalizedSatellite[],
  geoSatellites: NormalizedSatellite[],
  maxGeoCount: number
): NormalizedSatellite[] {
  const iss = stationSatellites.find((sat: NormalizedSatellite) => sat.name.toLowerCase().includes('iss')) ?? stationSatellites[0] ?? null;

  const geo = geoSatellites
    .filter((sat: NormalizedSatellite) => sat.meanMotionRevDay > 0.95 && sat.meanMotionRevDay < 1.05)
    .sort((a: NormalizedSatellite, b: NormalizedSatellite) => {
      const ecc = a.e - b.e;
      if (Math.abs(ecc) > 1e-9) return ecc;
      return a.iRad - b.iRad;
    })
    .slice(0, maxGeoCount);

  return [
    ...(iss ? [{ ...iss, category: 'leo' }] : []),
    ...geo.map((sat: NormalizedSatellite) => ({ ...sat, category: 'geo' }))
  ];
}

function markerColor(category: string, colorOverrides: MarkerColorOverrides | null = null): string {
  if (colorOverrides && typeof colorOverrides === 'object') {
    if (typeof colorOverrides[category] === 'string') return colorOverrides[category];
    if (typeof colorOverrides.default === 'string') return colorOverrides.default;
  }
  if (category === 'leo') return '#9ce7ff';
  if (category === 'geo') return '#ffc488';
  if (category === 'nrho') return '#b9a2ff';
  if (category === 'relay') return '#ffde98';
  return '#d8dde6';
}

function markerScaleAu(realisticMode: boolean, primaryModel: PrimaryModel, markerBaseScaleAu: number | null = null): number {
  if (typeof markerBaseScaleAu === 'number' && Number.isFinite(markerBaseScaleAu) && markerBaseScaleAu > 0) {
    return markerBaseScaleAu;
  }
  if (!realisticMode) return 0.00062;
  const basedOnPrimary = (primaryModel.equatorialRadiusKm / AU_KM) * 0.03;
  return Math.max(2.2e-7, basedOnPrimary);
}

function normalizeMarkerPixelSize(markerPixelSize: Partial<MarkerPixelSize> | null): MarkerPixelSize | null {
  if (!markerPixelSize || typeof markerPixelSize !== 'object') return null;
  const preferred = Number(markerPixelSize.preferred);
  const min = Number(markerPixelSize.min);
  const max = Number(markerPixelSize.max);
  const resolvedPreferred = Number.isFinite(preferred) && preferred > 0 ? preferred : 2.0;
  const resolvedMin = Number.isFinite(min) && min > 0 ? min : Math.min(1.2, resolvedPreferred);
  const resolvedMax = Number.isFinite(max) && max > 0 ? max : Math.max(2.6, resolvedPreferred);
  if (!Number.isFinite(resolvedPreferred) || resolvedPreferred <= 0) return null;
  return {
    min: Math.min(resolvedMin, resolvedPreferred),
    preferred: resolvedPreferred,
    max: Math.max(resolvedMax, resolvedPreferred)
  };
}

function createSatelliteSpriteTexture(category: string, colorOverrides: MarkerColorOverrides | null = null): CanvasTexture | null {
  const paletteKey = markerColor(category, colorOverrides);
  const cacheKey = `${category}:${paletteKey}`;
  if (SATELLITE_ICON_TEXTURES.has(cacheKey)) {
    return SATELLITE_ICON_TEXTURES.get(cacheKey) ?? null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const tone = new Color(paletteKey);
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;

  // Soft halo that keeps the sprite readable when it becomes 1-2 pixels.
  const halo = ctx.createRadialGradient(cx, cy, 5, cx, cy, 48);
  halo.addColorStop(0, `rgba(${Math.round(tone.r * 255)}, ${Math.round(tone.g * 255)}, ${Math.round(tone.b * 255)}, 0.88)`);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, TWO_PI);
  ctx.fill();

  const busColor = `rgba(${Math.round((0.6 + tone.r * 0.4) * 255)}, ${Math.round((0.6 + tone.g * 0.4) * 255)}, ${Math.round((0.6 + tone.b * 0.4) * 255)}, 0.98)`;
  const panelColor = `rgba(${Math.round((0.35 + tone.r * 0.35) * 255)}, ${Math.round((0.35 + tone.g * 0.35) * 255)}, ${Math.round((0.35 + tone.b * 0.35) * 255)}, 0.9)`;

  // Simple spacecraft icon silhouette (bus + two side panels).
  ctx.fillStyle = panelColor;
  ctx.fillRect(cx - 34, cy - 6, 22, 12);
  ctx.fillRect(cx + 12, cy - 6, 22, 12);
  ctx.fillStyle = busColor;
  ctx.fillRect(cx - 11, cy - 9, 22, 18);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 16);
  ctx.lineTo(cx + 6, cy - 16);
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  SATELLITE_ICON_TEXTURES.set(cacheKey, texture);
  return texture;
}

export class OrbitalSatelliteSystem {
  primaryId: string;
  primaryModel: PrimaryModel;
  maxGeoCount: number;
  showOrbits: boolean;
  useJ2: boolean;
  tleSources: Record<string, string> | null;
  catalogSatellites: SatelliteCatalogEntry[];
  group: Group;
  markerGeometry: SphereGeometry;
  markerStyle: string;
  markerPixelSize: MarkerPixelSize | null;
  markerBaseScaleAu: number | null;
  markerColorOverrides: MarkerColorOverrides | null;
  currentMarkerScaleAu: number;
  satellites: NormalizedSatellite[];
  meshById: Map<string, Mesh | Sprite>;
  meshByIndex: Array<Mesh | Sprite>;
  orbitLineById: Map<string, Line>;
  useInstancing: boolean;
  markerInstancedMesh: InstancedMesh | null;
  markerIndexById: Map<string, number>;
  currentPositionsAu: Float32Array;
  matrixScratch: Matrix4;
  markerColorScratch: Color;
  positionScratch: Vector3;
  markerWorldPositionScratch: Vector3;
  useWorkerPropagation: boolean;
  workerLeadSeconds: number;
  workerCadenceMs: number;
  maxOrbitLines: number;
  worker: Worker | null;
  workerReady: boolean;
  workerBusy: boolean;
  workerSnapshot: SatelliteWorkerSnapshot | null;
  workerLastRequestAtMs: number;
  lastJdSample: number | null;
  lastPerfSampleMs: number | null;
  estimatedJdRate: number;
  initialized: boolean;
  lastError: string | null;
  orbitLinesClamped: boolean;

  constructor({
    primaryId = 'earth',
    maxGeoCount = 28,
    showOrbits = true,
    useJ2 = true,
    tleSources = null,
    catalogSatellites = [],
    useInstancing = primaryId === 'earth',
    useWorkerPropagation = false,
    workerLeadSeconds = 0.4,
    workerCadenceMs = 120,
    maxOrbitLines = 1_200,
    markerStyle = 'sphere',
    markerPixelSize = null,
    markerBaseScaleAu = null,
    markerColorOverrides = null
  }: OrbitalSatelliteSystemOptions = {}) {
    this.primaryId = primaryId;
    this.primaryModel = PRIMARY_MODELS[primaryId] ?? PRIMARY_MODELS.earth;
    this.maxGeoCount = maxGeoCount;
    this.showOrbits = showOrbits;
    this.useJ2 = useJ2;
    this.tleSources = tleSources ?? (primaryId === 'earth' ? DEFAULT_TLE_SOURCES_EARTH : null);
    this.catalogSatellites = Array.isArray(catalogSatellites) ? catalogSatellites : [];

    this.group = new Group();
    this.group.name = `satellite-layer-${primaryId}`;

    this.markerGeometry = new SphereGeometry(1, 10, 8);
    this.markerStyle = `${markerStyle ?? 'sphere'}`.toLowerCase();
    this.markerPixelSize = normalizeMarkerPixelSize(markerPixelSize);
    this.markerBaseScaleAu = Number.isFinite(markerBaseScaleAu) ? markerBaseScaleAu : null;
    this.markerColorOverrides = markerColorOverrides && typeof markerColorOverrides === 'object'
      ? markerColorOverrides
      : null;
    this.currentMarkerScaleAu = markerScaleAu(false, this.primaryModel, this.markerBaseScaleAu);
    this.satellites = [];
    this.meshById = new Map();
    this.meshByIndex = [];
    this.orbitLineById = new Map();

    this.useInstancing = Boolean(useInstancing);
    this.markerInstancedMesh = null;
    this.markerIndexById = new Map();
    this.currentPositionsAu = new Float32Array(0);
    this.matrixScratch = new Matrix4();
    this.markerColorScratch = new Color();
    this.positionScratch = new Vector3();
    this.markerWorldPositionScratch = new Vector3();

    this.useWorkerPropagation = Boolean(useWorkerPropagation);
    this.workerLeadSeconds = Math.max(0.15, Number(workerLeadSeconds) || 0.4);
    this.workerCadenceMs = Math.max(33, Number(workerCadenceMs) || 120);
    this.maxOrbitLines = Math.max(0, Number(maxOrbitLines) || 1_200);

    this.worker = null;
    this.workerReady = false;
    this.workerBusy = false;
    this.workerSnapshot = null;
    this.workerLastRequestAtMs = 0;
    this.lastJdSample = null;
    this.lastPerfSampleMs = null;
    this.estimatedJdRate = 0;

    this.initialized = false;
    this.lastError = null;
    this.orbitLinesClamped = false;
  }

  attachTo(parentNode: Object3D | null | undefined): void {
    if (!parentNode) return;
    parentNode.add(this.group);
  }

  status(): Record<string, unknown> {
    return {
      initialized: this.initialized,
      primaryId: this.primaryId,
      satelliteCount: this.satellites.length,
      lastError: this.lastError,
      useJ2: this.useJ2,
      showOrbits: this.showOrbits,
      useInstancing: this.useInstancing,
      useWorkerPropagation: this.useWorkerPropagation,
      workerReady: this.workerReady,
      orbitLinesClamped: this.orbitLinesClamped,
      markerStyle: this.markerStyle,
      markerPixelSize: this.markerPixelSize
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    let loaded: NormalizedSatellite[] = [];
    try {
      if (this.tleSources && Object.keys(this.tleSources).length > 0) {
        const entries = Object.entries(this.tleSources);
        const texts = await Promise.all(entries.map(([, url]) => fetchTleText(url)));
        const parsedByGroup = texts.map((text, i) => parseTleBlock(text, entries[i][0], this.primaryModel));

        if (this.primaryId === 'earth') {
          const stations = parsedByGroup.find((_, i) => entries[i][0] === 'stations') ?? [];
          const geo = parsedByGroup.find((_, i) => entries[i][0] === 'geo') ?? [];
          loaded = pickEarthSatellites(stations, geo, this.maxGeoCount);
        } else {
          loaded = parsedByGroup.flat();
        }
      }
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.message : String(error);
      loaded = [];
    }

    const catalog = this.catalogSatellites
      .map((entry) => normalizeCatalogSatellite(entry, this.primaryModel))
      .filter((satellite): satellite is NormalizedSatellite => Boolean(satellite));

    const merged = [...loaded, ...catalog];
    const deduped: NormalizedSatellite[] = [];
    const seen = new Set<string>();
    for (const sat of merged) {
      if (seen.has(sat.id)) continue;
      seen.add(sat.id);
      deduped.push(sat);
    }

    this.satellites = deduped;

    if (this.satellites.length === 0) {
      this.satellites = fallbackByPrimary(this.primaryId)
        .map((entry) => normalizeCatalogSatellite(entry, this.primaryModel))
        .filter((satellite): satellite is NormalizedSatellite => Boolean(satellite));
    }

    this.buildSceneObjects();
    if (this.useWorkerPropagation) {
      this.initializeWorker();
    }
    this.initialized = true;
  }

  initializeWorker(): void {
    if (!this.useWorkerPropagation || typeof Worker === 'undefined' || this.worker) {
      return;
    }

    try {
      this.worker = new Worker(new URL('./satellitePropagationWorker.ts', import.meta.url), { type: 'module' });
    } catch (error: unknown) {
      this.lastError = `Satellite worker unavailable: ${error instanceof Error ? error.message : String(error)}`;
      this.useWorkerPropagation = false;
      this.worker = null;
      return;
    }

    this.worker.onmessage = (event: MessageEvent<SatelliteWorkerMessage>) => {
      const message = event?.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'ready') {
        this.workerReady = true;
        this.workerBusy = false;
        return;
      }

      if (message.type === 'snapshot') {
        const count = Number.isFinite(message.count) ? message.count : this.satellites.length;
        const positions0 = message.positions0 instanceof Float32Array
          ? message.positions0
          : new Float32Array(message.positions0 ?? 0);
        const positions1 = message.positions1 instanceof Float32Array
          ? message.positions1
          : new Float32Array(message.positions1 ?? 0);

        if (positions0.length !== count * 3 || positions1.length !== count * 3) {
          this.workerBusy = false;
          return;
        }

        this.workerSnapshot = {
          jd0: Number(message.jd0),
          jd1: Number(message.jd1),
          positions0,
          positions1,
          count
        };
        this.workerBusy = false;
      }
    };

    this.worker.onerror = () => {
      this.lastError = 'Satellite propagation worker failed; reverted to main-thread propagation.';
      this.disableWorker();
    };

    this.worker.postMessage({
      type: 'init',
      primaryId: this.primaryId,
      satellites: this.satellites
    });
  }

  disableWorker(): void {
    if (this.worker) {
      this.worker.terminate();
    }
    this.worker = null;
    this.workerReady = false;
    this.workerBusy = false;
    this.workerSnapshot = null;
    this.useWorkerPropagation = false;
  }

  buildSceneObjects(): void {
    this.group.clear();
    this.meshById.clear();
    this.meshByIndex.length = 0;
    this.orbitLineById.clear();
    this.markerIndexById.clear();
    this.markerInstancedMesh = null;
    this.currentPositionsAu = new Float32Array(this.satellites.length * 3);

    if (this.useInstancing && this.satellites.length > 0) {
      this.buildInstancedMarkers();
    } else {
      this.buildIndividualMarkers();
    }

    const lineCandidates = this.satellites.length > this.maxOrbitLines
      ? this.satellites.slice(0, this.maxOrbitLines)
      : this.satellites;

    this.orbitLinesClamped = lineCandidates.length < this.satellites.length;

    for (const sat of lineCandidates) {
      const orbitLine = this.createOrbitLine(sat);
      orbitLine.visible = this.showOrbits;
      this.group.add(orbitLine);
      this.orbitLineById.set(sat.id, orbitLine);
    }
  }

  buildInstancedMarkers(): void {
    const material = new MeshBasicMaterial({
      color: new Color('#ffffff'),
      vertexColors: true
    });
    const instancedMesh = new InstancedMesh(this.markerGeometry, material, this.satellites.length);
    instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    instancedMesh.frustumCulled = false;

    for (let i = 0; i < this.satellites.length; i += 1) {
      const satellite = this.satellites[i];
      this.markerIndexById.set(satellite.id, i);
      this.currentPositionsAu[i * 3] = 0;
      this.currentPositionsAu[i * 3 + 1] = 0;
      this.currentPositionsAu[i * 3 + 2] = 0;
      this.matrixScratch.makeScale(this.currentMarkerScaleAu, this.currentMarkerScaleAu, this.currentMarkerScaleAu);
      this.matrixScratch.setPosition(0, 0, 0);
      instancedMesh.setMatrixAt(i, this.matrixScratch);
      this.markerColorScratch.set(markerColor(satellite.category, this.markerColorOverrides));
      instancedMesh.setColorAt(i, this.markerColorScratch);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
      instancedMesh.instanceColor.needsUpdate = true;
    }

    this.group.add(instancedMesh);
    this.markerInstancedMesh = instancedMesh;
  }

  buildIndividualMarkers(): void {
    for (let i = 0; i < this.satellites.length; i += 1) {
      const sat = this.satellites[i];
      let marker;
      if (this.markerStyle === 'sprite') {
        const spriteTexture = createSatelliteSpriteTexture(sat.category, this.markerColorOverrides);
        marker = new Sprite(
          new SpriteMaterial({
            map: spriteTexture ?? null,
            color: new Color('#ffffff'),
            transparent: true,
            depthWrite: false
          })
        );
      } else {
        marker = new Mesh(
          this.markerGeometry,
          new MeshBasicMaterial({ color: new Color(markerColor(sat.category, this.markerColorOverrides)) })
        );
      }

      marker.scale.setScalar(this.currentMarkerScaleAu);
      marker.userData.satelliteId = sat.id;
      this.group.add(marker);
      this.meshById.set(sat.id, marker);
      this.meshByIndex[i] = marker;
      this.markerIndexById.set(sat.id, i);
    }
  }

  createOrbitLine(satellite: NormalizedSatellite): Line {
    const segments = satellite.category === 'geo' ? 220 : satellite.category === 'nrho' ? 280 : 180;
    const positions = new Float32Array((segments + 1) * 3);
    const point = new Vector3();
    const periodDays = satellite.meanMotionRevDay > 0 ? 1 / satellite.meanMotionRevDay : 1;

    for (let i = 0; i <= segments; i += 1) {
      const tJd = satellite.epochJd + (periodDays * i) / segments;
      propagateAroundPrimary(satellite, tJd, false, this.primaryModel, point);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    return new Line(
      geometry,
      new LineBasicMaterial({
        color: new Color(markerColor(satellite.category, this.markerColorOverrides)),
        transparent: true,
        opacity: satellite.category === 'geo' ? 0.34 : 0.42
      })
    );
  }

  setVisible(visible: boolean): void {
    this.group.visible = Boolean(visible);
  }

  setOrbitVisibility(visible: boolean): void {
    this.showOrbits = Boolean(visible);
    for (const orbitLine of this.orbitLineById.values()) {
      orbitLine.visible = this.showOrbits;
    }
  }

  setJ2Enabled(enabled: boolean): void {
    this.useJ2 = Boolean(enabled);
  }

  applyScaleMode(realisticMode: boolean): void {
    this.currentMarkerScaleAu = markerScaleAu(Boolean(realisticMode), this.primaryModel, this.markerBaseScaleAu);
    if (this.markerInstancedMesh) {
      this.rebuildInstancedMatricesFromPositions();
      return;
    }
    for (const mesh of this.meshById.values()) {
      mesh.scale.setScalar(this.currentMarkerScaleAu);
    }
  }

  rebuildInstancedMatricesFromPositions(): void {
    if (!this.markerInstancedMesh) return;

    for (let i = 0; i < this.satellites.length; i += 1) {
      const base = i * 3;
      this.matrixScratch.makeScale(this.currentMarkerScaleAu, this.currentMarkerScaleAu, this.currentMarkerScaleAu);
      this.matrixScratch.setPosition(
        this.currentPositionsAu[base],
        this.currentPositionsAu[base + 1],
        this.currentPositionsAu[base + 2]
      );
      this.markerInstancedMesh.setMatrixAt(i, this.matrixScratch);
    }

    this.markerInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  updateJdRateEstimate(jd: number): void {
    const now = nowMs();
    const lastJdSample = this.lastJdSample;
    const lastPerfSampleMs = this.lastPerfSampleMs;
    if (
      typeof lastJdSample === 'number'
      && Number.isFinite(lastJdSample)
      && typeof lastPerfSampleMs === 'number'
      && Number.isFinite(lastPerfSampleMs)
    ) {
      const dtSeconds = Math.max(1e-6, (now - lastPerfSampleMs) / 1_000);
      const rawRate = (jd - lastJdSample) / dtSeconds;
      this.estimatedJdRate = this.estimatedJdRate * 0.75 + rawRate * 0.25;
    }
    this.lastJdSample = jd;
    this.lastPerfSampleMs = now;
  }

  applyWorkerSnapshot(jd: number): boolean {
    if (!this.workerSnapshot) return false;
    const snapshot = this.workerSnapshot;
    if (!Number.isFinite(snapshot.jd0) || !Number.isFinite(snapshot.jd1)) return false;
    if (snapshot.count !== this.satellites.length) return false;

    const span = snapshot.jd1 - snapshot.jd0;
    const alpha = Math.abs(span) < 1e-12 ? 0 : clamp01((jd - snapshot.jd0) / span);

    for (let i = 0; i < this.satellites.length; i += 1) {
      const base = i * 3;
      const x = snapshot.positions0[base] + (snapshot.positions1[base] - snapshot.positions0[base]) * alpha;
      const y = snapshot.positions0[base + 1] + (snapshot.positions1[base + 1] - snapshot.positions0[base + 1]) * alpha;
      const z = snapshot.positions0[base + 2] + (snapshot.positions1[base + 2] - snapshot.positions0[base + 2]) * alpha;
      this.applyMarkerPositionByIndex(i, x, y, z);
    }

    this.flushMarkerPositionUpdates();
    return true;
  }

  shouldRequestWorkerSnapshot(jd: number): boolean {
    if (!this.workerSnapshot) return true;

    const minJd = Math.min(this.workerSnapshot.jd0, this.workerSnapshot.jd1);
    const maxJd = Math.max(this.workerSnapshot.jd0, this.workerSnapshot.jd1);

    if (jd < minJd || jd > maxJd) return true;

    const span = Math.max(1e-10, maxJd - minJd);
    const margin = span * 0.35;
    return jd <= minJd + margin || jd >= maxJd - margin;
  }

  requestWorkerSnapshot(jd: number): void {
    if (!this.worker || !this.workerReady || this.workerBusy) return;

    const now = nowMs();
    if (now - this.workerLastRequestAtMs < this.workerCadenceMs) return;
    if (!this.shouldRequestWorkerSnapshot(jd)) return;

    const speed = Math.abs(this.estimatedJdRate);
    const leadDays = Math.max(2 / DAY_SECONDS, speed * this.workerLeadSeconds);
    const direction = this.estimatedJdRate < -1e-9 ? -1 : 1;

    this.worker.postMessage({
      type: 'snapshot',
      jd0: jd,
      jd1: jd + direction * leadDays,
      applyJ2: this.useJ2
    });

    this.workerBusy = true;
    this.workerLastRequestAtMs = now;
  }

  applyMarkerPositionByIndex(index: number, x: number, y: number, z: number): void {
    const base = index * 3;
    this.currentPositionsAu[base] = x;
    this.currentPositionsAu[base + 1] = y;
    this.currentPositionsAu[base + 2] = z;

    if (this.markerInstancedMesh) {
      this.matrixScratch.makeScale(this.currentMarkerScaleAu, this.currentMarkerScaleAu, this.currentMarkerScaleAu);
      this.matrixScratch.setPosition(x, y, z);
      this.markerInstancedMesh.setMatrixAt(index, this.matrixScratch);
      return;
    }

    const mesh = this.meshByIndex[index];
    if (!mesh) return;
    mesh.position.set(x, y, z);
  }

  flushMarkerPositionUpdates(): void {
    if (!this.markerInstancedMesh) return;
    this.markerInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  applyScreenSpaceMarkerScaling(viewState: SatelliteViewState | null): void {
    if (this.markerInstancedMesh || !this.markerPixelSize) return;
    const camera = viewState?.camera ?? null;
    const viewportHeight = Number(viewState?.viewportHeight ?? 0);
    if (!camera || !Number.isFinite(camera.fov) || viewportHeight <= 0) return;

    const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
    for (const marker of this.meshByIndex) {
      if (!marker) continue;
      marker.getWorldPosition(this.markerWorldPositionScratch);
      const distance = Math.max(1e-9, camera.position.distanceTo(this.markerWorldPositionScratch));
      const worldUnitsPerPixel = (2 * distance * tanHalfFov) / viewportHeight;
      const minScale = worldUnitsPerPixel * this.markerPixelSize.min;
      const maxScale = worldUnitsPerPixel * this.markerPixelSize.max;
      const preferredScale = worldUnitsPerPixel * this.markerPixelSize.preferred;
      marker.scale.setScalar(Math.max(minScale, Math.min(maxScale, preferredScale)));
    }
  }

  update(jd: number, viewState: SatelliteViewState | null = null): void {
    if (!this.initialized) return;

    this.updateJdRateEstimate(jd);

    let usedWorkerSnapshot = false;
    if (this.useWorkerPropagation && this.workerReady) {
      usedWorkerSnapshot = this.applyWorkerSnapshot(jd);
      this.requestWorkerSnapshot(jd);
    }

    if (!usedWorkerSnapshot) {
      for (let i = 0; i < this.satellites.length; i += 1) {
        const satellite = this.satellites[i];
        propagateAroundPrimary(satellite, jd, this.useJ2, this.primaryModel, this.positionScratch);
        this.applyMarkerPositionByIndex(i, this.positionScratch.x, this.positionScratch.y, this.positionScratch.z);
      }
      this.flushMarkerPositionUpdates();
    }

    this.applyScreenSpaceMarkerScaling(viewState);
  }
}
