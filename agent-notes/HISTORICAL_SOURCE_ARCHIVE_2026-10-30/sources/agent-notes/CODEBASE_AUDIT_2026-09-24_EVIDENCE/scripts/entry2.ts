import { validatePackedCatalogRoundTrip100k, readAsteroidCatalogBinary } from '@wt/src/data/asteroidCatalogLoader';
import { propagateKeplerOrbit } from '@wt/src/sim/orbitMath';
import { Vector3 } from 'three';
(globalThis as any).__A = { validatePackedCatalogRoundTrip100k, readAsteroidCatalogBinary, propagateKeplerOrbit, Vector3 };
