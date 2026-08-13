import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { sectionSchema } from '@/lib/validation/schemas';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';
import { badRequest } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.classes.manage');
  const input = await parseBody(req, sectionSchema);

  // Ids arriving from the client are re-checked against this tenant before use.
  assertSameSchool(await db.query.classLevels.findFirst({ where: eq(t.classLevels.id, input.classId) }), session.schoolId);
  assertSameSchool(
    await db.query.academicYears.findFirst({ where: eq(t.academicYears.id, input.academicYearId) }),
    session.schoolId,
  );
  if (input.classTeacherId) {
    assertSameSchool(await db.query.teachers.findFirst({ where: eq(t.teachers.id, input.classTeacherId) }), session.schoolId);
  }

  const row = await db.transaction(async (tx) => {
    const [section] = await tx
      .insert(t.sections)
      .values({
        schoolId: session.schoolId,
        classId: input.classId,
        academicYearId: input.academicYearId,
        name: input.name.toUpperCase(),
        capacity: input.capacity,
        roomNumber: input.roomNumber || null,
        classTeacherId: input.classTeacherId || null,
      })
      .returning();

    // The class teacher gets section-wide rights immediately.
    if (input.classTeacherId) {
      await tx
        .insert(t.teacherAssignments)
        .values({
          schoolId: session.schoolId,
          teacherId: input.classTeacherId,
          sectionId: section.id,
          subjectId: null,
          isClassTeacher: true,
        })
        .onConflictDoNothing();
    }
    return section;
  });

  await recordAudit({ session, action: 'section.created', entity: 'Section', entityId: row.id, after: row });
  return created(row);
});

export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.classes.manage');
  const body = (await req.json()) as { id?: string; classTeacherId?: string | null; capacity?: number; roomNumber?: string };
  if (!body.id) throw badRequest('Section is required.');

  const before = assertSameSchool(
    await db.query.sections.findFirst({ where: eq(t.sections.id, body.id) }),
    session.schoolId,
  );

  if (body.classTeacherId) {
    assertSameSchool(await db.query.teachers.findFirst({ where: eq(t.teachers.id, body.classTeacherId) }), session.schoolId);
  }

  const [after] = await db
    .update(t.sections)
    .set({
      classTeacherId: body.classTeacherId === undefined ? before.classTeacherId : body.classTeacherId || null,
      capacity: body.capacity ?? before.capacity,
      roomNumber: body.roomNumber ?? before.roomNumber,
    })
    .where(eq(t.sections.id, body.id))
    .returning();

  if (body.classTeacherId) {
    await db
      .insert(t.teacherAssignments)
      .values({
        schoolId: session.schoolId,
        teacherId: body.classTeacherId,
        sectionId: after.id,
        subjectId: null,
        isClassTeacher: true,
      })
      .onConflictDoNothing();
    // The previous class teacher keeps subject access but loses section-wide rights.
    if (before.classTeacherId && before.classTeacherId !== body.classTeacherId) {
      await db
        .update(t.teacherAssignments)
        .set({ isClassTeacher: false })
        .where(
          and(
            eq(t.teacherAssignments.sectionId, after.id),
            eq(t.teacherAssignments.teacherId, before.classTeacherId),
          ),
        );
    }
  }

  await recordAudit({ session, action: 'section.updated', entity: 'Section', entityId: after.id, before, after });
  return ok(after);
});
