import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, paginated, parseBody, parseQuery } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { teacherSchema } from '@/lib/validation/schemas';
import { paginationSchema, skipTake } from '@/lib/validation/common';
import { hashPassword } from '@/lib/auth/password';
import { assertSameSchool } from '@/lib/tenant';
import { conflict } from '@/lib/errors';
import { assertTeacherCapacity } from '@/lib/services/plan-limits';
import { recordAudit } from '@/lib/audit';

export const GET = handler(async (req: Request) => {
  const session = await requireSchoolContext('teachers.view');
  const q = parseQuery(req, paginationSchema);

  const where = and(
    eq(t.teachers.schoolId, session.schoolId),
    isNull(t.teachers.deletedAt),
    q.q ? or(ilike(t.users.name, `%${q.q}%`), ilike(t.teachers.employeeId, `%${q.q}%`)) : undefined,
  );

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(t.teachers)
    .innerJoin(t.users, eq(t.users.id, t.teachers.userId))
    .where(where);

  const rows = await db
    .select({
      id: t.teachers.id,
      employeeId: t.teachers.employeeId,
      designation: t.teachers.designation,
      qualification: t.teachers.qualification,
      status: t.teachers.status,
      name: t.users.name,
      email: t.users.email,
      phone: t.users.phone,
    })
    .from(t.teachers)
    .innerJoin(t.users, eq(t.users.id, t.teachers.userId))
    .where(where)
    .orderBy(desc(t.teachers.createdAt))
    .limit(q.pageSize)
    .offset(skipTake(q).skip);

  return ok(paginated(rows, total, q.page, q.pageSize));
});

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('teachers.manage');
  const input = await parseBody(req, teacherSchema);

  await assertTeacherCapacity(session.schoolId);

  const email = input.email.toLowerCase();
  if (await db.query.users.findFirst({ where: eq(t.users.email, email) })) {
    throw conflict('That email address is already registered.');
  }
  for (const subjectId of input.subjectIds) {
    assertSameSchool(await db.query.subjects.findFirst({ where: eq(t.subjects.id, subjectId) }), session.schoolId);
  }

  const passwordHash = await hashPassword(input.password ?? 'Password123!');

  const teacher = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(t.users)
      .values({ schoolId: session.schoolId, name: input.name, email, phone: input.phone, passwordHash })
      .returning();
    await tx.insert(t.userRoles).values({ userId: user.id, role: 'TEACHER' });
    if (input.isPrincipal) await tx.insert(t.userRoles).values({ userId: user.id, role: 'PRINCIPAL' });

    const [row] = await tx
      .insert(t.teachers)
      .values({
        schoolId: session.schoolId,
        userId: user.id,
        employeeId: input.employeeId,
        qualification: input.qualification || null,
        designation: input.designation || null,
        joiningDate: input.joiningDate ? input.joiningDate.toISOString().slice(0, 10) : null,
        gender: input.gender ?? null,
      })
      .returning();

    if (input.subjectIds.length) {
      await tx.insert(t.teacherSubjects).values(
        input.subjectIds.map((subjectId) => ({ schoolId: session.schoolId, teacherId: row.id, subjectId })),
      );
    }
    return row;
  });

  await recordAudit({ session, action: 'teacher.created', entity: 'Teacher', entityId: teacher.id, after: { employeeId: teacher.employeeId, name: input.name } });
  return created(teacher);
});
