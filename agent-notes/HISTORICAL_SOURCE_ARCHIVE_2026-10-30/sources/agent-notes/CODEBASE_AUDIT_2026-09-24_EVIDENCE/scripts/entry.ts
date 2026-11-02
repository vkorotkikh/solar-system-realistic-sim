import './shim';
import '@wt/src/workers/modelWorker';
import { createSolarSystemCatalog, resolveMoonSecularRates } from '@wt/src/sim/catalog';
import { propagateKeplerOrbit, resolveKeplerOrbitAtElapsedDays, solveKepler, solveKeplerFast } from '@wt/src/sim/orbitMath';
import { SolarSystemModel } from '@wt/src/sim/solarSystemModel';
import { buildModelWorkerCatalog, buildCatalogIndexContract } from '@wt/src/workers/modelWorkerContract';
import { generateKuiperBelt, propagateKBOPositions } from '@wt/src/sim/kuiperBelt';
import { generateAsteroidBelt } from '@wt/src/sim/asteroidBelt';
import { currentJulianDate, julianDateFromUnixMs } from '@wt/src/constants';
import { Vector3 } from 'three';
(globalThis as any).__H = { createSolarSystemCatalog, resolveMoonSecularRates, propagateKeplerOrbit,
  resolveKeplerOrbitAtElapsedDays, solveKepler, solveKeplerFast, SolarSystemModel, buildModelWorkerCatalog,
  buildCatalogIndexContract, generateKuiperBelt, propagateKBOPositions, generateAsteroidBelt,
  currentJulianDate, julianDateFromUnixMs, Vector3 };
