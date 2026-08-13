import { sql } from 'drizzle-orm';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness probe for the container, load balancer or uptime monitor.
 * Returns 503 while the database is unreachable so a rolling deploy waits rather
 * than sending traffic to an instance that cannot serve it. Deliberately terse —
 * it must not leak version or connection details to the public internet.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
