import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { parseCsv } from '@/lib/csv';
import { normalisePhone } from '@/lib/utils';
import { requireCurrentYear } from '@/lib/services/students';
import { recordAudit } from '@/lib/audit';
import { hasSchoolWideAccess } from '@/lib/scope';
import { forbidden } from '@/lib/errors';
import { assertStudentCapacity } from '@/lib/services/plan-limits';

const bodySchema = z.object({ csv: z.string().min(1, 'Upload a CSV file'), commit: z.boolean().default(false) });

type RowResult = {
  line: number;
  admissionNumber: string;
  name: string;
  section: string;
  guardian: string;
  status: 'ready' | 'duplicate' | 'error';
  message?: string;
};

/**
 * Two-pass import: the first call validates and returns a preview, the second
 * commits. Nothing is written until `commit` is true, and the whole commit runs
 * in one transaction so a bad row cannot leave a half-imported class.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('students.create');
  if (!hasSchoolWideAccess(session)) throw forbidden('Only school administrators can run a bulk import.');

  const { csv, commit } = await parseBody(req, bodySchema);
  const { rows } = parseCsv(csv);
  const year = await requireCurrentYear(session.schoolId);

  const classes = await db.select().from(t.classLevels).where(eq(t.classLevels.schoolId, session.schoolId));
  const sections = await db
    .select()
    .from(t.sections)
    .where(and(eq(t.sections.schoolId, session.schoolId), eq(t.sections.academicYearId, year.id)));
  const existing = await db
    .select({ admissionNumber: t.students.admissionNumber })
    .from(t.students)
    .where(and(eq(t.students.schoolId, session.schoolId), isNull(t.students.deletedAt)));
  const taken = new Set(existing.map((e) => e.admissionNumber));

  const results: RowResult[] = [];
  const valid: { row: Record<string, string>; sectionId: string }[] = [];

  rows.forEach((row, i) => {
    const line = i + 2;
    const name = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim();
    const label = `${row.className ?? ''}-${row.sectionName ?? ''}`;
    const base = { line, admissionNumber: row.admissionNumber ?? '', name, section: label, guardian: row.guardianName ?? '' };

    if (!row.admissionNumber || !row.firstName || !row.lastName) {
      results.push({ ...base, status: 'error', message: 'Admission number, first name and last name are required.' });
      return;
    }
    if (taken.has(row.admissionNumber)) {
      results.push({ ...base, status: 'duplicate', message: 'A student with this admission number already exists.' });
      return;
    }
    const cls = classes.find((c) => c.name.toLowerCase() === (row.className ?? '').toLowerCase());
    const section = cls
      ? sections.find((s) => s.classId === cls.id && s.name.toLowerCase() === (row.sectionName ?? '').toLowerCase())
      : undefined;
    if (!section) {
      results.push({ ...base, status: 'error', message: `No section "${label}" exists for the current academic year.` });
      return;
    }
    if (row.guardianPhone && normalisePhone(row.guardianPhone).length !== 10) {
      results.push({ ...base, status: 'error', message: 'Guardian phone must be 10 digits.' });
      return;
    }

    taken.add(row.admissionNumber);
    valid.push({ row, sectionId: section.id });
    results.push({ ...base, status: 'ready' });
  });

  const summary = {
    total: rows.length,
    ready: results.filter((r) => r.status === 'ready').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    errors: results.filter((r) => r.status === 'error').length,
  };

  if (!commit) return ok({ preview: true, summary, results });

  // Capacity is checked against the whole batch, not row by row.
  await assertStudentCapacity(session.schoolId, valid.length);
  if (!valid.length) return ok({ imported: 0, summary, results });

  await db.transaction(async (tx) => {
    for (const { row, sectionId } of valid) {
      const [student] = await tx
        .insert(t.students)
        .values({
          schoolId: session.schoolId,
          admissionNumber: row.admissionNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          gender: (['MALE', 'FEMALE', 'OTHER'].includes(row.gender) ? row.gender : null) as 'MALE' | null,
          dateOfBirth: row.dateOfBirth || null,
          bloodGroup: row.bloodGroup || null,
          addressLine: row.addressLine || null,
          city: row.city || null,
          admissionDate: new Date().toISOString().slice(0, 10),
        })
        .returning();

      await tx.insert(t.enrollments).values({
        schoolId: session.schoolId,
        studentId: student.id,
        sectionId,
        academicYearId: year.id,
        rollNumber: row.rollNumber ? Number(row.rollNumber) : null,
      });

      if (row.guardianName && row.guardianPhone) {
        const phone = normalisePhone(row.guardianPhone);
        let parent = await tx.query.parents.findFirst({
          where: and(eq(t.parents.schoolId, session.schoolId), eq(t.parents.phone, phone)),
        });
        if (!parent) {
          const [user] = await tx
            .insert(t.users)
            .values({ schoolId: session.schoolId, name: row.guardianName, phone })
            .returning();
          await tx.insert(t.userRoles).values({ userId: user.id, role: 'PARENT' });
          [parent] = await tx.insert(t.parents).values({ schoolId: session.schoolId, userId: user.id, phone }).returning();
        }
        await tx
          .insert(t.studentParents)
          .values({
            schoolId: session.schoolId,
            studentId: student.id,
            parentId: parent.id,
            relation: (['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'].includes(row.guardianRelation) ? row.guardianRelation : 'GUARDIAN') as 'GUARDIAN',
            isPrimary: true,
          })
          .onConflictDoNothing();
      }
    }
  });

  await recordAudit({ session, action: 'students.imported', entity: 'Student', after: summary });
  return ok({ imported: valid.length, summary, results });
});
