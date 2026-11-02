(globalThis as any).self = globalThis;
(globalThis as any).__posted = [];
(globalThis as any).postMessage = (m: any) => (globalThis as any).__posted.push(m);
