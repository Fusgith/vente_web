import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Database suites share one test database: files run one after the other.
    fileParallelism: false,
    // Emptying that database (TRUNCATE … CASCADE, one new file per table) takes some 5 s on a
    // Docker Desktop disk: a scene then logs in a handful of users. 10 s was too short.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globalSetup: ['test/global-setup.ts'],
  },
});
