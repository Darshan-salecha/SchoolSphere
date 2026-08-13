import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

/** Applies every generated SQL migration in order. Safe to re-run. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const pool = new Pool({ connectionString: url });
  const dir = path.resolve('drizzle');

  await pool.query('CREATE TABLE IF NOT EXISTS __ss_migrations (name text primary key, applied_at timestamptz default now())');
  const applied = new Set((await pool.query('SELECT name FROM __ss_migrations')).rows.map((r) => r.name as string));

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const statement of sql.split('--> statement-breakpoint')) {
        const q = statement.trim();
        if (q) await client.query(q);
      }
      await client.query('INSERT INTO __ss_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  await pool.end();
  console.log('Migrations up to date.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
