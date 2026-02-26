// @ts-nocheck
export const PLANET_VISUAL_PROFILES = {
  earth: {
    id: 'earth',
    shape: {
      useOblateSpheroid: true
    },
    atmosphere: {
      enabled: true,
      shellScale: 1.028,
      color: '#68a9ff',
      sunsetColor: '#ff9f5e'
    },
    clouds: {
      enabled: true,
      shellScale: 1.011,
      baseOpacity: 0.42,
      refreshMinutes: 30,
      provider: {
        id: 'gibs-modis-terra-cloud-fraction',
        wmsEndpoint: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
        layer: 'MODIS_Terra_Cloud_Fraction_Day',
        format: 'image/png',
        tileWidth: 256,
        tileHeight: 256,
        tilesX: 8,
        tilesY: 4,
        canvasSize: 2048,
        // Daily global update product; fetched as frequently as configured.
        timeMode: 'utc-date'
      }
    },
    terrain: {
      displacementScale: 0.0028,
      displacementBias: -0.00135,
      synthSeed: 17,
      textureSize: 1024,
      seaLevel: 0.52
    },
    surfaceData: {
      maps: {
        albedo: 'earth_topobathy_8192',
        relief: 'earth_topobathy_8192',
        waterMask: 'earth_watermask_2048'
      }
    },
    water: {
      enabled: true,
      shellScale: 1.00045,
      color: '#3a6f9c',
      opacity: 0.68,
      roughness: 0.28,
      metalness: 0.08
    },
    lod: {
      // Distance to center in AU at which surface mesh quality is raised.
      thresholdsAu: {
        high: 0.00025,
        medium: 0.0012
      },
      geometry: {
        low: [48, 36],
        medium: [128, 96],
        high: [256, 192]
      }
    },
    orbitalPresetsKm: {
      atmosphere: 35,
      leo: 408,
      geo: 35_786
    },
    orbitGuidePresets: ['leo', 'geo'],
    satelliteLayer: {
      enabled: true,
      primaryId: 'earth',
      maxGeoCount: 28,
      defaultShowOrbits: true,
      defaultUseJ2: true,
      useInstancing: true,
      useWorkerPropagation: true,
      workerLeadSeconds: 0.45,
      workerCadenceMs: 120,
      maxOrbitLines: 800,
      tleSources: {
        stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
        geo: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle'
      }
    }
  },

  moon: {
    id: 'moon',
    shape: {
      useOblateSpheroid: true
    },
    atmosphere: {
      enabled: false
    },
    exosphere: {
      enabled: true,
      shellScale: 1.006,
      intensity: 0.14,
      color: '#acc0db',
      sunsetColor: '#d7e3f4'
    },
    earthshine: {
      enabled: true,
      color: '#d9e3ff',
      maxIntensity: 0.22
    },
    clouds: {
      enabled: false
    },
    dataProviders: {
      elevation: {
        id: 'lola-dem',
        source: 'USGS/LOLA',
        url: 'https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m'
      },
      albedo: {
        id: 'lroc-wac-global-albedo',
        source: 'USGS/LROC WAC',
        url: 'https://astrogeology.usgs.gov/search/map/moon_lro_lroc_wac_global_mosaic_100m'
      }
    },
    terrain: {
      displacementScale: 0.0045,
      displacementBias: -0.0022,
      synthSeed: 43,
      textureSize: 1024,
      mode: 'cratered',
      craterDensity: 0.92
    },
    surfaceData: {
      maps: {
        albedo: 'moon_albedo_lroc_8192',
        relief: 'moon_relief_ldem16_5760'
      }
    },
    lod: {
      thresholdsAu: {
        high: 0.0002,
        medium: 0.0009
      },
      geometry: {
        low: [72, 54],
        medium: [176, 132],
        high: [320, 240]
      }
    },
    orbitalPresetsKm: {
      skim: 15,
      llo: 100,
      nrho: 30_000
    },
    orbitGuidePresets: ['skim', 'llo', 'nrho'],
    satelliteLayer: {
      enabled: true,
      primaryId: 'moon',
      defaultShowOrbits: true,
      defaultUseJ2: false,
      markerStyle: 'sprite',
      markerPixelSize: {
        min: 0.9,
        preferred: 1.4,
        max: 2.1
      },
      markerColorOverrides: {
        science: '#e2e4ea',
        nrho: '#cfd2da',
        relay: '#d9dde4',
        default: '#e0e2e8'
      },
      catalog: [
        {
          name: 'LRO',
          category: 'science',
          aKm: 1_837.4,
          e: 0.01,
          iDeg: 89.7,
          ascendingNodeDeg: 125,
          argPeriapsisDeg: 80,
          meanAnomalyDeg: 40,
          meanMotionRevDay: 12.7,
          frame: 'ecliptic'
        },
        {
          name: 'CAPSTONE',
          category: 'nrho',
          aKm: 37_350,
          e: 0.86,
          iDeg: 90.0,
          ascendingNodeDeg: 40,
          argPeriapsisDeg: 270,
          meanAnomalyDeg: 10,
          meanMotionRevDay: 0.16,
          frame: 'ecliptic'
        },
        {
          name: 'Chandrayaan-2 Orbiter',
          category: 'science',
          aKm: 1_887.4,
          e: 0.02,
          iDeg: 90.2,
          ascendingNodeDeg: 295,
          argPeriapsisDeg: 160,
          meanAnomalyDeg: 210,
          meanMotionRevDay: 12.1,
          frame: 'ecliptic'
        }
      ]
    }
  },

  mars: {
    id: 'mars',
    shape: {
      useOblateSpheroid: true
    },
    atmosphere: {
      enabled: true,
      shellScale: 1.018,
      intensity: 0.72,
      color: '#d3916e',
      sunsetColor: '#f0b58f'
    },
    clouds: {
      enabled: true,
      shellScale: 1.008,
      baseOpacity: 0.24,
      refreshMinutes: 90,
      provider: {
        id: 'mars-mcs-marci-abstraction',
        // Abstraction-only profile target: MCS/MARCI products are consumed via a
        // translation layer when available; fallback remains procedural dust fronts.
        source: 'MCS/MARCI',
        mode: 'proxy'
      },
      fallback: {
        kind: 'procedural-dust-fronts'
      }
    },
    seasonal: {
      polarCaps: {
        enabled: true,
        maxOpacity: 0.46
      }
    },
    terrain: {
      displacementScale: 0.0038,
      displacementBias: -0.0019,
      synthSeed: 29,
      textureSize: 1024,
      mode: 'eolian'
    },
    surfaceData: {
      maps: {
        albedo: 'mars_albedo_usgs_4096',
        relief: 'mars_relief_mola_4096'
      }
    },
    lod: {
      thresholdsAu: {
        high: 0.00018,
        medium: 0.0011
      },
      geometry: {
        low: [48, 36],
        medium: [140, 104],
        high: [260, 196]
      }
    },
    orbitalPresetsKm: {
      atmosphere: 45,
      skim: 25,
      lmo: 400,
      areostationary: 17_000
    },
    orbitGuidePresets: ['atmosphere', 'skim', 'lmo', 'areostationary'],
    satelliteLayer: {
      enabled: true,
      primaryId: 'mars',
      defaultShowOrbits: true,
      defaultUseJ2: true,
      catalog: [
        {
          name: 'MRO',
          category: 'science',
          aKm: 3_789.5,
          e: 0.01,
          iDeg: 93.0,
          ascendingNodeDeg: 250,
          argPeriapsisDeg: 90,
          meanAnomalyDeg: 35,
          meanMotionRevDay: 11.4,
          frame: 'equatorial'
        },
        {
          name: 'MAVEN',
          category: 'science',
          aKm: 6_564.0,
          e: 0.46,
          iDeg: 75.0,
          ascendingNodeDeg: 180,
          argPeriapsisDeg: 120,
          meanAnomalyDeg: 270,
          meanMotionRevDay: 4.5,
          frame: 'equatorial'
        },
        {
          name: 'Odyssey',
          category: 'relay',
          aKm: 3_789.5,
          e: 0.008,
          iDeg: 93.1,
          ascendingNodeDeg: 110,
          argPeriapsisDeg: 200,
          meanAnomalyDeg: 120,
          meanMotionRevDay: 11.5,
          frame: 'equatorial'
        }
      ]
    }
  }
};

export function planetVisualProfile(bodyId) {
  return PLANET_VISUAL_PROFILES[bodyId] ?? null;
}
