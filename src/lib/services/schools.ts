import { and, count, eq, isNull, like, desc } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { slugify } from '@/lib/utils';
import { conflict, notFound } from '@/lib/errors';
import type { z } from 'zod';
import type { schoolCreateSchema } from '@/lib/validation/schemas';

/** SCHOOL-0001, SCHOOL-0002, … derived from the current tenant count. */
export async function nextSchoolCode() {
  const [{ value }] = await db.select({ value: count() }).from(t.schools);
  return `SCHOOL-${String(value + 1).padStart(4, '0')}`;
}

async function uniqueSlug(name: string) {
  const base = slugify(name) || 'school';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await db.query.schools.findFirst({ where: eq(t.schools.slug, candidate) });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Creates a tenant with its settings, trial subscription and first school admin.
 * Runs in one transaction so a half-provisioned school can never exist.
 */
export async function createSchool(input: z.infer<typeof schoolCreateSchema>) {
  const adminEmail = input.adminEmail.toLowerCase();
  const existingUser = await db.query.users.findFirst({ where: eq(t.users.email, adminEmail) });
  if (existingUser) throw conflict('That admin email is already in use.');

  const plan = await db.query.plans.findFirst({ where: eq(t.plans.code, input.planCode) });
  if (!plan) throw notFound('That plan no longer exists.');

  const code = await nextSchoolCode();
  const slug = await uniqueSlug(input.name);
  const passwordHash = await hashPassword(input.adminPassword);

  return db.transaction(async (tx) => {
    const [school] = await tx
      .insert(t.schools)
      .values({
        code,
        slug,
        name: input.name,
        registrationNumber: input.registrationNumber || null,
        addressLine: input.addressLine || null,
        city: input.city || null,
        state: input.state || null,
        country: input.country || 'India',
        postalCode: input.postalCode || null,
        phone: input.phone || null,
        email: input.email,
        website: input.website || null,
        principalName: input.principalName || null,
        schoolType: input.schoolType || null,
        board: input.board || null,
        medium: input.medium || null,
        timezone: input.timezone || 'Asia/Kolkata',
        status: 'ACTIVE',
      })
      .returning();

    await tx.insert(t.schoolSettings).values({ schoolId: school.id });
    await tx.insert(t.subscriptions).values({
      schoolId: school.id,
      planId: plan.id,
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 30 * 864e5),
    });

    const [admin] = await tx
      .insert(t.users)
      .values({ schoolId: school.id, name: input.adminName, email: adminEmail, passwordHash })
      .returning();
    await tx.insert(t.userRoles).values({ userId: admin.id, role: 'SCHOOL_ADMIN' });

    return { school, admin };
  });
}

export type SchoolListFilters = { q?: string; status?: string; page: number; pageSize: number };

export async function listSchools({ q, status, page, pageSize }: SchoolListFilters) {
  const filters = [isNull(t.schools.deletedAt)];
  if (q) filters.push(like(t.schools.name, `%${q}%`));
  if (status) filters.push(eq(t.schools.status, status as 'ACTIVE'));
  const where = and(...filters);

  const [{ value: total }] = await db.select({ value: count() }).from(t.schools).where(where);
  const rows = await db.query.schools.findMany({
    where,
    with: { subscription: { with: { plan: true } } },
    orderBy: desc(t.schools.createdAt),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  // Per-tenant counts, one grouped query each rather than N+1.
  const studentCounts = await db
    .select({ schoolId: t.students.schoolId, value: count() })
    .from(t.students)
    .where(isNull(t.students.deletedAt))
    .groupBy(t.students.schoolId);
  const teacherCounts = await db
    .select({ schoolId: t.teachers.schoolId, value: count() })
    .from(t.teachers)
    .where(isNull(t.teachers.deletedAt))
    .groupBy(t.teachers.schoolId);

  const studentMap = new Map(studentCounts.map((r) => [r.schoolId, r.value]));
  const teacherMap = new Map(teacherCounts.map((r) => [r.schoolId, r.value]));

  return {
    total,
    rows: rows.map((s) => ({
      ...s,
      studentCount: studentMap.get(s.id) ?? 0,
      teacherCount: teacherMap.get(s.id) ?? 0,
    })),
  };
}

export async function schoolUsage(schoolId: string) {
  const one = async (table: typeof t.students | typeof t.teachers | typeof t.parents | typeof t.staff) => {
    const [{ value }] = await db.select({ value: count() }).from(table).where(eq(table.schoolId, schoolId));
    return value;
  };
  const [students, teachers, parents, staffCount] = await Promise.all([
    one(t.students),
    one(t.teachers),
    one(t.parents),
    one(t.staff),
  ]);
  const [{ value: sections }] = await db
    .select({ value: count() })
    .from(t.sections)
    .where(eq(t.sections.schoolId, schoolId));
  return { students, teachers, parents, staff: staffCount, sections };
}
