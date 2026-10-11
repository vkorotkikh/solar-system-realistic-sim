import { defineConfig } from 'vitest/config';

// Product test discovery is deliberate: only the source tree and the repository
// scripts. Audit archives under agent-notes/ carry their own copied suites,
// which must stay on disk as evidence without being collected by `npm test`
// (tracker SCN-026).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['node_modules/**', 'dist/**', 'agent-notes/**', 'my-notes/**'],
  },
});
