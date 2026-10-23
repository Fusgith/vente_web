import { baseConfig, reactConfig } from '@vente-web/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/generated/**',
    ],
  },
  ...baseConfig,
  ...reactConfig(['apps/web/**/*.{ts,tsx}']),
  // The seed is a CLI script: reporting on stdout is its job.
  { files: ['apps/api/prisma/**/*.ts'], rules: { 'no-console': 'off' } },
  // The push service worker (T-033e) is a classic script the browser runs in its own scope.
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { self: 'readonly' } },
  },
  // `pnpm dist` (ADR-0006) and the shop's scripts (T-080, T-081) print for whoever runs them.
  { files: ['scripts/**/*.mjs', 'infra/windows/*.mjs'], rules: { 'no-console': 'off' } },
];
