import { describe, expect, it, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import * as t from '@/db/schema';
import { seed } from '@/db/seed';
import type { Db } from '@/db';

let db: Db;
let fixtures: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  fixtures = await seed(db, { log: false });
});

describe('seed data', () => {
  it('creates three schools including a suspended tenant', async () => {
    const rows = await db.select().from(t.schools);
    expect(rows).toHaveLength(3);
    expect(rows.filter((s) => s.status === 'SUSPENDED')).toHaveLength(1);
  });

  it('meets the demo data bar from the brief', async () => {
    const students = await db.select().from(t.students).where(eq(t.students.schoolId, fixtures.schoolId));
    const teachers = await db.select().from(t.teachers).where(eq(t.teachers.schoolId, fixtures.schoolId));
    const parents = await db.select().from(t.parents).where(eq(t.parents.schoolId, fixtures.schoolId));
    const buses = await db.select().from(t.buses).where(eq(t.buses.schoolId, fixtures.schoolId));
    expect(students.length).toBeGreaterThanOrEqual(30);
    expect(teachers.length).toBeGreaterThanOrEqual(10);
    expect(parents.length).toBeGreaterThanOrEqual(20);
    expect(buses.length).toBe(3);
  });

  it('gives every student a current enrollment and at least one guardian', async () => {
    const students = await db.query.students.findMany({
      where: eq(t.students.schoolId, fixtures.schoolId),
      with: { enrollments: true, guardians: true },
    });
    for (const s of students) {
      expect(s.enrollments.some((e) => e.isCurrent)).toBe(true);
      expect(s.guardians.length).toBeGreaterThan(0);
    }
  });

  it('publishes results with ranks for the completed exam', async () => {
    const results = await db.select().from(t.results).where(eq(t.results.examId, fixtures.publishedExamId));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.isPublished && r.rank !== null)).toBe(true);
  });
});
