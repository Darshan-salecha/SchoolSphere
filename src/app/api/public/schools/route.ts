import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok } from '@/lib/api';

/** Minimal public directory used by the parent OTP sign-in screen. */
export const GET = handler(async () => {
  const data = await db
    .select({ id: t.schools.id, name: t.schools.name, code: t.schools.code, city: t.schools.city })
    .from(t.schools)
    .where(and(eq(t.schools.status, 'ACTIVE'), isNull(t.schools.deletedAt)))
    .orderBy(asc(t.schools.name))
    .limit(200);
  return ok({ data });
});
