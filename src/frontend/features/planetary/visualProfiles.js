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
      displacementScale: 0.00135,
      displacementBias: -0.00035,
      synthSeed: 17,
      textureSize: 1024
    },
    lod: {
      // Distance to center in AU at which surface mesh quality is raised.
      thresholdsAu: {
        high: 0.00025,
        medium: 0.0012
      },
      geometry: {
        low: [48, 36],
        medium: [96, 72],
        high: [192, 144]
      }
    },
    orbitalPresetsKm: {
      atmosphere: 35,
      leo: 408,
      geo: 35_786
    },
    satelliteLayer: {
      enabled: true,
      maxGeoCount: 28,
      defaultShowOrbits: true,
      defaultUseJ2: true
    }
  },

  // Placeholder profile for upcoming phase.
  moon: {
    id: 'moon',
    shape: {
      useOblateSpheroid: true
    },
    atmosphere: {
      enabled: false
    },
    clouds: {
      enabled: false
    },
    terrain: {
      displacementScale: 0.0018,
      displacementBias: -0.00025,
      synthSeed: 43,
      textureSize: 1024
    },
    lod: {
      thresholdsAu: {
        high: 0.00009,
        medium: 0.00045
      },
      geometry: {
        low: [40, 30],
        medium: [88, 66],
        high: [172, 132]
      }
    },
    satelliteLayer: {
      enabled: false
    }
  },

  // Placeholder profile for upcoming phase.
  mars: {
    id: 'mars',
    shape: {
      useOblateSpheroid: true
    },
    atmosphere: {
      enabled: true,
      shellScale: 1.018,
      color: '#d3916e',
      sunsetColor: '#f0b58f'
    },
    clouds: {
      enabled: true,
      shellScale: 1.008,
      baseOpacity: 0.24,
      refreshMinutes: 90
    },
    terrain: {
      displacementScale: 0.0024,
      displacementBias: -0.00055,
      synthSeed: 29,
      textureSize: 1024
    },
    lod: {
      thresholdsAu: {
        high: 0.00012,
        medium: 0.0008
      },
      geometry: {
        low: [48, 36],
        medium: [104, 76],
        high: [184, 136]
      }
    },
    satelliteLayer: {
      enabled: false
    }
  }
};

export function planetVisualProfile(bodyId) {
  return PLANET_VISUAL_PROFILES[bodyId] ?? null;
}
