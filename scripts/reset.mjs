#!/usr/bin/env node
/**
 * Drops every table and recreates an empty schema.
 *
 * Exists because `db:seed` is intentionally not idempotent — it asserts unique
 * admission numbers and phone numbers, so running it twice should fail loudly
 * rather than half-write a second copy of a school. This is the supported way
 * to get back to a clean demo.
 *
 * Refuses to run unless DEMO_MODE is on or --force is passed, because dropping
 * a production schema by muscle memory is exactly the accident worth blocking.
 */
import 'dotenv/config';
import pg from 'pg';

const force = process.argv.includes('--force');
if (process.env.DEMO_MODE !== 'true' && !force) {
  console.error('Refusing to reset: DEMO_MODE is not "true".');
  console.error('If you really mean it, run: node scripts/reset.mjs --force');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  max: 1,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  console.log('Schema dropped and recreated. Now run: npm run db:push && npm run db:seed');
} catch (err) {
  console.error('Reset failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await pool.end();
}
