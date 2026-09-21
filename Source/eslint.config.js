import { baseConfig, reactConfig } from '@vente-web/config/eslint';

export default [
  { ignores: ['**/dist/**', '**/dev-dist/**', '**/coverage/**', '**/node_modules/**'] },
  ...baseConfig,
  ...reactConfig(['apps/web/**/*.{ts,tsx}']),
];
