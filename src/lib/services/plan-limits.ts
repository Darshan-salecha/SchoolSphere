import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { AppError } from '@/lib/errors';

/**
 * Plan enforcement.
 *
 * Limits were stored but never checked, which meant a Starter school could
 * enrol ten thousand students. Enforcement lives here rather than in each
 * handler so the message, the status code and the threshold are identical
 * everywhere, and so raising a limit is a one-line change.
 *
 * Deliberately checked at the point of *creation* only. Nothing is ever
 * disabled retroactively — a school that downgrades keeps its data and simply
 * cannot add more, because deleting a child's record to fit a billing tier
 * would be indefensible.
 */

export type Feature = 'transport' | 'fees' | 'analytics' | 'sms' | 'branding' | 'api';

export async function planFor(schoolId: string) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(t.subscriptions.schoolId, schoolId),
    with: { plan: true },
  });
  return subscription?.plan ?? null;
}

async function studentCount(schoolId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(t.students)
    .where(and(eq(t.students.schoolId, schoolId), isNull(t.students.deletedAt)));
  return Number(row?.value ?? 0);
}

async function teacherCount(schoolId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(t.teachers)
    .where(and(eq(t.teachers.schoolId, schoolId), isNull(t.teachers.deletedAt)));
  return Number(row?.value ?? 0);
}

/** Throws when adding `adding` more students would exceed the plan. */
export async function assertStudentCapacity(schoolId: string, adding = 1) {
  const plan = await planFor(schoolId);
  if (!plan) return;
  const current = await studentCount(schoolId);
  if (current + adding > plan.maxStudents) {
    throw new AppError(
      `Your ${plan.name} plan allows up to ${plan.maxStudents.toLocaleString('en-IN')} students and you have ${current.toLocaleString('en-IN')}. Upgrade the plan to enrol more.`,
      402,
      'PLAN_LIMIT',
    );
  }
}

export async function assertTeacherCapacity(schoolId: string, adding = 1) {
  const plan = await planFor(schoolId);
  if (!plan) return;
  const current = await teacherCount(schoolId);
  if (current + adding > plan.maxTeachers) {
    throw new AppError(
      `Your ${plan.name} plan allows up to ${plan.maxTeachers} teachers and you have ${current}. Upgrade the plan to add more.`,
      402,
      'PLAN_LIMIT',
    );
  }
}

/** Feature gating. Absent features fail closed with an explanation. */
export async function assertFeature(schoolId: string, feature: Feature) {
  const plan = await planFor(schoolId);
  if (!plan) return;
  if (!plan.features.includes(feature)) {
    throw new AppError(
      `${feature[0].toUpperCase()}${feature.slice(1)} is not included in your ${plan.name} plan.`,
      402,
      'PLAN_FEATURE',
    );
  }
}

export async function usageFor(schoolId: string) {
  const plan = await planFor(schoolId);
  const [students, teachers] = await Promise.all([studentCount(schoolId), teacherCount(schoolId)]);
  return {
    plan,
    students,
    teachers,
    studentsPercent: plan ? Math.round((students / plan.maxStudents) * 100) : 0,
    teachersPercent: plan ? Math.round((teachers / plan.maxTeachers) * 100) : 0,
  };
}
