import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { classSchema } from '@/lib/validation/schemas';
import { recordAudit } from '@/lib/audit';

export const GET = handler(async () => {
  const session = await requireSchoolContext('school.classes.manage', 'students.view');
  const rows = await db
    .select()
    .from(t.classLevels)
    .where(eq(t.classLevels.schoolId, session.schoolId))
    .orderBy(asc(t.classLevels.level));
  return ok({ data: rows });
});

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.classes.manage');
  const input = await parseBody(req, classSchema);
  const [row] = await db.insert(t.classLevels).values({ schoolId: session.schoolId, ...input }).returning();
  await recordAudit({ session, action: 'class.created', entity: 'ClassLevel', entityId: row.id, after: row });
  return created(row);
});
