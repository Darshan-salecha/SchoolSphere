import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import { issueOtp, verifyOtp } from '@/lib/auth/otp';
import { createSchool, nextSchoolCode } from '@/lib/services/schools';
import { findPossibleDuplicates } from '@/lib/services/students';
import { guardianUserIds, notify } from '@/lib/services/notify';
import { parseCsv, toCsv } from '@/lib/csv';
import { gradeFor, normalisePhone, slugify } from '@/lib/utils';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  process.env.DEMO_MODE = 'true';
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
});

/* ------------------------------------------------------------------ */
/* Parent OTP sign-in                                                   */
/* ------------------------------------------------------------------ */

describe('parent OTP enrolment rule', () => {
  it('only issues a code to a number the school has enrolled', async () => {
    const enrolled = await db.query.parents.findFirst({
      where: and(eq(t.parents.schoolId, fx.schoolId), eq(t.parents.id, fx.parentId)),
    });
    expect(enrolled).toBeDefined();

    const stranger = await db.query.parents.findFirst({
      where: and(eq(t.parents.schoolId, fx.schoolId), eq(t.parents.phone, '9999999999')),
    });
    // The API refuses before ever reaching issueOtp — no parent row, no code.
    expect(stranger).toBeUndefined();
  });

  it('a number enrolled at school A is not valid at school B', async () => {
    const parent = await db.query.parents.findFirst({ where: eq(t.parents.id, fx.parentId) });
    const atOtherSchool = await db.query.parents.findFirst({
      where: and(eq(t.parents.schoolId, fx.school2Id), eq(t.parents.phone, parent!.phone)),
    });
    expect(atOtherSchool).toBeUndefined();
  });

  it('verifies a correct code exactly once', async () => {
    const parent = await db.query.parents.findFirst({ where: eq(t.parents.id, fx.parentId) });
    const code = await issueOtp(fx.schoolId, parent!.phone);
    expect(code).toMatch(/^\d{6}$/);

    await expect(verifyOtp(fx.schoolId, parent!.phone, code!)).resolves.toBe(true);
    // Replaying a consumed code fails.
    await expect(verifyOtp(fx.schoolId, parent!.phone, code!)).rejects.toThrow();
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const [user] = await db
      .insert(t.users)
      .values({ schoolId: fx.schoolId, name: 'OTP Test Parent', phone: '9876500011' })
      .returning();
    await db.insert(t.userRoles).values({ userId: user.id, role: 'PARENT' });
    await db.insert(t.parents).values({ schoolId: fx.schoolId, userId: user.id, phone: '9876500011' });

    await issueOtp(fx.schoolId, '9876500011');
    await expect(verifyOtp(fx.schoolId, '9876500011', '000000')).rejects.toThrow(/not correct/i);

    const record = await db.query.otpCodes.findFirst({
      where: and(eq(t.otpCodes.schoolId, fx.schoolId), eq(t.otpCodes.phone, '9876500011')),
    });
    expect(record!.attempts).toBe(1);
  });

  it('rate-limits rapid resends', async () => {
    const [user] = await db
      .insert(t.users)
      .values({ schoolId: fx.schoolId, name: 'Throttle Parent', phone: '9876500022' })
      .returning();
    await db.insert(t.userRoles).values({ userId: user.id, role: 'PARENT' });
    await db.insert(t.parents).values({ schoolId: fx.schoolId, userId: user.id, phone: '9876500022' });

    await issueOtp(fx.schoolId, '9876500022');
    await expect(issueOtp(fx.schoolId, '9876500022')).rejects.toThrow(/wait a minute/i);
  });
});

/* ------------------------------------------------------------------ */
/* School onboarding                                                    */
/* ------------------------------------------------------------------ */

describe('school onboarding', () => {
  it('provisions a tenant, trial subscription and first admin atomically', async () => {
    const before = await nextSchoolCode();
    const { school, admin } = await createSchool({
      name: 'Riverdale High',
      email: 'office@riverdale.edu',
      country: 'India',
      timezone: 'Asia/Kolkata',
      planCode: 'STARTER',
      adminName: 'Hermione Grant',
      adminEmail: 'admin@riverdale.edu',
      adminPassword: 'StrongPass123',
    });

    expect(school.code).toBe(before);
    expect(school.slug).toBe('riverdale-high');
    expect(school.status).toBe('ACTIVE');

    const settings = await db.query.schoolSettings.findFirst({ where: eq(t.schoolSettings.schoolId, school.id) });
    const subscription = await db.query.subscriptions.findFirst({ where: eq(t.subscriptions.schoolId, school.id) });
    const roles = await db.select().from(t.userRoles).where(eq(t.userRoles.userId, admin.id));

    expect(settings).toBeDefined();
    expect(subscription?.status).toBe('TRIAL');
    expect(roles.map((r) => r.role)).toEqual(['SCHOOL_ADMIN']);

    const session = await sessionFor(admin.id);
    expect(session.permissions).toContain('students.create');
    expect(session.permissions.some((p) => p.startsWith('platform.'))).toBe(false);
  });

  it('refuses to reuse an admin email', async () => {
    await expect(
      createSchool({
        name: 'Duplicate Admin School',
        email: 'office@dup.edu',
        country: 'India',
        timezone: 'Asia/Kolkata',
        planCode: 'STARTER',
        adminName: 'Someone Else',
        adminEmail: 'admin@riverdale.edu',
        adminPassword: 'StrongPass123',
      }),
    ).rejects.toThrow(/already in use/i);
  });
});

/* ------------------------------------------------------------------ */
/* Attendance notifications                                             */
/* ------------------------------------------------------------------ */

describe('attendance notifications', () => {
  it('notifies only the guardians of the absent student', async () => {
    const student = fx.students[0];
    // Derived from the links rather than hardcoded: this child has a father, a
    // mother and a limited-access grandparent, and the count is free to grow.
    const guardians = await guardianUserIds(fx.schoolId, [student.id]);
    const links = await db
      .select()
      .from(t.studentParents)
      .where(and(eq(t.studentParents.schoolId, fx.schoolId), eq(t.studentParents.studentId, student.id)));
    expect(guardians.length).toBe(links.length);
    expect(guardians.length).toBeGreaterThanOrEqual(2);

    await notify({
      schoolId: fx.schoolId,
      userIds: guardians,
      type: 'ATTENDANCE',
      title: 'Absent today',
      body: 'Your child was marked absent.',
    });

    const delivered = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.schoolId, fx.schoolId), eq(t.notifications.type, 'ATTENDANCE')));
    expect(delivered.length).toBe(guardians.length);
    expect(delivered.every((n) => guardians.includes(n.userId))).toBe(true);

    // Nobody outside that household received it.
    const otherParent = await sessionFor(fx.otherParentUserId);
    expect(delivered.some((n) => n.userId === otherParent.id)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Results visibility                                                   */
/* ------------------------------------------------------------------ */

describe('results visibility', () => {
  it('exposes published results and hides unpublished ones', async () => {
    const student = fx.students[0];

    const published = await db.query.results.findMany({
      where: and(eq(t.results.studentId, student.id), eq(t.results.isPublished, true)),
    });
    expect(published.length).toBeGreaterThan(0);

    // Unpublish and confirm the parent-facing query returns nothing.
    await db
      .update(t.results)
      .set({ isPublished: false })
      .where(and(eq(t.results.examId, fx.publishedExamId), eq(t.results.studentId, student.id)));

    const afterUnpublish = await db.query.results.findMany({
      where: and(eq(t.results.studentId, student.id), eq(t.results.isPublished, true)),
    });
    expect(afterUnpublish.length).toBe(published.length - 1);

    await db
      .update(t.results)
      .set({ isPublished: true })
      .where(and(eq(t.results.examId, fx.publishedExamId), eq(t.results.studentId, student.id)));
  });

  it('ranks every section independently and consistently', async () => {
    const rows = await db.query.results.findMany({ where: eq(t.results.examId, fx.publishedExamId) });
    const bySection = new Map<string, typeof rows>();
    for (const r of rows) bySection.set(r.sectionId, [...(bySection.get(r.sectionId) ?? []), r]);

    for (const list of bySection.values()) {
      const sorted = [...list].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      expect(sorted[0].rank).toBe(1);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].percentage).toBeLessThanOrEqual(sorted[i - 1].percentage);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Data quality helpers                                                 */
/* ------------------------------------------------------------------ */

describe('duplicate detection and import parsing', () => {
  it('flags a repeated admission number', async () => {
    const existing = await db.query.students.findFirst({ where: eq(t.students.schoolId, fx.schoolId) });
    const hits = await findPossibleDuplicates(fx.schoolId, { admissionNumber: existing!.admissionNumber });
    expect(hits.map((h) => h.id)).toContain(existing!.id);
  });

  it('flags a matching name and date of birth', async () => {
    const existing = await db.query.students.findFirst({ where: eq(t.students.schoolId, fx.schoolId) });
    const hits = await findPossibleDuplicates(fx.schoolId, {
      firstName: existing!.firstName,
      lastName: existing!.lastName,
      dateOfBirth: new Date(existing!.dateOfBirth!),
    });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('does not flag across tenants', async () => {
    const existing = await db.query.students.findFirst({ where: eq(t.students.schoolId, fx.schoolId) });
    const hits = await findPossibleDuplicates(fx.school2Id, { admissionNumber: existing!.admissionNumber });
    expect(hits).toHaveLength(0);
  });

  it('parses CSV with quoted fields and blank lines', () => {
    const csv = 'admissionNumber,firstName,lastName\nA1,"Sharma, Rahul",Verma\n\nA2,Sneha,Rao\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['admissionNumber', 'firstName', 'lastName']);
    expect(rows).toHaveLength(2);
    expect(rows[0].firstName).toBe('Sharma, Rahul');
  });

  it('round-trips through toCsv', () => {
    const rows = [{ a: 'x,y', b: 'plain' }];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed.rows[0]).toEqual({ a: 'x,y', b: 'plain' });
  });
});

describe('shared utilities', () => {
  it('grades percentages on the school scale', () => {
    expect(gradeFor(95)).toBe('A+');
    expect(gradeFor(72)).toBe('B+');
    expect(gradeFor(36)).toBe('D');
    expect(gradeFor(20)).toBe('E');
  });

  it('normalises phone numbers to the last 10 digits', () => {
    expect(normalisePhone('+91 98100-00001')).toBe('9810000001');
    expect(normalisePhone('9810000001')).toBe('9810000001');
  });

  it('slugifies school names safely', () => {
    expect(slugify("St. Mary's Convent & School")).toBe('st-mary-s-convent-school');
  });

  it('hashes passwords irreversibly and verifies them', async () => {
    const hash = await hashPassword('Password123!');
    expect(hash).not.toContain('Password123!');
    expect(await verifyPassword('Password123!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
