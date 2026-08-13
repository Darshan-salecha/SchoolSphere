import { headers } from 'next/headers';
import { db } from '@/db';
import * as t from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';

/** Append-only record of every sensitive operation. Never exposed for editing. */
export async function recordAudit(input: {
  session?: SessionUser | null;
  schoolId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      userAgent = h.get('user-agent')?.slice(0, 250) ?? null;
    } catch {
      // outside a request scope (seed scripts, jobs)
    }

    await db.insert(t.auditLogs).values({
      schoolId: input.schoolId ?? input.session?.schoolId ?? null,
      userId: input.session?.id ?? null,
      actorName: input.session?.name ?? 'system',
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: (input.before ?? null) as never,
      after: (input.after ?? null) as never,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error('[audit] failed to record', input.action, err);
  }
}
