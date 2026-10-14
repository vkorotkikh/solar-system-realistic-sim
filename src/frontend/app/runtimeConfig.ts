export interface RuntimeUiConfig {
  backendOrigin: string;
  uiWidth: number | null; uiHeight: number | null; renderScale: number; maxPixelRatio: number;
}
export interface RuntimeConfigCreateArgs { search?: string; env?: Record<string, string | undefined>; pageOrigin?: string }
export function resolveBackendOrigin(configured: string | undefined, pageOrigin: string): string {
  const raw = configured?.trim() || pageOrigin;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('VITE_BACKEND_ORIGIN must be an absolute HTTP(S) origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_BACKEND_ORIGIN must contain only an HTTP(S) origin, without credentials, path, query or fragment');
  }
  if (pageOrigin.startsWith('https:') && url.protocol !== 'https:') throw new Error('HTTPS pages require an HTTPS backend origin');
  return url.origin;
}
export function createRuntimeUiConfig({ search = typeof window === 'undefined' ? '' : window.location.search,
  env = import.meta.env, pageOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin }: RuntimeConfigCreateArgs = {}): RuntimeUiConfig {
  const params = new URLSearchParams(search);
  function number(query: string, environment: string, fallback: number | null, min: number, max: number) {
    const raw = params.get(query) ?? env[environment];
    if (raw === undefined || raw === null || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${query} must be between ${min} and ${max}`);
    return value;
  }
  return {
    backendOrigin: resolveBackendOrigin(env.VITE_BACKEND_ORIGIN, pageOrigin),
    uiWidth: number('uiWidth', 'VITE_UI_WIDTH', null, 160, 10_000),
    uiHeight: number('uiHeight', 'VITE_UI_HEIGHT', null, 160, 10_000),
    renderScale: number('renderScale', 'VITE_RENDER_SCALE', 1, .5, 3)!,
    maxPixelRatio: number('maxPixelRatio', 'VITE_MAX_PIXEL_RATIO', 2, 1, 4)!,
  };
}
export function renderPixelRatio(config: RuntimeUiConfig, devicePixelRatio: number) {
  return Math.min(devicePixelRatio || 1, config.maxPixelRatio) * config.renderScale;
}
