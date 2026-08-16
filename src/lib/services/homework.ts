import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { assertCanTeach } from '@/lib/scope';
import { assertSameSchool } from '@/lib/tenant';
import { guardianUserIds, notify, studentUserIds } from '@/lib/services/notify';
import type { SessionUser } from '@/lib/auth/session';
import type { HomeworkReviewStatus } from '@/db/schema';

/**
 * Homework tracking.
 *
 * Homework is deliberately *not* graded here — assignments carry marks. The
 * tracking record has two independent halves:
 *
 *   student side → status      PENDING | SUBMITTED | LATE     ("did they do it?")
 *   teacher side → reviewStatus PENDING | ACKNOWLEDGED | NEEDS_REWORK
 *
 * A row is created lazily: the first time either side acts on it. No row means
 * "not done, not reviewed", which is what a freshly posted homework looks like.
 */

export type TrackingRow = {
  studentId: string;
  name: string;
  rollNumber: number | null;
  photoUrl: string | null;
  status: 'PENDING' | 'SUBMITTED' | 'LATE' | 'GRADED';
  submittedAt: Date | null;
  note: string | null;
  link: string | null;
  reviewStatus: HomeworkReviewStatus;
  feedback: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

/** Loads a homework row and proves it belongs to the caller's school. */
export async function homeworkForSchool(schoolId: string, homeworkId: string) {
  const row = await db.query.homework.findFirst({
    where: eq(t.homework.id, homeworkId),
    with: {
      section: { with: { class: true } },
      subject: true,
      teacher: { with: { user: { columns: { id: true, name: true } } } },
    },
  });
  return assertSameSchool(row ?? null, schoolId);
}

/** The submission row for one student, or undefined if they have not been tracked yet. */
export async function submissionFor(schoolId: string, homeworkId: string, studentId: string) {
  return db.query.homeworkSubmissions.findFirst({
    where: and(
      eq(t.homeworkSubmissions.schoolId, schoolId),
      eq(t.homeworkSubmissions.homeworkId, homeworkId),
      eq(t.homeworkSubmissions.studentId, studentId),
    ),
    with: { reviewedBy: { with: { user: { columns: { name: true } } } } },
  });
}

/** Every submission for a set of homework ids, keyed `${homeworkId}:${studentId}`. */
export async function submissionsFor(schoolId: string, homeworkIds: string[], studentIds?: string[]) {
  if (!homeworkIds.length) return new Map<string, typeof t.homeworkSubmissions.$inferSelect>();
  const rows = await db.query.homeworkSubmissions.findMany({
    where: and(
      eq(t.homeworkSubmissions.schoolId, schoolId),
      inArray(t.homeworkSubmissions.homeworkId, homeworkIds),
      studentIds?.length ? inArray(t.homeworkSubmissions.studentId, studentIds) : undefined,
    ),
  });
  return new Map(rows.map((r) => [`${r.homeworkId}:${r.studentId}`, r]));
}

/** Done / acknowledged / rework counts per homework id, for list views. */
export async function trackingCounts(schoolId: string, homeworkIds: string[]) {
  const counts = new Map<string, { done: number; acknowledged: number; rework: number }>();
  if (!homeworkIds.length) return counts;
  const rows = await db
    .select({
      homeworkId: t.homeworkSubmissions.homeworkId,
      status: t.homeworkSubmissions.status,
      reviewStatus: t.homeworkSubmissions.reviewStatus,
    })
    .from(t.homeworkSubmissions)
    .where(
      and(eq(t.homeworkSubmissions.schoolId, schoolId), inArray(t.homeworkSubmissions.homeworkId, homeworkIds)),
    );

  for (const r of rows) {
    const entry = counts.get(r.homeworkId) ?? { done: 0, acknowledged: 0, rework: 0 };
    if (r.status === 'SUBMITTED' || r.status === 'LATE') entry.done += 1;
    if (r.reviewStatus === 'ACKNOWLEDGED') entry.acknowledged += 1;
    if (r.reviewStatus === 'NEEDS_REWORK') entry.rework += 1;
    counts.set(r.homeworkId, entry);
  }
  return counts;
}

/** Full class roster for one homework item, each student with their tracking state. */
export async function trackingBoard(schoolId: string, homeworkId: string, sectionId: string): Promise<TrackingRow[]> {
  const enrolled = await db.query.enrollments.findMany({
    where: and(
      eq(t.enrollments.schoolId, schoolId),
      eq(t.enrollments.sectionId, sectionId),
      eq(t.enrollments.isCurrent, true),
    ),
    with: { student: true },
    orderBy: asc(t.enrollments.rollNumber),
  });

  const submissions = await submissionsFor(
    schoolId,
    [homeworkId],
    enrolled.map((e) => e.studentId),
  );
  const reviewerIds = [...submissions.values()].map((s) => s.reviewedById).filter((id): id is string => Boolean(id));
  const reviewers = reviewerIds.length
    ? await db.query.teachers.findMany({
        where: inArray(t.teachers.id, [...new Set(reviewerIds)]),
        with: { user: { columns: { name: true } } },
      })
    : [];
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.user.name]));

  return enrolled
    .filter((e) => e.student && !e.student.deletedAt)
    .map((e) => {
      const s = submissions.get(`${homeworkId}:${e.studentId}`);
      return {
        studentId: e.studentId,
        name: `${e.student.firstName} ${e.student.lastName}`,
        rollNumber: e.rollNumber,
        photoUrl: e.student.photoUrl,
        status: s?.status ?? 'PENDING',
        submittedAt: s?.submittedAt ?? null,
        note: s?.note ?? null,
        link: s?.link ?? null,
        reviewStatus: s?.reviewStatus ?? 'PENDING',
        feedback: s?.feedback ?? null,
        reviewedAt: s?.reviewedAt ?? null,
        reviewedBy: s?.reviewedById ? reviewerName.get(s.reviewedById) ?? null : null,
      };
    });
}

export function summarise(rows: TrackingRow[]) {
  const done = rows.filter((r) => r.status === 'SUBMITTED' || r.status === 'LATE').length;
  return {
    total: rows.length,
    done,
    late: rows.filter((r) => r.status === 'LATE').length,
    notDone: rows.length - done,
    acknowledged: rows.filter((r) => r.reviewStatus === 'ACKNOWLEDGED').length,
    rework: rows.filter((r) => r.reviewStatus === 'NEEDS_REWORK').length,
    awaitingReview: rows.filter(
      (r) => (r.status === 'SUBMITTED' || r.status === 'LATE') && r.reviewStatus === 'PENDING',
    ).length,
  };
}

/** The student's current section — homework is only visible and actionable within it. */
async function currentEnrollment(schoolId: string, studentId: string) {
  return db.query.enrollments.findFirst({
    where: and(
      eq(t.enrollments.schoolId, schoolId),
      eq(t.enrollments.studentId, studentId),
      eq(t.enrollments.isCurrent, true),
    ),
  });
}

/* -------------------------------------------------------------------------- */
/* Student side                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Student marks their own homework as done. Late is derived from the due date,
 * never trusted from the client. Re-submitting after a rework request clears the
 * teacher's decision so the item returns to their review queue.
 */
export async function markHomeworkDone(
  session: SessionUser & { schoolId: string },
  homeworkId: string,
  input: { note?: string; link?: string },
) {
  if (!session.studentId) throw forbidden('Only a signed-in student can mark homework done.');
  const hw = await homeworkForSchool(session.schoolId, homeworkId);

  const enrollment = await currentEnrollment(session.schoolId, session.studentId);
  if (!enrollment || enrollment.sectionId !== hw.sectionId) {
    throw forbidden('This homework was not set for your class.');
  }

  const now = new Date();
  const status = today() > hw.dueDate ? ('LATE' as const) : ('SUBMITTED' as const);
  const values = {
    schoolId: session.schoolId,
    homeworkId,
    studentId: session.studentId,
    status,
    note: input.note?.trim() || null,
    link: input.link?.trim() || null,
    submittedAt: now,
    // Anything the teacher decided earlier no longer applies to this new attempt.
    reviewStatus: 'PENDING' as const,
    feedback: null,
    reviewedById: null,
    reviewedAt: null,
  };

  const [row] = await db
    .insert(t.homeworkSubmissions)
    .values(values)
    .onConflictDoUpdate({
      target: [t.homeworkSubmissions.homeworkId, t.homeworkSubmissions.studentId],
      set: values,
    })
    .returning();

  // The teacher who set it sees it in their review queue.
  if (hw.teacher?.user?.id) {
    await notify({
      schoolId: session.schoolId,
      userIds: [hw.teacher.user.id],
      type: 'HOMEWORK',
      title: `${session.name} marked homework done`,
      body: `${hw.title} — ${hw.section.class.name}-${hw.section.name}${status === 'LATE' ? ' (late)' : ''}.`,
      link: `/school/homework/${homeworkId}`,
    });
  }
  return row;
}

/** Student undoes their own tick. Blocked once a teacher has acted on it. */
export async function undoHomeworkDone(session: SessionUser & { schoolId: string }, homeworkId: string) {
  if (!session.studentId) throw forbidden('Only a signed-in student can change this.');
  await homeworkForSchool(session.schoolId, homeworkId);

  const existing = await submissionFor(session.schoolId, homeworkId, session.studentId);
  if (!existing) throw notFound('Nothing to undo.');
  if (existing.reviewStatus !== 'PENDING') {
    throw badRequest('Your teacher has already reviewed this. Please speak to them if it needs changing.');
  }

  await db.delete(t.homeworkSubmissions).where(eq(t.homeworkSubmissions.id, existing.id));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Teacher side                                                                */
/* -------------------------------------------------------------------------- */

export type ReviewEntry = { studentId: string; status: HomeworkReviewStatus; feedback?: string };

/**
 * Teacher acknowledges (or sends back) one or more students on a homework item.
 * Works whether or not the student marked it done — a teacher can acknowledge
 * work handed in on paper, which is the common case for younger classes.
 */
export async function reviewHomework(
  session: SessionUser & { schoolId: string },
  homeworkId: string,
  entries: ReviewEntry[],
) {
  const hw = await homeworkForSchool(session.schoolId, homeworkId);
  await assertCanTeach(session, hw.sectionId, hw.subjectId);

  const studentIds = [...new Set(entries.map((e) => e.studentId))];
  const enrolled = await db
    .select({ studentId: t.enrollments.studentId })
    .from(t.enrollments)
    .where(
      and(
        eq(t.enrollments.schoolId, session.schoolId),
        eq(t.enrollments.sectionId, hw.sectionId),
        eq(t.enrollments.isCurrent, true),
        inArray(t.enrollments.studentId, studentIds),
      ),
    );
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  const unknown = studentIds.filter((id) => !enrolledIds.has(id));
  if (unknown.length) throw badRequest('One or more students are not in this class.');

  const now = new Date();
  const reviewerId = session.teacherId ?? hw.teacherId;
  const saved: (typeof t.homeworkSubmissions.$inferSelect)[] = [];

  for (const entry of entries) {
    const clearing = entry.status === 'PENDING';
    const values = {
      schoolId: session.schoolId,
      homeworkId,
      studentId: entry.studentId,
      // Row may not exist yet (paper homework, never ticked by the student).
      status: 'PENDING' as const,
      reviewStatus: entry.status,
      feedback: entry.feedback?.trim() || null,
      reviewedById: clearing ? null : reviewerId,
      reviewedAt: clearing ? null : now,
    };
    const [row] = await db
      .insert(t.homeworkSubmissions)
      .values(values)
      .onConflictDoUpdate({
        target: [t.homeworkSubmissions.homeworkId, t.homeworkSubmissions.studentId],
        // Never overwrite the student's own half of the record.
        set: {
          reviewStatus: values.reviewStatus,
          feedback: values.feedback,
          reviewedById: values.reviewedById,
          reviewedAt: values.reviewedAt,
        },
      })
      .returning();
    saved.push(row);
  }

  // Tell the family, but only about a decision that means something to them.
  const notifiable = saved.filter((s) => s.reviewStatus !== 'PENDING');
  if (notifiable.length) {
    const byStudent = new Map(notifiable.map((s) => [s.studentId, s]));
    for (const [studentId, row] of byStudent) {
      const acknowledged = row.reviewStatus === 'ACKNOWLEDGED';
      const message = {
        schoolId: session.schoolId,
        type: 'HOMEWORK',
        title: acknowledged ? 'Homework acknowledged' : 'Homework needs to be redone',
        body: `${hw.subject.name}: ${hw.title}${row.feedback ? ` — ${row.feedback}` : '.'}`,
      };
      await notify({
        ...message,
        userIds: await guardianUserIds(session.schoolId, [studentId]),
        link: '/parent/homework',
      });
      await notify({
        ...message,
        userIds: await studentUserIds(session.schoolId, [studentId]),
        link: '/student/homework',
      });
    }
  }

  return saved;
}
