import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { forbidden, notFound } from '@/lib/errors';
import { assertCanViewStudent, hasSchoolWideAccess } from '@/lib/scope';
import { notify } from '@/lib/services/notify';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Parent–teacher messaging.
 *
 * A thread is always *about a student*: the student is what authorises both
 * participants to be in the conversation, which is why there is no open-ended
 * inbox. Personal phone numbers are never exposed — everything goes through the
 * thread, which is the whole point of having one.
 */

/** Either participant may read a thread; nobody else may, including other staff. */
export async function assertCanAccessThread(session: SessionUser & { schoolId: string }, threadId: string) {
  const thread = await db.query.messageThreads.findFirst({
    where: and(eq(t.messageThreads.id, threadId), eq(t.messageThreads.schoolId, session.schoolId)),
    with: { student: { columns: { id: true, firstName: true, lastName: true } } },
  });
  if (!thread) throw notFound('That conversation could not be found.');

  const isParticipant =
    (session.parentId && thread.parentId === session.parentId) || thread.staffUserId === session.id;

  // A school admin can audit any thread; a teacher cannot read one they are not in.
  if (!isParticipant && !hasSchoolWideAccess(session)) {
    throw forbidden('You are not part of that conversation.');
  }
  return thread;
}

/** Threads visible to the caller, newest activity first. */
export async function listThreads(session: SessionUser & { schoolId: string }) {
  const where = session.parentId
    ? and(eq(t.messageThreads.schoolId, session.schoolId), eq(t.messageThreads.parentId, session.parentId))
    : hasSchoolWideAccess(session)
      ? eq(t.messageThreads.schoolId, session.schoolId)
      : and(eq(t.messageThreads.schoolId, session.schoolId), eq(t.messageThreads.staffUserId, session.id));

  const threads = await db.query.messageThreads.findMany({
    where,
    with: {
      student: { columns: { id: true, firstName: true, lastName: true } },
      parent: { with: { user: { columns: { name: true } } } },
      staffUser: { columns: { id: true, name: true } },
    },
    orderBy: desc(t.messageThreads.lastMessageAt),
    limit: 100,
  });
  if (!threads.length) return [];

  // Unread counts in one grouped query rather than N+1.
  const counts = await db
    .select({ threadId: t.messages.threadId, unread: sql<number>`count(*)::int` })
    .from(t.messages)
    .where(
      and(
        inArray(t.messages.threadId, threads.map((x) => x.id)),
        isNull(t.messages.readAt),
        // Your own messages are never "unread" to you.
        sql`${t.messages.senderUserId} <> ${session.id}`,
      ),
    )
    .groupBy(t.messages.threadId);
  const unreadMap = new Map(counts.map((c) => [c.threadId, Number(c.unread)]));

  return threads.map((thread) => ({ ...thread, unread: unreadMap.get(thread.id) ?? 0 }));
}

/**
 * Opens a conversation. A parent may only start one about their own child, and
 * the staff member defaults to that child's class teacher.
 */
export async function startThread(input: {
  session: SessionUser & { schoolId: string };
  studentId: string;
  staffUserId?: string;
  subject: string;
  body: string;
}) {
  const { session, studentId, subject, body } = input;
  await assertCanViewStudent(session, studentId);

  let staffUserId = input.staffUserId;
  let parentId: string;

  if (session.parentId) {
    parentId = session.parentId;
    if (!staffUserId) {
      // Default recipient: the class teacher of the child's current section.
      const enrollment = await db.query.enrollments.findFirst({
        where: and(eq(t.enrollments.studentId, studentId), eq(t.enrollments.isCurrent, true)),
        with: { section: { with: { classTeacher: { with: { user: { columns: { id: true } } } } } } },
      });
      staffUserId = enrollment?.section.classTeacher?.user.id;
    }
    if (!staffUserId) throw forbidden('No class teacher is assigned yet. Please contact the school office.');
  } else {
    // Staff-initiated: address the student's primary guardian.
    const link = await db.query.studentParents.findFirst({
      where: and(eq(t.studentParents.schoolId, session.schoolId), eq(t.studentParents.studentId, studentId)),
      orderBy: desc(t.studentParents.isPrimary),
    });
    if (!link) throw forbidden('That student has no guardian linked yet.');
    parentId = link.parentId;
    staffUserId = session.id;
  }

  // Verify the staff recipient really belongs to this school.
  const staff = await db.query.users.findFirst({
    where: and(eq(t.users.id, staffUserId), eq(t.users.schoolId, session.schoolId)),
    columns: { id: true, name: true },
  });
  if (!staff) throw forbidden('That member of staff is not available.');

  const parent = await db.query.parents.findFirst({
    where: and(eq(t.parents.id, parentId), eq(t.parents.schoolId, session.schoolId)),
    with: { user: { columns: { id: true, name: true } } },
  });
  if (!parent) throw forbidden('That guardian is not available.');

  const thread = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.messageThreads)
      .values({ schoolId: session.schoolId, studentId, parentId, staffUserId: staff.id, subject })
      .returning();
    await tx.insert(t.messages).values({ schoolId: session.schoolId, threadId: row.id, senderUserId: session.id, body });
    return row;
  });

  const recipientId = session.parentId ? staff.id : parent.user.id;
  await notify({
    schoolId: session.schoolId,
    userIds: [recipientId],
    type: 'MESSAGE',
    title: `New message: ${subject}`,
    body: body.slice(0, 160),
    link: session.parentId ? '/school/messages' : '/parent/messages',
  });

  return thread;
}

export async function postMessage(input: { session: SessionUser & { schoolId: string }; threadId: string; body: string }) {
  const { session, threadId, body } = input;
  const thread = await assertCanAccessThread(session, threadId);
  if (thread.closedAt) throw forbidden('That conversation has been closed.');

  const [message] = await db
    .insert(t.messages)
    .values({ schoolId: session.schoolId, threadId, senderUserId: session.id, body })
    .returning();
  await db.update(t.messageThreads).set({ lastMessageAt: new Date() }).where(eq(t.messageThreads.id, threadId));

  // The other participant, whoever that is relative to the sender.
  const parent = await db.query.parents.findFirst({ where: eq(t.parents.id, thread.parentId), columns: { userId: true } });
  const recipientId = session.id === thread.staffUserId ? parent?.userId : thread.staffUserId;

  if (recipientId) {
    await notify({
      schoolId: session.schoolId,
      userIds: [recipientId],
      type: 'MESSAGE',
      title: `Reply: ${thread.subject}`,
      body: body.slice(0, 160),
      link: session.id === thread.staffUserId ? '/parent/messages' : '/school/messages',
    });
  }
  return message;
}

/** Loads a thread and marks the other side's messages read. */
export async function readThread(session: SessionUser & { schoolId: string }, threadId: string) {
  const thread = await assertCanAccessThread(session, threadId);

  const rows = await db.query.messages.findMany({
    where: eq(t.messages.threadId, threadId),
    with: { sender: { columns: { id: true, name: true } } },
    orderBy: t.messages.createdAt,
  });

  await db
    .update(t.messages)
    .set({ readAt: new Date() })
    .where(and(eq(t.messages.threadId, threadId), isNull(t.messages.readAt), sql`${t.messages.senderUserId} <> ${session.id}`));

  return { thread, messages: rows };
}

/** Unread notification count for the bell. */
export async function unreadNotifications(schoolId: string, userId: string) {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(t.notifications)
    .where(and(eq(t.notifications.schoolId, schoolId), eq(t.notifications.userId, userId), isNull(t.notifications.readAt)));
  return Number(row?.value ?? 0);
}
