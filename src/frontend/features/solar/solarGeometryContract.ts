import type { SolarPhysicsStatePayload } from './solarPhysicsClient';
import { solarVectorToSurfaceLocal, type SolarFrameContext } from './solarFrame';

export const SOLAR_GEOMETRY_LAYERS = ['pfss', 'loops', 'spots', 'parker', 'cme', 'coronal_holes'] as const;
export type SolarGeometryLayer = typeof SOLAR_GEOMETRY_LAYERS[number];
export type SolarLayerFrames = Partial<Record<SolarGeometryLayer, SolarFrameContext>>;
type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function frameContract(value: unknown, epoch: number): SolarFrameContext | null {
  const f = record(value);
  const schema = record(f?.schema);
  if (!f || schema?.name !== 'solar_geometry_frame' || schema.version !== 1
      || f.frame !== 'SOLAR_EQUATORIAL_J2000' || f.reference_frame !== 'IAU_SUN_AT_J2000'
      || f.reference_epoch_jd_tdb !== 2451545 || f.epoch_jd_tdb !== epoch
      || f.jd_time_scale !== 'TDB' || f.origin !== 'SUN_CENTER' || f.north_axis !== '+Z'
      || f.handedness !== 'right' || f.length_unit !== 'solar_radius'
      || f.direction_unit !== 'unit_vector' || f.rotation_state !== 'already_evolved'
      || (f.rendering_eligible !== undefined && f.rendering_eligible !== true)
      || f.source_kind !== 'synthetic' || f.calibration_status !== 'unvalidated') return null;
  return { inputFrame: 'SOLAR_EQUATORIAL_J2000', jdTdb: epoch };
}

function vector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3
    && value.every(v => typeof v === 'number' && Number.isFinite(v))
    && Math.hypot(...value) > 1e-12;
}

function arcs(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(item => {
    const line = record(item);
    return line && Array.isArray(line.arc) && line.arc.length >= 2 && line.arc.every(vector)
      && ['base_dir', 'paired_dir', 'tangent_dir', 'binormal_dir'].every(
        key => line[key] === undefined || vector(line[key])
      );
  });
}

/** Fail closed per layer. A frame tag is not an observed-calibration certificate. */
export function validatedSolarLayerFrames(state: SolarPhysicsStatePayload | null): SolarLayerFrames {
  if (!state || state.effective_forcing !== 'synthetic' || state.jd_time_scale !== 'TDB'
      || !Number.isFinite(state.epoch_jd_tdb)) return {};
  const declared = record(state.geometry_frames);
  const accepted: SolarLayerFrames = {};
  for (const layer of SOLAR_GEOMETRY_LAYERS) {
    const context = frameContract(declared?.[layer], state.epoch_jd_tdb);
    if (!context) continue;
    if (layer === 'pfss') {
      const pfss = record(state.pfss_field_lines);
      if (pfss?.source !== 'synthetic' || !frameContract(pfss.geometry_frame, state.epoch_jd_tdb)
          || !arcs(pfss.lines)) continue;
    } else if (layer === 'parker') {
      if (!arcs(record(state.heliosphere?.parker_spiral)?.lines)) continue;
    } else if (layer === 'coronal_holes') {
      if (record(state.coronal_holes)?.source !== 'synthetic') continue;
      const holes = state.coronal_holes?.holes;
      if (!Array.isArray(holes) || !holes.every(value => {
        const h = record(value);
        return h && [h.center_lat_rad, h.center_lon_rad, h.extent_lat_rad, h.extent_lon_rad]
          .every(v => typeof v === 'number' && Number.isFinite(v));
      })) continue;
    } else if (!arcs(state.corona?.features)) continue;
    accepted[layer] = context;
  }
  return accepted;
}

/** Copy coordinate fields; never mutate the accepted backend snapshot. */
export function solarFeaturesInSurfaceFrame(
  state: SolarPhysicsStatePayload | null, context: SolarFrameContext | undefined
): SolarPhysicsStatePayload | null {
  if (!state || !context) return null;
  const convert = (value: unknown) => vector(value)
    ? solarVectorToSurfaceLocal(value, context.inputFrame, context.jdTdb).toArray() : value;
  return {
    ...state,
    corona: { ...state.corona, features: state.corona?.features?.map(feature => ({
      ...feature,
      base_dir: convert(feature.base_dir), paired_dir: convert(feature.paired_dir),
      tangent_dir: convert(feature.tangent_dir), binormal_dir: convert(feature.binormal_dir),
      arc: Array.isArray(feature.arc) ? feature.arc.map(convert) : feature.arc
    })) }
  };
}

/** Flare meshes use -Z longitude; the surface shader uses +Z longitude. */
export function solarFlareParamsInSurfaceFrame(params: number[]): number[] {
  const converted = [...params];
  for (let i = 0; i + 3 < params.length; i += 4) {
    converted[i] = -params[i];
  }
  return converted;
}

export function solarHolesInSurfaceFrame(state: SolarPhysicsStatePayload | null, context: SolarFrameContext | undefined) {
  return state?.coronal_holes && context ? {
    ...state.coronal_holes,
    holes: state.coronal_holes.holes?.map(h => {
      const lon = Number(h.center_lon_rad), lat = Number(h.center_lat_rad);
      const local = solarVectorToSurfaceLocal(
        [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)],
        context.inputFrame, context.jdTdb
      );
      return { ...h, center_lon_rad: Math.atan2(local.z, local.x), center_lat_rad: Math.asin(local.y) };
    })
  } : undefined;
}
