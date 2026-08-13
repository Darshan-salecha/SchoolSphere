import { Pool } from 'pg';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ssPool?: Pool; __ssDb?: Db };

function build(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and start Postgres with `npm run db:up`.');
  }
  globalForDb.__ssPool ??= new Pool({ connectionString, max: 10 });
  return drizzlePg(globalForDb.__ssPool, { schema });
}

/** Tests inject a PGlite-backed instance so the whole suite runs without Docker. */
export function setDb(instance: Db) {
  globalForDb.__ssDb = instance;
}

export function getDb(): Db {
  globalForDb.__ssDb ??= build();
  return globalForDb.__ssDb;
}

/** Lazy proxy — nothing connects until the first query, so `next build` stays clean. */
export const db = new Proxy({} as Db, {
  get: (_t, prop) => Reflect.get(getDb() as object, prop, getDb()),
}) as Db;

export { schema };
