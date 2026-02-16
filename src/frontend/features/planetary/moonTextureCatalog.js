function normalizeMoonToken(value) {
  return `${value ?? ''}`.trim().toLowerCase();
}

export function moonTextureKey(parentId, moonName) {
  return `${normalizeMoonToken(parentId)}:${normalizeMoonToken(moonName)}`;
}

export const CURATED_MOON_TEXTURE_CATALOG = Object.freeze([
  {
    parentId: 'mars',
    moonName: 'Phobos',
    assetFile: 'moon_mars_phobos_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/85290c2c-7524-44ba-9251-61ea69fcd9dd/resource/876ae3aa-ac7b-434c-86f4-a2e50cc9826d/download/phobos_viking_mosaic_dlrcontrol_1024.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Phobos Viking Global Mosaic 5m',
      productPage: 'https://astrogeology.usgs.gov/search/map/phobos_viking_global_mosaic_5m',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  },
  {
    parentId: 'mars',
    moonName: 'Deimos',
    assetFile: 'moon_mars_deimos_solarviews_1440.jpg',
    downloadUrl: 'https://www.solarviews.com/raw/mars/deimoscyl2.jpg',
    source: {
      provider: 'Solarviews',
      dataset: 'Deimos cylindrical map (Viking-derived)',
      productPage: 'https://www.solarviews.com/eng/deimos.htm',
      credit: 'Solarviews / Viking-era source imagery',
      license: 'Unspecified by provider; verify for redistribution'
    }
  },
  {
    parentId: 'jupiter',
    moonName: 'Europa',
    assetFile: 'moon_jupiter_europa_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/4080036f-afc5-422e-abe9-1c0c8e4f98ea/resource/3647e7b3-425e-4dcf-951b-cc4a22fb0129/download/europa_voyager_galileossi_global_mosaic_500m_1024.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Europa Voyager - Galileo SSI Global Mosaic 500m',
      productPage: 'https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  },
  {
    parentId: 'jupiter',
    moonName: 'Ganymede',
    assetFile: 'moon_jupiter_ganymede_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/57cad6e2-ed52-4b99-9d44-afbb9def6450/resource/1d52d4a5-bc78-4ac1-a7d0-8d5254ebf1a8/download/ganymede_voyager_galileossi_global_mosaic_1024.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Ganymede Voyager - Galileo SSI Global Mosaic 1km',
      productPage: 'https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_global_mosaic_1km',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  },
  {
    parentId: 'jupiter',
    moonName: 'Callisto',
    assetFile: 'moon_jupiter_callisto_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/a80abd68-7ed9-440e-829a-76376779164f/resource/ac628525-cb1c-4742-928b-5a0a60f372cd/download/callisto_voyager_galileossi_global_mosaic_1024.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Callisto Galileo/Voyager Global Mosaic 1km',
      productPage: 'https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  },
  {
    parentId: 'saturn',
    moonName: 'Enceladus',
    assetFile: 'moon_saturn_enceladus_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/30bff65e-56bb-4fd1-bd04-edd9bc2e77d0/resource/19ba2e14-9ceb-45e6-8cc8-e784e36ed4f0/download/full.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Enceladus Cassini Global Mosaic 110m',
      productPage: 'https://astrogeology.usgs.gov/search/map/enceladus_cassini_global_mosaic_110m',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  },
  {
    parentId: 'saturn',
    moonName: 'Tethys',
    assetFile: 'moon_saturn_tethys_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/e40296c1-b4bf-46d8-86af-4b6cf0301b0c/resource/36d40203-d9b3-447e-9004-c3dc100bde04/download/full.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Tethys Cassini Global Mosaic 293m',
      productPage: 'https://astrogeology.usgs.gov/search/map/tethys_cassini_global_mosaic_293m',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  },
  {
    parentId: 'saturn',
    moonName: 'Dione',
    assetFile: 'moon_saturn_dione_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/acb98ae6-ec50-42df-9a74-142d177bbe6d/resource/8a6a8ada-42e1-4b92-b13e-c63493133efc/download/full.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Dione Cassini - Voyager Global Mosaic 154m',
      productPage: 'https://astrogeology.usgs.gov/search/map/dione_cassini_voyager_global_mosaic_154m',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  },
  {
    parentId: 'saturn',
    moonName: 'Rhea',
    assetFile: 'moon_saturn_rhea_usgs_1024.jpg',
    downloadUrl: 'https://astrogeology.usgs.gov/ckan/dataset/22bc1015-d9c9-4212-86c3-e42061b204d4/resource/77fa77f8-6d6b-4072-9360-17138caa6e7d/download/full.jpg',
    source: {
      provider: 'USGS Astrogeology',
      dataset: 'Rhea Cassini - Voyager Global Mosaic 417m',
      productPage: 'https://astrogeology.usgs.gov/search/map/rhea_cassini_voyager_global_mosaic_417m',
      credit: 'NASA/USGS',
      license: 'Public domain'
    }
  }
].map((entry) => {
  const key = moonTextureKey(entry.parentId, entry.moonName);
  return Object.freeze({
    ...entry,
    key,
    publicPath: `/textures/moons/${entry.assetFile}`
  });
}));

const CATALOG_BY_KEY = new Map(CURATED_MOON_TEXTURE_CATALOG.map((entry) => [entry.key, entry]));

export function moonTextureCatalogEntryForKey(key) {
  return CATALOG_BY_KEY.get(`${key ?? ''}`.toLowerCase()) ?? null;
}

export function moonTextureCatalogEntryForBody(body) {
  if (!body) return null;
  const key = moonTextureKey(body.parentId, body.name ?? body.id);
  return moonTextureCatalogEntryForKey(key);
}
