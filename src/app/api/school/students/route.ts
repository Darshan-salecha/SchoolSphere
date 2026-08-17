import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, paginated, parseBody, parseQuery } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { studentSchema } from '@/lib/validation/schemas';
import { paginationSchema } from '@/lib/validation/common';
import { assertSameSchool } from '@/lib/tenant';
import { assertCanAccessSection, hasSchoolWideAccess, isClassTeacherOf } from '@/lib/scope';
import { findPossibleDuplicates, listStudents, nextRollNumber, requireCurrentYear } from '@/lib/services/students';
import { assertStudentCapacity } from '@/lib/services/plan-limits';
import { recordAudit } from '@/lib/audit';
import { forbidden } from '@/lib/errors';

export const GET = handler(async (req: Request) => {
  const session = await requireSchoolContext('students.view');
  const q = parseQuery(req, paginationSchema.extend({ sectionId: z.string().optional(), status: z.string().optional() }));
  const { rows, total } = await listStudents(session, q);
  return ok(paginated(rows, total, q.page, q.pageSize));
});

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('students.create');
  const input = await parseBody(req, studentSchema);

  const section = assertSameSchool(
    await db.query.sections.findFirst({ where: eq(t.sections.id, input.sectionId) }),
    session.schoolId,
  );
  // Class teachers may enrol into their own class; nobody else may enrol into someone else's.
  if (!hasSchoolWideAccess(session)) {
    await assertCanAccessSection(session, section.id);
    if (!(await isClassTeacherOf(session, section.id))) throw forbidden('Only the class teacher can enrol into this class.');
  }

  await assertStudentCapacity(session.schoolId);
  const year = await requireCurrentYear(session.schoolId);
  const duplicates = await findPossibleDuplicates(session.schoolId, input);
  if (duplicates.some((d) => d.admissionNumber === input.admissionNumber)) {
    return ok({ error: 'A student with that admission number already exists.', duplicates }, { status: 409 });
  }

  const student = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.students)
      .values({
        schoolId: session.schoolId,
        admissionNumber: input.admissionNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ? input.dateOfBirth.toISOString().slice(0, 10) : null,
        gender: input.gender ?? null,
        bloodGroup: input.bloodGroup || null,
        addressLine: input.addressLine || null,
        city: input.city || null,
        admissionDate: (input.admissionDate ?? new Date()).toISOString().slice(0, 10),
        previousSchool: input.previousSchool || null,
        emergencyContactName: input.emergencyContactName || null,
        emergencyContactPhone: input.emergencyContactPhone || null,
      })
      .returning();

    await tx.insert(t.enrollments).values({
      schoolId: session.schoolId,
      studentId: row.id,
      sectionId: section.id,
      academicYearId: year.id,
      rollNumber: input.rollNumber ?? (await nextRollNumber(session.schoolId, section.id)),
    });
    return row;
  });

  await recordAudit({
    session,
    action: 'student.created',
    entity: 'Student',
    entityId: student.id,
    after: { admissionNumber: student.admissionNumber, name: `${student.firstName} ${student.lastName}`, sectionId: section.id },
  });
  return created({ ...student, duplicates });
});
