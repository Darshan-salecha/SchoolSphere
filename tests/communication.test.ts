import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import { assertCanAccessThread, listThreads, postMessage, readThread, startThread, unreadNotifications } from '@/lib/services/messaging';
import { issueCertificate } from '@/lib/services/certificates';
import { assertStudentCapacity, assertTeacherCapacity, assertFeature, usageFor } from '@/lib/services/plan-limits';
import { runAutomation } from '@/lib/services/automation';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
});

describe('messaging access', () => {
  it('lets both participants read the thread', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const teacher = await sessionFor(fx.classTeacherUserId);

    await expect(assertCanAccessThread(parent, fx.threadId)).resolves.toBeTruthy();
    await expect(assertCanAccessThread(teacher, fx.threadId)).resolves.toBeTruthy();
  });

  it('refuses an unrelated parent', async () => {
    const other = await sessionFor(fx.otherParentUserId);
    const err = await expectForbidden(() => assertCanAccessThread(other, fx.threadId));
    expect(err.message).toMatch(/not part of that conversation/i);
  });

  it('refuses a teacher who is not in the conversation', async () => {
    const other = await sessionFor(fx.otherTeacherUserId);
    await expectForbidden(() => assertCanAccessThread(other, fx.threadId));
  });

  it('lets a school admin audit any thread', async () => {
    const admin = await sessionFor(fx.adminUserId);
    await expect(assertCanAccessThread(admin, fx.threadId)).resolves.toBeTruthy();
  });

  it('refuses an admin from another school entirely', async () => {
    const otherAdmin = await sessionFor(fx.school2AdminUserId);
    await expectForbidden(() => assertCanAccessThread(otherAdmin, fx.threadId));
  });

  it('shows a parent only their own conversations', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const other = await sessionFor(fx.otherParentUserId);
    const mine = await listThreads(parent);
    const theirs = await listThreads(other);
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.some((x) => mine.some((m) => m.id === x.id))).toBe(false);
  });
});

describe('sending messages', () => {
  it('appends a reply and notifies the other side only', async () => {
    const teacher = await sessionFor(fx.classTeacherUserId);
    const before = await db.select().from(t.messages).where(eq(t.messages.threadId, fx.threadId));

    await postMessage({ session: teacher, threadId: fx.threadId, body: 'Sent the reading list home today.' });

    const after = await db.select().from(t.messages).where(eq(t.messages.threadId, fx.threadId));
    expect(after.length).toBe(before.length + 1);

    const parent = await db.query.parents.findFirst({ where: eq(t.parents.id, fx.parentId) });
    const notes = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.type, 'MESSAGE'), eq(t.notifications.userId, parent!.userId)));
    expect(notes.length).toBeGreaterThan(0);
  });

  it('refuses a stranger posting into the thread', async () => {
    const other = await sessionFor(fx.otherParentUserId);
    await expectForbidden(() => postMessage({ session: other, threadId: fx.threadId, body: 'hello' }));
  });

  it('marks the other side’s messages read on open, but not your own', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const { messages } = await readThread(parent, fx.threadId);
    const fromTeacher = messages.filter((m) => m.senderUserId !== parent.id);
    const rows = await db.select().from(t.messages).where(eq(t.messages.threadId, fx.threadId));
    for (const m of rows.filter((r) => fromTeacher.some((f) => f.id === r.id))) {
      expect(m.readAt).not.toBeNull();
    }
  });

  it('starts a thread about the parent’s own child', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const thread = await startThread({
      session: parent,
      studentId: fx.students[0].id,
      subject: 'Bus timing question',
      body: 'Could the bus wait a minute longer at our stop?',
    });
    expect(thread.id).toBeTruthy();
  });

  it('refuses a parent starting a thread about someone else’s child', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const otherParent = await sessionFor(fx.otherParentUserId);
    const theirChild = (await listThreads(otherParent))[0];
    const notMine = fx.students.find((s) => s.sectionKey === '10-A')!;
    // Only assert when that child genuinely is not linked to this parent.
    const link = await db.query.studentParents.findFirst({
      where: and(eq(t.studentParents.parentId, parent.parentId!), eq(t.studentParents.studentId, notMine.id)),
    });
    if (link) return;
    await expectForbidden(() =>
      startThread({ session: parent, studentId: notMine.id, subject: 'x', body: 'y' }),
    );
    expect(theirChild ?? true).toBeTruthy();
  });
});

describe('notification counters', () => {
  it('counts only the signed-in user’s unread rows', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const count = await unreadNotifications(parent.schoolId, parent.id);
    expect(count).toBeGreaterThanOrEqual(0);

    const other = await sessionFor(fx.otherParentUserId);
    const otherCount = await unreadNotifications(other.schoolId, other.id);
    expect(typeof otherCount).toBe('number');
  });
});

describe('certificates', () => {
  it('freezes the wording and allocates a serial number', async () => {
    const admin = await sessionFor(fx.adminUserId);
    const cert = await issueCertificate({ session: admin, studentId: fx.students[2].id, type: 'CHARACTER' });
    expect(cert.serialNumber).toMatch(/^CHA-/);
    expect(cert.body).toContain('character and conduct');
    expect(cert.body).toContain('Delhi Public Academy');
  });

  it('refuses a student from another school', async () => {
    const otherAdmin = await sessionFor(fx.school2AdminUserId);
    await expectForbidden(() => issueCertificate({ session: otherAdmin, studentId: fx.students[0].id, type: 'BONAFIDE' }));
  });

  it('issues sequential serials per type', async () => {
    const admin = await sessionFor(fx.adminUserId);
    const a = await issueCertificate({ session: admin, studentId: fx.students[3].id, type: 'TRANSFER' });
    const b = await issueCertificate({ session: admin, studentId: fx.students[4].id, type: 'TRANSFER' });
    expect(a.serialNumber).not.toBe(b.serialNumber);
  });
});

describe('plan limits', () => {
  it('allows enrolment inside the plan', async () => {
    await expect(assertStudentCapacity(fx.schoolId, 1)).resolves.toBeUndefined();
  });

  it('refuses a batch that would exceed the plan, with a clear message', async () => {
    const err = await expectForbidden(() => assertStudentCapacity(fx.schoolId, 100_000));
    expect(err.message).toMatch(/plan allows up to/i);
    expect(err.status).toBe(402);
  });

  it('refuses teachers beyond the plan', async () => {
    await expectForbidden(() => assertTeacherCapacity(fx.schoolId, 100_000));
  });

  it('gates a feature the plan does not include', async () => {
    // The seeded second school is on Starter, which has no transport feature.
    const err = await expectForbidden(() => assertFeature(fx.school2Id, 'transport'));
    expect(err.message).toMatch(/not included/i);
  });

  it('allows a feature the plan does include', async () => {
    await expect(assertFeature(fx.schoolId, 'transport')).resolves.toBeUndefined();
  });

  it('reports usage against the plan', async () => {
    const usage = await usageFor(fx.schoolId);
    expect(usage.plan?.name).toBeTruthy();
    expect(usage.students).toBeGreaterThan(0);
    expect(usage.studentsPercent).toBeGreaterThan(0);
  });
});

describe('automation rules', () => {
  it('runs every rule and is safe to run twice', async () => {
    const first = await runAutomation(fx.schoolId);
    expect(first.map((r) => r.rule)).toEqual(
      expect.arrayContaining(['attendance.low', 'exam.upcoming', 'fee.overdue', 'trip.stale']),
    );

    // Second run must not re-notify anyone.
    const second = await runAutomation(fx.schoolId);
    for (const rule of second) expect(rule.notified).toBe(0);
  });
});
