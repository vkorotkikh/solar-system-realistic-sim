// Out-of-tree Vite config used ONLY for the H-1 config-deploy investigation.
// It never touches tracked files: `root` points at the shared worktree and all
// behaviour changes are applied in-memory by a transform plugin.
//
// Env knobs (all optional):
//   H1_PROXY=1                 enable server.proxy (preview.proxy inherits it)
//   H1_PROXY_KEY=/solar/       proxy context key (try '/solar' to see the /solar-systems collision)
//   H1_PROXY_TARGET=http://127.0.0.1:8074
//   H1_BASE=origin|empty|keep  rewrite main.ts backendBaseUrl(): window.location.origin, '' or unchanged
//   H1_TIMEOUT_MS=20000        rewrite sunController's timeoutMs: 2_600
//   H1_XFWD=1                  proxy adds X-Forwarded-For
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../wt-h1');

const proxyOn = process.env.H1_PROXY === '1';
const proxyKey = process.env.H1_PROXY_KEY || '/solar/';
const proxyTarget = process.env.H1_PROXY_TARGET || 'http://127.0.0.1:8074';
const baseMode = process.env.H1_BASE || 'keep';
const timeoutMs = process.env.H1_TIMEOUT_MS || '';

function h1Rewrite() {
  return {
    name: 'h1-config-rewrite',
    enforce: 'pre',
    transform(code, id) {
      const clean = id.split('?')[0];
      if (clean.endsWith('/src/main.ts') && baseMode !== 'keep') {
        const needle = 'return `${protocol}://${host}:${DEFAULT_BACKEND_PORT}`;';
        if (!code.includes(needle)) throw new Error('h1: backendBaseUrl pattern not found');
        const repl = baseMode === 'empty' ? "return '';" : 'return window.location.origin;';
        return code.replace(needle, repl);
      }
      if (clean.endsWith('/src/sunController.ts') && timeoutMs) {
        const needle = 'timeoutMs: 2_600';
        if (!code.includes(needle)) throw new Error('h1: timeoutMs pattern not found');
        return code.replace(needle, `timeoutMs: ${Number(timeoutMs)}`);
      }
      return null;
    },
  };
}

const proxy = proxyOn
  ? {
      [proxyKey]: {
        target: proxyTarget,
        changeOrigin: false,
        xfwd: process.env.H1_XFWD === '1',
        configure(p) {
          p.on('error', (err, req) => console.log(`[h1-proxy] error ${req?.url}: ${err?.code || err?.message}`));
          p.on('proxyRes', (res, req) => console.log(`[h1-proxy] ${res.statusCode} ${req.url?.slice(0, 80)}`));
          p.on('proxyReq', (proxyReq, req) => console.log(`[h1-proxy-req] ${req.url?.slice(0, 40)} origin=${proxyReq.getHeader('origin') ?? '-'} host=${proxyReq.getHeader('host')} xff=${proxyReq.getHeader('x-forwarded-for') ?? '-'}`));
        },
      },
    }
  : undefined;

export default {
  root: ROOT,
  cacheDir: resolve(here, '.vite-cache'),
  logLevel: 'info',
  clearScreen: false,
  plugins: [h1Rewrite()],
  server: { port: 5184, strictPort: true, proxy },
  preview: { port: 4184, strictPort: true },
  build: { outDir: resolve(here, process.env.H1_OUTDIR || 'dist-baseline'), emptyOutDir: true },
};
