import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgresql://schoolsphere:schoolsphere@localhost:5432/schoolsphere' },
  strict: true,
} satisfies Config;
