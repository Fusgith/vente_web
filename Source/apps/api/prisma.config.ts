import { config as loadDotenv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// The Prisma CLI runs from apps/api but the single .env lives at the monorepo root
// (Source/.env, never committed — see Source/.env.example).
loadDotenv({ path: new URL('../../.env', import.meta.url), quiet: true });

// `env()` throws when the variable is missing, yet `prisma generate` never connects:
// a fresh clone or the CI typecheck must be able to generate the client without a database.
const connects = !process.argv.includes('generate');

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(connects ? { datasource: { url: env('DATABASE_URL') } } : {}),
});
