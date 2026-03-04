import { validatePackedCatalogRoundTrip100k, type RoundTripTestResult } from './asteroidCatalogLoader';

export function runPackedCatalogRoundTripTest100k(): RoundTripTestResult {
  return validatePackedCatalogRoundTrip100k();
}
