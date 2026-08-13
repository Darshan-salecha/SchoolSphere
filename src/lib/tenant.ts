import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { forbidden, notFound } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Tenant isolation.
 *
 * Rule: no query against a tenant-owned table runs without a schoolId filter, and
 * any row fetched by an id that came from a request is re-checked with
 * `assertSameSchool` before it is used.
 */
export function assertSameSchool<T extends { schoolId: string | null }>(row: T | undefined | null, schoolId: string): T {
  if (!row) throw notFound();
  if (row.schoolId !== schoolId) throw notFound(); // never reveal that it exists elsewhere
  return row;
}

/** Platform admins may act inside a tenant only via an explicit, audited switch. */
export function resolveSchoolId(session: SessionUser, requested?: string | null) {
  if (session.isPlatform) {
    if (!requested) throw forbidden('Select a school first.');
    return requested;
  }
  if (!session.schoolId) throw forbidden('No school context.');
  if (requested && requested !== session.schoolId) throw forbidden();
  return session.schoolId;
}

export async function requireActiveSchool(schoolId: string) {
  const school = await db.query.schools.findFirst({
    where: and(eq(t.schools.id, schoolId), isNull(t.schools.deletedAt)),
    with: { subscription: { with: { plan: true } }, settings: true },
  });
  if (!school) throw notFound('School not found');
  if (school.status === 'SUSPENDED') throw forbidden('This school account is suspended. Please contact support.');
  if (school.status === 'CANCELLED') throw forbidden('This school account is closed.');
  return school;
}

export async function currentAcademicYear(schoolId: string) {
  return db.query.academicYears.findFirst({
    where: and(eq(t.academicYears.schoolId, schoolId), eq(t.academicYears.isCurrent, true)),
  });
}

export async function schoolSettingsFor(schoolId: string) {
  return db.query.schoolSettings.findFirst({ where: eq(t.schoolSettings.schoolId, schoolId) });
}
