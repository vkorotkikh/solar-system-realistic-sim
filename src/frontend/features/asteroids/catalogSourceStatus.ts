import type { Phase1CatalogRejection } from '../../../sim/phase1AsteroidCatalog';

export type AsteroidCatalogSourceState = 'loading' | 'verified' | 'fallback' | 'error';

export interface AsteroidCatalogSourceStatus {
  state: AsteroidCatalogSourceState;
  text: string;
}

interface AsteroidCatalogStatusElement {
  textContent: string | null;
  title: string;
  dataset: DOMStringMap;
}

export function loadingAsteroidCatalogStatus(): AsteroidCatalogSourceStatus {
  return {
    state: 'loading',
    text: 'Asteroids: procedural fallback (catalog verification pending)',
  };
}

export function verifiedAsteroidCatalogStatus(sourceCount: number): AsteroidCatalogSourceStatus {
  const count = Number.isFinite(sourceCount) && sourceCount >= 0
    ? Math.trunc(sourceCount).toLocaleString()
    : 'unknown';
  return {
    state: 'verified',
    text: `Asteroids: verified Phase-1 catalog (${count} rows, SHA-256)`,
  };
}

export function rejectedAsteroidCatalogStatus(
  rejections: readonly Phase1CatalogRejection[]
): AsteroidCatalogSourceStatus {
  const codes = [...new Set(rejections.map(({ code }) => code))];
  const suffix = codes.length > 0 ? codes.join(', ') : 'unspecified-integrity-failure';
  return {
    state: 'fallback',
    text: `Asteroids: procedural fallback (catalog rejected: ${suffix})`,
  };
}

export function failedAsteroidCatalogStatus(): AsteroidCatalogSourceStatus {
  return {
    state: 'error',
    text: 'Asteroids: procedural fallback (catalog load failed)',
  };
}

export function renderAsteroidCatalogSourceStatus(
  element: AsteroidCatalogStatusElement | null | undefined,
  status: AsteroidCatalogSourceStatus
): void {
  if (!element) return;
  element.textContent = status.text;
  element.title = status.text;
  element.dataset.catalogState = status.state;
}
