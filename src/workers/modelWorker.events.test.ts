import { afterEach, expect, it, vi } from 'vitest';
import type { ModelWorkerInboundMessage, ModelWorkerStateMessage } from './modelWorkerContract';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('SCN-023: worker state bytes are invariant under legacy presentation input', async () => {
  const posted: unknown[] = [];
  const worker = { onmessage: null as ((event: { data: ModelWorkerInboundMessage }) => void) | null,
    postMessage: (message: unknown) => posted.push(message) };
  vi.stubGlobal('self', worker);
  await import('./modelWorker');
  const send = (data: ModelWorkerInboundMessage) => worker.onmessage!({ data });
  send({ type: 'init', sequence: 0, simStartJd: 2451545, catalog: { bodies: [
    { id: 'sun', sourceIndex: 0, orbit: null },
    { id: 'earth', sourceIndex: 1, parentId: 'sun', orbit: { epochJd: 2451545, aAu: 1, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 } }
  ] } });
  send({ type: 'tick', sequence: 1, simState: { julianDate: 2451546, stepMs: 100 } });
  send({ type: 'tick', sequence: 2, simState: { julianDate: 2451546, stepMs: 100,
    metricState: { direction: [1, 0, 0], timeSec: 1, energyErg: 1e90, sourceDistanceCm: 2.998e10, smbhMassG: 1e30 } } });
  const plain = posted[1] as ModelWorkerStateMessage;
  const decorated = posted[2] as ModelWorkerStateMessage;
  expect(decorated.bodies).toEqual(plain.bodies);
  expect(decorated.availability).toEqual(plain.availability);
});
