import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { announcementSchema } from '@/lib/validation/schemas';
import { notify } from '@/lib/services/notify';
import { recordAudit } from '@/lib/audit';

/** Publishes an announcement and fans it out to the selected audience. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('announcements.create');
  const input = await parseBody(req, announcementSchema);

  // Teachers may only address their own sections.
  const sectionIds = input.sectionIds.filter(Boolean);
  if (sectionIds.length) {
    const owned = await db
      .select({ id: t.sections.id })
      .from(t.sections)
      .where(and(eq(t.sections.schoolId, session.schoolId), inArray(t.sections.id, sectionIds)));
    if (owned.length !== sectionIds.length) sectionIds.length = 0;
  }

  const [row] = await db
    .insert(t.announcements)
    .values({
      schoolId: session.schoolId,
      title: input.title,
      body: input.body,
      type: input.type,
      audience: input.audience,
      sectionIds,
      isPinned: input.isPinned,
      createdById: session.id,
    })
    .returning();

  // Resolve recipients: everyone in the chosen roles, narrowed to sections if given.
  let recipientIds: string[] = [];
  if (sectionIds.length) {
    const students = await db
      .select({ studentId: t.enrollments.studentId })
      .from(t.enrollments)
      .where(and(eq(t.enrollments.schoolId, session.schoolId), inArray(t.enrollments.sectionId, sectionIds), eq(t.enrollments.isCurrent, true)));
    const studentIds = students.map((s) => s.studentId);
    if (input.audience.includes('PARENT') && studentIds.length) {
      const links = await db
        .select({ userId: t.parents.userId })
        .from(t.studentParents)
        .innerJoin(t.parents, eq(t.parents.id, t.studentParents.parentId))
        .where(inArray(t.studentParents.studentId, studentIds));
      recipientIds.push(...links.map((l) => l.userId));
    }
    if (input.audience.includes('STUDENT') && studentIds.length) {
      const rows = await db
        .select({ userId: t.students.userId })
        .from(t.students)
        .where(inArray(t.students.id, studentIds));
      recipientIds.push(...rows.map((r) => r.userId).filter((x): x is string => Boolean(x)));
    }
  } else {
    const rows = await db
      .select({ userId: t.userRoles.userId })
      .from(t.userRoles)
      .innerJoin(t.users, eq(t.users.id, t.userRoles.userId))
      .where(
        and(
          eq(t.users.schoolId, session.schoolId),
          isNull(t.users.deletedAt),
          or(...input.audience.map((role) => eq(t.userRoles.role, role as 'PARENT'))),
        ),
      );
    recipientIds = rows.map((r) => r.userId);
  }

  await notify({
    schoolId: session.schoolId,
    userIds: recipientIds,
    type: 'ANNOUNCEMENT',
    title: input.title,
    body: input.body.slice(0, 200),
    link: '/parent/announcements',
    priority: input.type === 'EMERGENCY' ? 'EMERGENCY' : 'NORMAL',
    channels: input.channels,
  });

  await recordAudit({ session, action: 'announcement.published', entity: 'Announcement', entityId: row.id, after: { title: row.title, recipients: recipientIds.length } });
  return created({ ...row, recipients: recipientIds.length });
});
