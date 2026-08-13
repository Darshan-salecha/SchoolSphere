import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { schoolSettingsSchema } from '@/lib/validation/schemas';
import { recordAudit } from '@/lib/audit';

export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.settings.manage');
  const input = await parseBody(req, schoolSettingsSchema);

  const before = await db.query.schoolSettings.findFirst({ where: eq(t.schoolSettings.schoolId, session.schoolId) });
  const [after] = before
    ? await db.update(t.schoolSettings).set(input).where(eq(t.schoolSettings.schoolId, session.schoolId)).returning()
    : await db.insert(t.schoolSettings).values({ schoolId: session.schoolId, ...input }).returning();

  await recordAudit({ session, action: 'settings.updated', entity: 'SchoolSettings', entityId: after.id, before, after });
  return ok(after);
});
