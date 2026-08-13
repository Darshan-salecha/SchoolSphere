import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { subjectSchema } from '@/lib/validation/schemas';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';

export const GET = handler(async () => {
  const session = await requireSchoolContext();
  const rows = await db
    .select()
    .from(t.subjects)
    .where(eq(t.subjects.schoolId, session.schoolId))
    .orderBy(asc(t.subjects.name));
  return ok({ data: rows });
});

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.subjects.manage');
  const input = await parseBody(req, subjectSchema);
  if (input.classId) {
    assertSameSchool(await db.query.classLevels.findFirst({ where: eq(t.classLevels.id, input.classId) }), session.schoolId);
  }
  const [row] = await db
    .insert(t.subjects)
    .values({
      schoolId: session.schoolId,
      name: input.name,
      code: input.code.toUpperCase(),
      classId: input.classId || null,
      isElective: input.isElective,
    })
    .returning();
  await recordAudit({ session, action: 'subject.created', entity: 'Subject', entityId: row.id, after: row });
  return created(row);
});
