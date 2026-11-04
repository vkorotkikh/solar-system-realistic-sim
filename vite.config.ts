import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js is one ~533 kB minified module even after tree-shaking (the app
    // uses 48 of its exports; the whole library is 715 kB) and cannot be split
    // further. 550 kB admits that chunk; any chunk growing past it still warns.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        // Splitting does not change first-load bytes: every chunk below is
        // module-preloaded. Long-lived chunks stay cached across deploys of app
        // code and download in parallel.
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.endsWith('/src/data/moons.json')) return 'moon-catalog';
          return undefined;
        },
      },
    },
  },
});
