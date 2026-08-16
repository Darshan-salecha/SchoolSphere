import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import {
  homeworkForSchool,
  markHomeworkDone,
  reviewHomework,
  submissionFor,
  summarise,
  trackingBoard,
  trackingCounts,
  undoHomeworkDone,
} from '@/lib/services/homework';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;

/** The section the demo student is actually enrolled in. */
async function ownSection() {
  const enrollment = await db.query.enrollments.findFirst({
    where: and(eq(t.enrollments.studentId, fx.studentId), eq(t.enrollments.isCurrent, true)),
  });
  return enrollment!.sectionId;
}

/** A fresh homework item for the signed-in student's own section. */
async function freshHomework(dueOffsetDays: number, subjectId?: string) {
  const sectionId = await ownSection();
  const existing = await db.query.homework.findFirst({ where: eq(t.homework.sectionId, sectionId) });
  const due = new Date(Date.now() + dueOffsetDays * 864e5).toISOString().slice(0, 10);
  const [row] = await db
    .insert(t.homework)
    .values({
      schoolId: fx.schoolId,
      sectionId,
      subjectId: subjectId ?? existing!.subjectId,
      teacherId: existing!.teacherId,
      title: `Tracking test ${crypto.randomUUID().slice(0, 8)}`,
      description: 'Set by the test suite.',
      assignedOn: new Date().toISOString().slice(0, 10),
      dueDate: due,
    })
    .returning();
  return row;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
});

/* ------------------------------------------------------------------ */
/* Student side                                                         */
/* ------------------------------------------------------------------ */

describe('a student marking homework done', () => {
  it('records the tick against their own row, awaiting review', async () => {
    const student = await sessionFor(fx.studentUserId);
    const hw = await freshHomework(2);

    const row = await markHomeworkDone(student, hw.id, { note: 'All five questions finished.' });

    expect(row.status).toBe('SUBMITTED');
    expect(row.reviewStatus).toBe('PENDING');
    expect(row.note).toBe('All five questions finished.');
    expect(row.studentId).toBe(fx.studentId);
    expect(row.schoolId).toBe(fx.schoolId);
  });

  it('derives LATE from the due date rather than trusting the caller', async () => {
    const student = await sessionFor(fx.studentUserId);
    const hw = await freshHomework(-3);

    const row = await markHomeworkDone(student, hw.id, {});
    expect(row.status).toBe('LATE');
  });

  it('is idempotent — ticking twice leaves one row', async () => {
    const student = await sessionFor(fx.studentUserId);
    const hw = await freshHomework(1);

    await markHomeworkDone(student, hw.id, { note: 'first' });
    await markHomeworkDone(student, hw.id, { note: 'second' });

    const rows = await db
      .select()
      .from(t.homeworkSubmissions)
      .where(eq(t.homeworkSubmissions.homeworkId, hw.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('second');
  });

  it('cannot touch homework set for a different class', async () => {
    const student = await sessionFor(fx.studentUserId);
    const otherSection = await db.query.homework.findFirst({ where: eq(t.homework.sectionId, fx.section10A) });
    const err = await expectForbidden(() => markHomeworkDone(student, otherSection!.id, {}));
    expect(err.message).toMatch(/not set for your class/i);
  });

  it('cannot touch homework belonging to another school', async () => {
    const student = await sessionFor(fx.studentUserId);
    const [foreign] = await db
      .select()
      .from(t.homework)
      .where(eq(t.homework.schoolId, fx.school2Id))
      .limit(1);
    if (foreign) {
      await expect(markHomeworkDone(student, foreign.id, {})).rejects.toThrow();
    }
    // The tenant gate itself must reject the id outright.
    await expect(homeworkForSchool(fx.school2Id, (await freshHomework(1)).id)).rejects.toThrow();
  });

  it('can undo their own tick, but not after the teacher has acted', async () => {
    const student = await sessionFor(fx.studentUserId);
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);

    await markHomeworkDone(student, hw.id, {});
    await undoHomeworkDone(student, hw.id);
    expect(await submissionFor(fx.schoolId, hw.id, fx.studentId)).toBeUndefined();

    await markHomeworkDone(student, hw.id, {});
    await reviewHomework(teacher, hw.id, [{ studentId: fx.studentId, status: 'ACKNOWLEDGED' }]);
    await expect(undoHomeworkDone(student, hw.id)).rejects.toThrow(/already reviewed/i);
  });
});

/* ------------------------------------------------------------------ */
/* Teacher side                                                         */
/* ------------------------------------------------------------------ */

describe('a teacher acknowledging homework', () => {
  it('stamps who reviewed it and when, without disturbing the student half', async () => {
    const student = await sessionFor(fx.studentUserId);
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);

    await markHomeworkDone(student, hw.id, { note: 'Done in my notebook.' });
    const [row] = await reviewHomework(teacher, hw.id, [
      { studentId: fx.studentId, status: 'ACKNOWLEDGED', feedback: 'Neatly done.' },
    ]);

    expect(row.reviewStatus).toBe('ACKNOWLEDGED');
    expect(row.feedback).toBe('Neatly done.');
    expect(row.reviewedById).toBe(fx.classTeacherId);
    expect(row.reviewedAt).toBeInstanceOf(Date);
    // The student's own record survives the review untouched.
    expect(row.status).toBe('SUBMITTED');
    expect(row.note).toBe('Done in my notebook.');
  });

  it('can acknowledge work handed in on paper, with no student tick at all', async () => {
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);

    const [row] = await reviewHomework(teacher, hw.id, [{ studentId: fx.studentId, status: 'ACKNOWLEDGED' }]);
    expect(row.status).toBe('PENDING');
    expect(row.reviewStatus).toBe('ACKNOWLEDGED');
  });

  it('sends work back, and a resubmission returns it to the review queue', async () => {
    const student = await sessionFor(fx.studentUserId);
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);

    await markHomeworkDone(student, hw.id, {});
    await reviewHomework(teacher, hw.id, [
      { studentId: fx.studentId, status: 'NEEDS_REWORK', feedback: 'Redo question 3.' },
    ]);

    const resubmitted = await markHomeworkDone(student, hw.id, { note: 'Fixed question 3.' });
    expect(resubmitted.reviewStatus).toBe('PENDING');
    expect(resubmitted.feedback).toBeNull();
    expect(resubmitted.reviewedById).toBeNull();
  });

  it('refuses a student who is not in that class', async () => {
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);
    const ownKey = fx.students.find((s) => s.id === fx.studentId)!.sectionKey;
    const outsider = fx.students.find((s) => s.sectionKey !== ownKey)!;

    await expect(
      reviewHomework(teacher, hw.id, [{ studentId: outsider.id, status: 'ACKNOWLEDGED' }]),
    ).rejects.toThrow(/not in this class/i);
  });

  it('refuses a teacher who neither teaches the subject nor owns the class', async () => {
    const other = await sessionFor(fx.otherTeacherUserId);
    const sectionId = await ownSection();

    // Pick a subject this teacher is definitely not assigned in that section.
    const assigned = await db
      .select({ subjectId: t.teacherAssignments.subjectId })
      .from(t.teacherAssignments)
      .where(
        and(eq(t.teacherAssignments.sectionId, sectionId), eq(t.teacherAssignments.teacherId, other.teacherId!)),
      );
    const taken = new Set(assigned.map((a) => a.subjectId));
    const subjects = await db.select().from(t.subjects).where(eq(t.subjects.schoolId, fx.schoolId));
    const free = subjects.find((s) => !taken.has(s.id))!;

    const hw = await freshHomework(2, free.id);
    const err = await expectForbidden(() =>
      reviewHomework(other, hw.id, [{ studentId: fx.studentId, status: 'ACKNOWLEDGED' }]),
    );
    expect(err.message).toMatch(/not assigned/i);
  });

  it('notifies the guardians and the student when a decision is recorded', async () => {
    const student = await sessionFor(fx.studentUserId);
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);

    await markHomeworkDone(student, hw.id, {});
    const before = await db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.userId, fx.parentUserId));
    await reviewHomework(teacher, hw.id, [{ studentId: fx.studentId, status: 'ACKNOWLEDGED' }]);
    const after = await db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.userId, fx.parentUserId));

    expect(after.length).toBeGreaterThan(before.length);
    const studentNotes = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.userId, fx.studentUserId), eq(t.notifications.type, 'HOMEWORK')));
    expect(studentNotes.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Tracking views                                                       */
/* ------------------------------------------------------------------ */

describe('the tracking board', () => {
  it('lists every enrolled student, including those with nothing recorded', async () => {
    const student = await sessionFor(fx.studentUserId);
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);

    await markHomeworkDone(student, hw.id, {});
    await reviewHomework(teacher, hw.id, [{ studentId: fx.studentId, status: 'ACKNOWLEDGED' }]);

    const rows = await trackingBoard(fx.schoolId, hw.id, hw.sectionId);
    const enrolled = await db
      .select()
      .from(t.enrollments)
      .where(and(eq(t.enrollments.sectionId, hw.sectionId), eq(t.enrollments.isCurrent, true)));

    expect(rows).toHaveLength(enrolled.length);
    const mine = rows.find((r) => r.studentId === fx.studentId)!;
    expect(mine.status).toBe('SUBMITTED');
    expect(mine.reviewStatus).toBe('ACKNOWLEDGED');
    expect(mine.reviewedBy).toBeTruthy();

    const untouched = rows.filter((r) => r.studentId !== fx.studentId);
    expect(untouched.every((r) => r.status === 'PENDING' && r.reviewStatus === 'PENDING')).toBe(true);

    const stats = summarise(rows);
    expect(stats.total).toBe(rows.length);
    expect(stats.done).toBe(1);
    expect(stats.acknowledged).toBe(1);
    expect(stats.notDone).toBe(rows.length - 1);
    expect(stats.awaitingReview).toBe(0);
  });

  it('counts done, acknowledged and rework per homework item for the list view', async () => {
    const student = await sessionFor(fx.studentUserId);
    const teacher = await sessionFor(fx.classTeacherUserId);
    const hw = await freshHomework(2);

    await markHomeworkDone(student, hw.id, {});
    const counts = await trackingCounts(fx.schoolId, [hw.id]);
    expect(counts.get(hw.id)).toEqual({ done: 1, acknowledged: 0, rework: 0 });

    await reviewHomework(teacher, hw.id, [{ studentId: fx.studentId, status: 'NEEDS_REWORK' }]);
    const after = await trackingCounts(fx.schoolId, [hw.id]);
    expect(after.get(hw.id)).toEqual({ done: 1, acknowledged: 0, rework: 1 });
  });

  it('never leaks another school’s tracking rows', async () => {
    const hw = await freshHomework(2);
    const student = await sessionFor(fx.studentUserId);
    await markHomeworkDone(student, hw.id, {});

    const counts = await trackingCounts(fx.school2Id, [hw.id]);
    expect(counts.size).toBe(0);
  });
});
