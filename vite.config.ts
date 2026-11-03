import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js is a single ~533 kB minified module that cannot be split further.
    // Every app chunk stays under Vite's 500 kB default; this limit only admits
    // the vendor chunk, so app growth beyond it still warns.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        // Long-lived chunks change far less often than app code, so returning
        // visitors keep them cached across deploys; they also download in parallel.
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.endsWith('/src/data/moons.json')) return 'moon-catalog';
          return undefined;
        },
      },
    },
  },
});
