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
];
