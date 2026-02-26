// @ts-nocheck
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function toIsoDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tileBoundsLatLon(x, y, tilesX, tilesY) {
  const lonMin = -180 + (360 * x) / tilesX;
  const lonMax = -180 + (360 * (x + 1)) / tilesX;
  const latMax = 90 - (180 * y) / tilesY;
  const latMin = 90 - (180 * (y + 1)) / tilesY;
  return { lonMin, lonMax, latMin, latMax };
}

function wmsUrl(provider, bounds, timeKey) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: provider.layer,
    STYLES: '',
    FORMAT: provider.format ?? 'image/png',
    TRANSPARENT: 'true',
    WIDTH: `${provider.tileWidth ?? 256}`,
    HEIGHT: `${provider.tileHeight ?? 256}`,
    CRS: 'EPSG:4326',
    // WMS 1.3.0 axis order for EPSG:4326 is lat,lon.
    BBOX: `${bounds.latMin},${bounds.lonMin},${bounds.latMax},${bounds.lonMax}`,
    TIME: timeKey
  });
  return `${provider.wmsEndpoint}?${params.toString()}`;
}

function configureTexture(texture) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}

function closeBitmapIfPossible(bitmap) {
  if (!bitmap || typeof bitmap.close !== 'function') return;
  try {
    bitmap.close();
  } catch {
    // Ignore browser-specific close errors.
  }
}

export class PlanetCloudDataPipeline {
  constructor({ provider, fallbackTexture = null }) {
    this.provider = provider;
    this.fallbackTexture = fallbackTexture;

    this.canvasSize = clamp(Number(provider.canvasSize ?? 2048), 256, 8192);
    this.tilesX = clamp(Number(provider.tilesX ?? 8), 1, 64);
    this.tilesY = clamp(Number(provider.tilesY ?? 4), 1, 64);
    this.refreshIntervalMs = clamp(Number(provider.refreshMinutes ?? 30), 5, 360) * 60_000;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasSize;
    this.canvas.height = this.canvasSize;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new CanvasTexture(this.canvas);
    configureTexture(this.texture);

    this.tileCache = new Map();
    this.cacheOrder = [];
    this.maxCacheEntries = 512;

    this.lastRefreshMs = 0;
    this.lastSuccessMs = 0;
    this.lastError = null;
    this.refreshPromise = null;

    this.hasLiveData = false;

    if (this.fallbackTexture?.image) {
      this.ctx.clearRect(0, 0, this.canvasSize, this.canvasSize);
      this.ctx.drawImage(this.fallbackTexture.image, 0, 0, this.canvasSize, this.canvasSize);
      this.texture.needsUpdate = true;
    }
  }

  shouldRefresh(nowMs = Date.now()) {
    if (this.refreshPromise) return false;
    if (!this.lastRefreshMs) return true;
    return nowMs - this.lastRefreshMs >= this.refreshIntervalMs;
  }

  status() {
    return {
      providerId: this.provider.id,
      hasLiveData: this.hasLiveData,
      lastRefreshMs: this.lastRefreshMs,
      lastSuccessMs: this.lastSuccessMs,
      lastError: this.lastError
    };
  }

  async maybeRefresh(now = new Date(), force = false) {
    const nowMs = now.getTime();
    if (!force && !this.shouldRefresh(nowMs)) {
      return false;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.lastRefreshMs = nowMs;
    this.refreshPromise = this.refresh(now)
      .catch((error) => {
        this.lastError = error?.message ?? String(error);
        return false;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  buildTimeKey(now) {
    const mode = `${this.provider.timeMode ?? 'utc-date'}`.toLowerCase();
    if (mode === 'utc-hour') {
      const z = new Date(now);
      z.setUTCMinutes(0, 0, 0);
      return z.toISOString().slice(0, 13) + ':00:00Z';
    }
    return toIsoDateUtc(now);
  }

  async refresh(now = new Date()) {
    const timeKey = this.buildTimeKey(now);
    const tasks = [];

    for (let y = 0; y < this.tilesY; y += 1) {
      for (let x = 0; x < this.tilesX; x += 1) {
        const bounds = tileBoundsLatLon(x, y, this.tilesX, this.tilesY);
        const url = wmsUrl(this.provider, bounds, timeKey);
        tasks.push(this.fetchTileBitmap(url).then((bitmap) => ({ x, y, bitmap })));
      }
    }

    const results = await Promise.allSettled(tasks);

    let loaded = 0;
    const tileWidth = this.canvasSize / this.tilesX;
    const tileHeight = this.canvasSize / this.tilesY;

    for (const entry of results) {
      if (entry.status !== 'fulfilled' || !entry.value?.bitmap) continue;
      const { x, y, bitmap } = entry.value;
      const drawX = Math.round(x * tileWidth);
      const drawY = Math.round(y * tileHeight);
      this.ctx.drawImage(bitmap, drawX, drawY, Math.ceil(tileWidth), Math.ceil(tileHeight));
      loaded += 1;
    }

    if (loaded === 0) {
      return false;
    }

    this.texture.needsUpdate = true;
    this.lastSuccessMs = Date.now();
    this.hasLiveData = true;
    this.lastError = null;
    return true;
  }

  async fetchTileBitmap(url) {
    const cached = this.tileCache.get(url);
    if (cached) {
      return cached;
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Cloud tile request failed (${response.status})`);
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    this.putCache(url, bitmap);
    return bitmap;
  }

  putCache(url, bitmap) {
    const existing = this.tileCache.get(url);
    if (existing && existing !== bitmap) {
      closeBitmapIfPossible(existing);
    }

    this.tileCache.set(url, bitmap);
    if (!existing) {
      this.cacheOrder.push(url);
    }

    while (this.cacheOrder.length > this.maxCacheEntries) {
      const key = this.cacheOrder.shift();
      if (!key) continue;
      const evicted = this.tileCache.get(key);
      this.tileCache.delete(key);
      closeBitmapIfPossible(evicted);
    }
  }
}
