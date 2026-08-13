import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { setDb, type Db } from '@/db';

/**
 * Spins up a real Postgres (PGlite, in-process) and applies the generated
 * migrations. Lets the suite exercise genuine SQL — constraints, cascades and
 * all — without needing Docker in CI.
 */
export async function createTestDb() {
  const client = new PGlite();
  const dir = path.resolve('drizzle');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const q = statement.trim();
      if (q) await client.exec(q);
    }
  }
  const db = drizzle(client, { schema }) as unknown as Db;
  setDb(db);
  return { db, client };
}
