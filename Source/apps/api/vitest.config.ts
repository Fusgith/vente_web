import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Database suites share one test database: files run one after the other.
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
  },
});
