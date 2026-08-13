import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';

/** Everything the student portal reads is anchored to the signed-in student's own row. */
export async function studentContext(session: SessionUser & { schoolId: string }) {
  const student = await db.query.students.findFirst({
    where: and(eq(t.students.id, session.studentId!), eq(t.students.schoolId, session.schoolId)),
    with: { enrollments: { where: eq(t.enrollments.isCurrent, true), with: { section: { with: { class: true } } } } },
  });
  return { student, enrollment: student?.enrollments[0] };
}
