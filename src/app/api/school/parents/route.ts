import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { parentLinkSchema } from '@/lib/validation/schemas';
import { assertCanViewStudent, hasSchoolWideAccess, isClassTeacherOf } from '@/lib/scope';
import { recordAudit } from '@/lib/audit';
import { conflict, forbidden } from '@/lib/errors';

/**
 * Enrols a guardian's phone number against a student. This is the only way a
 * parent account comes into existence — arbitrary numbers can never self-register.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('parents.manage');
  const input = await parseBody(req, parentLinkSchema);

  const student = await assertCanViewStudent(session, input.studentId);
  if (!hasSchoolWideAccess(session)) {
    const sectionId = student.enrollments[0]?.sectionId;
    if (!sectionId || !(await isClassTeacherOf(session, sectionId))) {
      throw forbidden('Only the class teacher or a school admin can link guardians.');
    }
  }

  const result = await db.transaction(async (tx) => {
    let parent = await tx.query.parents.findFirst({
      where: and(eq(t.parents.schoolId, session.schoolId), eq(t.parents.phone, input.phone)),
    });

    if (!parent) {
      const [user] = await tx
        .insert(t.users)
        .values({
          schoolId: session.schoolId,
          name: input.name,
          phone: input.phone,
          email: input.email || null,
        })
        .returning();
      await tx.insert(t.userRoles).values({ userId: user.id, role: 'PARENT' });
      [parent] = await tx
        .insert(t.parents)
        .values({
          schoolId: session.schoolId,
          userId: user.id,
          phone: input.phone,
          email: input.email || null,
          occupation: input.occupation || null,
        })
        .returning();
    }

    const existing = await tx.query.studentParents.findFirst({
      where: and(eq(t.studentParents.studentId, input.studentId), eq(t.studentParents.parentId, parent.id)),
    });
    if (existing) throw conflict('That guardian is already linked to this student.');

    const [link] = await tx
      .insert(t.studentParents)
      .values({
        schoolId: session.schoolId,
        studentId: input.studentId,
        parentId: parent.id,
        relation: input.relation,
        access: input.access,
        isPrimary: input.isPrimary,
      })
      .returning();
    return { parent, link };
  });

  await recordAudit({
    session,
    action: 'parent.linked',
    entity: 'StudentParent',
    entityId: result.link.id,
    after: { studentId: input.studentId, phone: input.phone, relation: input.relation },
  });
  return created(result.link);
});
