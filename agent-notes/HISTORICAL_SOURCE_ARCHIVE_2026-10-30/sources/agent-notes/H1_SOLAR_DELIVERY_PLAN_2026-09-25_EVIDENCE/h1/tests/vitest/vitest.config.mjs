// Runs the H-1 draft specs (kept outside the shared worktree) against the worktree's src at HEAD.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  cacheDir: '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/tests/vitest/.vite-cache',
  root: '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/tests/vitest',
  server: { fs: { allow: ['/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/tests', '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1'] } },
  test: {
    include: ['*.h1.test.ts'],
    globals: true,
    environment: 'node',
  },
});
