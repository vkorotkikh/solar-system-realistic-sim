// Load the real module through Vite's SSR loader (no copies, no edits) and probe the base-URL guard.
import { createServer } from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/node_modules/vite/dist/node/index.js';
const server = await createServer({ root: '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1', configFile: false, cacheDir: '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/config/.vite-cache-ssr', server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
const m = await server.ssrLoadModule('/src/frontend/features/solar/solarObservationTexture.ts');
for (const base of ['http://localhost:8042', 'http://localhost:5173', '', '/api']) {
  console.log(JSON.stringify(base).padEnd(26), '->', m.buildAiaProxyTextureUrl(base, 'aia_193', '123'));
}
await server.close();
