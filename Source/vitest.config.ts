import { defineConfig } from 'vitest/config';

// One Vitest run for the whole monorepo; each project keeps its own config.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
  },
});
