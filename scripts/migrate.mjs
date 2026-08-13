#!/usr/bin/env node
/**
 * Production migrator.
 *
 * Deliberately plain ESM with `pg` as its only import, so it runs in any image
 * that has the runtime dependencies — no TypeScript, no drizzle-kit, no tsx.
 *
 * Applies every ./drizzle/*.sql file in filename order, exactly once, each in
 * its own transaction. Safe to run on every deploy: already-applied files are
 * skipped, and a failure rolls back rather than leaving a half-migrated schema.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');
const CONNECT_RETRIES = Number(process.env.MIGRATE_RETRIES ?? 15);
const RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Postgres often accepts connections a moment after the container reports up. */
async function connectWithRetry(pool) {
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt === CONNECT_RETRIES) throw err;
      console.log(`  waiting for the database… (${attempt}/${CONNECT_RETRIES})`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  if (!existsSync(MIGRATIONS_DIR)) {
    console.error(`No migrations directory at ${MIGRATIONS_DIR}. Run "npm run db:generate" first.`);
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    max: 1,
    // Managed Postgres (RDS, Neon, Supabase) terminates TLS with its own CA.
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await connectWithRetry(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS __ss_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query('SELECT name FROM __ss_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // drizzle-kit separates statements with this marker.
      for (const statement of sql.split('--> statement-breakpoint')) {
        const trimmed = statement.trim();
        if (trimmed) await client.query(trimmed);
      }
      await client.query('INSERT INTO __ss_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  applied ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`\nMigration ${file} failed and was rolled back.`);
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log(count ? `Migrations complete (${count} applied).` : 'Database already up to date.');
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
